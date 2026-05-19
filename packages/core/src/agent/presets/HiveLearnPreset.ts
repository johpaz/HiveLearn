/**
 * HiveLearnPreset — DAG operativo del swarm reducido de HiveLearn.
 *
 * El coordinador planifica el blueprint y luego despacha solo workers activos.
 * - content        → explanation
 * - practice       → exercise
 * - assessment     → evaluation
 * - visual         → image
 * - infographic    → infographic
 * - audio          → audio
 * - gamification   → gamification
 */
import { TaskGraph } from '../../agent/scheduler/dag'
import type { TaskNodeConfig } from '../../agent/scheduler/dag'
import { AGENT_IDS } from '../../agent/registry'
import type { PerfilAdaptacion, NodoLesson, RangoEdad } from '../../types'

export interface HiveLearnDAGInput {
  alumnoId: string
  meta: string
  perfil: PerfilAdaptacion
  sessionId: string
}

export const HIVELEARN_RUNTIME_WORKERS = {
  content: [AGENT_IDS.explanation],
  practice: [AGENT_IDS.exercise],
  assessment: [AGENT_IDS.evaluation],
  visual: [AGENT_IDS.image],
  infographic: [AGENT_IDS.infographic],
  audio: [AGENT_IDS.audio],
  gamification: [AGENT_IDS.gamification],
} as const

function looksCodeFriendly(text: string): boolean {
  const normalized = text.toLowerCase()
  return ['codigo', 'program', 'script', 'javascript', 'python', 'html', 'css', 'sql', 'algoritmo', 'comando']
    .some(token => normalized.includes(token))
}

function looksInfographicFriendly(text: string): boolean {
  const normalized = text.toLowerCase()
  return ['compar', 'dato', 'estad', 'resumen', 'puntos clave', 'pasos', 'beneficios', 'caracteristicas']
    .some(token => normalized.includes(token))
}

function normalizeVisualForAge(nodo: Omit<NodoLesson, 'posX' | 'posY'>): NodoLesson['tipoVisual'] {
  if (nodo.rangoEdad !== 'nino') return nodo.tipoVisual

  const context = `${nodo.titulo} ${nodo.concepto}`
  if (nodo.tipoVisual === 'code_block' && !looksCodeFriendly(context)) return 'svg_diagram'
  if (nodo.tipoVisual === 'infographic' && !looksInfographicFriendly(context)) return 'image_ai'
  return nodo.tipoVisual
}

/**
 * Construye las tareas por nodo a partir del blueprint del coordinador.
 * Cada nodo genera:
 * - 1 worker pedagógico obligatorio
 * - 0 o 1 worker de media opcional
 */
export function buildContentNodes(
  nodos: Omit<NodoLesson, 'posX' | 'posY'>[],
  ctxBase: string,
): TaskNodeConfig[] {
  const tierOneNodes: TaskNodeConfig[] = []

  for (const nodo of nodos) {
    const tipoVisualNormalizado = normalizeVisualForAge(nodo)
    const ctx = `${ctxBase}\nNodo: "${nodo.titulo}". Concepto: "${nodo.concepto}". Nivel: ${nodo.nivel}. Rango edad: ${nodo.rangoEdad}.`

    // Worker pedagógico según tipo de nodo.
    const contentAgentMap: Record<string, string> = {
      concept:    AGENT_IDS.explanation,
      exercise:   AGENT_IDS.exercise,
      quiz:       AGENT_IDS.evaluation,
      challenge:  AGENT_IDS.exercise,
      milestone:  AGENT_IDS.explanation,
      evaluation: AGENT_IDS.evaluation,
    }

    const contentAgentId = contentAgentMap[nodo.tipoPedagogico] ?? AGENT_IDS.explanation

    tierOneNodes.push({
      id: `content-${nodo.id}`,
      agentId: contentAgentId,
      name: `${contentAgentId.split('-')[1]}:${nodo.id}`,
      taskDescription: `${ctx}\nTipo pedagógico: ${nodo.tipoPedagogico}. Genera el contenido apropiado en JSON.`,
      deps: [],
      timeout: 30_000,
      maxRetries: 2,
      priority: 5,
    })

    // Worker de media si el nodo lo requiere.
    if (tipoVisualNormalizado !== 'text_card') {
      const visualAgentMap: Record<string, string> = {
        code_block:    AGENT_IDS.image,
        svg_diagram:   AGENT_IDS.image,
        gif_guide:     AGENT_IDS.image,
        infographic:   AGENT_IDS.infographic,
        image_ai:      AGENT_IDS.image,
        audio_ai:      AGENT_IDS.audio,
      }

      const visualAgentId = visualAgentMap[tipoVisualNormalizado]
      if (visualAgentId) {
        tierOneNodes.push({
          id: `visual-${nodo.id}`,
          agentId: visualAgentId,
          name: `visual:${nodo.id}`,
          taskDescription: `${ctx}\nTipo visual: ${tipoVisualNormalizado}. Genera el asset visual en JSON.`,
          deps: [],
          timeout: tipoVisualNormalizado === 'image_ai' ? 45_000 : 25_000,
          maxRetries: 2,
          priority: 4,
        })
      }
    }
  }

  return tierOneNodes
}

/**
 * Construye el TaskGraph de generación a partir del blueprint ya planificado por el coordinador.
 * No incluye profile/intent/structure como workers separados.
 */
export function buildFullDAG(input: HiveLearnDAGInput, nodos: Omit<NodoLesson, 'posX' | 'posY'>[]): TaskGraph {
  const ctxBase = `Alumno: ${input.alumnoId}. Rango edad: ${input.perfil.rangoEdad}. Nivel: ${input.perfil.nivelPrevio}. Tono: ${input.perfil.tono}.`
  const contentNodes = buildContentNodes(nodos, ctxBase)
  const contentIds = contentNodes.map(n => n.id)

  const tier2: TaskNodeConfig[] = [
    {
      id: 'gamification',
      agentId: AGENT_IDS.gamification,
      name: 'GamificationAgent',
      taskDescription: `${ctxBase} Rango edad: ${input.perfil.rangoEdad}. Genera XP, logros y celebración.`,
      deps: contentIds.length > 0 ? contentIds : [],
      timeout: 30_000,
      maxRetries: 1,
      priority: 3,
    },
    {
      id: 'evaluation',
      agentId: AGENT_IDS.evaluation,
      name: 'EvaluationAgent',
      taskDescription: `${ctxBase} Meta: "${input.meta}". 5 preguntas evaluación final (3 opción múltiple + 2 respuesta corta).`,
      deps: contentIds.length > 0 ? contentIds : [],
      timeout: 45_000,
      maxRetries: 2,
      priority: 3,
    },
  ]

  return new TaskGraph([...contentNodes, ...tier2])
}
