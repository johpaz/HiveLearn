/**
 * Onboarding WebSocket handler
 *
 * Maneja los mensajes { type: 'init' } y { type: 'user_message' } del chat
 * de onboarding. Usa el agente coordinador para la conversación y guarda el
 * perfil del alumno + sesión en BD al recibir submit_profile.
 */
import type { ServerWebSocket } from 'bun'
import { randomUUID } from 'crypto'
import type { LLMMessage, LLMToolDef, LLMCallOptions, LLMResponse } from '../agent/llm-client'
import { getProviderApiKey } from '../secrets/provider-secrets'
import { OllamaProvider } from '../agent/llm-providers/ollama'
import { OpenAICompatProvider } from '../agent/llm-providers/openai-compat'
import { AnthropicProvider } from '../agent/llm-providers/anthropic'
import { GeminiProvider } from '../agent/llm-providers/gemini'
import { COORDINATOR_PROMPT } from '../agent/coordinator.prompt'
import { getDb } from '../storage/sqlite'
import { LessonPersistence } from '../storage/LessonPersistence'
import { logger } from '../utils/logger'

const log = logger.child('ws:onboarding')

// Conversation state keyed by sessionId
const convState = new Map<string, {
  messages: LLMMessage[]
  capturedFields: Record<string, string>
  alumnoId: string | null
}>()

const SUBMIT_PROFILE_TOOL: LLMToolDef = {
  type: 'function',
  function: {
    name: 'submit_profile',
    description: 'Envía el perfil completo del alumno cuando ya tienes los 6 datos (nombre, nickname, edad, tema, objetivo, estilo)',
    parameters: {
      type: 'object',
      required: ['nombre', 'nickname', 'edad', 'tema', 'objetivo', 'estilo'],
      properties: {
        nombre:   { type: 'string', description: 'Nombre real del alumno' },
        nickname: { type: 'string', description: 'Apodo o nickname del alumno' },
        edad:     { type: 'number', description: 'Edad en años' },
        tema:     { type: 'string', description: 'Tema que quiere aprender' },
        objetivo: { type: 'string', description: 'Para qué lo necesita' },
        estilo:   { type: 'string', description: 'Estilo de aprendizaje preferido' },
      },
    },
  },
}

function getOrInitState(sessionId: string) {
  if (!convState.has(sessionId)) {
    convState.set(sessionId, { messages: [], capturedFields: {}, alumnoId: null })
  }
  return convState.get(sessionId)!
}

// Providers locales: no necesitan API key
const LOCAL_PROVIDERS = new Set(['ollama', 'local-llama'])

async function getCoordinatorConfig() {
  const db = getDb()

  const agent = db.query<{ provider_id: string; model_id: string }, [string]>(
    'SELECT provider_id, model_id FROM hl_agents WHERE id = ? LIMIT 1'
  ).get('hl-coordinator-agent')

  const providerId = agent?.provider_id || 'ollama'
  const modelId    = agent?.model_id    || 'gemma2:9b'

  const providerRow = db.query<{ base_url: string }, [string]>(
    'SELECT base_url FROM providers WHERE id = ? LIMIT 1'
  ).get(providerId)

  // Providers locales no usan keychain — evita lookups innecesarios
  const apiKey = LOCAL_PROVIDERS.has(providerId)
    ? undefined
    : (await getProviderApiKey(providerId)) || undefined

  return { providerId, modelId, baseUrl: providerRow?.base_url, apiKey }
}

function send(ws: ServerWebSocket<undefined>, data: object) {
  try { ws.send(JSON.stringify(data)) } catch { /* ws closed */ }
}

async function callCoordinator(messages: LLMMessage[]): Promise<LLMResponse> {
  const { providerId, modelId, baseUrl, apiKey } = await getCoordinatorConfig()

  const opts: LLMCallOptions = {
    provider:    providerId,
    model:       modelId,
    apiKey,
    baseUrl,
    messages:    [{ role: 'system', content: COORDINATOR_PROMPT }, ...messages],
    tools:       [SUBMIT_PROFILE_TOOL],
    maxTokens:   400,
    temperature: 0.7,
  }

  if (providerId === 'ollama')    return new OllamaProvider().call(opts)
  if (providerId === 'anthropic') return new AnthropicProvider().call(opts)
  if (providerId === 'gemini')    return new GeminiProvider().call(opts)
  return new OpenAICompatProvider().call(opts)
}

/**
 * Handles { type: 'init' } — sends the initial greeting
 */
export async function handleOnboardingInit(
  ws: ServerWebSocket<undefined>,
  sessionId: string
): Promise<void> {
  const state = getOrInitState(sessionId)

  // If we already have a conversation, restore it (returning user)
  if (state.messages.length > 0) {
    const lastAgent = [...state.messages].reverse().find(m => m.role === 'assistant')
    if (lastAgent) {
      send(ws, { type: 'agent_message', text: lastAgent.content })
      // Re-send any captured fields
      for (const [key, value] of Object.entries(state.capturedFields)) {
        send(ws, { type: 'field_saved', fieldKey: key, fieldValue: value })
      }
      return
    }
  }

  try {
    // Empty conversation → get initial greeting from LLM
    const response = await callCoordinator([])
    const text = typeof response.content === 'string' ? response.content : ''
    if (text) {
      state.messages.push({ role: 'assistant', content: text })
      send(ws, { type: 'agent_message', text })
    }
  } catch (err) {
    log.error('[onboarding init] LLM error', { error: (err as Error).message })
    send(ws, { type: 'agent_message', text: '¡Hola! Soy tu coordinador de aprendizaje. ¿Cómo te llamas?' })
  }
}

