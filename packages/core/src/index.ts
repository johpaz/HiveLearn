/**
 * HiveLearn Core — Backend entry point
 *
 * Módulo independiente de aprendizaje adaptativo con IA
 * Sin dependencias externas del repositorio principal de Hive
 */

// ─── Tipos públicos ───────────────────────────────────────────────────────────
export * from './types'

export type { CalificacionOutput, CalificacionInput } from './tools/evaluation/calificar-evaluacion.tool'
export type { SessionData, SessionMetrics } from './storage/LessonPersistence'

// ─── Persistencia ─────────────────────────────────────────────────────────────
export { LessonPersistence } from './storage/LessonPersistence'

// ─── Evaluación ───────────────────────────────────────────────────────────────
export { evaluarRespuestas } from './tools/evaluation/calificar-evaluacion.tool'
export { calificarEvaluacionTool, calificarRespuestaTool } from './tools/evaluation/calificar-evaluacion.tool'

// ─── Agentes y configuración ──────────────────────────────────────────────────
export { AGENT_IDS, updateHiveLearnAgentsProviderModel } from './agent/registry'
export { AGENT_PROMPTS } from './agent/prompts'
export { runHiveLearnAgent } from './agent/runner'

// ─── Secrets (API Key Management) ─────────────────────────────────────────────
export {
  storeProviderApiKey,
  getProviderApiKey,
  hasProviderApiKey,
  deleteProviderApiKey,
  listProvidersWithKeys,
} from './secrets/provider-secrets'
export { runHiveLearnConversation } from './agent/conversation'
export type { ConversationResult } from './agent/conversation'

// ─── Eventos SSE ──────────────────────────────────────────────────────────────
export { hlSwarmEmitter } from './events/swarm-events'

// ─── Storage init (llamar desde el server al arrancar) ────────────────────────
export { initHiveLearnStorage } from './storage/init'
export { initHiveLearnStorage as initHiveLearn } from './storage/init'

// ─── Database ─────────────────────────────────────────────────────────────────
export { getDb, initializeDatabase, getDbPath } from './storage/sqlite'
export { seedAllData, seedIfEmpty } from './storage/seed'

// ─── Logger ───────────────────────────────────────────────────────────────────
export { logger, getLogger, Logger, ChildLogger } from './utils/logger'
export type { LogLevel, LogEntry, LoggerConfig, LogMeta } from './utils/logger'

// ─── Config ───────────────────────────────────────────────────────────────────
export { loadConfig, getHiveDir, resetConfig } from './config/loader'
export type { HiveLearnConfig } from './config/loader'

// ─── Gateway Manager ──────────────────────────────────────────────────────────
export { startGateway, stopGateway, getGatewayStatus, getServerInstance } from './gateway/manager'
export { registerEmbeddedUI } from './gateway/server'

// ─── Tipos de herramientas ────────────────────────────────────────────────────
export type { Tool, ToolParameters } from './types/tool'
