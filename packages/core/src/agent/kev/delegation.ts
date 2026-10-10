/**
 * Delegación guiada por Kev, en dos niveles:
 *
 *  - Coordinador (`planDelegation`): UNA consulta por programa. Por nodo decide el agente visual, qué skills
 *    pedagógicas necesita su trabajo y la longitud del contenido.
 *  - Especialista (`planSpecialist`): UNA consulta por corrida. Decide el esfuerzo de razonamiento, la longitud y
 *    qué skills del nodo aplica de verdad (puede recortar lo que el coordinador propuso).
 *
 * Kev solo elige dentro de lo permitido: candidatos fijados por el código, confianza mínima, máximo de skills,
 * obligatorias intactas. Sin respuesta (sin oráculo, caída, respuesta inválida) devuelve el plan determinista, de
 * modo que el sistema funciona igual sin Kev.
 */
import { clip, choiceOf, probOf, type KevClient, type KevQuestion } from './client'
import { defaultSkills, eligibleSkills, finalizeSkills, type SkillContext } from '../skills/catalog'
import type { AgeBand } from '../../institutional/age'
import { AGENT_IDS } from '../registry'

export type Length = 'brief' | 'standard' | 'detailed'
export type Effort = 'direct' | 'reason'
export type VisualType = 'text_card' | 'infographic' | 'image_ai' | 'audio_ai'

export const VISUAL_CHOICES: Record<VisualType, string> = {
  text_card: 'Text only: the explanation is enough, no extra visual asset',
  infographic: 'Infographic: comparisons, key points, steps or data summaries',
  image_ai: 'Illustration or diagram: a spatial, structural or visual idea',
  audio_ai: 'Audio narration: a story, pronunciation or explanation better heard',
}
const LENGTHS: readonly Length[] = ['brief', 'standard', 'detailed']

const MIN_CHOICE = 0.7
const MIN_SKILL = 0.5

export interface PlanNodeInput {
  id: string
  titulo: string
  concepto: string
  tipoPedagogico: string
  tipoVisual: string
}

export interface NodePlan {
  nodeId: string
  /** Agente de contenido del nodo (el que redacta). */
  agentId: string
  tipoVisual: string
  skills: string[]
  length: Length | null
  source: 'oracle' | 'default'
}

export interface DelegationPlan {
  nodes: Map<string, NodePlan>
  oracle: boolean
}

const CONTENT_AGENT: Record<string, string> = {
  concept: AGENT_IDS.explanation, milestone: AGENT_IDS.explanation,
  exercise: AGENT_IDS.exercise, challenge: AGENT_IDS.exercise,
  quiz: AGENT_IDS.evaluation, evaluation: AGENT_IDS.evaluation,
}
export const contentAgentFor = (tipoPedagogico: string): string => CONTENT_AGENT[tipoPedagogico] ?? AGENT_IDS.explanation

/** Plan que no depende de Kev: respeta el blueprint del coordinador y las skills propias de la banda. */
export function defaultPlan(nodes: readonly PlanNodeInput[], band: AgeBand, ctx: SkillContext): DelegationPlan {
  const map = new Map<string, NodePlan>()
  for (const node of nodes) {
    const agentId = contentAgentFor(node.tipoPedagogico)
    map.set(node.id, {
      nodeId: node.id, agentId, tipoVisual: node.tipoVisual,
      skills: finalizeSkills(agentId, band, ctx, defaultSkills(agentId, band, ctx)), length: null, source: 'default',
    })
  }
  return { nodes: map, oracle: false }
}

