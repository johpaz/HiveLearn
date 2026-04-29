/**
 * initHiveLearnStorage — aplica el schema SQL de HiveLearn y registra los agentes.
 * Debe llamarse desde core (server.ts) justo después de initializeDatabase().
 * Es idempotente: todos los DDL usan IF NOT EXISTS.
 */
import type { Database } from 'bun:sqlite'
import { HIVELEARN_SCHEMA_V1, HIVELEARN_SCHEMA_V2, HIVELEARN_SCHEMA_V3, HIVELEARN_SCHEMA_V4, HIVELEARN_SCHEMA_V5 } from './hivelearn-schema'
import { registerHiveLearnAgents } from '../agent/registry'

/** Añade una columna a una tabla solo si no existe (compatible con cualquier versión de SQLite) */
function ensureColumn(db: Database, table: string, column: string, definition: string): void {
  const cols = (db as any).query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some(c => c.name === column)) {
    (db as any).exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function initHiveLearnStorage(db: Database): void {
  (db as any).exec(HIVELEARN_SCHEMA_V1)

  // V2: CREATE TABLE y CREATE INDEX (sin ALTER TABLE)
  try {
    (db as any).exec(HIVELEARN_SCHEMA_V2)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw e
  }

  // V2 ALTER TABLE: añadir columnas idempotente sin IF NOT EXISTS (no soportado en SQLite < 3.37)
  ensureColumn(db, 'hl_sessions', 'rating', 'INTEGER DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'rating_comentario', 'TEXT DEFAULT NULL')

  // V3: tabla hl_onboarding_messages + columnas de pausa/restauración de sesión
  try {
    (db as any).exec(HIVELEARN_SCHEMA_V3)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  ensureColumn(db, 'hl_sessions', 'paused_at',          'DATETIME DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'last_node_id',        'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'session_state_json',  'TEXT DEFAULT NULL')

  // V4: tabla hl_lesson_interactions (entrega dirigida por coordinador)
  try {
    (db as any).exec(HIVELEARN_SCHEMA_V4)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  // V5: tabla hl_onboarding_progress (guardado incremental del onboarding)
  try {
    (db as any).exec(HIVELEARN_SCHEMA_V5)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  registerHiveLearnAgents(db)
}
