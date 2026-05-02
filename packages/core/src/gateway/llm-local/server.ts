/**
 * Hive Local LLM — WebSocket Server
 * Expone hive-cli como WebSocket para streaming de tokens
 */

import type { ServerWebSocket } from "bun"
import { existsSync } from "fs"
import { installHiveCLI } from "./downloader"
import { getModelConfig, buildHiveCLIArgs, type ModelConfig } from "./models"
import type { ModelId } from "./downloader"

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

const sessions = new Map<string, ServerWebSocket<WSData>>()

export async function handleLLMWebSocket(
  ws: ServerWebSocket<WSData>,
  message: string
): Promise<void> {
  let req: LLMMessage
  try {
    req = JSON.parse(message)
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "JSON inválido" }))
    return
  }

  if (req.type === "download") {
    await handleDownload(ws, req)
    return
  }

  if (req.type === "generate") {
    await handleGenerate(ws, req)
    return
  }

  ws.send(JSON.stringify({ type: "error", message: `Tipo desconocido: ${(req as any).type}` }))
}

async function handleDownload(
  ws: ServerWebSocket<WSData>,
  req: DownloadRequest
): Promise<void> {
  const { downloadModel, isModelDownloaded } = await import("./downloader")

  if (isModelDownloaded(req.model)) {
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

    ws.send(JSON.stringify({ type: "download_progress", model: req.model, percent: 100, done: true }))
  } catch (err) {
    ws.send(JSON.stringify({
      type: "error",
      message: err instanceof Error ? err.message : "Error descargando modelo",
    }))
  }
}

async function handleGenerate(
  ws: ServerWebSocket<WSData>,
  req: GenerateRequest
): Promise<void> {
  try {
    const binaryPath = await installHiveCLI()
    const config = getModelConfig(req.model)
    const args = buildHiveCLIArgs(config, {
      prompt: req.prompt,
      imagePath: req.imagePath,
      audioPath: req.audioPath,
      nPredict: req.nPredict ?? 512,
    })

    ws.send(JSON.stringify({ type: "status", message: "Iniciando generación..." }))

    const proc = Bun.spawn([binaryPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GGML_VULKAN_CHECK_RESULTS: "0",
        GGML_VULKAN_DEBUG: "0",
      },
    })

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (!trimmed.startsWith(">") && !trimmed.startsWith("Loading")) {
            ws.send(JSON.stringify({ type: "token", text: trimmed }))
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      ws.send(JSON.stringify({ type: "error", message: `hive-cli exit ${exitCode}: ${stderr.slice(0, 500)}` }))
      return
    }

    ws.send(JSON.stringify({ type: "done" }))
  } catch (err) {
    ws.send(JSON.stringify({
      type: "error",
      message: err instanceof Error ? err.message : "Error en generación",
    }))
  }
}

/** HTTP handler para status de modelos */
export async function handleLLMStatus(): Promise<Response> {
  const { listLocalModels, isModelDownloaded } = await import("./downloader")
  const { detectGPU } = await import("./detector")

  const gpu = await detectGPU()
  const models = listLocalModels()

  return Response.json({
    ok: true,
    gpu: {
      backend: gpu.backend,
      deviceName: gpu.deviceName,
      platform: gpu.platform,
    },
    models,
  })
}
