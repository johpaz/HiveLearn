export type Role = 'admin' | 'teacher' | 'student'

export interface Account {
  id: string
  institutionId: string
  username: string
  name: string
  role: Role
  age?: number
  group?: string
}

export interface InstallStatus {
  configured: boolean
  institution: string
  hasLogo: boolean
}

export interface InstitutionSettings {
  providerId: string
  modelId: string
  imageProviderId: string
  imageModelId: string
  audioProviderId: string
  audioModelId: string
  voice: string
  allowRemoteProviders: boolean
  allowRemoteForMinors: boolean
  oracleEnabled?: boolean
  allowSelfRegistration?: boolean
  fallbackProviderId?: string
  fallbackModelId?: string
}

/** Vista del portal: ¿hay clave guardada? (la clave nunca viaja de vuelta). */
export interface PortalProvider {
  id: string
  name: string
  hasApiKey: boolean
  baseUrl: string
}

/** Vista del gateway: estado y número de modelos. */
export interface GatewayProvider {
  id: string
  name?: string
  enabled?: number
  active?: number
  isLocal?: boolean
  requiresApiKey?: boolean
  modelCount?: number
  base_url?: string
}

export interface ModelInfo {
  id: string
  name?: string
  active?: number | boolean
  context_window?: number
}

export interface AgentConfig {
  id: string
  name?: string
  description?: string | null
  role?: string
  provider_id: string | null
  model_id: string | null
  max_iterations: number
  enabled: number
  system_prompt?: string | null
}
