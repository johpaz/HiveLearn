/**
 * HiveLearn HTTP Server + WebSocket
 * 
 * Gateway independiente con rutas API, WebSocket y serving de UI
 */
import { getDb } from '../storage/sqlite'
import { LessonPersistence, HiveLearnSwarm, updateHiveLearnAgentsProviderModel, hlSwarmEmitter } from '../index'
import { logger } from '../utils/logger'
import { encryptApiKey } from '../crypto/encrypt'
import { decryptApiKey } from '../crypto/decrypt'
import type { ServerWebSocket } from 'bun'
import { join } from 'path'
import { existsSync } from 'fs'

type UIBundle = Map<string, { data: Buffer; mime: string }>
let embeddedUIBundle: UIBundle | null = null

export function registerEmbeddedUI(bundle: UIBundle): void {
  embeddedUIBundle = bundle
}

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
function corsHeaders(req: Request): Record<string, string> {
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
    response.headers.set(key, value as string)
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
  const candidates = [
    join(process.cwd(), 'packages/ui/dist'),
    join(__dirname, '../../../ui/dist'),
    join(__dirname, '../../ui'),
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

      // ── Dev Mode: Proxy to Vite ────────────────────────────────────────
      if (isDev) {
        const upgrade = req.headers.get('Upgrade')
        if (upgrade === 'websocket') {
          return new Response('WebSocket upgrade required', { status: 426 })
        }

        if (!url.pathname.startsWith('/api')) {
          const ports = [5173, 5174]
          for (const port of ports) {
            try {
              const viteUrl = `http://localhost:${port}${url.pathname}${url.search}`
              const response = await fetch(viteUrl, { signal: AbortSignal.timeout(2000) })
              if (response.ok || response.status < 500) return response
            } catch {
              continue
            }
          }
          // Vite not ready yet — return auto-refresh loading page
          return new Response(
            `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="1"><title>HiveLearn — Iniciando…</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0}div{text-align:center}h2{font-size:2rem;margin-bottom:.5rem}p{color:#94a3b8}</style></head><body><div><h2>🐝 HiveLearn</h2><p>Iniciando servidor de desarrollo…</p><p><small>Esta página se recargará automáticamente</small></p></div></body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
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
          const providers = db.query(`
            SELECT id, name, base_url, category, enabled, active, created_at
            FROM providers
            ORDER BY name
          `).all()
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
          const models = db.query(`
            SELECT id, provider_id, name, model_type, context_window, capabilities, enabled, active
            FROM models
            ORDER BY name
          `).all()
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
          const provider = db.query('SELECT api_key_encrypted FROM providers WHERE id = ?').get(providerId) as any
          return addCorsHeaders(
            new Response(JSON.stringify({ hasApiKey: !!provider?.api_key_encrypted }), {
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
            UPDATE providers SET api_key_encrypted = ?, api_key_iv = ?, active = 1
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
