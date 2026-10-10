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
export type EvidenceAction = 'counts' | 'self_reported' | 'teacher_review' | 'retry' | 'resolved'

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

/** Hay una revisión pendiente: la última petición de revisión es posterior a la última resolución. */
export function pendingReview(doc: Pick<EvidenceDoc, 'entries'> | null): boolean {
  if (!doc) return false
  const lastRequest = doc.entries.map(e => e.action).lastIndexOf('teacher_review')
  const lastResolved = doc.entries.map(e => e.action).lastIndexOf('resolved')
  return lastRequest > lastResolved
}

export interface PendingReview {
  studentId: string
  curriculumId: string
  nodeId: string
  requestedAt: string
  attempts: number
  lastScore: number
  lastConfidence: number
  method: Grade['method']
}

/** Evidencia que espera a un docente, de los alumnos indicados. Más antigua primero. */
export async function listPendingReviews(db: HiveDB, studentIds: ReadonlySet<string>): Promise<PendingReview[]> {
  const out: PendingReview[] = []
  for (const entry of await db.collection<EvidenceDoc>(EVIDENCE_COLLECTION).scan()) {
    const doc = entry.doc
    if (!studentIds.has(doc.studentId) || !pendingReview(doc)) continue
    const request = [...doc.entries].reverse().find(e => e.action === 'teacher_review')!
    out.push({
      studentId: doc.studentId, curriculumId: doc.curriculumId, nodeId: doc.nodeId,
      requestedAt: request.at, attempts: doc.entries.length, lastScore: request.score, lastConfidence: request.confidence, method: request.method,
    })
  }
  return out.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
}

/** El docente cerró la revisión (acepte o rechace). Serializado como el resto de escrituras. */
export function resolveReview(db: HiveDB, input: { studentId: string; curriculumId: string; nodeId: string; reviewerId: string; at?: Date }): Promise<void> {
  const id = key(input.studentId, input.curriculumId, input.nodeId)
  const run = async () => {
    const col = db.collection<EvidenceDoc>(EVIDENCE_COLLECTION)
    const existing = await col.get(id)
    if (!existing) throw new Error('No hay evidencia para revisar')
    const at = (input.at ?? new Date()).toISOString()
    const entry: EvidenceEntry = { sessionId: `review:${input.reviewerId}`, at, score: 0, confidence: 1, method: 'deterministic', action: 'resolved' }
    await col.put(id, { ...existing.doc, entries: [...existing.doc.entries, entry].slice(-MAX_ENTRIES), updatedAt: at }, { expectedVersion: existing.version })
  }
  const next = (queues.get(id) ?? Promise.resolve()).then(run, run)
  queues.set(id, next.catch(() => {}))
  return next
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
