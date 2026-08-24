/**
 * GenerationRunStore — durabilidad del loop de generación de larga duración.
 *
 * Patrón tomado de Hive (`agent/run-store.ts`): la generación de un programa
 * educativo es un "run" persistente con:
 * - checkpoint del blueprint (Tier 0) para reanudar sin repetir la planificación
 * - lease con heartbeat: si el gateway muere, el lease expira y el run se
 *   marca como `interrupted` en el próximo boot (reconcile)
 * - outputs por nodo ya persistidos en hl_session_agent_outputs (executor)
 *
 * Colección: hl_generation_runs (doc id = sessionId)
 */
import { getDb, nowIso } from '../storage/hivedb'
import type { StudentProfile } from '../types'
import { logger } from '../utils/logger'

const log = logger.child('generation-run-store')

export type GenerationRunStatus = 'running' | 'completed' | 'failed' | 'interrupted'

export interface GenerationRunDoc {
  status: GenerationRunStatus
  perfil_json: string
  meta: string
  blueprint_json: string | null
  started_at: string
  updated_at: string
  lease_expires_at: string
  error: string | null
}

export interface GenerationRun extends GenerationRunDoc {
  sessionId: string
}

/** El lease se renueva con heartbeat; si expira, el proceso dueño murió */
const LEASE_MS = 60_000

function runs() {
  return getDb().collection<GenerationRunDoc>('hl_generation_runs')
}

export async function createGenerationRun(sessionId: string, perfil: StudentProfile, meta: string): Promise<void> {
  const now = nowIso()
  await runs().put(sessionId, {
    status: 'running',
    perfil_json: JSON.stringify(perfil),
    meta,
    blueprint_json: null,
    started_at: now,
    updated_at: now,
    lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(),
    error: null,
  })
}

/** Checkpoint del blueprint (Tier 0): permite reanudar sin repetir la planificación */
export async function saveRunBlueprint(sessionId: string, blueprintJson: string): Promise<void> {
  const entry = await runs().get(sessionId)
  if (!entry) return
  await runs().put(sessionId, { ...entry.doc, blueprint_json: blueprintJson, updated_at: nowIso() })
}

/** Heartbeat del lease — llamar periódicamente mientras el run está activo */
export async function heartbeatRun(sessionId: string): Promise<void> {
  const entry = await runs().get(sessionId)
  if (!entry || entry.doc.status !== 'running') return
  await runs().put(sessionId, {
    ...entry.doc,
    updated_at: nowIso(),
    lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(),
  })
}

export async function completeGenerationRun(sessionId: string): Promise<void> {
  const entry = await runs().get(sessionId)
  if (!entry) return
  await runs().put(sessionId, { ...entry.doc, status: 'completed', updated_at: nowIso() })
}

export async function failGenerationRun(sessionId: string, error: string): Promise<void> {
  const entry = await runs().get(sessionId)
  if (!entry) return
  await runs().put(sessionId, { ...entry.doc, status: 'failed', error, updated_at: nowIso() })
}

export async function getGenerationRun(sessionId: string): Promise<GenerationRun | null> {
  const entry = await runs().get(sessionId)
  return entry ? { sessionId, ...entry.doc } : null
}

export async function listGenerationRuns(status?: GenerationRunStatus): Promise<GenerationRun[]> {
  const entries = await runs().scan()
  return entries
    .map(e => ({ sessionId: e.id, ...e.doc }))
    .filter(r => !status || r.status === status)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
}

/**
 * Reconcile al boot (patrón Hive `reconcileOnBoot`): todo run `running` cuyo
 * lease expiró es huérfano (el proceso murió) → se marca `interrupted` para
 * que la UI pueda ofrecer reanudación. Retorna cuántos runs se marcaron.
 */
export async function reconcileGenerationRuns(): Promise<number> {
  const now = nowIso()
  let interrupted = 0
  for (const entry of await runs().scan()) {
    if (entry.doc.status === 'running' && entry.doc.lease_expires_at < now) {
      await runs().put(entry.id, { ...entry.doc, status: 'interrupted', updated_at: now })
      interrupted++
    }
  }
  if (interrupted > 0) {
    log.info(`[reconcile] ${interrupted} run(s) de generación huérfanos → interrupted`)
  }
  return interrupted
}
