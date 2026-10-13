/**
 * Respaldo de modelo.
 *
 * Si el modelo principal no está disponible (HiveAgents lo descarga por inactividad, el servidor local se cayó,
 * el proveedor devuelve 5xx), la corrida se repite UNA vez con el modelo de respaldo de la institución
 * (`fallbackProviderId` / `fallbackModelId`). El respaldo pasa por la misma política por edad que el principal
 * (`assertProviderAllowed` en `runHiveLearnAgent`): un respaldo remoto no salta `allowRemoteForMinors`.
 *
 * Solo se cambia de modelo si NINGUNA tool llegó a ejecutarse en el intento fallido, para no repetir efectos.
 */
import { classifyJobError } from './swarm/jobs'
import { readInstitutionPolicy } from './policy/age-policy'

/** Tiempo que un modelo principal caído se salta, sin volver a pedirle trabajo. */
export const PRIMARY_DOWN_MS = 60_000

const downUntil = new Map<string, number>()

export const modelKey = (providerId: string, modelId: string) => `${providerId}/${modelId}`

export function markModelDown(providerId: string, modelId: string, now = Date.now()): void {
  downUntil.set(modelKey(providerId, modelId), now + PRIMARY_DOWN_MS)
}

export function isModelDown(providerId: string, modelId: string, now = Date.now()): boolean {
  const until = downUntil.get(modelKey(providerId, modelId))
  if (until === undefined) return false
  if (until <= now) { downUntil.delete(modelKey(providerId, modelId)); return false }
  return true
}

export function _resetFallbackStateForTests(): void { downUntil.clear() }

/** ¿El fallo es del modelo/servidor (y no de la tarea ni de la política)? */
export function isAvailabilityError(error: unknown): boolean {
  const e = error as { code?: string; status?: number; statusCode?: number; message?: string; name?: string }
  if (e?.code === 'provider_not_allowed' || e?.code === 'aborted') return false
  if (classifyJobError(error) === 'model_down') return true
  const status = e?.status ?? e?.statusCode
  if (typeof status === 'number') return status >= 500 && status < 600
  if (e?.name === 'AbortError') return false
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|connection error|\bHTTP 5\d\d\b|\b5\d\d\b (status|error)/i.test(String(e?.message ?? ''))
}

export interface FallbackTarget { providerId: string; modelId: string }

/** Respaldo configurado, distinto del principal; `null` si no hay. */
export async function fallbackFor(primary: FallbackTarget): Promise<FallbackTarget | null> {
  const { settings } = await readInstitutionPolicy()
  const providerId = settings?.fallbackProviderId
  const modelId = settings?.fallbackModelId
  if (!providerId || !modelId) return null
  if (modelKey(providerId, modelId) === modelKey(primary.providerId, primary.modelId)) return null
  return { providerId, modelId }
}
