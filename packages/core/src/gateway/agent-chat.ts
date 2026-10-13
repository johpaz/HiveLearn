/**
 * /hivelearn-agent-chat — WebSocket de conversación directa con un agente HL.
 *
 * Query: ?sessionId=<id>&agentId=<game HiveAgentId>
 *
 * Flujo de mensajes:
 *   cliente → servidor : { type: 'user', text: string }
 *   servidor → cliente : { type: 'connected' }
 *                        { type: 'thinking' }
 *                        { type: 'delta', text: string }
 *                        { type: 'done', reply: string, emotion: string }
 *                        { type: 'error', message: string }
 *
 * El sistemaPrompt del agente se carga desde la BD (`hl_agents.system_prompt`);
 * se antepone un modo conversacional corto para indicarle que debe responder
 * de forma breve, hablada y con emoción.
 */

import type { ServerWebSocket } from "bun"
import { runHiveLearnConversation, type LLMMessage } from "../agent/conversation.js"
import { logger } from "../utils/logger.js"

type GameHiveAgentId =
  | "coordinator"
  | "content"
  | "practice"
  | "assessment"
  | "image"
  | "infographic"
  | "audio"
  | "gamification"

const GAME_AGENT_TO_HL: Record<GameHiveAgentId, string> = {
  coordinator: "hl-coordinator-agent",
  content: "hl-explanation-agent",
  practice: "hl-exercise-agent",
  assessment: "hl-evaluation-agent",
  image: "hl-image-agent",
  infographic: "hl-infographic-agent",
  audio: "hl-audio-agent",
  gamification: "hl-gamification-agent",
}

interface AgentChatState {
  sessionId: string
  agentIdGame: GameHiveAgentId
  agentIdHl: string
  history: LLMMessage[]
}

const sessions = new Map<ServerWebSocket<{ path: string; search?: string }>, AgentChatState>()

const log = logger.child("agent-chat")

function wsSend(ws: ServerWebSocket<unknown>, data: unknown): void {
  try {
    ws.send(JSON.stringify(data))
  } catch (e) {
    log.warn("send failed", { error: (e as Error).message })
  }
}

const CONVERSATION_SUFFIX = `\n\n[Modo conversacional en vivo]
Estás hablando en tiempo real con el alumno dentro del juego. Responde:
- En español (es-MX), breve (1-3 frases, máx ~50 palabras).
- Hablado, no escrito tipo chat-bot: usa tono cálido de tu personaje.
- Devuelve la emoción al final del mensaje en una línea EXACTAMENTE con el formato:
  [EMOTION: happy|thinking|alert|celebrate]
- No inventes funciones externas: si el alumno pide algo fuera de tu rol, díselo breve y amablemente.
- No uses Markdown ni saltos de línea extra al final.`

function parseEmotion(text: string): { emotion: string; reply: string } {
  const m = text.match(/\[EMOTION:\s*(\w+)\s*\]/i)
  if (!m) return { emotion: "happy", reply: text.trim() }
  const emotion = m[1]!.toLowerCase()
  const reply = text.replace(/\[EMOTION:\s*\w+\s*\]/i, "").trim()
  return { emotion: ["happy", "thinking", "alert", "celebrate"].includes(emotion) ? emotion : "happy", reply }
}

export interface AgentChatOpenInfo {
  sessionId: string
  agentIdGame: string
}

export function isValidGameAgentId(id: string): id is GameHiveAgentId {
  return id in GAME_AGENT_TO_HL
}

export function openAgentChatWS(
  ws: ServerWebSocket<{ path: string; search?: string }>,
  info: AgentChatOpenInfo,
): void {
  if (!isValidGameAgentId(info.agentIdGame)) {
    wsSend(ws, { type: "error", message: `agentId inválido: ${info.agentIdGame}` })
    return
  }
  const state: AgentChatState = {
    sessionId: info.sessionId,
    agentIdGame: info.agentIdGame,
    agentIdHl: GAME_AGENT_TO_HL[info.agentIdGame],
    history: [],
  }
  sessions.set(ws, state)
  wsSend(ws, { type: "connected", sessionId: state.sessionId, agentId: state.agentIdGame })
  log.info("agent-chat open", { sessionId: state.sessionId, agentId: state.agentIdGame })
}

export async function handleAgentChatWS(
  ws: ServerWebSocket<{ path: string; search?: string }>,
  raw: string,
): Promise<void> {
  const state = sessions.get(ws)
  if (!state) {
    wsSend(ws, { type: "error", message: "sesión no inicializada" })
    return
  }
  let data: { type?: string; text?: string }
  try {
    data = JSON.parse(raw)
  } catch {
    wsSend(ws, { type: "error", message: "JSON inválido" })
    return
  }
  if (data.type !== "user" || typeof data.text !== "string" || !data.text.trim()) {
    wsSend(ws, { type: "error", message: "se espera { type:'user', text:string }" })
    return
  }

  const userText = data.text.trim().slice(0, 2000)
  state.history.push({ role: "user", content: userText })

  wsSend(ws, { type: "thinking" })

  try {
    const result = await runHiveLearnConversation({
      agentId: state.agentIdHl,
      messages: state.history,
      maxTokens: 300,
      temperature: 0.7,
      // Canal de administración (los sockets legacy exigen administrador): no hay un alumno detrás.
      runContext: { ageBand: 'adulto' },
    })

    // El LLM no siempre incluye la etiqueta de emoción en la primera respuesta
    // porque la BD trae su propio system prompt. La añadimos vía system overlay:
    if (!/\[EMOTION:/i.test(result.content)) {
      // Heurística barata: si la respuesta contiene "?", sugerir thinking.
      const emotion = /[?]/.test(result.content) ? "thinking" : "happy"
      result.content = `${result.content}\n[EMOTION: ${emotion}]`
    }

    const { emotion, reply } = parseEmotion(result.content)

    // Emite por chunks simples "delta" para que la UI haga karaoke básico:
    // partimos por frases (~150 chars por delta para limitar spam WS).
    const chunks = reply.match(/[^.!?…]+[.!?…]*\s*/g) ?? [reply]
    for (const chunk of chunks) {
      wsSend(ws, { type: "delta", text: chunk })
    }

    state.history.push({ role: "assistant", content: reply })
    if (state.history.length > 20) state.history.splice(0, state.history.length - 20)

    wsSend(ws, { type: "done", reply, emotion })
  } catch (e) {
    log.error("agent-chat error", { error: (e as Error).message })
    wsSend(ws, { type: "error", message: (e as Error).message })
  }
}

export function closeAgentChatWS(ws: ServerWebSocket<{ path: string; search?: string }>): void {
  if (sessions.delete(ws)) log.info("agent-chat closed")
}

