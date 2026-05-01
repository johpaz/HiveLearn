/**
 * HiveLearn — Schema SQL inline
 *
 * Incrustado como constante TypeScript para que funcione correctamente
 * en distribuciones binarias sin necesidad de leer archivos del disco.
 */

/** Schema v1 — Tablas base + seed de 14 temas educativos */
export const HIVELEARN_SCHEMA_V1 = `
-- HiveLearn Schema v1
-- Prefijo hl_ para coexistir sin conflictos con tablas de Hive OSS

-- Tabla de instancias únicas (UUID por instalación)
CREATE TABLE IF NOT EXISTS hl_instances (
  instance_id     TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL DEFAULT 'ollama',
  model_id        TEXT NOT NULL DEFAULT 'gemma2:9b',
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla propia de agentes HL (sin FK a providers/users para evitar constraint failures)
CREATE TABLE IF NOT EXISTS hl_agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  system_prompt   TEXT,
  role            TEXT NOT NULL DEFAULT 'worker',
  provider_id     TEXT NOT NULL DEFAULT 'ollama',
  model_id        TEXT NOT NULL DEFAULT 'gemma2:9b',
  max_iterations  INTEGER NOT NULL DEFAULT 3,
  tools_json      TEXT DEFAULT '[]',
  workspace       TEXT,
  tone            TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS hl_student_profiles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL DEFAULT '',
  nickname        TEXT NOT NULL DEFAULT '',
  edad            INTEGER NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'onboarding' CHECK(estado IN ('onboarding','activo','inactivo')),
  sesiones_total  INTEGER DEFAULT 0,
  xp_acumulado    INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  ultimo_acceso   TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS hl_sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id          TEXT UNIQUE NOT NULL,
  alumno_id           TEXT REFERENCES hl_student_profiles(alumno_id),
  tema                TEXT,
  objetivo            TEXT NOT NULL,
  xp_total            INTEGER DEFAULT 0,
  nivel_alcanzado     TEXT DEFAULT 'Aprendiz',
  logros_json         TEXT DEFAULT '[]',
  evaluacion_puntaje  REAL,
  completada          INTEGER DEFAULT 0,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hl_session_metrics (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id            TEXT UNIQUE NOT NULL,
  alumno_id             TEXT REFERENCES hl_student_profiles(alumno_id),
  curriculo_id          INTEGER REFERENCES hl_curricula(id),
  tema                  TEXT NOT NULL,
  duracion_real_seg     INTEGER,
  nodos_total           INTEGER,
  nodos_completados     INTEGER,
  puntaje_evaluacion    REAL,
  intentos_por_nodo     TEXT DEFAULT '{}',
  nodos_dominados       TEXT DEFAULT '[]',
  nodos_dificiles       TEXT DEFAULT '[]',
  logros_desbloqueados  TEXT DEFAULT '[]',
  xp_ganado             INTEGER DEFAULT 0,
  completada            INTEGER DEFAULT 0,
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE IF NOT EXISTS hl_search_index (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  entidad_tipo    TEXT NOT NULL,
  entidad_id      TEXT NOT NULL,
  contenido_texto TEXT NOT NULL,
  metadata_json   TEXT,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS hl_search_fts
USING fts5(contenido_texto, entidad_tipo, entidad_id, metadata_json);

CREATE TABLE IF NOT EXISTS hl_node_cache (
  cache_key       TEXT PRIMARY KEY,
  agente_tipo     TEXT NOT NULL,
  concepto_slug   TEXT NOT NULL,
  nivel           TEXT NOT NULL,
  output_json     TEXT NOT NULL,
  hits            INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at      TEXT NOT NULL
);

`;

