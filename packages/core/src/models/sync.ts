/**
 * Sincronización automática del catálogo `models` con lo que cada proveedor sirve HOY.
 *
 * Reglas (todas con prueba):
 *  - El id de fila sigue `catalogModelKey`: los revendedores (OpenRouter, NVIDIA, Groq…) llevan su prefijo como
 *    "path" distintivo, así `openrouter/google/gemini-3.5-flash` no se confunde con `gemini-3.5-flash` de Google.
 *  - Un modelo nuevo entra INACTIVO: elegir cuál usar sigue siendo decisión del administrador.
 *  - Se actualizan el contexto y las capacidades. El nombre solo si la fila la creó la sincronización.
 *  - Un modelo que el proveedor ya no sirve se ELIMINA, salvo que lo use un agente o un ajuste de la institución:
 *    entonces se conserva marcado `status: "missing"` y se informa quién lo usa. Nunca se deja a un agente sin modelo.
 *  - Los modelos creados a mano (`source: "manual"`) no se tocan.
 *  - Un listado vacío o que encoge a menos de la mitad no autoriza borrar nada (probable fallo del proveedor).
 *  - Es independiente del usuario: corre sola en segundo plano (ver `scheduler.ts`). Listar modelos solo envía la API
 *    key al proveedor, nunca datos de alumnos, así que no la frena la política de proveedores remotos (que rige los
 *    datos). Quien quiera el comportamiento estricto puede pedir `respectPolicy`.
 */
import type { BatchOp, HiveDB } from '@johpaz/hive-db'
import { logger } from '../utils/logger'
import { catalogModelKey, isResellerProvider, wireModelId } from './model-id'
import { fetchRemoteModels, listTarget, SkipSync, type ModelType, type RemoteModel } from './remote'

const log = logger.child('model-sync')

export interface StoredModelDoc {
  provider_id: string
  name: string
  model_type: string
  context_window: number
  capabilities: string | null
  enabled: number
  active: number
  source?: 'seed' | 'sync' | 'manual'
  status?: 'ok' | 'missing'
  wire_id?: string
  synced_at?: string
}

export const MODEL_SYNC_RUNS = 'hl_model_sync_runs'
const KEEP_TYPES = new Set<ModelType>(['llm', 'stt', 'tts'])
/** Revendedores que además publican modelos propios con su nombre (`nvidia/nemotron-…`, `groq/compound`). */
const OWNER_NAMESPACE_PROVIDERS = new Set(['nvidia', 'groq'])
const MIN_SHRINK_RATIO = 0.5
const MIN_ROWS_FOR_SHRINK_CHECK = 6

export interface ProviderReport {
  providerId: string
  status: 'ok' | 'skipped' | 'error'
  reason?: string
  added: string[]
  updated: string[]
  removed: string[]
  /** Ausentes del proveedor pero en uso: se conservan. */
  protected: Array<{ id: string; usedBy: string[] }>
  migrated: string[]
  kept: number
  /** Motivo por el que no se permitió borrar (listado sospechoso). */
  deletionsBlocked?: string
}

export interface SyncReport {
  startedAt: string
  finishedAt: string
  dryRun: boolean
  providers: ProviderReport[]
}

export interface SyncOptions {
  providerId?: string
  dryRun?: boolean
  fetcher?: typeof fetch
  /** Para pruebas: resuelve clave y URL sin pasar por el llavero. */
  resolveConfig?: (providerId: string) => Promise<{ apiKey?: string; baseUrl?: string }>
  /** Con `true`, un proveedor remoto se omite si la institución desactivó los proveedores remotos. */
  respectPolicy?: boolean
  now?: () => Date
}

type Usage = Map<string, string[]>

export interface SyncPlan {
  add: Array<{ id: string; doc: StoredModelDoc }>
  update: Array<{ id: string; doc: StoredModelDoc; changes: string[]; version: number }>
  remove: Array<{ id: string }>
  protect: Array<{ id: string; usedBy: string[]; doc: StoredModelDoc; version: number }>
  kept: number
  deletionsBlocked?: string
}

const sameCaps = (a: string | null, b: string[] | undefined) =>
  b === undefined || (a !== null && JSON.stringify([...JSON.parse(a) as string[]].sort()) === JSON.stringify([...b].sort()))

