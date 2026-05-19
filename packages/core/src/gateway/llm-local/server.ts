/**
 * Hive Local LLM — WebSocket + runtime status
 */

import type { ServerWebSocket } from "bun"
import { detectGPU } from "./detector"
import {
  MODEL_CATALOG,
  downloadModel,
  findInstalledLlamaCppCLI,
  installLlamaCppCLI,
  isMMProjDownloaded,
  isModelDownloaded,
  listLocalModels,
  type ModelId,
} from "./downloader"
import {
  buildDataUrlForFile,
  getLocalLLMRuntimeStatus,
  maybeAutoStartLocalLLMServer,
  startLocalLLMServer,
  stopLocalLLMServer,
  LOCAL_LLM_BASE_URL,
} from "./runtime"
import { getDb } from "../../storage/sqlite"
import { LessonPersistence } from "../../storage/LessonPersistence"

interface WSData {
  sessionId: string
}

interface GenerateRequest {
  type: "generate"
  prompt: string
  model: ModelId
  imagePath?: string
  audioPath?: string
  nPredict?: number
}

interface DownloadRequest {
  type: "download"
  model: ModelId
}

export type LLMMessage = GenerateRequest | DownloadRequest

export function registerModelInDB(modelId: ModelId): void {
  try {
    const db = getDb()
    const entry = MODEL_CATALOG[modelId]
    if (!entry) return

    const dbId = `local-llama-${modelId}`
    db.query(`UPDATE providers SET active = 1, enabled = 1 WHERE id = 'local-llama'`).run()
    db.query(`
      INSERT OR REPLACE INTO models
        (id, provider_id, name, model_type, context_window, capabilities, enabled, active)
      VALUES (?, 'local-llama', ?, 'llm', 32768, '["chat","vision","function_calling","streaming","local"]', 1, 1)
    `).run(dbId, entry.displayName)
  } catch (err) {
    console.error(`[hive-local] Error registrando modelo en BD:`, err)
  }
}

function ensureConfiguredLocalModel(modelId: ModelId): void {
  const configured = new LessonPersistence().getHiveLearnProviderModel()
  if (configured?.providerId === "local-llama") return
  const db = getDb()
  db.query(`
    UPDATE hl_agents
    SET provider_id = 'local-llama', model_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id IN (SELECT id FROM hl_agents)
  `).run(`local-llama-${modelId}`)
}

async function buildCompletionPayload(req: GenerateRequest): Promise<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: req.prompt }]

  if (req.imagePath) {
    content.push({
      type: "image_url",
      image_url: { url: buildDataUrlForFile(req.imagePath) },
    })
  }

  if (req.audioPath) {
    content.push({
      type: "image_url",
      image_url: { url: buildDataUrlForFile(req.audioPath) },
    })
  }

  return {
    model: "local-llm",
    messages: [
      {
        role: "user",
        content: content.length === 1 && !req.imagePath && !req.audioPath ? req.prompt : content,
      },
    ],
    max_tokens: req.nPredict ?? 512,
    temperature: 0.7,
    stream: false,
  }
}

async function handleDownload(ws: ServerWebSocket<WSData>, req: DownloadRequest): Promise<void> {
  if (isModelDownloaded(req.model)) {
    registerModelInDB(req.model)
    ws.send(JSON.stringify({ type: "download_progress", model: req.model, percent: 100, done: true }))
    return
  }

  try {
    await downloadModel(req.model, (downloaded, total) => {
      const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0
      ws.send(JSON.stringify({
        type: "download_progress",
        model: req.model,
        percent,
        downloaded,
        total,
        done: false,
      }))
    })
    registerModelInDB(req.model)
    ensureConfiguredLocalModel(req.model)
    ws.send(JSON.stringify({ type: "download_progress", model: req.model, percent: 100, done: true }))
  } catch (err) {
    ws.send(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Error descargando modelo" }))
  }
}

async function handleGenerate(ws: ServerWebSocket<WSData>, req: GenerateRequest): Promise<void> {
  try {
    ensureConfiguredLocalModel(req.model)
    await startLocalLLMServer()
    ws.send(JSON.stringify({ type: "status", message: "Generando con LocalLLM..." }))

    const payload = await buildCompletionPayload(req)
    const res = await fetch(`${LOCAL_LLM_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error(`llama-server ${res.status}: ${(await res.text()).slice(0, 500)}`)
    }

    const data = await res.json() as any
    const text = data.choices?.[0]?.message?.content ?? ""
    for (const chunk of String(text).split(/\s+/).filter(Boolean)) {
      ws.send(JSON.stringify({ type: "token", text: chunk }))
    }
    ws.send(JSON.stringify({ type: "done" }))
  } catch (err) {
    ws.send(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Error en generación" }))
  }
}

export async function handleLLMWebSocket(ws: ServerWebSocket<WSData>, message: string): Promise<void> {
  let req: LLMMessage
  try {
    req = JSON.parse(message)
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "JSON inválido" }))
    return
  }

  if (req.type === "download") return handleDownload(ws, req)
  if (req.type === "generate") return handleGenerate(ws, req)
  ws.send(JSON.stringify({ type: "error", message: `Tipo desconocido: ${(req as any).type}` }))
}

export async function handleLLMStatus(): Promise<Response> {
  await maybeAutoStartLocalLLMServer()

  const gpu = await detectGPU()
  const models = listLocalModels()
  for (const m of models) {
    if (m.downloaded) registerModelInDB(m.id)
  }

  const runtime = await getLocalLLMRuntimeStatus()
  return Response.json({
    ok: true,
    binaryInstalled: runtime.binaryInstalled,
    binaryPath: runtime.binaryPath,
    modelInstalled: runtime.modelInstalled,
    mmprojInstalled: runtime.mmprojInstalled,
    serverRunning: runtime.serverRunning,
    serverState: runtime.serverState,
    serverUrl: runtime.serverUrl,
    autoStartEnabled: runtime.autoStartEnabled,
    activeModel: runtime.activeModel ? `local-llama-${runtime.activeModel}` : null,
    error: runtime.error,
    gpu: {
      backend: gpu.backend,
      deviceName: gpu.deviceName,
      platform: gpu.platform,
    },
    models,
  })
}

export async function handleInstallRuntime(): Promise<Response> {
  const path = await installLlamaCppCLI()
  return Response.json({ ok: true, path })
}

export async function handleStartLocalLLM(): Promise<Response> {
  const models = listLocalModels()
  const downloaded = models.find((m) => m.downloaded)?.id ?? null
  if (downloaded) {
    registerModelInDB(downloaded)
    ensureConfiguredLocalModel(downloaded)
  }

  const status = await startLocalLLMServer({ manual: true })
  return Response.json({ ok: true, ...status })
}

export async function handleStopLocalLLM(): Promise<Response> {
  await stopLocalLLMServer()
  return Response.json({ ok: true, ...(await getLocalLLMRuntimeStatus()) })
}
