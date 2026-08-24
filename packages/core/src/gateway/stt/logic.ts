/**
 * STT — Speech-to-Text contra llama-server :8083 (modo AUDIO, E2B + mmproj).
 *
 * El servidor expone `/v1/chat/completions` (OpenAI-compatible) y acepta audio
 * como data URI base64 en un mensaje `image_url`. El tipo MIME del data URI
 * (`audio/wav`) le indica al servidor que decodifique audio en lugar de imagen.
 *
 * Ver `docs/GUIA-SERVIDOR.md` §3c y §4c.
 */

import { homedir } from "os"
import { join } from "path"
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs"

const ROOT = join(homedir(), ".hivelearn", "stt")
const STATUS_CACHE_MS = 30_000

let cachedStatus: { ok: boolean; ts: number; detail?: string } = { ok: false, ts: 0 }

export interface SttConfig {
  baseUrl: string
  model?: string
}

let runtimeConfig: SttConfig = {
  baseUrl: process.env.HIVELEARN_STT_URL ?? "http://localhost:8083",
  model: process.env.HIVELEARN_STT_MODEL ?? "gpt-3.5-turbo",
}

export function configureStt(cfg: Partial<SttConfig>): void {
  runtimeConfig = { ...runtimeConfig, ...cfg }
}

export function getSttConfig(): SttConfig {
  return { ...runtimeConfig }
}

function ensureRoot(): void {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true })
}

/**
 * Sondea el estado del servidor STT (GET /health). Cachea el resultado
 * `STATUS_CACHE_MS` para no saturar al servidor.
 */
export async function getSttStatus(force = false): Promise<{
  ok: boolean
  detail?: string
  url: string
}> {
  const now = Date.now()
  if (!force && now - cachedStatus.ts < STATUS_CACHE_MS) {
    return { ok: cachedStatus.ok, detail: cachedStatus.detail, url: runtimeConfig.baseUrl }
  }
  try {
    const res = await fetch(`${runtimeConfig.baseUrl}/health`, {
      signal: AbortSignal.timeout(1500),
    })
    const ok = res.ok
    cachedStatus = { ok, ts: now, detail: ok ? "ok" : `HTTP ${res.status}` }
    return { ok, detail: cachedStatus.detail, url: runtimeConfig.baseUrl }
  } catch (e) {
    const detail = (e as Error).message
    cachedStatus = { ok: false, ts: now, detail }
    return { ok: false, detail, url: runtimeConfig.baseUrl }
  }
}

/**
 * Transcribe un audio WAV (ArrayBuffer o base64) a texto usando el endpoint
 * OpenAI-compatible `/v1/chat/completions` de llama-server en modo AUDIO.
 *
 * @param wav ArrayBuffer del WAV (PCM 16-bit 16kHz mono preferentemente).
 * @returns Texto transcrito (string). Lanza si el servidor no responde.
 */
export async function transcribeAudio(wav: ArrayBuffer): Promise<{ text: string }> {
  const status = await getSttStatus()
  if (!status.ok) {
    throw new Error(`Servidor STT no disponible: ${status.detail ?? "sin detalles"}`)
  }

  const b64 = bufferToBase64(wav)
  const dataUri = `data:audio/wav;base64,${b64}`

  const body = {
    model: runtimeConfig.model ?? "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe el siguiente audio en español. Responde solo con la transcripción, sin comentarios." },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 256,
  }

  const res = await fetch(`${runtimeConfig.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer no-key",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`STT HTTP ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json() as any
  const text: string = data?.choices?.[0]?.message?.content ?? ""
  const clean = text.trim()
  if (!clean) throw new Error("STT: respuesta vacía")
  return { text: clean }
}

/** Persistencia simple de debug — guarda el último WAV recibido para inspección. */
export function dumpWavForDebug(wav: ArrayBuffer): string | null {
  try {
    ensureRoot()
    const path = join(ROOT, `last-input-${Date.now()}.wav`)
    writeFileSync(path, Buffer.from(wav))
    return path
  } catch {
    return null
  }
}

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}