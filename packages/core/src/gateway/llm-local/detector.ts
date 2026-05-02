/**
 * Hive Local LLM — Detector de GPU
 * Detecta Vulkan, CUDA, Metal o fallback a CPU
 */

export type GPUBackend = "cuda" | "vulkan" | "metal" | "rocm" | "none"
export type PlatformArch = "linux-x64" | "linux-arm64" | "windows-x64" | "macos-x64" | "macos-arm64"

export interface GPUInfo {
  backend: GPUBackend
  deviceName?: string
  vramMB?: number
  platform: PlatformArch
}

function detectPlatform(): PlatformArch {
  const os = process.platform
  const arch = process.arch

  if (os === "linux" && arch === "x64") return "linux-x64"
  if (os === "linux" && arch === "arm64") return "linux-arm64"
  if (os === "win32" && arch === "x64") return "windows-x64"
  if (os === "darwin" && arch === "x64") return "macos-x64"
  if (os === "darwin" && arch === "arm64") return "macos-arm64"

  throw new Error(`Plataforma no soportada: ${os}/${arch}`)
}

/** Intenta detectar CUDA via nvidia-smi o nvcc */
async function detectCUDA(): Promise<{ deviceName: string; vramMB: number } | null> {
  try {
    const proc = Bun.spawn(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    if (exitCode !== 0) return null

    const line = output.trim().split("\n")[0]
    if (!line) return null
    const match = line.match(/^(.+?),\s*(\d+)\s*MiB/)
    if (!match) return null

    return {
      deviceName: match[1].trim(),
      vramMB: parseInt(match[2], 10),
    }
  } catch {
    return null
  }
}

/** Intenta detectar Vulkan via vulkaninfo */
async function detectVulkan(): Promise<{ deviceName: string; vramMB?: number } | null> {
  try {
    const proc = Bun.spawn(["vulkaninfo", "--summary"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    if (exitCode !== 0) return null

    const deviceMatch = output.match(/deviceName\s*=\s*(.+)/)
    if (!deviceMatch) return null

    return {
      deviceName: deviceMatch[1].trim(),
    }
  } catch {
    return null
  }
}

/** Detecta Metal en macOS */
async function detectMetal(): Promise<{ deviceName: string } | null> {
  if (process.platform !== "darwin") return null
  return { deviceName: "Apple Metal" }
}

/** Detección completa de GPU y plataforma */
export async function detectGPU(): Promise<GPUInfo> {
  const platform = detectPlatform()

  const cuda = await detectCUDA()
  if (cuda) {
    return { backend: "cuda", ...cuda, platform }
  }

  const vulkan = await detectVulkan()
  if (vulkan) {
    return { backend: "vulkan", ...vulkan, platform }
  }

  const metal = await detectMetal()
  if (metal) {
    return { backend: "metal", ...metal, platform }
  }

  return { backend: "none", platform }
}

/** Devuelve el nombre del binario según GPU y plataforma */
export function getHiveCLIBinaryName(gpu: GPUInfo): string {
  const { backend, platform } = gpu
  const backendPart = backend === "none" ? "cpu" : backend

  switch (platform) {
    case "linux-x64":
      return `hive-cli-${backendPart}-linux-x64`
    case "linux-arm64":
      return `hive-cli-${backendPart}-linux-arm64`
    case "windows-x64":
      return `hive-cli-${backendPart}-windows-x64.exe`
    case "macos-x64":
      return `hive-cli-${backendPart}-macos-x64`
    case "macos-arm64":
      return `hive-cli-${backendPart}-macos-arm64`
  }
}

/** URL del release en GitHub */
export const HIVE_CLI_RELEASE_BASE = "https://github.com/johpaz/hive-cli/releases/download"
export const HIVE_CLI_VERSION = "v1.0.0"

export function getHiveCLIDownloadURL(binaryName: string): string {
  return `${HIVE_CLI_RELEASE_BASE}/${HIVE_CLI_VERSION}/${binaryName}`
}
