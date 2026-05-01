/**
 * HiveLearn — WebSocket Routes
 * 
 * Maneja el routing y registro de conexiones WebSocket
 */

import type { ServerWebSocket } from 'bun'
import { logger } from '../utils/logger'
import { obtenerConfiguracionCoordinador } from '../skills/gestionar-instancia.skill'

const log = logger.child('websocket')

import { type WebSocketSessionManager } from './heartbeat'

/**
 * Verifica si la ruta es una ruta WebSocket válida
 */
export function isWebSocketRoute(pathname: string): boolean {
  return (
    pathname.includes('hivelearn-onboarding') ||
    pathname.includes('hivelearn-lesson') ||
    pathname.includes('hivelearn-events')
  )
}

/**
 * Handler para cuando se abre una conexión WebSocket.
 * sessionId y pathname se extraen en el fetch handler y se pasan via ws.data.
 */
export async function handleWebSocketOpen(
  ws: ServerWebSocket<any>,
  sessionId: string | null,
  pathname: string,
  sessions: WebSocketSessionManager
): Promise<void> {
  const config = await obtenerConfiguracionCoordinador(sessionId || undefined)

  log.info('[ws] Client connected', {
    path: pathname,
    sessionId,


  })

  // Send connection acknowledgment con configuración
  ws.send(JSON.stringify({
    type: 'connected',
    sessionId,
    path: pathname,
    config: {
      providerId: config.providerId,
      modelId: config.modelId,
    },
    timestamp: new Date().toISOString(),
  }))

  // Register session based on path
  if (pathname.includes('onboarding') && sessionId) {
    sessions.onboardingSessions.set(sessionId, ws)
    log.debug('[ws] Registered onboarding session', { sessionId })
  } else if (pathname.includes('lesson') && sessionId) {
    sessions.lessonSessions.set(sessionId, ws)
    log.debug('[ws] Registered lesson session', { sessionId })
  } else if (pathname.includes('events')) {
    sessions.eventSubscribers.add(ws)
    log.debug('[ws] Registered event subscriber')
  }
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
      log.debug('[ws] Removed lesson session', { sessionId })
    }
  }
  sessions.eventSubscribers.delete(ws)
}
