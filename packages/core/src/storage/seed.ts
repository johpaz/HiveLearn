import { getDb } from "./sqlite"
import { logger } from "../utils/logger"

/**
 * Seed de datos predeterminados para Hive
 * Las tools se crean con enabled=1 (disponibles) y active=1 (activas por defecto)
 * El usuario puede desactivarlas desde la UI si no las necesita
 */

export interface SeedData {
  providers: Array<{ id: string; name: string; baseUrl?: string; category?: string }>
  models: Array<{ id: string; providerId: string; name: string; modelType: string; contextWindow?: number; capabilities?: string }>
}

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
    { id: "local-llama", name: "Local LLM (llama-server)", baseUrl: "http://localhost:8080/v1" },
    { id: "elevenlabs", name: "ElevenLabs", baseUrl: "https://api.elevenlabs.io/v1" },
    { id: "qwen", name: "Qwen (Alibaba)", baseUrl: "https://dashscope.aliyuncs.com/api/v1" },
    { id: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1" },
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
    { id: "gemini-3-flash-preview", providerId: "gemini", name: "Gemini 3 Flash Preview", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },


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
    { id: "google/gemini-3-flash-preview", providerId: "openrouter", name: "Gemini 3 Flash (OR)", modelType: "llm", contextWindow: 1048576, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
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
    { id: "qwen/qwen3.5-flash-02-23", providerId: "openrouter", name: "Qwen3.5 Flash", modelType: "llm", contextWindow: 1000000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
    { id: "qwen/qwen3-next-80b-a3b-instruct:free", providerId: "openrouter", name: "Qwen3 Next 80B", modelType: "llm", contextWindow: 1000000, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
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

    // ── Local LLM (llama-server): model detected at runtime via sync ──
    { id: "local-model", providerId: "local-llama", name: "Local Model (auto-detected)", modelType: "llm", contextWindow: 32768, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },

    // ── ElevenLabs (TTS) ──
    { id: "eleven_flash_v2_5", providerId: "elevenlabs", name: "Eleven Flash V2.5", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "fast"]) },
    { id: "eleven_turbo_v2_5", providerId: "elevenlabs", name: "Eleven Turbo V2.5", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "balanced"]) },
    { id: "eleven_multilingual_v2", providerId: "elevenlabs", name: "Eleven Multilingual V2", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "multilingual"]) },
    { id: "eleven_v3", providerId: "elevenlabs", name: "Eleven V3", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech", "expressive"]) },

    // ── Qwen (TTS) ──
    { id: "qwen3-tts-instruct-flash", providerId: "qwen", name: "Qwen TTS Instruct Flash", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech"]) },
    { id: "qwen3-tts-flash", providerId: "qwen", name: "Qwen TTS Flash", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech"]) },
    { id: "qwen-tts", providerId: "qwen", name: "Qwen TTS", modelType: "tts", contextWindow: 0, capabilities: JSON.stringify(["tts", "speech"]) },

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
    { id: "google/gemma-3-27b-it", providerId: "nvidia", name: "Gemma 3 27B (NVIDIA)", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "vision", "json_mode", "function_calling", "streaming"]) },
    { id: "z-ai/glm-5.1", providerId: "nvidia", name: "GLM 5.1 (NVIDIA)", modelType: "llm", contextWindow: 131072, capabilities: JSON.stringify(["chat", "json_mode", "function_calling", "streaming"]) },
  ],


}


const log = logger.child("seed");

// Initial playbook rules for ACE (Agentic Context Engineering)





export function seedAllData(): void {
  const db = getDb()

  log.info("[seed] 🌱 Iniciando seed de datos predeterminados...")



  try {

    // 1️⃣ Providers
    let providerCount = 0;
    for (const provider of SEED_DATA.providers) {
      db.query(`
        INSERT OR IGNORE INTO providers (id, name, base_url, category, enabled, active)
        VALUES (?, ?, ?, ?, 1, 0)
      `).run(provider.id, provider.name, provider.baseUrl || null, provider.category || 'llm')
      providerCount++;
    }
    // If OLLAMA_HOST is set (e.g. Docker pointing to host machine), always update Ollama's base_url
    const ollamaHost = process.env.OLLAMA_HOST;
    if (ollamaHost) {
      db.query(`UPDATE providers SET base_url = ? WHERE id = 'ollama'`).run(ollamaHost);
      log.info(`[seed] ✅ Ollama base_url set to ${ollamaHost} (from OLLAMA_HOST env)`);
    }
    log.info(`[seed] ✅ ${providerCount} providers procesados`);

    // 2️⃣ Models
    let modelCount = 0;
    for (const model of SEED_DATA.models) {
      db.query(`
        INSERT OR IGNORE INTO models (id, provider_id, name, model_type, context_window, capabilities, enabled, active)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0)
      `).run(model.id, model.providerId, model.name, model.modelType, model.contextWindow || null, model.capabilities || null)
      modelCount++;
    }
    log.info(`[seed] ✅ ${modelCount} models procesados`);


  } catch (err) {
    log.error("[seed] ❌ Error durante el seed:", (err as Error).message);
  }
}

export function seedToolsAndSkills(): void {
  seedAllData()
}

/**
 * Activa un elemento específico (los datos son globales, solo actualizamos active)
 */
export function activateElement(
  table: "providers" | "models",
  elementId: string
): void {
  const db = getDb()
  db.query(`UPDATE ${table} SET active = 1, enabled = 1 WHERE id = ?`).run(elementId)
  log.info(`[seed] ✅ Activado ${elementId} en ${table}`)
}

/**
 * Desactiva un elemento específico
 */
export function deactivateElement(
  table: "providers" | "models" | "tools" | "skills" | "mcp_servers" | "channels",
  elementId: string
): void {
  const db = getDb()
  db.query(`UPDATE ${table} SET active = 0, enabled = 0 WHERE id = ?`).run(elementId)
  log.warn(`[seed] ⚠️  Desactivado ${elementId} en ${table}`)
}

/**
 * Obtiene todos los elementos disponibles (activos e inactivos)
 */
export function getAllElements<T extends Record<string, any>>(
  table: string
): T[] {
  const db = getDb()
  const results = db.query<T, []>(`SELECT * FROM ${table}`).all()
  return results
}

/**
 * Obtiene todos los elementos activos
 */
export function getActiveElements<T extends Record<string, any>>(
  table: string
): T[] {
  const db = getDb()
  const results = db.query<T, []>(`SELECT * FROM ${table} WHERE active = 1`).all()
  return results
}
