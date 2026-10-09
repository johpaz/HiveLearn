import type { HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'
import type { Account } from './accounts'
import { digest } from './accounts'
import { CURRICULUM_NODES } from './curriculum'
import { Learning, QUESTION_BANK } from './learning'

export const INTERESTS = {
  tecnologia: 'Tecnología y videojuegos',
  ciencia: 'Ciencia y naturaleza',
  arte: 'Arte, historias y creatividad',
  cotidiano: 'Situaciones de la vida diaria',
} as const
export const LEARNING_MODES = {
  ejemplos: 'Ver ejemplos antes de responder',
  retos: 'Aprender resolviendo retos',
  historias: 'Aprender mediante historias y casos',
} as const
export type Interest = keyof typeof INTERESTS
export type LearningMode = keyof typeof LEARNING_MODES
export type JourneyStage = 'welcome' | 'interest' | 'learning_mode' | 'diagnostic' | 'route_ready' | 'concept' | 'practice' | 'feedback'
export interface JourneyState {
  studentId: string
  institutionId: string
  stage: JourneyStage
  interest?: Interest
  learningMode?: LearningMode
  questionOrder: string[]
  answers: { questionId: string; option: number }[]
  focusNodeId?: string
  lastResponse?: string
  lastFeedback?: string
  attempts: number
  updatedAt: string
}

export const journeyActionSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('start_journey'), context: z.object({}).passthrough() }),
  z.object({ name: z.literal('choose_interest'), context: z.object({ value: z.enum(Object.keys(INTERESTS) as [Interest, ...Interest[]]) }).strict() }),
  z.object({ name: z.literal('choose_learning_mode'), context: z.object({ value: z.enum(Object.keys(LEARNING_MODES) as [LearningMode, ...LearningMode[]]) }).strict() }),
  z.object({ name: z.literal('answer_diagnostic'), context: z.object({ questionId: z.string(), option: z.coerce.number().int().min(0).max(2) }).strict() }),
  z.object({ name: z.literal('begin_learning'), context: z.object({}).passthrough() }),
  z.object({ name: z.literal('continue_to_practice'), context: z.object({}).passthrough() }),
  z.object({ name: z.literal('submit_practice'), context: z.object({ nodeId: z.string(), response: z.string().trim().min(20).max(2000) }).strict() }),
  z.object({ name: z.literal('revise_practice'), context: z.object({}).passthrough() }),
])
export type JourneyAction = z.infer<typeof journeyActionSchema>

const priorityByInterest: Record<Interest, string[]> = {
  tecnologia: ['ai-workflow', 'system-design'],
  ciencia: ['data-patterns', 'model-evaluation'],
  arte: ['ai-agency', 'verification'],
  cotidiano: ['privacy', 'ai-agency'],
}

export class GuidedJourney {
  constructor(readonly db: HiveDB, readonly learning: Learning) {}

  private collection() { return this.db.collection<JourneyState>('hl_learning_journeys') }

  async current(actor: Account) {
    if (actor.role !== 'student') throw new Error('El recorrido guiado es exclusivo del alumno')
    let entry = await this.collection().get(actor.id)
    if (!entry) {
      const state: JourneyState = { studentId: actor.id, institutionId: actor.institutionId, stage: 'welcome', questionOrder: [], answers: [], attempts: 0, updatedAt: new Date().toISOString() }
      try { await this.collection().put(actor.id, state, { expectedVersion: 0 }) } catch { /* another request initialized it */ }
      entry = await this.collection().get(actor.id)
    }
    return entry!
  }

  private questionOrder(interest: Interest) {
    const priority = priorityByInterest[interest]
    return [...QUESTION_BANK].sort((a, b) => {
      const ai = priority.indexOf(a.nodeId), bi = priority.indexOf(b.nodeId)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    }).map(question => question.id)
  }

  async transition(actor: Account, raw: unknown, feedback: (nodeId: string, response: string, state: JourneyState) => Promise<string>) {
    const action = journeyActionSchema.parse(raw)
    const entry = await this.current(actor)
    const state = entry.doc
    let next: JourneyState
    const stamp = () => new Date().toISOString()

    if (action.name === 'start_journey' && state.stage === 'welcome') next = { ...state, stage: 'interest', updatedAt: stamp() }
    else if (action.name === 'choose_interest' && state.stage === 'interest') next = { ...state, interest: action.context.value, questionOrder: this.questionOrder(action.context.value), stage: 'learning_mode', updatedAt: stamp() }
    else if (action.name === 'choose_learning_mode' && state.stage === 'learning_mode') next = { ...state, learningMode: action.context.value, stage: 'diagnostic', updatedAt: stamp() }
    else if (action.name === 'answer_diagnostic' && state.stage === 'diagnostic') {
      const expected = state.questionOrder[state.answers.length]
      if (!expected || expected !== action.context.questionId) throw new Error('Esta pregunta ya cambió; vuelve a cargar la actividad')
      const answers = [...state.answers, { questionId: expected, option: action.context.option }]
      if (answers.length < QUESTION_BANK.length) next = { ...state, answers, updatedAt: stamp() }
      else {
        const route = await this.learning.diagnostic(actor, { answers })
        const focusNodeId = CURRICULUM_NODES.find(node => route.scores[node.id] === false)?.id ?? route.nodes.find(node => node.status !== 'mastered')?.id ?? CURRICULUM_NODES[0].id
        next = { ...state, answers, focusNodeId, stage: 'route_ready', updatedAt: stamp() }
      }
    } else if (action.name === 'begin_learning' && state.stage === 'route_ready') next = { ...state, stage: 'concept', updatedAt: stamp() }
    else if (action.name === 'continue_to_practice' && state.stage === 'concept') next = { ...state, stage: 'practice', updatedAt: stamp() }
    else if (action.name === 'revise_practice' && state.stage === 'feedback') next = { ...state, stage: 'practice', updatedAt: stamp() }
    else if (action.name === 'submit_practice' && state.stage === 'practice') {
      if (action.context.nodeId !== state.focusNodeId) throw new Error('La respuesta no corresponde a la actividad actual')
      const route = await this.learning.route(actor)
      if (!route.nodes.some(node => node.id === action.context.nodeId)) throw new Error('Actividad fuera de la ruta personalizada')
      const evidenceId = digest(`${actor.id}:${action.context.nodeId}:${action.context.response.trim()}`)
      const evidence = this.db.collection('hl_student_evidence')
      if (!(await evidence.get(evidenceId))) await evidence.put(evidenceId, { studentId: actor.id, institutionId: actor.institutionId, nodeId: action.context.nodeId, text: action.context.response.trim(), version: route.version, source: 'guided-agent', createdAt: stamp() }, { expectedVersion: 0 })
      let lastFeedback: string
      try { lastFeedback = await feedback(action.context.nodeId, action.context.response.trim(), state) }
      catch { lastFeedback = 'Guardé tu respuesta. El tutor local no pudo analizarla ahora mismo. Revisa si explicaste tu decisión, diste un ejemplo y mencionaste un límite; después puedes intentarlo nuevamente.' }
      next = { ...state, lastResponse: action.context.response.trim(), lastFeedback, attempts: state.attempts + 1, stage: 'feedback', updatedAt: stamp() }
    } else throw new Error('La acción no corresponde a la pantalla actual')

    await this.collection().put(actor.id, next, { expectedVersion: entry.version })
    return next
  }
}
