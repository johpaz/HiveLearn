/**
 * agentVoices — mapa estático HiveAgentId → voz Piper preferida.
 *
 * El número de voces instaladas puede ser menor que el número de agentes
 * (por defecto solo `es_MX-claude-14947-epoch-high` y `sorah`). En ese caso
 * los agentes se reparten sobre las voces disponibles y se diferencian por
 * tono/rol en su system prompt, NO por voz.
 *
 * "Dejar las voces como están": no descargar voces adicionales. El usuario
 * puede instalar más voces con `POST /api/tts-local/install-voice` si quiere
 * más variedad en el futuro.
 */

import { DEFAULT_VOICE } from "./detect.js"
import { listVoices } from "./logic.js"

/** HiveAgentId del juego, sincronizado con `packages/game/src/entities/agents.ts`. */
export type GameHiveAgentId =
  | "coordinator"
  | "content"
  | "practice"
  | "assessment"
  | "image"
  | "infographic"
  | "audio"
  | "gamification"

/**
 * Preferencia de voz por agente. Ordenada para alternar entre las únicas 2
 * voces actuales (claude sorah claude sorah ...) y que dos agentes adyacentes
 * no compartan voz — útil cuando hablan seguido en una conversación.
 */
const PREFERRED: Record<GameHiveAgentId, string> = {
  coordinator: "es_MX-claude-14947-epoch-high",
  content: "sorah",
  practice: "es_MX-claude-14947-epoch-high",
  assessment: "sorah",
  image: "sorah",
  infographic: "es_MX-claude-14947-epoch-high",
  audio: "sorah",
  gamification: "es_MX-claude-14947-epoch-high",
}

let cachedAvailable: string[] | null = null
let cacheTs = 0
const CACHE_MS = 60_000

function availableVoices(): string[] {
  const now = Date.now()
  if (cachedAvailable && now - cacheTs < CACHE_MS) return cachedAvailable
  cachedAvailable = listVoices()
  cacheTs = now
  return cachedAvailable
}

/** Resuelve la voz a usar para un agente, con fallback a una voz existente. */
export function resolveAgentVoice(agentId: GameHiveAgentId): string {
  const available = availableVoices()
  if (available.length === 0) return DEFAULT_VOICE

  const preferred = PREFERRED[agentId]
  if (available.includes(preferred)) return preferred

  // Rotación determinística por agentId sobre las voces disponibles, para
  // que cada agente siempre termine en la misma voz cuando falte la preferida.
  const ids: GameHiveAgentId[] = [
    "coordinator", "content", "practice", "assessment",
    "image", "infographic", "audio", "gamification",
  ]
  const idx = ids.indexOf(agentId) % available.length
  return available[idx]!
}

const VALID_IDS: GameHiveAgentId[] = [
  "coordinator", "content", "practice", "assessment",
  "image", "infographic", "audio", "gamification",
]
export function isValidAgentId(id: string): id is GameHiveAgentId {
  return (VALID_IDS as string[]).includes(id)
}