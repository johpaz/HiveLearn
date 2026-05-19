/**
 * LLM Client — Entry point for all LLM calls.
 *
 * Routes calls through the rich provider adapters in llm-providers/.
 * Each adapter handles its own protocol, tool support, retry logic,
 * streaming, and provider-specific quirks.
 */
import { getDb } from '../storage/sqlite'
import { decryptApiKey } from '../crypto/decrypt'
import { getProvider } from './llm-providers/factory'

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | ContentPart[]
  tool_calls?: LLMToolCall[]
  tool_call_id?: string
  name?: string
  reasoning_content?: string
}

export interface LLMToolCall {
  id: string
  type: 'function'
  thought_signature?: string
  function: {
    name: string
    arguments: string
  }
}

export interface LLMToolDef {
  type?: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface ContentPart {
  type: 'text' | 'image_url' | 'image_base64' | 'document'
  text?: string
  image_url?: { url: string }
  base64?: string
  mimeType?: string
  fileName?: string
}

export interface ProviderConfig {
  provider: string
  model: string
  apiKey?: string
  baseUrl?: string
  numCtx?: number
  numGpu?: number
}

/**
 * Resolver configuración del provider desde la BD.
 * Lee base_url, desencripta API key, y lee num_ctx/num_gpu.
 *
 * Soporta dos modos:
 *   resolveProviderConfig(agentId)              → busca agent en DB, resuelve provider
 *   resolveProviderConfig(providerId, modelId)  → usa provider/model directamente
 */
export async function resolveProviderConfig(
  agentOrProviderId: string,
  modelId?: string
): Promise<ProviderConfig> {
  const db = getDb()

  // Intentar buscar como agentId primero
  const agent = db.query(
    'SELECT provider_id, model_id FROM hl_agents WHERE id = ? LIMIT 1'
  ).get(agentOrProviderId) as Record<string, unknown> | undefined

  let provider: string
  let model: string

  if (agent) {
    // Es un agentId
    provider = (agent.provider_id as string) || 'ollama'
    model = modelId || (agent.model_id as string) || 'gemma4-e4b'
  } else {
    // Es un providerId directo
    provider = agentOrProviderId
    model = modelId || 'gemma4-e4b'
  }

  // Leer configuración del provider desde la DB
  const row = db.query(
    'SELECT base_url, api_key_encrypted, api_key_iv, num_ctx, num_gpu FROM providers WHERE id = ?'
  ).get(provider) as Record<string, unknown> | undefined

  let apiKey: string | undefined
  if (row?.api_key_encrypted && row?.api_key_iv) {
    try {
      apiKey = decryptApiKey(row.api_key_encrypted as string, row.api_key_iv as string)
    } catch {
      // Key decryption failed — provider may not need a key (ollama, local-llama)
    }
  }

  // For Ollama, the model ID stored in hl_agents may be a sanitized form like
  // "ollama-gemma4-e4b" or the legacy default "gemma4-e4b", while the actual
  // Ollama model name (with colon tag, e.g. "gemma4:e4b") lives in models.name.
  // Look it up so we pass the correct name to the Ollama API.
  if (provider === 'ollama') {
    const modelRow = db.query(
      "SELECT name FROM models WHERE provider_id = 'ollama' AND (id = ? OR id = ?) LIMIT 1"
    ).get(model, `ollama-${model}`) as Record<string, unknown> | undefined

    if (modelRow?.name) {
      model = modelRow.name as string
    }
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl: row?.base_url as string | undefined,
    numCtx: row?.num_ctx as number | undefined,
    numGpu: row?.num_gpu as number | undefined,
  }
}

export interface LLMCallOptions {
  model: string
  messages: LLMMessage[]
  tools?: LLMToolDef[]
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  numCtx?: number
  numGpu?: number
  onToken?: (token: string) => void
  provider?: string
}

export interface LLMResponse {
  content: string
  tool_calls?: LLMToolCall[]
  stop_reason?: 'stop' | 'tool_calls' | 'length' | 'error'
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Llamar a un modelo LLM usando el adapter correcto para el provider.
 */
export async function callLLM(
  options: {
    providerId: string
    modelId: string
    messages: LLMMessage[]
    temperature?: number
    maxTokens?: number
    tools?: LLMToolDef[]
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
    onToken?: (token: string) => void
  }
): Promise<LLMResponse> {
  const config = await resolveProviderConfig(options.providerId, options.modelId)
  const provider = getProvider(config.provider)

  return provider.call({
    model: config.model,
    messages: options.messages,
    tools: options.tools,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    numCtx: config.numCtx,
    numGpu: config.numGpu,
    onToken: options.onToken,
  } as LLMCallOptions)
}