export async function planDelegation(
  kev: KevClient | null,
  input: { objective: string; band: AgeBand; nodes: readonly PlanNodeInput[]; hasDossier: boolean },
): Promise<DelegationPlan> {
  const ctx: SkillContext = { hasDossier: input.hasDossier }
  const fallback = defaultPlan(input.nodes, input.band, ctx)
  if (!kev || input.nodes.length === 0) return fallback

  // Una consulta por nodo: el estado lleva SOLO ese nodo (más corto y rápido; con los 10 nodos en cada lote el
  // estado pesaba ~4 400 tokens y cada consulta rozaba el corte de 3 s del SDK).
  const visuals = Object.keys(VISUAL_CHOICES)
  const out = new Map<string, NodePlan>()
  let anyOracle = false
  for (const [i, node] of input.nodes.entries()) {
    const base = fallback.nodes.get(node.id)!
    const questions: Record<string, KevQuestion> = {
      visual: { type: 'choice', instructions: 'Which visual support best serves this learning step?', criteria: VISUAL_CHOICES },
    }
    const { optional } = eligibleSkills(contentAgentFor(node.tipoPedagogico), input.band, ctx)
    const candidates = optional.slice(0, 4)
    for (const skill of candidates) questions[`skill_${skill.id}`] = { type: 'noul', instructions: `Does this step need this teaching skill: ${skill.description}` }

    const answers = await kev.ask(
      { objective: clip(input.objective, 300), age_band: input.band, step: { i, title: clip(node.titulo, 100), concept: clip(node.concepto, 160), type: node.tipoPedagogico, current_visual: node.tipoVisual } },
      questions,
    )
    if (!answers) {
      // Sin respuesta: el resto del programa usa el plan determinista (insistir gasta el presupuesto de errores del SDK).
      for (const rest of input.nodes.slice(i)) out.set(rest.id, fallback.nodes.get(rest.id)!)
      break
    }
    anyOracle = true
    const visual = choiceOf(answers, 'visual', visuals, MIN_CHOICE)
    const chosen = candidates
      .filter(s => (probOf(answers, `skill_${s.id}`) ?? 0) >= MIN_SKILL)
      .sort((a, b) => (probOf(answers, `skill_${b.id}`) ?? 0) - (probOf(answers, `skill_${a.id}`) ?? 0))
      .map(s => s.id)
    out.set(node.id, {
      ...base,
      // El visual solo se cambia si Kev lo elige con confianza; el del coordinador siempre es válido.
      tipoVisual: visual ? visual.choice : node.tipoVisual,
      skills: finalizeSkills(base.agentId, input.band, ctx, chosen),
      length: null,
      source: 'oracle',
    })
  }
  return { nodes: out, oracle: anyOracle }
}

export interface SpecialistPlan {
  effort: Effort | null
  length: Length | null
  skills: string[]
  source: 'oracle' | 'default'
}

/** Decisión de una corrida concreta. `proposed` son las skills que el coordinador asignó al nodo. */
export async function planSpecialist(
  kev: KevClient | null,
  input: { agentId: string; band: AgeBand; task: string; proposed: readonly string[]; hasDossier: boolean; nodePlanLength: Length | null },
): Promise<SpecialistPlan> {
  const ctx: SkillContext = { hasDossier: input.hasDossier }
  const baseSkills = finalizeSkills(input.agentId, input.band, ctx, input.proposed)
  const fallback: SpecialistPlan = { effort: null, length: input.nodePlanLength, skills: baseSkills, source: 'default' }
  if (!kev) return fallback

  const { optional } = eligibleSkills(input.agentId, input.band, ctx)
  const candidates = optional.filter(s => input.proposed.includes(s.id))
  const questions: Record<string, KevQuestion> = {
    effort: {
      type: 'choice',
      instructions: 'How much deliberate reasoning does the text model need to produce this content well?',
      criteria: {
        direct: 'A routine explanation, rewrite or simple item that can be written directly',
        reason: 'It needs multi-step reasoning, careful design of distractors, calculation or non-trivial structure',
      },
    },
    length: {
      type: 'choice',
      instructions: 'How long should the produced content be?',
      criteria: { brief: 'A few sentences', standard: 'A short structured piece', detailed: 'A longer, step by step piece' },
    },
  }
  for (const skill of candidates) questions[`skill_${skill.id}`] = { type: 'noul', instructions: `Does this task need this teaching skill: ${skill.description}` }

  const answers = await kev.ask(
    { task: clip(input.task, 900), age_band: input.band, specialist: input.agentId },
    questions,
  )
  if (!answers) return fallback

  const effort = choiceOf(answers, 'effort', ['direct', 'reason'], 0.7)
  const length = choiceOf(answers, 'length', LENGTHS, 0.6)
  const kept = candidates.filter(s => (probOf(answers, `skill_${s.id}`) ?? 1) >= MIN_SKILL).map(s => s.id)
  return {
    effort: (effort?.choice as Effort | undefined) ?? null,
    length: (length?.choice as Length | undefined) ?? input.nodePlanLength,
    skills: finalizeSkills(input.agentId, input.band, ctx, kept),
    source: 'oracle',
  }
}

export function lengthHint(length: Length | null): string {
  if (!length) return ''
  const text = { brief: 'breve (pocas frases)', standard: 'estándar (corta y estructurada)', detailed: 'detallada (paso a paso)' }[length]
  return `\nLONGITUD sugerida: ${text}.`
}
