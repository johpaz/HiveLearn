/**
 * HiveLearnSwarm — punto de entrada al enjambre.
 * El coordinador LLM es el driver: llama a delegar_a_enjambre (que ejecuta los 16 workers),
 * recibe el resultado, lo evalúa, y devuelve el LessonProgram final.
 */
import { runHiveLearnAgent } from '../runner'
import { AGENT_IDS } from '../registry'
import { AGENT_PROMPTS } from '../prompts'
import { delegarEnjambreTool, getLastDelegarResult } from '../../tools/coordinator/delegar-enjambre.tool'
import { parseAgentOutput } from '../orchestrator'
import { LessonPersistence } from '../../storage/LessonPersistence'
import { logger } from '../../utils/logger'
import { hlSwarmEmitter } from '../../events/swarm-events'
import type { StudentProfile, PerfilAdaptacion, LessonProgram, SwarmProgress } from '../../types'
import type { DAGResult } from '../scheduler/dag'

const log = logger.child('hl-swarm')

export type ProgressCallback = (progress: SwarmProgress) => void

export class HiveLearnSwarm {
  private onProgress?: ProgressCallback

  constructor(opts?: { onProgress?: ProgressCallback }) {
    this.onProgress = opts?.onProgress
  }

  private emit(etapa: string, agenteActivo: string, porcentaje: number, mensaje: string) {
    const progress: SwarmProgress = { etapa, agenteActivo, porcentaje, mensaje }
    this.onProgress?.(progress)
    hlSwarmEmitter.emit('swarm:progress', progress)
  }

