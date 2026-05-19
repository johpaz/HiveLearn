/**
 * HiveLearn HTTP Server + WebSocket
 * 
 * Gateway independiente con rutas API, WebSocket y serving de UI
 */
import { getDb } from '../storage/sqlite'
import { LessonDeliverySession, LessonPersistence, runHiveLearnSession, updateHiveLearnAgentsProviderModel, hlSwarmEmitter } from '../index'
import { logger } from '../utils/logger'
import { encryptApiKey } from '../crypto/encrypt'
import { decryptApiKey } from '../crypto/decrypt'
import type { ServerWebSocket } from 'bun'
import { join, extname } from 'path'
import { existsSync } from 'fs'
import {
  handleLLMStatus,
  handleInstallRuntime,
  handleStartLocalLLM,
  handleStopLocalLLM,
  handleLLMWebSocket,
} from './llm-local/server'
import { detectPlatform } from './tts/detect'
import { synthesize } from './tts/logic'
import { TTS_MODELS } from './tts/models'
import {
  checkTTSInstallation,
  checkVoiceInstalled,
  installPiper,
  installVoice,
} from './tts/install'
import type { LLMMessage } from '../agent/llm-client'
import type { StudentProfile, SwarmTimelineEvent } from '../types'

interface WSData {
  path: string
  search?: string
}

interface OnboardingFieldMap {
  nickname?: string
  nombre?: string
  edad?: string
  tema?: string
  objetivo?: string
  estilo?: string
}

type UIBundle = Map<string, { data: Buffer; mime: string }>
let embeddedUIBundle: UIBundle | null = null

export function registerEmbeddedUI(bundle: UIBundle): void {
  embeddedUIBundle = bundle
}

const log = logger.child('server')

const isDev = process.env.NODE_ENV === 'development'

let _bunServer: ReturnType<typeof Bun.serve> | null = null
export function setBunServer(srv: ReturnType<typeof Bun.serve>): void {
  _bunServer = srv
}
export function getBunServer(): ReturnType<typeof Bun.serve> | null {
  return _bunServer
}

interface Server {
  fetch: (req: Request) => Response | Promise<Response>
  websocket: {
    open: (ws: ServerWebSocket<WSData>) => void
    message: (ws: ServerWebSocket<WSData>, message: string | ArrayBuffer | Buffer) => void
    close: (ws: ServerWebSocket<WSData>, code: number, reason: string) => void
  }
}

// CORS headers helper
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID',
    'Access-Control-Max-Age': '86400',
  }
}

function addCorsHeaders(response: Response, req: Request): Response {
  const headers = corsHeaders(req)
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value as string)
  }
  return response
}

function isLocalProviderRecord(provider: Record<string, unknown> | undefined): boolean {
  if (!provider) return false
  const id = String(provider.id ?? '')
  const baseUrl = String(provider.base_url ?? '')
  return (
    id === 'ollama' ||
    id === 'local-llama' ||
    id === 'local-tts' ||
    baseUrl.includes('localhost') ||
    baseUrl.includes('127.0.0.1')
  )
}

function parseCapabilities(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value !== 'string' || value.trim().length === 0) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function calcNivelFromXp(xp: number): string {
  if (xp < 50) return 'Aprendiz'
  if (xp < 150) return 'Explorador'
  if (xp < 300) return 'Practicante'
  if (xp < 500) return 'Experto'
  if (xp < 800) return 'Maestro'
  return 'Leyenda'
}

function normalizeOnboardingFields(fields: OnboardingFieldMap): {
  perfil: Record<string, string | number>
  meta: string
} {
  const edad = Number.parseInt(fields.edad ?? '18', 10)
  const rangoEdad = edad <= 12 ? 'nino' : edad <= 17 ? 'adolescente' : 'adulto'
  const estiloRaw = fields.estilo?.toLowerCase() ?? 'balanceado'
  const estilo = estiloRaw.includes('visual')
    ? 'visual'
    : estiloRaw.includes('reto')
      ? 'retos'
      : estiloRaw.includes('lect')
        ? 'lectura'
        : 'balanceado'

  const nickSlug = (fields.nickname?.trim() || fields.nombre?.trim() || 'alumno')
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

  return {
    perfil: {
      alumnoId: `alumno_${nickSlug}_${Date.now()}`,
      nickname: fields.nickname?.trim() ?? '',
      nombre: fields.nombre?.trim() || 'Alumno',
      edad: Number.isFinite(edad) ? edad : 18,
      rangoEdad,
      tiempoSesion: 30,
      nivelPrevio: 'principiante',
      estilo,
      sesionesTotal: 0,
      xpAcumulado: 0,
      nivelActual: 'Aprendiz',
    },
    meta: fields.tema?.trim()
      ? `${fields.tema.trim()}${fields.objetivo?.trim() ? ` — ${fields.objetivo.trim()}` : ''}`
      : (fields.objetivo?.trim() || 'Aprender un tema nuevo'),
  }
}

// WebSocket sessions maps
const onboardingSessions = new Map<string, ServerWebSocket<WSData>>()
const lessonSessions = new Map<string, ServerWebSocket<WSData>>()
const eventSubscribers = new Set<ServerWebSocket<WSData>>()
const lessonDeliverySessions = new Map<string, LessonDeliverySession>()

function asTimelineEvent(eventName: string, payload: any): SwarmTimelineEvent | null {
  const sessionId = payload?.sessionId
  if (!sessionId) return null

  const base = {
    sessionId,
    timestamp: payload?.timestamp ?? Date.now(),
    progress: typeof payload?.progress === 'number' ? payload.progress : undefined,
    phase: payload?.phase ?? undefined,
    agentId: payload?.workerId ?? payload?.agentId ?? undefined,
    agentName: payload?.workerName ?? payload?.agentName ?? undefined,
    taskId: payload?.taskId ?? undefined,
    nodeId: payload?.nodeId ?? undefined,
    summary: payload?.summary ?? undefined,
    error: payload?.error ?? undefined,
    metadata: payload?.metadata ?? undefined,
  } satisfies Partial<SwarmTimelineEvent>

  switch (eventName) {
    case 'swarm:started':
      return { ...base, kind: 'swarm_started', status: 'pending', label: payload?.label ?? `Enjambre iniciado con ${payload?.totalTasks ?? 0} tareas` } as SwarmTimelineEvent
    case 'swarm:progress':
      return { ...base, kind: 'swarm_progress', status: 'running', label: payload?.mensaje ?? 'Progreso del swarm', progress: payload?.porcentaje } as SwarmTimelineEvent
    case 'coordinator:phase_changed':
      return { ...base, kind: 'coordinator_phase_changed', status: payload?.status ?? 'running', label: payload?.label ?? 'Coordinador actualizando fase' } as SwarmTimelineEvent
    case 'worker:task_dispatched':
      return { ...base, kind: 'worker_dispatched', status: 'pending', label: payload?.label ?? 'Tarea delegada a worker' } as SwarmTimelineEvent
    case 'worker:task_started':
      return { ...base, kind: 'worker_started', status: 'running', label: payload?.label ?? 'Worker trabajando' } as SwarmTimelineEvent
    case 'worker:tool_call':
      return { ...base, kind: 'worker_tool_call', status: 'tool_call', label: payload?.label ?? 'Worker usando tool' } as SwarmTimelineEvent
    case 'worker:task_completed':
      return { ...base, kind: 'worker_completed', status: 'completed', label: payload?.label ?? 'Worker completó tarea' } as SwarmTimelineEvent
    case 'worker:task_failed':
      return { ...base, kind: 'worker_failed', status: 'failed', label: payload?.label ?? 'Worker falló' } as SwarmTimelineEvent
    case 'worker:result_received':
      return { ...base, kind: 'worker_result_received', status: 'completed', label: payload?.label ?? 'Coordinador recibió resultado' } as SwarmTimelineEvent
    case 'node:repair_started':
      return { ...base, kind: 'node_repair_started', status: 'assembling', label: payload?.label ?? 'Coordinador reparando nodo' } as SwarmTimelineEvent
    case 'node:repair_completed':
      return { ...base, kind: 'node_repair_completed', status: 'completed', label: payload?.label ?? 'Nodo reparado' } as SwarmTimelineEvent
    case 'program:review_started':
      return { ...base, kind: 'program_review_started', status: 'assembling', label: payload?.label ?? 'Revisión del programa iniciada' } as SwarmTimelineEvent
    case 'program:review_completed':
      return { ...base, kind: 'program_review_completed', status: 'completed', label: payload?.label ?? 'Revisión del programa completada' } as SwarmTimelineEvent
    case 'swarm:completed':
      return { ...base, kind: 'swarm_completed', status: payload?.success ? 'completed' : 'failed', label: payload?.success ? 'Enjambre completado' : 'Enjambre finalizó con errores' } as SwarmTimelineEvent
    default:
      return null
  }
}

