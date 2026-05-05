/**
 * TTS routes
 */
import { logger } from '../../utils/logger'
import { checkTTSInstallation, installPiper, installVoice, ensureTTSDirs } from '../tts/install'
import { synthesize, listVoices } from '../tts/logic'
import { AVAILABLE_VOICES } from '../tts/detect'
import { addCorsHeaders } from './_helpers'

const log = logger.child('route:tts')

export async function handleTTS(req: Request, url: URL): Promise<Response | null> {
  // GET /api/tts/status
  if (url.pathname === '/api/tts/status' && req.method === 'GET') {
    const status = checkTTSInstallation()
    log.info('[tts] status check', status)
    return addCorsHeaders(Response.json(status), req)
  }

  // POST /api/tts/install
  if (url.pathname === '/api/tts/install' && req.method === 'POST') {
    try {
      const { voice } = await req.json() as { voice?: string }
      ensureTTSDirs()
      await installPiper()
      await installVoice(voice)
      return addCorsHeaders(Response.json({ success: true, status: checkTTSInstallation() }), req)
    } catch (e) {
      log.error('[tts] install error', { error: (e as Error).message })
      return addCorsHeaders(Response.json({ error: (e as Error).message }, { status: 500 }), req)
    }
  }

  // POST /api/tts/synthesize
  if (url.pathname === '/api/tts/synthesize' && req.method === 'POST') {
    try {
      const { text, voice } = await req.json() as { text: string; voice?: string }
      if (!text) return addCorsHeaders(Response.json({ error: 'Text required' }, { status: 400 }), req)

      const audio = await synthesize(text, voice)
      return addCorsHeaders(new Response(audio, {
        headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(audio.byteLength) }
      }), req)
    } catch (e) {
      log.error('[tts] synthesize error', { error: (e as Error).message })
      return addCorsHeaders(Response.json({ error: (e as Error).message }, { status: 500 }), req)
    }
  }

  // GET /api/tts/voices
  if (url.pathname === '/api/tts/voices' && req.method === 'GET') {
    return addCorsHeaders(Response.json({ voices: listVoices() }), req)
  }

  // GET /api/tts/available-voices
  if (url.pathname === '/api/tts/available-voices' && req.method === 'GET') {
    log.info('[tts] listing available voices', { count: AVAILABLE_VOICES.length })
    return addCorsHeaders(Response.json({ voices: AVAILABLE_VOICES }), req)
  }

  return null
}
