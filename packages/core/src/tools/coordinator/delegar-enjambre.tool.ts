import type { Tool } from '../../types/tool'
import { buildFullDAG } from '../../agent/presets/HiveLearnPreset'
import { DAGScheduler } from '../../agent/scheduler/dag'
import { HiveLearnExecutor } from '../../agent/executor'
import { buildLessonProgram } from '../../agent/orchestrator'
import { AGENT_IDS } from '../../agent/registry'
import { logger } from '../../utils/logger'
import type { PerfilAdaptacion, NodoLesson } from '../../types'
import { ageBandFromRango } from '../../institutional/age'

const log = logger.child('delegar-enjambre')


const MAX_WORKERS = Number(process.env.HIVELEARN_MAX_CONCURRENT_WORKERS ?? 2)

interface BlueprintNodo {
  id: string
  titulo: string
  concepto: string
  tipo_pedagogico: string
  tipo_visual: string
  xp_recompensa: number
}

/**
 * Tool del Coordinador para delegar al enjambre de workers.
 * Recibe el blueprint de nodos del coordinador y ejecuta Phase 2
 * (content × N + gamification + evaluation) en paralelo.
 */
export const delegarEnjambreTool: Tool = {
  name: 'delegar_a_enjambre',
  description: 'Delega la generación de contenido al enjambre. Recibe el blueprint de nodos (del planificar_programa) y ejecuta todos los workers de contenido, gamificación y evaluación en paralelo.',
  parameters: {
    type: 'object',
    properties: {
      alumnoId:  { type: 'string',  description: 'ID único del alumno' },
      meta:      { type: 'string',  description: 'Meta de aprendizaje del alumno' },
      sessionId: { type: 'string',  description: 'ID de sesión único' },
      perfil: {
        type: 'object',
        description: 'Perfil de adaptación del alumno',
        properties: {
          rangoEdad:         { type: 'string', enum: ['nino', 'adolescente', 'adulto'] },
          nivelPrevio:       { type: 'string', enum: ['principiante', 'principiante_base', 'intermedio'] },
          duracionSesion:    { type: 'number' },
          nodosRecomendados: { type: 'number' },
          estilo:            { type: 'string' },
          tono:              { type: 'string' },
        },
        required: ['rangoEdad', 'nivelPrevio', 'duracionSesion', 'estilo', 'tono'],
      },
      nodos: {
        type: 'array',
        description: 'Blueprint de nodos generado por planificar_programa',
        items: {
          type: 'object',
          properties: {
            id:               { type: 'string' },
            titulo:           { type: 'string' },
            concepto:         { type: 'string' },
            tipo_pedagogico:  { type: 'string', enum: ['concept', 'exercise', 'quiz', 'milestone', 'evaluation'] },
            tipo_visual:      { type: 'string', enum: ['text_card', 'svg_diagram', 'gif_guide', 'infographic', 'image_ai', 'audio_ai'] },
            xp_recompensa:    { type: 'number' },
          },
          required: ['id', 'titulo', 'concepto', 'tipo_pedagogico', 'tipo_visual'],
        },
      },
    },
    required: ['alumnoId', 'meta', 'perfil', 'sessionId', 'nodos'],
  },

  execute: async (params: Record<string, unknown>): Promise<{ ok: boolean; output: { success: boolean; nodesGenerated: number; message: string } | { error: string } }> => {
    const { alumnoId, meta, perfil, sessionId, nodos: rawNodos } = params as {
      alumnoId: string
      meta: string
      perfil: PerfilAdaptacion
      sessionId: string
      nodos: BlueprintNodo[]
    }
    try {
      // Aquí solo hay el rango del perfil de adaptación, no la edad: se usa la banda más restrictiva compatible.
      const executor = new HiveLearnExecutor({ studentId: alumnoId, ageBand: ageBandFromRango(perfil.rangoEdad) })
      const dagInput = { alumnoId, meta, perfil, sessionId }

      // Map coordinator blueprint → NodoLesson[]
      const nodosBase: NodoLesson[] = (rawNodos ?? []).map((n, idx) => ({
        id: n.id,
        titulo: n.titulo,
        concepto: n.concepto,
        tipoPedagogico: n.tipo_pedagogico as NodoLesson['tipoPedagogico'],
        tipoVisual: n.tipo_visual as NodoLesson['tipoVisual'],
        nivel: perfil.nivelPrevio,
        rangoEdad: perfil.rangoEdad,
        estado: 'disponible' as const,
        xpRecompensa: n.xp_recompensa ?? 100,
        posX: 100 + idx * 300,
        posY: 100 + (idx % 2) * 180,
      }))

      log.info(`[delegar] start — ${nodosBase.length} nodes, alumnoId=${alumnoId}`)

      const fullGraph = buildFullDAG(dagInput, nodosBase)
      const schedulerFull = new DAGScheduler({
        maxConcurrentWorkers: MAX_WORKERS,
        silent: false,
        executor,
        coordinatorId: AGENT_IDS.coordinator,
      })

      const fullResult = await schedulerFull.execute(fullGraph, {
        projectId: sessionId,
        coordinatorId: AGENT_IDS.coordinator,
      })
      log.info(`[delegar] done — ${fullResult.completed.length} completed, ${fullResult.failed.length} failed`)

      const program = buildLessonProgram({ dagResult: fullResult, alumnoId, meta, sessionId, perfil })

      const msg = `${program.nodos.length} nodos generados (${fullResult.completed.length} agentes completados).`
      log.info(`[delegar] ${msg}`)

      return { ok: true, output: { success: true, nodesGenerated: program.nodos.length, message: msg } }
    } catch (err) {
      const message = (err as Error).message
      log.error(`[delegar] error: ${message}`)
      return { ok: false, output: { error: message } }
    }
  },
}
