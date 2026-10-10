/**
 * LessonDeliverySession — orquesta la entrega de una lección vía WebSocket.
 *
 * El coordinador LLM recibe el programa completo y va llamando enviar_interaccion
 * por cada paso. El alumno responde, y el coordinador evalúa y decide el siguiente paso.
 */
import { runHiveLearnAgent } from '../agent/runner'
import { runContextFromProfile } from '../agent/policy/age-policy'
import { rangoEdadForAge } from '../institutional/age'
import { getDb } from '../storage/hivedb'
import { buildBrief, getMemory, recordAttempt } from '../storage/student-memory'
import { AGENT_IDS } from '../agent/registry'
import { AGENT_PROMPTS } from '../agent/prompts'
import { LessonPersistence } from '../storage/LessonPersistence'
import { createEnviarInteraccionTool, resolveStudentAction, cancelPendingAction } from '../tools/coordinator/enviar-interaccion.tool'
import { createCompletarLeccionTool } from '../tools/coordinator/completar-leccion.tool'
import { createEvaluarRespuestaTool } from '../tools/coordinator/evaluar-respuesta.tool'
import { calificarRespuestaTool } from '../tools/evaluation/calificar-evaluacion.tool'
import type { StudentAction } from '../tools/coordinator/enviar-interaccion.tool'
import type { LeccionCompletada } from '../tools/coordinator/completar-leccion.tool'
import type { NodoLesson, StudentProfile, FeedbackOutput } from '../types'
import { logger } from '../utils/logger'

const log = logger.child('lesson-delivery')

export class LessonDeliverySession {
  private sessionId: string
  private send: (msg: object) => void
  private persistence: LessonPersistence
  private turnIndex = 0
  private active = false
  private xpAcumulado = 0

  constructor(sessionId: string, sendToClient: (msg: object) => void) {
    this.sessionId = sessionId
    this.send = sendToClient
    this.persistence = new LessonPersistence()
  }

