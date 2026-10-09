/**
 * Hook global `beforeToolCall` del SDK: defensa en profundidad de la política de herramientas.
 *
 * La lista blanca (`tool_allowlist_json`) ya recorta el catálogo del agente. El hook añade una segunda
 * barrera: en una ejecución de HiveLearn solo se puede llamar a las tools con las que se lanzó, aunque el
 * modelo alucine el nombre de una nativa (`web_fetch`, `cli_exec`, `browser_*`, `task_delegate`…).
 *
 * Detalles del SDK que condicionan el diseño:
 *  - los hooks son GLOBALES al proceso, así que se filtra por `threadId`;
 *  - un hook que lanza una excepción NO bloquea (falla abierto): por eso se captura todo y se bloquea explícito.
 */
import { isToolAllowedInRun } from '../sdk/tools'
import { logger } from '../../utils/logger'

const log = logger.child('hl-tool-policy')

let removeHook: (() => void) | null = null

export type ToolPolicyResult = { block: true; reason: string } | undefined

export function evaluateToolCall(ctx: { toolName: string; threadId?: string }): ToolPolicyResult {
  try {
    const allowed = isToolAllowedInRun(ctx.threadId, ctx.toolName)
    if (allowed === null || allowed) return undefined
    log.warn(`Tool bloqueada fuera de la ejecución: ${ctx.toolName}`)
    return { block: true, reason: `La herramienta ${ctx.toolName} no está disponible en esta actividad.` }
  } catch (error) {
    log.error(`Fallo en la política de herramientas, se bloquea por seguridad: ${(error as Error).message}`)
    return { block: true, reason: 'La política de herramientas no pudo evaluarse.' }
  }
}

/** Retira el hook si estaba instalado. */
export function removeSdkToolPolicy(): void {
  removeHook?.()
}

/** Registra el hook una sola vez. Devuelve una función que lo retira. */
export async function installSdkToolPolicy(): Promise<() => void> {
  if (removeHook) return removeHook
  const { registerHook } = await import('@johpaz/hive-sdk/hooks')
  const remove = registerHook('beforeToolCall', ctx => evaluateToolCall(ctx))
  removeHook = () => {
    remove()
    removeHook = null
  }
  return removeHook
}
