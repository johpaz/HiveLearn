import type { Tool } from '../../types/tool'

/**
 * Bridge entre el coordinador LLM y el WebSocket del alumno.
 *
 * Cuando el coordinador llama esta tool:
 *  1. Envía los mensajes A2UI al cliente via WebSocket
 *  2. Espera hasta MAX_WAIT_MS a que el alumno responda
 *  3. Devuelve la acción del alumno al coordinador para que evalúe
 *
 * pendingStudentResponse es el mapa sessionId → resolve.
 * El WebSocket handler llama resolveStudentAction cuando llega una acción del alumno.
 */

export interface StudentAction {
  name: string
  context: Record<string, unknown>
  timestamp: number
}

const MAX_WAIT_MS = 5 * 60 * 1000 // 5 minutos

const pendingStudentResponse = new Map<string, (action: StudentAction) => void>()

export function resolveStudentAction(sessionId: string, action: StudentAction): boolean {
  const resolve = pendingStudentResponse.get(sessionId)
  if (!resolve) return false
  pendingStudentResponse.delete(sessionId)
  resolve(action)
  return true
}

export function hasPendingAction(sessionId: string): boolean {
  return pendingStudentResponse.has(sessionId)
}

export function cancelPendingAction(sessionId: string): void {
  const resolve = pendingStudentResponse.get(sessionId)
  if (resolve) {
    pendingStudentResponse.delete(sessionId)
    resolve({ name: 'cancelled', context: {}, timestamp: Date.now() })
  }
}

export function createEnviarInteraccionTool(
  sessionId: string,
  sendToClient: (msg: object) => void,
): Tool {
  return {
    name: 'enviar_interaccion',
    description: 'Envía una interacción A2UI al alumno y espera su respuesta. Úsala para cada paso de la lección.',
    parameters: {
      type: 'object',
      required: ['a2uiMessages', 'nodoId'],
      properties: {
        a2uiMessages: {
          type: 'array',
          description: 'Array de mensajes A2UI (surfaceUpdate + dataModelUpdate + beginRendering) que representan la interacción completa del paso actual',
          items: { type: 'object' },
        },
        nodoId: {
          type: 'string',
          description: 'ID del nodo pedagógico que se está entregando',
        },
        xpDisponible: {
          type: 'number',
          description: 'XP disponible si el alumno completa este paso correctamente',
        },
        esEvaluable: {
          type: 'boolean',
          description: 'Si true, la interacción requiere evaluación de respuesta. Si false (milestone, intro), avanza automáticamente.',
        },
      },
    },
    execute: async (args: Record<string, unknown>): Promise<string> => {
      const messages = args.a2uiMessages as object[]
      const nodoId = args.nodoId as string
      const xpDisponible = (args.xpDisponible as number) ?? 0

      // Enviar A2UI al cliente
      sendToClient({
        type: 'a2ui',
        messages,
        nodoId,
        xpDisponible,
      })

      // Si no es evaluable (milestone, intro), esperar complete_node del cliente
      // Si el LLM marcó esEvaluable=false, aun así esperamos la acción del cliente
      const action = await new Promise<StudentAction>((resolve, reject) => {
        pendingStudentResponse.set(sessionId, resolve)
        setTimeout(() => {
          if (pendingStudentResponse.has(sessionId)) {
            pendingStudentResponse.delete(sessionId)
            reject(new Error('Tiempo de espera agotado'))
          }
        }, MAX_WAIT_MS)
      })

      return JSON.stringify({
        accion: action.name,
        contexto: action.context,
        timestamp: action.timestamp,
      })
    },
  }
}
