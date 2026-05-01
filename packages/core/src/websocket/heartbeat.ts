/**
 * HiveLearn — WebSocket Heartbeat
 * 
 * Mantiene las conexiones WebSocket activas enviando ping periódicos
 */

import type { ServerWebSocket } from 'bun'

const HEARTBEAT_INTERVAL = 25000 // 25 seconds

export interface WebSocketSessionManager {
  onboardingSessions: Map<string, ServerWebSocket<any>>
  lessonSessions: Map<string, ServerWebSocket<any>>
  eventSubscribers: Set<ServerWebSocket<any>>
}

/**
 * Inicia heartbeat para todas las conexiones WebSocket
 */
export function startHeartbeat(sessions: WebSocketSessionManager): void {
  setInterval(() => {
    const pingMessage = JSON.stringify({ 
      type: 'ping', 
      timestamp: Date.now() 
    })
    
    // Ping onboarding sessions
    for (const [sessionId, ws] of sessions.onboardingSessions.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pingMessage)
      }
    }
    
    // Ping lesson sessions
    for (const [sessionId, ws] of sessions.lessonSessions.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pingMessage)
      }
    }
    
    // Ping event subscribers
    for (const ws of sessions.eventSubscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pingMessage)
      }
    }
  }, HEARTBEAT_INTERVAL)
  
  console.log(`[websocket] Heartbeat started (interval: ${HEARTBEAT_INTERVAL}ms)`)
}
