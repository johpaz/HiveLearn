/**
 * HiveLearn HTTP Server + WebSocket
 *
 * Gateway independiente con rutas API, WebSocket y serving de UI
 */
import { hlSwarmEmitter } from '../index'
import { logger } from '../utils/logger'
import {
  startHeartbeat,
  handleWebSocketOpen,
  handleWebSocketClose,
  handleOnboardingInit,
  handleOnboardingUserMessage,
  handleProgramMessage,
  cleanupProgramSession,
  startLessonSession,
  handleLessonMessage,
  handleMonitorFrame,
  type WebSocketSessionManager,
} from '../websocket'
import { handleLLMWebSocket } from './llm-local'
import type { ServerWebSocket, Server } from 'bun'
import { join } from 'path'
import { existsSync } from 'fs'
import { routeHandlers } from './routes'
import { corsHeaders, addCorsHeaders } from './routes/_helpers'

type WebSocketData = {
  pathname: string
}

type UIBundle = Map<string, { data: Buffer; mime: string }>
let embeddedUIBundle: UIBundle | null = null

export function registerEmbeddedUI(bundle: UIBundle): void {
  embeddedUIBundle = bundle
}

const log = logger.child('server')

// WebSocket session manager
const sessions: WebSocketSessionManager = {
  onboardingSessions: new Map<string, ServerWebSocket<any>>(),
  lessonSessions: new Map<string, ServerWebSocket<any>>(),
  programSessions: new Map<string, ServerWebSocket<any>>(),
  eventSubscribers: new Set<ServerWebSocket<any>>(),
}

// Start heartbeat
startHeartbeat(sessions)

// ── Bridge: hlSwarmEmitter → WebSocket eventSubscribers ───────────────────
function broadcastToSubscribers(msg: object): void {
  const payload = JSON.stringify(msg)
  for (const ws of sessions.eventSubscribers) {
    try { ws.send(payload) } catch { sessions.eventSubscribers.delete(ws) }
  }
}

hlSwarmEmitter.on('swarm:started', (e: any) => {
  broadcastToSubscribers({ type: 'swarm_started', swarmId: e.swarmId, totalTasks: e.totalTasks })
})
hlSwarmEmitter.on('worker:task_started', (e: any) => {
  broadcastToSubscribers({ type: 'agent_started', agentId: e.workerId, agentName: e.workerName, swarmId: e.swarmId })
})
hlSwarmEmitter.on('worker:task_completed', (e: any) => {
  broadcastToSubscribers({ type: 'agent_completed', agentId: e.workerId, agentName: e.workerName, progress: e.progress, swarmId: e.swarmId })
})
hlSwarmEmitter.on('worker:task_failed', (e: any) => {
  broadcastToSubscribers({ type: 'agent_failed', agentId: e.workerId, agentName: e.workerName, error: e.error, swarmId: e.swarmId })
})
hlSwarmEmitter.on('swarm:completed', (e: any) => {
  broadcastToSubscribers({ type: 'swarm_completed', swarmId: e.swarmId, success: e.success, completedCount: e.completedCount, failedCount: e.failedCount, totalDurationMs: e.totalDurationMs })
})

