/**
 * Adaptadores propios. El resto de proveedores los resuelve `callLLM` del SDK (ver `llm-client.ts`).
 */
import type { LLMProvider } from "./interface"
import { OllamaProvider } from "./ollama"
import { HiveAgentsProvider } from "./hiveagents"

const providerFactories: Record<string, () => LLMProvider> = {
  ollama:        () => new OllamaProvider(),
  hiveagents:    () => new HiveAgentsProvider(),
}

export function getProvider(providerId: string): LLMProvider {
  const factory = providerFactories[providerId]
  if (!factory) throw new Error(`Proveedor sin adaptador propio: ${providerId} (lo resuelve el SDK)`)
  return factory()
}
