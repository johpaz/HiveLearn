/**
 * Programa formativo PERSONAL de una sesión.
 *
 * Qué es y qué no es:
 *  - Es un plan por NIVELES con un objetivo, creado a partir de lo que el alumno declara para ESA sesión más lo que el
 *    sistema ya sabe de él (nombre, edad, memoria). Los nodos no bloquean ni excluyen: solo el checkpoint del nivel decide
 *    si se avanza, se refuerza o se pide revisión docente.
 *  - No es un `CurriculumDef`: el hash de un currículo es su identidad y cada cambio descartaría progreso y materiales.
 *    Aquí el plan es un documento versionado (`revisions`) que los agentes crean y adaptan nivel a nivel.
 *  - Es FORMATIVO: lo que el alumno demuestra cuenta como autodeclarado hasta que un docente valida la evaluación.
 */
import { z } from 'zod'
import type { AgeBand } from '../age'

export const PROGRAM_LIMITS = {
  maxLevels: 6,
  maxNodesTotal: 20,
  minNodesPerLevel: 2,
  maxNodesPerLevel: 6,
  maxRevisions: 40,
  maxRevisionsPerLevel: 3,
} as const

export const PROGRAMS_COLLECTION = 'hl_personal_programs'
export const PROGRAM_LOCKS_COLLECTION = 'hl_program_locks'
/** Proyecciones de lectura (derivadas del documento del programa): consultas por nivel y por nodo con índices. */
export const PROGRAM_LEVELS_COLLECTION = 'hl_program_levels'
export const PROGRAM_NODES_COLLECTION = 'hl_program_nodes'

const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/, 'id inválido: usa minúsculas, números, guion o guion bajo (máx. 48)')
const text = (max: number) => z.string().trim().min(1).max(max)

export const nodeSchema = z.object({
  id: slug,
  title: text(120),
  objective: text(300),
  /** Qué debe poder mostrar el alumno para dar el nodo por logrado. */
  evidence: text(300),
  tags: z.array(slug).max(5).default([]),
  /** Comprobación determinista: la clave manda. */
  question: z.object({
    prompt: text(300),
    options: z.tuple([text(160), text(160), text(160)]),
    correct: z.number().int().min(0).max(2),
  }).strict().refine(q => new Set((q.options as string[]).map(o => o.toLowerCase())).size === 3, 'Las 3 opciones deben ser distintas'),
}).strict()
export type ProgramNode = z.infer<typeof nodeSchema>

export const intentSchema = z.object({
  topic: text(120),
  goal: text(200),
  /** Tiempo que el alumno tiene para estudiar en una sesión. */
  minutes: z.number().int().min(10).max(120),
  energy: z.enum(['baja', 'media', 'alta']),
  priorKnowledge: z.enum(['ninguno', 'algo', 'bastante']),
  style: z.enum(['visual', 'lectura', 'retos', 'balanceado']).default('balanceado'),
}).strict()
export type ProgramIntent = z.infer<typeof intentSchema> & { declaredAt: string }

export type LevelKind = 'learning' | 'reinforcement' | 'final'
export type LevelStatus = 'outline' | 'active' | 'closed'

export interface LevelCheckpoint {
  decision: 'advance' | 'hold' | 'teacher_review'
  masteredCount: number
  total: number
  reason: string
  at: string
}

export interface ProgramLevel {
  index: number
  kind: LevelKind
  title: string
  goal: string
  status: LevelStatus
  /** Cantidad estimada de nodos mientras el nivel es solo un esquema. */
  plannedNodes: number
  nodes: ProgramNode[]
  /** Se incrementa cada vez que un agente o el docente adapta el nivel. */
  revision: number
  checkpoint?: LevelCheckpoint
}

export interface NodeProgress {
  attempts: number
  /** Respuesta correcta a la comprobación (la clave manda). */
  correct: boolean
  firstTry: boolean
  lastChoice?: number
  lastAt?: string
  /** Práctica abierta: la juzga el oráculo si está disponible; si no, queda autodeclarada. */
  open?: { text: string; verdict: 'correct' | 'incorrect' | 'unsure' | null; confidence: number | null; method: 'oracle' | 'self_reported' }
  mastered: boolean
  masteredAt?: string
  /** Decisión del docente sobre este nodo (reafirmar, modificar o revocar). */
  teacher?: { decision: 'reaffirm' | 'modify' | 'revoke'; note: string; at: string; by: string }
}

export type ProgramStatus = 'planning' | 'active' | 'paused' | 'closing' | 'closed'
export type CloseReason = 'completed' | 'voluntary' | 'abandoned' | 'expired'
export type Validation = 'formative' | 'pending_review' | 'validated'

export interface ProgramRevision {
  at: string
  levelIndex: number
  actor: 'agent' | 'teacher' | 'system'
  reason: string
  ops: Array<{ op: string; detail: string }>
}

export interface PersonalProgram {
  id: string
  accountId: string
  institutionId: string
  status: ProgramStatus
  language: string
  intent: ProgramIntent
  profile: { name: string; age: number | null; ageBand: AgeBand }
  /** Resumen de lo que el programa busca lograr (lo redacta el Arquitecto). */
  objective: string
  dossierRef?: string
  sizing: { levels: number; nodesPerLevel: number[]; minutesPerNode: number }
  levels: ProgramLevel[]
  currentLevel: number
  progress: Record<string, NodeProgress>
  revisions: ProgramRevision[]
  validation: Validation
  finalScore?: number
  closeReason?: CloseReason
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  closedAt?: string
}

export const totalNodes = (levels: readonly ProgramLevel[]) => levels.reduce((n, l) => n + l.nodes.length, 0)
export const allNodeIds = (levels: readonly ProgramLevel[]) => new Set(levels.flatMap(l => l.nodes.map(n => n.id)))
export const levelNodeIds = (level: ProgramLevel) => level.nodes.map(n => n.id)
