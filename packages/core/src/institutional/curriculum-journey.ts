/**
 * Recorrido guiado para CUALQUIER currículo (el de IA conserva el suyo, `journey.ts`).
 *
 * Mismo guion que el de IA: bienvenida → intereses → forma de aprender → diagnóstico → ruta → concepto →
 * práctica → feedback, pero el contenido sale de la definición del currículo (`CurriculumDef`) y el progreso va
 * por `(alumno, currículo)`. El estado lleva el hash del contenido: si el currículo cambia, el recorrido
 * empieza de nuevo en lugar de mezclar contenidos.
 *
 * La práctica es una respuesta abierta: la juzga Kev (si hay) y queda como evidencia de método `oracle`;
 * acreditar sigue la regla híbrida (≥ 2 sesiones, confianza ≥ 0,8, currículo que acredita).
 */
import type { HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'
import type { Account } from './accounts'
import { digest } from './accounts'
import { INTERESTS, LEARNING_MODES, type Interest, type JourneyStage, type LearningMode } from './journey'
import { CurriculumProgressStore } from './curriculum-progress'
import type { CurriculumDef } from './curriculum-def'

export interface CurriculumJourneyState {
  studentId: string
  institutionId: string
  curriculumId: string
  hash: string
  stage: JourneyStage
  interest?: Interest
  learningMode?: LearningMode
  questionOrder: string[]
  answers: { questionId: string; option: number }[]
  focusNodeId?: string
  lastResponse?: string
  lastFeedback?: string
  lastVerdict?: 'correct' | 'incorrect' | 'unsure'
  attempts: number
  updatedAt: string
}

export const curriculumJourneyActionSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('start_journey'), context: z.object({}).passthrough() }),
  z.object({ name: z.literal('choose_interest'), context: z.object({ value: z.enum(Object.keys(INTERESTS) as [Interest, ...Interest[]]) }).strict() }),
  z.object({ name: z.literal('choose_learning_mode'), context: z.object({ value: z.enum(Object.keys(LEARNING_MODES) as [LearningMode, ...LearningMode[]]) }).strict() }),
  z.object({ name: z.literal('answer_diagnostic'), context: z.object({ questionId: z.string(), option: z.coerce.number().int().min(0).max(2) }).strict() }),
  z.object({ name: z.literal('begin_learning'), context: z.object({}).passthrough() }),
  z.object({ name: z.literal('continue_to_practice'), context: z.object({}).passthrough() }),
  z.object({ name: z.literal('submit_practice'), context: z.object({ nodeId: z.string(), response: z.string().trim().min(20).max(2000) }).strict() }),
  z.object({ name: z.literal('revise_practice'), context: z.object({}).passthrough() }),
  z.object({ name: z.literal('next_activity'), context: z.object({}).passthrough() }),
])

export interface FeedbackResult { text: string; verdict?: 'correct' | 'incorrect' | 'unsure' }

export interface CurriculumJourneyDeps {
  /** Feedback formativo (tutor). Si lanza, se usa un mensaje de respaldo. */
  feedback: (input: { nodeId: string; response: string; state: CurriculumJourneyState }) => Promise<FeedbackResult>
  /** Texto de la explicación del nodo (puede tardar: se genera y se guarda en caché). */
  prepareMaterial?: (nodeId: string) => Promise<void>
  /** Registra la práctica como evidencia evaluada (Kev). Un fallo no rompe el recorrido. */
  assess?: (input: { nodeId: string; response: string; sessionId: string }) => Promise<void>
}

const FALLBACK_FEEDBACK = 'Guardé tu respuesta. El tutor no pudo analizarla ahora mismo. Revisa si explicaste tu idea con tus palabras, diste un ejemplo y mencionaste un límite; después puedes intentarlo de nuevo.'

export class CurriculumJourney {
  private readonly progress: CurriculumProgressStore
  constructor(readonly db: HiveDB) { this.progress = new CurriculumProgressStore(db) }

  private collection() { return this.db.collection<CurriculumJourneyState>('hl_curriculum_journeys') }
  private key(studentId: string, curriculumId: string) { return `${studentId}:${curriculumId}` }

  async current(actor: Account, def: CurriculumDef) {
    if (actor.role !== 'student') throw new Error('El recorrido guiado es exclusivo del alumno')
    const id = this.key(actor.id, def.id)
    let entry = await this.collection().get(id)
    if (entry && entry.doc.hash !== def.hash) {
      // El contenido cambió: se reinicia (el diagnóstico y los dominios anteriores tampoco se arrastran).
      const fresh = this.initial(actor, def)
      await this.collection().put(id, fresh, { expectedVersion: entry.version })
      entry = await this.collection().get(id)
    }
    if (!entry) {
      try { await this.collection().put(id, this.initial(actor, def), { expectedVersion: 0 }) } catch { /* otra petición lo inicializó */ }
      entry = await this.collection().get(id)
    }
    return entry!
  }

