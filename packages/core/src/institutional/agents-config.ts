/**
 * Configuración de modelos de los agentes, en bloque.
 *
 * - `applyToAll`: un mismo proveedor y modelo para todos los agentes de texto (opcionalmente también imagen y audio).
 * - `updates`: guardar de una vez los cambios individuales de varios agentes.
 *
 * Ambas formas se validan completas ANTES de escribir y se aplican en un solo `batch`: o se guardan todas o ninguna.
 */
import type { BatchOp, HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'

const id = z.string().min(1).max(120)

export const agentModelsSchema = z.object({
  applyToAll: z.object({
    providerId: id,
    modelId: id,
    /** Por defecto solo los agentes de texto: los de imagen y audio usan otros modelos. */
    includeMedia: z.boolean().optional(),
  }).strict().optional(),
  updates: z.array(z.object({
    agentId: id,
    providerId: id,
    modelId: id,
    enabled: z.boolean().optional(),
  }).strict()).min(1).max(100).optional(),
}).strict().refine(v => (v.applyToAll === undefined) !== (v.updates === undefined), 'Indica "applyToAll" o "updates", no ambos')

export interface AppliedAgents { updated: string[]; skipped: string[] }

const isMediaAgent = (agentId: string) => /image|audio/i.test(agentId)

async function assertModel(db: HiveDB, providerId: string, modelId: string): Promise<void> {
  const provider = await db.collection<{ enabled?: number }>('providers').get(providerId)
  if (!provider) throw new Error(`Proveedor no registrado: ${providerId}`)
  if (provider.doc.enabled === 0) throw new Error(`El proveedor ${providerId} está desactivado`)
  const model = await db.collection<{ provider_id: string }>('models').get(modelId)
  if (!model || model.doc.provider_id !== providerId) throw new Error(`El modelo ${modelId} no pertenece a ${providerId}`)
}

export async function applyAgentModels(db: HiveDB, input: unknown): Promise<AppliedAgents> {
  const data = agentModelsSchema.parse(input)
  const agents = db.collection<Record<string, unknown>>('hl_agents')
  const now = new Date().toISOString()
  const ops: BatchOp[] = []
  const updated: string[] = []
  const skipped: string[] = []

  if (data.applyToAll) {
    const { providerId, modelId, includeMedia } = data.applyToAll
    await assertModel(db, providerId, modelId)
    for (const entry of await agents.scan()) {
      if (!includeMedia && isMediaAgent(entry.id)) { skipped.push(entry.id); continue }
      ops.push({ op: 'put', collection: 'hl_agents', id: entry.id, expectedVersion: entry.version,
        doc: { ...entry.doc, provider_id: providerId, model_id: modelId, updated_at: now } })
      updated.push(entry.id)
    }
  } else {
    const seen = new Set<string>()
    for (const update of data.updates ?? []) {
      if (seen.has(update.agentId)) throw new Error(`Agente repetido: ${update.agentId}`)
      seen.add(update.agentId)
      const entry = await agents.get(update.agentId)
      if (!entry) throw new Error(`Agente no encontrado: ${update.agentId}`)
      await assertModel(db, update.providerId, update.modelId)
      ops.push({ op: 'put', collection: 'hl_agents', id: update.agentId, expectedVersion: entry.version,
        doc: { ...entry.doc, provider_id: update.providerId, model_id: update.modelId, ...(update.enabled === undefined ? {} : { enabled: update.enabled ? 1 : 0 }), updated_at: now } })
      updated.push(update.agentId)
    }
  }
  if (ops.length) await db.batch(ops)
  return { updated, skipped }
}
