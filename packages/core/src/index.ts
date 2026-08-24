/**
 * HiveLearn Core — Backend entry point
 *
 * Módulo independiente de aprendizaje adaptativo con IA
 * Sin dependencias externas del repositorio principal de Hive
 */

// ─── Tipos públicos ───────────────────────────────────────────────────────────
export type {
  StudentProfile,
  LessonProgram,
  SwarmProgress,
  NodoLesson,
  NodoContenido,
  MicroEvaluacion,
  FeedbackOutput,
  EvaluacionOutput,
  PreguntaEvaluacion,
  GamificacionOutput,
  Logro,
  RangoEdad,
  TipoPedagogico,
  TipoVisual,
  EstadoNodo,
  AgentStatus,
  CoordinatorState,
  SwarmTimelineEvent,
  SwarmTimelineKind,
  EstiloAprendizaje,
  NivelPrevio,
} from './types'

export type { CalificacionOutput, CalificacionInput } from './tools/evaluation/calificar-evaluacion.tool'

// ─── Contrato del juego de plataformas (LevelSpec) ───────────────────────────
export type { LevelSpec, WorldSpec, ConceptBlock, BossSpec, BossQuestion, WorldTheme } from './lesson/levelSpec'
export { lessonToLevelSpecs, themeForSlug, WORLD_THEMES } from './lesson/levelSpec'
export type { SessionData, SessionMetrics } from './storage/LessonPersistence'

// ─── Swarm y sesión ───────────────────────────────────────────────────────────
export { HiveLearnSwarm } from './agent/swarm/HiveLearnSwarm'
export { runHiveLearnSession } from './agent/swarm/session'

// ─── Entrega de lección dirigida por coordinador ──────────────────────────────
export { LessonDeliverySession } from './lesson/LessonDeliverySession'
export { resolveStudentAction, cancelPendingAction } from './tools/coordinator/enviar-interaccion.tool'

// ─── Persistencia ─────────────────────────────────────────────────────────────
export { LessonPersistence } from './storage/LessonPersistence'

// ─── Evaluación ───────────────────────────────────────────────────────────────
export { evaluarRespuestas } from './tools/evaluation/calificar-evaluacion.tool'
export { calificarEvaluacionTool, calificarRespuestaTool } from './tools/evaluation/calificar-evaluacion.tool'

// ─── Agentes y configuración ──────────────────────────────────────────────────
export { AGENT_IDS, updateHiveLearnAgentsProviderModel } from './agent/registry'
export { AGENT_PROMPTS } from './agent/prompts'
export { runHiveLearnAgent } from './agent/runner'
export {
  createGenerationRun,
  getGenerationRun,
  listGenerationRuns,
  reconcileGenerationRuns,
} from './agent/run-store'
export type { GenerationRun, GenerationRunStatus } from './agent/run-store'
export { runHiveLearnConversation } from './agent/conversation'
export type { ConversationResult } from './agent/conversation'

// ─── Eventos SSE ──────────────────────────────────────────────────────────────
export { hlSwarmEmitter } from './events/swarm-events'

// ─── Cache ────────────────────────────────────────────────────────────────────
export { nodeCache } from './cache/NodeCache'
export { cacheInvalidator } from './cache/CacheInvalidator'

// ─── Storage init (llamar desde el server al arrancar) ────────────────────────
export { initHiveLearnStorage } from './storage/init'
export { initHiveLearnStorage as initHiveLearn } from './storage/init'

// ─── Database ─────────────────────────────────────────────────────────────────
export { getDb, initializeDatabase, getDbPath } from './storage/hivedb'
export { seedAllData } from './storage/seed'

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
