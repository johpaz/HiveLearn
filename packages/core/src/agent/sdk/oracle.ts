/**
 * Oráculo de decisiones del SDK: Kev (HiveAgents) y Jev (OpenRouter).
 *
 * Se activa solo cuando hay API key del proveedor correspondiente:
 *   1. key de `hiveagents`  → Kev  (`<base>/v1/systemone`)
 *   2. key de `openrouter`  → Jev
 *   3. ninguna              → desactivado: el SDK no hace ninguna llamada y sigue por la ruta clásica.
 *
 * Es una llamada a un servicio externo, así que además respeta la política de la institución y la edad:
 *   - `oracleEnabled === false` lo apaga explícitamente;
 *   - un destino remoto exige `allowRemoteProviders` y, para menores o edad desconocida, `allowRemoteForMinors`
 *     (ver `policy/age-policy.ts`); un endpoint local o de red privada siempre se admite.
 *
 * Minimización de datos: `share` va en falso (instrucciones, historial y resultados de tools no viajan).
 * El objetivo del turno viaja siempre — sin él el oráculo no puede decidir nada.
 */
import type { JevOption } from '@johpaz/hive-sdk/agent'
import { resolveProviderConfig } from '../llm-client'
import { decideRemoteAccess, isLocalEndpoint, readInstitutionPolicy, type RunContext } from '../policy/age-policy'
import { logger } from '../../utils/logger'

export { isLocalEndpoint }

const log = logger.child('hl-oracle')

export type OracleKind = 'kev' | 'jev'

export interface ResolvedOracleOption {
  option: JevOption
  kind: OracleKind | null
}

const OFF: ResolvedOracleOption = { option: false, kind: null }

/** Nada del turno viaja salvo el objetivo, que el oráculo necesita para decidir. */
const SHARE_NOTHING = { instructions: false, history: false, toolResults: false } as const
/** La salida de HiveLearn es estructurada: no hay respuesta de texto que verificar ni reescribir. */
const VERIFY_OFF = { answer: false, tools: false } as const

/** Base de HiveAgents sin el sufijo `/v1` ni barras finales. */
export function hiveAgentsBase(baseUrl: string | undefined): string {
  return (baseUrl || 'https://llm.hiveagents.io').replace(/\/+$/, '').replace(/\/v1$/, '')
}

export async function resolveOracleOption(ctx: RunContext): Promise<ResolvedOracleOption> {
  const policy = await readInstitutionPolicy()
  if (policy.installed && policy.settings!.oracleEnabled === false) return OFF

  const remote = decideRemoteAccess(ctx, policy)

  const hive = await resolveProviderConfig('hiveagents', 'kev')
  if (hive.apiKey) {
    const endpoint = `${hiveAgentsBase(hive.baseUrl)}/v1/systemone`
    if (!isLocalEndpoint(endpoint) && !remote.allowed) {
      log.info(`Kev omitido: ${remote.reason}`)
      return OFF
    }
    return {
      kind: 'kev',
      option: { provider: 'hiveagents', apiKey: hive.apiKey, endpoint, share: SHARE_NOTHING, verify: VERIFY_OFF },
    }
  }

  const router = await resolveProviderConfig('openrouter', 'jev')
  if (router.apiKey) {
    if (!remote.allowed) {
      log.info(`Jev omitido: ${remote.reason}`)
      return OFF
    }
    return {
      kind: 'jev',
      option: { provider: 'openrouter', apiKey: router.apiKey, share: SHARE_NOTHING, verify: VERIFY_OFF },
    }
  }

  return OFF
}
