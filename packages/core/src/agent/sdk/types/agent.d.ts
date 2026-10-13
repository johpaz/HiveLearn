/**
 * Superficie mínima de `@johpaz/hive-sdk/agent` que usa HiveLearn. Solo para `tsc` (ver tsconfig.typecheck.json):
 * el SDK se publica como `.ts` sin compilar y, si `tsc` lo recorre, reporta errores ajenos.
 */
export interface JevShare {
  instructions?: boolean
  history?: boolean
  toolResults?: boolean
}
export interface JevVerify {
  tools?: boolean
  answer?: boolean
  maxCorrections?: number
}
export type JevOption =
  | {
      provider?: 'auto' | 'openrouter' | 'hiveagents'
      apiKey?: string
      endpoint?: string
      model?: string
      share?: JevShare
      verify?: JevVerify
    }
  | false
export type OracleOption = JevOption

export interface ProviderCredentials {
  apiKey?: string
  baseUrl?: string
}

export interface StreamChunk {
  agent?: { messages: Array<{ content?: unknown }>; streamed?: boolean }
  tools?: { messages: unknown[] }
  usage?: {
    input_tokens: number
    output_tokens: number
    iterations?: number
    tool_calls?: number
    elapsed_ms?: number
    oracle_corrections?: number
    oracle_unsatisfied?: boolean
  }
}

export interface AgentLoopOptions {
  agentId: string
  userMessage: string
  threadId: string
  isolated?: boolean
  taskContext?: string
  systemPromptOverride?: string
  signal?: AbortSignal
  credentials?: ProviderCredentials
  jev?: JevOption
  budget?: { maxIterations?: number; maxTurns?: number | null; maxTokens?: number | null }
  durable?: boolean
  onToken?: (token: string) => void
}

export function runAgent(opts: AgentLoopOptions): AsyncGenerator<StreamChunk>
export function flushTraces(): Promise<void>

export type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
export type JevAnswer =
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'noul'; noul: number }
export interface JevResult {
  answers: Record<string, JevAnswer>
  inputTokens: number
  costUsd: number
  latencyMs: number
}
export function askJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options?: { fetcher?: typeof fetch; signal?: AbortSignal; jev?: JevOption },
): Promise<JevResult | null>

/** `callLLM` del SDK: un proveedor, una llamada. No lanza: un fallo vuelve como `stop_reason: "error"`. */
export interface SdkLLMCallOptions {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  numCtx?: number
  numGpu?: number
  messages: unknown[]
  tools?: unknown[]
  temperature?: number
  maxTokens?: number
  onToken?: (token: string) => void
  signal?: AbortSignal
  thinking?: { enabled: boolean; budget_tokens?: number }
}
export interface SdkLLMResponse {
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; thought_signature?: string; function: { name: string; arguments: string } }>
  stop_reason: 'stop' | 'tool_calls' | 'max_tokens' | 'error'
  usage?: { input_tokens: number; output_tokens: number; thinking_tokens?: number }
  reasoning_content?: string
  thinking_content?: string
  error?: { message: string; status?: number; modelUnavailable?: boolean }
}
export function callLLM(options: SdkLLMCallOptions): Promise<SdkLLMResponse>
