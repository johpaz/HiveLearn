/**
 * HiveLearn — WebSocket Module
 * 
 * Manejo de conexiones WebSocket con heartbeat automático
 */

export { startHeartbeat, type WebSocketSessionManager } from './heartbeat'
export {
  handleWebSocketOpen,
  handleWebSocketClose,
  isWebSocketRoute,
} from './routes'
export { handleOnboardingInit, handleOnboardingUserMessage } from './onboarding-handler'
