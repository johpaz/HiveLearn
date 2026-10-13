/**
 * Generación de currículos como trabajos persistentes.
 *
 * Investigar y diseñar un currículo toma minutos (HiveAgents 9B: 4–5 min; 35B: ~9 min), mucho más que un
 * request HTTP: el docente lo solicita, recibe un id y consulta el estado. Los trabajos corren de a uno
 * (el backend de modelos suele tener `parallel: 1`) y su resultado nace `generated`: no acredita dominio
 * hasta que un docente lo apruebe con la ruta existente.
 *
 * Un trabajo `running` que este proceso no está ejecutando (reinicio del servidor) se marca `failed`: repetirlo
 * solo, sin que nadie lo pida, gastaría el modelo sin supervisión.
 */
import type { HiveDB } from '@johpaz/hive-db'
import type { AgeBand } from './age'
import type { Account } from './accounts'
import type { RunContext } from '../agent/policy/age-policy'
import type { CurriculumDef } from './curriculum-def'
import { logger } from '../utils/logger'

const log = logger.child('curriculum-jobs')

export const CURRICULUM_JOBS_COLLECTION = 'hl_curriculum_jobs'
const MAX_ACTIVE_PER_INSTITUTION = 3
const MAX_ERROR_CHARS = 300

export type CurriculumJobStatus = 'queued' | 'running' | 'done' | 'failed'

export interface CurriculumJob {
  institutionId: string
  requestedBy: string
  topic: string
  audience: AgeBand
  language: string
  research: boolean
  status: CurriculumJobStatus
  /** Documento del currículo generado (`<id>@<hash12>`) cuando termina. */
  docId?: string
  curriculumId?: string
  dossierCached?: boolean
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export interface CurriculumGenerationInput {
  topic: string
  ageBand: AgeBand
  language: string
  research: boolean
  runContext: RunContext
}
export interface CurriculumGenerationResult { docId: string; def: CurriculumDef; dossierCached?: boolean }
export type CurriculumGenerator = (db: HiveDB, input: CurriculumGenerationInput) => Promise<CurriculumGenerationResult>

/** Generador real: investigador + arquitecto, o solo arquitecto si `research` es falso. */
export const runCurriculumGeneration: CurriculumGenerator = async (db, input) => {
  const architect = await import('../agent/curriculum-architect')
  const base = { topic: input.topic, ageBand: input.ageBand, language: input.language, runContext: input.runContext }
  if (input.research) return architect.generateResearchedCurriculum(db, base)
  return architect.generateCurriculum(db, base)
}

export interface CurriculumJobView extends CurriculumJob { id: string }

export class CurriculumJobs {
  private running = new Set<string>()
  private pumping: Promise<void> | null = null

  constructor(private readonly db: HiveDB, private readonly generator: CurriculumGenerator = runCurriculumGeneration) {}

  private col() { return this.db.collection<CurriculumJob>(CURRICULUM_JOBS_COLLECTION) }

  /** Marca como fallidos los trabajos `running` que este proceso no ejecuta (quedaron de un reinicio). */
  private async reconcile(): Promise<void> {
    for (const entry of await this.col().scan()) {
      if (entry.doc.status === 'running' && !this.running.has(entry.id)) {
        await this.col().put(entry.id, { ...entry.doc, status: 'failed', error: 'Interrumpido por un reinicio del servidor; vuelve a solicitarlo', finishedAt: new Date().toISOString() }, { expectedVersion: entry.version }).catch(() => {})
      }
    }
  }

  async request(actor: Account, input: { topic: string; audience: AgeBand; language?: string; research?: boolean }): Promise<CurriculumJobView> {
    await this.reconcile()
    const topic = input.topic.replace(/\s+/g, ' ').trim()
    const entries = (await this.col().scan()).filter(e => e.doc.institutionId === actor.institutionId && (e.doc.status === 'queued' || e.doc.status === 'running'))
    const same = entries.find(e => e.doc.topic.toLowerCase() === topic.toLowerCase() && e.doc.audience === input.audience)
    if (same) return { id: same.id, ...same.doc }
    if (entries.length >= MAX_ACTIVE_PER_INSTITUTION) throw new Error('Hay demasiadas generaciones en curso; espera a que terminen')

    const id = crypto.randomUUID()
    const job: CurriculumJob = {
      institutionId: actor.institutionId, requestedBy: actor.id, topic, audience: input.audience,
      language: input.language ?? 'es', research: input.research ?? true, status: 'queued', createdAt: new Date().toISOString(),
    }
    await this.col().put(id, job, { expectedVersion: 0 })
    void this.pump().catch(error => log.error(`pump falló: ${(error as Error).message}`))
    return { id, ...job }
  }

  async get(actor: Account, id: string): Promise<CurriculumJobView | null> {
    await this.reconcile()
    const entry = await this.col().get(id)
    if (!entry || entry.doc.institutionId !== actor.institutionId) return null
    return { id, ...entry.doc }
  }

  async list(actor: Account, limit = 20): Promise<CurriculumJobView[]> {
    await this.reconcile()
    return (await this.col().scan())
      .filter(e => e.doc.institutionId === actor.institutionId)
      .map(e => ({ id: e.id, ...e.doc }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  /** Toma los trabajos en cola de uno en uno. Reentrante: un solo bombeo a la vez. */
  pump(): Promise<void> {
    if (this.pumping) return this.pumping
    this.pumping = (async () => {
      try {
        for (;;) {
          const next = (await this.col().scan())
            .filter(e => e.doc.status === 'queued')
            .sort((a, b) => a.doc.createdAt.localeCompare(b.doc.createdAt))[0]
          if (!next) break
          await this.runOne(next.id)
        }
      } finally {
        this.pumping = null
      }
    })()
    return this.pumping
  }

  /** Resuelve cuando no queda ningún trabajo en ejecución ni en cola (apagado ordenado y pruebas). */
  async idle(): Promise<void> {
    while (this.pumping) await this.pumping.catch(() => {})
  }

  private async runOne(id: string): Promise<void> {
    const entry = await this.col().get(id)
    if (!entry || entry.doc.status !== 'queued') return
    const startedAt = new Date().toISOString()
    // Antes de escribir `running`: una consulta concurrente no debe tomarlo por un trabajo huérfano.
    this.running.add(id)
    try {
      await this.col().put(id, { ...entry.doc, status: 'running', startedAt }, { expectedVersion: entry.version })
    } catch {
      this.running.delete(id)
      return
    }

    let patch: Partial<CurriculumJob>
    try {
      const result = await this.generator(this.db, {
        topic: entry.doc.topic, ageBand: entry.doc.audience, language: entry.doc.language, research: entry.doc.research,
        // Quien solicita es personal adulto; el modelo no recibe datos de ningún alumno.
        runContext: { institutionId: entry.doc.institutionId, ageBand: 'adulto' },
      })
      patch = { status: 'done', docId: result.docId, curriculumId: result.def.id, dossierCached: result.dossierCached }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.warn(`generación fallida (${entry.doc.topic}): ${message}`)
      patch = { status: 'failed', error: message.slice(0, MAX_ERROR_CHARS) }
    }
    // `running` se libera DESPUÉS de escribir el estado final: antes, una consulta lo tomaría por huérfano.
    try {
      const latest = await this.col().get(id)
      if (latest) await this.col().put(id, { ...latest.doc, ...patch, finishedAt: new Date().toISOString() }, { expectedVersion: latest.version })
    } finally {
      this.running.delete(id)
    }
  }
}
