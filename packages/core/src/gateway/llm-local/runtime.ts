import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { extname, join } from "path"
import { logger } from "../../utils/logger"
import { LessonPersistence } from "../../storage/LessonPersistence"
import {
  BIN_DIR,
  MODELS_DIR,
  ensureModelAssets,
  findInstalledLlamaCppCLI,
  getMMProjPath,
  getModelPath,
  installLlamaCppCLI,
  type ModelId,
} from "./downloader"
import { getModelConfig } from "./models"

const log = logger.child("llm-local:runtime")

export const LOCAL_LLM_PORT = 8080
export const LOCAL_LLM_HOST = "127.0.0.1"
export const LOCAL_LLM_BASE_URL = `http://${LOCAL_LLM_HOST}:${LOCAL_LLM_PORT}`
export const LOCAL_LLM_CONFIG_PATH = join(homedir(), ".hivelearn", "llm", "localllm.json")

type ServerState = "stopped" | "starting" | "ready" | "error"

interface RuntimeConfig {
  autoStart: boolean
}

interface RuntimeStatus {
  serverState: ServerState
  serverRunning: boolean
  serverUrl: string
  activeModel: string | null
  binaryInstalled: boolean
  binaryPath: string | null
  modelInstalled: boolean
  mmprojInstalled: boolean
  autoStartEnabled: boolean
  error?: string
}

let serverProcess: Bun.Subprocess<"ignore", "pipe", "pipe"> | null = null
let serverState: ServerState = "stopped"
let lastError: string | undefined
let currentModel: ModelId | null = null

function readRuntimeConfig(): RuntimeConfig {
  try {
    if (!existsSync(LOCAL_LLM_CONFIG_PATH)) return { autoStart: false }
    return { autoStart: false, ...JSON.parse(readFileSync(LOCAL_LLM_CONFIG_PATH, "utf8")) }
  } catch {
    return { autoStart: false }
  }
}

function writeRuntimeConfig(config: RuntimeConfig): void {
  mkdirSync(join(homedir(), ".hivelearn", "llm"), { recursive: true })
  writeFileSync(LOCAL_LLM_CONFIG_PATH, JSON.stringify(config, null, 2))
}

function setAutoStartEnabled(enabled: boolean): void {
  const config = readRuntimeConfig()
  writeRuntimeConfig({ ...config, autoStart: enabled })
}

function normalizeToLocalModelId(modelId: string | null | undefined): ModelId | null {
  if (!modelId) return null
  const normalized = modelId.startsWith("local-llama-")
    ? modelId.slice("local-llama-".length)
    : modelId

  const supported = new Set<ModelId>([
    "e2b_Q4_K_XL",
    "e4b_Q4_K_XL",
    "26b_a4b_Q4_K_M",
    "31b_Q4_K_XL",
  ])

  return supported.has(normalized as ModelId) ? normalized as ModelId : null
}

function getConfiguredLocalModel(): ModelId | null {
  const providerModel = new LessonPersistence().getHiveLearnProviderModel()
  if (!providerModel || providerModel.providerId !== "local-llama") return null
  return normalizeToLocalModelId(providerModel.modelId)
}

