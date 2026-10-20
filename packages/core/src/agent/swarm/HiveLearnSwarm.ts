/**
 * HiveLearnSwarm — punto de entrada al enjambre.
 * El coordinador LLM planifica el blueprint del programa y luego despacha
 * solo los workers necesarios para contenido, práctica, assessment, imagen,
 * audio, infografía y gamificación.
 */
import { runHiveLearnAgent } from '../runner'
import { runContextFromProfile, type RunContext } from '../policy/age-policy'
import { curriculumRoute, validateCurricularBlueprint } from '../../institutional/curriculum'
import { Learning } from '../../institutional/learning'
import { getDb } from '../../storage/hivedb'
import { AGENT_IDS } from '../registry'
import { AGENT_PROMPTS } from '../prompts'
import { parseAgentOutput } from '../orchestrator'
import { LessonPersistence } from '../../storage/LessonPersistence'
import { logger } from '../../utils/logger'
import { hlSwarmEmitter } from '../../events/swarm-events'
import type { StudentProfile, PerfilAdaptacion, LessonProgram, SwarmProgress } from '../../types'
import { runWorkPlan, type DelegationResult, type JobSummary } from './jobs'
import { buildWorkPlan } from './work-plan'
import { buildLessonProgram, buildNodosBase } from '../orchestrator'
import { evaluateProgramSafety, summarizeReport } from '../../safety/content-safety'
import { dossierToText, type Dossier } from '../../research/dossier'
import { routeFor, routeForDef, validateBlueprintFor, type CurriculumDef } from '../../institutional/curriculum-def'
import { CurriculumProgressStore } from '../../institutional/curriculum-progress'
import { AgentExecutionError } from '../errors'
import { prepareDelegation } from './coordinator-delegation'
import {
  createGenerationRun,
  saveRunBlueprint,
  saveRunCurriculum,
  heartbeatRun,
  completeGenerationRun,
  failGenerationRun,
  getGenerationRun,
} from '../run-store'
import { actualizarPromptAgenteTool, buscarEnHiveLearnTool, planificarProgramaTool, repararNodoCompletoTool, revisarProgramaTool } from '../../tools'

/** Heartbeat del lease del run de generación (patrón Hive run-store) */
const RUN_HEARTBEAT_MS = 15_000

const log = logger.child('hl-swarm')

function normalizeRuntimeVisualType(tipoVisual: LessonProgram['nodos'][number]['tipoVisual']): LessonProgram['nodos'][number]['tipoVisual'] {
  switch (tipoVisual) {
    case 'svg_diagram':
    case 'gif_guide':
    case 'code_block':
    case 'chart':
    case 'animated_card':
      return 'image_ai'
    default:
      return tipoVisual
  }
}

const ALLOWED_VISUALS = new Set(['text_card', 'image_ai', 'infographic', 'audio_ai'])

/**
 * Un nodo nunca promete un apoyo visual que no tiene: si el tipo no es del pipeline o falta su asset, queda
 * como tarjeta de texto (la explicación/ejercicio siempre está). Evita tipos inventados por el modelo
 * ("interactive_diagram") y visuales cuyo trabajo falló.
 */
export function sanitizeVisuals<T extends Pick<LessonProgram['nodos'][number], 'tipoVisual' | 'contenido'>>(nodos: T[]): T[] {
  return nodos.map(node => {
    const c = node.contenido ?? {}
    const has =
      node.tipoVisual === 'text_card' ||
      (node.tipoVisual === 'infographic' && Array.isArray(c.infografia?.secciones) && c.infografia.secciones.length > 0) ||
      (node.tipoVisual === 'image_ai' && !!(c.imagen?.prompt?.trim() || c.imagen?.svg_fallback?.trim())) ||
      (node.tipoVisual === 'audio_ai' && !!c.audio?.narration_text?.trim())
    return ALLOWED_VISUALS.has(node.tipoVisual) && has ? node : { ...node, tipoVisual: 'text_card' as T['tipoVisual'] }
  })
}