  private initial(actor: Account, def: CurriculumDef): CurriculumJourneyState {
    return {
      studentId: actor.id, institutionId: actor.institutionId, curriculumId: def.id, hash: def.hash,
      stage: 'welcome', questionOrder: def.questionBank.map(q => q.id), answers: [], attempts: 0, updatedAt: new Date().toISOString(),
    }
  }

  async transition(actor: Account, def: CurriculumDef, raw: unknown, deps: CurriculumJourneyDeps) {
    const action = curriculumJourneyActionSchema.parse(raw)
    const entry = await this.current(actor, def)
    const state = entry.doc
    const stamp = () => new Date().toISOString()
    let next: CurriculumJourneyState

    if (action.name === 'start_journey' && state.stage === 'welcome') next = { ...state, stage: 'interest', updatedAt: stamp() }
    else if (action.name === 'choose_interest' && state.stage === 'interest') next = { ...state, interest: action.context.value, stage: 'learning_mode', updatedAt: stamp() }
    else if (action.name === 'choose_learning_mode' && state.stage === 'learning_mode') next = { ...state, learningMode: action.context.value, stage: 'diagnostic', updatedAt: stamp() }
    else if (action.name === 'answer_diagnostic' && state.stage === 'diagnostic') {
      const expected = state.questionOrder[state.answers.length]
      if (!expected || expected !== action.context.questionId) throw new Error('Esta pregunta ya cambió; vuelve a cargar la actividad')
      const answers = [...state.answers, { questionId: expected, option: action.context.option }]
      if (answers.length < def.questionBank.length) next = { ...state, answers, updatedAt: stamp() }
      else {
        const route = await this.progress.diagnostic(actor, def, { answers })
        const focusNodeId = def.nodes.find(node => route.scores[node.id] === false && route.nodes.some(n => n.id === node.id && n.status === 'available'))?.id
          ?? route.nodes.find(node => node.status === 'available')?.id
          ?? def.nodes[0].id
        next = { ...state, answers, focusNodeId, stage: 'route_ready', updatedAt: stamp() }
      }
    } else if (action.name === 'begin_learning' && state.stage === 'route_ready') {
      if (state.focusNodeId) await deps.prepareMaterial?.(state.focusNodeId).catch(() => {})
      next = { ...state, stage: 'concept', updatedAt: stamp() }
    } else if (action.name === 'continue_to_practice' && state.stage === 'concept') next = { ...state, stage: 'practice', updatedAt: stamp() }
    else if (action.name === 'revise_practice' && state.stage === 'feedback') next = { ...state, stage: 'practice', updatedAt: stamp() }
    else if (action.name === 'next_activity' && state.stage === 'feedback') {
      const route = await this.progress.route(actor, def)
      const candidates = route.nodes.filter(n => n.status === 'available')
      const others = candidates.filter(n => n.id !== state.focusNodeId)
      // La siguiente en el orden del currículo; si la actual era la última, vuelve a la primera distinta.
      const target = others.find(n => candidates.indexOf(n) > candidates.findIndex(c => c.id === state.focusNodeId)) ?? others[0]
      if (!target) throw new Error('No hay otra actividad disponible por ahora')
      await deps.prepareMaterial?.(target.id).catch(() => {})
      next = { ...state, focusNodeId: target.id, lastResponse: undefined, lastFeedback: undefined, lastVerdict: undefined, attempts: 0, stage: 'concept', updatedAt: stamp() }
    } else if (action.name === 'submit_practice' && state.stage === 'practice') {
      if (action.context.nodeId !== state.focusNodeId) throw new Error('La respuesta no corresponde a la actividad actual')
      const route = await this.progress.route(actor, def)
      const node = route.nodes.find(n => n.id === action.context.nodeId)
      if (!node || node.status === 'pending') throw new Error('Actividad fuera de la ruta personalizada')
      const response = action.context.response.trim()
      const evidenceId = digest(`${actor.id}:${def.id}:${node.id}:${response}`)
      const evidence = this.db.collection('hl_student_evidence')
      if (!(await evidence.get(evidenceId))) {
        await evidence.put(evidenceId, { studentId: actor.id, institutionId: actor.institutionId, curriculumId: def.id, nodeId: node.id, text: response, version: def.version, source: 'guided-agent', createdAt: stamp() }, { expectedVersion: 0 }).catch(() => {})
      }
      let feedback: FeedbackResult
      try { feedback = await deps.feedback({ nodeId: node.id, response, state }) } catch { feedback = { text: FALLBACK_FEEDBACK } }
      // Evidencia evaluada (Kev): auxiliar, nunca rompe el recorrido.
      // "Sesión" = día: repetir el mismo ejercicio en una sentada no cuenta como evidencia de dominio sostenido.
      await deps.assess?.({ nodeId: node.id, response, sessionId: `journey:${stamp().slice(0, 10)}` }).catch(() => {})
      next = { ...state, lastResponse: response, lastFeedback: feedback.text, lastVerdict: feedback.verdict, attempts: state.attempts + 1, stage: 'feedback', updatedAt: stamp() }
    } else throw new Error('La acción no corresponde a la pantalla actual')

    await this.collection().put(this.key(actor.id, def.id), next, { expectedVersion: entry.version })
    return next
  }
}
