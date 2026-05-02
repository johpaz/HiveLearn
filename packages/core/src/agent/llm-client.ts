/**
 * LLM Client — Cliente simple para llamar a modelos de lenguaje
 * Sin dependencias externas del repositorio principal de Hive
 */
import { getDb } from '../storage/sqlite'
import { getProviderApiKey } from '../secrets/provider-secrets'

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

export interface LLMCallOptions {
  temperature?: number
  maxTokens?: number
  tools?: LLMToolDef[]
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  provider?: string
  model?: string
  apiKey?: string
  baseUrl?: string
  numCtx?: number
  numGpu?: number
  messages?: LLMMessage[]
  onToken?: (token: string) => void
  signal?: AbortSignal
  thinking?: { enabled: boolean; budget_tokens?: number }
}

export interface LLMResponse {
  content: string
  toolCalls?: Array<{
    name: string
    args: Record<string, unknown>
  }>
  tool_calls?: LLMToolCall[]
  stop_reason?: string
  reasoning_content?: string
  thinking_content?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens?: number
    input_tokens?: number
    output_tokens?: number
    thinking_tokens?: number
  }
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
 * Resolver configuración del provider desde la BD
 */
export async function resolveProviderConfig(providerId: string, modelId?: string): Promise<ProviderConfig> {
  const db = getDb()

  const agent = db.query(
    'SELECT * FROM hl_agents WHERE id = ? LIMIT 1'
  ).get(providerId) as Record<string, unknown> | undefined

  const rawModelId = modelId || (agent?.model_id as string) || 'gemma4-e4b'
  const provider = (agent?.provider_id as string) || 'ollama'

  // Para Ollama, el ID almacenado es 'ollama-gemma4-e4b' pero la API necesita
  // el nombre real 'gemma4:e4b'. Lo resolvemos desde la tabla models.
  let model = rawModelId
  if (provider === 'ollama') {
    const row = db.query('SELECT name FROM models WHERE id = ? LIMIT 1').get(rawModelId) as { name: string } | undefined
    if (row?.name) model = row.name
  }

  // Obtener API key desde Bun.secrets
  const apiKey = await getProviderApiKey(providerId)

  return {
    provider,
    model,
    apiKey: apiKey || undefined,
    baseUrl: process.env.HIVELEARN_BASE_URL,
  }
}

/**
 * Llamar a un modelo LLM
 * Implementación básica que usa fetch estándar
 */
export async function callLLM(
  options: LLMCallOptions & {
    providerId: string
    modelId: string
  }
): Promise<LLMResponse> {
  const { providerId, modelId, messages } = options
  const config = await resolveProviderConfig(providerId, modelId)

  // Determinar endpoint según el provider
  let url = options.baseUrl || config.baseUrl || 'http://localhost:11434/api/chat'

  // Local LLM (hive-cli)
  if (providerId === 'local-llama' || config.provider === 'local-llama') {
    const { LocalLlamaProvider } = await import('./llm-providers/local-llama')
    const provider = new LocalLlamaProvider()
    return provider.call(options)
  }

  // Ollama
  if (providerId === 'ollama' || config.provider === 'ollama') {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: messages?.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 2000,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM call failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as any
    return {
      content: data.message?.content || '',
      stop_reason: data.done ? 'stop' : 'length',
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    }
  }

  // OpenAI-compatible (Groq, OpenAI, etc.)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2000,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM call failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data = await response.json() as any

  const toolCalls = data.choices?.[0]?.message?.tool_calls
  const parsedToolCalls = toolCalls?.map((tc: LLMToolCall) => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments),
  }))

  return {
    content: data.choices?.[0]?.message?.content || '',
    toolCalls: parsedToolCalls,
    tool_calls: toolCalls,
    stop_reason: data.choices?.[0]?.finish_reason,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens || 0,
      completionTokens: data.usage.completion_tokens || 0,
      totalTokens: (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0),
    } : undefined,
  }
}