/** Schema v2 — Trazabilidad de outputs por agente + respuestas del alumno + rating */
export const HIVELEARN_SCHEMA_V2 = `
-- HiveLearn Schema v2 — Trazabilidad de outputs por agente + respuestas del alumno

-- Output raw de cada agente del enjambre por sesión
CREATE TABLE IF NOT EXISTS hl_session_agent_outputs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL,
  agent_id    TEXT    NOT NULL,
  task_id     TEXT    NOT NULL,
  output_json TEXT,
  duration_ms INTEGER,
  status      TEXT    NOT NULL DEFAULT 'ok',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sao_session ON hl_session_agent_outputs(session_id);
CREATE INDEX IF NOT EXISTS idx_sao_task    ON hl_session_agent_outputs(session_id, task_id);

-- Respuestas del alumno a quizzes, ejercicios y retos
CREATE TABLE IF NOT EXISTS hl_student_responses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT    NOT NULL,
  node_id         TEXT    NOT NULL,
  attempt_num     INTEGER NOT NULL DEFAULT 1,
  tipo_pedagogico TEXT,
  respuesta_texto TEXT,
  feedback_json   TEXT,
  xp_awarded      INTEGER DEFAULT 0,
  es_correcto     INTEGER DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sr_session ON hl_student_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_sr_node    ON hl_student_responses(node_id);

-- rating: gestionado por initHiveLearnStorage con ensureColumn (compatible SQLite < 3.37)
`;

/** Schema v4 — Historial de interacciones de entrega de lección (Coordinador WebSocket) */
export const HIVELEARN_SCHEMA_V4 = `
-- HiveLearn Schema v4
-- Registra cada turno de la lección dirigida por el coordinador

CREATE TABLE IF NOT EXISTS hl_lesson_interactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL,
  turn_index  INTEGER NOT NULL,
  sender      TEXT    NOT NULL CHECK(sender IN ('agent','student')),
  nodo_id     TEXT    DEFAULT NULL,
  a2ui_json   TEXT    DEFAULT NULL,
  action_json TEXT    DEFAULT NULL,
  xp_awarded  INTEGER DEFAULT 0,
  correcto    INTEGER DEFAULT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hli_session ON hl_lesson_interactions(session_id);
`;

/** Schema v3 — Persistencia de estado de sesión multi-usuario + historial de chat onboarding */
export const HIVELEARN_SCHEMA_V3 = `
-- HiveLearn Schema v3
-- Permite pausar/retomar sesiones sin depender de localStorage (multi-usuario/multi-dispositivo)

-- Tabla de programas de aprendizaje (schema asociado a alumno y sesión)
CREATE TABLE IF NOT EXISTS hl_programs (
  id              TEXT PRIMARY KEY,  -- UUID del programa
  instance_id     TEXT REFERENCES hl_instances(instance_id),
  student_id      INTEGER REFERENCES hl_student_profiles(id),
  session_id      TEXT REFERENCES hl_sessions(session_id),
  topic_slug      TEXT REFERENCES hl_topics(slug),
  schema_json     TEXT NOT NULL,  -- El schema completo del programa
  total_nodos     INTEGER,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Historial del chat de onboarding conversacional
CREATE TABLE IF NOT EXISTS hl_onboarding_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL,
  role        TEXT    NOT NULL CHECK(role IN ('agent','user')),
  content     TEXT    NOT NULL,
  a2ui_json   TEXT    DEFAULT NULL,
  field_key   TEXT    DEFAULT NULL,
  field_value TEXT    DEFAULT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hom_session ON hl_onboarding_messages(session_id);
`;

/** Schema v5 — Trazabilidad de outputs por agente + respuestas del alumno + rating */
export const HIVELEARN_SCHEMA_V5 = `
-- HiveLearn Schema v5 — Tabla hl_onboarding_progress (separada de V3 para mejor versionado)

CREATE TABLE IF NOT EXISTS hl_onboarding_progress (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT    NOT NULL,
  alumno_id       TEXT,
  step            TEXT    NOT NULL CHECK(step IN ('nombre', 'edad', 'tema', 'objetivo', 'estilo', 'completo')),
  field_key       TEXT,
  field_value     TEXT,
  perfil_json     TEXT,
  meta_json       TEXT,
  completed       INTEGER DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hop_session ON hl_onboarding_progress(session_id);
CREATE INDEX IF NOT EXISTS idx_hop_alumno ON hl_onboarding_progress(alumno_id);
`;