  async run(perfil: StudentProfile, meta: string): Promise<LessonProgram> {
    const ts = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)
    const nicknameSlug = perfil.nickname.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20)
    const sessionId = `${nicknameSlug}_${ts}`

    const perfilAdaptacion: PerfilAdaptacion = {
      duracionSesion:    30,
      nodosRecomendados: 8,
      tono:              'amigable',
    }

    this.emit('init', 'HiveLearnCoordinator', 3, 'Coordinador recibiendo perfil del alumno...')

    // Consultar efectividad previa (non-critical)
    const persistence = new LessonPersistence()
    let efectividadCtx = ''
    try {
      const intentSlug = meta.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30)
      const efectividad = persistence.getTopicEffectiveness(intentSlug)
      if (efectividad.nodosConMasFallas.length > 0) {
        efectividadCtx = `\nDATOS PREVIOS sobre este tema: aprobación ${efectividad.nivelPromedioAprobacion}%. Nodos difíciles: ${efectividad.nodosConMasFallas.join(', ')}.`
      }
    } catch { /* non-critical */ }

    // ── Instrucción para el coordinador LLM ─────────────────────────────
    const now = new Date()
    const taskDescription = [
      `Eres el coordinador del enjambre HiveLearn. Tu tarea: generar una lección personalizada.`,
      ``,
      `FECHA Y HORA ACTUAL: ${now.toISOString()} (${now.toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: true })})`,
      ``,
      `PERFIL DEL ALUMNO:`,
      `- alumnoId: "${perfil.alumnoId}"`,
      `- nickname: ${perfil.nickname}`,
      `- duracionSesion: ${perfilAdaptacion.duracionSesion} minutos`,
      `- nodosRecomendados: ${perfilAdaptacion.nodosRecomendados}`,
      `- tono: ${perfilAdaptacion.tono}`,
      ``,
      `META DE APRENDIZAJE: "${meta}"${efectividadCtx}`,
      `SESSION_ID: "${sessionId}"`,
      ``,
      `ACCIÓN REQUERIDA:`,
      `Llama AHORA a la herramienta delegar_a_enjambre con estos parámetros exactos:`,
      `- alumnoId: "${perfil.alumnoId}"`,
      `- meta: "${meta}"`,
      `- sessionId: "${sessionId}"`,
      `- perfil: { duracionSesion: ${perfilAdaptacion.duracionSesion}, nodosRecomendados: ${perfilAdaptacion.nodosRecomendados}, tono: "${perfilAdaptacion.tono}" }`,
    ].join('\n')

    this.emit('tier0', 'HiveLearnCoordinator', 8, 'Coordinador delegando a los 16 agentes especializados...')

    // El coordinador LLM llama delegar_a_enjambre → workers ejecutan → capturamos el programa
    await runHiveLearnAgent({
      agentId: AGENT_IDS.coordinator,
      taskDescription,
      systemPrompt: AGENT_PROMPTS[AGENT_IDS.coordinator] ?? '',
      tools: [delegarEnjambreTool],  // solo la tool de delegación en el flujo principal
      threadId: sessionId,
    })

    // Recuperar el programa capturado dentro de la tool
    const captured = getLastDelegarResult()
    if (!captured || !captured.program) {
      throw new Error('El coordinador no pudo generar la lección: delegar_a_enjambre no se ejecutó correctamente')
    }

    const { program, mergedDagResult, rawOutputs } = captured

    log.info(`[coordinator-flow] program assembled: ${program.nodos.length} nodes, sessionId=${sessionId}`)

    // Guardar outputs de agentes en la BD para trazabilidad
    for (const [agentId, output] of rawOutputs.entries()) {
      persistence.saveAgentOutput(sessionId, agentId, `task-${agentId}`, output, 0, 'ok')
    }

    this.emit('review', 'Coordinator', 93, 'Coordinador revisando coherencia pedagógica...')

    let reviewed = await this.runCoordinatorReview(program, meta, sessionId, rawOutputs, mergedDagResult)

    // Hard-enforce XP total = 100 regardless of LLM output
    const xpSum = reviewed.nodos.reduce((s, n) => s + (n.xpRecompensa ?? 0), 0)
    if (xpSum > 0 && xpSum !== 100) {
      const factor = 100 / xpSum
      let allocated = 0
      reviewed = {
        ...reviewed,
        nodos: reviewed.nodos.map((n, i) => {
          if (i === reviewed.nodos.length - 1) {
            return { ...n, xpRecompensa: Math.max(1, 100 - allocated) }
          }
          const xp = Math.max(1, Math.round(n.xpRecompensa * factor))
          allocated += xp
          return { ...n, xpRecompensa: xp }
        }),
      }
      log.info(`[coordinator] XP normalized from ${xpSum} → 100`)
    }

    this.emit('complete', 'HiveLearn', 100, '¡Tu lección está lista! 🐝')
    return reviewed
  }

  /** El coordinador LLM revisa el LessonProgram y aplica correcciones + XP redistribuido. */
  private async runCoordinatorReview(
    program: LessonProgram,
    meta: string,
    sessionId: string,
    rawOutputs: Map<string, string>,
    _dagResult: DAGResult,
  ): Promise<LessonProgram> {
    try {
      const rawSummary = [...rawOutputs.entries()]
        .filter(([k]) => ['intent', 'profile', 'gamification'].includes(k) || k.startsWith('content-'))
        .map(([k, v]) => `${k}: ${v.slice(0, 200)}`)
        .join('\n')

      const taskDescription = `Revisa el siguiente LessonProgram generado por el enjambre para la meta: "${meta}"

${rawSummary ? `OUTPUTS DE AGENTES CLAVE (primeros 200 chars cada uno):\n${rawSummary}\n\n` : ''}LESSON PROGRAM:
${JSON.stringify({
  tema: program.tema,
  nodos: program.nodos.map(n => ({
    id: n.id,
    titulo: n.titulo,
    tipoPedagogico: n.tipoPedagogico,
    tipoVisual: n.tipoVisual,
    xpRecompensa: n.xpRecompensa,
    tieneContenido: Object.keys(n.contenido ?? {}).length > 0,
  })),
  totalNodos: program.nodos.length,
  gamificacion: program.gamificacion,
  evaluacion: { totalPreguntas: program.evaluacion?.preguntas?.length ?? 0 },
}, null, 2)}`

      const { revisarProgramaTool } = await import('../../tools/coordinator/revisar-programa.tool')
      const raw = await runHiveLearnAgent({
        agentId: AGENT_IDS.coordinator,
        taskDescription,
        systemPrompt: AGENT_PROMPTS[AGENT_IDS.coordinator] ?? '',
        tools: [revisarProgramaTool],
        threadId: sessionId,
      })

      const revision = parseAgentOutput<{
        aprobado?: boolean
        calidad?: number
        issues?: string[]
        correcciones?: Record<string, Partial<{ titulo: string; xpRecompensa: number; concepto: string }>>
        xpRedistribuido?: Record<string, number>
        mensaje?: string
      }>(raw, {})

      log.info(`[coordinator] calidad=${revision.calidad ?? '?'} aprobado=${revision.aprobado ?? '?'} mensaje="${revision.mensaje ?? ''}"`)
      if (revision.issues?.length) log.warn(`[coordinator] issues: ${revision.issues.join(' | ')}`)

      let finalProgram = this.applyCorrecciones(program, revision.correcciones)

      if (revision.xpRedistribuido && Object.keys(revision.xpRedistribuido).length > 0) {
        finalProgram = {
          ...finalProgram,
          nodos: finalProgram.nodos.map(nodo => {
            const xpNuevo = revision.xpRedistribuido![nodo.id]
            return xpNuevo !== undefined ? { ...nodo, xpRecompensa: xpNuevo } : nodo
          }),
        }
      }

      return finalProgram
    } catch (err) {
      log.warn(`[coordinator] review skipped: ${(err as Error).message}`)
      return program
    }
  }

  private applyCorrecciones(
    program: LessonProgram,
    correcciones?: Record<string, Partial<{ titulo: string; xpRecompensa: number; concepto: string }>>,
  ): LessonProgram {
    if (!correcciones || Object.keys(correcciones).length === 0) return program
    const correctedNodos = program.nodos.map(nodo => {
      const fix = correcciones[nodo.id]
      return fix ? { ...nodo, ...fix } : nodo
    })
    log.info(`[coordinator] applied corrections to ${Object.keys(correcciones).length} node(s)`)
    return { ...program, nodos: correctedNodos }
  }
}