// Helper para servir archivos estáticos de la UI
async function serveUIFile(pathname: string): Promise<Response | null> {
  log.info(`[serveUI] Request: ${pathname}`)
  const isHtmlRequest = pathname === '/' || !pathname.includes('.') || pathname.endsWith('.html')
  const subPath = isHtmlRequest ? '/index.html' : pathname

  // First try registered embedded UI bundle (from CLI postbuild)
  if (embeddedUIBundle) {
    const entry = embeddedUIBundle.get(subPath)
    if (entry) {
      return new Response(entry.data as any, {
        headers: {
          'Content-Type': entry.mime,
          'Cache-Control': subPath === '/index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        },
      })
    }
    // Only fallback to index.html if it's an HTML request
    if (isHtmlRequest) {
      const indexEntry = embeddedUIBundle.get('/index.html')
      if (indexEntry) {
        return new Response(indexEntry.data as any, {
          headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' },
        })
      }
    }
  }

  // Fallback to disk — try multiple locations
  const candidates = [
    join(process.cwd(), 'dist/ui'),
    join(process.cwd(), 'packages/ui/dist'),
    join(__dirname, '../../../ui/dist'),
    join(__dirname, '../../ui'),
  ]

  for (const uiDir of candidates) {
    if (!existsSync(uiDir)) continue

    const filePath = join(uiDir, subPath)
    const file = Bun.file(filePath)
    if (await file.exists()) {
      const ext = subPath.split('.').pop()?.toLowerCase()
      const mimeTypes: Record<string, string> = {
        'ogg': 'audio/ogg',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'js': 'application/javascript',
        'css': 'text/css',
        'html': 'text/html',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'svg': 'image/svg+xml'
      }
      
      return new Response(file, {
        headers: {
          'Content-Type': mimeTypes[ext || ''] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=3600'
        }
      })
    }

    // SPA fallback - only for HTML requests
    if (isHtmlRequest) {
      const indexFile = Bun.file(join(uiDir, 'index.html'))
      if (await indexFile.exists()) {
        return new Response(indexFile, {
          headers: { 'Content-Type': 'text/html' }
        })
      }
    }
  }

  return null
}

export function createServer(): any {
  return {
    fetch: async (req: Request, server: Server<WebSocketData>) => {
      const url = new URL(req.url)

      // ── WebSocket upgrade: debe ser lo primero, sin ningún await previo ──
      if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        if (url.pathname === '/ws/llm') {
          const upgraded = server.upgrade(req, {
            data: { pathname: '/ws/llm' },
          })
          if (upgraded) return undefined
          return new Response('WebSocket upgrade failed', { status: 400 })
        }
        if (url.pathname.includes('hivelearn-onboarding') ||
          url.pathname.includes('hivelearn-lesson') ||
          url.pathname.includes('hivelearn-events') ||
          url.pathname.includes('hivelearn-program') ||
          url.pathname.includes('hivelearn-game')) {
          const upgraded = server.upgrade(req, {
            data: { pathname: url.pathname },
          })
          if (upgraded) return undefined
          return new Response('WebSocket upgrade failed', { status: 400 })
        }
      }

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(req),
        })
      }

      // ── Serve UI for all non-API / non-WS routes ───────────────────────
      if (!url.pathname.startsWith('/api') && !url.pathname.startsWith('/ws')) {
        const uiResponse = await serveUIFile(url.pathname)
        if (uiResponse) {
          log.debug('[serveUI] Serving static file', { path: url.pathname })
          return uiResponse
        }
      }

      // ── API Routes ─────────────────────────────────────────────────────
      for (const handler of routeHandlers) {
        const response = await handler(req, url)
        if (response) {
          log.debug('[api] Route matched', { handler: handler.name, path: url.pathname, method: req.method })
          return response
        }
      }

      log.warn('[api] No route matched', { path: url.pathname, method: req.method })

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
      async open(ws: any) {
        const { pathname } = (ws.data ?? {}) as { pathname: string }
        await handleWebSocketOpen(ws, pathname, sessions)
        ws._isOnboarding = (pathname ?? '').includes('hivelearn-onboarding')
        ws._isProgram    = (pathname ?? '').includes('hivelearn-program')
        ws._isLesson     = (pathname ?? '').includes('hivelearn-lesson')
      },

      message(ws: any, message: any) {
        try {
          const data = JSON.parse(message.toString())
          if (data?.type === 'ping' || data?.tipo === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', tipo: 'pong', timestamp: Date.now() }))
            return
          }
          const isOnboarding = ws._isOnboarding as boolean | undefined
          const isProgram    = ws._isProgram    as boolean | undefined
          const isLesson     = ws._isLesson     as boolean | undefined

          if (isLesson) {
            const sessionId = data.session_id || data.sessionId
            if (data?.tipo === 'iniciar_sesion' && sessionId) {
              startLessonSession(sessionId, ws)
            } else if (data?.tipo === 'monitor:frame' && data.frame && sessionId) {
              handleMonitorFrame(sessionId, String(data.frame), data.context ?? {}, ws)
                .catch((e: Error) => log.error('[monitor] frame error', { error: e.message }))
            } else if (sessionId) {
              handleLessonMessage(sessionId, data)
            }
          } else if (isProgram) {
            handleProgramMessage(ws, data).catch((e: Error) =>
              log.error('[ws] program message error', { error: e.message })
            )
          } else if (isOnboarding) {
            const sessionId = data.session_id || data.sessionId
            if (data?.type === 'init' && sessionId) {
              handleOnboardingInit(ws, sessionId).catch((e: Error) =>
                log.error('[ws] onboarding init error', { error: e.message })
              )
            } else if (data?.type === 'user_message' && data.content && sessionId) {
              handleOnboardingUserMessage(ws, sessionId, String(data.content)).catch((e: Error) =>
                log.error('[ws] onboarding user_message error', { error: e.message })
              )
            }
          } else if ((ws.data as any)?.pathname === '/ws/llm') {
            handleLLMWebSocket(ws, message.toString()).catch((e: Error) =>
              log.error('[ws] llm-local error', { error: e.message })
            )
          }
        } catch {
          log.debug('[ws] Malformed message')
        }
      },

      close(ws: any, code: any, reason: any) {
        const sessionId = ws._sessionId as string | undefined
        if (sessionId && ws._isProgram) {
          cleanupProgramSession(sessionId)
        }
        handleWebSocketClose(ws, code, reason, sessions)
      },
    },

  }
}
