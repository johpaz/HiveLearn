/**
 * Superficie mínima de `@johpaz/hive-sdk/tools` que usa HiveLearn. Solo para `tsc` (ver tsconfig.typecheck.json):
 * el SDK se publica como `.ts` sin compilar y, si `tsc` lo recorre, reporta errores ajenos.
 */
export interface SdkTool {
  name: string
  description: string
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  timeoutMs?: number
  execute: (params: Record<string, unknown>, config?: { configurable?: { thread_id?: string; [key: string]: unknown }; thread_id?: string; [key: string]: unknown }) => Promise<string | object>
}
export function registerAppTool(tool: SdkTool): void
export function clearAppTools(): void
