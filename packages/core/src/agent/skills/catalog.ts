/**
 * Skills pedagógicas como DATOS: fragmentos de instrucción que se añaden a la tarea de un especialista.
 *
 * No son las skills del SDK (que se recuperan por BM25 y se descartan con `systemPromptOverride`): aquí son
 * deterministas y auditables. Qué skills recibe cada trabajo lo propone Kev (coordinador y especialista), pero
 * la elegibilidad por agente y banda de edad y las obligatorias las fija el código: Kev solo elige dentro de lo
 * permitido y no puede quitar una obligatoria.
 */
import { AGENT_IDS } from '../registry'
import type { AgeBand } from '../../institutional/age'

export interface PedagogySkill {
  id: string
  name: string
  /** Para el oráculo: cuándo aplica. */
  description: string
  /** Lo que se inyecta en la tarea del especialista. */
  body: string
  /** Especialistas a los que puede asignarse. */
  agents: readonly string[]
  /** Bandas de edad elegibles (todas si se omite). */
  bands?: readonly AgeBand[]
  /** Obligatoria según el contexto: Kev no puede quitarla. */
  mandatory?: (ctx: SkillContext) => boolean
}

export interface SkillContext {
  hasDossier: boolean
}

const MINORS: readonly AgeBand[] = ['ninez', 'adolescencia_temprana']
const OLDER: readonly AgeBand[] = ['adolescencia', 'adulto']
const CONTENT = [AGENT_IDS.explanation, AGENT_IDS.exercise] as const
const ALL_CONTENT = [AGENT_IDS.explanation, AGENT_IDS.exercise, AGENT_IDS.evaluation] as const

export const SKILLS: readonly PedagogySkill[] = [
  {
    id: 'ejemplos-cotidianos', name: 'Ejemplos cotidianos',
    description: 'The concept is abstract and a concrete example from everyday life would make it easier to grasp.',
    body: 'Ancla el concepto en un ejemplo de la vida diaria del alumno antes de la definición formal.',
    agents: CONTENT,
  },
  {
    id: 'lenguaje-simple', name: 'Lenguaje simple',
    description: 'The learner is young or new to the topic: short sentences and no jargon.',
    body: 'Usa frases cortas y vocabulario cotidiano; si aparece un término técnico, explícalo con una palabra sencilla.',
    agents: ALL_CONTENT, bands: MINORS,
  },
  {
    id: 'analogias', name: 'Analogías',
    description: 'A comparison with a familiar domain would clarify how the concept works.',
    body: 'Incluye UNA analogía con un dominio familiar y di explícitamente dónde la analogía deja de valer.',
    agents: [AGENT_IDS.explanation], bands: OLDER,
  },
  {
    id: 'rigor-tecnico', name: 'Rigor técnico',
    description: 'The learner is an adult with prior knowledge who needs precise terminology and nuance.',
    body: 'Usa terminología precisa, señala matices y casos límite; evita simplificaciones que induzcan a error.',
    agents: CONTENT, bands: ['adulto'],
  },
  {
    id: 'contraejemplo', name: 'Contraejemplo',
    description: 'A common misconception can be dispelled by showing a counterexample or edge case.',
    body: 'Añade un contraejemplo o caso límite que muestre dónde la idea intuitiva falla.',
    agents: [AGENT_IDS.explanation],
  },
  {
    id: 'pistas-graduales', name: 'Pistas graduales',
    description: 'The activity asks the learner to solve something and may need progressive help.',
    body: 'Ofrece pistas en orden creciente de ayuda (de orientar a casi resolver) sin revelar la respuesta final.',
    agents: [AGENT_IDS.exercise, AGENT_IDS.evaluation],
  },
  {
    id: 'error-comun', name: 'Error común',
    description: 'There is a frequent mistake learners make with this concept that is worth anticipating.',
    body: 'Anticipa el error más frecuente en este concepto y haz que una opción o pista lo aborde.',
    agents: ALL_CONTENT,
  },
  {
    id: 'verificar-con-fuente', name: 'Verificar con fuente',
    description: 'Factual claims must come from the research dossier.',
    body: 'Afirma hechos concretos SOLO si están en el DOSSIER y cita sus ids en claim_ids; si no hay respaldo, dilo con cautela.',
    agents: CONTENT, mandatory: ctx => ctx.hasDossier,
  },
]

const byId = new Map(SKILLS.map(skill => [skill.id, skill]))

export function eligibleSkills(agentId: string, band: AgeBand, ctx: SkillContext): { mandatory: PedagogySkill[]; optional: PedagogySkill[] } {
  const fits = SKILLS.filter(s => s.agents.includes(agentId) && (!s.bands || s.bands.includes(band)))
  return {
    mandatory: fits.filter(s => s.mandatory?.(ctx)),
    optional: fits.filter(s => !s.mandatory?.(ctx)),
  }
}

/** Base determinista cuando no hay oráculo: lo propio de la banda, como mucho dos. */
export function defaultSkills(agentId: string, band: AgeBand, ctx: SkillContext): string[] {
  const { optional } = eligibleSkills(agentId, band, ctx)
  return optional.filter(s => s.bands?.includes(band)).slice(0, 2).map(s => s.id)
}

export const MAX_OPTIONAL_SKILLS = 3

/** Bloque para la tarea. Orden y texto estables: misma entrada, mismo prompt. */
export function renderSkills(ids: readonly string[]): string {
  const skills = ids.map(id => byId.get(id)).filter((s): s is PedagogySkill => !!s)
  if (!skills.length) return ''
  return `\n\nSKILLS ACTIVAS (criterios pedagógicos a aplicar):\n${skills.map(s => `- ${s.name}: ${s.body}`).join('\n')}`
}

/** Une obligatorias y elegidas; descarta lo no elegible y respeta el máximo. */
export function finalizeSkills(agentId: string, band: AgeBand, ctx: SkillContext, chosen: readonly string[]): string[] {
  const { mandatory, optional } = eligibleSkills(agentId, band, ctx)
  const allowed = new Set(optional.map(s => s.id))
  const picked = [...new Set(chosen)].filter(id => allowed.has(id)).slice(0, MAX_OPTIONAL_SKILLS)
  return [...mandatory.map(s => s.id), ...picked]
}
