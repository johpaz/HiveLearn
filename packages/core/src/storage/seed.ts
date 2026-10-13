import type { HiveDB, IndexDoc } from "@johpaz/hive-db"
import { catalogModelKey } from "../models/model-id"
import { getDb, nowIso } from "./hivedb"
import { logger } from "../utils/logger"
import * as toolCatalog from "../tools"
import * as skillCatalog from "../skills"
import type { Tool } from "../types/tool"

/**
 * Seed de datos predeterminados para Hive
 * Las tools se crean con enabled=1 (disponibles) y active=1 (activas por defecto)
 * El usuario puede desactivarlas desde la UI si no las necesita
 *
 * Motor: @johpaz/hive-db. El seed es idempotente: los catálogos se reescriben
 * en cada arranque (put-overwrite) para que los cambios de código tomen efecto.
 */

export interface SeedData {
  providers: Array<{ id: string; name: string; baseUrl?: string; category?: string }>
  models: Array<{ id: string; providerId: string; name: string; modelType: string; contextWindow?: number; capabilities?: string }>
}

interface SearchSkill {
  name: string
  version?: string
  description: string
  icon?: string
  category?: string
  tools?: string[]
  triggers?: string[]
  steps?: Array<{ name: string; description?: string }>
}

export interface ProviderDoc {
  name: string
  api_key_encrypted: string | null
  api_key_iv: string | null
  headers_encrypted: string | null
  headers_iv: string | null
  base_url: string | null
  category: string
  num_ctx: number | null
  num_gpu: number
  enabled: number
  active: number
  created_at: number
}

export interface ModelDoc {
  provider_id: string
  name: string
  model_type: string
  context_window: number
  capabilities: string | null
  enabled: number
  active: number
  /** `seed` (catálogo inicial), `sync` (sincronización con el proveedor) o `manual`. */
  source?: 'seed' | 'sync' | 'manual'
  status?: 'ok' | 'missing'
  wire_id?: string
  synced_at?: string
}

interface TopicDoc {
  titulo: string
  descripcion: string | null
  nivel: string | null
  categoria: string | null
  keywords: string
  activo: number
  created_at: string
}

export interface SearchIndexDoc {
  entidad_tipo: string
  entidad_id: string
  contenido_texto: string
  metadata_json: string | null
  created_at: string
}

/** Catálogo inicial de temas (antes seed SQL v1, INSERT OR IGNORE) */
const SEED_TOPICS: Array<{ slug: string; titulo: string; nivel: string; categoria: string; keywords: string }> = [
  { slug: 'javascript-basico', titulo: 'JavaScript básico', nivel: 'principiante', categoria: 'programacion', keywords: '["javascript","js","variables","funciones","arrays"]' },
  { slug: 'python-cero', titulo: 'Python desde cero', nivel: 'principiante', categoria: 'programacion', keywords: '["python","variables","bucles","funciones"]' },
  { slug: 'html-css', titulo: 'HTML y CSS para principiantes', nivel: 'principiante', categoria: 'programacion', keywords: '["html","css","web","diseño"]' },
  { slug: 'typescript-intermedio', titulo: 'TypeScript intermedio', nivel: 'intermedio', categoria: 'programacion', keywords: '["typescript","tipos","interfaces","generics"]' },
  { slug: 'nodejs-apis', titulo: 'Node.js y APIs REST', nivel: 'intermedio', categoria: 'programacion', keywords: '["nodejs","api","rest","express","bun","elysia"]' },
  { slug: 'algoritmos', titulo: 'Algoritmos y estructuras de datos', nivel: 'avanzado', categoria: 'programacion', keywords: '["algoritmos","arrays","arboles","grafos"]' },
  { slug: 'ia-basica', titulo: 'Inteligencia artificial básica', nivel: 'principiante', categoria: 'ia', keywords: '["ia","machine learning","modelos","datos"]' },
  { slug: 'prompt-engineering', titulo: 'Prompt engineering práctico', nivel: 'principiante', categoria: 'ia', keywords: '["prompts","llm","claude","gemma","chatgpt"]' },
  { slug: 'ml-python', titulo: 'Machine learning con Python', nivel: 'intermedio', categoria: 'ia', keywords: '["sklearn","regresion","clasificacion","datos"]' },
  { slug: 'agentes-hive', titulo: 'Agentes de IA con Hive', nivel: 'intermedio', categoria: 'ia', keywords: '["agentes","hive","enjambre","tools","skills"]' },
  { slug: 'sql-basico', titulo: 'SQL para principiantes', nivel: 'principiante', categoria: 'datos', keywords: '["sql","bases de datos","consultas","tablas"]' },
  { slug: 'analisis-datos', titulo: 'Análisis de datos con Python', nivel: 'intermedio', categoria: 'datos', keywords: '["pandas","numpy","matplotlib","datos"]' },
  { slug: 'diseno-ui', titulo: 'Diseño UI básico', nivel: 'principiante', categoria: 'diseno', keywords: '["ui","ux","colores","tipografia","componentes"]' },
  { slug: 'figma-cero', titulo: 'Figma desde cero', nivel: 'principiante', categoria: 'diseno', keywords: '["figma","prototipo","wireframe","diseño"]' },
]

