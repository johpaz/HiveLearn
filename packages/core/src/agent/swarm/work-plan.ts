/**
 * Plan de trabajo del coordinador: qué se delega a qué especialista, en rondas (sin grafo).
 *
 *   ronda 1  → un trabajo pedagógico y, si el nodo lo pide, uno visual por cada nodo del blueprint
 *   ronda 2  → evaluación final, con los resultados de la ronda 1 como contexto
 *
 * Los agentes de cada trabajo salen del blueprint; Kev puede ajustar el visual y las skills antes de ejecutarlos.
 */
import { AGENT_IDS } from '../registry'
import type { PerfilAdaptacion, NodoLesson } from '../../types'
import type { Job } from './jobs'

export interface WorkPlanInput {
  alumnoId: string
  meta: string
  perfil: PerfilAdaptacion
  sessionId: string
}

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
 * Trabajos por nodo a partir del blueprint del coordinador. Cada nodo genera:
 * - 1 trabajo pedagógico obligatorio
 * - 0 o 1 trabajo de media opcional
 * Son independientes entre sí: van todos en la primera ronda.
 */
export function buildNodeJobs(
  nodos: Omit<NodoLesson, 'posX' | 'posY'>[],
  ctxBase: string,
): Job[] {
  const jobs: Job[] = []

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

    jobs.push({
      id: `content-${nodo.id}`,
      agentId: contentAgentId,
      name: `${contentAgentId.split('-')[1]}:${nodo.id}`,
      taskDescription: `${ctx}\nTipo pedagógico: ${nodo.tipoPedagogico}. Genera el contenido apropiado en JSON.`,
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
        jobs.push({
          id: `visual-${nodo.id}`,
          agentId: visualAgentId,
          name: `visual:${nodo.id}`,
          taskDescription: `${ctx}\nTipo visual: ${tipoVisualNormalizado}. Genera el asset visual en JSON.`,
              maxRetries: 2,
          priority: 4,
        })
      }
    }
  }

  return jobs
}

export interface WorkPlan {
  /** Ronda 1: independientes entre sí. */
  nodeJobs: Job[]
  /** Ronda 2: necesita los resultados de la ronda 1. */
  finalJobs: Job[]
}

/** Construye el plan de trabajo a partir del blueprint ya planificado por el coordinador. */
export function buildWorkPlan(input: WorkPlanInput, nodos: Omit<NodoLesson, 'posX' | 'posY'>[]): WorkPlan {
  const ctxBase = `Alumno: ${input.alumnoId}. Rango edad: ${input.perfil.rangoEdad}. Nivel: ${input.perfil.nivelPrevio}. Tono: ${input.perfil.tono}.`
  return {
    nodeJobs: buildNodeJobs(nodos, ctxBase),
    finalJobs: [{
      id: 'evaluation',
      agentId: AGENT_IDS.evaluation,
      name: 'EvaluationAgent',
      taskDescription: `${ctxBase} Meta: "${input.meta}". 5 preguntas evaluación final (3 opción múltiple + 2 respuesta corta).`,
      maxRetries: 2,
      priority: 3,
    }],
  }
}
