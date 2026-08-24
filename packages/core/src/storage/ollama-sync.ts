/**
 * ollama-sync — Descubrimiento dinámico de modelos Ollama instalados.
 *
 * Igual que el proyecto principal de Hive: consulta `/api/tags` del daemon
 * local y registra cada modelo en la colección `models` de hiveDB con la
 * convención que `resolveProviderConfig` espera:
 *
 *   id   = `ollama-<tag-con-guiones>`  (gemma4:e4b → ollama-gemma4-e4b)
 *   name = tag real de Ollama          (gemma4:e4b)
 *
 * Así un agente con model_id `gemma4-e4b` resuelve automáticamente al tag
 * real `gemma4:e4b` sin tocar la BD a mano. Es best-effort: si Ollama está
 * apagado, no falla el arranque (solo registra el aviso).
 */
import { getDb, nowIso } from './hivedb'
import { logger } from '../utils/logger'

const log = logger.child('ollama-sync')

interface OllamaTag {
  name: string
  size?: number
  digest?: string
  details?: { family?: string; parameter_size?: string }
}

interface ModelDoc {
  provider_id: string
  name: string
  model_type: 'llm' | 'tts' | 'stt'
  context_window: number
  capabilities: string
  enabled?: number
  active?: number
  updated_at?: string
}

/** Sanitiza el tag de Ollama a id interno: gemma4:E2b → gemma4-E2b */
export function sanitizeOllamaId(tag: string): string {
  return `ollama-${tag.replace(/:/g, '-')}`
}

/**
 * Sincroniza los modelos instalados en Ollama con la colección `models`.
 * @returns número de modelos registrados/actualizados (0 si Ollama caído)
 */
export async function syncOllamaModels(): Promise<number> {
  let baseUrl = 'http://localhost:11434'
  try {
    const row = await getDb().collection<{ base_url?: string }>('providers').get('ollama')
    if (row?.doc?.base_url) baseUrl = row.doc.base_url
  } catch { /* default */ }
  if (process.env.OLLAMA_HOST) baseUrl = process.env.OLLAMA_HOST

  const host = baseUrl.replace(/\/+$/, '').replace(/\/(v1|api)$/, '')

  let res: Response
  try {
    res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(4000) })
  } catch {
    log.info(`[ollama-sync] Ollama no responde en ${host} — se omite la sincronización`)
    return 0
  }
  if (!res.ok) {
    log.warn(`[ollama-sync] Ollama respondió ${res.status} — se omite`)
    return 0
  }

  const data = await res.json() as { models?: OllamaTag[] }
  const tags = data.models ?? []
  if (tags.length === 0) return 0

  const col = getDb().collection<ModelDoc>('models')
  let upserted = 0
  for (const t of tags) {
    if (!t.name) continue
    // Solo LLMs conversacionales: excluye embedders típicos
    if (/^nomic-|^all-minilm|^mxbai|embed/i.test(t.name)) continue

    const id = sanitizeOllamaId(t.name)
    const existing = await col.get(id)
    await col.put(id, {
      provider_id: 'ollama',
      name: t.name,
      model_type: 'llm',
      context_window: existing?.doc?.context_window || 32768,
      capabilities: JSON.stringify(['chat', 'local', 'function_calling']),
      enabled: existing?.doc?.enabled ?? 1,
      active: existing?.doc?.active ?? 0,
      updated_at: nowIso(),
    })
    upserted++
  }

  log.info(`[ollama-sync] 🦙 ${upserted} modelos de Ollama sincronizados desde ${host}`)
  return upserted
}

/**
 * Asegura que los agentes hl_* apunten a un modelo EXISTENTE.
 * Si el model_id actual no resuelve a ningún modelo registrado del proveedor,
 * lo remapea al mejor candidato local disponible (preferencia gemma4 e4b/E2b).
 */
export async function ensureAgentModelsResolve(): Promise<number> {
  try {
    const models = await getDb().collection<ModelDoc>('models').scan()
    const ollamaModels = new Set(models.filter(m => m.doc.provider_id === 'ollama').map(m => m.id))

    const preference = [
      'ollama-gemma4-e4b',
      'ollama-gemma4-E2b',
      ...[...ollamaModels].filter(id => !id.includes('cloud') && !id.includes('embed')),
    ]
    const fallback = preference.find(id => ollamaModels.has(id))
    if (!fallback) return 0

    const agents = getDb().collection<{ provider_id?: string; model_id?: string }>('hl_agents')
    const rows = await agents.scan()
    let fixed = 0
    for (const row of rows) {
      const a = row.doc
      if (a.provider_id !== 'ollama' || !a.model_id) continue
      const direct = ollamaModels.has(`ollama-${a.model_id}`) || ollamaModels.has(a.model_id)
      if (direct) continue
      await agents.put(row.id, { ...a, model_id: fallback.replace(/^ollama-/, '') })
      fixed++
    }
    if (fixed > 0) log.info(`[ollama-sync] ${fixed} agentes remapeados al modelo disponible (${fallback})`)
    return fixed
  } catch (e) {
    log.warn(`[ollama-sync] ensureAgentModelsResolve: ${(e as Error).message}`)
    return 0
  }
}
