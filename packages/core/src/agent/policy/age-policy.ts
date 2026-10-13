/**
 * Política por edad de las ejecuciones de agentes.
 *
 * Hasta ahora `allowRemoteForMinors` solo se aplicaba en los complementos del recorrido guiado
 * (`supplements.ts`). El enjambre, el onboarding, la entrega de lecciones y el oráculo Kev/Jev llamaban a
 * proveedores remotos sin mirar la edad del alumno. Este módulo concentra la regla para que todos los
 * caminos pasen por la misma comprobación.
 *
 * Reglas:
 *  - Un proveedor LOCAL (loopback, red privada, Ollama/llama local) siempre está permitido.
 *  - Con institución instalada, mandan sus ajustes: `allowRemoteProviders` y, para menores,
 *    `allowRemoteForMinors`.
 *  - Sin institución (instalación individual o de desarrollo) no hay administrador que decida: los adultos
 *    pueden usar proveedores remotos y los menores solo con `HIVELEARN_ALLOW_REMOTE_FOR_MINORS=true`.
 *  - Una edad desconocida cuenta como menor (ver `institutional/age.ts`).
 */
import { getDb } from '../../storage/hivedb'
import { ageBandFor, isMinorBand, type AgeBand } from '../../institutional/age'
import { readSettings } from '../../institutional/settings'
import type { InstitutionSettings } from '../../institutional/types'
import { AgentExecutionError } from '../errors'

/** Quién ejecuta y con qué restricciones. Viaja desde el punto de entrada hasta el proveedor. */
export interface RunContext {
  studentId?: string
  institutionId?: string
  ageBand: AgeBand
}

/** Contexto a partir de la edad en años. Edad desconocida → banda restrictiva. */
export function runContextForAge(age: number | null | undefined, studentId?: string): RunContext {
  return { studentId, ageBand: ageBandFor(age) }
}

/** Contexto a partir de un perfil de alumno (el del enjambre o el persistido). */
export function runContextFromProfile(profile: { alumnoId?: string; edad?: number | null } | null | undefined): RunContext {
  return runContextForAge(profile?.edad, profile?.alumnoId)
}

/** Loopback, enlace local o rangos privados (RFC 1918): el texto del turno no sale de la red de la institución. */
export function isLocalEndpoint(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return false
  }
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true
  const octets = host.split('.').map(Number)
  if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = octets
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
}

const LOCAL_BY_DEFAULT = new Set(['ollama'])

/** Un proveedor es local si es de los que corren en la máquina o si su URL apunta a la red local. */
export function isLocalProvider(provider: string, baseUrl?: string | null): boolean {
  if (baseUrl) return isLocalEndpoint(baseUrl)
  return LOCAL_BY_DEFAULT.has(provider)
}

export interface PolicyDecision {
  allowed: boolean
  reason?: string
}

interface InstitutionPolicy {
  installed: boolean
  institutionId?: string
  settings?: InstitutionSettings
}

/** Ajustes de la institución instalada, si hay una. */
export async function readInstitutionPolicy(): Promise<InstitutionPolicy> {
  const db = getDb()
  const installation = await db.collection<{ institutionId: string }>('hl_installation').get('main')
  if (!installation) return { installed: false }
  const institutionId = installation.doc.institutionId
  return { installed: true, institutionId, settings: await readSettings(db, institutionId) }
}

function minorsAllowedWithoutInstitution(): boolean {
  return process.env.HIVELEARN_ALLOW_REMOTE_FOR_MINORS === 'true'
}

/** Decide si un destino REMOTO está permitido para esta ejecución. Un destino local no pasa por aquí. */
export function decideRemoteAccess(ctx: RunContext, policy: InstitutionPolicy): PolicyDecision {
  const minor = isMinorBand(ctx.ageBand)
  if (!policy.installed) {
    if (minor && !minorsAllowedWithoutInstitution()) {
      return { allowed: false, reason: 'Un proveedor remoto no está permitido para menores o edad desconocida sin una política institucional' }
    }
    return { allowed: true }
  }
  const settings = policy.settings!
  if (!settings.allowRemoteProviders) return { allowed: false, reason: 'La política institucional no permite proveedores remotos' }
  if (minor && !settings.allowRemoteForMinors) return { allowed: false, reason: 'La política institucional no permite proveedores remotos para menores' }
  return { allowed: true }
}

/** Comprueba el proveedor de una ejecución. Lanza `provider_not_allowed` si no está permitido. */
export async function assertProviderAllowed(ctx: RunContext, target: { provider: string; baseUrl?: string | null }): Promise<void> {
  if (isLocalProvider(target.provider, target.baseUrl)) return
  const decision = decideRemoteAccess(ctx, await readInstitutionPolicy())
  if (!decision.allowed) throw new AgentExecutionError('provider_not_allowed', `${decision.reason} (proveedor: ${target.provider})`)
}