function broadcastTimelineEvent(timelineEvent: SwarmTimelineEvent, payload: any): void {
  const persistence = new LessonPersistence()
  persistence.saveSwarmTimelineEvent(timelineEvent)

  for (const ws of eventSubscribers) {
    wsSend(ws, { type: 'swarm_timeline', payload: timelineEvent })

    if (timelineEvent.kind === 'swarm_started') wsSend(ws, { type: 'swarm_started', ...payload })
    if (timelineEvent.kind === 'swarm_completed') wsSend(ws, { type: 'swarm_completed', ...payload })
    if (timelineEvent.kind === 'worker_started' && timelineEvent.agentId) {
      wsSend(ws, { type: 'agent_started', agentId: timelineEvent.agentId, ...payload })
    }
    if (timelineEvent.kind === 'worker_completed' && timelineEvent.agentId) {
      wsSend(ws, { type: 'agent_completed', agentId: timelineEvent.agentId, ...payload })
    }
    if (timelineEvent.kind === 'worker_failed' && timelineEvent.agentId) {
      wsSend(ws, { type: 'agent_failed', agentId: timelineEvent.agentId, ...payload })
    }
  }
}

hlSwarmEmitter.on('*', (eventName: string, payload: any) => {
  const event = asTimelineEvent(eventName, payload)
  if (event) broadcastTimelineEvent(event, payload)
})

// Helper para enviar mensajes por WebSocket
function wsSend(ws: ServerWebSocket<WSData>, data: unknown): void {
  try {
    ws.send(JSON.stringify(data))
  } catch (e) {
    log.warn('WebSocket send failed', { error: (e as Error).message })
  }
}

// WebSocket message handler
function handleWsMessage(ws: ServerWebSocket<WSData>, message: string | ArrayBuffer | Buffer): void {
  try {
    const data = JSON.parse(message.toString())
    log.debug('[ws] Message', data)
    
    // Handle ping/pong heartbeat
    if (data?.type === 'ping') {
      wsSend(ws, { type: 'pong' })
      return
    }
  } catch {
    log.warn('[ws] Malformed message')
  }
}

// Onboarding WebSocket handler
const onboardingHistories = new Map<string, LLMMessage[]>()
const onboardingProfileCache = new Map<string, any>() // StudentProfile de alumno existente por sessionId

const ONBOARDING_TOOLS = [
  {
    name: 'save_field',
    description: 'Guarda un dato capturado del alumno. Llama esta tool cada vez que el alumno responda un campo.',
    parameters: {
      type: 'object',
      required: ['field_key', 'field_value'],
      properties: {
        field_key: { type: 'string', enum: ['nickname', 'nombre', 'edad', 'tema', 'objetivo', 'estilo'] },
        field_value: { type: 'string' },
      },
    },
  },
  {
    name: 'submit_profile',
    description: 'Llama esta tool cuando tengas nickname, tema, objetivo y estilo. nombre y edad son opcionales si el alumno ya existe en BD.',
    parameters: {
      type: 'object',
      required: ['nickname', 'tema', 'objetivo', 'estilo'],
      properties: {
        nickname: { type: 'string' },
        nombre:   { type: 'string' },
        edad:     { type: 'string' },
        tema:     { type: 'string' },
        objetivo: { type: 'string' },
        estilo:   { type: 'string' },
      },
    },
  },
]

// Detecta qué campo estaba preguntando el coordinador en su último mensaje
function detectFieldFromQuestion(agentMsg: string): string | null {
  const q = agentMsg.toLowerCase()
  if (q.includes('nickname') || q.includes('apodo')) return 'nickname'
  if (q.includes('llamas') || (q.includes('nombre') && !q.includes('aprender'))) return 'nombre'
  if (q.includes('años') || q.includes('cuántos') || q.includes('edad')) return 'edad'
  if (q.includes('aprender') || q.includes('tema') || q.includes('estudiar') || q.includes('gustaría')) return 'tema'
  if (q.includes('para qué') || q.includes('necesitas') || q.includes('objetivo') || q.includes('para que')) return 'objetivo'
  if (q.includes('prefieres') || q.includes('estilo') || q.includes('visual') || q.includes('reto') || q.includes('leyendo')) return 'estilo'
  return null
}

