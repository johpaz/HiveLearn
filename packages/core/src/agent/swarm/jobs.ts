/**
 * Trabajos delegados por el coordinador a los especialistas.
 *
 * No hay grafo de dependencias: el coordinador reparte trabajos en RONDAS. Los de una ronda son independientes y
 * corren en paralelo hasta un tope de concurrencia; la ronda siguiente recibe los resultados de la anterior como
 * contexto. Qué especialista, con qué skills y con qué esfuerzo lo decide el coordinador con ayuda de Kev (ver
 * `agent/kev/delegation.ts`); aquí solo se ejecuta.
 */
import { hlSwarmEmitter } from '../../events/swarm-events'
import { logger } from '../../utils/logger'

const log = logger.child('delegation')

export interface Job {
  id: string
  agentId: string
  name: string
  taskDescription: string
  /** Mayor primero dentro de una ronda. */
  priority?: number
  maxRetries?: number
}

export interface JobSummary {
  id: string
  name: string
  status: 'COMPLETED' | 'FAILED'
  durationMs: number
  result?: string
  error?: string
  retries: number
}

export interface DelegationResult {
  runId: string
  totalDurationMs: number
  completed: JobSummary[]
  failed: JobSummary[]
  success: boolean
}

export interface JobExecutor {
  execute(job: Job, priorResults: Record<string, string>, threadId: string): Promise<string>
}

export interface RoundOptions {
  executor: JobExecutor
  /** Trabajos simultáneos como máximo. */
  concurrency?: number
  /** Resultados de rondas anteriores que se entregan como contexto. */
  priorResults?: Record<string, string>
  /** Por trabajo; el trabajo en curso NO se cancela, solo deja de esperarse. */
  timeoutMs?: number
  sessionId: string
  coordinatorId: string
  runId?: string
}

const DEFAULT_TIMEOUT_MS = Number(process.env.HIVELEARN_JOB_TIMEOUT_MS ?? 240_000)

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: tiempo agotado (${Math.round(ms / 1000)} s)`)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Ejecuta una ronda de trabajos independientes. Un trabajo que falla no detiene a los demás. */
export async function runRound(jobs: readonly Job[], options: RoundOptions): Promise<DelegationResult> {
  const runId = options.runId ?? crypto.randomUUID()
  const startedAt = Date.now()
  const concurrency = Math.max(1, options.concurrency ?? 2)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const base = { sessionId: options.sessionId, swarmId: runId }
  const queue = [...jobs].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  const completed: JobSummary[] = []
  const failed: JobSummary[] = []
  let finished = 0

  hlSwarmEmitter.emit('swarm:started', { ...base, coordinatorId: options.coordinatorId, totalTasks: jobs.length, timestamp: Date.now() })
  hlSwarmEmitter.emit('coordinator:phase_changed', {
    ...base, coordinatorId: options.coordinatorId, status: 'delegating', phase: 'dispatch',
    label: `Coordinador delegando ${jobs.length} trabajos`, progress: 0, timestamp: Date.now(),
  })

  const runJob = async (job: Job): Promise<void> => {
    const maxRetries = job.maxRetries ?? 1
    const t0 = Date.now()
    hlSwarmEmitter.emit('worker:task_dispatched', { ...base, workerId: job.agentId, workerName: job.name, taskId: job.id, label: `Coordinador envió ${job.name}`, timestamp: Date.now() })
    hlSwarmEmitter.emit('worker:task_started', { ...base, workerId: job.agentId, workerName: job.name, taskId: job.id, label: `${job.name} trabajando`, timestamp: Date.now() })

    let lastError = 'unknown error'
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await withTimeout(options.executor.execute(job, options.priorResults ?? {}, `job-${runId}-${job.id}`), timeoutMs, job.name)
        completed.push({ id: job.id, name: job.name, status: 'COMPLETED', durationMs: Date.now() - t0, result, retries: attempt })
        finished++
        const progress = Math.round((finished / jobs.length) * 100)
        hlSwarmEmitter.emit('worker:task_completed', { ...base, workerId: job.agentId, workerName: job.name, taskId: job.id, result, progress, label: `${job.name} completó su tarea`, timestamp: Date.now() })
        hlSwarmEmitter.emit('worker:result_received', { ...base, workerId: job.agentId, workerName: job.name, taskId: job.id, progress, label: `Coordinador recibió resultado de ${job.name}`, summary: result.slice(0, 180), timestamp: Date.now() })
        log.info(`[job] ${job.name} COMPLETED en ${Math.round((Date.now() - t0) / 1000)} s`)
        return
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (attempt < maxRetries) log.warn(`[job] ${job.name} falló (reintento ${attempt + 1}/${maxRetries}): ${lastError}`)
      }
    }
    failed.push({ id: job.id, name: job.name, status: 'FAILED', durationMs: Date.now() - t0, error: lastError, retries: maxRetries })
    finished++
    hlSwarmEmitter.emit('worker:task_failed', { ...base, workerId: job.agentId, workerName: job.name, taskId: job.id, error: lastError, progress: Math.round((finished / jobs.length) * 100), label: `${job.name} falló`, timestamp: Date.now() })
    log.error(`[job] ${job.name} FALLÓ: ${lastError}`)
  }

  // Cola con tope de concurrencia: cada "carril" toma el siguiente trabajo cuando termina el suyo.
  const lanes = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await runJob(job)
  })
  await Promise.all(lanes)

  const result: DelegationResult = { runId, totalDurationMs: Date.now() - startedAt, completed, failed, success: failed.length === 0 }
  hlSwarmEmitter.emit('swarm:completed', { ...base, coordinatorId: options.coordinatorId, success: result.success, completedCount: completed.length, failedCount: failed.length, totalDurationMs: result.totalDurationMs, timestamp: Date.now() })
  hlSwarmEmitter.emit('coordinator:phase_changed', {
    ...base, coordinatorId: options.coordinatorId, status: result.success ? 'assembling' : 'error', phase: 'swarm_complete',
    label: result.success ? `Coordinador integrando ${completed.length} resultados` : `Ronda finalizó con ${failed.length} fallo(s)`,
    progress: 100, timestamp: Date.now(),
  })
  return result
}

/** Une los resultados de varias rondas, en el orden en que se ejecutaron. */
export function mergeRounds(rounds: readonly DelegationResult[]): DelegationResult {
  return {
    runId: rounds[0]?.runId ?? crypto.randomUUID(),
    totalDurationMs: rounds.reduce((sum, r) => sum + r.totalDurationMs, 0),
    completed: rounds.flatMap(r => r.completed),
    failed: rounds.flatMap(r => r.failed),
    success: rounds.every(r => r.success),
  }
}

export function resultsOf(round: DelegationResult): Record<string, string> {
  return Object.fromEntries(round.completed.filter(j => j.result).map(j => [j.id, j.result!]))
}
