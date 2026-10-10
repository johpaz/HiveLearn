/**
 * Progreso del alumno por currículo: la versión genérica de `Learning` (que sigue siendo la del currículo de IA).
 *
 * Clave `(studentId, curriculumId)`. El registro guarda el hash del contenido con el que se hizo el
 * diagnóstico: si el currículo cambia, el diagnóstico y los dominios anteriores NO se arrastran a otro
 * contenido. Dominio solo por revisión docente y solo en currículos que acreditan (`canAccredit`).
 */
import type { HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'
import type { Account } from './accounts'
import { canAccredit, routeFor, scoreDiagnosticFor, type CurriculumDef } from './curriculum-def'

export const PROGRESS_COLLECTION = 'hl_curriculum_progress'
const REVIEWS_COLLECTION = 'hl_curriculum_reviews'

export interface CurriculumProgress {
  studentId: string
  institutionId: string
  curriculumId: string
  /** Hash del contenido contra el que se calculó este registro. */
  hash: string
  level: string
  scores: Record<string, boolean>
  mastered: string[]
  diagnosticAt: string
}

const reviewSchema = z.object({ nodeId: z.string(), evidence: z.string().trim().min(20).max(2000) }).strict()
const key = (studentId: string, curriculumId: string) => `${studentId}:${curriculumId}`

export class CurriculumProgressStore {
  constructor(private readonly db: HiveDB) {}

  private col() { return this.db.collection<CurriculumProgress>(PROGRESS_COLLECTION) }

  /** El registro vigente; uno hecho contra otro contenido del mismo id no cuenta. */
  async record(studentId: string, def: Pick<CurriculumDef, 'id' | 'hash'>): Promise<CurriculumProgress | null> {
    const entry = await this.col().get(key(studentId, def.id))
    return entry && entry.doc.hash === def.hash ? entry.doc : null
  }

  async route(actor: Pick<Account, 'id' | 'age'>, def: CurriculumDef) {
    const record = await this.record(actor.id, def)
    const route = routeFor(def, actor.age ?? 18, record?.level ?? def.levels[0], record?.mastered ?? [])
    return { ...route, curriculumId: def.id, status: def.status, accredits: canAccredit(def), diagnosticCompleted: !!record, scores: record?.scores ?? {} }
  }

  async diagnostic(actor: Account, def: CurriculumDef, input: unknown) {
    if (actor.role !== 'student' || !actor.age) throw new Error('Solo alumnos con perfil completo')
    const score = scoreDiagnosticFor(def, input)
    const id = key(actor.id, def.id)
    const old = await this.col().get(id)
    const keepMastered = old && old.doc.hash === def.hash ? old.doc.mastered : []
    const record: CurriculumProgress = {
      studentId: actor.id, institutionId: actor.institutionId, curriculumId: def.id, hash: def.hash,
      level: score.level, scores: score.scores, mastered: keepMastered, diagnosticAt: new Date().toISOString(),
    }
    await this.col().put(id, record, { expectedVersion: old?.version ?? 0 })
    return this.route(actor, def)
  }

  /**
   * Dominio por evidencia sostenida (regla híbrida): lo llama el sistema cuando la evidencia confiable ya cubre
   * varias sesiones. Solo en currículos que acreditan, con diagnóstico hecho y prerrequisitos dominados.
   * Devuelve false si no procede (no es un error: simplemente aún no).
   */
  async masterByEvidence(studentId: string, def: CurriculumDef, nodeId: string): Promise<boolean> {
    if (!canAccredit(def)) return false
    const id = key(studentId, def.id)
    const entry = await this.col().get(id)
    if (!entry || entry.doc.hash !== def.hash || entry.doc.mastered.includes(nodeId)) return false
    const node = def.nodes.find(n => n.id === nodeId)
    if (!node || !node.prerequisites.every(p => entry.doc.mastered.includes(p))) return false
    const mastered = [...entry.doc.mastered, nodeId]
    const next = def.nodes.find(n => !mastered.includes(n.id))
    await this.db.batch([
      { op: 'put', collection: PROGRESS_COLLECTION, id, doc: { ...entry.doc, mastered, level: next?.level ?? def.levels[def.levels.length - 1] }, expectedVersion: entry.version },
      { op: 'put', collection: REVIEWS_COLLECTION, id: crypto.randomUUID(), doc: { studentId, reviewerId: 'system:evidence', institutionId: entry.doc.institutionId, curriculumId: def.id, hash: def.hash, nodeId, evidence: 'Evidencia confiable en sesiones distintas', createdAt: new Date().toISOString() }, expectedVersion: 0 },
    ])
    return true
  }

  async review(teacher: Account, student: Account, def: CurriculumDef, input: unknown) {
    if (teacher.institutionId !== student.institutionId || !(teacher.role === 'admin' || teacher.role === 'teacher' && student.teacherId === teacher.id)) {
      throw new Error('No autorizado')
    }
    if (!canAccredit(def)) throw new Error('Este currículo no está revisado: no acredita dominio')
    const data = reviewSchema.parse(input)
    const id = key(student.id, def.id)
    const entry = await this.col().get(id)
    if (!entry || entry.doc.hash !== def.hash) throw new Error('El alumno debe completar el diagnóstico')
    const node = def.nodes.find(n => n.id === data.nodeId)
    if (!node || !node.prerequisites.every(p => entry.doc.mastered.includes(p))) throw new Error('Faltan prerrequisitos validados')
    const mastered = [...new Set([...entry.doc.mastered, node.id])]
    const next = def.nodes.find(n => !mastered.includes(n.id))
    await this.db.batch([
      { op: 'put', collection: PROGRESS_COLLECTION, id, doc: { ...entry.doc, mastered, level: next?.level ?? def.levels[def.levels.length - 1] }, expectedVersion: entry.version },
      { op: 'put', collection: REVIEWS_COLLECTION, id: crypto.randomUUID(), doc: { studentId: student.id, reviewerId: teacher.id, institutionId: teacher.institutionId, curriculumId: def.id, hash: def.hash, ...data, createdAt: new Date().toISOString() }, expectedVersion: 0 },
    ])
    return this.route(student, def)
  }
}