async function handleOnboardingWS(ws: ServerWebSocket<WSData>, message: string): Promise<void> {
  try {
    const sessionId = ws.data.search
      ? new URL(`http://localhost${ws.data.path}${ws.data.search}`).searchParams.get('sessionId') ?? 'unknown'
      : 'unknown'
    const persistence = new LessonPersistence()
    const data = JSON.parse(message)

    // ── INIT ──────────────────────────────────────────────────────────────────
    if (data.type === 'init') {
      // Ya en memoria (reconexión dentro de la misma sesión del servidor)
      if (onboardingHistories.has(sessionId)) return

      // Intentar reanudar desde BD
      const dbMessages = persistence.getOnboardingMessages(sessionId)
      if (dbMessages.length > 0) {
        const progress = persistence.getOnboardingProgress(sessionId)
        const campos = (progress?.camposCompletados ?? {}) as Record<string, string>
        const reconstructed: LLMMessage[] = dbMessages.map(m => ({
          role: m.role === 'agent' ? 'assistant' : 'user',
          content: m.content,
        } as LLMMessage))
        if (Object.keys(campos).length > 0) {
          reconstructed.push({
            role: 'user',
            content: `[Contexto: datos ya recopilados = ${JSON.stringify(campos)}. Continúa capturando los faltantes sin repetir los ya guardados.]`,
          } as LLMMessage)
        }
        onboardingHistories.set(sessionId, reconstructed)
        wsSend(ws, { type: 'resumed' })
        return
      }

      // Sesión nueva: saludo inicial
      const { runHiveLearnConversation } = await import('../agent/conversation')
      const { AGENT_IDS } = await import('../agent/registry')
      const result = await runHiveLearnConversation({
        agentId: AGENT_IDS.onboarding,
        messages: [{ role: 'user', content: 'Inicia la conversación de onboarding. Saluda brevemente y pide el nickname del alumno (su apodo o nombre de usuario).' } as LLMMessage],
        tools: ONBOARDING_TOOLS,
        maxTokens: 500,
        temperature: 0.7,
      })
      onboardingHistories.set(sessionId, [{ role: 'assistant', content: result.content } as LLMMessage])
      persistence.saveOnboardingMessage(sessionId, 'agent', result.content)
      wsSend(ws, { type: 'agent_message', text: result.content })
      return
    }

    // ── USER MESSAGE ───────────────────────────────────────────────────────────
    const userText = typeof data.text === 'string'
      ? data.text
      : typeof data.content === 'string'
        ? data.content
        : null
    if (data.type !== 'user_message' || !userText) return

    const { runHiveLearnConversation } = await import('../agent/conversation')
    const { AGENT_IDS } = await import('../agent/registry')

    let history = onboardingHistories.get(sessionId) ?? []
    history.push({ role: 'user', content: userText } as LLMMessage)
    onboardingHistories.set(sessionId, history)
    persistence.saveOnboardingMessage(sessionId, 'user', userText)

    const result = await runHiveLearnConversation({
      agentId: AGENT_IDS.onboarding,
      messages: history,
      tools: ONBOARDING_TOOLS,
      maxTokens: 500,
      temperature: 0.7,
    })

    // ── TOOL: save_field ───────────────────────────────────────────────────────
    if (result.toolCall?.name === 'save_field') {
      const args = result.toolCall.args as Record<string, string>
      let existingStudent = null as StudentProfile | null

        if (args.field_key === 'nickname') {
          log.info(`[onboarding] Looking up student by nickname="${args.field_value}"`)
          existingStudent = persistence.findStudentByNickname(args.field_value)
        log.info(
          existingStudent
            ? `[onboarding] Existing student found for nickname="${args.field_value}" alumnoId="${existingStudent.alumnoId}"`
            : `[onboarding] No student found for nickname="${args.field_value}"`
        )
      }

      // Guardar en BD
      const progress = persistence.getOnboardingProgress(sessionId)
      const currentFields = (progress?.camposCompletados ?? {}) as OnboardingFieldMap
      const nextFields = { ...currentFields, [args.field_key]: args.field_value }
      persistence.saveOnboardingProgress(
        sessionId,
        args.field_key as 'nickname' | 'nombre' | 'edad' | 'tema' | 'objetivo' | 'estilo',
        args.field_key,
        args.field_value,
        nextFields,
        nextFields.tema,
        existingStudent?.alumnoId,
      )

      // Intercept nickname: buscar alumno existente
      if (args.field_key === 'nickname') {
        const existing = existingStudent
        if (existing) {
          const activeSession = persistence.getActiveSession(existing.alumnoId)
          if (activeSession?.sessionId) {
            const fullSession = persistence.getSessionWithCurriculum(activeSession.sessionId)
            const restored = persistence.restoreSessionState(activeSession.sessionId)
            if (fullSession?.nodosJson) {
              wsSend(ws, {
                type: 'active_session_found',
                sessionId: activeSession.sessionId,
                alumnoId: existing.alumnoId,
                nombre: existing.nombre,
                nickname: existing.nickname,
                rangoEdad: existing.rangoEdad,
                xpTotal: fullSession.xpTotal,
                nodosCompletados: fullSession.nodosCompletados,
                pausedAt: restored?.pausedAt ?? null,
                lastNodeId: restored?.lastNodeId ?? null,
              })
              return
            }
          }

          // Inyectar contexto para que el LLM no pregunte nombre ni edad
          history.push({ role: 'assistant', content: `[guardé nickname: ${args.field_value}]` } as LLMMessage)
          history.push({
            role: 'user',
            content: `[CONTEXTO DEL SISTEMA: El alumno con nickname "${args.field_value}" ya existe. nombre="${existing.nombre}", edad="${existing.edad}", rangoEdad="${existing.rangoEdad}". NO preguntes nombre ni edad. Solo captura: tema (qué quiere aprender), objetivo (para qué) y estilo (visual/lectura/retos/balanceado). Al tenerlos, llama submit_profile incluyendo nombre="${existing.nombre}" y edad="${existing.edad}".]`,
          } as LLMMessage)
          onboardingHistories.set(sessionId, history)
          onboardingProfileCache.set(sessionId, existing)

          wsSend(ws, {
            type: 'student_found',
            nombre:      existing.nombre,
            nickname:    existing.nickname,
            rangoEdad:   existing.rangoEdad,
            xpAcumulado: existing.xpAcumulado,
            nivelActual: existing.nivelActual,
          })

          // Llamada de seguimiento para que el LLM dé la bienvenida y pida tema
          const followUp = await runHiveLearnConversation({
            agentId: AGENT_IDS.onboarding,
            messages: history,
            tools: ONBOARDING_TOOLS,
            maxTokens: 500,
            temperature: 0.7,
          })
          history.push({ role: 'assistant', content: followUp.content } as LLMMessage)
          onboardingHistories.set(sessionId, history)
          persistence.saveOnboardingMessage(sessionId, 'agent', followUp.content)
          wsSend(ws, { type: 'agent_message', text: followUp.content })
          return
        }
        // Alumno nuevo: notificar campo guardado normalmente
        wsSend(ws, { type: 'field_saved', fieldKey: args.field_key, fieldValue: args.field_value })
      } else {
        wsSend(ws, { type: 'field_saved', fieldKey: args.field_key, fieldValue: args.field_value })
      }

      // Continuar con llamada de seguimiento para la siguiente pregunta
      history.push({ role: 'assistant', content: `[guardé ${args.field_key}: ${args.field_value}]` } as LLMMessage)
      history.push({
        role: 'user',
        content: `Campo '${args.field_key}' guardado exitosamente. Por favor, continúa con el siguiente dato pendiente.`,
      } as LLMMessage)
      onboardingHistories.set(sessionId, history)

      const followUp = await runHiveLearnConversation({
        agentId: AGENT_IDS.onboarding,
        messages: history,
        tools: ONBOARDING_TOOLS,
        maxTokens: 500,
        temperature: 0.7,
      })

      if (followUp.toolCall?.name === 'submit_profile' || followUp.toolCall?.name === 'complete_onboarding') {
        const fArgs = followUp.toolCall.args as Record<string, string>
        const cached = onboardingProfileCache.get(sessionId)
        const normalized = normalizeOnboardingFields({
          nickname: fArgs.nickname ?? '',
          nombre:   fArgs.nombre   ?? cached?.nombre ?? '',
          edad:     fArgs.edad     ?? String(cached?.edad ?? '18'),
          tema:     fArgs.tema,
          objetivo: fArgs.objetivo,
          estilo:   fArgs.estilo,
        })
        persistence.completeOnboarding(sessionId, normalized.perfil as Record<string, string>, normalized.meta)
        onboardingProfileCache.delete(sessionId)
        wsSend(ws, { type: 'complete', perfil: normalized.perfil, meta: normalized.meta })
        return
      }

      history.push({ role: 'assistant', content: followUp.content } as LLMMessage)
      onboardingHistories.set(sessionId, history)
      persistence.saveOnboardingMessage(sessionId, 'agent', followUp.content)
      wsSend(ws, { type: 'agent_message', text: followUp.content })
      return
    }

    // ── TOOL: submit_profile / complete_onboarding ─────────────────────────────
    if (result.toolCall?.name === 'submit_profile' || result.toolCall?.name === 'complete_onboarding') {
      const args = result.toolCall.args as Record<string, string>
      const cached = onboardingProfileCache.get(sessionId)
      const normalized = normalizeOnboardingFields({
        nickname: args.nickname ?? '',
        nombre:   args.nombre   ?? cached?.nombre ?? '',
        edad:     args.edad     ?? String(cached?.edad ?? '18'),
        tema:     args.tema,
        objetivo: args.objetivo,
        estilo:   args.estilo,
      })
      persistence.completeOnboarding(sessionId, normalized.perfil as Record<string, string>, normalized.meta)
      onboardingProfileCache.delete(sessionId)
      wsSend(ws, { type: 'complete', perfil: normalized.perfil, meta: normalized.meta })
      return
    }

    // ── Respuesta de texto plano (sin tool call) ──────────────────────────────
    // Fallback para modelos locales que no llaman tools: inferir el campo
    // respondido a partir de la pregunta del coordinador anterior al mensaje del usuario
    {
      const progress2 = persistence.getOnboardingProgress(sessionId)
      const currentFields2 = (progress2?.camposCompletados ?? {}) as OnboardingFieldMap
      const allFields = ['nickname', 'nombre', 'edad', 'tema', 'objetivo', 'estilo']
      const missingFields = allFields.filter(f => !currentFields2[f as keyof OnboardingFieldMap])

      if (missingFields.length > 0 && userText) {
        // El penúltimo mensaje de la historia es la pregunta del coordinador que el usuario acaba de responder
        const prevAgentContent = [...history].reverse().slice(1).find(m => m.role === 'assistant')?.content ?? ''
        const prevAgentMsg = typeof prevAgentContent === 'string' ? prevAgentContent : ''
        const inferredField = detectFieldFromQuestion(prevAgentMsg)

        if (inferredField && missingFields.includes(inferredField)) {
          let existingStudent2 = null as StudentProfile | null
          if (inferredField === 'nickname') {
            log.info(`[onboarding] Looking up student by nickname="${userText}" (fallback)`)
            existingStudent2 = persistence.findStudentByNickname(userText)
            log.info(
              existingStudent2
                ? `[onboarding] Existing student found for nickname="${userText}" alumnoId="${existingStudent2.alumnoId}" (fallback)`
                : `[onboarding] No student found for nickname="${userText}" (fallback)`
            )
          }

          log.info(`[onboarding] Auto-saving field "${inferredField}" = "${userText}" (tool-call fallback)`)
          const nextFields2 = { ...currentFields2, [inferredField]: userText }
          persistence.saveOnboardingProgress(
            sessionId,
            inferredField as 'nickname' | 'nombre' | 'edad' | 'tema' | 'objetivo' | 'estilo',
            inferredField,
            userText,
            nextFields2 as Record<string, string>,
            nextFields2.tema,
            existingStudent2?.alumnoId,
          )
          wsSend(ws, { type: 'field_saved', fieldKey: inferredField, fieldValue: userText })

          // Intercept nickname: buscar alumno existente
          if (inferredField === 'nickname') {
            const existing2 = existingStudent2
            if (existing2) {
              const activeSession2 = persistence.getActiveSession(existing2.alumnoId)
              if (activeSession2?.sessionId) {
                const fullSession2 = persistence.getSessionWithCurriculum(activeSession2.sessionId)
                const restored2 = persistence.restoreSessionState(activeSession2.sessionId)
                if (fullSession2?.nodosJson) {
                  wsSend(ws, {
                    type: 'active_session_found',
                    sessionId: activeSession2.sessionId,
                    alumnoId: existing2.alumnoId,
                    nombre: existing2.nombre,
                    nickname: existing2.nickname,
                    rangoEdad: existing2.rangoEdad,
                    xpTotal: fullSession2.xpTotal,
                    nodosCompletados: fullSession2.nodosCompletados,
                    pausedAt: restored2?.pausedAt ?? null,
                    lastNodeId: restored2?.lastNodeId ?? null,
                  })
                  return
                }
              }

              history.push({
                role: 'user',
                content: `[CONTEXTO DEL SISTEMA: El alumno con nickname "${userText}" ya existe. nombre="${existing2.nombre}", edad="${existing2.edad}", rangoEdad="${existing2.rangoEdad}". NO preguntes nombre ni edad. Solo captura: tema, objetivo, estilo. Al tenerlos, llama submit_profile.]`,
              } as LLMMessage)
              onboardingHistories.set(sessionId, history)
              onboardingProfileCache.set(sessionId, existing2)
              wsSend(ws, {
                type: 'student_found',
                nombre:      existing2.nombre,
                nickname:    existing2.nickname,
                rangoEdad:   existing2.rangoEdad,
                xpAcumulado: existing2.xpAcumulado,
                nivelActual: existing2.nivelActual,
              })
            }
          }

          // Re-invocar el LLM con el campo ya guardado para que formule la siguiente pregunta
          history.push({ role: 'assistant', content: `[guardé ${inferredField}: ${userText}]` } as LLMMessage)
          history.push({ role: 'user', content: `Campo '${inferredField}' guardado. Continúa con el siguiente.` } as LLMMessage)
          onboardingHistories.set(sessionId, history)

          const { runHiveLearnConversation: runConv2 } = await import('../agent/conversation')
          const { AGENT_IDS: IDS2 } = await import('../agent/registry')
          const followUp2 = await runConv2({
            agentId: IDS2.onboarding,
            messages: history,
            tools: ONBOARDING_TOOLS,
            maxTokens: 500,
            temperature: 0.7,
          })

          if (followUp2.toolCall?.name === 'submit_profile' || followUp2.toolCall?.name === 'complete_onboarding') {
            const fArgs2 = followUp2.toolCall.args as Record<string, string>
            const cached2 = onboardingProfileCache.get(sessionId)
            const normalized2 = normalizeOnboardingFields({
              nickname: fArgs2.nickname ?? nextFields2.nickname ?? '',
              nombre:   fArgs2.nombre   ?? cached2?.nombre ?? nextFields2.nombre ?? '',
              edad:     fArgs2.edad     ?? String(cached2?.edad ?? nextFields2.edad ?? '18'),
              tema:     fArgs2.tema     ?? nextFields2.tema ?? '',
              objetivo: fArgs2.objetivo ?? nextFields2.objetivo ?? '',
              estilo:   fArgs2.estilo   ?? nextFields2.estilo ?? '',
            })
            persistence.completeOnboarding(sessionId, normalized2.perfil as Record<string, string>, normalized2.meta)
            onboardingProfileCache.delete(sessionId)
            wsSend(ws, { type: 'complete', perfil: normalized2.perfil, meta: normalized2.meta })
            return
          }

          history.push({ role: 'assistant', content: followUp2.content } as LLMMessage)
          onboardingHistories.set(sessionId, history)
          persistence.saveOnboardingMessage(sessionId, 'agent', followUp2.content)
          wsSend(ws, { type: 'agent_message', text: followUp2.content })
          return
        }
      }
    }

    // Sin inferencia posible: enviar respuesta tal como llegó
    history.push({ role: 'assistant', content: result.content } as LLMMessage)
    onboardingHistories.set(sessionId, history)
    persistence.saveOnboardingMessage(sessionId, 'agent', result.content)
    wsSend(ws, { type: 'agent_message', text: result.content })
  } catch (e) {
    log.error('[ws/onboarding] Error', { error: (e as Error).message })
    wsSend(ws, { type: 'error', message: (e as Error).message })
  }
}

