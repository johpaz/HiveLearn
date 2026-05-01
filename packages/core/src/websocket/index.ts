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
export { iniciarPrograma, procesarRespuesta, pausarPrograma, reanudarPrograma, cleanupProgramSession } from './program-handler'
export { startLessonSession, handleLessonMessage, closeLessonSession } from './lesson-handler'
