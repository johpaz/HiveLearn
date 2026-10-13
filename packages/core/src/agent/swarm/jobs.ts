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
  /** El modelo no estaba disponible y la ronda se cortó: las siguientes no deben intentarse. */
  modelDown?: boolean
}

export interface JobExecutor {
  /** `signal` se aborta al agotarse el tiempo o al cancelarse la ronda: el trabajo debe dejar de consumir el modelo. */
  execute(job: Job, priorResults: Record<string, string>, threadId: string, signal?: AbortSignal): Promise<string>
}

export interface RoundOptions {
  executor: JobExecutor
  /** Trabajos simultáneos como máximo. */
  concurrency?: number
  /** Resultados de rondas anteriores que se entregan como contexto. */
  priorResults?: Record<string, string>
  /** Por intento; al vencer se aborta la señal del trabajo (ya no queda una segunda ejecución en paralelo). */
  timeoutMs?: number
  /** Cancela la ronda completa: los trabajos en curso se abortan y los pendientes no arrancan. */
  signal?: AbortSignal
  /** Espera entre reintentos: backoff exponencial con jitter, `initialMs` × 2^intento hasta `maxMs`. */
  backoff?: { initialMs?: number; maxMs?: number }
  sessionId: string
  coordinatorId: string
  runId?: string
}

const DEFAULT_TIMEOUT_MS = Number(process.env.HIVELEARN_JOB_TIMEOUT_MS ?? 240_000)

/** Código/mensaje que HiveAgents devuelve cuando no hay modelo montado (se descarga por inactividad). */
const MODEL_DOWN = /model[_ ]not[_ ]mounted|no model (is )?(loaded|mounted)/i

export type JobErrorKind = 'model_down' | 'fatal' | 'transient'

/**
 * Qué hacer con un fallo: `fatal` no se reintenta (política de edad, 4xx salvo 408/429, cancelación pedida);
 * `model_down` se reintenta una vez y, si persiste, corta el resto de la ronda; el resto es transitorio
 * (tiempo agotado, 429/5xx, red, y respuestas del modelo que no cumplen el contrato, que a veces salen bien en otro intento).
 */
export function classifyJobError(error: unknown): JobErrorKind {
  const e = error as { code?: string; status?: number; statusCode?: number; name?: string; message?: string }
  const text = `${e?.code ?? ''} ${e?.message ?? ''}`
  if (MODEL_DOWN.test(text)) return 'model_down'
  if (e?.code === 'provider_not_allowed') return 'fatal'
  const status = e?.status ?? e?.statusCode
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429) return 'fatal'
  return 'transient'
}

/** Espera abortable. Resuelve `false` si la señal se abortó antes de cumplirse el plazo. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve(false)
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(true) }, ms)
    const onAbort = () => { clearTimeout(timer); resolve(false) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Un intento con su propio `AbortController`: vence por tiempo, por cancelación de la ronda o al terminar. */
