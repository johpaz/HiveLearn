/**
 * Motor del programa personal: abre la sesión, entrega un nivel a la vez, recoge las respuestas, decide en el
 * checkpoint y hace que los agentes creen o adapten el nivel siguiente.
 *
 * Qué decide el código y qué el modelo:
 *  - la CLAVE de respuesta manda (nunca el modelo); el oráculo solo opina sobre práctica abierta y sobre el nivel;
 *  - el modelo propone el contenido y los ajustes; las guardas (`applyAdaptation`) deciden qué se aplica;
 *  - ningún nivel queda sin salida: al cerrarlo se avanza, se inserta un refuerzo o se pide revisión docente.
 */
import type { HiveDB } from '@johpaz/hive-db'
import type { Account } from '../accounts'
import { ageBandFor } from '../age'
import { getMemory, recordAttempt, buildBrief, masteryLevel } from '../../storage/student-memory'
import {
  intentSchema, levelNodeIds, PROGRAM_LIMITS,
  type NodeProgress, type PersonalProgram, type ProgramIntent, type ProgramLevel, type ProgramNode,
} from './program-def'
import { applyAdaptation } from './guards'
import { allowedNodes, sizeProgram } from './sizing'
import { ProgramStore, ProgramNotFoundError } from './program-store'
import { ProgramAudit } from './audit'
import { ProgramGuides } from './guide'
import type { AdapterFn, PlannerFn } from '../../agent/program-architect'
import type { KevClient } from '../../agent/kev/client'
import { logger } from '../../utils/logger'

const log = logger.child('program-engine')
import type { RunContext } from '../../agent/policy/age-policy'

export class ProgramRuleError extends Error {
  constructor(readonly code: 'not_owner' | 'not_active' | 'wrong_level' | 'incomplete_level' | 'unknown_node' | 'invalid_choice' | 'no_content', message: string) {
    super(message)
    this.name = 'ProgramRuleError'
  }
}

export interface EngineDeps {
  planner: PlannerFn
  adapter: AdapterFn
  /** Oráculo opcional (juzga práctica abierta y opina sobre el nivel). */
  kev?: (ctx: RunContext) => Promise<KevClient | null>
  /** Aprendizajes agregados de programas anteriores del mismo tema y edad. */
  guide?: (topic: string, ageBand: string, language: string) => Promise<string | undefined>
  clock?: () => Date
}

/** Clave de memoria de un programa: por tema, no por programa, para que el alumno acumule historia. */
export const memoryKeyFor = (topic: string) => `prog-${topic.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'libre'}`

const MASTERY_ADVANCE = 0.67

export interface ProgramView {
  program: PersonalProgram
  /** El nivel activo necesita contenido (el adaptador no pudo materializarlo): pedirlo con `ensureLevelContent`. */
  needsContent: boolean
  levelProgress: { mastered: number; total: number; attempted: number }
}

export class ProgramEngine {
  readonly store: ProgramStore
  /** Bitácora inmutable (log de eventos de HiveDB) y guías agregadas (búsqueda híbrida de HiveDB). */
  readonly audit: ProgramAudit
  readonly guides: ProgramGuides
  private readonly clock: () => Date

  constructor(readonly db: HiveDB, private readonly deps: EngineDeps) {
    this.clock = deps.clock ?? (() => new Date())
    this.store = new ProgramStore(db, this.clock)
    this.audit = new ProgramAudit(db)
    this.guides = new ProgramGuides(db)
  }

  private guideFor(topic: string, band: string, language: string): Promise<string | undefined> {
    return (this.deps.guide ? this.deps.guide(topic, band, language) : this.guides.brief(topic, band, language)).catch(() => undefined)
  }

  private runContext(account: Account): RunContext {
    return { studentId: account.id, institutionId: account.institutionId, ageBand: ageBandFor(account.age) }
  }

  private async owned(account: Account, programId: string): Promise<PersonalProgram> {
    const program = await this.store.get(programId)
    if (!program) throw new ProgramNotFoundError()
    if (program.accountId !== account.id) throw new ProgramRuleError('not_owner', 'Este programa no es tuyo')
    return program
  }

