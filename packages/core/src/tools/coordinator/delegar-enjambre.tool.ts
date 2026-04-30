import type { Tool } from '../../types/tool'
import { buildBaseDAG, buildFullDAG } from '../../agent/presets/HiveLearnPreset'
import { DAGScheduler } from '../../agent/scheduler/dag'
import { HiveLearnExecutor } from '../../agent/executor'
import { buildLessonProgram, buildNodosBase } from '../../agent/orchestrator'
import { AGENT_IDS } from '../../agent/registry'
import { logger } from '../../utils/logger'
import type { PerfilAdaptacion, LessonProgram, NodoLesson } from '../../types'
import type { DAGResult } from '../../agent/scheduler/dag'

const log = logger.child('delegar-enjambre')

/**
 * Resultado capturado del último run del enjambre.
 * HiveLearnSwarm.run() lo lee después de que el coordinador LLM llama la tool.
 */
export interface DelegarResult {
  program: LessonProgram
  mergedDagResult: DAGResult
  rawOutputs: Map<string, string>
  executor: HiveLearnExecutor
}

let _lastResult: DelegarResult | null = null
export function getLastDelegarResult(): DelegarResult | null {
  return _lastResult
}

const MAX_WORKERS = Number(process.env.HIVELEARN_MAX_CONCURRENT_WORKERS ?? 2)

/**
 * Tool del Coordinador para delegar al enjambre de 16 workers.
 * Ejecuta Phase 1 (profile → intent → structure) + Phase 2 (content × N + gamification + evaluation)
 * y devuelve el LessonProgram ensamblado.
 */
export const delegarEnjambreTool: Tool = {
  name: 'delegar_a_enjambre',
  description: 'Delega la generación de la lección al enjambre de 16 agentes especializados. Ejecuta todos los workers en paralelo (Phase 1: análisis, Phase 2: contenido + gamificación + evaluación) y devuelve el programa ensamblado.',
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
    },
    required: ['alumnoId', 'meta', 'perfil', 'sessionId'],
  },

  execute: async (params: Record<string, unknown>): Promise<{ ok: boolean; output: { success: boolean; nodesGenerated: number; message: string } | { error: string } }> => {
    const { alumnoId, meta, perfil, sessionId } = params as {
      alumnoId: string; meta: string; perfil: PerfilAdaptacion; sessionId: string
    }
    _lastResult = null

    try {
      const executor = new HiveLearnExecutor()
      const dagInput = { alumnoId, meta, perfil, sessionId }

      // ── Phase 1: profile → intent → structure (secuencial) ──────────────
      log.info(`[delegar] Phase 1 start — alumnoId=${alumnoId}`)
      const baseGraph = buildBaseDAG(dagInput)
      const schedulerBase = new DAGScheduler({
        maxConcurrentWorkers: 1,
        silent: false,
        executor,
        coordinatorId: AGENT_IDS.coordinator,
      })

      const baseResult = await schedulerBase.execute(baseGraph)
      log.info(`[delegar] Phase 1 done — ${baseResult.completed.length} completed, ${baseResult.failed.length} failed`)

      const structureNode = baseResult.completed.find(n => n.id === 'structure')
      let nodosBase: NodoLesson[] = []

      if (structureNode?.result) {
        const rawNodos = buildNodosBase(structureNode.result, perfil)
        nodosBase = rawNodos.map((n, idx) => ({
          ...n,
          posX: 100 + idx * 300,
          posY: 100 + (idx % 2) * 180,
        }))
        log.info(`[delegar] StructureAgent generated ${nodosBase.length} nodes`)
      } else {
        log.warn(`[delegar] StructureAgent returned no result — Phase 2 will have no content tasks`)
      }

      // ── Phase 2: content × nodosBase + gamification + evaluation (paralelo) ──
      log.info(`[delegar] Phase 2 start — ${nodosBase.length} content nodes`)
      const fullGraph = buildFullDAG(dagInput, nodosBase)
      const schedulerFull = new DAGScheduler({
        maxConcurrentWorkers: MAX_WORKERS,
        silent: false,
        executor,
        coordinatorId: AGENT_IDS.coordinator,
      })

      const fullResult = await schedulerFull.execute(fullGraph)
      log.info(`[delegar] Phase 2 done — ${fullResult.completed.length} completed, ${fullResult.failed.length} failed`)

      // ── Merge results ────────────────────────────────────────────────────
      const mergedResult: DAGResult = {
        ...fullResult,
        completed: [...baseResult.completed, ...fullResult.completed],
        failed:    [...(baseResult.failed ?? []), ...(fullResult.failed ?? [])],
      }

      const program = buildLessonProgram({ dagResult: mergedResult, alumnoId, meta, sessionId, perfil })

      // Build rawOutputs map for coordinator review
      const rawOutputs = new Map<string, string>()
      for (const n of [...mergedResult.completed, ...(mergedResult.failed ?? [])]) {
        if (n.result) rawOutputs.set(n.id, n.result)
      }

      // Capture for HiveLearnSwarm.run() to use
      _lastResult = { program, mergedDagResult: mergedResult, rawOutputs, executor }

      const msg = `${program.nodos.length} nodos generados (${fullResult.completed.length + baseResult.completed.length} agentes completados).`
      log.info(`[delegar] ${msg}`)

      return { ok: true, output: { success: true, nodesGenerated: program.nodos.length, message: msg } }
    } catch (err) {
      const message = (err as Error).message
      log.error(`[delegar] error: ${message}`)
      return { ok: false, output: { error: message } }
    }
  },
}