export const SEED_DATA: SeedData = {
  providers: [
    { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com" },
    { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
    { id: "gemini", name: "Google Gemini" },
    { id: "mistral", name: "Mistral AI", baseUrl: "https://api.mistral.ai/v1" },
    { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
    { id: "kimi", name: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.ai/v1" },
    { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
    { id: "ollama", name: "Ollama (Local)", baseUrl: "http://localhost:11434" },
    { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
    { id: "elevenlabs", name: "ElevenLabs", baseUrl: "https://api.elevenlabs.io/v1" },
    { id: "qwen", name: "Qwen (Alibaba)", baseUrl: "https://dashscope.aliyuncs.com/api/v1" },
    { id: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1" },
    { id: "local-tts", name: "TTS Local (Piper)", baseUrl: "http://localhost:5500", category: "tts" },
    { id: "hiveagents", name: "HiveAgents", baseUrl: "https://llm.hiveagents.io/v1", category: "llm" },
  ],

  models: [
    // ── Anthropic (fuente: docs.anthropic.com/en/docs/about-claude/models) ──
    { id: "claude-opus-4-6", providerId: "anthropic", name: "Claude Opus 4.6", modelType: "llm", contextWindow: 200000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code", "reasoning"]) },
    { id: "claude-sonnet-4-6", providerId: "anthropic", name: "Claude Sonnet 4.6", modelType: "llm", contextWindow: 200000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "claude-haiku-4-5-20251001", providerId: "anthropic", name: "Claude Haiku 4.5", modelType: "llm", contextWindow: 200000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },

    // ── OpenAI (fuente: openrouter.ai/openai) ──
    // Chat / Reasoning
    { id: "gpt-4o", providerId: "openai", name: "GPT-4o", modelType: "llm", contextWindow: 128000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "gpt-4o-mini", providerId: "openai", name: "GPT-4o Mini", modelType: "llm", contextWindow: 128000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "gpt-5.4", providerId: "openai", name: "GPT-5.4", modelType: "llm", contextWindow: 1050000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "gpt-5.4-pro", providerId: "openai", name: "GPT-5.4 Pro", modelType: "llm", contextWindow: 1050000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code", "reasoning"]) },
    { id: "gpt-5.3", providerId: "openai", name: "GPT-5.3", modelType: "llm", contextWindow: 128000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "gpt-5.2", providerId: "openai", name: "GPT-5.2", modelType: "llm", contextWindow: 400000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "o4-mini", providerId: "openai", name: "o4-mini", modelType: "llm", contextWindow: 200000, capabilities: JSON.stringify(["chat", "reasoning", "streaming"]) },
    // STT / TTS
    { id: "whisper-1", providerId: "openai", name: "Whisper 1", modelType: "stt", contextWindow: 0, capabilities: JSON.stringify(["transcription", "translation"]) },
    { id: "tts-1", providerId: "openai", name: "TTS-1", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech"]) },
    { id: "tts-1-hd", providerId: "openai", name: "TTS-1 HD", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "high_quality"]) },
    { id: "gpt-4o-mini-tts", providerId: "openai", name: "GPT-4o Mini TTS", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech"]) },

    // ── Google Gemini (fuente: openrouter.ai/google + ai.google.dev) ──
    { id: "gemini-3.1-pro-preview", providerId: "gemini", name: "Gemini 3.1 Pro Preview", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "reasoning"]) },
    { id: "gemini-3.1-flash-lite-preview", providerId: "gemini", name: "Gemini 3.1 Flash Lite Preview", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "gemini-3-flash-preview", providerId: "gemini", name: "Gemini 3 Flash Preview", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "gemini-2.5-pro", providerId: "gemini", name: "Gemini 2.5 Pro", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "reasoning"]) },
    { id: "gemini-2.5-flash", providerId: "gemini", name: "Gemini 2.5 Flash", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "reasoning"]) },
    { id: "gemini-2.0-flash", providerId: "gemini", name: "Gemini 2.0 Flash", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "gemini-2.0-flash-lite", providerId: "gemini", name: "Gemini 2.0 Flash Lite", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },


    // TTS
    { id: "gemini-2.5-flash-preview-tts", providerId: "gemini", name: "Gemini 2.5 Flash TTS", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech"]) },
    { id: "gemini-2.5-pro-preview-tts", providerId: "gemini", name: "Gemini 2.5 Pro TTS", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "high_quality"]) },

    // ── Mistral (fuente: openrouter.ai/mistralai + docs.mistral.ai) ──
    { id: "mistral-large-2512", providerId: "mistral", name: "Mistral Large 2512", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "devstral-2512", providerId: "mistral", name: "Devstral 2512", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "code", "function_calling", "streaming"]) },
    { id: "ministral-14b-2512", providerId: "mistral", name: "Ministral 14B", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "ministral-8b-2512", providerId: "mistral", name: "Ministral 8B", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "codestral-2508", providerId: "mistral", name: "Codestral 2508", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "code", "function_calling", "streaming"]) },
    { id: "mistral-small-3.2-24b-instruct", providerId: "mistral", name: "Mistral Small 3.2 24B", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    // Aliases (siguen funcionando en la API de Mistral)
    { id: "mistral-large-latest", providerId: "mistral", name: "Mistral Large (latest)", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "codestral-latest", providerId: "mistral", name: "Codestral (latest)", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "code", "function_calling", "streaming"]) },

    // ── DeepSeek (fuente: api-docs.deepseek.com/quick_start/pricing) ──
    // deepseek-chat = DeepSeek-V3.2, deepseek-reasoner = V3.2 thinking mode
    { id: "deepseek-chat", providerId: "deepseek", name: "DeepSeek-V3.2", modelType: "llm", contextWindow: 128000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "deepseek-reasoner", providerId: "deepseek", name: "DeepSeek-V3.2 Thinking", modelType: "llm", contextWindow: 128000, capabilities: JSON.stringify(["chat", "reasoning", "streaming"]) },

    // ── Kimi / Moonshot (fuente: openrouter.ai/moonshotai + platform.moonshot.cn) ──
    { id: "kimi-k2.5", providerId: "kimi", name: "Kimi K2.5", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "kimi-k2", providerId: "kimi", name: "Kimi K2", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "moonshot-v1-8k", providerId: "kimi", name: "Moonshot V1 8K", modelType: "llm", contextWindow: 8000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "moonshot-v1-32k", providerId: "kimi", name: "Moonshot V1 32K", modelType: "llm", contextWindow: 32000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "moonshot-v1-128k", providerId: "kimi", name: "Moonshot V1 128K", modelType: "llm", contextWindow: 128000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },

    // ── OpenRouter — selección de modelos populares ──
    // Anthropic
    { id: "anthropic/claude-opus-4-6", providerId: "openrouter", name: "Claude Opus 4.6 (OR)", modelType: "llm", contextWindow: 200000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code", "reasoning"]) },
    { id: "anthropic/claude-sonnet-4-6", providerId: "openrouter", name: "Claude Sonnet 4.6 (OR)", modelType: "llm", contextWindow: 200000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    // OpenAI
    { id: "openai/gpt-5.4", providerId: "openrouter", name: "GPT-5.4 (OR)", modelType: "llm", contextWindow: 1050000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "openai/gpt-5.4-pro", providerId: "openrouter", name: "GPT-5.4 Pro (OR)", modelType: "llm", contextWindow: 1050000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code", "reasoning"]) },
    { id: "openai/gpt-5.2", providerId: "openrouter", name: "GPT-5.2 (OR)", modelType: "llm", contextWindow: 400000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    // Google
    { id: "google/gemini-3.1-pro-preview", providerId: "openrouter", name: "Gemini 3.1 Pro (OR)", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "reasoning"]) },
    { id: "google/gemini-3.1-flash-lite-preview", providerId: "openrouter", name: "Gemini 3.1 Flash Lite (OR)", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "google/gemini-3-flash-preview", providerId: "openrouter", name: "Gemini 3 Flash (OR)", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "google/gemini-2.5-flash", providerId: "openrouter", name: "Gemini 2.5 Flash (OR)", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    // Meta Llama
    { id: "meta-llama/llama-3.3-70b-instruct", providerId: "openrouter", name: "Llama 3.3 70B", modelType: "llm", contextWindow: 128000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "meta-llama/llama-4-maverick", providerId: "openrouter", name: "Llama 4 Maverick", modelType: "llm", contextWindow: 524288, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    // DeepSeek
    { id: "deepseek/deepseek-v3.2", providerId: "openrouter", name: "DeepSeek V3.2 (OR)", modelType: "llm", contextWindow: 163840, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "deepseek/deepseek-r1:free", providerId: "openrouter", name: "DeepSeek R1 (Free)", modelType: "llm", contextWindow: 64000, capabilities: JSON.stringify(["chat", "reasoning", "streaming"]) },
    // Kimi
    { id: "moonshotai/kimi-k2.5", providerId: "openrouter", name: "Kimi K2.5 (OR)", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming", "code"]) },
    // Qwen
    { id: "qwen/qwen3.5-plus-02-15", providerId: "openrouter", name: "Qwen3.5 Plus", modelType: "llm", contextWindow: 1000000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming", "reasoning"]) },
    { id: "qwen/qwen3.5-flash-02-23", providerId: "openrouter", name: "Qwen3.5 Flash", modelType: "llm", contextWindow: 1000000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "qwen/qwen3-next-80b-a3b-instruct:free", providerId: "openrouter", name: "Qwen3 Next 80B", modelType: "llm", contextWindow: 1000000, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "qwen/qwen3-coder:free", providerId: "openrouter", name: "Qwen3 Coder", modelType: "llm", contextWindow: 1000000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },


    // ── Groq (fuente: console.groq.com/docs/models) ──
    { id: "llama-3.3-70b-versatile", providerId: "groq", name: "Llama 3.3 70B", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "llama-3.1-8b-instant", providerId: "groq", name: "Llama 3.1 8B Instant", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "openai/gpt-oss-120b", providerId: "groq", name: "GPT OSS 120B", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "openai/gpt-oss-20b", providerId: "groq", name: "GPT OSS 20B", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "groq/compound", providerId: "groq", name: "Groq Compound", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "groq/compound-mini", providerId: "groq", name: "Groq Compound Mini", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "moonshotai/kimi-k2-instruct-0905", providerId: "groq", name: "Kimi K2 (Groq)", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "qwen/qwen3-32b", providerId: "groq", name: "Qwen3 32B (Groq)", modelType: "llm", contextWindow: 128000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming", "reasoning"]) },
    { id: "whisper-large-v3", providerId: "groq", name: "Whisper Large V3", modelType: "stt", contextWindow: 0, capabilities: JSON.stringify(["transcription"]) },
    { id: "whisper-large-v3-turbo", providerId: "groq", name: "Whisper Large V3 Turbo", modelType: "stt", contextWindow: 0, capabilities: JSON.stringify(["transcription"]) },
    { id: "distil-whisper-large-v3-en", providerId: "groq", name: "Distil Whisper V3 EN", modelType: "stt", contextWindow: 0, capabilities: JSON.stringify(["transcription", "english"]) },

    // ── Ollama: models are detected at runtime via /api/setup/ollama-models and inserted dynamically ──

    // ── ElevenLabs (TTS) ──
    { id: "eleven_flash_v2_5", providerId: "elevenlabs", name: "Eleven Flash V2.5", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "fast"]) },
    { id: "eleven_turbo_v2_5", providerId: "elevenlabs", name: "Eleven Turbo V2.5", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "balanced"]) },
    { id: "eleven_multilingual_v2", providerId: "elevenlabs", name: "Eleven Multilingual V2", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "multilingual"]) },
    { id: "eleven_v3", providerId: "elevenlabs", name: "Eleven V3", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "expressive"]) },

    // ── Qwen (TTS) ──
    { id: "qwen3-tts-instruct-flash", providerId: "qwen", name: "Qwen TTS Instruct Flash", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech"]) },
    { id: "qwen3-tts-flash", providerId: "qwen", name: "Qwen TTS Flash", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech"]) },
    { id: "qwen-tts", providerId: "qwen", name: "Qwen TTS", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech"]) },

    // ── TTS Local (Piper) — Voces offline en español ──
    { id: "sorah", providerId: "local-tts", name: "Sorah (ES)", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "offline", "local", "spanish"]) },
    { id: "es_MX-cortana", providerId: "local-tts", name: "Cortana (ES-MX)", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "offline", "local", "spanish", "mexican"]) },

    // ── NVIDIA NIM (fuente: build.nvidia.com — modelos con endpoint gratuito) ──
    { id: "meta/llama-3.3-70b-instruct", providerId: "nvidia", name: "Llama 3.3 70B (NVIDIA)", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "meta/llama-4-maverick-17b-128e-instruct", providerId: "nvidia", name: "Llama 4 Maverick (NVIDIA)", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "nvidia/llama-3.1-nemotron-ultra-253b-v1", providerId: "nvidia", name: "Nemotron Ultra 253B", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming", "reasoning"]) },
    { id: "nvidia/llama-3.1-nemotron-70b-instruct", providerId: "nvidia", name: "Nemotron 70B", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "deepseek-ai/deepseek-v3.2", providerId: "nvidia", name: "DeepSeek V3.2 (NVIDIA)", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "qwen/qwen3-coder-480b-a35b-instruct", providerId: "nvidia", name: "Qwen3 Coder 480B (NVIDIA)", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming", "code"]) },
    { id: "qwen/qwen3.5-397b-a17b", providerId: "nvidia", name: "Qwen3.5 397B (NVIDIA)", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "moonshotai/kimi-k2-thinking", providerId: "nvidia", name: "Kimi K2 Thinking (NVIDIA)", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "reasoning", "function_calling", "streaming"]) },
    { id: "mistralai/mistral-large-3-675b-instruct-2512", providerId: "nvidia", name: "Mistral Large 3 (NVIDIA)", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "google/gemma-4-31b-it", providerId: "nvidia", name: "Gemma 4 31B (NVIDIA)", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "google/gemma-3-27b-it", providerId: "nvidia", name: "Gemma 3 27B (NVIDIA)", modelType: "llm", contextWindow: 262144, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "z-ai/glm-5.1", providerId: "nvidia", name: "GLM 5.1 (NVIDIA)", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },

    // ── HiveAgents (backend GGUF propio) ──
    { id: "Qwen3.6-35B-A3B-UD-Q6_K.gguf",    providerId: "hiveagents", name: "Qwen3.6 35B MoE (Recomendado)", modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming", "reasoning"]) },
    { id: "Qwen3.8-27B-UD-Q6_K_XL.gguf", providerId: "hiveagents", name: "Qwen3.8 27B Q6_K_XL (probado con HiveLearn)", modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming", "reasoning"]) },
    { id: "Qwen3.5-9B-UD-Q8_K_XL.gguf", providerId: "hiveagents", name: "Qwen3.5 9B Q8_K_XL (rápido)", modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming", "reasoning"]) },
    { id: "gemma-4-12b-it-UD-Q8_K_XL.gguf", providerId: "hiveagents", name: "Gemma 4 12B Q8_K_XL", modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming", "reasoning"]) },
    { id: "Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",   providerId: "hiveagents", name: "Qwen3.6 35B MoE Q4_K_M",        modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming", "reasoning"]) },
    { id: "Qwen3.6-27B-UD-Q4_K_XL.gguf",      providerId: "hiveagents", name: "Qwen3.6 27B + MTP",             modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming", "reasoning"]) },
    { id: "Qwen3-Coder-Next-UD-Q4_K_M.gguf",  providerId: "hiveagents", name: "Qwen3 Coder Next",              modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming", "code"]) },
    { id: "Qwopus3.6-27B-v2-MTP-Q6_K.gguf",   providerId: "hiveagents", name: "Qwopus 3.6 27B MTP Q6_K",       modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming", "reasoning"]) },
    { id: "Qwopus3.6-27B-v2-MTP-Q4_K_S.gguf", providerId: "hiveagents", name: "Qwopus 3.6 27B MTP Q4_K_S",     modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming", "reasoning"]) },
    { id: "gemma-4-31B-it-UD-Q4_K_XL.gguf",   providerId: "hiveagents", name: "Gemma 4 31B Dense",             modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming"]) },
    { id: "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf", providerId: "hiveagents", name: "Gemma 4 26B MoE",               modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming"]) },
    { id: "gemma-4-12b-it-UD-Q4_K_XL.gguf",   providerId: "hiveagents", name: "Gemma 4 12B Dense",             modelType: "llm", contextWindow: 50000, capabilities: JSON.stringify(["chat", "streaming"]) },
  ],


}


const log = logger.child("seed");

function isToolCandidate(value: unknown): value is Tool {
  return !!value
    && typeof value === "object"
    && typeof (value as Tool).name === "string"
    && typeof (value as Tool).description === "string"
    && !!(value as Tool).parameters
}

function isSkillCandidate(value: unknown): value is SearchSkill {
  return !!value
    && typeof value === "object"
    && typeof (value as SearchSkill).name === "string"
    && typeof (value as SearchSkill).description === "string"
}

function buildToolSearchText(tool: Tool): string {
  const props = Object.entries(tool.parameters?.properties ?? {}).map(([key, def]) => {
    const parts = [key, def.description ?? "", def.type ?? ""].filter(Boolean)
    return parts.join(" ")
  })
  const required = tool.parameters?.required?.join(" ") ?? ""
  return [
    tool.name,
    tool.description,
    props.join(" "),
    required,
  ].filter(Boolean).join("\n")
}

function buildSkillSearchText(skill: SearchSkill): string {
  return [
    skill.name,
    skill.description,
    skill.category ?? "",
    (skill.tools ?? []).join(" "),
    (skill.triggers ?? []).join(" "),
    (skill.steps ?? []).map(step => `${step.name} ${step.description ?? ""}`).join(" "),
  ].filter(Boolean).join("\n")
}

/** Proveedores que ya no forman parte del catálogo. */
const RETIRED_PROVIDERS = ["local-llama"]

async function removeRetiredProviders(db: HiveDB): Promise<void> {
  for (const providerId of RETIRED_PROVIDERS) {
    const provider = await db.collection("providers").get(providerId)
    const models = (await db.collection<ModelDoc>("models").scan()).filter(e => e.doc.provider_id === providerId)
    if (!provider && models.length === 0) continue
    const agents = (await db.collection<{ provider_id: string | null }>("hl_agents").scan()).filter(a => a.doc.provider_id === providerId)
    const settings = (await db.collection<Record<string, unknown>>("hl_portal_settings").scan())
      .filter(e => Object.values(e.doc).includes(providerId))
    if (agents.length > 0 || settings.length > 0) {
      log.warn(`[seed] proveedor retirado "${providerId}" sigue en uso (${agents.length} agentes, ${settings.length} ajustes): elige otro modelo y se eliminará en el próximo arranque`)
      continue
    }
    for (const model of models) await db.collection("models").delete(model.id)
    if (provider) await db.collection("providers").delete(providerId)
    log.info(`[seed] proveedor retirado "${providerId}" eliminado con ${models.length} modelos`)
  }
}

async function seedSearchIndex(): Promise<void> {
  const db = getDb()
  const tools = Object.values(toolCatalog).filter(isToolCandidate)
  const skills = Object.values(skillCatalog).filter(isSkillCandidate)
  const searchCol = db.collection<SearchIndexDoc>("hl_search_index")

  // Limpiar entradas previas del índice (tool/skill) en ambos motores
  const previous = await searchCol.scan()
  for (const entry of previous) {
    if (entry.doc.entidad_tipo === "tool" || entry.doc.entidad_tipo === "skill") {
      await searchCol.delete(entry.id)
    }
  }
  await db.deleteByFilter({ field: "type", value: "tool" })
  await db.deleteByFilter({ field: "type", value: "skill" })

  const indexDocs: IndexDoc[] = []

  for (const tool of tools) {
    const metadata = JSON.stringify({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      source: "seed",
    })
    const content = buildToolSearchText(tool)
    await searchCol.put(`tool:${tool.name}`, {
      entidad_tipo: "tool",
      entidad_id: tool.name,
      contenido_texto: content,
      metadata_json: metadata,
      created_at: nowIso(),
    })
    indexDocs.push({
      id: `tool:${tool.name}`,
      name: tool.name,
      body: content,
      tags: `tool ${tool.name.replace(/_/g, " ")}`,
      filters: [{ field: "type", value: "tool" }],
    })
  }

  for (const skill of skills) {
    const metadata = JSON.stringify({
      name: skill.name,
      version: skill.version ?? null,
      description: skill.description,
      category: skill.category ?? null,
      icon: skill.icon ?? null,
      tools: skill.tools ?? [],
      triggers: skill.triggers ?? [],
      steps: skill.steps ?? [],
      source: "seed",
    })
    const content = buildSkillSearchText(skill)
    await searchCol.put(`skill:${skill.name}`, {
      entidad_tipo: "skill",
      entidad_id: skill.name,
      contenido_texto: content,
      metadata_json: metadata,
      created_at: nowIso(),
    })
    indexDocs.push({
      id: `skill:${skill.name}`,
      name: skill.name,
      body: content,
      tags: ["skill", skill.category ?? "", ...(skill.triggers ?? [])].filter(Boolean).join(" "),
      filters: [{ field: "type", value: "skill" }],
    })
  }

  if (indexDocs.length > 0) {
    await db.upsertBatch(indexDocs)
  }
  log.info(`[seed] ✅ Índice semántico actualizado con ${tools.length} tools y ${skills.length} skills`)
}

/** Seed del catálogo de temas (INSERT OR IGNORE — no pisa cambios manuales) */
async function seedTopics(): Promise<void> {
  const topics = getDb().collection<TopicDoc>("hl_topics")
  for (const topic of SEED_TOPICS) {
    const existing = await topics.get(topic.slug)
    if (existing) continue
    await topics.put(topic.slug, {
      titulo: topic.titulo,
      descripcion: null,
      nivel: topic.nivel,
      categoria: topic.categoria,
      keywords: topic.keywords,
      activo: 1,
      created_at: nowIso(),
    })
  }
}

export async function seedAllData(): Promise<void> {
  const db = getDb()

  log.info("[seed] 🌱 Iniciando seed de datos predeterminados...")
  log.info(`[seed] SEED_DATA.models.length = ${SEED_DATA.models.length}`)

  try {
    // 0️⃣ Topics educativos
    await seedTopics()

    // 1️⃣ Providers (INSERT OR IGNORE — no pisa API keys ni base_url del usuario)
    const providers = db.collection<ProviderDoc>("providers")
    let providerCount = 0;
    for (const provider of SEED_DATA.providers) {
      const existing = await providers.get(provider.id)
      if (!existing) {
        await providers.put(provider.id, {
          name: provider.name,
          api_key_encrypted: null,
          api_key_iv: null,
          headers_encrypted: null,
          headers_iv: null,
          base_url: provider.baseUrl || null,
          category: provider.category || 'llm',
          num_ctx: null,
          num_gpu: -1,
          enabled: 1,
          active: 0,
          created_at: Math.floor(Date.now() / 1000),
        })
      }
      providerCount++;
    }
    // If OLLAMA_HOST is set (e.g. Docker pointing to host machine), always update Ollama's base_url
    const ollamaHost = process.env.OLLAMA_HOST;
    if (ollamaHost) {
      const ollama = await providers.get('ollama')
      if (ollama) {
        await providers.put('ollama', { ...ollama.doc, base_url: ollamaHost })
      }
      log.info(`[seed] ✅ Ollama base_url set to ${ollamaHost} (from OLLAMA_HOST env)`);
    }
    log.info(`[seed] ✅ ${providerCount} providers procesados`);

    // Proveedores retirados del catálogo (LocalLLM): se quitan con sus modelos si nada los usa.
    await removeRetiredProviders(db)

    // Los revendedores guardan su id con prefijo (`openrouter/anthropic/claude-…`): se migran los antiguos
    // antes de sembrar, o el seed volvería a crear las filas sin prefijo.
    const { migrateResellerIds } = await import("../models/sync")
    await migrateResellerIds(db)

    // 2️⃣ Models: catálogo inicial, SOLO la primera vez por proveedor.
    // La fuente de verdad pasa a ser la base, que mantiene `models/sync.ts` con lo que cada proveedor sirve hoy.
    // Si el seed volviera a insertar esta lista en cada arranque, resucitaría los modelos que la sincronización retiró.
    const models = db.collection<ModelDoc>("models")
    const seedState = db.collection<{ seededAt: string }>("hl_seed_state")
    const allModels = await models.scan()
    const hasRows = new Set(allModels.map(e => e.doc.provider_id))
    const seededProviders = new Set<string>()
    for (const providerId of new Set(SEED_DATA.models.map(m => m.providerId))) {
      const marker = await seedState.get(`models:${providerId}`)
      if (!marker) {
        // Primera vez: se siembra solo si el proveedor aún no tiene filas (una base anterior ya las tiene).
        if (!hasRows.has(providerId)) seededProviders.add(providerId)
        await seedState.put(`models:${providerId}`, { seededAt: new Date().toISOString() })
      }
    }
    let modelCount = 0;
    const insertedModels: string[] = [];
    const skippedModels: string[] = [];
    for (const model of SEED_DATA.models) {
      if (!seededProviders.has(model.providerId)) continue
      try {
        const rowId = catalogModelKey(model.providerId, model.id)
        const existing = await models.get(rowId)
        if (!existing) {
          await models.put(rowId, {
            provider_id: model.providerId,
            name: model.name,
            model_type: model.modelType,
            context_window: model.contextWindow ?? 20000,
            capabilities: model.capabilities ?? null,
            enabled: 1,
            active: 0,
            source: 'seed',
            wire_id: model.id,
          } as ModelDoc)
        }
        modelCount++;
        // Verificar si el modelo existe después del insert
        const exists = await models.get(rowId);
        if (exists) insertedModels.push(rowId);
        else skippedModels.push(rowId);
      } catch (err) {
        log.error(`[seed] ❌ Error insertando modelo ${model.id}: ${(err as Error).message}`);
        skippedModels.push(model.id);
        modelCount++;
      }
    }
    if (skippedModels.length > 0) {
      log.warn(`[seed] ⚠️  ${skippedModels.length} models saltados: ${skippedModels.join(', ')}`);
    }
    log.info(`[seed] ✅ ${modelCount} models procesados, ${insertedModels.length} insertados`);
    await seedSearchIndex()


  } catch (err) {
    log.error("[seed] ❌ Error durante el seed:", (err as Error).message);
  }
}

