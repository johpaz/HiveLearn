/**
 * Sincronización periódica del catálogo de modelos.
 *
 * `HIVELEARN_MODEL_SYNC_HOURS` (24 por defecto; 0 la desactiva). La primera corrida espera un minuto para no
 * competir con el arranque. El temporizador no mantiene vivo el proceso y un fallo nunca tumba el servidor.
 */
import type { HiveDB } from '@johpaz/hive-db'
import { logger } from '../utils/logger'
import { syncModels } from './sync'

const log = logger.child('model-sync')
const FIRST_DELAY_MS = 60_000

let interval: ReturnType<typeof setInterval> | null = null
let first: ReturnType<typeof setTimeout> | null = null

export function modelSyncHours(): number {
  const raw = Number(process.env.HIVELEARN_MODEL_SYNC_HOURS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 24
}

export function startModelSyncScheduler(db: HiveDB, options: { hours?: number; firstDelayMs?: number } = {}): boolean {
  const hours = options.hours ?? modelSyncHours()
  if (hours <= 0 || interval || first) return false
  const run = () => { syncModels(db).catch(error => log.warn(`[model-sync] corrida fallida: ${(error as Error).message}`)) }
  first = setTimeout(run, options.firstDelayMs ?? FIRST_DELAY_MS)
  first.unref?.()
  interval = setInterval(run, hours * 3_600_000)
  interval.unref?.()
  log.info(`[model-sync] programada cada ${hours} h`)
  return true
}

export function stopModelSyncScheduler(): void {
  if (first) clearTimeout(first)
  if (interval) clearInterval(interval)
  first = null
  interval = null
}
