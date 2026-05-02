/**
 * HiveLearn HTTP Server + WebSocket
 *
 * Gateway independiente con rutas API, WebSocket y serving de UI
 */
import { getDb } from '../storage/sqlite'
import { LessonPersistence, updateHiveLearnAgentsProviderModel, hlSwarmEmitter } from '../index'
import { obtenerPrograma, crearPrograma } from '../skills/gestionar-programas.skill'
import { crearAlumno } from '../skills/gestionar-alumnos.skill'
import { logger, redact } from '../utils/logger'
import {
  storeProviderApiKey,
  getProviderApiKey,
  hasProviderApiKey,
  deleteProviderApiKey
} from '../secrets/provider-secrets'
import {
  startHeartbeat,
  handleWebSocketOpen,
  handleWebSocketClose,
  isWebSocketRoute,
  handleOnboardingInit,
  handleOnboardingUserMessage,
  iniciarPrograma,
  procesarRespuesta,
  cleanupProgramSession,
  startLessonSession,
  handleLessonMessage,
  handleMonitorFrame,
  type WebSocketSessionManager
} from '../websocket'
import { getOrGenerateCorrelationId } from '../utils/correlation-id'
import { runSwarmGeneration } from '../swarm/swarm-generator'
import type { ServerWebSocket, Server } from 'bun'
import { join } from 'path'
import { existsSync } from 'fs'
import { handleLLMWebSocket, handleLLMStatus } from './llm-local'
import { checkTTSInstallation, installPiper, installVoice, ensureTTSDirs } from './tts/install'
import { synthesize, listVoices } from './tts/logic'
import { AVAILABLE_VOICES } from './tts/detect'

type WebSocketData = {
  sessionId: string | null
  pathname: string
}

type UIBundle = Map<string, { data: Buffer; mime: string }>
let embeddedUIBundle: UIBundle | null = null

export function registerEmbeddedUI(bundle: UIBundle): void {
  embeddedUIBundle = bundle
}

const log = logger.child('server')
const isDev = process.env.NODE_ENV === 'development'

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