/**
 * Handles { type: 'user_message', content } — runs the conversation turn
 */
export async function handleOnboardingUserMessage(
  ws: ServerWebSocket<undefined>,
  sessionId: string,
  content: string
): Promise<void> {
  const state = getOrInitState(sessionId)
  const persistence = new LessonPersistence()

  // Add user message to history
  state.messages.push({ role: 'user', content })

  try {
    const response = await callCoordinator(state.messages)

    // Check for submit_profile tool call
    const toolCall = response.tool_calls?.[0]
    if (toolCall?.function.name === 'submit_profile') {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(toolCall.function.arguments) } catch {}

      const nombre   = String(args.nombre   ?? '')
      const nickname = String(args.nickname ?? '')
      const edad     = Number(args.edad     ?? 0)
      const tema     = String(args.tema     ?? '')
      const objetivo = String(args.objetivo ?? '')
      const estilo   = String(args.estilo   ?? '')

      // Emit field_saved for all captured fields
      const fields: Record<string, string> = { nombre, nickname, edad: String(edad), tema, objetivo, estilo }
      for (const [key, value] of Object.entries(fields)) {
        if (value && !state.capturedFields[key]) {
          state.capturedFields[key] = value
          send(ws, { type: 'field_saved', fieldKey: key, fieldValue: value })
        }
      }

      // ── M1: Save student profile to DB ──────────────────────────────
      const alumnoId = state.alumnoId ?? randomUUID()
      state.alumnoId = alumnoId

      const rangoEdad = edad <= 12 ? 'nino' : edad <= 17 ? 'adolescente' : 'adulto'
      const avatarEmoji = edad <= 12 ? '🧒' : edad <= 17 ? '🧑' : '👤'

      persistence.saveStudentProfile({
        alumnoId,
        nombre,
        nickname,
        avatar: avatarEmoji,
        edad,
        estado: 'activo',
        sesionesTotal: 0,
        xpAcumulado: 0,
        creadoEn: new Date().toISOString(),
        ultimoAcceso: new Date().toISOString(),
      })

      log.info('[onboarding] Student profile saved', { alumnoId, nombre, nickname, edad })

      // ── M2: Create early session in DB ──────────────────────────────
      persistence.createEarlySession(sessionId, alumnoId)

      log.info('[onboarding] Early session created', { sessionId, alumnoId })

      // Build StudentProfile and meta for the frontend
      const perfil = {
        alumnoId,
        nombre,
        nickname,
        avatar: avatarEmoji,
        edad,
        estado: 'activo',
        sesionesTotal: 0,
        xpAcumulado: 0,
        creadoEn: new Date().toISOString(),
        ultimoAcceso: new Date().toISOString(),
      }

      const meta = `Tema: ${tema}. Objetivo: ${objetivo}. Estilo: ${estilo}.`

      // Add tool result and short farewell to message history
      state.messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [toolCall],
      })

      // Send complete event — frontend will navigate to SwarmPage
      send(ws, { type: 'complete', perfil, meta, alumnoId, sessionId })

      // Clean up session state
      convState.delete(sessionId)
      return
    }

    // Normal text response
    const text = typeof response.content === 'string' ? response.content : ''
    if (text) {
      state.messages.push({ role: 'assistant', content: text })

      // Try to detect newly captured fields from the conversation pattern:
      // After user sends a message at step N, the field for step N-1 is captured.
      // We detect by looking at how many questions the agent has asked.
      detectAndEmitFields(state, ws)

      send(ws, { type: 'agent_message', text })
    }
  } catch (err) {
    log.error('[onboarding message] LLM error', { error: (err as Error).message })
    send(ws, { type: 'error', message: (err as Error).message })
  }
}

/**
 * Heuristic: detect captured fields based on conversation step count.
 * The agent follows a strict order: nombre → edad → tema → objetivo → estilo
 */
function detectAndEmitFields(
  state: ReturnType<typeof getOrInitState>,
  ws: ServerWebSocket<undefined>
): void {
  // Count user messages to estimate which step we're on
  const userMsgs = state.messages.filter(m => m.role === 'user')
  const step = userMsgs.length  // 1 = answered nombre, 2 = answered edad, etc.

  const FIELD_ORDER = ['nombre', 'nickname', 'edad', 'tema', 'objetivo', 'estilo']
  const latestUserMsg = userMsgs[userMsgs.length - 1]
  if (!latestUserMsg) return

  const answeredField = FIELD_ORDER[step - 1]
  if (!answeredField || state.capturedFields[answeredField]) return

  const value = typeof latestUserMsg.content === 'string' ? latestUserMsg.content.trim() : ''
  if (!value) return

  state.capturedFields[answeredField] = value
  send(ws, { type: 'field_saved', fieldKey: answeredField, fieldValue: value })
}
