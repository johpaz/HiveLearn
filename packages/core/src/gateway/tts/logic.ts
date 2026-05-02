import { existsSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { detectPlatform, getPiperBinaryName, DEFAULT_VOICE } from "./detect.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = __dirname
const BIN_DIR = join(ROOT, "bin")
const VOICES_DIR = join(ROOT, "voices")

export function getPiperPath(): string {
  const platform = detectPlatform()
  const binaryName = getPiperBinaryName(platform)
  const binaryPath = join(BIN_DIR, binaryName)

  if (!existsSync(binaryPath)) {
    throw new Error("Piper no instalado.")
  }
  return binaryPath
}

export function listVoices(): string[] {
  if (!existsSync(VOICES_DIR)) return []
  return readdirSync(VOICES_DIR)
    .filter((f: string) => f.endsWith(".onnx"))
    .map((f: string) => f.replace(".onnx", ""))
}

export async function synthesize(text: string, voice: string = DEFAULT_VOICE): Promise<ArrayBuffer> {
  const piperPath = getPiperPath()
  const modelPath = join(VOICES_DIR, `${voice}.onnx`)

  if (!existsSync(modelPath)) {
    throw new Error(`Voz no encontrada: ${voice}`)
  }

  const proc = Bun.spawn(
    [piperPath, "--model", modelPath, "--output-raw"],
    {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }
  )

  proc.stdin.write(new TextEncoder().encode(text))
  proc.stdin.end()

  const [audioBuffer, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    const errText = await new Response(proc.stderr).text()
    throw new Error(`Piper error (exit ${exitCode}): ${errText}`)
  }

  // --output-raw devuelve PCM 16-bit LE 22050Hz mono — envolver en WAV header
  return wrapInWav(audioBuffer, 22050, 1, 16)
}

export function wrapInWav(
  pcm: ArrayBuffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): ArrayBuffer {
  const dataSize = pcm.byteLength
  const header = new ArrayBuffer(44)
  const view = new DataView(header)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, (sampleRate * channels * bitsPerSample) / 8, true)
  view.setUint16(32, (channels * bitsPerSample) / 8, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, "data")
  view.setUint32(40, dataSize, true)

  const wav = new Uint8Array(44 + dataSize)
  wav.set(new Uint8Array(header), 0)
  wav.set(new Uint8Array(pcm), 44)
  return wav.buffer
}
