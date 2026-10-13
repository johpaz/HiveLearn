/**
 * HiveLearn HTTP Server + WebSocket
 * 
 * Gateway independiente con rutas API, WebSocket y serving de UI
 */
import { getDb } from '../storage/hivedb'
import { findCurriculum } from '../institutional/curriculum-store'
import { Portal, checkOrigin, sessionCookie } from '../institutional/portal'
import { LessonDeliverySession, LessonPersistence, runHiveLearnSession, updateHiveLearnAgentsProviderModel, hlSwarmEmitter } from '../index'
import { getGenerationRun, listGenerationRuns, type GenerationRunStatus } from '../agent/run-store'
import { logger } from '../utils/logger'
import { encryptApiKey } from '../crypto/encrypt'
import type { ServerWebSocket } from 'bun'
import { join, extname } from 'path'
import { existsSync } from 'fs'
import { detectPlatform } from './tts/detect'
import { synthesize } from './tts/logic'
import { TTS_MODELS } from './tts/models'
import {
  checkTTSInstallation,
  checkVoiceInstalled,
  installPiper,
  installVoice,
} from './tts/install'
import { getSttStatus, transcribeAudio, dumpWavForDebug } from './stt/logic'
import {
  openAgentChatWS,
  handleAgentChatWS,
  closeAgentChatWS,
  isValidGameAgentId,
} from './agent-chat'
import type { StudentProfile, SwarmTimelineEvent } from '../types'
import { LEVEL_CATALOG } from '../institutional'

