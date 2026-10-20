/**
 * Validación docente del programa personal.
 *
 * El docente no escribe el plan: valida lo que los agentes hicieron. Puede
 *  - REAFIRMAR la evaluación (la evidencia pasa a contar como validada);
 *  - MODIFICAR el puntaje final con una nota;
 *  - REVOCAR el dominio de un nodo que no considera logrado;
 *  - AJUSTAR niveles que aún no se cursan, con las mismas guardas que los agentes.
 * Cada decisión queda en `hl_program_reviews` (solo anexar) y en el log de eventos del programa.
 */
import type { HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'
import type { Account } from '../accounts'
import { applyAdaptation, type AdaptationResult } from './guards'
import type { PersonalProgram } from './program-def'
import { ProgramStore, ProgramNotFoundError } from './program-store'
import type { ProgramAudit } from './audit'

export const PROGRAM_REVIEWS_COLLECTION = 'hl_program_reviews'

export const reviewInputSchema = z.object({
  decision: z.enum(['reaffirm', 'modify', 'revoke']),
  /** Obligatorio con `revoke`; opcional con `reaffirm` (confirma un nodo concreto). */
  nodeId: z.string().min(1).max(48).optional(),
  /** Obligatorio con `modify`: puntaje final corregido (0–100). */
  correctedScore: z.number().int().min(0).max(100).optional(),
  note: z.string().trim().min(10, 'Explica la decisión (mín. 10 caracteres)').max(1000),
}).strict()
export type ReviewInput = z.infer<typeof reviewInputSchema>

export interface ProgramReview {
  programId: string
  accountId: string
  teacherId: string
  decision: ReviewInput['decision']
  nodeId?: string
  correctedScore?: number
  previousScore?: number
  note: string
  at: string
}

export class ReviewError extends Error {
  constructor(readonly code: 'forbidden' | 'invalid' | 'not_reviewable', message: string) {
    super(message)
    this.name = 'ReviewError'
  }
}

export class ProgramReviews {
  constructor(
    private readonly db: HiveDB,
    private readonly store: ProgramStore,
    private readonly audit: ProgramAudit,
    private readonly studentOf: (accountId: string) => Promise<Account | null>,
  ) {}

  private col() { return this.db.collection<ProgramReview>(PROGRAM_REVIEWS_COLLECTION) }

  /** El docente solo ve a sus alumnos; el administrador, a los de su institución. */
  private async assertAccess(actor: Account, program: PersonalProgram): Promise<void> {
    if (actor.institutionId !== program.institutionId) throw new ReviewError('forbidden', 'Programa no accesible')
    if (actor.role === 'admin') return
    const student = await this.studentOf(program.accountId)
    if (actor.role !== 'teacher' || !student || student.teacherId !== actor.id) throw new ReviewError('forbidden', 'Programa no accesible')
  }

  /** Programas por validar de los alumnos que el actor puede revisar, más recientes primero. */
  async queue(actor: Account): Promise<PersonalProgram[]> {
    const all = await this.store.listByInstitution(actor.institutionId, p => p.validation === 'pending_review')
    if (actor.role === 'admin') return all
    const allowed: PersonalProgram[] = []
    for (const p of all) {
      const student = await this.studentOf(p.accountId)
      if (student?.teacherId === actor.id) allowed.push(p)
    }
    return allowed
  }

  async history(actor: Account, programId: string): Promise<ProgramReview[]> {
    const program = await this.store.get(programId)
    if (!program) throw new ProgramNotFoundError()
    await this.assertAccess(actor, program)
    return (await this.col().scan({ prefix: `${programId}:` })).map(e => e.doc).sort((a, b) => a.at.localeCompare(b.at))
  }

  async review(actor: Account, programId: string, rawInput: unknown): Promise<PersonalProgram> {
    if (actor.role === 'student') throw new ReviewError('forbidden', 'Solo un docente o administrador valida')
    const input = reviewInputSchema.parse(rawInput)
    const program = await this.store.get(programId)
    if (!program) throw new ProgramNotFoundError()
    await this.assertAccess(actor, program)
    if (program.status !== 'closed' || program.closeReason !== 'completed') {
      throw new ReviewError('not_reviewable', 'Solo se valida un programa completado')
    }
    if (input.decision === 'modify' && input.correctedScore === undefined) throw new ReviewError('invalid', 'Indica el puntaje corregido')
    if (input.decision === 'revoke') {
      if (!input.nodeId || !program.progress[input.nodeId]) throw new ReviewError('invalid', 'Indica un nodo con evidencia para revocar')
      if (!program.progress[input.nodeId].mastered) throw new ReviewError('invalid', 'Ese nodo no figura como logrado')
    }
    if (input.nodeId && !program.levels.some(l => l.nodes.some(n => n.id === input.nodeId))) throw new ReviewError('invalid', 'Nodo no encontrado')

    const now = new Date().toISOString()
    const updated = await this.store.update(programId, p => {
      if (input.nodeId && p.progress[input.nodeId]) {
        const prog = p.progress[input.nodeId]
        prog.teacher = { decision: input.decision, note: input.note, at: now, by: actor.id }
        if (input.decision === 'revoke') { prog.mastered = false; prog.masteredAt = undefined }
      }
      if (input.decision === 'modify') p.finalScore = input.correctedScore
      // Una revocación baja la nota proporcionalmente si no se corrigió a mano.
      if (input.decision === 'revoke' && p.finalScore !== undefined) {
        const ids = p.levels.flatMap(l => l.nodes.map(n => n.id))
        const mastered = ids.filter(id => p.progress[id]?.mastered).length
        p.finalScore = ids.length ? Math.round((mastered / ids.length) * 100) : p.finalScore
      }
      // Reafirmar o modificar valida el programa; revocar un nodo suelto lo deja validado con la nota recalculada.
      p.validation = 'validated'
      return p
    }, { touch: false })

    await this.col().put(`${programId}:${now}:${crypto.randomUUID().slice(0, 8)}`, {
      programId, accountId: program.accountId, teacherId: actor.id, decision: input.decision, nodeId: input.nodeId,
      correctedScore: input.correctedScore, previousScore: program.finalScore, note: input.note, at: now,
    }, { expectedVersion: 0 })
    await this.audit.record(programId, program.accountId, 'validation', {
      decision: input.decision, nodeId: input.nodeId, previousScore: program.finalScore, finalScore: updated.finalScore, by: actor.role,
    })
    return updated
  }

  /** El docente ajusta niveles que aún no se cursan (mismas guardas que los agentes, sin tope por nivel). */
  async adjustPlan(actor: Account, programId: string, ops: unknown[], reason: string): Promise<AdaptationResult & { saved: PersonalProgram }> {
    if (actor.role === 'student') throw new ReviewError('forbidden', 'Solo un docente o administrador ajusta el plan')
    const program = await this.store.get(programId)
    if (!program) throw new ProgramNotFoundError()
    await this.assertAccess(actor, program)
    if (program.status === 'closed') throw new ReviewError('not_reviewable', 'El programa ya está cerrado')
    const result = applyAdaptation(program, ops, { actor: 'teacher', reason: z.string().trim().min(5).max(300).parse(reason) })
    let saved = program
    if (result.applied.length > 0) {
      saved = await this.store.update(programId, p => ({ ...p, levels: result.program.levels, revisions: result.program.revisions }), { touch: false })
      await this.audit.record(programId, program.accountId, 'adaptation', { by: 'teacher', applied: result.applied.map(a => a.detail), rejected: result.rejected.map(r => `${r.op}: ${r.reason}`), reason })
    }
    return { ...result, saved }
  }
}