  view(program: PersonalProgram): ProgramView {
    const level = program.levels[program.currentLevel]
    const ids = level ? levelNodeIds(level) : []
    return {
      program,
      needsContent: !!level && level.nodes.length === 0,
      levelProgress: {
        total: ids.length,
        mastered: ids.filter(id => program.progress[id]?.mastered).length,
        attempted: ids.filter(id => (program.progress[id]?.attempts ?? 0) > 0).length,
      },
    }
  }

  async active(account: Account): Promise<ProgramView | null> {
    const program = await this.store.getActive(account.id)
    return program ? this.view(program) : null
  }

  // ── Apertura ────────────────────────────────────────────────────────────
  async open(account: Account, rawIntent: unknown): Promise<ProgramView> {
    const parsed = intentSchema.parse(rawIntent)
    // Falla rápido, antes de gastar el modelo.
    const existing = await this.store.getActive(account.id)
    if (existing) {
      const { ProgramActiveError } = await import('./program-store')
      throw new ProgramActiveError(existing.id)
    }

    const now = this.clock().toISOString()
    const ctx = this.runContext(account)
    const profile = { name: account.name, age: account.age ?? null, ageBand: ctx.ageBand }
    const intent: ProgramIntent = { ...parsed, declaredAt: now }

    const memory = await getMemory(this.db, account.id, memoryKeyFor(intent.topic))
    const alreadyMastered = memory ? Object.values(memory.nodes).filter(n => masteryLevel(n) === 'consolidado').length : 0
    const sizing = sizeProgram({ intent, ageBand: profile.ageBand, alreadyMastered })
    const guide = await this.guideFor(intent.topic, profile.ageBand, 'es')

    const plan = await this.deps.planner({
      intent, profile, sizing, runContext: ctx,
      memoryBrief: memory ? buildBrief(memory, { maxChars: 700 }) : undefined,
      guide,
    })

    const levels: ProgramLevel[] = plan.levels.map((l, i) => ({
      index: i,
      kind: i === plan.levels.length - 1 ? 'final' : 'learning',
      title: l.title, goal: l.goal,
      status: i === 0 ? 'active' : 'outline',
      plannedNodes: i === 0 ? plan.firstLevelNodes.length : l.plannedNodes,
      nodes: i === 0 ? plan.firstLevelNodes : [],
      revision: 0,
    }))
    const program: PersonalProgram = {
      id: `prg_${crypto.randomUUID()}`,
      accountId: account.id, institutionId: account.institutionId, status: 'active', language: 'es',
      intent, profile, objective: plan.objective, sizing, levels, currentLevel: 0, progress: {},
      revisions: [{ at: now, levelIndex: 0, actor: 'system', reason: 'Plan inicial a partir de lo declarado por el alumno', ops: [{ op: 'plan', detail: `${levels.length} niveles, nivel 1 con ${plan.firstLevelNodes.length} nodos` }] }],
      validation: 'formative', createdAt: now, updatedAt: now, lastActivityAt: now,
    }
    await this.store.create(program)
    await this.audit.record(program.id, account.id, 'intent', {
      topic: intent.topic, minutes: intent.minutes, energy: intent.energy, priorKnowledge: intent.priorKnowledge,
      levels: levels.length, firstLevelNodes: plan.firstLevelNodes.length, usedGuide: !!guide,
    })
    return this.view(program)
  }