// Lesson WebSocket handler
async function handleLessonWS(ws: ServerWebSocket<WSData>, message: string): Promise<void> {
  try {
    const sessionId = ws.data.search
      ? new URL(`http://localhost${ws.data.path}${ws.data.search}`).searchParams.get('sessionId') ?? 'unknown'
      : 'unknown'
    const data = JSON.parse(message)
    if (data.type === 'ping') {
      wsSend(ws, { type: 'pong' })
      return
    }
    log.info('[ws/lesson] Message', { type: data.type })

    if (data.type === 'init') {
      const existingDelivery = lessonDeliverySessions.get(sessionId)
      if (existingDelivery) {
        log.info('[ws/lesson] Restarting stale delivery session', { sessionId })
        existingDelivery.cancel()
        lessonDeliverySessions.delete(sessionId)
      }

      const delivery = new LessonDeliverySession(sessionId, (payload) => {
        const currentWs = lessonSessions.get(sessionId)
        if (currentWs) wsSend(currentWs, payload)
      })
      lessonDeliverySessions.set(sessionId, delivery)

      void delivery.start().catch((err) => {
        log.error('[ws/lesson] Delivery start failed', { sessionId, error: (err as Error).message })
        wsSend(ws, { type: 'error', message: (err as Error).message })
      })
      return
    }

    if (data.type === 'action') {
      const delivery = lessonDeliverySessions.get(sessionId)
      if (!delivery) {
        wsSend(ws, { type: 'error', message: 'No hay sesión de entrega activa' })
        return
      }
      delivery.receiveAction({
        name: typeof data.name === 'string' ? data.name : 'unknown',
        context: typeof data.context === 'object' && data.context ? data.context : {},
      })
      return
    }

    if (data.type === 'cancel') {
      const delivery = lessonDeliverySessions.get(sessionId)
      delivery?.cancel()
      lessonDeliverySessions.delete(sessionId)
      return
    }
  } catch (e) {
    log.error('[ws/lesson] Error', { error: (e as Error).message })
    wsSend(ws, { type: 'error', message: (e as Error).message })
  }
}