async function isHealthReady(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_LLM_BASE_URL}/health`, { signal: AbortSignal.timeout(1000) })
    return res.ok
  } catch {
    return false
  }
}

async function waitForHealth(timeoutMs = 20_000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await isHealthReady()) return
    await Bun.sleep(250)
  }
  throw new Error("llama-server no respondió en /health a tiempo")
}

async function ensureBinaryPath(): Promise<string> {
  return (await findInstalledLlamaCppCLI()) ?? installLlamaCppCLI()
}

function guessMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".png": return "image/png"
    case ".jpg":
    case ".jpeg": return "image/jpeg"
    case ".webp": return "image/webp"
    case ".wav": return "audio/wav"
    case ".mp3": return "audio/mpeg"
    case ".ogg": return "audio/ogg"
    default: return "application/octet-stream"
  }
}

export function buildDataUrlForFile(filePath: string): string {
  const bytes = readFileSync(filePath)
  return `data:${guessMimeType(filePath)};base64,${bytes.toString("base64")}`
}

function onProcessExit(proc: Bun.Subprocess<"ignore", "pipe", "pipe">, model: ModelId): void {
  proc.exited.then(async (code) => {
    if (serverProcess !== proc) return
    const stderr = await new Response(proc.stderr).text().catch(() => "")
    serverProcess = null
    serverState = "error"
    currentModel = null
    lastError = `llama-server salió con código ${code}: ${stderr.slice(0, 500)}`
    log.error(lastError, { model })
  }).catch(() => {
    // no-op
  })
}

export async function startLocalLLMServer(options?: { manual?: boolean; forceRestart?: boolean }): Promise<RuntimeStatus> {
  const modelId = getConfiguredLocalModel()
  if (!modelId) {
    throw new Error("No hay modelo local aplicado al enjambre")
  }

  const installedBinaryPath = await findInstalledLlamaCppCLI()
  if (!installedBinaryPath) {
    throw new Error("El runtime de llama.cpp no está instalado")
  }

  if (options?.manual) {
    setAutoStartEnabled(true)
  }

  if (!options?.forceRestart && serverProcess && serverState === "ready" && currentModel === modelId && await isHealthReady()) {
    return getLocalLLMRuntimeStatus()
  }

  if (options?.forceRestart || currentModel && currentModel !== modelId) {
    await stopLocalLLMServer()
  }

  serverState = "starting"
  lastError = undefined

  await ensureModelAssets(modelId, { requireMMProj: true })
  const binaryPath = await ensureBinaryPath()
  const config = getModelConfig(modelId)
  const args = [
    "-m", config.modelPath,
    "--mmproj", config.mmprojPath,
    "--host", LOCAL_LLM_HOST,
    "--port", String(LOCAL_LLM_PORT),
    "--jinja",
    "-c", String(config.ctxSize),
    "-ngl", String(config.ngl),
    "-t", String(config.threads),
    "-b", String(config.batchSize),
    "-ub", String(config.ubatchSize),
    "--cache-type-k", config.cacheTypeK,
    "--cache-type-v", config.cacheTypeV,
    "--flash-attn", "on",
  ]

  log.info("Starting LocalLLM llama-server", { binaryPath, modelId, port: LOCAL_LLM_PORT })
  const proc = Bun.spawn([binaryPath, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GGML_VULKAN_CHECK_RESULTS: "0",
      GGML_VULKAN_DEBUG: "0",
    },
  })
  serverProcess = proc
  currentModel = modelId
  onProcessExit(proc, modelId)

  try {
    await waitForHealth()
    serverState = "ready"
    return getLocalLLMRuntimeStatus()
  } catch (error) {
    await stopLocalLLMServer()
    serverState = "error"
    lastError = error instanceof Error ? error.message : "Error iniciando llama-server"
    throw error
  }
}

export async function stopLocalLLMServer(): Promise<void> {
  if (!serverProcess) {
    serverState = "stopped"
    currentModel = null
    return
  }

  try {
    serverProcess.kill()
    await Promise.race([serverProcess.exited, Bun.sleep(2000)])
  } catch {
    // ignore
  } finally {
    serverProcess = null
    currentModel = null
    if (serverState !== "error") {
      serverState = "stopped"
      lastError = undefined
    }
  }
}

export async function maybeAutoStartLocalLLMServer(): Promise<void> {
  const config = readRuntimeConfig()
  if (!config.autoStart) return

  const modelId = getConfiguredLocalModel()
  if (!modelId) return

  const binaryPath = await findInstalledLlamaCppCLI()
  if (!binaryPath) return
  if (!existsSync(getModelPath(modelId))) return

  try {
    await startLocalLLMServer()
  } catch (error) {
    log.warn("LocalLLM auto-start failed", { error: (error as Error).message })
  }
}

export async function getLocalLLMRuntimeStatus(): Promise<RuntimeStatus> {
  const modelId = getConfiguredLocalModel()
  const binaryPath = await findInstalledLlamaCppCLI()
  const serverRunning = await isHealthReady()

  if (serverRunning && serverState === "stopped") {
    serverState = "ready"
  }

  return {
    serverState: serverRunning ? "ready" : serverState,
    serverRunning,
    serverUrl: LOCAL_LLM_BASE_URL,
    activeModel: modelId,
    binaryInstalled: Boolean(binaryPath),
    binaryPath,
    modelInstalled: Boolean(modelId && existsSync(getModelPath(modelId))),
    mmprojInstalled: Boolean(modelId && existsSync(getMMProjPath(modelId))),
    autoStartEnabled: readRuntimeConfig().autoStart,
    error: serverRunning ? undefined : lastError,
  }
}
