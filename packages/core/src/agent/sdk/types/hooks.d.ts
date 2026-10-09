/**
 * Superficie mínima de `@johpaz/hive-sdk/hooks` que usa HiveLearn. Solo para `tsc` (ver tsconfig.typecheck.json).
 */
export interface ToolCallContext {
  toolName: string
  args: Record<string, unknown>
  agentId?: string
  userId?: string
  threadId?: string
}
export type BeforeToolCallResult = void | undefined | { block: true; reason: string }
export function registerHook(name: 'beforeToolCall', fn: (ctx: ToolCallContext) => BeforeToolCallResult | Promise<BeforeToolCallResult>): () => void
