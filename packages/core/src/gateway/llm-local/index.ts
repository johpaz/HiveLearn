/**
 * Hive Local LLM — Index
 * Exporta todo el módulo
 */

export { detectGPU, getLlamaCppAsset, getLlamaCppDownloadURL, getLatestLlamaCppReleaseTag } from "./detector"
export type { GPUBackend, GPUInfo, PlatformArch } from "./detector"

export {
  installLlamaCppCLI,
  findInstalledLlamaCppCLI,
  downloadModel,
  installMMProj,
  listLocalModels,
  isModelDownloaded,
  getModelPath,
  getMMProjPath,
  BIN_DIR,
  MODELS_DIR,
  ASSISTANTS_DIR,
  MODEL_CATALOG,
} from "./downloader"
export type { ModelId } from "./downloader"

export { getModelConfig, buildLlamaCppArgs, getRecommendedModel } from "./models"
export type { ModelConfig } from "./models"

export {
  handleLLMWebSocket,
  handleLLMStatus,
  handleInstallRuntime,
  handleStartLocalLLM,
  handleStopLocalLLM,
  registerModelInDB,
} from "./server"
export type { LLMMessage } from "./server"

export { isLocalLLMAvailable, generateLocal, generateLocalComplete } from "./client"
export type { GenerateOptions } from "./client"

export {
  LOCAL_LLM_BASE_URL,
  LOCAL_LLM_HOST,
  LOCAL_LLM_PORT,
  maybeAutoStartLocalLLMServer,
  getLocalLLMRuntimeStatus,
  startLocalLLMServer,
  stopLocalLLMServer,
} from "./runtime"
