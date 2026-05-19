/**
 * initHiveLearnStorage — aplica el schema SQL de HiveLearn y registra los agentes.
 * Debe llamarse desde core (server.ts) justo después de initializeDatabase().
 * Es idempotente: todos los DDL usan IF NOT EXISTS.
 */
import type { Database } from 'bun:sqlite'
import { HIVELEARN_SCHEMA_V1, HIVELEARN_SCHEMA_V2, HIVELEARN_SCHEMA_V3, HIVELEARN_SCHEMA_V4, HIVELEARN_SCHEMA_V5, HIVELEARN_SCHEMA_V6, HIVELEARN_SCHEMA_V7_MIGRATE_PROGRESS, HIVELEARN_SCHEMA_V8, HIVELEARN_SCHEMA_V9 } from './hivelearn-schema'
import { registerHiveLearnAgents } from '../agent/registry'
import { seedAllData } from './seed'

/** Añade una columna a una tabla solo si no existe (compatible con cualquier versión de SQLite) */
function ensureColumn(db: Database, table: string, column: string, definition: string): void {
  const cols = (db as any).query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some(c => c.name === column)) {
    (db as any).exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function initHiveLearnStorage(db: Database): void {
  // Schema principal (providers, models)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL UNIQUE,
      api_key_encrypted TEXT,
      api_key_iv      TEXT,
      headers_encrypted TEXT,
      headers_iv      TEXT,
      base_url        TEXT,
      category        TEXT NOT NULL DEFAULT 'llm',
      num_ctx         INTEGER,
      num_gpu         INTEGER DEFAULT -1,
      enabled         INTEGER NOT NULL DEFAULT 1,
      active          INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id              TEXT PRIMARY KEY,
      provider_id     TEXT REFERENCES providers(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      model_type      TEXT NOT NULL DEFAULT 'llm',
      context_window  INTEGER NOT NULL DEFAULT 20000,
      capabilities    TEXT,
      enabled         INTEGER NOT NULL DEFAULT 1,
      active          INTEGER NOT NULL DEFAULT 0
    )
  `)

  // HiveLearn schema v1+
  db.exec(HIVELEARN_SCHEMA_V1)

  // V2: CREATE TABLE y CREATE INDEX (sin ALTER TABLE)
  try {
    db.exec(HIVELEARN_SCHEMA_V2)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw e
  }

  // V2 ALTER TABLE: añadir columnas idempotente sin IF NOT EXISTS (no soportado en SQLite < 3.37)
  ensureColumn(db, 'hl_sessions', 'rating', 'INTEGER DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'rating_comentario', 'TEXT DEFAULT NULL')

  // V3: tabla hl_onboarding_messages + columnas de pausa/restauración de sesión
  try {
    db.exec(HIVELEARN_SCHEMA_V3)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  ensureColumn(db, 'hl_sessions', 'paused_at',          'DATETIME DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'last_node_id',        'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'session_state_json',  'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_agents', 'prompt_patch',          'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_agents', 'last_prompt_update_reason', 'TEXT DEFAULT NULL')

  // V4: tabla hl_lesson_interactions (entrega dirigida por coordinador)
  try {
    db.exec(HIVELEARN_SCHEMA_V4)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  try {
    db.exec(HIVELEARN_SCHEMA_V8)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  try {
    db.exec(HIVELEARN_SCHEMA_V9)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  // V5: tabla hl_onboarding_progress (guardado incremental del onboarding)
  try {
    db.exec(HIVELEARN_SCHEMA_V5)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  // V6: columna nickname en hl_student_profiles + índice único
  ensureColumn(db, 'hl_student_profiles', 'nickname', 'TEXT')
  try {
    db.exec(HIVELEARN_SCHEMA_V6)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  // V7: migrar hl_onboarding_progress para que step pueda ser 'nickname'
  // Detectar si la tabla vieja aún tiene el CHECK sin 'nickname'
  const progressSchema = (db.query(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='hl_onboarding_progress'"
  ).get() as { sql?: string } | undefined)?.sql ?? ''
  if (!progressSchema.includes("'nickname'")) {
    db.exec(HIVELEARN_SCHEMA_V7_MIGRATE_PROGRESS)
  }

  registerHiveLearnAgents(db)
  seedAllData()
}
