/**
 * dialogue — SwarmCeremonyDirector: diálogo 100% LLM entre las abejas (Fase 1).
 *
 * Cuando el alumno declara su meta en la ceremonia de onboarding, las abejas
 * conversan ENTRE ELLAS reaccionando desde su rol y personalidad, cada una con
 * su propia voz. Cada turno ve el transcript previo, así que la conversación
 * es real (se responden entre sí), no líneas sueltas.
 *
 * - Streaming por token vía callLLM(onToken) → eventos bee_line al gateway.
 * - Timeout + línea de respaldo determinística por rol si un proveedor falla.
 * - Transcript persistido en hl_swarm_dialogues (hiveDB = fuente de verdad).
 */
import { AGENT_IDS } from '../registry'
import { resolveCharacter, HIVE_CHARACTERS } from '../characters'
import { callLLM } from '../llm-client'
import type { LLMMessage } from '../llm-client'
import { getDb, nowIso } from '../../storage/hivedb'
import { logger } from '../../utils/logger'

const log = logger.child('swarm-dialogue')

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CeremonyPerfil {
  nombre: string
  edad?: number | null
  rangoEdad?: string | null
  estilo?: string | null
}

export interface CeremonyOptions {
  sessionId: string
  perfil: CeremonyPerfil
  tema: string
  objetivo?: string | null
  energia?: 'baja' | 'media' | 'alta' | null
  tiempoDisponible?: number | null
  /** agentIds cortos del juego que participan (default: los 4 obreras clave) */
  participantes?: string[]
  maxTokensPerBee?: number
  timeoutMsPerBee?: number
}

export interface CeremonyLine {
  agentId: string
  characterName: string
  emoji: string
  text: string
  fallback: boolean
  duracionMs: number
}

export type CeremonyDelta = { agentId: string; delta: string }

// ─── Participantes por defecto y respaldos ──────────────────────────────────

const DEFAULT_PARTICIPANTS = ['content', 'practice', 'assessment', 'gamification']

/** Líneas de respaldo si el LLM no responde (determinísticas, por rol) */
const FALLBACKS: Record<string, (tema: string) => string> = {
  content: (t) => `¡${t}! Qué tema tan bueno — ya veo flores llenas de explicaciones para ti.`,
  practice: (t) => `Y yo ya estoy construyendo retos de ${t}, paso a paso como panales.`,
  assessment: (t) => `Al final de tu camino de ${t} me enfrentarás en mi puerta... ¡prepárate bien!`,
  gamification: () => `Cada paso te dará XP y logros — ¡ya quiero celebrar contigo!`,
}

/** Coordinadora cierra siempre la ceremonia (respaldo incluido) */
function cierreReina(perfilNombre: string, tema: string): string {
  return `Enjambre, ¿escucharon? ${perfilNombre} va a dominar ${tema}. ¡A trabajar, colmena!`
}

// ─── Construcción del contexto compartido ───────────────────────────────────

function buildSharedContext(opts: CeremonyOptions): string {
  const edadTxt = opts.perfil.edad ? `${opts.perfil.edad} años` : (opts.perfil.rangoEdad ?? 'edad desconocida')
  const energiaTxt = opts.energia === 'baja'
    ? 'Viene con energía BAJA: sé especialmente cálido y motivador, sin presionar.'
    : opts.energia === 'alta'
      ? 'Viene con energía ALTA: pueden proponerle retos jugosos.'
      : ''
  return [
    `ALUMNO: ${opts.perfil.nombre} (${edadTxt}).`,
    `META: quiere aprender "${opts.tema}"${opts.objetivo ? ` — objetivo: ${opts.objetivo}` : ''}.`,
    opts.tiempoDisponible ? `TIEMPO HOY: ${opts.tiempoDisponible} minutos.` : '',
    energiaTxt,
    `Estás en la ceremonia del enjambre junto a tus compañeras abejas. Habla SIEMPRE en español`,
    `(adapta tu tono a ${edadTxt}), máximo 2 frases cortas, reacciona a lo que dijeron tus`,
    `compañeras Y a la meta del alumno desde TU rol. NO hagas preguntas. NO saludes como si`,
    `fueras la primera en hablar.`,
  ].filter(Boolean).join(' ')
}

function buildTurnMessages(
  personality: string,
  sharedContext: string,
  transcript: Array<{ characterName: string; text: string }>,
): LLMMessage[] {
  const history = transcript.length > 0
    ? transcript.map((t) => ({ role: 'assistant' as const, content: `${t.characterName}: "${t.text}"` }))
    : []
  return [
    { role: 'system', content: personality },
    ...(history.slice(-4) as LLMMessage[]),
    { role: 'user', content: `[CONTEXTO] ${sharedContext}\n\n[TRANSCRIPCION] Ya hablaron tus compañeras arriba. Es TU turno — responde solo con tu línea, sin tu nombre ni prefijo.` },
  ]
}

// ─── Resolución de modelo ────────────────────────────────────────────────────

/** Usa el proveedor/modelo del agente onboarding (el más conversacional); fallback coordinator */
async function resolveCeremonyProvider(): Promise<{ providerId: string; modelId: string }> {
  for (const id of [AGENT_IDS.onboarding, AGENT_IDS.coordinator]) {
    try {
      const entry = await getDb()
        .collection<{ provider_id?: string; model_id?: string }>('hl_agents')
        .get(id)
      if (entry?.doc?.provider_id && entry.doc.model_id) {
        return { providerId: entry.doc.provider_id, modelId: entry.doc.model_id }
      }
    } catch { /* siguiente */ }
  }
  return { providerId: 'ollama', modelId: 'gemma4-e4b' }
}

