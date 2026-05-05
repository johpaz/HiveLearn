/**
 * Local LLM routes
 */
import { handleLLMStatus } from '../llm-local'
import { addCorsHeaders } from './_helpers'

export async function handleLLM(req: Request, url: URL): Promise<Response | null> {
  // GET /api/llm/status
  if (url.pathname === '/api/llm/status' && req.method === 'GET') {
    return handleLLMStatus()
  }

  // GET /api/llm/models
  if (url.pathname === '/api/llm/models' && req.method === 'GET') {
    const { listLocalModels } = await import('../llm-local')
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
      const { downloadModel } = await import('../llm-local')
      const path = await downloadModel(model as any)
      return Response.json({ ok: true, path })
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Error descargando" },
        { status: 500 }
      )
    }
  }

  return null
}
