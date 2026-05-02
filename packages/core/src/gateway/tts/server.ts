#!/usr/bin/env bun
/**
 * Hive TTS Server (Standalone)
 * HTTP server local que expone Piper TTS como API REST
 */
import { listVoices, synthesize } from "./logic.js"

const PORT = Number(process.env.TTS_PORT ?? 5500)
const DEFAULT_VOICE = process.env.TTS_VOICE ?? "sorah"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

Bun.serve({
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
        return Response.json({ error: "Body JSON inválido" }, { status: 400, headers: CORS })
      }

      const { text, voice = DEFAULT_VOICE } = body
      if (!text) {
        return Response.json({ error: "Campo 'text' requerido" }, { status: 400, headers: CORS })
      }

      try {
        const audio = await synthesize(text, voice)
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

console.log(`Hive TTS Standalone Server en http://localhost:${PORT}`)
