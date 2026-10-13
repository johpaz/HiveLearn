/** Contratos institucionales de HiveLearn IA. */
export type InstitutionRole = 'student' | 'teacher' | 'admin'
export type ProgressionLevel = 'fundamentos' | 'usuario_responsable' | 'aplicador' | 'constructor' | 'creador_avanzado'
export type AgeBand = 'ninez' | 'adolescencia_temprana' | 'adolescencia' | 'adulto'
export interface InstitutionSettings {
  providerId: string; modelId: string; imageProviderId: string; imageModelId: string
  audioProviderId: string; audioModelId: string; voice: string
  allowRemoteProviders: boolean; allowRemoteForMinors: boolean
  /** Oráculo de decisiones (Kev/Jev). Activo cuando hay API key salvo que sea `false`. */
  oracleEnabled?: boolean
  /** Modelo de respaldo si el principal no está disponible. Pasa por la misma política por edad. */
  fallbackProviderId?: string; fallbackModelId?: string
  /** Permite que adultos (≥ 18) creen su propia cuenta de alumno sin invitación. Apagado por defecto. */
  allowSelfRegistration?: boolean
}

export interface Institution {
  id: string
  name: string
  country: string
  branding: { logoUrl?: string; primaryColor: string; accentColor: string }
  createdAt: string
}

export interface StudentIdentity {
  studentId: string
  institutionId: string
  accountId: string
  nickname: string
  displayName: string
  legalName: string
  documentType: 'cc' | 'ti' | 'ce' | 'pasaporte' | 'otro'
  documentFingerprint: string
  documentCiphertext: string
  documentIv: string
  ageBand: AgeBand
  role: 'student'
}

export interface GuardianConsent {
  id: string
  studentId: string
  institutionId: string
  grantedBy: string
  purpose: string
  heardStudent: boolean
  grantedAt: string
  revokedAt?: string
}

export interface CompetencyEvidence {
  competency: 'human_agency' | 'ai_ethics' | 'ai_foundations' | 'application_skills' | 'problem_scoping' | 'architecture' | 'iteration'
  score: number
  source: 'diagnostic' | 'lesson' | 'teacher'
  evidence: string
}

export interface AIDiagnostic {
  id: string
  studentId: string
  institutionId: string
  ageBand: AgeBand
  recommendedLevel: ProgressionLevel
  evidence: CompetencyEvidence[]
  completedAt: string
  curriculumVersion: string
}

export interface LearningPath {
  id: string
  studentId: string
  institutionId: string
  curriculumVersion: string
  level: ProgressionLevel
  competencyTargets: string[]
  nodeIds: string[]
  status: 'draft' | 'active' | 'completed'
  createdAt: string
}

export interface ProviderPolicy {
  institutionId: string
  defaults: Record<string, { providerId: string; modelId: string }>
  media: { image?: string; audio?: string; speechToText?: string }
  allowRemoteProviders: boolean
  maxMonthlyCost?: number
  updatedAt: string
}
