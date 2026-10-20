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
  category?: string
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

export type AgentModelsBody =
  | { applyToAll: { providerId: string; modelId: string; includeMedia?: boolean } }
  | { updates: Array<{ agentId: string; providerId: string; modelId: string; enabled?: boolean }> }

export interface ProgramNodeView {
  id: string
  title: string
  objective: string
  evidence: string
  question: { prompt: string; options: string[] }
}

export interface ProgramLevelView {
  index: number
  kind: 'learning' | 'reinforcement' | 'final'
  title: string
  goal: string
  status: 'outline' | 'active' | 'closed'
  plannedNodes: number
  nodes: ProgramNodeView[]
  checkpoint?: { decision: 'advance' | 'hold' | 'teacher_review'; masteredCount: number; total: number; reason: string }
}

export interface ProgramState {
  id: string
  status: 'planning' | 'active' | 'paused' | 'closing' | 'closed'
  objective: string
  intent: { topic: string; goal: string; minutes: number }
  currentLevel: number
  levels: ProgramLevelView[]
  progress: Record<string, { attempts: number; mastered: boolean; correct: boolean; openVerdict: string | null }>
  needsContent: boolean
  levelProgress: { mastered: number; total: number; attempted: number }
  validation: 'formative' | 'pending_review' | 'validated'
  finalScore: number | null
  closeReason: 'completed' | 'voluntary' | 'abandoned' | 'expired' | null
}

export interface ProgramIntentInput {
  topic: string
  goal: string
  minutes: number
  energy: 'baja' | 'media' | 'alta'
  priorKnowledge: 'ninguno' | 'algo' | 'bastante'
  style: 'visual' | 'lectura' | 'retos' | 'balanceado'
}

export interface NodeMaterialView {
  title: string
  objective: string
  evidence: string
  explanation: string
  generated: boolean
  question: { prompt: string; options: string[] }
}

export interface ReviewQueueItem {
  id: string
  student: string
  topic: string
  objective: string
  finalScore: number | null
  levels: number
  closedAt: string | null
}

export interface TeacherProgram {
  id: string
  objective: string
  intent: { topic: string; goal: string }
  levels: Array<{ index: number; kind: string; title: string; goal: string; status: string; nodes: Array<ProgramNodeView & { question: { prompt: string; options: string[]; correct: number } }>; checkpoint?: { decision: string; masteredCount: number; total: number; reason: string } }>
  progress: Record<string, { attempts: number; mastered: boolean; correct: boolean; firstTry: boolean; open?: { text: string; verdict: string | null; method: string }; teacher?: { decision: string; note: string } }>
  revisions: Array<{ at: string; actor: string; reason: string; ops: Array<{ op: string; detail: string }> }>
  validation: 'formative' | 'pending_review' | 'validated'
  finalScore?: number
}

export interface TraceEntry { seq: number; at: string; type: string; data: Record<string, unknown> }
