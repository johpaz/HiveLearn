/**
 * Superficie mínima de `@johpaz/hive-sdk/storage` que usa HiveLearn. Solo para `tsc` (ver tsconfig.typecheck.json):
 * el SDK se publica como `.ts` sin compilar y, si `tsc` lo recorre, reporta errores ajenos.
 */
export function ensureHiveDb(opts?: { specialists?: 'all' | 'none' }): Promise<void>
export function closeHiveDb(): void
export function col<T = Record<string, unknown>>(name: string): Promise<{
  get(id: string): Promise<{ doc: T; version: number } | undefined>
  put(id: string, doc: T, options?: { expectedVersion?: number }): Promise<number>
  delete(id: string): Promise<boolean>
  scan(options?: { prefix?: string; limit?: number }): Promise<Array<{ id: string; doc: T; version: number }>>
}>
export function catalogModelKey(providerId: string, wireId: string): string
export function toIndexable(value: string | null | undefined): string
export const NO_PARENT: string
