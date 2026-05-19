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

export interface LlamaCppAsset {
  archiveName: string
  binaryName: string
  archiveType: "zip" | "tar.gz"
}

/** Devuelve el asset oficial de llama.cpp según GPU y plataforma */
export function getLlamaCppAsset(gpu: GPUInfo): LlamaCppAsset {
  const { backend, platform } = gpu

  switch (platform) {
    case "linux-x64":
      if (backend === "cuda") {
        throw new Error("No hay binario oficial precompilado CUDA para Linux x64 en releases de llama.cpp")
      }
      if (backend === "rocm") {
        return {
          archiveName: "llama-${tag}-bin-ubuntu-rocm-7.2-x64.tar.gz",
          binaryName: "llama-server",
          archiveType: "tar.gz",
        }
      }
      if (backend === "vulkan") {
        return {
          archiveName: "llama-${tag}-bin-ubuntu-vulkan-x64.tar.gz",
          binaryName: "llama-server",
          archiveType: "tar.gz",
        }
      }
      return {
        archiveName: "llama-${tag}-bin-ubuntu-x64.tar.gz",
        binaryName: "llama-server",
        archiveType: "tar.gz",
      }
    case "linux-arm64":
      if (backend === "vulkan") {
        return {
          archiveName: "llama-${tag}-bin-ubuntu-vulkan-arm64.tar.gz",
          binaryName: "llama-server",
          archiveType: "tar.gz",
        }
      }
      return {
        archiveName: "llama-${tag}-bin-ubuntu-arm64.tar.gz",
        binaryName: "llama-server",
        archiveType: "tar.gz",
      }
    case "windows-x64":
      if (backend === "cuda") {
        return {
          archiveName: "llama-${tag}-bin-win-cuda-13-x64.zip",
          binaryName: "llama-server.exe",
          archiveType: "zip",
        }
      }
      if (backend === "vulkan") {
        return {
          archiveName: "llama-${tag}-bin-win-vulkan-x64.zip",
          binaryName: "llama-server.exe",
          archiveType: "zip",
        }
      }
      if (backend === "rocm") {
        return {
          archiveName: "llama-${tag}-bin-win-hip-x64.zip",
          binaryName: "llama-server.exe",
          archiveType: "zip",
        }
      }
      return {
        archiveName: "llama-${tag}-bin-win-cpu-x64.zip",
        binaryName: "llama-server.exe",
        archiveType: "zip",
      }
    case "macos-x64":
      return {
        archiveName: "llama-${tag}-bin-macos-x64.tar.gz",
        binaryName: "llama-server",
        archiveType: "tar.gz",
      }
    case "macos-arm64":
      return {
        archiveName: "llama-${tag}-bin-macos-arm64.tar.gz",
        binaryName: "llama-server",
        archiveType: "tar.gz",
      }
  }
}

export const LLAMA_CPP_RELEASES_API = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"

export async function getLatestLlamaCppReleaseTag(): Promise<string> {
  const res = await fetch(LLAMA_CPP_RELEASES_API, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "HiveLearn",
    },
  })
  if (!res.ok) {
    throw new Error(`No se pudo consultar la última release de llama.cpp: HTTP ${res.status}`)
  }

  const data = await res.json() as { tag_name?: string }
  if (!data.tag_name) {
    throw new Error("La API de releases de llama.cpp no devolvió tag_name")
  }

  return data.tag_name
}

export function getLlamaCppDownloadURL(tag: string, archiveNameTemplate: string): string {
  const archiveName = archiveNameTemplate.replace("${tag}", tag)
  return `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${archiveName}`
}
