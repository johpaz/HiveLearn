/**
 * Hive Local LLM — Model Utils
 * Gestión de rutas y configuración de modelos
 */

import { existsSync } from "fs"
import { getMMProjPath, getModelPath, type ModelId } from "./downloader"

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
  const mmprojPath = getMMProjPath(modelId)

  if (!existsSync(modelPath)) {
    throw new Error(`Modelo no descargado: ${modelId}. Ejecuta downloadModel("${modelId}") primero.`)
  }
  if (!existsSync(mmprojPath)) {
    throw new Error(`MMProj no descargado para ${modelId}. Ejecuta downloadModel("${modelId}") primero.`)
  }

  return {
    modelPath,
    mmprojPath,
    ...DEFAULT_CONFIG,
  }
}