function normalizeNodeForRuntime(node: LessonProgram['nodos'][number]): LessonProgram['nodos'][number] {
  const tipoVisual = normalizeRuntimeVisualType(node.tipoVisual)
  const contenido = { ...(node.contenido ?? {}) }

  if (
    node.tipoPedagogico === 'quiz' &&
    !contenido.quiz &&
    Array.isArray(contenido.evaluacion?.preguntas) &&
    contenido.evaluacion.preguntas.length > 0
  ) {
    const first = contenido.evaluacion.preguntas[0]
    if (first && typeof first.pregunta === 'string' && Array.isArray(first.opciones) && first.opciones.length > 0) {
      contenido.quiz = {
        pregunta: first.pregunta,
        opciones: first.opciones,
        indicesCorrecto: typeof first.indiceCorrecto === 'number' ? first.indiceCorrecto : 0,
        explicacionesIncorrectas: [],
      }
    }
  }

  if (tipoVisual === 'image_ai' && !contenido.imagen) {
    if (typeof contenido.svg?.svgString === 'string' && contenido.svg.svgString.trim().length > 0) {
      contenido.imagen = {
        prompt: `Ilustración educativa simple sobre ${node.concepto || node.titulo}`,
        estilo: 'diagram',
        alt_text: node.titulo,
        caption: node.titulo,
        svg_fallback: contenido.svg.svgString,
      }
    } else if (Array.isArray(contenido.gifFrames?.frames) && contenido.gifFrames.frames.length > 0) {
      contenido.imagen = {
        prompt: `Secuencia visual educativa sobre ${node.concepto || node.titulo}`,
        estilo: 'illustration',
        alt_text: node.titulo,
        caption: node.titulo,
        svg_fallback: '',
      }
    } else if (typeof contenido.codigo?.codigo === 'string' && contenido.codigo.codigo.trim().length > 0) {
      contenido.imagen = {
        prompt: `Diagrama visual sencillo para explicar ${node.concepto || node.titulo}`,
        estilo: 'diagram',
        alt_text: node.titulo,
        caption: node.titulo,
        svg_fallback: '',
      }
    }
  }

  return {
    ...node,
    tipoVisual,
    contenido,
  }
}

export type ProgressCallback = (progress: SwarmProgress) => void

export class HiveLearnSwarm {
  private onProgress?: ProgressCallback
  private currentSessionId: string | null = null

  constructor(opts?: { onProgress?: ProgressCallback }) {
    this.onProgress = opts?.onProgress
  }

  private emit(etapa: string, agenteActivo: string, porcentaje: number, mensaje: string) {
    const progress: SwarmProgress = { etapa, agenteActivo, porcentaje, mensaje }
    this.onProgress?.(progress)
    hlSwarmEmitter.emit('swarm:progress', {
      ...progress,
      sessionId: this.currentSessionId,
    })
  }

  /** Quién ejecuta esta generación (edad del alumno): condiciona proveedores y oráculo. Una instancia = una generación. */
  private runContext: RunContext = runContextFromProfile(null)

  /** Dossier de investigación de esta generación, si lo hay. */
  private dossier: Dossier | null = null
  /** Currículo de un tema distinto de IA. Sin él, la ruta es la del currículo canónico de IA. */
  private curriculumDef: CurriculumDef | null = null