/** Pura: compara lo guardado con lo remoto. No toca la base. */
export function planProviderSync(input: {
  providerId: string
  existing: Array<{ id: string; doc: StoredModelDoc; version: number }>
  remote: RemoteModel[]
  usage: Usage
  now: string
}): SyncPlan {
  const { providerId, existing, remote, usage, now } = input
  const plan: SyncPlan = { add: [], update: [], remove: [], protect: [], kept: 0 }
  const wanted = remote.filter(m => KEEP_TYPES.has(m.modelType))
  const remoteById = new Map(wanted.map(m => [catalogModelKey(providerId, m.wireId), m]))
  const existingById = new Map(existing.map(e => [e.id, e]))

  for (const [id, model] of remoteById) {
    const stored = existingById.get(id)
    if (!stored) {
      plan.add.push({
        id,
        doc: {
          provider_id: providerId, name: model.name, model_type: model.modelType,
          context_window: model.contextWindow && model.contextWindow > 0 ? model.contextWindow : 20000,
          capabilities: model.capabilities ? JSON.stringify(model.capabilities) : null,
          enabled: 1, active: 0, source: 'sync', status: 'ok', wire_id: model.wireId, synced_at: now,
        },
      })
      continue
    }
    if (stored.doc.source === 'manual') { plan.kept++; continue }
    const changes: string[] = []
    const doc: StoredModelDoc = { ...stored.doc }
    if (model.contextWindow && model.contextWindow > 0 && model.contextWindow !== doc.context_window) { doc.context_window = model.contextWindow; changes.push('context_window') }
    if (model.capabilities && !sameCaps(doc.capabilities, model.capabilities)) { doc.capabilities = JSON.stringify(model.capabilities); changes.push('capabilities') }
    if (doc.source === 'sync' && model.name !== doc.name) { doc.name = model.name; changes.push('name') }
    if (doc.status === 'missing') { doc.status = 'ok'; changes.push('status') }
    if (doc.wire_id !== model.wireId) { doc.wire_id = model.wireId; changes.push('wire_id') }
    if (doc.model_type !== model.modelType) { doc.model_type = model.modelType; changes.push('model_type') }
    if (changes.length) { doc.synced_at = now; plan.update.push({ id, doc, changes, version: stored.version }) } else plan.kept++
  }

  const absent = existing.filter(e => !remoteById.has(e.id) && e.doc.source !== 'manual' && KEEP_TYPES.has(e.doc.model_type as ModelType))
  const syncable = existing.filter(e => e.doc.source !== 'manual' && KEEP_TYPES.has(e.doc.model_type as ModelType))
  // Un listado que encoge de golpe casi siempre es un fallo del proveedor, no que hayan retirado la mitad.
  if (syncable.length >= MIN_ROWS_FOR_SHRINK_CHECK && wanted.length < syncable.length * MIN_SHRINK_RATIO) {
    plan.deletionsBlocked = `el proveedor devolvió ${wanted.length} modelos y hay ${syncable.length} guardados`
  }
  for (const stored of absent) {
    const usedBy = usage.get(stored.id) ?? []
    if (usedBy.length > 0) {
      plan.protect.push({ id: stored.id, usedBy, doc: { ...stored.doc, status: 'missing', synced_at: now }, version: stored.version })
    } else if (!plan.deletionsBlocked) {
      plan.remove.push({ id: stored.id })
    } else {
      plan.kept++
    }
  }
  return plan
}

/** Quién usa cada modelo: agentes (`hl_agents`) y ajustes de la institución. Clave: `<proveedor>\0<id de fila>`. */
export async function collectUsage(db: HiveDB, providerId: string, ids: string[]): Promise<Usage> {
  const usage: Usage = new Map()
  const canonical = new Map<string, string>()
  for (const id of ids) canonical.set(id, id).toString(), canonical.set(wireModelId(providerId, id), id)
  const add = (modelId: string | null | undefined, who: string) => {
    const id = modelId ? canonical.get(modelId) : undefined
    if (!id) return
    usage.set(id, [...(usage.get(id) ?? []), who])
  }
  for (const agent of await db.collection<{ provider_id: string | null; model_id: string | null; name?: string }>('hl_agents').scan()) {
    if (agent.doc.provider_id === providerId) add(agent.doc.model_id, `agente ${agent.doc.name ?? agent.id}`)
  }
  const pairs: Array<[string, string, string]> = [
    ['providerId', 'modelId', 'modelo de texto'], ['imageProviderId', 'imageModelId', 'modelo de imágenes'],
    ['audioProviderId', 'audioModelId', 'modelo de audio'], ['fallbackProviderId', 'fallbackModelId', 'modelo de respaldo'],
  ]
  for (const entry of await db.collection<Record<string, string | undefined>>('hl_portal_settings').scan()) {
    for (const [p, m, label] of pairs) if (entry.doc[p] === providerId) add(entry.doc[m], `ajustes: ${label}`)
  }
  return usage
}