// Events WebSocket handler
async function handleEventsWS(ws: ServerWebSocket<WSData>, message: string): Promise<void> {
  try {
    const data = JSON.parse(message)
    if (data.type === 'ping') {
      wsSend(ws, { type: 'pong' })
      return
    }
  } catch {
    // ignore
  }
}

// Helper para servir archivos estáticos de la UI
async function serveUIFile(pathname: string): Promise<Response | null> {
  const subPath = pathname === '/' || !pathname.includes('.') ? '/index.html' : pathname

  // First try registered embedded UI bundle (from CLI postbuild)
  if (embeddedUIBundle) {
    const entry = embeddedUIBundle.get(subPath) ?? embeddedUIBundle.get('/index.html')
    if (entry) {
      return new Response(entry.data as any, {
        headers: {
          'Content-Type': entry.mime,
          'Cache-Control': subPath === '/index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        },
      })
    }
  }

  // Fallback to disk — try multiple locations
  const projectRoot = join(__dirname, '../../../..')
  const candidates = [
    join(projectRoot, 'packages/ui/dist'),
    join(projectRoot, 'dist/ui'),
    join(process.cwd(), 'dist/ui'),
  ]

  for (const uiDir of candidates) {
    if (!existsSync(uiDir)) continue

    const filePath = join(uiDir, subPath)
    const file = Bun.file(filePath)
    if (await file.exists()) {
      return new Response(file)
    }

    // SPA fallback
    const indexFile = Bun.file(join(uiDir, 'index.html'))
    if (await indexFile.exists()) {
      return new Response(indexFile)
    }
  }

  return null
}

export function createServer(): Server {
  return {
    fetch: async (req: Request) => {
      const url = new URL(req.url)
      
      // Handle WebSocket upgrades
      const upgradeHeader = req.headers.get('Upgrade')
      const wsPaths = ['/ws/', '/hivelearn-onboarding', '/hivelearn-lesson', '/hivelearn-events', '/canvas']
      if (upgradeHeader === 'websocket' && wsPaths.some(p => url.pathname.startsWith(p))) {
        const srv = getBunServer()
        if (srv) {
          const success = srv.upgrade(req, { data: { path: url.pathname, search: url.search } })
          if (success) {
            return undefined as any
          }
          log.warn('[ws] Upgrade failed for path', { path: url.pathname })
        } else {
          log.warn('[ws] Bun server not available for upgrade')
        }
        return new Response('WebSocket upgrade failed', { status: 400 })
      }
      
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(req),
        })
      }

      // ── Health check ───────────────────────────────────────────────────
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // ── Dev Mode: Serve built UI ─────────────────────────────────────────
      if (isDev) {
        const upgrade = req.headers.get('Upgrade')
        if (upgrade === 'websocket') {
          return new Response('WebSocket upgrade required', { status: 426 })
        }

        if (!url.pathname.startsWith('/api') && !url.pathname.startsWith('/ws')) {
          // __dirname = packages/core/src/gateway, go up 4 levels to project root
          const projectRoot = join(__dirname, '../../../..')
          const uiDirCandidates = [
            join(projectRoot, 'packages/ui/dist'),
            join(projectRoot, 'dist/ui'),
            join(process.cwd(), 'dist/ui'),
          ]
          let uiDir = uiDirCandidates.find((d) => existsSync(join(d, 'index.html'))) ?? uiDirCandidates[0]
          let subPath = url.pathname === '/' ? '/index.html' : url.pathname
          if (!extname(subPath)) subPath = '/index.html'

          const filePath = join(uiDir, subPath)
          const file = Bun.file(filePath)

          if (await file.exists()) {
            return new Response(file)
          }

          // SPA fallback
          const indexFile = Bun.file(join(uiDir, 'index.html'))
          if (await indexFile.exists()) {
            return new Response(indexFile)
          }

          return new Response(
            `UI build not found. Searched: ${uiDirCandidates.join(', ')}`,
            { status: 503, headers: { 'Content-Type': 'text/plain' } }
          )
        }
      }

      // ── Production: serve UI for all non-API routes ────────────────────
      if (!isDev && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/ws')) {
        const uiResponse = await serveUIFile(url.pathname)
        if (uiResponse) return uiResponse
      }

      // ── API Routes ─────────────────────────────────────────────────────

      // GET /api/providers
      if (url.pathname === '/api/providers' && req.method === 'GET') {
        try {
          const db = getDb()
          const providerRows = db.query(`
            SELECT id, name, base_url, category, enabled, active, created_at, api_key_encrypted, num_ctx, num_gpu
            FROM providers
            ORDER BY name
          `).all() as Array<Record<string, unknown>>
          const modelCounts = db.query(`
            SELECT provider_id, COUNT(*) AS count
            FROM models
            GROUP BY provider_id
          `).all() as Array<{ provider_id: string; count: number }>
          const countMap = new Map(modelCounts.map(row => [row.provider_id, Number(row.count ?? 0)]))
          const providers = providerRows.map((provider) => {
            const { api_key_encrypted: _apiKeyEncrypted, ...safeProvider } = provider
            return {
            ...safeProvider,
            hasApiKey: Boolean(provider.api_key_encrypted) || false,
            requiresApiKey: !isLocalProviderRecord(provider),
            modelCount: countMap.get(String(provider.id ?? '')) ?? 0,
            isLocal: isLocalProviderRecord(provider),
            }
          })
          return addCorsHeaders(
            new Response(JSON.stringify({ providers }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[providers] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/models
      if (url.pathname === '/api/models' && req.method === 'GET') {
        try {
          const db = getDb()
          const modelRows = db.query(`
            SELECT id, provider_id, name, model_type, context_window, capabilities, enabled, active
            FROM models
            ORDER BY name
          `).all() as Array<Record<string, unknown>>
          const models = modelRows.map((model) => ({
            ...model,
            capabilities: parseCapabilities(model.capabilities),
          }))
          return addCorsHeaders(
            new Response(JSON.stringify({ models }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[models] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/providers/:id/api-key - Verificar si tiene API key
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/api-key') && req.method === 'GET') {
        try {
          const providerId = url.pathname.split('/')[3]
          const db = getDb()
          const provider = db.query('SELECT id, base_url, api_key_encrypted FROM providers WHERE id = ?').get(providerId) as Record<string, unknown> | undefined
          return addCorsHeaders(
            new Response(JSON.stringify({
              hasApiKey: Boolean(provider?.api_key_encrypted),
              requiresApiKey: !isLocalProviderRecord(provider),
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[providers/api-key] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/providers/:id/api-key - Guardar API key
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/api-key') && req.method === 'POST') {
        try {
          const providerId = url.pathname.split('/')[3]
          const body = await req.json() as { apiKey: string }
          if (!body.apiKey) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'apiKey es requerido' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          const db = getDb()
          const { encrypted, iv } = encryptApiKey(body.apiKey)
          db.query(`
            UPDATE providers SET api_key_encrypted = ?, api_key_iv = ?
            WHERE id = ?
          `).run(encrypted, iv, providerId)
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[providers/api-key] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // DELETE /api/providers/:id/api-key - Eliminar API key
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/api-key') && req.method === 'DELETE') {
        try {
          const providerId = url.pathname.split('/')[3]
          const db = getDb()
          db.query(`
            UPDATE providers SET api_key_encrypted = NULL, api_key_iv = NULL
            WHERE id = ?
          `).run(providerId)
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[providers/api-key] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/providers/:id/details - Provider + modelos + estado credencial
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/details') && req.method === 'GET') {
        try {
          const providerId = url.pathname.split('/')[3]
          const db = getDb()
          const provider = db.query(`
            SELECT id, name, base_url, category, enabled, active, created_at, api_key_encrypted, num_ctx, num_gpu
            FROM providers
            WHERE id = ?
          `).get(providerId) as Record<string, unknown> | undefined

          if (!provider) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Provider no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const models = db.query(`
            SELECT id, provider_id, name, model_type, context_window, capabilities, enabled, active
            FROM models
            WHERE provider_id = ?
            ORDER BY name
          `).all(providerId) as Array<Record<string, unknown>>

          return addCorsHeaders(
            new Response(JSON.stringify({
              provider: {
                id: provider.id,
                name: provider.name,
                base_url: provider.base_url,
                category: provider.category,
                enabled: provider.enabled,
                active: provider.active,
                created_at: provider.created_at,
                hasApiKey: Boolean(provider.api_key_encrypted),
                requiresApiKey: !isLocalProviderRecord(provider),
                isLocal: isLocalProviderRecord(provider),
                num_ctx: provider.num_ctx,
                num_gpu: provider.num_gpu,
              },
              hasApiKey: Boolean(provider.api_key_encrypted),
              models: models.map((model) => ({
                ...model,
                capabilities: parseCapabilities(model.capabilities),
              })),
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[providers/details] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // PATCH /api/providers/:id/enabled - activar/desactivar provider
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/enabled') && req.method === 'PATCH') {
        try {
          const providerId = url.pathname.split('/')[3]
          const body = await req.json() as { enabled?: boolean }
          if (typeof body.enabled !== 'boolean') {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'enabled debe ser boolean' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const db = getDb()
          const result = db.query('UPDATE providers SET enabled = ? WHERE id = ?').run(body.enabled ? 1 : 0, providerId)
          if ((result as { changes?: number }).changes === 0) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Provider no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true, enabled: body.enabled }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[providers/enabled] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // PATCH /api/providers/:id/context - actualizar num_ctx
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/context') && req.method === 'PATCH') {
        try {
          const providerId = url.pathname.split('/')[3]
          const body = await req.json() as { num_ctx?: number }
          if (typeof body.num_ctx !== 'number') {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'num_ctx debe ser un numero' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const db = getDb()
          const result = db.query('UPDATE providers SET num_ctx = ? WHERE id = ?').run(body.num_ctx, providerId)
          if ((result as { changes?: number }).changes === 0) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Provider no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true, num_ctx: body.num_ctx }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[providers/context] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/providers/:id/models - crear modelo manual
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/models') && req.method === 'POST') {
        try {
          const providerId = url.pathname.split('/')[3]
          const body = await req.json() as {
            id?: string
            name?: string
            modelType?: string
            contextWindow?: number
            capabilities?: string[]
          }

          const id = body.id?.trim()
          const name = body.name?.trim()
          if (!id || !name) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'id y name son requeridos' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const db = getDb()
          const provider = db.query('SELECT id FROM providers WHERE id = ?').get(providerId)
          if (!provider) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Provider no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const existing = db.query('SELECT id FROM models WHERE id = ?').get(id)
          if (existing) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Ya existe un modelo con ese id' }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const capabilities = Array.isArray(body.capabilities)
            ? body.capabilities.filter((cap): cap is string => typeof cap === 'string' && cap.trim().length > 0)
            : []

          db.query(`
            INSERT INTO models (id, provider_id, name, model_type, context_window, capabilities, enabled, active)
            VALUES (?, ?, ?, ?, ?, ?, 1, 0)
          `).run(
            id,
            providerId,
            name,
            body.modelType?.trim() || 'llm',
            typeof body.contextWindow === 'number' && Number.isFinite(body.contextWindow)
              ? body.contextWindow
              : 20000,
            JSON.stringify(capabilities)
          )

          return addCorsHeaders(
            new Response(JSON.stringify({
              ok: true,
              model: {
                id,
                provider_id: providerId,
                name,
                model_type: body.modelType?.trim() || 'llm',
                context_window: typeof body.contextWindow === 'number' && Number.isFinite(body.contextWindow)
                  ? body.contextWindow
                  : 20000,
                capabilities,
                enabled: 1,
                active: 0,
              },
            }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[providers/models] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // PATCH /api/models/:id/enabled - activar/desactivar modelo
      if (url.pathname.startsWith('/api/models/') && url.pathname.endsWith('/enabled') && req.method === 'PATCH') {
        try {
          const modelId = url.pathname.split('/')[3]
          const body = await req.json() as { enabled?: boolean }
          if (typeof body.enabled !== 'boolean') {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'enabled debe ser boolean' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const db = getDb()
          const result = db.query('UPDATE models SET enabled = ? WHERE id = ?').run(body.enabled ? 1 : 0, modelId)
          if ((result as { changes?: number }).changes === 0) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Modelo no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true, enabled: body.enabled }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[models/enabled] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/providers/ollama/import - Importar modelos desde Ollama local
      if (url.pathname === '/api/providers/ollama/import' && req.method === 'POST') {
        try {
          const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434'
          const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
          if (!res.ok) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'No se pudo conectar con Ollama. Asegúrate de que esté corriendo en ' + ollamaUrl }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          const data = await res.json() as { models: Array<{ name: string; size: number; digest: string }> }
          const db = getDb()
          let imported = 0
          for (const model of data.models || []) {
            const modelName = model.name
            const modelId = `ollama-${modelName.replace(/:/g, '-')}`
            // Insertar o actualizar modelo
            db.query(`
              INSERT OR REPLACE INTO models (id, provider_id, name, model_type, context_window, capabilities, enabled, active)
              VALUES (?, 'ollama', ?, 'llm', 32000, '["chat", "local"]', 1, 0)
            `).run(modelId, modelName)
            imported++
          }
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true, imported, models: data.models?.map(m => m.name) || [] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[ollama/import] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/hivelearn/config
      if (url.pathname === '/api/hivelearn/config' && req.method === 'GET') {
        try {
          const persistence = new LessonPersistence()
          const db = getDb()
          
          // Check if table exists
          const tableExists = db.query(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='hl_agents'"
          ).get()
          
          if (!tableExists) {
            return addCorsHeaders(
              new Response(JSON.stringify({
                configured: false,
                providerId: null,
                modelId: null,
                notInitialized: true,
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          
          const providerModel = persistence.getHiveLearnProviderModel()
          return addCorsHeaders(
            new Response(JSON.stringify({
              configured: !!providerModel,
              providerId: providerModel?.providerId,
              modelId: providerModel?.modelId,
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/config] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({
              error: (e as Error).message,
              configured: false,
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/hivelearn/config
      if (url.pathname === '/api/hivelearn/config' && req.method === 'POST') {
        try {
          const body = await req.json() as { providerId: string; modelId: string }
          if (!body.providerId || !body.modelId) {
            return addCorsHeaders(
              new Response(JSON.stringify({ 
                error: 'providerId y modelId son requeridos' 
              }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          
          const db = getDb()
          updateHiveLearnAgentsProviderModel(db, body.providerId, body.modelId)
          
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/config] POST error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/hivelearn/generate
      if (url.pathname === '/api/hivelearn/generate' && req.method === 'POST') {
        try {
          const body = await req.json() as {
            perfil: any
            meta: string
          }

          // SSE stream
          const encoder = new TextEncoder()
          const { readable, writable } = new TransformStream()
          const writer = writable.getWriter()
          let isClosed = false
          const eventHandler = (eventName: string, payload: any) => {
            const timelineEvent = asTimelineEvent(eventName, payload)
            if (timelineEvent) {
              send({ type: 'event', payload: timelineEvent })
            }
          }
          
          const send = (data: any) => {
            if (isClosed) return
            writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          }

          // Keep the SSE connection alive while long-running agents are generating.
          const heartbeat = setInterval(() => {
            if (isClosed) return
            writer.write(encoder.encode(`: keepalive ${Date.now()}\n\n`))
          }, 4000)
          
          ;(async () => {
            try {
              hlSwarmEmitter.subscribe('*', eventHandler)

              const program = await runHiveLearnSession(body.perfil, body.meta, {
                onProgress: (progress) => send({ type: 'progress', payload: progress }),
              })
              const persistence = new LessonPersistence()
              const curriculum = persistence.getCurriculumBySessionId(program.sessionId)
              send({
                type: 'complete',
                payload: {
                  ...program,
                  curriculoId: curriculum?.id ?? null,
                },
              })

              hlSwarmEmitter.unsubscribe('*', eventHandler)
              clearInterval(heartbeat)
              isClosed = true
              await writer.close()
            } catch (error) {
              send({ type: 'error', payload: { message: (error as Error).message } })
              clearInterval(heartbeat)
              hlSwarmEmitter.unsubscribe('*', eventHandler)
              isClosed = true
              await writer.close()
            }
          })()
          
          return addCorsHeaders(
            new Response(readable, {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
              },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/generate] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/hivelearn/sessions
      if (url.pathname === '/api/hivelearn/sessions' && req.method === 'GET') {
        try {
          const persistence = new LessonPersistence()
          const sessions = persistence.getSessionsByAlumno('*')
          return addCorsHeaders(
            new Response(JSON.stringify({ sessions }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/sessions] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/hivelearn/sessions/:id/restore
      if (url.pathname.startsWith('/api/hivelearn/sessions/') && url.pathname.endsWith('/restore') && req.method === 'GET') {
        try {
          const sessionId = url.pathname.split('/')[4]
          const persistence = new LessonPersistence()
          const session = persistence.getSessionWithCurriculum(sessionId)
          if (!session) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Sesión no encontrada' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const restored = persistence.restoreSessionState(sessionId)
          return addCorsHeaders(
            new Response(JSON.stringify({
              session_id: session.sessionId,
              alumno_id: session.alumnoId,
              curriculo_id: session.curriculoId,
              xp_total: session.xpTotal,
              nivel_alcanzado: session.nivelAlcanzado,
              logros_json: session.logrosJson,
              nodos_completados: session.nodosCompletados,
              evaluacion_puntaje: session.evaluacionPuntaje,
              completada: session.completada ? 1 : 0,
              nodos_json: session.nodosJson,
              topic_slug: session.topicSlug,
              meta: session.metaAlumno,
              rango_edad: (() => {
                const profile = persistence.getStudentProfile(session.alumnoId)
                return profile?.rangoEdad ?? 'adulto'
              })(),
              last_node_id: restored?.lastNodeId ?? null,
              session_state_json: restored?.stateJson ?? null,
              paused_at: restored?.pausedAt ?? null,
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/sessions/:id/restore] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/hivelearn/session-progress
      if (url.pathname === '/api/hivelearn/session-progress' && req.method === 'POST') {
        try {
          const body = await req.json() as {
            sessionId?: string
            xpTotal?: number
            nodosCompletados?: number
            lastNodeId?: string | null
            sessionStateJson?: string
            logrosJson?: string
          }

          if (!body.sessionId) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'sessionId requerido' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const persistence = new LessonPersistence()
          persistence.updateSessionProgress(
            body.sessionId,
            Math.max(0, Number(body.nodosCompletados ?? 0)),
            Math.max(0, Number(body.xpTotal ?? 0)),
          )

          if (typeof body.logrosJson === 'string') {
            persistence.updateSessionLogros(body.sessionId, body.logrosJson)
          }

          if (typeof body.sessionStateJson === 'string') {
            persistence.pauseSession(body.sessionId, body.lastNodeId ?? null, body.sessionStateJson)
          }

          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/session-progress] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/hivelearn/complete-session
      if (url.pathname === '/api/hivelearn/complete-session' && req.method === 'POST') {
        try {
          const body = await req.json() as {
            sessionId?: string
            puntajeEvaluacion?: number | null
            xpTotal?: number
            logrosJson?: string
          }

          if (!body.sessionId) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'sessionId requerido' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const xpTotal = Math.max(0, Number(body.xpTotal ?? 0))
          const nivelAlcanzado = calcNivelFromXp(xpTotal)
          const logrosJson = typeof body.logrosJson === 'string' ? body.logrosJson : '[]'
          const persistence = new LessonPersistence()

          persistence.completeSession(
            body.sessionId,
            xpTotal,
            nivelAlcanzado,
            logrosJson,
            typeof body.puntajeEvaluacion === 'number' ? body.puntajeEvaluacion : null,
          )

          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true, nivelAlcanzado }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/complete-session] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/hivelearn/agents
      if (url.pathname === '/api/hivelearn/agents' && req.method === 'GET') {
        try {
          const db = getDb()
          const agents = db.query(`
            SELECT id, name, description, system_prompt, role, provider_id, model_id, max_iterations, enabled, updated_at
            FROM hl_agents
            ORDER BY role DESC, name
          `).all()
          return addCorsHeaders(
            new Response(JSON.stringify({ agents }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/agents] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // PUT /api/hivelearn/agents/:id - Actualizar configuración de agente
      if (url.pathname.startsWith('/api/hivelearn/agents/') && req.method === 'PUT') {
        try {
          const agentId = url.pathname.split('/')[4];
          const body = await req.json() as {
            provider_id: string;
            model_id: string;
            max_iterations: number;
            enabled: number;
            system_prompt?: string;
          };
          const db = getDb();
          db.query(`
            UPDATE hl_agents
            SET provider_id = ?, model_id = ?, max_iterations = ?, enabled = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(body.provider_id, body.model_id, body.max_iterations, body.enabled, body.system_prompt || null, agentId);
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          );
        } catch (e) {
          log.error('[hivelearn/agents/:id] Error', { error: (e as Error).message });
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          );
        }
      }

      // ── Local LLM API Routes ───────────────────────────────────────────

      // GET /api/hivelearn/metrics
      if (url.pathname === '/api/hivelearn/metrics' && req.method === 'GET') {
        try {
          const db = getDb()
          const agentCount = db.query('SELECT COUNT(*) as count FROM hl_agents').get() as any
          const sessionCount = db.query('SELECT COUNT(*) as count FROM hl_sessions').get() as any
          return addCorsHeaders(
            new Response(JSON.stringify({
              agents: agentCount?.count ?? 0,
              sessions: sessionCount?.count ?? 0,
              uptime: process.uptime(),
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/llm/status
      if (url.pathname === '/api/llm/status' && req.method === 'GET') {
        return addCorsHeaders(await handleLLMStatus(), req)
      }

      // POST /api/llm/install-runtime
      if (url.pathname === '/api/llm/install-runtime' && req.method === 'POST') {
        return addCorsHeaders(await handleInstallRuntime(), req)
      }

      // POST /api/llm/start
      if (url.pathname === '/api/llm/start' && req.method === 'POST') {
        return addCorsHeaders(await handleStartLocalLLM(), req)
      }

      // POST /api/llm/stop
      if (url.pathname === '/api/llm/stop' && req.method === 'POST') {
        return addCorsHeaders(await handleStopLocalLLM(), req)
      }

      // POST /api/llm/download-model
      if (url.pathname === '/api/llm/download-model' && req.method === 'POST') {
        try {
          const body = await req.json() as { model: string }
          const { downloadModel, MODEL_CATALOG } = await import('./llm-local/downloader')
          const { registerModelInDB } = await import('./llm-local/server')
          const modelId = body.model as keyof typeof MODEL_CATALOG
          if (!MODEL_CATALOG[modelId]) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: `Modelo no encontrado: ${body.model}` }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          await downloadModel(modelId)
          registerModelInDB(modelId)
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true, model: body.model }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/tts/status
      if (url.pathname === '/api/tts/status' && req.method === 'GET') {
        try {
          const installation = checkTTSInstallation()
          const voices = TTS_MODELS.map((voice) => ({
            ...voice,
            downloaded: checkVoiceInstalled(voice.id),
          }))
          return addCorsHeaders(
            new Response(JSON.stringify({
              ok: true,
              platform: detectPlatform(),
              binaryInstalled: installation.piper,
              installed: installation.installed,
              installedVoices: installation.voices,
              voices,
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/tts/install-runtime
      if (url.pathname === '/api/tts/install-runtime' && req.method === 'POST') {
        try {
          await installPiper()
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/tts/download-voice
      if (url.pathname === '/api/tts/download-voice' && req.method === 'POST') {
        try {
          const body = await req.json() as { voice: string }
          if (!body.voice) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Voice requerida' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          await installVoice(body.voice)
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true, voice: body.voice }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/tts-local/speak
      if (url.pathname === '/api/tts-local/speak' && req.method === 'POST') {
        try {
          const body = await req.json() as { text?: string; voice?: string }
          if (!body.text?.trim()) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: "Campo 'text' requerido" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          const audio = await synthesize(body.text, body.voice)
          return addCorsHeaders(
            new Response(audio, {
              status: 200,
              headers: { 'Content-Type': 'audio/wav' },
            }),
            req
          )
        } catch (e) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/hivelearn/onboarding-session?sessionId=<id>
      if (url.pathname === '/api/hivelearn/onboarding-session' && req.method === 'GET') {
        const sid = url.searchParams.get('sessionId')
        if (!sid) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: 'sessionId requerido' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
        const p = new LessonPersistence()
        const dbMessages = p.getOnboardingMessages(sid)
        const progress = p.getOnboardingProgress(sid)
        const campos = (progress?.camposCompletados ?? {}) as Record<string, string>
        const completado = progress?.completado ?? false
        const messages = dbMessages.map((m: any) => ({ role: m.role, text: m.content }))
        return addCorsHeaders(
          new Response(JSON.stringify({ sessionId: sid, messages, campos, completado }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }

      if (url.pathname === '/api/hivelearn/swarm-timeline' && req.method === 'GET') {
        const sid = url.searchParams.get('sessionId')
        if (!sid) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: 'sessionId requerido' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }

        const p = new LessonPersistence()
        return addCorsHeaders(
          new Response(JSON.stringify({ sessionId: sid, events: p.getSwarmTimeline(sid) }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }

      // Default: 404
      return addCorsHeaders(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    },

    websocket: {
      open(ws) {
        const path = ws.data.path
        const search = ws.data.search ?? ''
        if (path === '/ws/llm') {
          log.info('[ws] LLM client connected')
        } else if (path.startsWith('/hivelearn-onboarding')) {
          const url = new URL(`http://localhost${path}${search}`)
          const sessionId = url.searchParams.get('sessionId') ?? 'unknown'
          onboardingSessions.set(sessionId, ws)
          log.info('[ws] Onboarding session connected', { sessionId })
          wsSend(ws, { type: 'connected' })
        } else if (path.startsWith('/hivelearn-lesson')) {
          const url = new URL(`http://localhost${path}${search}`)
          const sessionId = url.searchParams.get('sessionId') ?? 'unknown'
          lessonSessions.set(sessionId, ws)
          log.info('[ws] Lesson session connected', { sessionId })
        } else if (path.startsWith('/hivelearn-events')) {
          eventSubscribers.add(ws)
          log.info('[ws] Event subscriber connected')
          wsSend(ws, { type: 'hl:connected' })
        } else {
          log.info('[ws] Client connected', { path })
        }
      },

      message(ws, message) {
        const path = ws.data.path
        if (path === '/ws/llm') {
          handleLLMWebSocket(ws as any, message.toString())
          return
        }
        if (path.startsWith('/hivelearn-onboarding')) {
          handleOnboardingWS(ws, message.toString())
          return
        }
        if (path.startsWith('/hivelearn-lesson')) {
          handleLessonWS(ws, message.toString())
          return
        }
        if (path.startsWith('/hivelearn-events')) {
          handleEventsWS(ws, message.toString())
          return
        }
        handleWsMessage(ws, message)
      },

      close(ws, code, reason) {
        const path = ws.data.path
        log.info(`[ws] Client disconnected: ${code} ${reason}`, { path })
        
        for (const [sessionId, sessionWs] of onboardingSessions.entries()) {
          if (sessionWs === ws) {
            onboardingSessions.delete(sessionId)
            onboardingHistories.delete(sessionId)
          }
        }
        for (const [sessionId, sessionWs] of lessonSessions.entries()) {
          if (sessionWs === ws) {
            lessonSessions.delete(sessionId)
            const delivery = lessonDeliverySessions.get(sessionId)
            if (delivery) {
              delivery.cancel()
              lessonDeliverySessions.delete(sessionId)
            }
          }
        }
        eventSubscribers.delete(ws)
      },
    },
  }
}
