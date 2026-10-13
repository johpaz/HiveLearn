/**
 * Listado de modelos de cada proveedor, normalizado.
 *
 * Cada API cuenta lo suyo; aquí se reduce a `RemoteModel`. Solo se piden listados (GET) y solo con la clave del
 * proveedor: no sale ningún dato de alumnos. Todo tiene tiempo máximo y tope de tamaño.
 */
export type ModelType = 'llm' | 'stt' | 'tts' | 'embedding' | 'image'

export interface RemoteModel {
  /** Nombre en el cable (sin prefijo del revendedor). */
  wireId: string
  name: string
  modelType: ModelType
  contextWindow?: number
  capabilities?: string[]
}

export type ListKind = 'openai' | 'openrouter' | 'anthropic' | 'gemini' | 'ollama'

export interface ListTarget {
  kind: ListKind
  url: string
  headers: Record<string, string>
}

export class SkipSync extends Error {
  constructor(readonly reason: string) { super(reason) }
}

const TIMEOUT_MS = 15_000
const MAX_BYTES = 8 * 1024 * 1024

/** Proveedores sin API de listado: su catálogo es manual (HiveAgents monta un único modelo, los TTS son locales). */
const NO_LISTING = new Set(['hiveagents', 'local-tts', 'piper', 'elevenlabs'])
/** Base compatible con OpenAI cuando la guardada es la nativa (DashScope). */
const COMPAT_BASE: Record<string, string> = { qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' }

const trimSlash = (url: string) => url.replace(/\/+$/, '')

export function listTarget(providerId: string, baseUrl: string | undefined, apiKey: string | undefined): ListTarget {
  if (NO_LISTING.has(providerId)) throw new SkipSync('sin API de listado')
  if (providerId === 'openrouter') {
    // El listado de OpenRouter es público; con clave devuelve además los modelos habilitados para la cuenta.
    return { kind: 'openrouter', url: `${trimSlash(baseUrl || 'https://openrouter.ai/api/v1')}/models`, headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }
  }
  if (providerId === 'ollama') {
    return { kind: 'ollama', url: `${trimSlash(baseUrl || 'http://localhost:11434')}/api/tags`, headers: {} }
  }
  if (!apiKey) throw new SkipSync('sin clave')
  if (providerId === 'anthropic') {
    return { kind: 'anthropic', url: `${trimSlash(baseUrl || 'https://api.anthropic.com')}/v1/models?limit=1000`, headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } }
  }
  if (providerId === 'gemini' || providerId === 'google') {
    return { kind: 'gemini', url: `${trimSlash(baseUrl || 'https://generativelanguage.googleapis.com/v1beta')}/models?pageSize=1000`, headers: { 'x-goog-api-key': apiKey } }
  }
  const base = COMPAT_BASE[providerId] ?? baseUrl
  if (!base) throw new SkipSync('sin URL base')
  return { kind: 'openai', url: `${trimSlash(base)}/models`, headers: { Authorization: `Bearer ${apiKey}` } }
}

async function getJson(url: string, headers: Record<string, string>, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) throw new Error('respuesta demasiado grande')
  const text = await response.text()
  if (text.length > MAX_BYTES) throw new Error('respuesta demasiado grande')
  try { return JSON.parse(text) } catch { throw new Error('respuesta no es JSON') }
}

/** Modelos que no sirven para chat: se descartan del catálogo de agentes. */
const NON_CHAT = /(embed|embedding|moderation|rerank|dall-e|gpt-image|imagen|whisper|tts|transcribe|audio-preview|realtime|speech|stable-diffusion|sora|veo-|clip|guard)/i

export function classify(wireId: string): ModelType | null {
  if (/whisper|transcribe|speech-to-text|\bstt\b/i.test(wireId)) return 'stt'
  if (/\btts\b|text-to-speech|-tts|tts-/i.test(wireId)) return 'tts'
  if (/embed|rerank/i.test(wireId)) return 'embedding'
  if (/dall-e|gpt-image|imagen|stable-diffusion|flux/i.test(wireId)) return 'image'
  return NON_CHAT.test(wireId) ? null : 'llm'
}

interface OpenAIList { data?: Array<{ id?: string; context_length?: number; context_window?: number }> }
interface OpenRouterList {
  data?: Array<{ id?: string; name?: string; context_length?: number; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; supported_parameters?: string[] }>
}
interface AnthropicList { data?: Array<{ id?: string; display_name?: string }>; }
interface GeminiList {
  models?: Array<{ name?: string; displayName?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }>
  nextPageToken?: string
}
interface OllamaList { models?: Array<{ name?: string; model?: string }> }

const dedupe = (models: RemoteModel[]) => [...new Map(models.map(m => [m.wireId, m])).values()]

export async function fetchRemoteModels(target: ListTarget, fetcher: typeof fetch = fetch): Promise<RemoteModel[]> {
  const json = await getJson(target.url, target.headers, fetcher)
  switch (target.kind) {
    case 'openrouter': {
      const out: RemoteModel[] = []
      for (const m of (json as OpenRouterList).data ?? []) {
        if (!m.id) continue
        // Sin salida de texto (solo imagen o audio) no sirve como agente.
        if (!(m.architecture?.output_modalities ?? ['text']).includes('text')) continue
        const caps = ['chat', 'streaming']
        if (m.architecture?.input_modalities?.includes('image')) caps.push('vision')
        if (m.supported_parameters?.includes('tools')) caps.push('function_calling')
        if (m.supported_parameters?.includes('response_format') || m.supported_parameters?.includes('structured_outputs')) caps.push('json_mode')
        if (m.supported_parameters?.includes('reasoning')) caps.push('reasoning')
        out.push({ wireId: m.id, name: m.name ?? m.id, modelType: 'llm', contextWindow: m.context_length, capabilities: caps })
      }
      return dedupe(out)
    }
    case 'anthropic':
      return dedupe(((json as AnthropicList).data ?? []).filter(m => m.id).map(m => ({
        wireId: m.id!, name: m.display_name ?? m.id!, modelType: 'llm' as const, capabilities: ['chat', 'vision', 'function_calling', 'streaming'],
      })))
    case 'gemini':
      return dedupe(((json as GeminiList).models ?? []).flatMap(m => {
        const wireId = m.name?.replace(/^models\//, '')
        const methods = m.supportedGenerationMethods ?? []
        if (!wireId || !methods.includes('generateContent')) return []
        const type = classify(wireId)
        if (!type) return []
        return [{ wireId, name: m.displayName ?? wireId, modelType: type, contextWindow: m.inputTokenLimit, capabilities: type === 'llm' ? ['chat', 'vision', 'function_calling', 'streaming'] : undefined }]
      }))
    case 'ollama':
      return dedupe(((json as OllamaList).models ?? []).flatMap(m => {
        const wireId = m.name ?? m.model
        return wireId ? [{ wireId, name: wireId, modelType: (classify(wireId) ?? 'llm') as ModelType }] : []
      }))
    default:
      return dedupe(((json as OpenAIList).data ?? []).flatMap(m => {
        if (!m.id) return []
        const type = classify(m.id)
        return type ? [{ wireId: m.id, name: m.id, modelType: type, contextWindow: m.context_length ?? m.context_window }] : []
      }))
  }
}
