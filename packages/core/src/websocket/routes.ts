/**
 * HiveLearn — WebSocket Routes
 * 
 * Maneja el routing y registro de conexiones WebSocket
 */

import type { ServerWebSocket } from 'bun'
import { logger } from '../utils/logger'
import { obtenerConfiguracionCoordinador } from '../skills/gestionar-instancia.skill'
import { closeLessonSession } from './lesson-handler'

const log = logger.child('websocket')

import { type WebSocketSessionManager } from './heartbeat'

/**
 * Verifica si la ruta es una ruta WebSocket válida
 */
export function isWebSocketRoute(pathname: string): boolean {
  return (
    pathname.includes('hivelearn-onboarding') ||
    pathname.includes('hivelearn-lesson') ||
    pathname.includes('hivelearn-events') ||
    pathname.includes('hivelearn-program')
  )
}

/**
 * Handler para cuando se abre una conexión WebSocket.
 * pathname se extrae en el fetch handler y se pasa via ws.data.
 */
export async function handleWebSocketOpen(
  ws: ServerWebSocket<any>,
  pathname: string,
  sessions: WebSocketSessionManager
): Promise<void> {
  const config = await obtenerConfiguracionCoordinador()

  log.info('[ws] Client connected', {
    path: pathname,
  })

  // Register session by path (sin sessionId — el WS es anónimo)
  if (pathname.includes('hivelearn-program')) {
    // El program handler registra sesiones cuando llega un mensaje con session_id
  } else if (pathname.includes('hivelearn-onboarding')) {
    // El onboarding handler maneja sessionId desde los mensajes
  } else if (pathname.includes('hivelearn-lesson')) {
    // El lesson handler maneja sessionId desde los mensajes
  } else if (pathname.includes('hivelearn-events')) {
    sessions.eventSubscribers.add(ws)
  }

  // Send connection acknowledgment con configuración
  ws.send(JSON.stringify({
    type: 'connected',
    path: pathname,
    config: {
      providerId: config.providerId,
      modelId: config.modelId,
    },
    timestamp: new Date().toISOString(),
  }))

}

/**
 * Handler para cuando se cierra una conexión WebSocket
 */
export function handleWebSocketClose(
  ws: ServerWebSocket<any>,
  code: number,
  reason: string,
  sessions: WebSocketSessionManager
): void {
  log.info(`[ws] Client disconnected: ${code} ${reason}`)

  // Clean up sessions
  for (const [sessionId, sessionWs] of sessions.onboardingSessions.entries()) {
    if (sessionWs === ws) {
      sessions.onboardingSessions.delete(sessionId)
      log.debug('[ws] Removed onboarding session', { sessionId })
    }
  }
  for (const [sessionId, sessionWs] of sessions.lessonSessions.entries()) {
    if (sessionWs === ws) {
      sessions.lessonSessions.delete(sessionId)
      closeLessonSession(sessionId)
      log.debug('[ws] Removed lesson session', { sessionId })
    }
  }
  for (const [sessionId, sessionWs] of sessions.programSessions.entries()) {
    if (sessionWs === ws) {
      sessions.programSessions.delete(sessionId)
      log.debug('[ws] Removed program session', { sessionId })
    }
  }
  sessions.eventSubscribers.delete(ws)
}