  // ── Respuestas ──────────────────────────────────────────────────────────
  async answer(account: Account, programId: string, input: { nodeId: string; choice: number; open?: string }): Promise<{ correct: boolean; mastered: boolean; hint: string | null; view: ProgramView }> {
    const program = await this.owned(account, programId)
    if (program.status !== 'active') throw new ProgramRuleError('not_active', 'El programa no está activo')
    const level = program.levels[program.currentLevel]
    const node = level?.nodes.find(n => n.id === input.nodeId)
    if (!node) {
      const exists = program.levels.some(l => l.nodes.some(n => n.id === input.nodeId))
      throw new ProgramRuleError(exists ? 'wrong_level' : 'unknown_node', exists ? 'Ese nodo no pertenece al nivel actual' : 'Nodo no encontrado')
    }
    if (![0, 1, 2].includes(input.choice)) throw new ProgramRuleError('invalid_choice', 'Elige una de las 3 opciones')

    const correct = input.choice === node.question.correct
    const now = this.clock().toISOString()

    // Práctica abierta: la juzga el oráculo si existe; si no, queda autodeclarada. Nunca decide el dominio.
    let open: NodeProgress['open'] | undefined
    const text = (input.open ?? '').trim().slice(0, 600)
    if (text) {
      open = { text, verdict: null, confidence: null, method: 'self_reported' }
      const kev = await this.deps.kev?.(this.runContext(account)).catch(() => null)
      if (kev) {
        const { judgeAnswer } = await import('../../agent/kev/judge')
        const judged = await judgeAnswer(kev, { objective: `${node.title}: ${node.objective}`, prompt: node.evidence, answer: text }).catch(() => null)
        if (judged) open = { text, verdict: judged.verdict, confidence: judged.grade.confidence ?? null, method: 'oracle' }
      }
    }

    const updated = await this.store.update(programId, p => {
      const previous = p.progress[node.id]
      const attempts = (previous?.attempts ?? 0) + 1
      p.progress[node.id] = {
        attempts,
        correct: previous?.correct || correct,
        firstTry: previous ? previous.firstTry : correct,
        lastChoice: input.choice,
        lastAt: now,
        open: open ?? previous?.open,
        // Formativo: la comprobación determinista basta para dar el nodo por logrado; lo valida el docente después.
        mastered: previous?.mastered || correct,
        masteredAt: previous?.masteredAt ?? (correct ? now : undefined),
        teacher: previous?.teacher,
      }
      return p
    })

    await this.audit.record(programId, account.id, 'answer', {
      level: program.currentLevel, nodeId: node.id, correct, attempts: updated.progress[node.id].attempts,
      open: open ? { verdict: open.verdict, method: open.method } : undefined,
    })
    await recordAttempt(this.db, account.id, memoryKeyFor(program.intent.topic), {
      nodeId: node.id, correct, errorTag: correct ? undefined : node.tags[0] ?? node.id, at: this.clock(),
    }).catch(() => undefined)

    return {
      correct, mastered: updated.progress[node.id].mastered,
      hint: correct ? null : `Repasa: ${node.objective}`,
      view: this.view(updated),
    }
  }

  // ── Checkpoint y adaptación ─────────────────────────────────────────────
  async checkpoint(account: Account, programId: string): Promise<ProgramView & { decision: 'advance' | 'hold' | 'teacher_review'; reason: string; adapted: { applied: number; rejected: number } }> {
    let program = await this.owned(account, programId)
    if (program.status !== 'active') throw new ProgramRuleError('not_active', 'El programa no está activo')
    const level = program.levels[program.currentLevel]
    if (!level || level.nodes.length === 0) throw new ProgramRuleError('no_content', 'El nivel actual aún no tiene contenido')
    const ids = levelNodeIds(level)
    if (ids.some(id => (program.progress[id]?.attempts ?? 0) === 0)) {
      throw new ProgramRuleError('incomplete_level', 'Intenta todos los nodos del nivel antes de cerrarlo')
    }

    const mastered = ids.filter(id => program.progress[id]?.mastered)
    const ratio = mastered.length / ids.length

    // Opinión del oráculo sobre el nivel (asesora, no decide).
    let kevReady: number | null = null
    const kev = await this.deps.kev?.(this.runContext(account)).catch(() => null)
    if (kev) {
      const { judgeLevel } = await import('../../agent/kev/judge')
      kevReady = (await judgeLevel(kev, {
        topic: program.intent.topic, level: level.title,
        nodes: level.nodes.map(n => ({ title: n.title, objective: n.objective, mastered: !!program.progress[n.id]?.mastered, attempts: program.progress[n.id]?.attempts, accuracy: program.progress[n.id]?.correct ? 1 : 0 })),
      }).catch(() => ({ ready: null }))).ready
    }

    let decision: 'advance' | 'hold' | 'teacher_review'
    let reason: string
    if (ratio >= MASTERY_ADVANCE) {
      const { decideLevelAdvance } = await import('../../agent/kev/level')
      const advice = decideLevelAdvance({ levelNodes: ids, mastered, kevReady, accredits: true })
      // El programa no se detiene por falta de acreditación: avanza; el docente valida después.
      decision = advice.decision === 'teacher_review' ? 'teacher_review' : 'advance'
      reason = ratio === 1 ? 'Dominó todo el nivel' : `Dominó ${mastered.length} de ${ids.length} nodos`
      if (advice.decision === 'teacher_review') reason += '; el oráculo pide revisión docente'
    } else {
      decision = 'hold'
      reason = `Dominó ${mastered.length} de ${ids.length} nodos: se refuerza antes de seguir`
    }
    const now = this.clock().toISOString()

    await this.audit.record(programId, account.id, 'checkpoint', {
      level: program.currentLevel, decision, reason, mastered: mastered.length, total: ids.length, kevReady,
    })

    // Cierra el nivel y fija el checkpoint (inmutable a partir de aquí).
    program = await this.store.update(programId, p => {
      const l = p.levels[p.currentLevel]
      l.status = 'closed'
      l.checkpoint = { decision, masteredCount: mastered.length, total: ids.length, reason, at: now }
      return p
    })

    // Evaluación final: cierra el programa y lo deja pendiente de validación docente.
    if (level.kind === 'final') {
      program = await this.store.update(programId, p => {
        p.finalScore = Math.round(ratio * 100)
        p.validation = 'pending_review'
        p.status = 'closing'
        return p
      })
      program = await this.store.close(programId, 'completed')
      await this.audit.record(programId, account.id, 'state', { to: 'closed', reason: 'completed', finalScore: program.finalScore, validation: program.validation })
      await this.guides.record(program).catch(() => undefined)
      return { ...this.view(program), decision, reason, adapted: { applied: 0, rejected: 0 } }
    }

    const adapted = await this.adapt(account, program, decision, evidenceSummary(program, level))
    return { ...this.view(adapted.program), decision, reason, adapted: { applied: adapted.applied, rejected: adapted.rejected } }
  }

