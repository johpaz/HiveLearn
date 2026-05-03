/**
 * initHiveLearnStorage — aplica el schema SQL de HiveLearn y registra los agentes.
 * Debe llamarse desde core (server.ts) justo después de initializeDatabase().
 * Es idempotente: todos los DDL usan IF NOT EXISTS.
 */
import type { Database } from 'bun:sqlite'
import { HIVELEARN_SCHEMA_V1, HIVELEARN_SCHEMA_V2, HIVELEARN_SCHEMA_V3, HIVELEARN_SCHEMA_V4, HIVELEARN_SCHEMA_V5, HIVELEARN_SCHEMA_V6 } from './hivelearn-schema'
import { registerHiveLearnAgents } from '../agent/registry'
import { seedIfEmpty } from './seed'

/** Añade una columna a una tabla solo si no existe (compatible con cualquier versión de SQLite) */
function ensureColumn(db: Database, table: string, column: string, definition: string): void {
  const cols = (db as any).query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some(c => c.name === column)) {
    (db as any).exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function initHiveLearnStorage(db: Database): void {
  // Schema principal (providers, models)
  // API keys are stored securely using Bun.secrets (OS keychain)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL UNIQUE,
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

  // V1 migrations: columnas añadidas después de la creación inicial de la tabla
  ensureColumn(db, 'hl_student_profiles', 'alumno_id', 'TEXT DEFAULT NULL')
  // FK en hl_sessions/hl_session_metrics referencia alumno_id — SQLite exige UNIQUE index
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_hl_student_alumno_id ON hl_student_profiles(alumno_id)')
  ensureColumn(db, 'hl_student_profiles', 'apodo', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'hl_student_profiles', 'nombre', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'hl_student_profiles', 'nickname', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'hl_student_profiles', 'avatar', "TEXT NOT NULL DEFAULT '👤'")

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
  // Columnas tema/objetivo pueden faltar en tablas creadas antes de la V1 actual
  ensureColumn(db, 'hl_sessions', 'tema', 'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'objetivo', "TEXT NOT NULL DEFAULT ''")
  // Casilla individual por agente (una columna por cada worker del swarm)
  ensureColumn(db, 'hl_sessions', 'agente_profile',          'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_intent',           'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_structure',        'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_explanation',      'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_exercise',         'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_quiz',             'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_challenge',        'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_code',             'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_svg',              'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_gif',              'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_infographic',      'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_image',            'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_audio',            'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_gamification',     'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_evaluation',       'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_feedback',         'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_monitor',          'TEXT DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'agente_vision_pedagogica','TEXT DEFAULT NULL')
  // Conclusiones del coordinador: síntesis final para crear el programa de formación
  ensureColumn(db, 'hl_sessions', 'coordinador_conclusiones','TEXT DEFAULT NULL')

  // hl_topics: tabla referenciada por hl_programs.topic_slug — stub para satisfacer la FK
  db.exec('CREATE TABLE IF NOT EXISTS hl_topics (slug TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\')')

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

  // V4: tabla hl_lesson_interactions (entrega dirigida por coordinador)
  try {
    db.exec(HIVELEARN_SCHEMA_V4)
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

  // V6: tabla hl_curricula (faltaba en V1) + hl_monitor_frames
  try {
    db.exec(HIVELEARN_SCHEMA_V6)
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!msg.includes('already exists')) throw e
  }

  // V6 columnas: curriculo_id en hl_sessions + campos de monitor en hl_student_profiles
  ensureColumn(db, 'hl_sessions', 'curriculo_id', 'INTEGER DEFAULT NULL')
  ensureColumn(db, 'hl_sessions', 'nodos_completados', 'INTEGER DEFAULT 0')
  ensureColumn(db, 'hl_student_profiles', 'ritmo_atencion', "TEXT DEFAULT 'normal'")
  ensureColumn(db, 'hl_student_profiles', 'estilo_aprendizaje', "TEXT DEFAULT 'mixto'")
  ensureColumn(db, 'hl_student_profiles', 'necesidades_esp', 'INTEGER DEFAULT 0')
  ensureColumn(db, 'hl_student_profiles', 'monitor_activo', 'INTEGER DEFAULT 1')
  ensureColumn(db, 'hl_student_profiles', 'intervalo_custom', 'INTEGER DEFAULT NULL')
  ensureColumn(db, 'hl_student_profiles', 'umbral_custom', 'INTEGER DEFAULT NULL')

  registerHiveLearnAgents(db)
  seedIfEmpty()  // Seed solo si la BD está vacía
}
