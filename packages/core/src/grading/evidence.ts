/**
 * Evidencia de aprendizaje y regla de acreditación HÍBRIDA por confianza.
 *
 *  - correcto + confianza ≥ umbral + currículo que acredita  → cuenta como evidencia.
 *  - correcto + currículo generado (sin revisar)             → autodeclarado, nunca acredita.
 *  - confianza baja                                          → revisión docente (o autodeclarado sin docente).
 *  - incorrecto confiable                                    → reintento; incorrecto dudoso → revisión.
 *  - dominio: evidencia que cuenta en ≥ 2 sesiones distintas.
 */
import type { HiveDB } from '@johpaz/hive-db'
import type { Grade } from './grade'

export const EVIDENCE_COLLECTION = 'hl_assessment_evidence'
export const CONFIDENCE_THRESHOLD = 0.8
export const MIN_DISTINCT_SESSIONS = 2
const MAX_ENTRIES = 30

export type CurriculumStatus = 'canonical' | 'generated' | 'reviewed'
export type EvidenceAction = 'counts' | 'self_reported' | 'teacher_review' | 'retry'

export interface DecisionContext { curriculumStatus: CurriculumStatus; hasTeacher: boolean }

export function decideEvidence(grade: Grade, ctx: DecisionContext): EvidenceAction {
  const accredits = ctx.curriculumStatus !== 'generated'
  const confident = grade.confidence >= CONFIDENCE_THRESHOLD
  if (grade.correct === true) {
    if (!accredits) return 'self_reported'
    if (confident) return 'counts'
    return ctx.hasTeacher ? 'teacher_review' : 'self_reported'
  }
  if (grade.correct === false && confident) return 'retry'
  return ctx.hasTeacher ? 'teacher_review' : 'self_reported'
}

export interface EvidenceEntry {
  sessionId: string
  at: string
  score: number
  confidence: number
  method: Grade['method']
  action: EvidenceAction
}

export interface EvidenceDoc {
  studentId: string
  curriculumId: string
  nodeId: string
  entries: EvidenceEntry[]
  updatedAt: string
}

/** Dominio candidato: evidencia que cuenta en al menos `MIN_DISTINCT_SESSIONS` sesiones distintas. */
export function masteryReady(doc: Pick<EvidenceDoc, 'entries'> | null): boolean {
  if (!doc) return false
  return new Set(doc.entries.filter(e => e.action === 'counts').map(e => e.sessionId)).size >= MIN_DISTINCT_SESSIONS
}

export function pendingReview(doc: Pick<EvidenceDoc, 'entries'> | null): boolean {
  return !!doc && doc.entries.some(e => e.action === 'teacher_review')
}

const queues = new Map<string, Promise<unknown>>()
const key = (studentId: string, curriculumId: string, nodeId: string) => `${studentId}:${curriculumId}:${nodeId}`

/** Registra un intento. Serializado por clave (HiveDB falla si las escrituras del proceso se solapan). */
export function recordEvidence(
  db: HiveDB,
  input: { studentId: string; curriculumId: string; nodeId: string; sessionId: string; grade: Grade; context: DecisionContext; at?: Date },
): Promise<{ doc: EvidenceDoc; action: EvidenceAction; masteryReady: boolean }> {
  const id = key(input.studentId, input.curriculumId, input.nodeId)
  const run = async () => {
    const col = db.collection<EvidenceDoc>(EVIDENCE_COLLECTION)
    const existing = await col.get(id)
    const action = decideEvidence(input.grade, input.context)
    const at = (input.at ?? new Date()).toISOString()
    const entry: EvidenceEntry = { sessionId: input.sessionId, at, score: input.grade.score, confidence: input.grade.confidence, method: input.grade.method, action }
    const doc: EvidenceDoc = {
      studentId: input.studentId, curriculumId: input.curriculumId, nodeId: input.nodeId,
      entries: [...(existing?.doc.entries ?? []), entry].slice(-MAX_ENTRIES),
      updatedAt: at,
    }
    await col.put(id, doc, { expectedVersion: existing?.version ?? 0 })
    return { doc, action, masteryReady: masteryReady(doc) }
  }
  const next = (queues.get(id) ?? Promise.resolve()).then(run, run)
  queues.set(id, next.catch(() => {}))
  return next
}

export async function getEvidence(db: HiveDB, studentId: string, curriculumId: string, nodeId: string): Promise<EvidenceDoc | null> {
  return (await db.collection<EvidenceDoc>(EVIDENCE_COLLECTION).get(key(studentId, curriculumId, nodeId)))?.doc ?? null
}
