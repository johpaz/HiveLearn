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
  { collection: 'hl_institutions', fields: ['country'] },
  { collection: 'hl_student_identities', fields: ['institutionId', 'documentFingerprint'] },
  { collection: 'hl_guardian_consents', fields: ['studentId', 'institutionId'] },
  { collection: 'hl_ai_diagnostics', fields: ['studentId', 'institutionId'] },
  { collection: 'hl_learning_paths', fields: ['studentId', 'institutionId'] },
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

  // 6. Unificación de identidad (opt-in): enlaza perfiles antiguos con su cuenta del portal.
  //    HIVELEARN_MIGRATE_STUDENT_IDS=dry-run solo informa; =true reescribe (con copia de seguridad).
  const migrate = process.env.HIVELEARN_MIGRATE_STUDENT_IDS
  if (migrate === 'true' || migrate === 'dry-run') {
    try {
      const installation = await db.collection<{ institutionId: string }>('hl_installation').get('main')
      if (installation) {
        const { linkLegacyStudents } = await import('./migrations/student-ids')
        const report = await linkLegacyStudents(db, { institutionId: installation.doc.institutionId, dryRun: migrate === 'dry-run' })
        log.info(`[init] student-ids (${report.dryRun ? 'dry-run' : 'aplicado'}): ${report.linked.length} enlazados, ${report.ambiguous.length} ambiguos, ${report.conflicts.length} en conflicto, ${report.unmatched.length} sin cuenta`)
      }
    } catch (e) {
      log.warn(`[init] student-ids: ${(e as Error).message}`)
    }
  }
}