  async run(perfil: StudentProfile, meta: string, opts?: { resumeSessionId?: string; dossier?: Dossier; curriculum?: CurriculumDef }): Promise<LessonProgram> {
    this.runContext = runContextFromProfile(perfil)
    this.dossier = opts?.dossier ?? null
    this.curriculumDef = opts?.curriculum ?? null
    // ── Run durable: reanudar uno existente o crear uno nuevo ────────────
    const existingRun = opts?.resumeSessionId ? await getGenerationRun(opts.resumeSessionId) : null

    const ts = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)
    const nombreSlug = perfil.nombre.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20)
    const sessionId = existingRun?.sessionId ?? `${nombreSlug}_${ts}`
    this.currentSessionId = sessionId

    if (!existingRun) {
      await createGenerationRun(sessionId, perfil, meta)
    }
    // Heartbeat del lease mientras dure la generación (si el proceso muere,
    // el lease expira y reconcileGenerationRuns() marca el run como interrupted)
    const heartbeat = setInterval(() => {
      heartbeatRun(sessionId).catch(() => { /* non-critical */ })
    }, RUN_HEARTBEAT_MS)

    try {
      return await this.runGeneration(perfil, meta, sessionId, existingRun?.blueprint_json ?? null)
    } catch (err) {
      await failGenerationRun(sessionId, (err as Error).message).catch(() => { /* non-critical */ })
      throw err
    } finally {
      clearInterval(heartbeat)
    }
  }

  /** Mismo contrato para el currículo de IA y para cualquier otro: ids del currículo y prerrequisitos cumplidos. */
  private validateBlueprint(blueprint: unknown, route: ReturnType<typeof curriculumRoute>): void {
    if (this.curriculumDef) validateBlueprintFor(blueprint, route as unknown as ReturnType<typeof routeFor>)
    else validateCurricularBlueprint(blueprint, route)
  }

  private async runGeneration(
    perfil: StudentProfile,
    meta: string,
    sessionId: string,
    resumedBlueprintJson: string | null,
  ): Promise<LessonProgram> {

    const learningRecord = await new Learning(getDb()).record(perfil.alumnoId)
    const run = await getGenerationRun(sessionId)
    let curriculum: ReturnType<typeof curriculumRoute>
    if (run?.curriculum_json) {
      curriculum = JSON.parse(run.curriculum_json) as ReturnType<typeof curriculumRoute>
    } else if (this.curriculumDef) {
      // Tema distinto de IA: la ruta sale de su definición y de su propio registro de progreso.
      const progress = await new CurriculumProgressStore(getDb()).record(perfil.alumnoId, this.curriculumDef)
      curriculum = routeForDef(this.curriculumDef, perfil.edad, progress?.level ?? this.curriculumDef.levels[0], progress?.mastered ?? []) as unknown as ReturnType<typeof curriculumRoute>
    } else {
      curriculum = curriculumRoute(perfil.edad, learningRecord?.level ?? 'fundamentos', learningRecord?.mastered ?? [])
    }
    await saveRunCurriculum(sessionId, JSON.stringify(curriculum))

    const perfilAdaptacion: PerfilAdaptacion = {
      rangoEdad:         perfil.rangoEdad,
      duracionSesion:    perfil.tiempoSesion,
      nodosRecomendados: this.calcNodos(perfil),
      estilo:            perfil.estilo,
      nivelPrevio:       perfil.nivelPrevio,
      tono:              this.calcTono(perfil),
    }

    this.emit('init', 'HiveLearnCoordinator', 3, 'Coordinador recibiendo perfil del alumno...')
    hlSwarmEmitter.emit('coordinator:phase_changed', {
      sessionId,
      status: 'analyzing',
      phase: 'init',
      label: 'Coordinador analizando perfil y meta de aprendizaje',
      progress: 3,
      timestamp: Date.now(),
    })

    const persistence = new LessonPersistence()

    // ── Instrucción para el coordinador LLM ─────────────────────────────
    const now = new Date()
    const taskDescription = [
      `Eres el coordinador del enjambre HiveLearn. Tu tarea: generar una lección personalizada.`,
      ``,
      `FECHA Y HORA ACTUAL: ${now.toISOString()} (${now.toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: true })})`,
      ``,
      `PERFIL DEL ALUMNO:`,
      `CURRÍCULO FIJADO PARA ESTA EJECUCIÓN: ${JSON.stringify(curriculum)}`,
      'Incluye curriculumVersion y competencyId en cada actividad. Solo usa competencias available o mastered. No declares dominio sin evidencia validada. No añadas XP ni premios.',
      `- alumnoId: "${perfil.alumnoId}"`,
      `- nombre: ${perfil.nombre}`,
      `- rangoEdad: ${perfilAdaptacion.rangoEdad}`,
      `- nivelPrevio: ${perfilAdaptacion.nivelPrevio}`,
      `- duracionSesion: ${perfilAdaptacion.duracionSesion} minutos`,
      `- nodosRecomendados: ${perfilAdaptacion.nodosRecomendados}`,
      `- estilo: ${perfilAdaptacion.estilo}`,
      `- tono: ${perfilAdaptacion.tono}`,
      ``,
      `META DE APRENDIZAJE: "${meta}"`,
      `SESSION_ID: "${sessionId}"`,
      ``,
      `ACCIÓN REQUERIDA:`,
      `Llama AHORA a la herramienta planificar_programa.`,
      `WORKERS DISPONIBLES EN ESTE SWARM:`,
      `- ExplanationAgent: contenido conceptual y milestone`,
      `- ExerciseAgent: práctica guiada`,
      `- EvaluationAgent: quiz por nodo y evaluación final`,
      `- ImageAgent: único worker visual general`,
      `- InfographicAgent: resúmenes visuales`,
      `- AudioAgent: narración`,
      ``,
      `Debes producir un blueprint con ${perfilAdaptacion.nodosRecomendados} nodos usando SOLO estos tipos pedagógicos: concept | exercise | quiz | milestone.`,
      `NO uses challenge ni code como tipoPedagogico. Evita evaluation como nodo normal; la evaluación final se genera aparte.`,
      `tipoVisual permitidos: text_card | image_ai | infographic | audio_ai.`,
      `NO uses code_block, svg_diagram ni gif_guide en este pipeline.`,
      `Para rangoEdad = ${perfilAdaptacion.rangoEdad}, selecciona tipos visuales simples y apropiados.`,
    ].join('\n')

    let structureResult: string

    if (resumedBlueprintJson) {
      // ── Reanudación: blueprint ya checkpointeado, saltar Tier 0 ────────
      log.info(`[coordinator-flow] resuming run ${sessionId} from blueprint checkpoint`)
      structureResult = resumedBlueprintJson
    } else {
      this.emit('tier0', 'HiveLearnCoordinator', 8, 'Coordinador planificando la estructura del programa...')
      hlSwarmEmitter.emit('coordinator:phase_changed', {
        sessionId,
        status: 'delegating',
        phase: 'tier0',
        label: 'Coordinador planificando el programa base',
        progress: 8,
        timestamp: Date.now(),
      })

      // El blueprint se valida contra el currículo; si el modelo se sale (competencia inexistente, prerrequisitos
      // pendientes), se le devuelve el motivo y las competencias permitidas para que lo corrija. Máx. 3 intentos.
      const allowed = (curriculum.nodes as Array<{ id: string; status: string }>).filter(n => n.status !== 'pending').map(n => n.id)
      let feedback = ''
      let lastError: Error | null = null
      let planned: string | null = null
      for (let attempt = 1; attempt <= 3 && planned === null; attempt++) {
        const planningRaw = await runHiveLearnAgent({
          agentId: AGENT_IDS.coordinator,
          taskDescription: taskDescription + feedback,
          systemPrompt: AGENT_PROMPTS[AGENT_IDS.coordinator] ?? '',
          tools: [planificarProgramaTool],
          threadId: sessionId,
          runContext: this.runContext,
          maxTokens: 6144,
        })

        const blueprint = parseAgentOutput<{ tema?: string; topic_slug?: string | null; curriculumVersion?: string; nodos?: unknown[] }>(planningRaw, {})
        if (!Array.isArray(blueprint.nodos) || blueprint.nodos.length === 0) {
          lastError = new Error('El coordinador no pudo planificar un blueprint válido del programa')
          feedback = '\n\nTu respuesta anterior no incluyó nodos. Llama planificar_programa con la lista completa de nodos.'
          continue
        }
        const candidate = JSON.stringify({
          curriculumVersion: blueprint.curriculumVersion,
          tema: blueprint.tema ?? meta,
          topic_slug: blueprint.topic_slug ?? null,
          nodos: blueprint.nodos,
        })
        try {
          this.validateBlueprint(JSON.parse(candidate), curriculum)
          planned = candidate
        } catch (error) {
          lastError = error as Error
          log.warn(`[coordinator-flow] blueprint rechazado (intento ${attempt}/3): ${lastError.message}`)
          feedback = `\n\nTU BLUEPRINT ANTERIOR FUE RECHAZADO: ${lastError.message}. Usa en "competencyId" SOLO uno de estos identificadores: ${allowed.join(', ')}; y "curriculumVersion" debe ser exactamente "${curriculum.version}". Cada nodo "id" debe ser único.`
        }
      }
      if (planned === null) throw lastError ?? new Error('El coordinador no pudo planificar un blueprint válido del programa')
      structureResult = planned

      // Checkpoint del blueprint: si el proceso muere durante la generación,
      // la reanudación no repite la planificación
      await saveRunBlueprint(sessionId, structureResult)
    }

    this.validateBlueprint(JSON.parse(structureResult), curriculum)
    const nodosBase = buildNodosBase(structureResult, perfilAdaptacion)

    // Outputs de nodos ya generados en un run anterior (reanudación):
    // el executor los reutiliza en lugar de volver a llamar al LLM
    let priorOutputs: Map<string, string> | undefined
    if (resumedBlueprintJson) {
      priorOutputs = new Map()
      try {
        for (const out of await persistence.getAgentOutputs(sessionId)) {
          if (out.status === 'ok' && out.output_json) priorOutputs.set(out.task_id, out.output_json)
        }
        log.info(`[coordinator-flow] resume: ${priorOutputs.size} outputs de nodos reutilizados`)
      } catch { /* non-critical */ }
    }
    // El coordinador reparte el trabajo con ayuda de Kev (agente visual, skills y longitud por nodo).
    const { executor } = await prepareDelegation({
      runContext: this.runContext,
      objective: meta,
      nodos: nodosBase,
      priorOutputs,
      dossierText: this.dossier ? dossierToText(this.dossier) : undefined,
    })

    this.emit('tier1', 'HiveLearnCoordinator', 15, `Coordinador despachando ${nodosBase.length} nodos al enjambre reducido...`)
    hlSwarmEmitter.emit('coordinator:phase_changed', {
      sessionId,
      status: 'delegating',
      phase: 'tier1',
      label: `Coordinador despachando ${nodosBase.length} nodos al enjambre reducido`,
      progress: 15,
      timestamp: Date.now(),
    })

    // Reparto por rondas (sin grafo): nodos en paralelo y, con sus resultados, la evaluación final.
    const workInput = { alumnoId: perfil.alumnoId, meta, perfil: perfilAdaptacion, sessionId }
    const workPlan = buildWorkPlan(workInput, nodosBase)
    const roundOptions = {
      executor,
      concurrency: Number(process.env.HIVELEARN_MAX_CONCURRENT_WORKERS ?? 2),
      sessionId,
      coordinatorId: AGENT_IDS.coordinator,
    }
    const fullResult = await runWorkPlan(workPlan, roundOptions)

    log.info(`[coordinator-flow] reduced swarm finished. ${fullResult.completed.length} completed, ${fullResult.failed.length} failed`)

    const syntheticStructureNode: JobSummary = {
      id: 'structure',
      name: 'CoordinatorBlueprint',
      status: 'COMPLETED',
      durationMs: 0,
      result: structureResult,
      retries: 0,
    }

    const delegated: DelegationResult = {
      ...fullResult,
      completed: [syntheticStructureNode, ...fullResult.completed],
      failed: [...(fullResult.failed ?? [])],
      success: fullResult.success,
    }

    const rawOutputs = new Map<string, string>([['structure', structureResult]])
    for (const n of [...delegated.completed, ...(delegated.failed ?? [])]) {
      if (n.result) rawOutputs.set(n.id, n.result)
    }

    const program = buildLessonProgram({ delegation: delegated, alumnoId: perfil.alumnoId, meta, sessionId, perfil: perfilAdaptacion })
    await this.updateFailedWorkerPrompts(meta, sessionId, delegated.failed ?? [])
    const repairedProgram = await this.repairIncompleteNodes(program, meta, sessionId, rawOutputs)
    log.info(`[coordinator-flow] program assembled: ${repairedProgram.nodos.length} nodes, sessionId=${sessionId}`)

    // Guardar outputs de agentes en la BD para trazabilidad
    for (const [agentId, output] of rawOutputs.entries()) {
      await persistence.saveAgentOutput(sessionId, agentId, `task-${agentId}`, output, 0, 'ok')
    }

    this.emit('review', 'Coordinator', 93, 'Coordinador revisando coherencia pedagógica...')
    hlSwarmEmitter.emit('program:review_started', {
      sessionId,
      status: 'assembling',
      phase: 'review',
      label: 'Coordinador revisando coherencia pedagógica',
      progress: 93,
      timestamp: Date.now(),
    })

    let reviewed = await this.runCoordinatorReview(repairedProgram, meta, sessionId, rawOutputs, delegated)

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

    reviewed = { ...reviewed, nodos: sanitizeVisuals(reviewed.nodos) }

    // Puerta de seguridad ejecutable: un veto impide entregar el programa.
    const safety = evaluateProgramSafety(reviewed, {
      ageBand: this.runContext.ageBand,
      allowedUrls: this.dossier?.sources.map(source => source.url),
      validClaimIds: this.dossier?.claims.map(claim => claim.id),
    })
    if (safety.state === 'veto') {
      throw new AgentExecutionError('safety_veto', `Contenido bloqueado por la puerta de seguridad: ${summarizeReport(safety)}`)
    }
    if (safety.state === 'review') {
      log.warn(`[safety] programa ${sessionId} requiere revisión docente: ${summarizeReport(safety)}`)
      reviewed = { ...reviewed, seguridad: { estado: 'review', hallazgos: safety.findings.map(({ code, where, detail }) => ({ code, where, detail })) } }
    }

    this.emit('complete', 'HiveLearn', 100, '¡Tu lección está lista! 🐝')
    hlSwarmEmitter.emit('program:review_completed', {
      sessionId,
      status: 'completed',
      phase: 'complete',
      label: 'Programa educativo listo',
      progress: 100,
      timestamp: Date.now(),
    })
    await completeGenerationRun(sessionId).catch(() => { /* non-critical */ })
    return reviewed
  }

  private isNodeComplete(node: LessonProgram['nodos'][number]): boolean {
    const normalizedNode = normalizeNodeForRuntime(node)
    const content = normalizedNode.contenido ?? {}
    const hasPedagogicalContent =
      (normalizedNode.tipoPedagogico === 'concept' && !!content.explicacion?.explicacion?.trim()) ||
      (normalizedNode.tipoPedagogico === 'exercise' && !!content.ejercicio?.enunciado?.trim() && !!content.ejercicio?.respuestaCorrecta?.trim()) ||
      (normalizedNode.tipoPedagogico === 'quiz' && !!content.quiz?.pregunta?.trim() && Array.isArray(content.quiz?.opciones) && content.quiz.opciones.length > 0) ||
      normalizedNode.tipoPedagogico === 'milestone'

    const hasVisualContent =
      normalizedNode.tipoVisual === 'text_card' ||
      (normalizedNode.tipoVisual === 'infographic' && Array.isArray(content.infografia?.secciones) && content.infografia.secciones.length > 0) ||
      (normalizedNode.tipoVisual === 'image_ai' && !!content.imagen?.prompt?.trim()) ||
      (normalizedNode.tipoVisual === 'audio_ai' && !!content.audio?.narration_text?.trim())

    return hasPedagogicalContent && hasVisualContent
  }

  private async repairIncompleteNodes(
    program: LessonProgram,
    meta: string,
    sessionId: string,
    rawOutputs: Map<string, string>,
  ): Promise<LessonProgram> {
    const incompleteNodes = program.nodos.filter((node) => !this.isNodeComplete(node))
    if (incompleteNodes.length === 0) return program

    this.emit('repair', 'Coordinator', 88, `Coordinador reparando ${incompleteNodes.length} nodo(s) incompletos...`)
    hlSwarmEmitter.emit('node:repair_started', {
      sessionId,
      status: 'assembling',
      phase: 'repair',
      label: `Coordinador reparando ${incompleteNodes.length} nodo(s) incompletos`,
      progress: 88,
      timestamp: Date.now(),
      metadata: { totalNodes: incompleteNodes.length },
    })

    const repairedNodes = [...program.nodos]
    const dropped = new Set<string>()
    for (const node of incompleteNodes) {
      try {
      const rawSummary = [...rawOutputs.entries()]
        .filter(([key]) => key.endsWith(node.id) || key === 'structure')
        .map(([key, value]) => `${key}: ${value.slice(0, 300)}`)
        .join('\n')

      const taskDescription = `Repara el nodo completo de HiveLearn para la meta "${meta}".

SESSION_ID: "${sessionId}"
NODO ACTUAL:
${JSON.stringify({
  id: node.id,
  titulo: node.titulo,
  concepto: node.concepto,
  tipoPedagogico: node.tipoPedagogico,
  tipoVisual: node.tipoVisual,
  xpRecompensa: node.xpRecompensa,
  rangoEdad: node.rangoEdad,
  nivel: node.nivel,
  contenidoActual: node.contenido ?? {},
}, null, 2)}

FALLOS DETECTADOS:
- El nodo está incompleto o incompatible con el renderer.
- Debes rehacer el nodo completo, no solo una pieza.

OUTPUTS PREVIOS:
${rawSummary || 'Sin outputs útiles previos.'}

Si necesitas contexto adicional, usa buscar_en_hivelearn.
Cuando tengas el nodo correcto, llama reparar_nodo_completo con contenido completo y nombres camelCase esperados por HiveLearn.
En este pipeline solo se permiten tipoVisual: text_card | image_ai | infographic | audio_ai.
No devuelvas svg_diagram, gif_guide, code_block, chart ni animated_card.`

      const raw = await runHiveLearnAgent({
        agentId: AGENT_IDS.coordinator,
        taskDescription,
        systemPrompt: AGENT_PROMPTS[AGENT_IDS.coordinator] ?? '',
        tools: [buscarEnHiveLearnTool, repararNodoCompletoTool],
        threadId: `${sessionId}-repair-${node.id}`,
        runContext: this.runContext,
      })

      const repaired = parseAgentOutput<{
        nodeId: string
        titulo: string
        concepto: string
        tipoPedagogico: LessonProgram['nodos'][number]['tipoPedagogico']
        tipoVisual: LessonProgram['nodos'][number]['tipoVisual']
        xpRecompensa: number
        contenido: LessonProgram['nodos'][number]['contenido']
      }>(raw, {} as any)

      const idx = repairedNodes.findIndex((candidate) => candidate.id === node.id)
      if (idx === -1 || !repaired?.contenido) {
        throw new Error(`El coordinador no pudo reparar el nodo ${node.id}`)
      }

      repairedNodes[idx] = normalizeNodeForRuntime({
        ...repairedNodes[idx],
        titulo: repaired.titulo ?? repairedNodes[idx].titulo,
        concepto: repaired.concepto ?? repairedNodes[idx].concepto,
        tipoPedagogico: repaired.tipoPedagogico ?? repairedNodes[idx].tipoPedagogico,
        tipoVisual: repaired.tipoVisual ?? repairedNodes[idx].tipoVisual,
        xpRecompensa: repaired.xpRecompensa ?? repairedNodes[idx].xpRecompensa,
        contenido: repaired.contenido,
      })

      if (!this.isNodeComplete(repairedNodes[idx])) {
        throw new Error(`El nodo ${node.id} sigue incompleto después de la reparación del coordinador`)
      }

      hlSwarmEmitter.emit('node:repair_completed', {
        sessionId,
        status: 'completed',
        phase: 'repair',
        nodeId: node.id,
        label: `Nodo ${node.id} reparado por el coordinador`,
        progress: 90,
        timestamp: Date.now(),
      })
      } catch (error) {
        // Un nodo irrecuperable no tumba la generación completa: se retira y el resto se entrega.
        dropped.add(node.id)
        log.warn(`[coordinator-flow] nodo ${node.id} descartado tras fallar su reparación: ${(error as Error).message}`)
      }
    }

    if (dropped.size === 0) return { ...program, nodos: repairedNodes }
    const kept = repairedNodes.filter(n => !dropped.has(n.id))
    const minimum = Math.max(2, Math.ceil(program.nodos.length * 0.6))
    if (kept.length < minimum) {
      throw new Error(`Quedaron ${kept.length} de ${program.nodos.length} nodos tras descartar los irreparables (mínimo ${minimum})`)
    }
    // El XP total vuelve a sumar 100 entre los nodos que se entregan.
    const total = kept.reduce((sum, n) => sum + (n.xpRecompensa ?? 0), 0)
    const rescaled = total > 0 ? kept.map(n => ({ ...n, xpRecompensa: Math.max(1, Math.round((n.xpRecompensa ?? 0) * 100 / total)) })) : kept
    return { ...program, nodos: rescaled }
  }

  private inferAgentIdFromFailure(taskId: string, name: string): string | null {
    if (taskId === 'gamification') return AGENT_IDS.gamification
    if (taskId === 'evaluation') return AGENT_IDS.evaluation
    if (name.startsWith('explanation:')) return AGENT_IDS.explanation
    if (name.startsWith('exercise:') || name.startsWith('challenge:')) return AGENT_IDS.exercise
    if (name.startsWith('quiz:')) return AGENT_IDS.evaluation
    if (name.startsWith('visual:')) return AGENT_IDS.image
    if (taskId.startsWith('content-')) return AGENT_IDS.explanation
    if (taskId.startsWith('visual-')) return AGENT_IDS.image
    return null
  }

  private async updateFailedWorkerPrompts(
    meta: string,
    sessionId: string,
    failed: Array<{ id: string; name: string; error?: string }>,
  ): Promise<void> {
    if (failed.length === 0) return

    const grouped = new Map<string, Array<{ id: string; name: string; error?: string }>>()
    for (const failure of failed) {
      const agentId = this.inferAgentIdFromFailure(failure.id, failure.name)
      if (!agentId || agentId === AGENT_IDS.coordinator) continue
      const list = grouped.get(agentId) ?? []
      list.push(failure)
      grouped.set(agentId, list)
    }
    if (grouped.size === 0) return

    hlSwarmEmitter.emit('coordinator:phase_changed', {
      sessionId,
      status: 'assembling',
      phase: 'prompt_patch',
      label: `Coordinador ajustando prompts de ${grouped.size} worker(s) fallidos`,
      progress: 86,
      timestamp: Date.now(),
    })

    const failuresText = [...grouped.entries()].map(([agentId, entries]) => {
      const detail = entries.map((entry) => `- task=${entry.id} name=${entry.name} error=${entry.error ?? 'sin detalle'}`).join('\n')
      return `AGENTE ${agentId}\n${detail}`
    }).join('\n\n')

    await runHiveLearnAgent({
      agentId: AGENT_IDS.coordinator,
      taskDescription: `Meta: "${meta}".
SESSION_ID: "${sessionId}".
Los siguientes workers fallaron. Debes actualizar el prompt patch del agente worker correspondiente para aumentar obediencia al contrato y corregir la causa del fallo.

Reglas:
- Modifica SOLO el worker que falló.
- El patch debe ser corto, concreto y accionable.
- Si el fallo es plain text en vez de tool call, refuerza SOLO tool call.
- Si el fallo es validation_failed, refuerza el contenido faltante.
- Si el fallo es malformed_function_call, simplifica la salida requerida y refuerza una sola tool.

FALLOS:
${failuresText}

Llama actualizar_prompt_agente una vez por cada worker fallido.`,
      systemPrompt: AGENT_PROMPTS[AGENT_IDS.coordinator] ?? '',
      tools: [actualizarPromptAgenteTool],
      threadId: `${sessionId}-prompt-patch`,
      runContext: this.runContext,
    })
  }

  /** El coordinador LLM revisa el LessonProgram y aplica correcciones + XP redistribuido. */
  private async runCoordinatorReview(
    program: LessonProgram,
    meta: string,
    sessionId: string,
    rawOutputs: Map<string, string>,
    _delegated: DelegationResult,
  ): Promise<LessonProgram> {
    try {
      const rawSummary = [...rawOutputs.entries()]
        .filter(([k]) => k === 'gamification' || k.startsWith('content-'))
        .map(([k, v]) => `${k}: ${v.slice(0, 200)}`)
        .join('\n')

      const taskDescription = `Revisa el siguiente LessonProgram generado por el enjambre para la meta: "${meta}"

${rawSummary ? `OUTPUTS DE AGENTES CLAVE (primeros 200 chars cada uno):\n${rawSummary}\n\n` : ''}LESSON PROGRAM:
${JSON.stringify({
  tema: program.tema,
  rangoEdad: program.rangoEdad,
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
        runContext: this.runContext,
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
      return this.runDeterministicReview(program)
    }
  }

  private runDeterministicReview(program: LessonProgram): LessonProgram {
    const correctedNodos = program.nodos.map((nodo) => {
      let xpRecompensa = Math.max(1, nodo.xpRecompensa ?? 1)
      if (nodo.tipoPedagogico === 'milestone') xpRecompensa = Math.max(5, xpRecompensa)
      return { ...nodo, xpRecompensa }
    })

    const xpSum = correctedNodos.reduce((sum, nodo) => sum + (nodo.xpRecompensa ?? 0), 0)
    let allocated = 0
    const normalized = correctedNodos.map((nodo, index) => {
      if (xpSum <= 0) {
        const even = index === correctedNodos.length - 1 ? 100 - allocated : Math.max(1, Math.floor(100 / correctedNodos.length))
        allocated += even
        return { ...nodo, xpRecompensa: even }
      }
      if (index === correctedNodos.length - 1) {
        return { ...nodo, xpRecompensa: Math.max(1, 100 - allocated) }
      }
      const nextXp = Math.max(1, Math.round(((nodo.xpRecompensa ?? 0) / xpSum) * 100))
      allocated += nextXp
      return { ...nodo, xpRecompensa: nextXp }
    })

    log.info('[coordinator] deterministic review fallback applied')
    return { ...program, nodos: normalized }
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

  private calcNodos(perfil: StudentProfile): number {
    const map = { nino: 5, adolescente: 8, adulto: 10 }
    return map[perfil.rangoEdad] ?? 8
  }

  private calcTono(perfil: StudentProfile): string {
    const map = { nino: 'amigable', adolescente: 'motivador', adulto: 'técnico' }
    return map[perfil.rangoEdad] ?? 'neutro'
  }
}
