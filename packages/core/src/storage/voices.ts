/**
 * voices — Identidad sonora de los personajes de la colmena en hiveDB.
 *
 * hiveDB es la fuente de verdad: cada agente/personaje tiene una voz Piper,
 * variación de tono/velocidad, un leitmotiv musical (semitonos relativos a A4,
 * formato compatible con el secuenciador chiptune del juego) y un SFX de
 * entrada. El mapa estático de `gateway/tts/agentVoices.ts` actúa como fallback
 * si la BD no tiene la fila (o no hay gateway disponible).
 *
 * Colecciones:
 *  - hl_agent_voices  (id = agentId corto del juego) — identidad por personaje
 *  - hl_tts_cache     (id = sha256(voice::text))     — audio sintetizado reutilizable
 */
import { getDb, nowIso } from './hivedb'
import { logger } from '../utils/logger'

const log = logger.child('voices')

/** Leitmotiv por defecto: semitonos relativos a A4 (null = silencio) */
export interface VoiceLeitmotiv {
  /** Semitonos de la frase melódica corta (2-8 notas) */
  notas: number[]
  /** Tempo del leitmotiv */
  bpm: number
}

export interface AgentVoiceDoc {
  voice: string
  /** Ajuste fino de personalidad vocal (Piper length_scale inverso) */
  rate: number
  leitmotiv: VoiceLeitmotiv
  updated_at: string
}

export interface TtsCacheDoc {
  audio_base64: string
  mime: string
  chars: number
  hits: number
  created_at: string
}

const VOICES_COLLECTION = 'hl_agent_voices'
const CACHE_COLLECTION = 'hl_tts_cache'

/** Textos más largos que esto NO se cachean (evita inflar la BD) */
const TTS_CACHE_MAX_CHARS = 400

/**
 * Identidad sonora sembrada para los 9 personajes (8 pipeline + Maya).
 * Las voces alternan entre las dos instaladas por defecto (claude/sorah);
 * el rate diferencía aún más a personajes que comparten voz.
 */
const SEED_AGENT_VOICES: Record<string, Omit<AgentVoiceDoc, 'updated_at'>> = {
  coordinator: { voice: 'es_MX-claude-14947-epoch-high', rate: 1.0, leitmotiv: { notas: [0, 3, 7, 12], bpm: 96 } },
  onboarding:  { voice: 'sorah',                          rate: 0.95, leitmotiv: { notas: [7, 4, 0, 4], bpm: 108 } },
  content:     { voice: 'sorah',                          rate: 1.1, leitmotiv: { notas: [0, 4, 9], bpm: 120 } },
  practice:    { voice: 'es_MX-claude-14947-epoch-high', rate: 0.92, leitmotiv: { notas: [-5, 0, 0, 5], bpm: 104 } },
  assessment:  { voice: 'sorah',                          rate: 0.88, leitmotiv: { notas: [0, -2, -5], bpm: 84 } },
  image:       { voice: 'sorah',                          rate: 1.05, leitmotiv: { notas: [4, 9, 11], bpm: 112 } },
  infographic: { voice: 'es_MX-claude-14947-epoch-high', rate: 1.02, leitmotiv: { notas: [0, 5, 9, 5], bpm: 100 } },
  audio:       { voice: 'sorah',                          rate: 0.98, leitmotiv: { notas: [12, 9, 5, 9], bpm: 90 } },
  gamification:{ voice: 'es_MX-claude-14947-epoch-high', rate: 1.15, leitmotiv: { notas: [0, 4, 7, 12, 7, 12], bpm: 132 } },
}

/** Idempotente: siembra las identidades faltantes (no pisa cambios manuales) */
export async function seedAgentVoices(): Promise<void> {
  const col = getDb().collection<AgentVoiceDoc>(VOICES_COLLECTION)
  let seeded = 0
  for (const [agentId, doc] of Object.entries(SEED_AGENT_VOICES)) {
    const existing = await col.get(agentId)
    if (existing) continue
    await col.put(agentId, { ...doc, updated_at: nowIso() })
    seeded++
  }
  if (seeded > 0) log.info(`[voices] 🎙️ ${seeded} identidades sonoras sembradas en ${VOICES_COLLECTION}`)
}

/** Devuelve la identidad sonora de un agente (null si no está definida) */
export async function getAgentVoice(agentId: string): Promise<AgentVoiceDoc | null> {
  try {
    const entry = await getDb()
      .collection<AgentVoiceDoc>(VOICES_COLLECTION)
      .get(normalizeAgentId(agentId))
    return entry?.doc ?? null
  } catch (e) {
    log.warn(`[voices] getAgentVoice(${agentId}) falló: ${(e as Error).message}`)
    return null
  }
}

/** Lista todas las identidades (para utilidades/UI) */
export async function listAgentVoices(): Promise<Array<{ agentId: string } & AgentVoiceDoc>> {
  try {
    const entries = await getDb().collection<AgentVoiceDoc>(VOICES_COLLECTION).scan()
    return entries.map((e) => ({ agentId: e.id, ...e.doc }))
  } catch {
    return []
  }
}

// ─── TTS cache ───────────────────────────────────────────────────────────────

function ttsCacheKey(voice: string, text: string): string {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(`${voice}::${text}`)
  return hasher.digest('hex')
}

/** Busca audio sintetizado previamente. Devuelve bytes WAV o null. */
export async function ttsCacheGet(voice: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const entry = await getDb()
      .collection<TtsCacheDoc>(CACHE_COLLECTION)
      .get(ttsCacheKey(voice, text))
    if (!entry) return null

    // Hit: incrementa contador (best-effort, sin bloquear el audio)
    void getDb()
      .collection<TtsCacheDoc>(CACHE_COLLECTION)
      .put(entry.id, { ...entry.doc, hits: entry.doc.hits + 1 })
      .catch(() => {})

    const bytes = Uint8Array.from(atob(entry.doc.audio_base64), (c) => c.charCodeAt(0))
    return bytes.buffer as ArrayBuffer
  } catch (e) {
    log.debug(`[tts-cache] get falló: ${(e as Error).message}`)
    return null
  }
}

/** Guarda audio sintetizado (best-effort; textos largos se omiten) */
export async function ttsCachePut(voice: string, text: string, audio: ArrayBuffer): Promise<void> {
  if (text.length > TTS_CACHE_MAX_CHARS) return
  try {
    let binary = ''
    const bytes = new Uint8Array(audio)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
    await getDb().collection<TtsCacheDoc>(CACHE_COLLECTION).put(ttsCacheKey(voice, text), {
      audio_base64: btoa(binary),
      mime: 'audio/wav',
      chars: text.length,
      hits: 0,
      created_at: nowIso(),
    })
  } catch (e) {
    log.debug(`[tts-cache] put falló: ${(e as Error).message}`)
  }
}

/** Alias cortos aceptados → agentId canónico del juego */
function normalizeAgentId(agentId: string): string {
  const id = agentId.trim().toLowerCase()
  if (id === 'maya' || id.includes('onboarding')) return 'onboarding'
  if (id.includes('coordinator')) return 'coordinator'
  if (id.includes('content') || id.includes('explanation')) return 'content'
  if (id.includes('practice') || id.includes('exercise')) return 'practice'
  if (id.includes('assessment') || id.includes('evaluation')) return 'assessment'
  if (id.includes('image')) return 'image'
  if (id.includes('infographic')) return 'infographic'
  if (id.includes('audio')) return 'audio'
  if (id.includes('gamification')) return 'gamification'
  return id
}
