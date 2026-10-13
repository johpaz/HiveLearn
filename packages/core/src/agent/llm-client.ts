/**
 * LLM Client — Entry point for all LLM calls.
 *
 * Routes calls through the rich provider adapters in llm-providers/.
 * Each adapter handles its own protocol, tool support, retry logic,
 * streaming, and provider-specific quirks.
 */
import { getDb } from '../storage/hivedb'
import type { ProviderDoc, ModelDoc } from '../storage/seed'
import type { AgentDoc } from './registry'
import { decryptApiKey } from '../crypto/decrypt'
import { readProviderSecret } from '../institutional/settings'
import { getProvider } from './llm-providers/factory'

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | ContentPart[]
  tool_calls?: LLMToolCall[]
  tool_call_id?: string
  name?: string
  reasoning_content?: string
}

export interface LLMToolCall {
  id: string
  type: 'function'
  thought_signature?: string
  function: {
    name: string
    arguments: string
  }
}

export interface LLMToolDef {
  type?: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface ContentPart {
  type: 'text' | 'image_url' | 'image_base64' | 'document'
  text?: string
  image_url?: { url: string }
  base64?: string
  mimeType?: string
  fileName?: string
}

export interface ProviderConfig {
  provider: string
  model: string
  apiKey?: string
  baseUrl?: string
  numCtx?: number
  numGpu?: number
}

/**
 * Resolver configuración del provider desde la BD.
 * Lee base_url, desencripta API key, y lee num_ctx/num_gpu.
 *
 * Soporta dos modos:
 *   resolveProviderConfig(agentId)              → busca agent en DB, resuelve provider
 *   resolveProviderConfig(providerId, modelId)  → usa provider/model directamente
 */
export async function resolveProviderConfig(
  agentOrProviderId: string,
  modelId?: string
): Promise<ProviderConfig> {
  const db = getDb()

  // Intentar buscar como agentId primero
  const agentEntry = await db.collection<AgentDoc>('hl_agents').get(agentOrProviderId)
  const agent = agentEntry?.doc

  let provider: string
  let model: string

  if (agent) {
    // Es un agentId
    provider = agent.provider_id || 'ollama'
    model = modelId || agent.model_id || 'gemma4-e4b'
  } else {
    // Es un providerId directo
    provider = agentOrProviderId
    model = modelId || 'gemma4-e4b'
  }

  // Leer configuración del provider desde la DB
  const row = (await db.collection<ProviderDoc>('providers').get(provider))?.doc

  let apiKey = await readProviderSecret(row as { portal_secret_name?: unknown } | undefined)
  if (!apiKey && row?.api_key_encrypted && row?.api_key_iv) {
    try {
      apiKey = decryptApiKey(row.api_key_encrypted, row.api_key_iv)
    } catch {
      // Key decryption failed — provider may not need a key (ollama)
    }
  }

  // For Ollama, the model ID stored in hl_agents may be a sanitized form like
  // "ollama-gemma4-e4b" or the legacy default "gemma4-e4b", while the actual
  // Ollama model name (with colon tag, e.g. "gemma4:e4b") lives in models.name.
  // Look it up so we pass the correct name to the Ollama API.
  if (provider === 'ollama') {
    const models = db.collection<ModelDoc>('models')
    const candidates = [(await models.get(model))?.doc, (await models.get(`ollama-${model}`))?.doc]
    const modelRow = candidates.find(doc => doc?.provider_id === 'ollama')

    if (modelRow?.name) {
      model = modelRow.name
    }
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl: row?.base_url ?? undefined,
    numCtx: row?.num_ctx ?? undefined,
    numGpu: row?.num_gpu ?? undefined,
  }
}

export interface LLMCallOptions {
  model: string
  messages: LLMMessage[]
  tools?: LLMToolDef[]
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  /** Model context window used to derive max_tokens when maxTokens is not set. */
  contextWindow?: number
  numCtx?: number
  numGpu?: number
  onToken?: (token: string) => void
  provider?: string
  signal?: AbortSignal
  /** Enable extended thinking for supported models. */
  thinking?: { enabled: boolean; budget_tokens?: number }
}

export interface LLMResponse {
  content: string
  tool_calls?: LLMToolCall[]
  stop_reason?: 'stop' | 'tool_calls' | 'length' | 'max_tokens' | 'error'
  /** Extended-thinking providers may return reasoning traces. */
  thinking_content?: string
  reasoning_content?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    input_tokens?: number
    output_tokens?: number
    thinking_tokens?: number
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * Proveedores con adaptador propio en `llm-providers/`: lo que el SDK no cubre o lo hace distinto.
 *  - `hiveagents`: `chat_template_kwargs.enable_thinking` en la raíz del cuerpo y Qwen 3.x apagado por omisión
 *    (medido contra el backend; el SDK lo manda en `extra_body`, que el servidor ignora, y deja Qwen razonando).
 *  - `ollama`: `think:false` con reintento, rescate de razonamiento sin respuesta, `num_predict`.
 * El resto (openai, anthropic, gemini, mistral, groq…) pasa por `callLLM` del SDK, con sus reintentos.
 */
const OWN_PROVIDERS = new Set(['ollama', 'hiveagents'])

/** Error de una llamada al SDK, con `status` para que `classifyJobError`/`isAvailabilityError` decidan. */
export class LLMCallError extends Error {
  status?: number
  modelUnavailable?: boolean
  constructor(message: string, status?: number, modelUnavailable?: boolean) {
    super(message)
    this.name = 'LLMCallError'
    this.status = status
    this.modelUnavailable = modelUnavailable
  }
}

async function callViaSdk(config: ProviderConfig, options: {
  messages: LLMMessage[]; tools?: LLMToolDef[]; temperature?: number; maxTokens?: number
  onToken?: (token: string) => void; signal?: AbortSignal; thinking?: { enabled: boolean; budget_tokens?: number }
}): Promise<LLMResponse> {
  // HIVE_HOME antes de importar el SDK: su logger y su configuración se resuelven contra él.
  const { ensureSdkEnv } = await import('./sdk/bootstrap')
  ensureSdkEnv()
  const sdk = await import('@johpaz/hive-sdk/agent')
  const response = await sdk.callLLM({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey ?? '',
    baseUrl: config.baseUrl,
    numCtx: config.numCtx,
    numGpu: config.numGpu,
    messages: options.messages,
    tools: options.tools?.map(t => ({ type: 'function', function: { name: t.function.name, description: t.function.description ?? '', parameters: t.function.parameters } })),
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    onToken: options.onToken,
    signal: options.signal,
    thinking: options.thinking,
  } as Parameters<typeof sdk.callLLM>[0])
  // El SDK no lanza: un fallo vuelve como `stop_reason: "error"`. Los llamadores esperan una excepción.
  if (response.stop_reason === 'error') {
    throw new LLMCallError(response.error?.message ?? response.content, response.error?.status, response.error?.modelUnavailable)
  }
  return response as LLMResponse
}

/**
 * Llamar a un modelo LLM: adaptador propio para los proveedores con ajustes medidos, SDK para el resto.
 * `thinking` (objeto) y `think` (booleano, histórico de Ollama) son la misma decisión: se aceptan ambos.
 */
export async function callLLM(
  options: {
    providerId: string
    modelId: string
    messages: LLMMessage[]
    temperature?: number
    maxTokens?: number
    tools?: LLMToolDef[]
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
    onToken?: (token: string) => void
    /** Cancela la petición en curso (evita generaciones zombis en la cola local) */
    signal?: AbortSignal
    /** Desactiva el modo thinking en modelos que lo soportan (gemma4/Qwen) */
    think?: boolean
    thinking?: { enabled: boolean; budget_tokens?: number }
  }
): Promise<LLMResponse> {
  const config = await resolveProviderConfig(options.providerId, options.modelId)
  const thinking = options.thinking ?? (options.think === undefined ? undefined : { enabled: options.think })

  if (!OWN_PROVIDERS.has(config.provider)) {
    return callViaSdk(config, { ...options, thinking })
  }

  const provider = getProvider(config.provider)
  return provider.call({
    model: config.model,
    messages: options.messages,
    tools: options.tools,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    numCtx: config.numCtx,
    numGpu: config.numGpu,
    onToken: options.onToken,
    signal: options.signal,
    think: options.think ?? thinking?.enabled,
    thinking,
  } as LLMCallOptions)
}
