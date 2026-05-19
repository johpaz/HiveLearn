/**
 * Hive Local LLM — Downloader
 * Descarga binarios desde GitHub releases y modelos desde HuggingFace
 */

import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "fs"
import { homedir } from "os"
import { dirname, join } from "path"
import {
  detectGPU,
  getLatestLlamaCppReleaseTag,
  getLlamaCppAsset,
  getLlamaCppDownloadURL,
} from "./detector"

const ROOT = join(homedir(), ".hivelearn", "llm")
export const BIN_DIR = join(ROOT, "bin")
export const MODELS_DIR = join(ROOT, "models")
export const ASSISTANTS_DIR = join(MODELS_DIR, "assistants")
const LLAMA_CPP_DIR = join(BIN_DIR, "llama.cpp")

export function ensureHiveDirs(): void {
  mkdirSync(BIN_DIR, { recursive: true })
  mkdirSync(MODELS_DIR, { recursive: true })
  mkdirSync(ASSISTANTS_DIR, { recursive: true })
}

export type ModelId =
  | "e2b_Q4_K_XL"
  | "e4b_Q4_K_XL"
  | "26b_a4b_Q4_K_M"
  | "31b_Q4_K_XL"

interface ModelCatalogEntry {
  id: ModelId
  slug: string
  displayName: string
  repo: string
  modelFile: string
  modelUrl: string
  mmprojFile: string
  mmprojUrl: string
  size: string
  family: "E2B" | "E4B" | "26B-A4B" | "31B"
  supportsMTP: boolean
  assistantRepo?: string
}

export const MODEL_CATALOG: Record<ModelId, ModelCatalogEntry> = {
  e2b_Q4_K_XL: {
    id: "e2b_Q4_K_XL",
    slug: "gemma-4-e2b-it",
    displayName: "Gemma 4 E2B Q4_K_XL",
    repo: "unsloth/gemma-4-E2B-it-GGUF",
    modelFile: "gemma-4-E2B-it-UD-Q4_K_XL.gguf",
    modelUrl: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-UD-Q4_K_XL.gguf?download=true",
    mmprojFile: "mmproj-BF16.gguf",
    mmprojUrl: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/mmproj-BF16.gguf?download=true",
    size: "~5 GB + 1 GB mmproj",
    family: "E2B",
    supportsMTP: true,
    assistantRepo: "AtomicChat/gemma-4-E2B-it-assistant-GGUF",
  },
  e4b_Q4_K_XL: {
    id: "e4b_Q4_K_XL",
    slug: "gemma-4-e4b-it",
    displayName: "Gemma 4 E4B Q4_K_XL",
    repo: "unsloth/gemma-4-E4B-it-GGUF",
    modelFile: "gemma-4-E4B-it-UD-Q4_K_XL.gguf",
    modelUrl: "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-UD-Q4_K_XL.gguf?download=true",
    mmprojFile: "mmproj-BF16.gguf",
    mmprojUrl: "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/mmproj-BF16.gguf?download=true",
    size: "~8 GB + 1 GB mmproj",
    family: "E4B",
    supportsMTP: true,
    assistantRepo: "AtomicChat/gemma-4-E4B-it-assistant-GGUF",
  },
  "26b_a4b_Q4_K_M": {
    id: "26b_a4b_Q4_K_M",
    slug: "gemma-4-26b-a4b-it",
    displayName: "Gemma 4 26B-A4B Q4_K_M",
    repo: "unsloth/gemma-4-26B-A4B-it-GGUF",
    modelFile: "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
    modelUrl: "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf?download=true",
    mmprojFile: "mmproj-BF16.gguf",
    mmprojUrl: "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/mmproj-BF16.gguf?download=true",
    size: "~15-16 GB + 1 GB mmproj",
    family: "26B-A4B",
    supportsMTP: true,
    assistantRepo: "AtomicChat/gemma-4-26B-A4B-it-assistant-GGUF",
  },
  "31b_Q4_K_XL": {
    id: "31b_Q4_K_XL",
    slug: "gemma-4-31b-it",
    displayName: "Gemma 4 31B Q4_K_XL",
    repo: "unsloth/gemma-4-31B-it-GGUF",
    modelFile: "gemma-4-31B-it-UD-Q4_K_XL.gguf",
    modelUrl: "https://huggingface.co/unsloth/gemma-4-31B-it-GGUF/resolve/main/gemma-4-31B-it-UD-Q4_K_XL.gguf?download=true",
    mmprojFile: "mmproj-BF16.gguf",
    mmprojUrl: "https://huggingface.co/unsloth/gemma-4-31B-it-GGUF/resolve/main/mmproj-BF16.gguf?download=true",
    size: "~19-20 GB + 1 GB mmproj",
    family: "31B",
    supportsMTP: true,
    assistantRepo: "AtomicChat/gemma-4-31B-it-assistant-GGUF",
  },
}

