/**
 * Provider routes
 */
import { getDb } from '../../storage/sqlite'
import { logger } from '../../utils/logger'
import {
  storeProviderApiKey,
  hasProviderApiKey,
  deleteProviderApiKey,
} from '../../secrets/provider-secrets'
import { addCorsHeaders } from './_helpers'

const log = logger.child('route:providers')

export async function handleProviders(req: Request, url: URL): Promise<Response | null> {
  // GET /api/providers
  if (url.pathname === '/api/providers' && req.method === 'GET') {
    try {
      const db = getDb()
      const rawProviders = db.query(`
        SELECT id, name, base_url, category, enabled, active, created_at
        FROM providers
        ORDER BY name
      `).all() as any[]

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

  // GET /api/providers/:id/api-key
  if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/api-key') && req.method === 'GET') {
    const providerId = url.pathname.split('/')[3]
    const startTime = Date.now()

    log.info('[GET /api/providers/:id/api-key]', { providerId })

    try {
      const hasKey = await hasProviderApiKey(providerId)
      const duration = Date.now() - startTime

      log.debug('[GET /api/providers/:id/api-key] Success', {
        providerId,
        hasApiKey: hasKey,
        duration,
      })

      return addCorsHeaders(
        new Response(JSON.stringify({ hasApiKey: hasKey }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
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
      })

      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        req
      )
    }
  }

  // POST /api/providers/:id/api-key
  if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/api-key') && req.method === 'POST') {
    const providerId = url.pathname.split('/')[3]
    const startTime = Date.now()

    log.info('[POST /api/providers/:id/api-key]', { providerId })

    try {
      const body = await req.json() as { apiKey: string }

      log.debug('[POST /api/providers/:id/api-key] Request body', {
        providerId,
        hasApiKey: !!body.apiKey,
        keyLength: body.apiKey?.length,
      })

      if (!body.apiKey) {
        log.warn('[POST /api/providers/:id/api-key] Missing API key', { providerId })
        return addCorsHeaders(
          new Response(JSON.stringify({ error: 'apiKey es requerido' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }),
          req
        )
      }

      log.debug('[POST /api/providers/:id/api-key] Calling storeProviderApiKey', {
        providerId,
      })

      await storeProviderApiKey(providerId, body.apiKey)

      const duration = Date.now() - startTime
      log.info('[POST /api/providers/:id/api-key] Success', {
        providerId,
        duration,
      })

      return addCorsHeaders(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
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
        code: (e as any).code,
      })

      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        req
      )
    }
  }

  // DELETE /api/providers/:id/api-key
  if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/api-key') && req.method === 'DELETE') {
    const providerId = url.pathname.split('/')[3]
    const startTime = Date.now()

    log.info('[DELETE /api/providers/:id/api-key]', { providerId })

    try {
      await deleteProviderApiKey(providerId)

      const duration = Date.now() - startTime
      log.info('[DELETE /api/providers/:id/api-key] Success', {
        providerId,
        duration,
      })

      return addCorsHeaders(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
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
      })

      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        req
      )
    }
  }

  // PUT /api/providers/:id/toggle
  if (url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/toggle') && req.method === 'PUT') {
    const providerId = url.pathname.split('/')[3]

    log.info('[PUT /api/providers/:id/toggle]', { providerId })

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

      log.info('[PUT /api/providers/:id/toggle] Success', { providerId, active: body.active })

      return addCorsHeaders(
        new Response(JSON.stringify({ ok: true, active: body.active }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        req
      )
    } catch (e) {
      log.error('[PUT /api/providers/:id/toggle] Error', {
        providerId,
        error: (e as Error).message,
      })

      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        req
      )
    }
  }

  // POST /api/providers/ollama/import
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
        db.query(`
          INSERT OR REPLACE INTO models (id, provider_id, name, model_type, context_window, capabilities, enabled, active)
          VALUES (?, 'ollama', ?, 'llm', 32000, '["chat", "local"]', 1, 1)
        `).run(modelId, modelName)
        imported++
      }
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

  return null
}
