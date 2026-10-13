/**
 * Gobernanza de datos del motor `sdk`.
 *
 * El SDK registra por su cuenta, en `sdk-db`, un resumen de la tarea y del resultado de cada corrida
 * (`traces.input_summary` / `output_summary`, hasta 500 caracteres) y un registro por llamada al modelo
 * (`usageRecords`). La tarea lleva respuestas del alumno, y el SDK no ofrece un interruptor para apagarlo.
 * Medido con corridas reales (ver `retention.test.ts`): `traces` es la única colección con texto de la tarea.
 *
 * Política: las trazas de una corrida se borran al terminar (tras vaciar las escrituras pendientes) y un
 * barrido por edad —al arrancar y cada hora— elimina lo que quedara de corridas interrumpidas. Se conservan
 * `usageRollups` (solo agregados) y el catálogo del SDK.
 */
import { logger } from '../../utils/logger'

const log = logger.child('hl-sdk-retention')

const SWEPT_COLLECTIONS = ['traces', 'usageRecords', 'reflections'] as const
const SWEEP_EVERY_MS = 60 * 60 * 1000

type Row = { id: string; doc: Record<string, unknown> }
type Store = { scan(opts?: object): Promise<Row[]>; delete(id: string): Promise<boolean> }

async function store(name: string): Promise<Store> {
  const storage = await import('@johpaz/hive-sdk/storage')
  return (storage.col as unknown as (n: string) => Promise<Store>)(name)
}

/** Horas que se conserva lo registrado por el SDK. Por defecto 24; valores inválidos usan el defecto. */
export function sdkRetentionHours(): number {
  const raw = Number(process.env.HIVELEARN_SDK_RETENTION_HOURS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 24
}

/** Borra las trazas de un agente efímero. Devuelve cuántas eliminó. Nunca lanza. */
export async function purgeRunTraces(sdkAgentId: string): Promise<number> {
  try {
    const agent = await import('@johpaz/hive-sdk/agent')
    await agent.flushTraces()
    const traces = await store('traces')
    let removed = 0
    for (const row of await traces.scan({})) {
      if (row.doc.agent_id === sdkAgentId && await traces.delete(row.id)) removed++
    }
    return removed
  } catch (error) {
    log.warn(`No se pudieron purgar las trazas de ${sdkAgentId}: ${(error as Error).message}`)
    return 0
  }
}

/** Elimina filas más antiguas que la retención en las colecciones del SDK que guardan texto o uso. */
export async function sweepSdkData(now = Date.now()): Promise<number> {
  const cutoff = now - sdkRetentionHours() * 3_600_000
  let removed = 0
  for (const name of SWEPT_COLLECTIONS) {
    try {
      const col = await store(name)
      for (const row of await col.scan({})) {
        const at = row.doc.created_at
        if (typeof at === 'number' && at < cutoff && await col.delete(row.id)) removed++
      }
    } catch (error) {
      log.warn(`Barrido de ${name} falló: ${(error as Error).message}`)
    }
  }
  if (removed) log.info(`Barrido de retención: ${removed} filas eliminadas`)
  return removed
}

let timer: ReturnType<typeof setInterval> | null = null

/** Barrido inmediato y periódico. Idempotente; el temporizador no mantiene vivo el proceso. */
export function startRetentionSweeper(): void {
  void sweepSdkData()
  if (timer) return
  timer = setInterval(() => { void sweepSdkData() }, SWEEP_EVERY_MS)
  timer.unref?.()
}

export function stopRetentionSweeper(): void {
  if (timer) clearInterval(timer)
  timer = null
}
