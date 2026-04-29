/**
 * HiveLearn HTTP Server + WebSocket
 * 
 * Gateway independiente con rutas API, WebSocket y serving de UI
 */
import { getDb } from '../storage/sqlite'
import { LessonPersistence, HiveLearnSwarm, updateHiveLearnAgentsProviderModel, hlSwarmEmitter } from '../index'
import { logger } from '../utils/logger'
import type { ServerWebSocket } from 'bun'
import { join } from 'path'
import { existsSync } from 'fs'

const log = logger.child('server')

const isDev = process.env.NODE_ENV === 'development'

interface Server {
  fetch: (req: Request) => Response | Promise<Response>
  websocket: {
    open: (ws: ServerWebSocket<undefined>) => void
    message: (ws: ServerWebSocket<undefined>, message: string | ArrayBuffer | Buffer) => void
    close: (ws: ServerWebSocket<undefined>, code: number, reason: string) => void
  }
}

// CORS headers helper
function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID',
    'Access-Control-Max-Age': '86400',
  }
}

function addCorsHeaders(response: Response, req: Request): Response {
  const headers = corsHeaders(req)
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }
  return response
}

// WebSocket sessions maps
const onboardingSessions = new Map<string, ServerWebSocket<undefined>>()
const lessonSessions = new Map<string, ServerWebSocket<undefined>>()
const eventSubscribers = new Set<ServerWebSocket<undefined>>()

// Helper para enviar mensajes por WebSocket
function wsSend(ws: ServerWebSocket<undefined>, data: unknown): void {
  try {
    ws.send(JSON.stringify(data))
  } catch (e) {
    log.warn('WebSocket send failed', { error: (e as Error).message })
  }
}

// WebSocket message handler
function handleWsMessage(ws: ServerWebSocket<undefined>, message: string | ArrayBuffer | Buffer): void {
  try {
    const data = JSON.parse(message.toString())
    log.debug('[ws] Message', data)
    
    // Handle ping/pong
    if (data?.type === 'ping') {
      wsSend(ws, { type: 'pong' })
      return
    }
  } catch {
    log.warn('[ws] Malformed message')
  }
}

// Helper para servir archivos estáticos de la UI
async function serveUIFile(pathname: string): Promise<Response | null> {
  // En producción, el binario está en dist/hivelearn.js y la UI en dist/ui/
  // En desarrollo, usamos la ruta relativa desde src/
  const uiDir = isDev 
    ? join(__dirname, '../../../ui/dist')
    : join(__dirname, '../../ui')

  // Normalize path
  let subPath = pathname === '/' ? '/index.html' : pathname.replace(/^\/ui/, '')
  if (subPath === '/' || !subPath) subPath = '/index.html'

  const filePath = join(uiDir, subPath)

  // Check for file
  const file = Bun.file(filePath)
  if (await file.exists()) {
    return new Response(file)
  }

  // SPA fallback - serve index.html for routes without extension
  if (!pathname.includes('.')) {
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
      
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(req),
        })
      }

      // ── UI Static Files (Production) ───────────────────────────────────
      if (!isDev && (url.pathname === '/' || url.pathname.startsWith('/ui'))) {
        const uiResponse = await serveUIFile(url.pathname)
        if (uiResponse) {
          return uiResponse
        }
      }

      // ── Dev Mode: Proxy to Vite ───────────────────────────────────────
      if (isDev) {
        // Detectar WebSocket upgrade - NO proxear a Vite
        const upgrade = req.headers.get('Upgrade')
        if (upgrade === 'websocket') {
          // WebSocket upgrade lo maneja Bun.serve con server.websocket
          // Retornar 426 para forzar el upgrade
          return new Response('WebSocket upgrade required', { status: 426 })
        }
        
        // Proxy para TODAS las rutas que no son API
        // Vite maneja: /src/*, /@vite/*, /@react-refresh/*, /node_modules/*, etc.
        if (!url.pathname.startsWith('/api')) {
          try {
            const viteUrl = `http://localhost:5173${url.pathname}${url.search}`
            const response = await fetch(viteUrl)
            return response
          } catch {
            return new Response('Vite dev server not available', { status: 503 })
          }
        }
      }

      // ── API Routes ─────────────────────────────────────────────────────
      
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
            providerId: string
            modelId: string
          }
          
          const db = getDb()
          updateHiveLearnAgentsProviderModel(db, body.providerId, body.modelId)
          
          // SSE stream
          const encoder = new TextEncoder()
          const { readable, writable } = new TransformStream()
          const writer = writable.getWriter()
          
          const send = (data: any) => {
            writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          }
          
          ;(async () => {
            try {
              const swarm = new HiveLearnSwarm({
                onProgress: (progress) => send({ type: 'progress', payload: progress }),
              })
              
              const eventHandler = (event: any) => {
                send({ type: 'event', payload: event })
              }
              hlSwarmEmitter.subscribe('*', eventHandler)

              const program = await swarm.run(body.perfil, body.meta)
              send({ type: 'complete', payload: program })

              hlSwarmEmitter.unsubscribe('*', eventHandler)
              await writer.close()
            } catch (error) {
              send({ type: 'error', payload: { message: (error as Error).message } })
              hlSwarmEmitter.unsubscribe('*', (e: any) => {})
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
        log.info('[ws] Client connected')
      },

      message: handleWsMessage,

      close(ws, code, reason) {
        log.info(`[ws] Client disconnected: ${code} ${reason}`)
        
        // Clean up sessions
        for (const [sessionId, sessionWs] of onboardingSessions.entries()) {
          if (sessionWs === ws) {
            onboardingSessions.delete(sessionId)
          }
        }
        for (const [sessionId, sessionWs] of lessonSessions.entries()) {
          if (sessionWs === ws) {
            lessonSessions.delete(sessionId)
          }
        }
        eventSubscribers.delete(ws)
      },
    },
  }
}