async function attemptWithAbort<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, label: string, parent: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const onParentAbort = () => controller.abort(parent.reason)
  if (parent.aborted) controller.abort(parent.reason)
  parent.addEventListener('abort', onParentAbort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label}: tiempo agotado (${Math.round(ms / 1000)} s)`)
      reject(error)
      controller.abort(error)
    }, ms)
  })
  try {
    return await Promise.race([run(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
    parent.removeEventListener('abort', onParentAbort)
    // Si el intento terminó por tiempo o por error, lo que siga en vuelo debe cortarse.
    if (!controller.signal.aborted) controller.abort(new Error('intento finalizado'))
  }
}

/** Ejecuta una ronda de trabajos independientes. Un trabajo que falla no detiene a los demás. */
export async function runRound(jobs: readonly Job[], options: RoundOptions): Promise<DelegationResult> {
  const runId = options.runId ?? crypto.randomUUID()
  const startedAt = Date.now()
  const concurrency = Math.max(1, options.concurrency ?? 2)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const backoffInitial = options.backoff?.initialMs ?? 2_000
  const backoffMax = options.backoff?.maxMs ?? 20_000
  // Cancela la ronda cuando el llamador lo pide o cuando el modelo no está disponible.
  const round = new AbortController()
  if (options.signal) {
    if (options.signal.aborted) round.abort(options.signal.reason)
    else options.signal.addEventListener('abort', () => round.abort(options.signal!.reason), { once: true })
  }
  let modelDown: string | null = null
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
    let attemptsMade = 0
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (modelDown) { lastError = modelDown; break }
      if (round.signal.aborted) { lastError = 'ronda cancelada'; break }
      attemptsMade = attempt
      try {
        const result = await attemptWithAbort(
          signal => options.executor.execute(job, options.priorResults ?? {}, `job-${runId}-${job.id}`, signal),
          timeoutMs, job.name, round.signal,
        )
        completed.push({ id: job.id, name: job.name, status: 'COMPLETED', durationMs: Date.now() - t0, result, retries: attempt })
        finished++
        const progress = Math.round((finished / jobs.length) * 100)
        hlSwarmEmitter.emit('worker:task_completed', { ...base, workerId: job.agentId, workerName: job.name, taskId: job.id, result, progress, label: `${job.name} completó su tarea`, timestamp: Date.now() })
        hlSwarmEmitter.emit('worker:result_received', { ...base, workerId: job.agentId, workerName: job.name, taskId: job.id, progress, label: `Coordinador recibió resultado de ${job.name}`, summary: result.slice(0, 180), timestamp: Date.now() })
        log.info(`[job] ${job.name} COMPLETED en ${Math.round((Date.now() - t0) / 1000)} s`)
        return
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        const kind = classifyJobError(error)
        if (round.signal.aborted && !modelDown) { lastError = lastError || 'ronda cancelada'; break }
        if (kind === 'fatal') break
        if (kind === 'model_down' && attempt >= 1) {
          // Segunda vez con el modelo caído: no tiene sentido seguir pidiéndole trabajo.
          modelDown = lastError
          log.error(`[job] modelo no disponible tras reintento; se corta la ronda (${job.name})`)
          round.abort(new Error('model_not_mounted'))
          break
        }
        if (attempt < maxRetries) {
          const wait = Math.round(Math.min(backoffMax, backoffInitial * 2 ** attempt) * (0.5 + Math.random() * 0.5))
          log.warn(`[job] ${job.name} falló (reintento ${attempt + 1}/${maxRetries} en ${wait} ms): ${lastError}`)
          if (!await sleep(wait, round.signal)) break
        }
      }
    }
    if (modelDown) lastError = modelDown
    const retries = attemptsMade
    failed.push({ id: job.id, name: job.name, status: 'FAILED', durationMs: Date.now() - t0, error: lastError, retries })
    finished++
    hlSwarmEmitter.emit('worker:task_failed', { ...base, workerId: job.agentId, workerName: job.name, taskId: job.id, error: lastError, progress: Math.round((finished / jobs.length) * 100), label: `${job.name} falló`, timestamp: Date.now() })
    log.error(`[job] ${job.name} FALLÓ: ${lastError}`)
  }

  // Cola con tope de concurrencia: cada "carril" toma el siguiente trabajo cuando termina el suyo.
  const lanes = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await runJob(job)
  })
  await Promise.all(lanes)
  round.abort(new Error('ronda finalizada'))

  const result: DelegationResult = { runId, totalDurationMs: Date.now() - startedAt, completed, failed, success: failed.length === 0, ...(modelDown ? { modelDown: true } : {}) }
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
    ...(rounds.some(r => r.modelDown) ? { modelDown: true } : {}),
  }
}

/**
 * Ronda de nodos y, con sus resultados, ronda final. Si el modelo cayó en la primera, la segunda no se intenta:
 * sus trabajos se reportan fallidos de inmediato en lugar de gastar otra tanda de reintentos.
 */
export async function runWorkPlan(plan: { nodeJobs: readonly Job[]; finalJobs: readonly Job[] }, options: RoundOptions): Promise<DelegationResult> {
  const nodeRound = await runRound(plan.nodeJobs, options)
  if (nodeRound.modelDown) {
    const skipped: JobSummary[] = plan.finalJobs.map(j => ({ id: j.id, name: j.name, status: 'FAILED', durationMs: 0, error: 'model_not_mounted: ronda omitida', retries: 0 }))
    return mergeRounds([nodeRound, { runId: nodeRound.runId, totalDurationMs: 0, completed: [], failed: skipped, success: false, modelDown: true }])
  }
  const finalRound = await runRound(plan.finalJobs, { ...options, priorResults: resultsOf(nodeRound) })
  return mergeRounds([nodeRound, finalRound])
}

export function resultsOf(round: DelegationResult): Record<string, string> {
  return Object.fromEntries(round.completed.filter(j => j.result).map(j => [j.id, j.result!]))
}