function getModelEntry(modelId: ModelId): ModelCatalogEntry {
  const entry = MODEL_CATALOG[modelId]
  if (!entry) throw new Error(`Modelo no soportado: ${modelId}`)
  return entry
}

function getModelDir(modelId: ModelId): string {
  return join(MODELS_DIR, getModelEntry(modelId).slug)
}

function writeManifest(modelId: ModelId): void {
  const entry = getModelEntry(modelId)
  const manifestPath = join(getModelDir(modelId), "manifest.json")
  writeFileSync(manifestPath, JSON.stringify({
    id: entry.id,
    slug: entry.slug,
    displayName: entry.displayName,
    repo: entry.repo,
    family: entry.family,
    modelFile: entry.modelFile,
    mmprojFile: entry.mmprojFile,
    supportsMTP: entry.supportsMTP,
    assistantRepo: entry.assistantRepo ?? null,
  }, null, 2))
}

export function getModelPath(modelId: ModelId): string {
  const entry = getModelEntry(modelId)
  return join(getModelDir(modelId), entry.modelFile)
}

export function getMMProjPath(modelId: ModelId): string {
  const entry = getModelEntry(modelId)
  return join(getModelDir(modelId), entry.mmprojFile)
}

export function isModelDownloaded(modelId: ModelId): boolean {
  return existsSync(getModelPath(modelId)) && existsSync(getMMProjPath(modelId))
}

export function isMMProjDownloaded(modelId: ModelId): boolean {
  return existsSync(getMMProjPath(modelId))
}

