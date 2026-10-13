export type Role = 'admin' | 'teacher' | 'student'

export interface Account {
  id: string
  institutionId: string
  username: string
  name: string
  role: Role
  age?: number
  group?: string
  teacherId?: string
  createdAt?: string
  activatedAt?: string
  selfRegistered?: boolean
}

/** Código de activación de una cuenta nueva (se muestra una sola vez). */
export interface Invitation {
  username: string
  name: string
  activationCode: string
}

export interface StudentInput {
  nickname: string
  nombre: string
  tipo_documento: 'cc' | 'ti' | 'ce' | 'pasaporte' | 'otro'
  documento: string
  edad: number
  grupo: string
}

export interface ImportPreview {
  rows: Array<Omit<StudentInput, 'documento'>>
  errors: Array<{ row: number; message: string }>
}

export interface InstallStatus {
  configured: boolean
  institution: string
  hasLogo: boolean
  /** La institución permite que adultos creen su propia cuenta. */
  selfRegistration?: boolean
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
  /** `missing`: la sincronización ya no lo ve en el proveedor, pero algo lo usa. */
  status?: 'ok' | 'missing'
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

export interface ProviderSyncReport {
  providerId: string
  status: 'ok' | 'skipped' | 'error'
  reason?: string
  added: string[]
  updated: string[]
  removed: string[]
  protected: Array<{ id: string; usedBy: string[] }>
  migrated: string[]
  kept: number
  deletionsBlocked?: string
}

export interface SyncReport {
  startedAt: string
  finishedAt: string
  dryRun: boolean
  providers: ProviderSyncReport[]
}
