/**
 * Hive Local LLM — Downloader
 * Descarga binarios desde GitHub releases y modelos desde HuggingFace
 */

import { existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { detectGPU, getHiveCLIBinaryName, getHiveCLIDownloadURL } from "./detector"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..", "..", "..", "..", "..", "hive-cli")
export const BIN_DIR = join(ROOT, "bin")
export const MODELS_DIR = join(ROOT, "models")

mkdirSync(BIN_DIR, { recursive: true })
mkdirSync(MODELS_DIR, { recursive: true })

/** URLs de modelos en HuggingFace */
export const HF_MODEL_URLS = {
  mmproj: "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/blob/main/mmproj-BF16.gguf",
  e2b_Q4_K_XL: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/blob/main/gemma-4-E2B-it-UD-Q4_K_XL.gguf",
  e4b_Q4_K_XL: "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/blob/main/gemma-4-E4B-it-UD-Q4_K_XL.gguf",
}

export type ModelId = "mmproj" | "e2b_Q4_K_XL" | "e4b_Q4_K_XL"

export const MODEL_FILES: Record<ModelId, string> = {
  mmproj: "mmproj-BF16.gguf",
  e2b_Q4_K_XL: "gemma-4-E2B-it-UD-Q4_K_XL.gguf",
  e4b_Q4_K_XL: "gemma-4-E4B-it-UD-Q4_K_XL.gguf",
}

export function getModelPath(modelId: ModelId): string {
  return join(MODELS_DIR, MODEL_FILES[modelId])
}

export function isModelDownloaded(modelId: ModelId): boolean {
  return existsSync(getModelPath(modelId))
}

/** Descarga un archivo con progreso */
export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`)

  const total = Number(res.headers.get("content-length") ?? 0)
  const reader = res.body?.getReader()
  if (!reader) throw new Error("No body en respuesta")

  const chunks: Uint8Array[] = []
  let downloaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    downloaded += value.byteLength
    if (onProgress) onProgress(downloaded, total)
  }

  const data = new Uint8Array(downloaded)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }

  await Bun.write(dest, data)
}

/** Descarga el binario hive-cli si no existe */
export async function installHiveCLI(): Promise<string> {
  const gpu = await detectGPU()
  const binaryName = getHiveCLIBinaryName(gpu)
  const binaryPath = join(BIN_DIR, binaryName)

  if (existsSync(binaryPath)) {
    return binaryPath
  }

  console.log(`[hive-local] Instalando hive-cli para ${gpu.platform} + ${gpu.backend}...`)
  const url = getHiveCLIDownloadURL(binaryName)

  await downloadFile(url, binaryPath, (d, t) => {
    const pct = t > 0 ? ((d / t) * 100).toFixed(1) : "?"
    process.stdout.write(`\r  Descargando... ${pct}%`)
  })
  console.log("")

  if (process.platform !== "win32") {
    await Bun.spawn(["chmod", "+x", binaryPath]).exited
  }

  console.log(`[hive-local] ✓ hive-cli instalado en ${binaryPath}`)
  return binaryPath
}

/** Descarga un modelo si no existe */
export async function downloadModel(
  modelId: ModelId,
  onProgress?: (downloaded: number, total: number) => void
): Promise<string> {
  const dest = getModelPath(modelId)

  if (existsSync(dest)) {
    return dest
  }

  const url = HF_MODEL_URLS[modelId]
  console.log(`[hive-local] Descargando modelo ${modelId}...`)

  await downloadFile(url, dest, onProgress)
  console.log(`[hive-local] ✓ Modelo ${modelId} descargado`)

  return dest
}

/** Descarga mmproj en postinstall (ligero, ~946MB) */
export async function installMMProj(): Promise<string> {
  return downloadModel("mmproj")
}

/** Lista modelos disponibles localmente */
export function listLocalModels(): { id: ModelId; name: string; size: string; downloaded: boolean }[] {
  const models: ModelId[] = ["mmproj", "e2b_Q4_K_XL", "e4b_Q4_K_XL"]
  return models.map((id) => ({
    id,
    name: MODEL_FILES[id],
    size: id.includes("Q4_K_XL") ? "~5-8 GB" : "~2-3 GB",
    downloaded: isModelDownloaded(id),
  }))
}
