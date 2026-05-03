/**
 * Hive Local LLM — Model Utils
 * Gestión de rutas y configuración de modelos
 */


import { existsSync } from "fs"
import { MODELS_DIR, getModelPath, type ModelId } from "./downloader"

export interface ModelConfig {
  modelPath: string
  mmprojPath: string
  ctxSize: number
  ngl: number
  threads: number
  batchSize: number
  ubatchSize: number
  cacheTypeK: string
  cacheTypeV: string
  flashAttn: boolean
}

const DEFAULT_CONFIG: Omit<ModelConfig, "modelPath" | "mmprojPath"> = {
  ctxSize: 8192,
  ngl: 999,
  threads: 8,
  batchSize: 2048,
  ubatchSize: 512,
  cacheTypeK: "f16",
  cacheTypeV: "f16",
  flashAttn: true,
}

export function getModelConfig(modelId: ModelId): ModelConfig {
  const modelPath = getModelPath(modelId)
  const mmprojPath = getModelPath("mmproj")

  if (!existsSync(modelPath)) {
    throw new Error(`Modelo no descargado: ${modelId}. Ejecuta downloadModel("${modelId}") primero.`)
  }

  return {
    modelPath,
    mmprojPath,
    ...DEFAULT_CONFIG,
  }
}

/** Construye los argumentos de línea de comando para hive-cli */
export function buildHiveCLIArgs(config: ModelConfig, options: {
  prompt?: string
  imagePath?: string
  audioPath?: string
  interactive?: boolean
  nPredict?: number
}): string[] {
  const args: string[] = [
    "-m", config.modelPath,
    "--mmproj", config.mmprojPath,
    "-c", String(config.ctxSize),
    "-ngl", String(config.ngl),
    "-t", String(config.threads),
    "-b", String(config.batchSize),
    "-ub", String(config.ubatchSize),
    "--cache-type-k", config.cacheTypeK,
    "--cache-type-v", config.cacheTypeV,
  ]

  if (config.flashAttn) {
    args.push("--flash-attn", "on")
  }

  if (options.imagePath && existsSync(options.imagePath)) {
    args.push("--image", options.imagePath)
  }

  if (options.audioPath && existsSync(options.audioPath)) {
    args.push("--audio", options.audioPath)
  }

  if (options.prompt) {
    args.push("-p", options.prompt)
  }

  if (options.nPredict !== undefined) {
    args.push("-n", String(options.nPredict))
  }

  if (options.interactive && !options.prompt) {
    args.push("-i")
  }

  return args
}

/** Determina el modelo recomendado según el modo */
export function getRecommendedModel(mode: "text" | "image" | "audio" | "all"): ModelId {
  switch (mode) {
    case "text":
      return "e2b_Q4_K_XL"
    case "image":
      return "e2b_Q4_K_XL"
    case "audio":
      return "e2b_Q4_K_XL"
    case "all":
      return "e4b_Q4_K_XL"
    default:
      return "e2b_Q4_K_XL"
  }
}
