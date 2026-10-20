import type { AgentConfig, GatewayProvider, InstitutionSettings, ModelInfo, PortalProvider } from './types'

/** Un endpoint local no necesita clave ni sale de la red de la institución. */
export function isLocalBaseUrl(url: string | undefined | null, providerId = ''): boolean {
  if (providerId === 'ollama') return true
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'localhost' || host === '::1' || host === '[::1]' || host.endsWith('.local')) return true
    const o = host.split('.').map(Number)
    if (o.length !== 4 || o.some(n => !Number.isInteger(n))) return false
    return o[0] === 127 || o[0] === 10 || (o[0] === 192 && o[1] === 168) || (o[0] === 172 && o[1] >= 16 && o[1] <= 31)
  } catch {
    return false
  }
}

export interface ProviderRow {
  id: string
  name: string
  baseUrl: string
  hasApiKey: boolean
  local: boolean
  enabled: boolean
  modelCount: number
  /** `llm`, `tts`… (los de voz no sirven para agentes de texto). */
  category: string
}

/** Une la vista del portal (clave guardada) con la del gateway (activo, modelos). */
export function mergeProviders(portal: PortalProvider[], gateway: GatewayProvider[]): ProviderRow[] {
  const byId = new Map(gateway.map(p => [p.id, p]))
  return portal.map(p => {
    const g = byId.get(p.id)
    const baseUrl = p.baseUrl || g?.base_url || ''
    return {
      id: p.id,
      name: p.name || g?.name || p.id,
      baseUrl,
      hasApiKey: p.hasApiKey,
      local: g?.isLocal ?? isLocalBaseUrl(baseUrl, p.id),
      enabled: Boolean(g?.enabled),
      modelCount: g?.modelCount ?? 0,
      category: g?.category ?? 'llm',
    }
  }).sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
}

/** Proveedores utilizables para elegir modelo: activos y (si no son locales) con clave. */
export function usableProviders(rows: ProviderRow[], options: { voice?: boolean } = {}): ProviderRow[] {
  return rows.filter(row => row.enabled && (row.local || row.hasApiKey) && (options.voice ? true : row.category !== 'tts'))
}

/** Modelos a mostrar: los activos primero; el valor actual siempre está presente aunque ya no figure. */
export function modelOptions(models: ModelInfo[], current: string | null | undefined): ModelInfo[] {
  const sorted = [...models].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || (a.name ?? a.id).localeCompare(b.name ?? b.id))
  if (current && !sorted.some(m => m.id === current)) sorted.unshift({ id: current, name: `${current} (actual)` })
  return sorted
}

export function agentChanged(a: AgentConfig, b: AgentConfig): boolean {
  return a.provider_id !== b.provider_id || a.model_id !== b.model_id || a.enabled !== b.enabled
}

/** El gateway valida con `strict()`: nada de `undefined` ni respaldo a medias. */
export function settingsPayload(settings: InstitutionSettings): InstitutionSettings {
  const { fallbackProviderId, fallbackModelId, ...rest } = settings
  const payload: InstitutionSettings = { ...rest }
  if (fallbackProviderId && fallbackModelId) {
    payload.fallbackProviderId = fallbackProviderId
    payload.fallbackModelId = fallbackModelId
  }
  return payload
}