/**
 * Los revendedores se guardaban con el nombre del propietario (`anthropic/claude-…` bajo OpenRouter). Se mueven a
 * su id con prefijo y se re-apuntan agentes y ajustes en un solo `batch`, para que nadie quede apuntando a la nada.
 */
export async function migrateResellerIds(db: HiveDB, providerId?: string): Promise<Array<{ from: string; to: string }>> {
  const models = db.collection<StoredModelDoc>('models')
  const moved: Array<{ from: string; to: string }> = []
  const rows = (await models.scan()).filter(e => isResellerProvider(e.doc.provider_id) && (!providerId || e.doc.provider_id === providerId))
  const ops: BatchOp[] = []
  const renames = new Map<string, string>() // `${provider}\0${old}` → nuevo
  for (const row of rows) {
    const provider = row.doc.provider_id
    // Con `wire_id` la fila ya la escribimos nosotros: su id es el correcto si coincide con la clave del cable.
    if (row.doc.wire_id !== undefined) {
      if (row.id === catalogModelKey(provider, row.doc.wire_id)) continue
    } else if (row.id.startsWith(`${provider}/`) && !OWNER_NAMESPACE_PROVIDERS.has(provider)) {
      // Fila heredada que ya trae el prefijo (OpenRouter, OpenCode Go, ModelScope no son dueños de modelos).
      continue
    }
    const wire = row.doc.wire_id ?? row.id
    const target = catalogModelKey(provider, wire)
    if (target === row.id) continue
    if (!(await models.get(target))) {
      ops.push({ op: 'put', collection: 'models', id: target, doc: { ...row.doc, wire_id: wire } as StoredModelDoc, expectedVersion: 0 })
    }
    ops.push({ op: 'delete', collection: 'models', id: row.id })
    renames.set(`${provider}\0${row.id}`, target)
    moved.push({ from: row.id, to: target })
  }
  if (!moved.length) return moved
  for (const agent of await db.collection<Record<string, unknown>>('hl_agents').scan()) {
    const next = renames.get(`${agent.doc.provider_id}\0${agent.doc.model_id}`)
    if (next) ops.push({ op: 'put', collection: 'hl_agents', id: agent.id, doc: { ...agent.doc, model_id: next, updated_at: new Date().toISOString() }, expectedVersion: agent.version })
  }
  const pairs: Array<[string, string]> = [['providerId', 'modelId'], ['imageProviderId', 'imageModelId'], ['audioProviderId', 'audioModelId'], ['fallbackProviderId', 'fallbackModelId']]
  for (const entry of await db.collection<Record<string, unknown>>('hl_portal_settings').scan()) {
    const doc = { ...entry.doc }
    let changed = false
    for (const [p, m] of pairs) {
      const next = renames.get(`${doc[p]}\0${doc[m]}`)
      if (next) { doc[m] = next; changed = true }
    }
    if (changed) ops.push({ op: 'put', collection: 'hl_portal_settings', id: entry.id, doc, expectedVersion: entry.version })
  }
  await db.batch(ops)
  log.info(`[model-sync] ${moved.length} ids de revendedores migrados a su path con prefijo`)
  return moved
}

let running: Promise<SyncReport> | null = null

export function isSyncRunning(): boolean { return running !== null }

/** Sincroniza uno o todos los proveedores. Una sola corrida a la vez. */
export function syncModels(db: HiveDB, options: SyncOptions = {}): Promise<SyncReport> {
  if (running) return running
  running = runSync(db, options).finally(() => { running = null })
  return running
}

