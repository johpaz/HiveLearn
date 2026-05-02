/**
 * Hive Local LLM — Index
 * Exporta todo el módulo
 */

export { detectGPU, getHiveCLIBinaryName, getHiveCLIDownloadURL } from "./detector"
export type { GPUBackend, GPUInfo, PlatformArch } from "./detector"

export {
  installHiveCLI,
  downloadModel,
  installMMProj,
  listLocalModels,
  isModelDownloaded,
  getModelPath,
  BIN_DIR,
  MODELS_DIR,
  HF_MODEL_URLS,
} from "./downloader"
export type { ModelId } from "./downloader"

export { getModelConfig, buildHiveCLIArgs, getRecommendedModel } from "./models"
export type { ModelConfig } from "./models"

export { handleLLMWebSocket, handleLLMStatus } from "./server"
export type { LLMMessage } from "./server"

export { isLocalLLMAvailable, generateLocal, generateLocalComplete } from "./client"
export type { GenerateOptions } from "./client"
