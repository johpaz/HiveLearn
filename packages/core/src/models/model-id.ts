/**
 * Identificadores de la colección `models`.
 *
 * La colección se indexa solo por id: dos proveedores que sirven el mismo modelo se pisarían (le pasa a
 * `z-ai/glm-5.2`, que está a la vez en NVIDIA y en OpenRouter). Regla:
 *
 *   - el id conserva el nombre que usa la API del PROPIETARIO del modelo (`claude-sonnet-4-6`, `gemini-3.8-flash`);
 *   - los servicios que REVENDEN modelos de terceros prefijan su propio id de proveedor, y ese prefijo es el
 *     "path distintivo": `openrouter/anthropic/claude-sonnet-4-6` nunca se confunde con `claude-sonnet-4-6` de Anthropic.
 *
 * El prefijo no viaja al cable: el runner y los adaptadores quitan `^<proveedor>/` antes de llamar a la API.
 * (Mismo criterio que `storage/model-id.ts` del SDK, para que ambos motores lean lo mismo.)
 */
const RESELLER_PROVIDERS = new Set(['openrouter', 'nvidia', 'opencode-go', 'groq', 'modelscope'])

export function isResellerProvider(providerId: string): boolean {
  return RESELLER_PROVIDERS.has(providerId)
}

/**
 * Id de fila para el modelo `wireId` servido por `providerId`. `wireId` es SIEMPRE el nombre del cable.
 * No hay atajo de idempotencia a propósito: NVIDIA sirve `nvidia/nemotron-…` y Groq `groq/compound`, así que
 * "ya empieza por el proveedor" no prueba que el prefijo sea el nuestro.
 */
export function catalogModelKey(providerId: string, wireId: string): string {
  return isResellerProvider(providerId) ? `${providerId}/${wireId}` : wireId
}

/** Inversa de `catalogModelKey`: lo que la API del proveedor espera. */
export function wireModelId(providerId: string, key: string): string {
  const prefix = `${providerId}/`
  return isResellerProvider(providerId) && key.startsWith(prefix) ? key.slice(prefix.length) : key
}
