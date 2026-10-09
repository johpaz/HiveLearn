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
