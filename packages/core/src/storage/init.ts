/**
 * initHiveLearnStorage — bootstrap idempotente del almacenamiento HiveLearn.
 * Debe llamarse desde core (server.ts) justo después de initializeDatabase().
 *
 * Motor: @johpaz/hive-db (colecciones de documentos — no hay DDL).
 * Es idempotente:
 * - Crea los índices de igualdad requeridos por los findBy de LessonPersistence.
 * - Registra/actualiza los agentes hl_* (upsert).
 * - Aplica el seed de datos (INSERT OR IGNORE por diseño).
 */
import { getDb } from './hivedb'
import { registerHiveLearnAgents } from '../agent/registry'
import { seedAllData } from './seed'
import { seedAgentVoices } from './voices'
import { logger } from '../utils/logger'

const log = logger.child('storage-init')

/** Índices de igualdad requeridos antes de usar findBy(field, value) */
const COLLECTION_INDEXES: Array<{ collection: string; fields: string[] }> = [
  { collection: 'hl_sessions', fields: ['alumno_id'] },
  { collection: 'hl_onboarding_progress', fields: ['alumno_id'] },
  { collection: 'hl_node_effectiveness', fields: ['tema'] },
  { collection: 'hl_node_cache', fields: ['agente_tipo'] },
  { collection: 'hl_curricula', fields: ['topic_slug'] },
  { collection: 'models', fields: ['provider_id'] },
]

export async function initHiveLearnStorage(): Promise<void> {
  const db = getDb()

  // 1. Índices secundarios (createIndex es idempotente en hive-db)
  for (const { collection, fields } of COLLECTION_INDEXES) {
    for (const field of fields) {
      try {
        await db.collection(collection).createIndex(field)
      } catch (e) {
        log.warn(`[init] createIndex ${collection}.${field}: ${(e as Error).message}`)
      }
    }
  }

  // 2. Agentes HiveLearn (upsert idempotente)
  await registerHiveLearnAgents()

  // 3. Seed de datos predeterminados
  await seedAllData()

  // 4. Identidad sonora de los personajes (voces + leitmotivs por agente)
  try {
    await seedAgentVoices()
  } catch (e) {
    log.warn(`[init] seedAgentVoices: ${(e as Error).message}`)
  }

  // 5. Descubrimiento de modelos Ollama instalados (como Hive: /api/tags)
  //    + remapeo de agentes cuyo model_id no exista localmente.
  try {
    const { syncOllamaModels, ensureAgentModelsResolve } = await import('./ollama-sync')
    await syncOllamaModels()
    await ensureAgentModelsResolve()
  } catch (e) {
    log.warn(`[init] ollama-sync: ${(e as Error).message}`)
  }
}
