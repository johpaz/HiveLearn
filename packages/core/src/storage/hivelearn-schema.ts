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

-- Tabla propia de agentes HL (sin FK a providers/users para evitar constraint failures)
CREATE TABLE IF NOT EXISTS hl_agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  system_prompt   TEXT,
  role            TEXT NOT NULL DEFAULT 'worker',
  provider_id     TEXT NOT NULL DEFAULT 'ollama',
  model_id        TEXT NOT NULL DEFAULT 'gemma4-e4b',
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
  alumno_id       TEXT UNIQUE NOT NULL,
  nombre          TEXT NOT NULL,
  edad            INTEGER NOT NULL,
  rango_edad      TEXT NOT NULL CHECK(rango_edad IN ('nino','adolescente','adulto')),
  tiempo_sesion   INTEGER NOT NULL CHECK(tiempo_sesion IN (15,30,45)),
  nivel_previo    TEXT NOT NULL CHECK(nivel_previo IN ('principiante','principiante_base','intermedio')),
  estilo          TEXT NOT NULL DEFAULT 'balanceado',
  sesiones_total  INTEGER DEFAULT 0,
  xp_acumulado    INTEGER DEFAULT 0,
  nivel_actual    TEXT DEFAULT 'Aprendiz',
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hl_topics (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT UNIQUE NOT NULL,
  titulo          TEXT NOT NULL,
  descripcion     TEXT,
  nivel           TEXT CHECK(nivel IN ('principiante','intermedio','avanzado')),
  categoria       TEXT CHECK(categoria IN ('programacion','diseno','datos','ia','redes')),
  keywords        TEXT DEFAULT '[]',
  activo          INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hl_curricula (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT UNIQUE NOT NULL,
  topic_slug      TEXT REFERENCES hl_topics(slug),
  meta_alumno     TEXT NOT NULL,
  nodos_json      TEXT NOT NULL,
  total_nodos     INTEGER,
  rango_edad      TEXT NOT NULL,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hl_sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id          TEXT UNIQUE NOT NULL,
  alumno_id           TEXT REFERENCES hl_student_profiles(alumno_id),
  curriculo_id        INTEGER REFERENCES hl_curricula(id),
  xp_total            INTEGER DEFAULT 0,
  nivel_alcanzado     TEXT DEFAULT 'Aprendiz',
  logros_json         TEXT DEFAULT '[]',
  nodos_completados   INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS hl_node_effectiveness (
  id                TEXT PRIMARY KEY,
  nodo_content_hash TEXT NOT NULL,
  agente_tipo       TEXT NOT NULL,
  tema              TEXT NOT NULL,
  tipo_pedagogico   TEXT NOT NULL,
  tipo_visual       TEXT NOT NULL,
  rango_edad        TEXT NOT NULL,
  intentos_promedio REAL DEFAULT 0,
  tasa_abandono     REAL DEFAULT 0,
  tiempo_promedio   INTEGER DEFAULT 0,
  veces_visto       INTEGER DEFAULT 0,
  veces_completado  INTEGER DEFAULT 0,
  updated_at        TEXT DEFAULT CURRENT_TIMESTAMP
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
  rango_edad      TEXT NOT NULL,
  output_json     TEXT NOT NULL,
  hits            INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at      TEXT NOT NULL
);

-- Seed inicial de temas (idempotente con INSERT OR IGNORE)
INSERT OR IGNORE INTO hl_topics (slug,titulo,nivel,categoria,keywords) VALUES
('javascript-basico','JavaScript básico','principiante','programacion','["javascript","js","variables","funciones","arrays"]'),
('python-cero','Python desde cero','principiante','programacion','["python","variables","bucles","funciones"]'),
('html-css','HTML y CSS para principiantes','principiante','programacion','["html","css","web","diseño"]'),
('typescript-intermedio','TypeScript intermedio','intermedio','programacion','["typescript","tipos","interfaces","generics"]'),
('nodejs-apis','Node.js y APIs REST','intermedio','programacion','["nodejs","api","rest","express","bun","elysia"]'),
('algoritmos','Algoritmos y estructuras de datos','avanzado','programacion','["algoritmos","arrays","arboles","grafos"]'),
('ia-basica','Inteligencia artificial básica','principiante','ia','["ia","machine learning","modelos","datos"]'),
('prompt-engineering','Prompt engineering práctico','principiante','ia','["prompts","llm","claude","gemma","chatgpt"]'),
('ml-python','Machine learning con Python','intermedio','ia','["sklearn","regresion","clasificacion","datos"]'),
('agentes-hive','Agentes de IA con Hive','intermedio','ia','["agentes","hive","enjambre","tools","skills"]'),
('sql-basico','SQL para principiantes','principiante','datos','["sql","bases de datos","consultas","tablas"]'),
('analisis-datos','Análisis de datos con Python','intermedio','datos','["pandas","numpy","matplotlib","datos"]'),
('diseno-ui','Diseño UI básico','principiante','diseno','["ui","ux","colores","tipografia","componentes"]'),
('figma-cero','Figma desde cero','principiante','diseno','["figma","prototipo","wireframe","diseño"]');
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
