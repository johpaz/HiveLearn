/**
 * LessonDeliverySession — orquesta la entrega de una lección vía WebSocket.
 *
 * El coordinador LLM recibe el programa completo y va llamando enviar_interaccion
 * por cada paso. El alumno responde, y el coordinador evalúa y decide el siguiente paso.
 */
import { runHiveLearnAgent } from '../agent/runner'
import { AGENT_IDS } from '../agent/registry'
import { AGENT_PROMPTS } from '../agent/prompts'
import { LessonPersistence } from '../storage/LessonPersistence'
import { createEnviarInteraccionTool, resolveStudentAction, cancelPendingAction } from '../tools/coordinator/enviar-interaccion.tool'
import { createCompletarLeccionTool } from '../tools/coordinator/completar-leccion.tool'
import { createEvaluarRespuestaTool } from '../tools/coordinator/evaluar-respuesta.tool'
import type { StudentAction } from '../tools/coordinator/enviar-interaccion.tool'
import type { NodoLesson, StudentProfile } from '../types'

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

  async start(): Promise<void> {
    if (this.active) return
    this.active = true

    try {
      // 1. Cargar programa y perfil desde BD
      const full = this.persistence.getSessionWithCurriculum(this.sessionId)
      if (!full) {
        this.send({ type: 'error', message: 'Sesión no encontrada' })
        return
      }

      const nodos: NodoLesson[] = JSON.parse(full.nodosJson || '[]')
      if (nodos.length === 0) {
        this.send({ type: 'error', message: 'El programa no tiene nodos' })
        return
      }

      const profile = this.persistence.getStudentProfile(full.alumnoId)
      const interactions = this.persistence.getInteractions(this.sessionId)
      this.turnIndex = this.persistence.getNextTurnIndex(this.sessionId)

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
      const taskDescription = [
        `MODO ENTREGA — Conduce esta lección de forma interactiva.`,
        ``,
        `FECHA Y HORA ACTUAL: ${now.toISOString()} (${now.toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: true })})`,
        ``,
        `PERFIL DEL ALUMNO:`,
        `- nombre: ${profile?.nombre ?? 'Alumno'}`,
        `- rangoEdad: ${full.alumnoId ? (profile as any)?.rangoEdad ?? 'adulto' : 'adulto'}`,
        `- meta: "${full.metaAlumno}"`,
        `- sessionId: "${this.sessionId}"`,
        ``,
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

      // 4. Crear tools
      const enviarTool = createEnviarInteraccionTool(
        this.sessionId,
        (msg) => {
          this.send(msg)
          // Persistir turno del agente
          const m = msg as any
          if (m.type === 'a2ui') {
            this.persistence.saveInteraction(this.sessionId, this.turnIndex++, 'agent', {
              nodoId: m.nodoId,
              a2uiJson: JSON.stringify(m.messages),
              xpAwarded: m.xpDisponible ?? 0,
            })
          }
        },
      )

      // Wrapper para persistir turno del alumno
      const originalExecute = enviarTool.execute!
      enviarTool.execute = async (args) => {
        const result = await originalExecute(args)
        try {
          const parsed = JSON.parse(typeof result === 'string' ? result : JSON.stringify(result))
          this.persistence.saveInteraction(this.sessionId, this.turnIndex++, 'student', {
            nodoId: args.nodoId as string,
            actionJson: JSON.stringify({ name: parsed.accion, context: parsed.contexto }),
          })
        } catch { /* non-critical */ }
        return result
      }

      const completarTool = createCompletarLeccionTool((msg) => {
        this.send(msg)
        this.active = false
      })

      const evaluarTool = createEvaluarRespuestaTool(
        (msg) => this.send(msg),
        () => this.xpAcumulado,
        (n) => { this.xpAcumulado += n },
      )

      // 5. Ejecutar coordinador en MODO ENTREGA
      await runHiveLearnAgent({
        agentId: AGENT_IDS.coordinator,
        taskDescription,
        systemPrompt: AGENT_PROMPTS[AGENT_IDS.coordinator] ?? '',
        tools: [enviarTool, completarTool, evaluarTool],
        threadId: `hl-lesson-${this.sessionId}`,
      })

    } catch (err) {
      const msg = (err as Error).message ?? 'Error desconocido'
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