// ─── Director principal ──────────────────────────────────────────────────────

/**
 * Ejecuta la ceremonia del enjambre: cada participante habla viendo lo previo.
 * @param onDelta streaming de tokens por abeja (opcional)
 * @param onLineStart avisa qué abeja empieza a hablar (para animación/voz)
 */
export async function runCeremonyDialogue(
  opts: CeremonyOptions,
  callbacks: {
    onDelta?: (delta: CeremonyDelta) => void
    onLineStart?: (agentId: string) => void
    onLineDone?: (line: CeremonyLine) => void
  } = {},
): Promise<CeremonyLine[]> {
  const participants = opts.participantes?.length ? opts.participantes : DEFAULT_PARTICIPANTS
  const sharedContext = buildSharedContext(opts)
  const { providerId, modelId } = await resolveCeremonyProvider()

  const transcript: Array<{ agentId: string; characterName: string; emoji: string; text: string; fallback: boolean; duracionMs: number }> = []

  // La Reina abre la ceremonia (línea fija — autoridad serena, no gasta LLM)
  const reina = resolveCharacter(AGENT_IDS.coordinator)!
  const apertura: CeremonyLine = {
    agentId: reina.id,
    characterName: reina.name,
    emoji: reina.emoji,
    text: cierreReina(opts.perfil.nombre, opts.tema).replace('Enjambre, ¿escucharon?', 'Escuchen, enjambre.'),
    fallback: false,
    duracionMs: 0,
  }
  callbacks.onLineStart?.(apertura.agentId)
  callbacks.onLineDone?.(apertura)
  transcript.push(apertura)

  let providerBroken = false

  for (const shortId of participants) {
    const character = resolveCharacter(shortId)
    if (!character) continue

    callbacks.onLineStart?.(character.id)
    const startedAt = Date.now()

    let text = ''
    let fallback = false

    if (providerBroken) {
      text = FALLBACKS[shortId]?.(opts.tema) ?? FALLBACKS.content!(opts.tema)
      fallback = true
    } else {
      // Abort real: al vencer el timeout se cancela la petición HTTP para NO
      // dejar generaciones zombis bloqueando la cola de Ollama
      const controller = new AbortController()
      const timeoutMs = opts.timeoutMsPerBee ?? 25_000
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const messages = buildTurnMessages(character.personality, sharedContext, transcript)
        const response = await callLLM({
          providerId,
          modelId,
          messages,
          maxTokens: opts.maxTokensPerBee ?? 120,
          temperature: 0.85,
          signal: controller.signal,
          // Los gemma4 "thinking" gastan el presupuesto razonando; la ceremonia
          // quiere líneas directas
          think: false,
          onToken: (token) => {
            callbacks.onDelta?.({ agentId: character.id, delta: token })
          },
        })
        text = (response.content ?? '').trim().replace(/^["“]|["”]$/g, '')
        // Los modelos a veces se prefijan con su nombre: limpiar
        text = text.replace(new RegExp(`^${character.name}\\s*[:—-]\\s*`, 'i'), '').trim()
        if (!text) throw new Error('respuesta vacía')
      } catch (e) {
        const msg = (e as Error).message
        log.warn(`[ceremony] ${shortId} falló (${msg}) → línea de respaldo`)
        if (/not found|connect|ECONNREFUSED|fetch failed|abort/i.test(msg)) providerBroken = true
        text = FALLBACKS[shortId]?.(opts.tema) ?? FALLBACKS.content!(opts.tema)
        fallback = true
      } finally {
        clearTimeout(timer)
      }
    }

    const line: CeremonyLine = {
      agentId: character.id,
      characterName: character.name,
      emoji: character.emoji,
      text,
      fallback,
      duracionMs: Date.now() - startedAt,
    }
    transcript.push(line)
    callbacks.onLineDone?.(line)
  }

  // Persistir transcript completo en hiveDB
  await saveSwarmDialogue(opts.sessionId, opts, transcript)

  return transcript
}

// ─── Persistencia (hl_swarm_dialogues) ───────────────────────────────────────

interface SwarmDialogueDoc {
  session_id: string
  tema: string
  objetivo: string | null
  perfil_json: string
  lines_json: string
  created_at: string
}

/** Guarda (o reemplaza) el transcript de ceremonia de una sesión */
export async function saveSwarmDialogue(
  sessionId: string,
  opts: Pick<CeremonyOptions, 'perfil' | 'tema' | 'objetivo'>,
  lines: CeremonyLine[],
): Promise<void> {
  try {
    await getDb().collection<SwarmDialogueDoc>('hl_swarm_dialogues').put(sessionId, {
      session_id: sessionId,
      tema: opts.tema,
      objetivo: opts.objetivo ?? null,
      perfil_json: JSON.stringify(opts.perfil),
      lines_json: JSON.stringify(lines),
      created_at: nowIso(),
    })
  } catch (e) {
    log.warn(`[ceremony] saveSwarmDialogue falló: ${(e as Error).message}`)
  }
}

/** Recupera un transcript previo (caché de prefijo / replay) */
export async function getSwarmDialogue(sessionId: string): Promise<{ tema: string; lines: CeremonyLine[] } | null> {
  try {
    const entry = await getDb().collection<SwarmDialogueDoc>('hl_swarm_dialogues').get(sessionId)
    if (!entry) return null
    return { tema: entry.doc.tema, lines: JSON.parse(entry.doc.lines_json) as CeremonyLine[] }
  } catch {
    return null
  }
}

/** Catálogo exportado para utilidades/UI */
export { HIVE_CHARACTERS }