async function runSync(db: HiveDB, options: SyncOptions): Promise<SyncReport> {
  const clock = options.now ?? (() => new Date())
  const startedAt = clock().toISOString()
  const fetcher = options.fetcher ?? fetch
  const dryRun = options.dryRun ?? false

  const { readInstitutionPolicy, isLocalProvider } = await import('../agent/policy/age-policy')
  const policy = options.respectPolicy ? await readInstitutionPolicy() : { installed: false }
  const remoteAllowed = !policy.installed || policy.settings?.allowRemoteProviders === true

  const resolveConfig = options.resolveConfig ?? (async (providerId: string) => {
    const { resolveProviderConfig } = await import('../agent/llm-client')
    const config = await resolveProviderConfig(providerId, 'model-sync')
    return { apiKey: config.apiKey, baseUrl: config.baseUrl }
  })

  const providerRows = (await db.collection<{ enabled?: number; category?: string; base_url?: string | null }>('providers').scan())
    .filter(e => !options.providerId || e.id === options.providerId)
    .filter(e => e.doc.enabled !== 0 && (e.doc.category ?? 'llm') === 'llm')
    .sort((a, b) => a.id.localeCompare(b.id))

  const reports: ProviderReport[] = []
  for (const row of providerRows) {
    const providerId = row.id
    const report: ProviderReport = { providerId, status: 'ok', added: [], updated: [], removed: [], protected: [], migrated: [], kept: 0 }
    try {
      const config = await resolveConfig(providerId)
      const local = isLocalProvider(providerId, config.baseUrl ?? row.doc.base_url ?? undefined)
      if (!local && !remoteAllowed) throw new SkipSync('política: proveedores remotos desactivados')
      const target = listTarget(providerId, config.baseUrl ?? row.doc.base_url ?? undefined, config.apiKey)
      const remote = await fetchRemoteModels(target, fetcher)
      if (remote.length === 0) throw new Error('el proveedor devolvió un listado vacío; no se cambió nada')

      if (!dryRun) report.migrated = (await migrateResellerIds(db, providerId)).map(m => `${m.from} → ${m.to}`)

      const models = db.collection<StoredModelDoc>('models')
      const existing = (await models.scan()).filter(e => e.doc.provider_id === providerId).map(e => ({ id: e.id, doc: e.doc, version: e.version }))
      const usage = await collectUsage(db, providerId, existing.map(e => e.id))
      const plan = planProviderSync({ providerId, existing, remote, usage, now: clock().toISOString() })

      report.added = plan.add.map(a => a.id)
      report.updated = plan.update.map(u => u.id)
      report.removed = plan.remove.map(r => r.id)
      report.protected = plan.protect.map(p => ({ id: p.id, usedBy: p.usedBy }))
      report.kept = plan.kept
      report.deletionsBlocked = plan.deletionsBlocked

      if (!dryRun) {
        const ops: BatchOp[] = [
          ...plan.add.map(a => ({ op: 'put' as const, collection: 'models', id: a.id, doc: a.doc, expectedVersion: 0 })),
          ...plan.update.map(u => ({ op: 'put' as const, collection: 'models', id: u.id, doc: u.doc, expectedVersion: u.version })),
          ...plan.protect.map(p => ({ op: 'put' as const, collection: 'models', id: p.id, doc: p.doc, expectedVersion: p.version })),
          ...plan.remove.map(r => ({ op: 'delete' as const, collection: 'models', id: r.id })),
        ]
        if (ops.length) await db.batch(ops)
      }
    } catch (error) {
      if (error instanceof SkipSync) { report.status = 'skipped'; report.reason = error.reason }
      else { report.status = 'error'; report.reason = error instanceof Error ? error.message : String(error) }
    }
    reports.push(report)
  }

  const result: SyncReport = { startedAt, finishedAt: clock().toISOString(), dryRun, providers: reports }
  if (!dryRun) await saveRun(db, result)
  const touched = reports.reduce((n, r) => n + r.added.length + r.updated.length + r.removed.length, 0)
  log.info(`[model-sync] ${reports.length} proveedores, ${touched} cambios${dryRun ? ' (simulación)' : ''}`)
  return result
}

async function saveRun(db: HiveDB, report: SyncReport): Promise<void> {
  const col = db.collection<SyncReport>(MODEL_SYNC_RUNS)
  await col.put(report.startedAt, report)
  const all = (await col.scan()).map(e => e.id).sort()
  for (const id of all.slice(0, Math.max(0, all.length - 20))) await col.delete(id)
}

export async function lastSyncReport(db: HiveDB): Promise<SyncReport | null> {
  const all = (await db.collection<SyncReport>(MODEL_SYNC_RUNS).scan()).sort((a, b) => b.id.localeCompare(a.id))
  return all[0]?.doc ?? null
}