export function createServer(): any {
  return {
    fetch: async (req: Request, server: Server<WebSocketData>) => {
      const url = new URL(req.url)

      // ── WebSocket upgrade: debe ser lo primero, sin ningún await previo ──
      if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        if (url.pathname === '/ws/llm') {
          const upgraded = server.upgrade(req, {
            data: { sessionId: 'llm-local', pathname: '/ws/llm' },
          })
          if (upgraded) return undefined
          return new Response('WebSocket upgrade failed', { status: 400 })
        }
        if (url.pathname.includes('hivelearn-onboarding') ||
            url.pathname.includes('hivelearn-lesson') ||
            url.pathname.includes('hivelearn-events')) {
          const upgraded = server.upgrade(req, {
            data: {
              sessionId: url.searchParams.get('sessionId'),
              pathname: url.pathname,
            },
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

      // ── Health check ───────────────────────────────────────────────────
      if (url.pathname === '/health' && req.method === 'GET') {
        const correlationId = getOrGenerateCorrelationId(req)
        log.info('[health] Health check', { correlationId })

        const healthData = {
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          pid: process.pid,
          memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
          },
        }

        log.debug('[health] Health check response', { ...healthData, correlationId })

        return new Response(JSON.stringify(healthData), {
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': correlationId,
          },
        })
      }

      // ── Production: serve UI for all non-API routes ────────────────────
      if (!isDev && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/ws')) {
        const uiResponse = await serveUIFile(url.pathname)
        if (uiResponse) return uiResponse
      }

      // ── Dev Mode: Proxy to Vite ────────────────────────────────────────
      if (isDev) {
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

      // ── API Routes ─────────────────────────────────────────────────────

      // GET /api/providers
      if (url.pathname === '/api/providers' && req.method === 'GET') {
        try {
          const db = getDb()
          const rawProviders = db.query(`
            SELECT id, name, base_url, category, enabled, active, created_at
            FROM providers
            ORDER BY name
          `).all() as any[]

          // Enriquecer con estado de API Key en una sola pasada de backend
          const providers = await Promise.all(rawProviders.map(async p => ({
            ...p,
            hasApiKey: await hasProviderApiKey(p.id)
          })))

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

      // ── Local LLM Routes ───────────────────────────────────────────────
      // GET /api/llm/status
      if (url.pathname === '/api/llm/status' && req.method === 'GET') {
        return handleLLMStatus()
      }

      // GET /api/llm/models
      if (url.pathname === '/api/llm/models' && req.method === 'GET') {
        const { listLocalModels } = await import('./llm-local')
        return Response.json({ models: listLocalModels() })
      }

      // POST /api/llm/download
      if (url.pathname === '/api/llm/download' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}))
        const { model } = body as { model?: string }
        if (!model) {
          return Response.json({ error: "Modelo requerido" }, { status: 400 })
        }
        try {
          const { downloadModel } = await import('./llm-local')
          const path = await downloadModel(model as any)
          return Response.json({ ok: true, path })
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Error descargando" },
            { status: 500 }
          )
        }
      }

      // GET /api/providers/:id/api-key - Verificar si tiene API key
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/api-key') && req.method === 'GET') {
        const correlationId = getOrGenerateCorrelationId(req)
        const providerId = url.pathname.split('/')[3]
        const startTime = Date.now()
        
        log.info('[GET /api/providers/:id/api-key]', { providerId, correlationId })
        
        try {
          const hasKey = await hasProviderApiKey(providerId)
          const duration = Date.now() - startTime
          
          log.debug('[GET /api/providers/:id/api-key] Success', { 
            providerId, 
            hasApiKey: hasKey, 
            duration,
            correlationId 
          })
          
          return addCorsHeaders(
            new Response(JSON.stringify({ hasApiKey: hasKey }), {
              status: 200,
              headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
            }),
            req
          )
        } catch (e) {
          const duration = Date.now() - startTime
          log.error('[GET /api/providers/:id/api-key] Error', { 
            providerId,
            error: (e as Error).message,
            stack: (e as Error).stack,
            duration,
            correlationId,
          })
          
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
            }),
            req
          )
        }
      }

      // POST /api/providers/:id/api-key - Guardar API key
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/api-key') && req.method === 'POST') {
        const correlationId = getOrGenerateCorrelationId(req)
        const providerId = url.pathname.split('/')[3]
        const startTime = Date.now()
        
        log.info('[POST /api/providers/:id/api-key]', { providerId, correlationId })
        
        try {
          const body = await req.json() as { apiKey: string }
          
          log.debug('[POST /api/providers/:id/api-key] Request body', {
            providerId,
            hasApiKey: !!body.apiKey,
            keyLength: body.apiKey?.length,
            correlationId,
          })
          
          if (!body.apiKey) {
            log.warn('[POST /api/providers/:id/api-key] Missing API key', { providerId, correlationId })
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'apiKey es requerido' }), {
                status: 400,
                headers: { 
                  'Content-Type': 'application/json',
                  'X-Correlation-ID': correlationId,
                },
              }),
              req
            )
          }
          
          log.debug('[POST /api/providers/:id/api-key] Calling storeProviderApiKey', { 
            providerId, 
            correlationId 
          })
          
          await storeProviderApiKey(providerId, body.apiKey)
          
          const duration = Date.now() - startTime
          log.info('[POST /api/providers/:id/api-key] Success', { 
            providerId, 
            duration,
            correlationId 
          })
          
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
            }),
            req
          )
        } catch (e) {
          const duration = Date.now() - startTime
          log.error('[POST /api/providers/:id/api-key] Error', { 
            providerId,
            error: (e as Error).message,
            stack: (e as Error).stack,
            duration,
            correlationId,
            code: (e as any).code,
          })
          
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
            }),
            req
          )
        }
      }

      // DELETE /api/providers/:id/api-key - Eliminar API key
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/api-key') && req.method === 'DELETE') {
        const correlationId = getOrGenerateCorrelationId(req)
        const providerId = url.pathname.split('/')[3]
        const startTime = Date.now()
        
        log.info('[DELETE /api/providers/:id/api-key]', { providerId, correlationId })
        
        try {
          await deleteProviderApiKey(providerId)
          
          const duration = Date.now() - startTime
          log.info('[DELETE /api/providers/:id/api-key] Success', { 
            providerId, 
            duration,
            correlationId 
          })
          
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
            }),
            req
          )
        } catch (e) {
          const duration = Date.now() - startTime
          log.error('[DELETE /api/providers/:id/api-key] Error', { 
            providerId,
            error: (e as Error).message,
            stack: (e as Error).stack,
            duration,
            correlationId,
          })
          
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
            }),
            req
          )
        }
      }

      // PUT /api/providers/:id/toggle - Activar/desactivar provider
      if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/toggle') && req.method === 'PUT') {
        const correlationId = getOrGenerateCorrelationId(req)
        const providerId = url.pathname.split('/')[3]

        log.info('[PUT /api/providers/:id/toggle]', { providerId, correlationId })

        try {
          const body = await req.json() as { active: boolean }
          const db = getDb()

          if (body.active) {
            db.query(`UPDATE providers SET active = 1, enabled = 1 WHERE id = ?`).run(providerId)
            db.query(`UPDATE models SET active = 1, enabled = 1 WHERE provider_id = ?`).run(providerId)
          } else {
            db.query(`UPDATE providers SET active = 0, enabled = 0 WHERE id = ?`).run(providerId)
            db.query(`UPDATE models SET active = 0, enabled = 0 WHERE provider_id = ?`).run(providerId)
          }

          log.info('[PUT /api/providers/:id/toggle] Success', { providerId, active: body.active, correlationId })

          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true, active: body.active }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
            }),
            req
          )
        } catch (e) {
          log.error('[PUT /api/providers/:id/toggle] Error', {
            providerId,
            error: (e as Error).message,
            correlationId,
          })

          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
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
              VALUES (?, 'ollama', ?, 'llm', 32000, '["chat", "local"]', 1, 1)
            `).run(modelId, modelName)
            imported++
          }
          // Activar el provider Ollama para que sus modelos aparezcan en los selectores
          db.query(`UPDATE providers SET active = 1, enabled = 1 WHERE id = 'ollama'`).run()
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

      // POST /api/hivelearn/generate — inicia la generación del programa via swarm
      if (url.pathname === '/api/hivelearn/generate' && req.method === 'POST') {
        try {
          const body = await req.json() as { perfil: any; meta: string; sessionId?: string }
          if (!body.perfil || !body.meta) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'perfil y meta son requeridos' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          const swarmId = body.sessionId ?? `swarm-${Date.now()}`
          // Lanzar en background — responde inmediatamente, eventos via WebSocket
          runSwarmGeneration(body.perfil, body.meta, swarmId).catch(
            (e: Error) => log.error('Swarm generation failed', { swarmId, error: e.message })
          )
          return addCorsHeaders(
            new Response(JSON.stringify({ ok: true, swarmId }), {
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

      // POST /api/hivelearn/student-profile — crea perfil desde formulario Pixi
      if (url.pathname === '/api/hivelearn/student-profile' && req.method === 'POST') {
        try {
          const body = await req.json() as { nombre: string; nickname: string; edad: number }
          const alumnoId = crypto.randomUUID()
          const avatar = body.edad <= 12 ? '🧒' : body.edad <= 17 ? '🧑' : '👤'
          const result = await crearAlumno({
            alumnoId,
            nombre: body.nombre.trim(),
            nickname: body.nickname.trim(),
            avatar,
            edad: Number(body.edad),
            estado: 'activo',
            sesionesTotal: 0,
            xpAcumulado: 0,
          })
          if (!result.ok) throw new Error('No se pudo crear el perfil')
          const perfil = {
            alumnoId,
            nombre: body.nombre.trim(),
            nickname: body.nickname.trim(),
            avatar,
            edad: Number(body.edad),
            estado: 'activo' as const,
            sesionesTotal: 0,
            xpAcumulado: 0,
            creadoEn: new Date().toISOString(),
            ultimoAcceso: new Date().toISOString(),
          }
          return addCorsHeaders(
            new Response(JSON.stringify({ alumnoId, perfil }), {
              status: 201,
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

      // GET /api/hivelearn/student-profile/search?q=<nombre_o_nick>
      if (url.pathname === '/api/hivelearn/student-profile/search' && req.method === 'GET') {
        try {
          const q = (url.searchParams.get('q') ?? '').trim()
          const db = getDb()
          const rows = db.query(`
            SELECT alumno_id, nombre, nickname, apodo, avatar, edad, estado, sesiones_total, xp_acumulado
            FROM hl_student_profiles
            WHERE nombre LIKE ? OR nickname LIKE ? OR apodo LIKE ?
            ORDER BY ultimo_acceso DESC
            LIMIT 10
          `).all(`%${q}%`, `%${q}%`, `%${q}%`) as Record<string, unknown>[]
          const profiles = rows.map(r => ({
            alumnoId:      r.alumno_id,
            nombre:        r.nombre,
            nickname:      r.nickname || r.apodo,
            avatar:        r.avatar,
            edad:          r.edad,
            estado:        r.estado,
            sesionesTotal: r.sesiones_total,
            xpAcumulado:   r.xp_acumulado,
          }))
          return addCorsHeaders(
            new Response(JSON.stringify({ profiles }), {
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

      // GET /api/hivelearn/sessions
      if (url.pathname === '/api/hivelearn/sessions' && req.method === 'GET') {
        try {
          const persistence = new LessonPersistence()
          const q = url.searchParams.get('q') ?? undefined
          const nickname = url.searchParams.get('nickname') ?? undefined
          const sessions = persistence.getAllSessions({ q: q, nickname: nickname })
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

      // ── Instancia Única ───────────────────────────────────────────────────
      // GET /api/hivelearn/instance - Obtener instancia por UUID
      if (url.pathname === '/api/hivelearn/instance' && req.method === 'GET') {
        try {
          const instanceId = url.searchParams.get('instanceId')
          if (!instanceId) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'instanceId es requerido' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          
          const db = getDb()
          const instance = db.query(
            'SELECT instance_id, provider_id, model_id, created_at FROM hl_instances WHERE instance_id = ?'
          ).get(instanceId) as any
          
          if (!instance) {
            return addCorsHeaders(
              new Response(JSON.stringify({ 
                error: 'Instancia no encontrada',
                configured: false 
              }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          
          return addCorsHeaders(
            new Response(JSON.stringify({ 
              configured: true,
              instanceId: instance.instance_id,
              providerId: instance.provider_id,
              modelId: instance.model_id,
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/instance GET] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // POST /api/hivelearn/instance - Registrar nueva instancia
      if (url.pathname === '/api/hivelearn/instance' && req.method === 'POST') {
        try {
          const body = await req.json() as { 
            instanceId: string
            providerId?: string
            modelId?: string
          }
          
          if (!body.instanceId) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'instanceId es requerido' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          
          const db = getDb()
          const providerId = body.providerId || 'ollama'
          const modelId = body.modelId || 'gemma2:9b'
          
          // Insertar o actualizar instancia
          db.query(`
            INSERT OR REPLACE INTO hl_instances (instance_id, provider_id, model_id, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          `).run(body.instanceId, providerId, modelId)
          
          return addCorsHeaders(
            new Response(JSON.stringify({ 
              ok: true,
              instanceId: body.instanceId,
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        } catch (e) {
          log.error('[hivelearn/instance POST] Error', { error: (e as Error).message })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
            req
          )
        }
      }

      // GET /api/hivelearn/metrics - Obtener métricas de sesiones
      if (url.pathname === '/api/hivelearn/metrics' && req.method === 'GET') {
        const correlationId = getOrGenerateCorrelationId(req)
        const startTime = Date.now()
        
        log.info('[GET /api/hivelearn/metrics]', { correlationId })
        
        try {
          const db = getDb();

          // Total de sesiones
          const totalSessionsRow = db.query('SELECT COUNT(*) as count FROM hl_sessions').get() as { count: number };
          const totalSessions = totalSessionsRow.count;

          // Sesiones completadas
          const completedRow = db.query('SELECT COUNT(*) as count FROM hl_sessions WHERE completada = 1').get() as { count: number };
          const completedSessions = completedRow.count;

          // XP total
          const xpRow = db.query('SELECT COALESCE(SUM(xp_total), 0) as total FROM hl_sessions').get() as { total: number };
          const totalXp = xpRow.total;

          // Score promedio (usando rating como proxy)
          const scoreRow = db.query('SELECT COALESCE(AVG(rating), 0) as avg FROM hl_sessions WHERE rating IS NOT NULL').get() as { avg: number };
          const avgScore = scoreRow.avg;

          // Tasa de completación
          const completionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

          const metrics = {
            total_xp: totalXp || 0,
            avg_score: Math.round(avgScore * 10) / 10,
            completion_rate: Math.round(completionRate * 10) / 10,
            total_sessions: totalSessions,
            completed_sessions: completedSessions,
          };
          
          const duration = Date.now() - startTime
          log.debug('[GET /api/hivelearn/metrics] Success', {
            metrics,
            duration,
            correlationId,
          })

          return addCorsHeaders(
            new Response(JSON.stringify(metrics), {
              status: 200,
              headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
            }),
            req
          );
        } catch (e) {
          const duration = Date.now() - startTime
          log.error('[hivelearn/metrics] Error', { 
            error: (e as Error).message,
            stack: (e as Error).stack,
            duration,
            correlationId,
          })
          return addCorsHeaders(
            new Response(JSON.stringify({ error: (e as Error).message }), {
              status: 500,
              headers: { 
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
              },
            }),
            req
          );
        }
      }

      // GET /api/hivelearn/programs/:id
      if (url.pathname.startsWith('/api/hivelearn/programs/') && req.method === 'GET') {
        const programId = url.pathname.split('/')[4]
        try {
          const program = await obtenerPrograma(programId)
          if (!program) {
            return addCorsHeaders(
              new Response(JSON.stringify({ error: 'Program not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              }),
              req
            )
          }
          return addCorsHeaders(
            new Response(JSON.stringify({ program }), {
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

      // POST /api/hivelearn/programs
      if (url.pathname === '/api/hivelearn/programs' && req.method === 'POST') {
        try {
          const body = await req.json() as any
          const result = await crearPrograma(body)
          return addCorsHeaders(
            new Response(JSON.stringify(result), {
              status: 201,
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
      // ── TTS Endpoints ──────────────────────────────────────────────────────

      // GET /api/tts/status
      if (url.pathname === '/api/tts/status' && req.method === 'GET') {
        const status = checkTTSInstallation()
        log.info('[tts] status check', status)
        return addCorsHeaders(Response.json(status), req)
      }

      // POST /api/tts/install
      if (url.pathname === '/api/tts/install' && req.method === 'POST') {
        try {
          const { voice } = await req.json() as { voice?: string }
          ensureTTSDirs()
          await installPiper()
          await installVoice(voice)
          return addCorsHeaders(Response.json({ success: true, status: checkTTSInstallation() }), req)
        } catch (e) {
          log.error('[tts] install error', { error: (e as Error).message })
          return addCorsHeaders(Response.json({ error: (e as Error).message }, { status: 500 }), req)
        }
      }

      // POST /api/tts/synthesize
      if (url.pathname === '/api/tts/synthesize' && req.method === 'POST') {
        try {
          const { text, voice } = await req.json() as { text: string; voice?: string }
          if (!text) return addCorsHeaders(Response.json({ error: 'Text required' }, { status: 400 }), req)
          
          const audio = await synthesize(text, voice)
          return addCorsHeaders(new Response(audio, {
            headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(audio.byteLength) }
          }), req)
        } catch (e) {
          log.error('[tts] synthesize error', { error: (e as Error).message })
          return addCorsHeaders(Response.json({ error: (e as Error).message }, { status: 500 }), req)
        }
      }

      // GET /api/tts/voices
      if (url.pathname === '/api/tts/voices' && req.method === 'GET') {
        return addCorsHeaders(Response.json({ voices: listVoices() }), req)
      }

      // GET /api/tts/available-voices
      if (url.pathname === '/api/tts/available-voices' && req.method === 'GET') {
        log.info('[tts] listing available voices', { count: AVAILABLE_VOICES.length })
        return addCorsHeaders(Response.json({ voices: AVAILABLE_VOICES }), req)
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
      async open(ws: any) {
        const { sessionId, pathname } = (ws.data ?? {}) as { sessionId: string | null; pathname: string }
        await handleWebSocketOpen(ws, sessionId, pathname, sessions)
        if (sessionId) ws._sessionId = sessionId
        ws._isOnboarding = (pathname ?? '').includes('hivelearn-onboarding')
        ws._isProgram    = (pathname ?? '').includes('hivelearn-program')
        ws._isLesson     = (pathname ?? '').includes('hivelearn-lesson')
      },

      message(ws: any, message: any) {
        try {
          const data = JSON.parse(message.toString())
          if (data?.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
            return
          }
          const sessionId   = ws._sessionId   as string | undefined
          const isOnboarding = ws._isOnboarding as boolean | undefined
          const isProgram    = ws._isProgram    as boolean | undefined
          const isLesson     = ws._isLesson     as boolean | undefined

          if (isLesson && sessionId) {
            if (data?.tipo === 'iniciar_sesion') {
              startLessonSession(sessionId, ws)
            } else if (data?.tipo === 'monitor:frame' && data.frame) {
              handleMonitorFrame(sessionId, String(data.frame), data.context ?? {}, ws)
                .catch((e: Error) => log.error('[monitor] frame error', { error: e.message }))
            } else {
              handleLessonMessage(sessionId, data)
            }
          } else if (isProgram && sessionId) {
            if (data?.type === 'iniciar_programa') {
              iniciarPrograma(ws, {
                perfil: data.perfil,
                meta: data.meta,
                session_id: sessionId,
                alumno_id: data.alumno_id,
              }).catch((e: Error) =>
                log.error('[ws] program init error', { error: e.message })
              )
            } else if (data?.type === 'responder' && data.respuesta !== undefined) {
              procesarRespuesta(ws, {
                session_id: sessionId,
                respuesta: String(data.respuesta),
                zona_numero: Number(data.zona_numero ?? 0),
              }).catch((e: Error) =>
                log.error('[ws] program response error', { error: e.message })
              )
            }
          } else if (isOnboarding && sessionId) {
            if (data?.type === 'init') {
              handleOnboardingInit(ws, sessionId).catch((e: Error) =>
                log.error('[ws] onboarding init error', { error: e.message })
              )
            } else if (data?.type === 'user_message' && data.content) {
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
