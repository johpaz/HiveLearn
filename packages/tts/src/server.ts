#!/usr/bin/env bun
/**
 * Hive TTS Server
 * HTTP server local que expone Piper TTS como API REST
 * Puerto: 5500 (configurable con env TTS_PORT)
 *
 * GET  /health   → { ok: true, voice: string, voices: string[] }
 * POST /tts      → audio/wav binary
 * GET  /voices   → { voices: string[] }
 */

import { existsSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { detectPlatform, getPiperBinaryName } from "./detect.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const BIN_DIR = join(ROOT, "bin")
const VOICES_DIR = join(ROOT, "voices")
const PORT = Number(process.env.TTS_PORT ?? 5500)
const DEFAULT_VOICE = process.env.TTS_VOICE ?? "sorah"

function getPiperPath(): string {
  const platform = detectPlatform()
  const binaryName = getPiperBinaryName(platform)
  const binaryPath = join(BIN_DIR, binaryName)

  if (!existsSync(binaryPath)) {
    throw new Error("Piper no instalado. Ejecuta: bun run src/install.ts")
  }
  return binaryPath
}

function listVoices(): string[] {
  if (!existsSync(VOICES_DIR)) return []
  return readdirSync(VOICES_DIR)
    .filter((f) => f.endsWith(".onnx"))
    .map((f) => f.replace(".onnx", ""))
}

async function synthesize(text: string, voice: string): Promise<ArrayBuffer> {
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

function wrapInWav(
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS })
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json(
        { ok: true, voice: DEFAULT_VOICE, voices: listVoices() },
        { headers: CORS }
      )
    }

    if (req.method === "GET" && url.pathname === "/voices") {
      return Response.json({ voices: listVoices() }, { headers: CORS })
    }

    if (req.method === "POST" && url.pathname === "/tts") {
      let body: { text?: string; voice?: string }
      try {
        body = await req.json()
      } catch {
        return Response.json(
          { error: "Body JSON inválido" },
          { status: 400, headers: CORS }
        )
      }

      const { text, voice = DEFAULT_VOICE } = body

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return Response.json(
          { error: "Campo 'text' requerido" },
          { status: 400, headers: CORS }
        )
      }

      if (text.length > 2000) {
        return Response.json(
          { error: "Texto demasiado largo (máx 2000 chars)" },
          { status: 400, headers: CORS }
        )
      }

      try {
        const audio = await synthesize(text.trim(), voice)
        return new Response(audio, {
          headers: {
            ...CORS,
            "Content-Type": "audio/wav",
            "Content-Length": String(audio.byteLength),
          },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error interno"
        return Response.json({ error: message }, { status: 500, headers: CORS })
      }
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: CORS })
  },
})

console.log(`Hive TTS Server escuchando en http://localhost:${PORT}`)
console.log(`   Voz por defecto: ${DEFAULT_VOICE}`)
console.log(`   Voces disponibles: ${listVoices().join(", ") || "ninguna (ejecuta install.ts primero)"}`)
