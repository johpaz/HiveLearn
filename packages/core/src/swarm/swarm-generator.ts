/**
 * Swarm Generator — Orquesta los 18 agentes workers y emite eventos al hlSwarmEmitter.
 * La cadena de eventos llega al SwarmWorld via WebSocket → useHiveLearnLive.
 */
import { hlSwarmEmitter } from '../events/swarm-events'
import { runHiveLearnAgent } from '../agent/runner'
import { AGENT_IDS } from '../agent/registry'
import { LessonPersistence } from '../storage/LessonPersistence'
import { logger } from '../utils/logger'
import type { StudentProfile } from '../types'

const log = logger.child('swarm-gen')

const WORKER_AGENTS: string[] = [
  AGENT_IDS.profile,
  AGENT_IDS.intent,
  AGENT_IDS.structure,
  AGENT_IDS.explanation,
  AGENT_IDS.exercise,
  AGENT_IDS.quiz,
  AGENT_IDS.challenge,
  AGENT_IDS.code,
  AGENT_IDS.svg,
  AGENT_IDS.gif,
  AGENT_IDS.infographic,
  AGENT_IDS.image,
  AGENT_IDS.audio,
  AGENT_IDS.gamification,
  AGENT_IDS.evaluation,
  AGENT_IDS.feedback,
  AGENT_IDS.monitor,
  AGENT_IDS.visionPedagogica,
]

function buildTaskDescription(agentId: string, perfil: StudentProfile, meta: string, structureCtx: string): string {
  const base = `Perfil: nombre=${perfil.nombre}, edad=${perfil.edad}.\nMeta: ${meta}`
  switch (agentId) {
    case AGENT_IDS.profile:
      return `${base}\nConstruye el perfil de adaptación pedagógica para este alumno.`
    case AGENT_IDS.intent:
      return `${base}\nExtrae tema, nivel previo y tono adecuado para la sesión.`
    case AGENT_IDS.structure:
      return `${base}\nDiseña la estructura del Mundo de Aprendizaje con 5-8 zonas en formato JSON.`
    case AGENT_IDS.gamification:
      return `${base}${structureCtx}\nDefine XP por zona, logros desbloqueables y nivel final.`
    case AGENT_IDS.evaluation:
      return `${base}${structureCtx}\nPrepara 5 preguntas de evaluación final sobre el tema.`
    case AGENT_IDS.feedback:
      return `${base}\nPrepara mensajes de feedback motivador para diferentes situaciones.`
    case AGENT_IDS.monitor:
      return `${base}\nConfigura el perfil de monitoreo de atención para este alumno.`
    case AGENT_IDS.visionPedagogica:
      return `${base}\nPrepara 3 preguntas visuales pedagógicas relacionadas con el tema.`
    default: {
      const type = agentId.replace('hl-', '').replace('-agent', '')
      return `${base}${structureCtx}\nPrepara contenido pedagógico de tipo "${type}" para el tema.`
    }
  }
}

export async function runSwarmGeneration(
  perfil: StudentProfile,
  meta: string,
  swarmId: string,
): Promise<void> {
  const total = WORKER_AGENTS.length
  let completed = 0
  let failed = 0
  const t0 = Date.now()

  log.info('[swarm-gen] Starting', { swarmId, total, alumno: perfil.nombre })
  hlSwarmEmitter.emit('swarm:started', { swarmId, totalTasks: total })

  // Crear sesión temprana para que los outputs de cada agente tengan dónde guardarse
  const persistence = new LessonPersistence()
  persistence.createEarlySession(swarmId, perfil.alumnoId)  // no-op si ya existe

  let structureCtx = ''
  let capturedStructureJson = '{}'
  let capturedTotalZonas = 0

  for (const agentId of WORKER_AGENTS) {
    hlSwarmEmitter.emit('worker:task_started', { workerId: agentId, workerName: agentId, swarmId })
    log.info(`[swarm-gen] → ${agentId}`)

    const t1 = Date.now()
    try {
      const output = await runHiveLearnAgent({
        agentId,
        taskDescription: buildTaskDescription(agentId, perfil, meta, structureCtx),
        systemPrompt: '',
        tools: [],
        threadId: swarmId,
      })

      const agentKey = agentId.replace('hl-', '').replace('-agent', '')
      persistence.saveAgentOutput(swarmId, agentId, agentId, JSON.stringify({ output }), Date.now() - t1)
      persistence.updateSessionAgentSlot(swarmId, agentKey, output)

      // After structure: persist curriculum and expose context to subsequent agents
      if (agentId === AGENT_IDS.structure) {
        try {
          const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/) || output.match(/\{[\s\S]*\}/)
          const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : output
          const estructura = JSON.parse(jsonStr)
          structureCtx = `\nEstructura del programa: ${jsonStr.slice(0, 400)}`

          const rangoEdad = perfil.edad <= 12 ? 'ninos' : perfil.edad <= 17 ? 'jovenes' : 'adulto'
          const curriculoId = persistence.saveCurriculum(
            swarmId,
            JSON.stringify(perfil),
            JSON.stringify(estructura.zonas ?? []),
            estructura.zonas?.length ?? 0,
            rangoEdad,
            null,
          )
          persistence.updateSessionCurriculum(swarmId, curriculoId)
          capturedStructureJson = jsonStr
          capturedTotalZonas = estructura.zonas?.length ?? 0
          log.info('[swarm-gen] Curriculum saved', { swarmId, zonas: estructura.zonas?.length })
        } catch (parseErr) {
          log.warn('[swarm-gen] Could not parse structure', { error: (parseErr as Error).message })
        }
      }

      completed++
      hlSwarmEmitter.emit('worker:task_completed', {
        workerId: agentId,
        workerName: agentId,
        swarmId,
        progress: completed / total,
      })
    } catch (e) {
      failed++
      persistence.saveAgentOutput(swarmId, agentId, agentId, JSON.stringify({ error: (e as Error).message }), Date.now() - t1, 'failed')
      log.error(`[swarm-gen] ${agentId} failed`, { error: (e as Error).message })
      hlSwarmEmitter.emit('worker:task_failed', {
        workerId: agentId,
        workerName: agentId,
        swarmId,
        error: (e as Error).message,
      })
    }
  }

  // Actualizar programa con la estructura final — fue creado en POST /session con schema vacío
  persistence.updateProgramSchema(swarmId, capturedStructureJson, capturedTotalZonas)
  log.info('[swarm-gen] Program schema updated', { swarmId, zonas: capturedTotalZonas })

  hlSwarmEmitter.emit('swarm:completed', {
    swarmId,
    success: failed === 0,
    completedCount: completed,
    failedCount: failed,
    totalDurationMs: Date.now() - t0,
  })

  log.info('[swarm-gen] Done', { swarmId, completed, failed, ms: Date.now() - t0 })
}
