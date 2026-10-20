/**
 * Sincronización periódica del catálogo de modelos.
 *
 * Corre sola, sin que nadie haga nada: al minuto de arrancar el servidor, después cada `HIVELEARN_MODEL_SYNC_HOURS`
 * (24 por defecto; 0 la desactiva) y, si algún proveedor falló (red, 5xx), reintenta a los 30 minutos hasta 3 veces.
 * Además se dispara al guardar la clave de un proveedor (ver portal). Los temporizadores no mantienen vivo el
 * proceso y un fallo nunca tumba el servidor.
 */
import type { HiveDB } from '@johpaz/hive-db'
import { logger } from '../utils/logger'
import { syncModels } from './sync'

const log = logger.child('model-sync')
const FIRST_DELAY_MS = 60_000

const RETRY_MS = 30 * 60_000
const MAX_RETRIES = 3

let interval: ReturnType<typeof setInterval> | null = null
let first: ReturnType<typeof setTimeout> | null = null
let retry: ReturnType<typeof setTimeout> | null = null

export function modelSyncHours(): number {
  const raw = Number(process.env.HIVELEARN_MODEL_SYNC_HOURS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 24
}

export function startModelSyncScheduler(db: HiveDB, options: { hours?: number; firstDelayMs?: number; retryMs?: number } = {}): boolean {
  const hours = options.hours ?? modelSyncHours()
  if (hours <= 0 || interval || first) return false
  const retryMs = options.retryMs ?? RETRY_MS
  const run = (attempt = 0) => {
    syncModels(db).then(report => {
      const failed = report.providers.filter(p => p.status === 'error').map(p => p.providerId)
      if (failed.length && attempt < MAX_RETRIES) {
        log.warn(`[model-sync] fallaron ${failed.join(', ')}; se reintenta en ${Math.round(retryMs / 60000)} min`)
        if (retry) clearTimeout(retry)
        retry = setTimeout(() => run(attempt + 1), retryMs)
        retry.unref?.()
      }
    }).catch(error => log.warn(`[model-sync] corrida fallida: ${(error as Error).message}`))
  }
  first = setTimeout(() => run(), options.firstDelayMs ?? FIRST_DELAY_MS)
  first.unref?.()
  interval = setInterval(() => run(), hours * 3_600_000)
  interval.unref?.()
  log.info(`[model-sync] programada cada ${hours} h`)
  return true
}

export function stopModelSyncScheduler(): void {
  if (first) clearTimeout(first)
  if (interval) clearInterval(interval)
  if (retry) clearTimeout(retry)
  first = null
  interval = null
  retry = null
}