interface WSData {
  path: string
  search?: string
  portalSession?: string
  busy?: boolean
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

function isAuthorized(req: Request): boolean {
  const expected = process.env.HIVELEARN_AUTH_TOKEN
  if (!expected) return false
  return req.headers.get('Authorization') === `Bearer ${expected}`
}

function isLocalProviderRecord(provider: Record<string, unknown> | undefined): boolean {
  if (!provider) return false
  const id = String(provider.id ?? '')
  const baseUrl = String(provider.base_url ?? '')
  return (
    id === 'ollama' ||
    id === 'local-tts' ||
    baseUrl.includes('localhost') ||
    baseUrl.includes('127.0.0.1')
  )
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/^data:.*;base64,/, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
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

async function broadcastTimelineEvent(timelineEvent: SwarmTimelineEvent, payload: any): Promise<void> {
  const persistence = new LessonPersistence()
  await persistence.saveSwarmTimelineEvent(timelineEvent)

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

const onboardingProfileCache = new Map<string, StudentProfile>() // alumno existente por sessionId

// ── Ceremonia del Enjambre (diálogo 100% LLM entre abejas) ──
const swarmDialogueSessions = new Map<string, ServerWebSocket<WSData>>()
const swarmDialogueRunning = new Set<string>()

interface SwarmDialogueRequest {
  type: 'start'
  sessionId?: string
  perfil: { nombre: string; edad?: number; rangoEdad?: string; estilo?: string }
  tema: string
  objetivo?: string
  energia?: 'baja' | 'media' | 'alta'
  tiempoDisponible?: number
  participantes?: string[]
}

async function handleSwarmDialogueWS(ws: ServerWebSocket<WSData>, raw: string): Promise<void> {
  try {
    const data = JSON.parse(raw) as SwarmDialogueRequest
    const url = new URL(`http://localhost${ws.data.path}${ws.data.search ?? ''}`)
    const sessionId = data.sessionId || url.searchParams.get('sessionId') || 'unknown'

    if (data.type !== 'start') return
    if (!data.tema?.trim() || !data.perfil?.nombre) {
      wsSend(ws, { type: 'error', message: "Campos requeridos: perfil.nombre y tema" })
      return
    }
    if (swarmDialogueRunning.has(sessionId)) {
      wsSend(ws, { type: 'error', message: 'La ceremonia ya está en curso para esta sesión' })
      return
    }

    swarmDialogueRunning.add(sessionId)
    wsSend(ws, { type: 'ceremony_started', tema: data.tema })

    try {
      const { runCeremonyDialogue } = await import('../agent/swarm/dialogue')
      const lines = await runCeremonyDialogue(
        {
          sessionId,
          perfil: data.perfil,
          tema: data.tema.trim().slice(0, 120),
          objetivo: data.objetivo?.slice(0, 200) ?? null,
          energia: data.energia ?? null,
          tiempoDisponible: data.tiempoDisponible ?? null,
          participantes: data.participantes,
        },
        {
          onLineStart: (agentId) => wsSend(ws, { type: 'bee_line_start', agentId }),
          onDelta: ({ agentId, delta }) => wsSend(ws, { type: 'bee_line_delta', agentId, delta }),
          onLineDone: (line) => wsSend(ws, { type: 'bee_line', ...line }),
        },
      )
      wsSend(ws, { type: 'ceremony_complete', lines })
    } catch (e) {
      log.warn(`[swarm-dialogue] error: ${(e as Error).message}`)
      wsSend(ws, { type: 'error', message: (e as Error).message })
    } finally {
      swarmDialogueRunning.delete(sessionId)
    }
  } catch (e) {
    wsSend(ws, { type: 'error', message: `Mensaje inválido: ${(e as Error).message}` })
  }
}

/** Onboarding conversacional: ver `onboarding/handler.ts` (motor determinista + voz opcional del modelo). */
async function handleOnboardingWS(ws: ServerWebSocket<WSData>, message: string): Promise<void> {
  try {
    const sessionId = ws.data.search
      ? new URL(`http://localhost${ws.data.path}${ws.data.search}`).searchParams.get('sessionId') ?? 'unknown'
      : 'unknown'
    const { handleOnboardingMessage, defaultOnboardingDeps } = await import('../onboarding/handler')
    await handleOnboardingMessage({
      send: (msg) => wsSend(ws, msg),
      sessionId,
      data: JSON.parse(message),
      persistence: new LessonPersistence(),
      profileCache: onboardingProfileCache,
      depsFor: defaultOnboardingDeps,
    })
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
    join(projectRoot, 'packages/hivelearn-ui/dist'),
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
  const portal = new Portal(getDb())
  void portal.supplements.resume().catch(error => log.warn('No se pudieron reanudar complementos', { error: String(error) }))
  return {
    fetch: async (req: Request) => {
      const url = new URL(req.url)

      if (url.pathname === '/api/portal/a2ui/ws' && req.headers.get('upgrade') === 'websocket') {
        try {
          checkOrigin(req)
          const actor = await portal.actor(req)
          await portal.surface(actor, url.searchParams.get('nodeId') ?? '')
          if (getBunServer()?.upgrade(req, { data: { path: url.pathname, search: url.search, portalSession: sessionCookie(req) } })) return undefined as any
          return new Response('WebSocket upgrade failed', { status: 400 })
        } catch (error) { return portal.error(error) }
      }
      if (url.pathname.startsWith('/api/portal/')) return portal.handle(req, getBunServer()?.requestIP(req)?.address ?? 'local')

      // Legacy administrative APIs and sockets are never available to students/teachers.
      const protectedPath = url.pathname.startsWith('/api/') || req.headers.get('upgrade') === 'websocket'
      if (protectedPath) {
        try {
          checkOrigin(req)
          if (!isAuthorized(req)) {
            const actor = await portal.actor(req)
            if (actor.role !== 'admin') return new Response('Forbidden', { status: 403 })
          }
        } catch (error) { return portal.error(error) }
      }
      if (['/api/hivelearn/identity', '/api/hivelearn/diagnostic'].includes(url.pathname)) return new Response('Use the authenticated institutional portal', { status: 410 })
      
      // Handle WebSocket upgrades
      const upgradeHeader = req.headers.get('Upgrade')
      const wsPaths = ['/ws/', '/hivelearn-onboarding', '/hivelearn-lesson', '/hivelearn-events', '/hivelearn-agent-chat', '/hivelearn-swarm-dialogue', '/canvas']
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
            join(projectRoot, 'packages/hivelearn-ui/dist'),
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

      if (url.pathname === '/api/hivelearn/levels' && req.method === 'GET') {
        return addCorsHeaders(new Response(JSON.stringify({ levels: LEVEL_CATALOG, curriculumVersion: 'unesco-ai-v1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }), req)
      }

      // GET /api/providers
      if (url.pathname === '/api/providers' && req.method === 'GET') {
        try {
          const db = getDb()
          const providerRows = (await db.collection<Record<string, unknown>>('providers').scan())
            .map(e => ({ id: e.id, ...e.doc }) as Record<string, unknown>)
            .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
          const countMap = new Map<string, number>()
          for (const m of await db.collection<{ provider_id: string }>('models').scan()) {
            countMap.set(m.doc.provider_id, (countMap.get(m.doc.provider_id) ?? 0) + 1)
          }
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
          const modelRows = (await db.collection<Record<string, unknown>>('models').scan())
            .map(e => ({ id: e.id, ...e.doc }) as Record<string, unknown>)
            .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
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
          const provider = (await db.collection<Record<string, unknown>>('providers').get(providerId))?.doc
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
          const providersCol = db.collection<Record<string, unknown>>('providers')
          const existingProvider = await providersCol.get(providerId)
          if (existingProvider) {
            await providersCol.put(providerId, { ...existingProvider.doc, api_key_encrypted: encrypted, api_key_iv: iv })
          }
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
          const providersCol = db.collection<Record<string, unknown>>('providers')
          const existingProvider = await providersCol.get(providerId)
          if (existingProvider) {
            await providersCol.put(providerId, { ...existingProvider.doc, api_key_encrypted: null, api_key_iv: null })
          }
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
          const providerEntry = await db.collection<Record<string, unknown>>('providers').get(providerId)
          const provider = providerEntry ? { id: providerEntry.id, ...providerEntry.doc } as Record<string, unknown> : undefined

          if (!provider) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Provider no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const models = (await db.collection<Record<string, unknown>>('models').findBy('provider_id', providerId))
            .map(e => ({ id: e.id, ...e.doc }) as Record<string, unknown>)
            .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))

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
          const providersCol = db.collection<Record<string, unknown>>('providers')
          const providerEntry = await providersCol.get(providerId)
          if (!providerEntry) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Provider no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          await providersCol.put(providerId, { ...providerEntry.doc, enabled: body.enabled ? 1 : 0 })

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
          const providersCol = db.collection<Record<string, unknown>>('providers')
          const providerEntry = await providersCol.get(providerId)
          if (!providerEntry) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Provider no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          await providersCol.put(providerId, { ...providerEntry.doc, num_ctx: body.num_ctx })

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
          const provider = await db.collection('providers').get(providerId)
          if (!provider) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Provider no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const modelsCol = db.collection<Record<string, unknown>>('models')
          const existing = await modelsCol.get(id)
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

          await modelsCol.put(id, {
            provider_id: providerId,
            name,
            model_type: body.modelType?.trim() || 'llm',
            context_window: typeof body.contextWindow === 'number' && Number.isFinite(body.contextWindow)
              ? body.contextWindow
              : 20000,
            capabilities: JSON.stringify(capabilities),
            enabled: 1,
            active: 0,
          })

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
          const modelsCol = db.collection<Record<string, unknown>>('models')
          const modelEntry = await modelsCol.get(modelId)
          if (!modelEntry) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Modelo no encontrado' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          await modelsCol.put(modelId, { ...modelEntry.doc, enabled: body.enabled ? 1 : 0 })

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
            await db.collection<Record<string, unknown>>('models').put(modelId, {
              provider_id: 'ollama',
              name: modelName,
              model_type: 'llm',
              context_window: 32000,
              capabilities: '["chat", "local"]',
              enabled: 1,
              active: 0,
            })
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

          // En HiveDB no hay DDL: la colección existe si tiene agentes sembrados
          const agentCount = await db.collection('hl_agents').count()

          if (agentCount === 0) {
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
          
          const providerModel = await persistence.getHiveLearnProviderModel()
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
          
          await updateHiveLearnAgentsProviderModel(body.providerId, body.modelId)
          
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
            perfil?: any
            meta?: string
            /** Reanuda un run interrumpido: perfil/meta se cargan del run persistido */
            resumeSessionId?: string
            curriculumId?: string
          }

          // Reanudación: cargar perfil/meta del run persistido
          let perfil = body.perfil
          let meta = body.meta
          if (body.resumeSessionId) {
            const run = await getGenerationRun(body.resumeSessionId)
            if (!run) {
              return addCorsHeaders(
                new Response(JSON.stringify({ error: 'Run de generación no encontrado' }), {
                  status: 404,
                  headers: { 'Content-Type': 'application/json' },
                }),
                req
              )
            }
            perfil = perfil ?? JSON.parse(run.perfil_json)
            meta = meta ?? run.meta
          }

          const curriculumId: string | null = typeof body.curriculumId === 'string' && body.curriculumId.length <= 80 ? body.curriculumId : null
          if (body.curriculumId !== undefined && curriculumId === null) {
            return addCorsHeaders(new Response(JSON.stringify({ error: 'curriculumId inválido' }), { status: 400, headers: { 'Content-Type': 'application/json' } }), req)
          }

          if (curriculumId && !(await findCurriculum(getDb(), curriculumId))) {
            return addCorsHeaders(new Response(JSON.stringify({ error: 'Currículo no encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } }), req)
          }

          if (!perfil || !meta) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'perfil y meta son requeridos' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
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

              const program = await runHiveLearnSession(perfil, meta, {
                onProgress: (progress) => send({ type: 'progress', payload: progress }),
                resumeSessionId: body.resumeSessionId,
                curriculumId: curriculumId ?? undefined,
              })
              const persistence = new LessonPersistence()
              const curriculum = await persistence.getCurriculumBySessionId(program.sessionId)
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

      // GET /api/hivelearn/generation-runs — runs durables de generación (larga duración)
      // ?status=running|completed|failed|interrupted  ·  /:sessionId para uno solo
      if (url.pathname.startsWith('/api/hivelearn/generation-runs') && req.method === 'GET') {
        try {
          const parts = url.pathname.split('/')
          const runId = parts.length > 4 ? decodeURIComponent(parts[4]) : null

          if (runId) {
            const run = await getGenerationRun(runId)
            if (!run) {
              return addCorsHeaders(
                new Response(JSON.stringify({ error: 'Run no encontrado' }), {
                  status: 404,
                  headers: { 'Content-Type': 'application/json' },
                }),
                req
              )
            }
            return addCorsHeaders(
              new Response(JSON.stringify({ run }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const status = url.searchParams.get('status') as GenerationRunStatus | null
          const runs = await listGenerationRuns(status ?? undefined)
          return addCorsHeaders(
            new Response(JSON.stringify({ runs }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/generation-runs] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/hivelearn/topics — catálogo de temas para el selector del juego
      if (url.pathname === '/api/hivelearn/topics' && req.method === 'GET') {
        try {
          const col = getDb().collection<{ titulo: string; descripcion: string | null; nivel: string | null; categoria: string | null; activo: number }>('hl_topics')
          const entries = await col.scan({})
          const topics = entries
            .map(e => ({ slug: e.id, titulo: e.doc.titulo, descripcion: e.doc.descripcion ?? null, nivel: e.doc.nivel ?? null, categoria: e.doc.categoria ?? null, activo: e.doc.activo }))
            .filter(t => t.activo !== 0)
            .map(({ activo: _activo, ...t }) => t)
          return addCorsHeaders(
            new Response(JSON.stringify({ topics }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/topics] Error', { error: (e as Error).message })
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
          const sessions = await persistence.getSessionsByAlumno('*')
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
          const session = await persistence.getSessionWithCurriculum(sessionId)
          if (!session) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Sesión no encontrada' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }

          const restored = await persistence.restoreSessionState(sessionId)
          const sessionProfile = await persistence.getStudentProfile(session.alumnoId)
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
              rango_edad: sessionProfile?.rangoEdad ?? 'adulto',
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
          await persistence.updateSessionProgress(
            body.sessionId,
            Math.max(0, Number(body.nodosCompletados ?? 0)),
            Math.max(0, Number(body.xpTotal ?? 0)),
          )

          if (typeof body.logrosJson === 'string') {
            await persistence.updateSessionLogros(body.sessionId, body.logrosJson)
          }

          if (typeof body.sessionStateJson === 'string') {
            await persistence.pauseSession(body.sessionId, body.lastNodeId ?? null, body.sessionStateJson)
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

          await persistence.completeSession(
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
          const agents = (await db.collection<Record<string, unknown>>('hl_agents').scan())
            .map(e => ({ id: e.id, ...e.doc }) as Record<string, unknown>)
            .sort((a, b) => String(b.role ?? '').localeCompare(String(a.role ?? '')) || String(a.name ?? '').localeCompare(String(b.name ?? '')))
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

      // GET /api/hivelearn/agents/:gameId/portrait — retrato del agente.
      // El path gameId es el HiveAgentId del juego (coordinator, content, ...).
      // Sirve el archivo cacheado en `data/portraits/{gameId}.{svg,png}`; si no
      // existe, lo genera bajo demanda con el agente de imagen (SVG pixel-art)
      // y lo cachea. Si no se puede generar, 404: la UI cae al sprite procedural.
      if (url.pathname.startsWith('/api/hivelearn/agents/') && url.pathname.endsWith('/portrait') && req.method === 'GET') {
        const parts = url.pathname.split('/')
        const agentGameId = parts[4] ?? ''
        try {
          const { isValidAgentId } = await import('./tts/agentVoices.js')
          if (!isValidAgentId(agentGameId)) {
            return addCorsHeaders(new Response('agentId inválido', { status: 400 }), req)
          }
          const { ensurePortrait } = await import('./portraits.js')
          const portrait = await ensurePortrait(agentGameId)
          if (!portrait) {
            return addCorsHeaders(new Response('Not found', { status: 404 }), req)
          }
          const file = Bun.file(portrait.path)
          return addCorsHeaders(
            new Response(file, { status: 200, headers: { 'Content-Type': portrait.contentType, 'Cache-Control': 'public, max-age=86400' } }),
            req,
          )
        } catch (e) {
          return addCorsHeaders(new Response((e as Error).message, { status: 500 }), req)
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
          const agentsCol = db.collection<Record<string, unknown>>('hl_agents');
          const agentEntry = await agentsCol.get(agentId);
          if (agentEntry) {
            await agentsCol.put(agentId, {
              ...agentEntry.doc,
              provider_id: body.provider_id,
              model_id: body.model_id,
              max_iterations: body.max_iterations,
              enabled: body.enabled,
              system_prompt: body.system_prompt || null,
              updated_at: new Date().toISOString(),
            });
          }
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
          const agentCount = await db.collection('hl_agents').count()
          const sessionCount = await db.collection('hl_sessions').count()
          return addCorsHeaders(
            new Response(JSON.stringify({
              agents: agentCount,
              sessions: sessionCount,
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

      // GET /api/stt/estado — disponibilidad del servidor STT (llama-server :8083)
      if (url.pathname === '/api/stt/estado' && req.method === 'GET') {
        try {
          const status = await getSttStatus()
          return addCorsHeaders(
            new Response(JSON.stringify(status), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: false, detail: (e as Error).message }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/tts-local/agent-voice?agentId=<game HiveAgentId>
      //     Devuelve la voz Piper resuelta para un agente (utilidad para UI).
      if (url.pathname === '/api/tts-local/agent-voice' && req.method === 'GET') {
        try {
          const agentId = url.searchParams.get('agentId') ?? ''
          const { resolveAgentVoice, isValidAgentId } = await import('./tts/agentVoices.js')
          if (!isValidAgentId(agentId as any)) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'agentId inválido' }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
              }),
              req,
            )
          }
          const voice = resolveAgentVoice(agentId as Parameters<typeof resolveAgentVoice>[0])
          return addCorsHeaders(
            new Response(JSON.stringify({ agentId, voice }), {
              status: 200, headers: { 'Content-Type': 'application/json' },
            }),
            req,
          )
        } catch (e) {
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500, headers: { 'Content-Type': 'application/json' },
            }),
            req,
          )
        }
      }

      // POST /api/stt-local/transcribe — recibe WAV (body binario) o { wav: <base64> }
      if (url.pathname === '/api/stt-local/transcribe' && req.method === 'POST') {
        try {
          const ct = req.headers.get('Content-Type') ?? ''
          let wav: ArrayBuffer
          if (ct.includes('application/json')) {
            const body = await req.json() as { wav?: string }
            if (!body.wav) {
              return addCorsHeaders(
                new Response(JSON.stringify({ error: "Campo 'wav' (base64) requerido" }), {
                  status: 400, headers: { 'Content-Type': 'application/json' },
                }),
                req
              )
            }
            wav = base64ToArrayBuffer(body.wav)
          } else {
            wav = await req.arrayBuffer()
            if (wav.byteLength === 0) {
              return addCorsHeaders(
                new Response(JSON.stringify({ error: 'Body vacío' }), {
                  status: 400, headers: { 'Content-Type': 'application/json' },
                }),
                req
              )
            }
          }
          dumpWavForDebug(wav)
          const { text } = await transcribeAudio(wav)
          return addCorsHeaders(
            new Response(JSON.stringify({ text }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.warn('[stt-transcribe] error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/tts-local/speak — cache-first sobre hl_tts_cache (hiveDB)
      if (url.pathname === '/api/tts-local/speak' && req.method === 'POST') {
        try {
          const body = await req.json() as { text?: string; voice?: string; agentId?: string }
          if (!body.text?.trim()) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: "Campo 'text' requerido" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          // Resuelve lugar: voice explícita → BD (hl_agent_voices) → mapa estático → default
          let voice = body.voice
          if (!voice && body.agentId) {
            try {
              const { getAgentVoice } = await import('../storage/voices.js')
              const dbVoice = await getAgentVoice(body.agentId)
              if (dbVoice?.voice) {
                voice = dbVoice.voice
              } else {
                const { resolveAgentVoice, isValidAgentId } = await import('./tts/agentVoices.js')
                if (isValidAgentId(body.agentId)) voice = resolveAgentVoice(body.agentId)
              }
            } catch { /* fallback a default */ }
          }

          // 1) Caché de hiveDB — respuestas repetidas instantáneas y offline
          try {
            const { ttsCacheGet } = await import('../storage/voices.js')
            const cached = await ttsCacheGet(voice ?? '', body.text)
            if (cached) {
              log.debug(`[tts-speak] cache hit (voice=${voice ?? 'default'}, chars=${body.text.length})`)
              return addCorsHeaders(
                new Response(cached, {
                  status: 200,
                  headers: { 'Content-Type': 'audio/wav', 'X-TTS-Cache': 'hit' },
                }),
                req
              )
            }
          } catch { /* sin caché disponible: sintetiza */ }

          // 2) Sintetiza y guarda en caché
          const audio = await synthesize(body.text, voice)
          try {
            const { ttsCachePut } = await import('../storage/voices.js')
            await ttsCachePut(voice ?? '', body.text, audio)
          } catch { /* caché es best-effort */ }

          return addCorsHeaders(
            new Response(audio, {
              status: 200,
              headers: { 'Content-Type': 'audio/wav', 'X-TTS-Cache': 'miss' },
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

      // GET /api/tts-local/voices — identidad sonora de los personajes (hiveDB)
      if (url.pathname === '/api/tts-local/voices' && req.method === 'GET') {
        try {
          const { listAgentVoices } = await import('../storage/voices.js')
          return addCorsHeaders(
            new Response(JSON.stringify({ voices: await listAgentVoices() }), {
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
        const dbMessages = await p.getOnboardingMessages(sid)
        const progress = await p.getOnboardingProgress(sid)
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
          new Response(JSON.stringify({ sessionId: sid, events: await p.getSwarmTimeline(sid) }), {
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
        if (path === '/api/portal/a2ui/ws') {
          void (async () => {
            const actor = await portal.accounts.session(ws.data.portalSession ?? '')
            if (!actor) { ws.close(1008, 'Sesión vencida'); return }
            const nodeId = new URLSearchParams(ws.data.search).get('nodeId') ?? ''
            for (const message of await portal.surface(actor, nodeId)) ws.send(JSON.stringify(message))
          })().catch(() => ws.close(1011, 'No se pudo abrir la superficie'))
          return
        }
        const search = ws.data.search ?? ''
        if (path.startsWith('/hivelearn-onboarding')) {
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
        } else if (path.startsWith('/hivelearn-swarm-dialogue')) {
          const u = new URL(`http://localhost${path}${search}`)
          const sessionId = u.searchParams.get('sessionId') ?? 'unknown'
          swarmDialogueSessions.set(sessionId, ws)
          log.info('[ws] Swarm dialogue connected', { sessionId })
          wsSend(ws, { type: 'connected' })
        } else if (path.startsWith('/hivelearn-agent-chat')) {
          const u = new URL(`http://localhost${path}${search}`)
          const sessionId = u.searchParams.get('sessionId') ?? 'unknown'
          const agentId = u.searchParams.get('agentId') ?? ''
          if (!isValidGameAgentId(agentId)) {
            wsSend(ws, { type: 'error', message: `agentId inválido: ${agentId}` })
          } else {
            openAgentChatWS(ws, { sessionId, agentIdGame: agentId })
          }
        } else {
          log.info('[ws] Client connected', { path })
        }
      },

      message(ws, message) {
        const path = ws.data.path
        if (path === '/api/portal/a2ui/ws') {
          if ((typeof message === 'string' ? message.length : message.byteLength) > 16384 || ws.data.busy) { ws.send(JSON.stringify({ error: { message: 'Solicitud excesiva o pendiente' } })); return }
          ws.data.busy = true
          void (async () => {
            const actor = await portal.accounts.session(ws.data.portalSession ?? '')
            if (!actor) { ws.close(1008, 'Sesión vencida'); return }
            const data = JSON.parse(message.toString())
            const nodeId = new URLSearchParams(ws.data.search).get('nodeId') ?? ''
            if (data.userAction?.context?.nodeId !== nodeId) throw new Error('Superficie incorrecta')
            for (const update of await portal.action(actor, data)) ws.send(JSON.stringify(update))
          })().catch(() => ws.send(JSON.stringify({ error: { message: 'No se pudo enviar: comprueba la evidencia y los prerrequisitos' } }))).finally(() => { ws.data.busy = false })
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
        if (path.startsWith('/hivelearn-agent-chat')) {
          void handleAgentChatWS(ws, message.toString())
          return
        }
        if (path.startsWith('/hivelearn-swarm-dialogue')) {
          void handleSwarmDialogueWS(ws, message.toString())
          return
        }
        handleWsMessage(ws, message)
      },

      close(ws, code, reason) {
        const path = ws.data.path
        if (path === '/api/portal/a2ui/ws' && (code === 1000 || code === 1005)) log.debug('[ws] Canal de actividad cerrado por el cliente', { path, code })
        else log.info(`[ws] Client disconnected: ${code} ${reason}`, { path })
        
        for (const [sessionId, sessionWs] of onboardingSessions.entries()) {
          if (sessionWs === ws) {
            onboardingSessions.delete(sessionId)
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
        for (const [sessionId, sessionWs] of swarmDialogueSessions.entries()) {
          if (sessionWs === ws) swarmDialogueSessions.delete(sessionId)
        }
        if (path.startsWith('/hivelearn-agent-chat')) closeAgentChatWS(ws)
      },
    },
  }
}
