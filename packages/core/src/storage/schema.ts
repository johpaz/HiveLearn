export const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- Providers: linked to user
  -- API keys are stored securely using Bun.secrets (OS keychain)
  -- Solo la empresa (OpenAI, Groq, ElevenLabs, etc.)
  -- La API key es del provider, no del modelo
  -- category: 'llm', 'stt', 'tts' (default: llm)
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
  );

  -- Models: linked to provider
  -- model_type: 'llm', 'stt', 'tts', 'vision', 'embedding'
  -- stt models: whisper-1, whisper-large-v3
  -- tts models: tts-1, gpt-4o-mini-tts, eleven_multilingual_v2
  CREATE TABLE IF NOT EXISTS models (
    id              TEXT PRIMARY KEY,
    provider_id     TEXT REFERENCES providers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    model_type      TEXT NOT NULL DEFAULT 'llm',
    context_window  INTEGER NOT NULL DEFAULT 20000,
    capabilities    TEXT,
    enabled         INTEGER NOT NULL DEFAULT 1,
    active          INTEGER NOT NULL DEFAULT 0
  );
`;