  private async buildFinalFeedback(summary: LeccionCompletada): Promise<FeedbackOutput | null> {
    try {
      const full = await this.persistence.getSessionWithCurriculum(this.sessionId)
      if (!full) return null

      const nodos: NodoLesson[] = JSON.parse(full.nodosJson || '[]')
      const profile = await this.persistence.getStudentProfile(full.alumnoId)
      const interactions = await this.persistence.getInteractions(this.sessionId)
      const lastInteraction = [...interactions].reverse().find(i => i.sender === 'student')
      let studentAction: Record<string, unknown> | null = null
      if (lastInteraction?.action_json) {
        try {
          studentAction = JSON.parse(lastInteraction.action_json) as Record<string, unknown>
        } catch {
          studentAction = null
        }
      }

      const taskDescription = [
        `RETROALIMENTACIÓN FINAL DE LA LECCIÓN.`,
        `Debes entregar un cierre global, no evaluar una única respuesta aislada.`,
        ``,
        `ALUMNO:`,
        `- nombre: ${profile?.nombre ?? 'Alumno'}`,
        `- edad: ${profile?.edad ?? 'no declarada'}`,
        `- rango_edad: ${(profile as any)?.rangoEdad ?? rangoEdadForAge(profile?.edad)}`,
        `- estilo: ${(profile as any)?.estilo ?? 'balanceado'}`,
        ``,
        `RESUMEN DE SESIÓN:`,
        `- tema: ${full.metaAlumno}`,
        `- nodos_total: ${nodos.length}`,
        `- nodos_completados: ${summary.nodosCompletados}`,
        `- xp_total: ${summary.xpTotal}`,
        `- logros: ${(summary.logros ?? []).map(l => l.titulo).join(', ') || 'ninguno'}`,
        `- ultimo_paso: ${lastInteraction?.nodo_id ?? 'desconocido'}`,
        `- ultima_accion: ${studentAction?.name ?? 'desconocida'}`,
        ``,
        `TAREA:`,
        `Genera un feedback final breve y cálido del recorrido completo.`,
        `Resalta 1 o 2 fortalezas, 1 punto a reforzar y un cierre motivador.`,
        `No menciones "incorrecto" si la lección terminó correctamente.`,
        `Usa la tool calificar_respuesta con XP 0 y correcto=true para estructurar la salida.`,
        `El valor de correcto debe ser true porque la sesión ya fue completada.`,
      ].join('\n')

      const raw = await runHiveLearnAgent({
        agentId: AGENT_IDS.feedback,
        taskDescription,
        systemPrompt: AGENT_PROMPTS[AGENT_IDS.feedback] ?? '',
        tools: [calificarRespuestaTool],
        threadId: `hl-feedback-final-${this.sessionId}`,
        runContext: runContextFromProfile(profile ? { alumnoId: full.alumnoId, edad: profile.edad } : { alumnoId: full.alumnoId }),
      })

      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>
      } catch {
        const jsonStart = raw.indexOf('{')
        const jsonEnd = raw.lastIndexOf('}')
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          try {
            parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>
          } catch {
            parsed = {}
          }
        }
      }
      return {
        correcto: Boolean(parsed.correcto ?? true),
        mensajePrincipal: String(parsed.mensaje ?? parsed.mensajePrincipal ?? '¡Gran trabajo!'),
        pistaSiIncorrecto: typeof parsed.pista_si_incorrecto === 'string' ? parsed.pista_si_incorrecto : typeof parsed.pistaSiIncorrecto === 'string' ? parsed.pistaSiIncorrecto : undefined,
        xpGanado: Number(parsed.xp_ganado ?? parsed.xpGanado ?? 0),
        razonamiento: typeof parsed.razonamiento === 'string' ? parsed.razonamiento : undefined,
      }
    } catch (err) {
      log.warn(`[delivery] final feedback failed sessionId=${this.sessionId}: ${(err as Error).message}`)
      return null
    }
  }

  async start(): Promise<void> {
    if (this.active) return
    this.active = true

    try {
      log.info(`[delivery] start sessionId=${this.sessionId}`)

      // 1. Cargar programa y perfil desde BD
      const full = await this.persistence.getSessionWithCurriculum(this.sessionId)
      if (!full) {
        log.warn(`[delivery] session not found sessionId=${this.sessionId}`)
        this.send({ type: 'error', message: 'Sesión no encontrada' })
        return
      }

      const nodos: NodoLesson[] = JSON.parse(full.nodosJson || '[]')
      if (nodos.length === 0) {
        log.warn(`[delivery] empty curriculum sessionId=${this.sessionId}`)
        this.send({ type: 'error', message: 'El programa no tiene nodos' })
        return
      }

      const profile = await this.persistence.getStudentProfile(full.alumnoId)
      const interactions = await this.persistence.getInteractions(this.sessionId)
      this.turnIndex = await this.persistence.getNextTurnIndex(this.sessionId)
      log.info(
        `[delivery] loaded session=${this.sessionId} alumnoId=${full.alumnoId} curriculoId=${full.curriculoId} ` +
        `meta="${full.metaAlumno}" topicSlug="${full.topicSlug ?? 'null'}" nodos=${nodos.length} interactions=${interactions.length}`
      )
      log.info(
        `[delivery] first-node id=${nodos[0]?.id ?? 'none'} tipoPedagogico=${nodos[0]?.tipoPedagogico ?? 'none'} tipoVisual=${nodos[0]?.tipoVisual ?? 'none'}`
      )

      // 2. Construir historial de interacciones para el coordinador
      const historial = interactions.map(i => {
        if (i.sender === 'agent') {
          return `Turno ${i.turn_index} (AGENTE): envió nodo ${i.nodo_id ?? '?'}, XP disponible en ese paso.`
        } else {
          const action = i.action_json ? JSON.parse(i.action_json) : {}
          return `Turno ${i.turn_index} (ALUMNO): acción="${action.name}", respuesta="${action.context?.respuesta ?? action.context?.narration_text ?? '-'}", correcto=${i.correcto}`
        }
      }).join('\n')

      // 3. Construir task description para el coordinador en MODO ENTREGA
      const now = new Date()
      // Memoria del alumno: lo que ya domina, repasos pendientes y errores recurrentes. Solo contexto.
      const curriculumId = full.topicSlug ?? 'libre'
      let memoryBrief = ''
      try {
        memoryBrief = buildBrief(await getMemory(getDb(), full.alumnoId, curriculumId))
      } catch (err) {
        log.warn(`[delivery] memory unavailable sessionId=${this.sessionId}: ${(err as Error).message}`)
      }

      const taskDescription = [
        `MODO ENTREGA — Conduce esta lección de forma interactiva.`,
        ``,
        `FECHA Y HORA ACTUAL: ${now.toISOString()} (${now.toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: true })})`,
        ``,
        `PERFIL DEL ALUMNO:`,
        `- nombre: ${profile?.nombre ?? 'Alumno'}`,
        `- rangoEdad: ${(profile as any)?.rangoEdad ?? rangoEdadForAge(profile?.edad)}`,
        `- meta: "${full.metaAlumno}"`,
        `- sessionId: "${this.sessionId}"`,
        ``,
        ...(memoryBrief ? [memoryBrief, `Usa esa memoria para adaptar ritmo y ejemplos (refuerza los errores recurrentes, propone repasar lo pendiente), sin mencionarla literalmente al alumno.`, ``] : []),
        `PROGRAMA COMPLETO (${nodos.length} nodos, XP total = ${nodos.reduce((s, n) => s + (n.xpRecompensa ?? 0), 0)}):`,
        JSON.stringify(nodos.map(n => ({
          id: n.id,
          titulo: n.titulo,
          tipoPedagogico: n.tipoPedagogico,
          tipoVisual: n.tipoVisual,
          concepto: n.concepto,
          xpRecompensa: n.xpRecompensa,
          contenido: n.contenido,
        })), null, 2),
        ``,
        historial
          ? `HISTORIAL DE INTERACCIONES PREVIAS:\n${historial}`
          : `HISTORIAL: Primera vez en esta lección — comienza por el primer nodo.`,
        ``,
        `ACCIÓN REQUERIDA:`,
        `Usa la herramienta enviar_interaccion para entregar cada paso.`,
        `Cuando termines todos los nodos, llama completar_leccion.`,
      ].join('\n')
      log.info(
        `[delivery] invoking coordinator for session=${this.sessionId} taskChars=${taskDescription.length} profile=${profile?.nombre ?? 'Alumno'}`
      )

      // 4. Crear tools
      const enviarTool = createEnviarInteraccionTool(
        this.sessionId,
        async (msg) => {
          this.send(msg)
          // Persistir turno del agente
          const m = msg as any
          if (m.type === 'a2ui') {
            log.info(
              `[delivery] sent a2ui session=${this.sessionId} nodoId=${m.nodoId ?? 'unknown'} xpDisponible=${m.xpDisponible ?? 0} messages=${Array.isArray(m.messages) ? m.messages.length : 0}`
            )
            await this.persistence.saveInteraction(this.sessionId, this.turnIndex++, 'agent', {
              nodoId: m.nodoId,
              a2uiJson: JSON.stringify(m.messages),
              xpAwarded: m.xpDisponible ?? 0,
            })
          }
        },
        {
          getXpTotal: () => this.xpAcumulado,
          addXp: (n) => { this.xpAcumulado += n },
        },
      )

      // Wrapper para persistir turno del alumno
      const originalExecute = enviarTool.execute!
      enviarTool.execute = async (args) => {
        const result = await originalExecute(args)
        try {
          const parsed = JSON.parse(typeof result === 'string' ? result : JSON.stringify(result))
          log.info(
            `[delivery] received student action session=${this.sessionId} nodoId=${String(args.nodoId ?? 'unknown')} action=${parsed.accion ?? 'unknown'}`
          )
          await this.persistence.saveInteraction(this.sessionId, this.turnIndex++, 'student', {
            nodoId: args.nodoId as string,
            actionJson: JSON.stringify({ name: parsed.accion, context: parsed.contexto }),
          })
        } catch { /* non-critical */ }
        return result
      }

      const completarTool = createCompletarLeccionTool((msg) => {
        this.send(msg)
        this.active = false
      }, {
        buildFinalFeedback: (summary) => this.buildFinalFeedback(summary),
      })

      const evaluarTool = createEvaluarRespuestaTool(
        (msg) => this.send(msg),
        () => this.xpAcumulado,
        (n) => { this.xpAcumulado += n },
        async ({ nodoId, correcto, errorTag }) => {
          if (!nodoId) return
          await recordAttempt(getDb(), full.alumnoId, curriculumId, { nodeId: nodoId, correct: correcto, errorTag })
        },
      )

      // 5. Ejecutar coordinador en MODO ENTREGA
      await runHiveLearnAgent({
        agentId: AGENT_IDS.coordinator,
        taskDescription,
        systemPrompt: AGENT_PROMPTS[AGENT_IDS.coordinator] ?? '',
        tools: [enviarTool, completarTool, evaluarTool],
        threadId: `hl-lesson-${this.sessionId}`,
        runContext: runContextFromProfile(profile ? { alumnoId: full.alumnoId, edad: profile.edad } : { alumnoId: full.alumnoId }),
      })
      log.info(`[delivery] coordinator finished sessionId=${this.sessionId}`)

    } catch (err) {
      const msg = (err as Error).message ?? 'Error desconocido'
      log.error(`[delivery] failed sessionId=${this.sessionId}: ${msg}`)
      if (msg !== 'Tiempo de espera agotado') {
        this.send({ type: 'error', message: msg })
      }
      this.active = false
    }
  }

  receiveAction(action: Omit<StudentAction, 'timestamp'>): void {
    resolveStudentAction(this.sessionId, { ...action, timestamp: Date.now() })
  }

  cancel(): void {
    cancelPendingAction(this.sessionId)
    this.active = false
  }
}