  /** Pide al adaptador el contenido del nivel siguiente y avanza al nivel que quedó con contenido. */
  private async adapt(account: Account, program: PersonalProgram, decision: 'advance' | 'hold' | 'teacher_review', evidence: string): Promise<{ program: PersonalProgram; applied: number; rejected: number }> {
    const ctx = this.runContext(account)
    const memory = await getMemory(this.db, account.id, memoryKeyFor(program.intent.topic))
    const guide = await this.guideFor(program.intent.topic, program.profile.ageBand, program.language)
    let applied = 0, rejected = 0
    let current = program
    try {
      const proposal = await this.deps.adapter({
        program, evidence, decision, runContext: ctx, guide,
        memoryBrief: memory ? buildBrief(memory, { maxChars: 700 }) : undefined,
      })
      const result = applyAdaptation(program, proposal.ops, { actor: 'agent', reason: proposal.reason })
      applied = result.applied.length
      rejected = result.rejected.length
      await this.audit.record(program.id, account.id, 'adaptation', {
        level: program.currentLevel, decision, reason: proposal.reason.slice(0, 300),
        applied: result.applied.map(a => a.detail), rejected: result.rejected.map(r => `${r.op}: ${r.reason}`),
      })
      if (applied > 0) {
        current = await this.store.update(program.id, p => ({ ...p, levels: result.program.levels, revisions: result.program.revisions }))
      }
    } catch (error) {
      // Sin ajuste del modelo: el plan queda como estaba y `ensureLevelContent` puede reintentar o usar el repaso.
      log.warn(`[program] el adaptador falló en el nivel ${program.currentLevel + 1}: ${(error as Error).message.slice(0, 200)}`)
    }
    current = await this.store.update(current.id, p => {
      // Avanza al siguiente nivel (un refuerzo, si se insertó, es justo el siguiente).
      const next = Math.min(p.currentLevel + 1, p.levels.length - 1)
      p.currentLevel = next
      if (p.levels[next].status === 'outline') p.levels[next].status = 'active'
      return p
    })
    return { program: current, applied, rejected }
  }

