/**
 * Puente de tools HiveLearn → SDK.
 *
 * El registro de tools de app del SDK (`registerAppTool`) es global y por nombre, pero varias tools de
 * HiveLearn son closures por sesión (`enviar_interaccion` captura el WebSocket del alumno). Si dos
 * lecciones corrieran a la vez, la segunda pisaría a la primera.
 *
 * Solución: se registra UNA tool estable por nombre cuyo `execute` solo enruta. La ejecución concreta
 * se busca por el `thread_id` que el SDK pasa en `config` — único por ejecución — en un mapa de handlers.
 */
import type { Tool } from '../../types/tool'

export type ToolHandler = (args: Record<string, unknown>) => Promise<string | object>

/** threadId de la ejecución → nombre de tool → handler. */
const handlers = new Map<string, Map<string, ToolHandler>>()
/** threadId de la ejecución → nombres de las tools que ESA ejecución puede usar. */
const allowedTools = new Map<string, Set<string>>()
/** nombre de tool → firma con la que está registrada en el SDK. */
const registered = new Map<string, string>()

/**
 * Tiempo máximo por tool. `enviar_interaccion` espera hasta 5 min la respuesta del alumno y
 * `delegar_a_enjambre` ejecuta todo el enjambre. El valor por defecto del SDK (5 min) cortaría a ambas.
 */
const TOOL_TIMEOUT_MS: Record<string, number> = {
  enviar_interaccion: 6 * 60_000,
  delegar_a_enjambre: 30 * 60_000,
}
const DEFAULT_TOOL_TIMEOUT_MS = 6 * 60_000

function signatureOf(tool: Tool): string {
  return JSON.stringify([tool.description ?? '', tool.parameters])
}

async function ensureRegistered(tool: Tool): Promise<void> {
  const signature = signatureOf(tool)
  if (registered.get(tool.name) === signature) return

  const { registerAppTool } = await import('@johpaz/hive-sdk/tools')
  registerAppTool({
    name: tool.name,
    description: tool.description ?? '',
    parameters: tool.parameters as never,
    timeoutMs: TOOL_TIMEOUT_MS[tool.name] ?? DEFAULT_TOOL_TIMEOUT_MS,
    execute: async (params, config) => {
      // El SDK entrega el contexto de la llamada en `config.configurable` (thread_id, agent_id, run_id…).
      const threadId = String(config?.configurable?.thread_id ?? config?.thread_id ?? '')
      const handler = handlers.get(threadId)?.get(tool.name)
      if (!handler) return { ok: false, error: `La tool ${tool.name} no está disponible en esta ejecución.` }
      return handler(params)
    },
  })
  registered.set(tool.name, signature)
}

/**
 * Asocia los handlers de una ejecución a su `threadId` y registra las tools en el SDK.
 * Devuelve la función que libera la asociación.
 */
export async function bindRunTools(threadId: string, tools: Tool[], handler: (tool: Tool, args: Record<string, unknown>) => Promise<string | object>): Promise<() => void> {
  for (const tool of tools) await ensureRegistered(tool)
  handlers.set(threadId, new Map(tools.map(tool => [tool.name, (args: Record<string, unknown>) => handler(tool, args)])))
  allowedTools.set(threadId, new Set(tools.map(tool => tool.name)))
  return () => {
    handlers.delete(threadId)
    allowedTools.delete(threadId)
  }
}

/**
 * ¿Puede la ejecución `threadId` llamar a `toolName`? `null` si el hilo no es de una ejecución de HiveLearn
 * (el hook no debe opinar sobre hilos ajenos).
 */
export function isToolAllowedInRun(threadId: string | undefined, toolName: string): boolean | null {
  const allowed = threadId ? allowedTools.get(threadId) : undefined
  return allowed ? allowed.has(toolName) : null
}

/** Solo para pruebas. */
export function _resetToolBridgeForTests(): void {
  handlers.clear()
  allowedTools.clear()
  registered.clear()
}