/** Descarga un archivo con progreso y escritura directa a disco */
export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`)

  const total = Number(res.headers.get("content-length") ?? 0)
  const reader = res.body?.getReader()
  if (!reader) throw new Error("No body en respuesta")

  const file = createWriteStream(dest)
  let downloaded = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      file.write(Buffer.from(value))
      downloaded += value.byteLength
      if (onProgress) onProgress(downloaded, total)
    }
  } finally {
    file.end()
  }
}

function getLatestSubdirectory(dir: string): string | null {
  if (!existsSync(dir)) return null

  const entries = readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((fullPath) => statSync(fullPath).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)

  return entries[0] ?? null
}

async function extractArchive(archivePath: string, destinationDir: string): Promise<void> {
  const tempArchivePath = join(BIN_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}.archive`)
  copyFileSync(archivePath, tempArchivePath)

  rmSync(destinationDir, { recursive: true, force: true })
  mkdirSync(destinationDir, { recursive: true })

  try {
    if (archivePath.endsWith(".zip")) {
      const unzip = Bun.spawn(["unzip", "-q", tempArchivePath, "-d", destinationDir], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const exitCode = await unzip.exited
      if (exitCode !== 0) {
        const stderr = await new Response(unzip.stderr).text()
        throw new Error(`Error extrayendo ZIP de llama.cpp: ${stderr.slice(0, 500)}`)
      }
      return
    }

    if (archivePath.endsWith(".tar.gz")) {
      const tar = Bun.spawn(["tar", "-xzf", tempArchivePath, "-C", destinationDir], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const exitCode = await tar.exited
      if (exitCode !== 0) {
        const stderr = await new Response(tar.stderr).text()
        throw new Error(`Error extrayendo TAR.GZ de llama.cpp: ${stderr.slice(0, 500)}`)
      }
      return
    }

    throw new Error(`Formato de archivo no soportado: ${archivePath}`)
  } finally {
    rmSync(tempArchivePath, { force: true })
  }
}

function findBinaryInExtractedDir(rootDir: string, binaryName: string): string {
  const directPath = join(rootDir, binaryName)
  if (existsSync(directPath)) return directPath

  const subdir = getLatestSubdirectory(rootDir)
  if (subdir) {
    const nestedPath = join(subdir, "build", "bin", binaryName)
    if (existsSync(nestedPath)) return nestedPath

    const nestedDirectPath = join(subdir, binaryName)
    if (existsSync(nestedDirectPath)) return nestedDirectPath
  }

  throw new Error(`No se encontró el binario ${binaryName} dentro del paquete oficial de llama.cpp`)
}

export async function findInstalledLlamaCppCLI(): Promise<string | null> {
  const gpu = await detectGPU()
  const asset = getLlamaCppAsset(gpu)
  const latestDir = getLatestSubdirectory(LLAMA_CPP_DIR)
  if (!latestDir) return null

  try {
    return findBinaryInExtractedDir(latestDir, asset.binaryName)
  } catch {
    return null
  }
}

/** Descarga el binario oficial de llama.cpp si no existe */
export async function installLlamaCppCLI(): Promise<string> {
  const gpu = await detectGPU()
  const asset = getLlamaCppAsset(gpu)
  const installedPath = await findInstalledLlamaCppCLI()
  if (installedPath) return installedPath

  const tag = await getLatestLlamaCppReleaseTag()
  const releaseDir = join(LLAMA_CPP_DIR, tag)
  const archiveName = asset.archiveName.replace("${tag}", tag)
  const archivePath = join(releaseDir, archiveName)

  console.log(`[hive-local] Instalando llama.cpp oficial ${tag} para ${gpu.platform} + ${gpu.backend}...`)
  const url = getLlamaCppDownloadURL(tag, asset.archiveName)

  await downloadFile(url, archivePath, (d, t) => {
    const pct = t > 0 ? ((d / t) * 100).toFixed(1) : "?"
    process.stdout.write(`\r  Descargando... ${pct}%`)
  })
  console.log("")

  await extractArchive(archivePath, releaseDir)
  const binaryPath = findBinaryInExtractedDir(releaseDir, asset.binaryName)

  if (process.platform !== "win32") {
    await Bun.spawn(["chmod", "+x", binaryPath]).exited
  }

  console.log(`[hive-local] ✓ llama.cpp instalado en ${binaryPath}`)
  return binaryPath
}

/** Descarga el modelo y su mmproj correspondiente */
export async function downloadModel(
  modelId: ModelId,
  onProgress?: (downloaded: number, total: number) => void
): Promise<string> {
  const entry = getModelEntry(modelId)
  const modelDir = getModelDir(modelId)
  const modelPath = getModelPath(modelId)
  const mmprojPath = getMMProjPath(modelId)

  mkdirSync(modelDir, { recursive: true })

  if (!existsSync(modelPath)) {
    console.log(`[hive-local] Descargando modelo ${modelId}...`)
    await downloadFile(entry.modelUrl, modelPath, onProgress)
  }

  if (!existsSync(mmprojPath)) {
    console.log(`[hive-local] Descargando mmproj para ${modelId}...`)
    await downloadFile(entry.mmprojUrl, mmprojPath)
  }

  writeManifest(modelId)
  console.log(`[hive-local] ✓ Modelo ${modelId} descargado en ${modelDir}`)
  return modelPath
}

export async function installMMProj(modelId: ModelId): Promise<string> {
  const entry = getModelEntry(modelId)
  const mmprojPath = getMMProjPath(modelId)
  if (existsSync(mmprojPath)) {
    return mmprojPath
  }
  await downloadFile(entry.mmprojUrl, mmprojPath)
  return mmprojPath
}

export async function ensureModelAssets(
  modelId: ModelId,
  options?: {
    requireMMProj?: boolean
    onProgress?: (downloaded: number, total: number) => void
  }
): Promise<void> {
  const modelPath = getModelPath(modelId)
  const needsModel = !existsSync(modelPath)
  const needsMMProj = Boolean(options?.requireMMProj) && !isMMProjDownloaded(modelId)

  if (needsModel) {
    await downloadModel(modelId, options?.onProgress)
    return
  }

  if (needsMMProj) {
    await installMMProj(modelId)
  }
}

/** Lista modelos disponibles localmente */
export function listLocalModels(): {
  id: ModelId
  name: string
  size: string
  downloaded: boolean
  path: string
  mmprojPath: string
  supportsMTP: boolean
}[] {
  return (Object.keys(MODEL_CATALOG) as ModelId[]).map((id) => {
    const entry = MODEL_CATALOG[id]
    return {
      id,
      name: entry.displayName,
      size: entry.size,
      downloaded: isModelDownloaded(id),
      path: getModelPath(id),
      mmprojPath: getMMProjPath(id),
      supportsMTP: entry.supportsMTP,
    }
  })
}