  /**
   * Reintenta materializar el nivel actual cuando quedó sin contenido. Idempotente. Si el modelo no responde o sus
   * ajustes no pasan las guardas, el nivel se arma con REPASO determinista de lo ya visto: el alumno nunca queda
   * sin siguiente paso por una caída del modelo.
   */
  async ensureLevelContent(account: Account, programId: string): Promise<ProgramView> {
    const program = await this.owned(account, programId)
    if (program.status !== 'active') throw new ProgramRuleError('not_active', 'El programa no está activo')
    const level = program.levels[program.currentLevel]
    if (level.nodes.length > 0) return this.view(program)

    // La adaptación busca el nivel SIGUIENTE al actual: se retrocede lógicamente un paso para materializar este.
    const asPrevious: PersonalProgram = { ...program, currentLevel: Math.max(0, program.currentLevel - 1) }
    let levels: ProgramLevel[] | null = null
    let revisions = program.revisions
    try {
      const proposal = await this.deps.adapter({
        program: asPrevious, decision: 'advance', evidence: evidenceSummary(program, program.levels[Math.max(0, program.currentLevel - 1)]),
        runContext: this.runContext(account),
      })
      const result = applyAdaptation(asPrevious, proposal.ops, { actor: 'agent', reason: proposal.reason })
      if ((result.program.levels[program.currentLevel]?.nodes.length ?? 0) > 0) { levels = result.program.levels; revisions = result.program.revisions }
    } catch (error) {
      log.warn(`[program] reintento del adaptador falló: ${(error as Error).message.slice(0, 200)}`)
    }

    if (!levels) {
      const review = reviewNodes(program, program.currentLevel)
      if (review.length === 0) throw new ProgramRuleError('no_content', 'No se pudo preparar el nivel; vuelve a intentarlo')
      const fallback = applyAdaptation(program, [{ op: 'materialize_level', levelIndex: program.currentLevel, nodes: review }], { actor: 'system', reason: 'Repaso determinista: el modelo no pudo preparar el nivel' })
      if ((fallback.program.levels[program.currentLevel]?.nodes.length ?? 0) === 0) throw new ProgramRuleError('no_content', 'No se pudo preparar el nivel; vuelve a intentarlo')
      levels = fallback.program.levels; revisions = fallback.program.revisions
    }
    const updated = await this.store.update(programId, p => ({ ...p, levels: levels!.map((l, i) => i === p.currentLevel ? { ...l, status: 'active' as const } : l), revisions }))
    return this.view(updated)
  }

  async close(account: Account, programId: string): Promise<PersonalProgram> {
    const program = await this.owned(account, programId)
    if (program.status === 'closed') return program
    const closed = await this.store.close(programId, 'voluntary')
    await this.audit.record(programId, account.id, 'state', { to: 'closed', reason: 'voluntary', level: program.currentLevel })
    return closed
  }
}

/**
 * Nodos de repaso: lo no logrado de niveles anteriores (y, si todo se logró, lo que costó más intentos), con ids
 * nuevos para no chocar con los originales. Respeta el rango de nodos del nivel.
 */
export function reviewNodes(program: PersonalProgram, levelIndex: number): ProgramNode[] {
  const { min, max } = allowedNodes(program.sizing, levelIndex)
  const seen = program.levels.filter(l => l.index < levelIndex).flatMap(l => l.nodes)
  const ranked = [...seen].sort((a, b) => {
    const pa = program.progress[a.id], pb = program.progress[b.id]
    return Number(pa?.mastered ?? false) - Number(pb?.mastered ?? false) || (pb?.attempts ?? 0) - (pa?.attempts ?? 0)
  })
  const used = new Set(program.levels.flatMap(l => l.nodes.map(n => n.id)))
  const out: ProgramNode[] = []
  for (const node of ranked) {
    if (out.length >= max) break
    let id = `${node.id}-r`.slice(0, 48), n = 2
    while (used.has(id)) id = `${node.id.slice(0, 44)}-r${n++}`
    used.add(id)
    out.push({ ...node, id, title: `Repaso: ${node.title}`.slice(0, 120) })
  }
  return out.length >= min ? out : out.length > 0 ? out : []
}

/** Resumen del nivel cerrado para el adaptador: sin identidad, acotado. */
export function evidenceSummary(program: PersonalProgram, level: ProgramLevel): string {
  const lines = level.nodes.map(n => {
    const p = program.progress[n.id]
    const open = p?.open ? ` · práctica: ${p.open.verdict ?? 'sin juicio'}` : ''
    return `- ${n.title}: ${p?.mastered ? 'logrado' : 'no logrado'}${p?.firstTry ? ' al primer intento' : ''}, intentos ${p?.attempts ?? 0}${open}`
  })
  const cp = level.checkpoint
  return [`Nivel "${level.title}" — ${cp ? cp.reason : 'en curso'}`, ...lines].join('\n')
}

export { PROGRAM_LIMITS }
export type { ProgramNode }
