import { useCallback, useEffect, useRef } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'

let audioContext: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let audioQueue: ArrayBuffer[] = []
let isPlaying = false

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

function stopCurrent() {
  if (currentSource) {
    try { currentSource.stop() } catch {}
    currentSource = null
  }
  isPlaying = false
}

async function playNextInQueue(): Promise<void> {
  if (isPlaying || audioQueue.length === 0) return
  isPlaying = true

  const pcm = audioQueue.shift()!
  const ctx = getAudioContext()

  try {
    const buffer = await ctx.decodeAudioData(pcm)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    currentSource = source

    await new Promise<void>((resolve) => {
      source.onended = () => {
        currentSource = null
        isPlaying = false
        resolve()
        playNextInQueue()
      }
      source.start(0)
    })
  } catch {
    isPlaying = false
    playNextInQueue()
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export function useTTSSpeak() {
  const processedRef = useRef<number>(0)

  // Watch store ttsAudioQueue and play new items
  const ttsAudioQueue = useRioMundoStore(s => s.ttsAudioQueue)

  useEffect(() => {
    if (ttsAudioQueue.length > processedRef.current) {
      // Process new items
      for (let i = processedRef.current; i < ttsAudioQueue.length; i++) {
        const item = ttsAudioQueue[i]
        if (item?.audioBase64) {
          try {
            const audioData = base64ToArrayBuffer(item.audioBase64)
            audioQueue.push(audioData)
          } catch {
            // Ignore decode errors
          }
        }
      }
      processedRef.current = ttsAudioQueue.length
      if (!isPlaying) {
        playNextInQueue()
      }
    }
  }, [ttsAudioQueue])

  const speak = useCallback(async (text: string, voice?: string): Promise<void> => {
    if (!text.trim()) return

    const sendWsMessage = useRioMundoStore.getState().sendWsMessage
    if (!sendWsMessage) {
      // Sin WS: silencio. El fallback del navegador suena como pitido robótico.
      return
    }

    // Send TTS request via WS — Piper sintetiza en backend y devuelve PCM/WAV.
    sendWsMessage({
      tipo: 'tts:synthesize',
      text: text.trim(),
      voice: voice || 'sorah',
    })
    // Si Piper no responde, mantenemos silencio (sin fallback browser).
  }, [])

  const stop = useCallback(() => {
    stopCurrent()
    audioQueue = []
  }, [])

  const isSpeaking = useCallback((): boolean => {
    return isPlaying
  }, [])

  return { speak, stop, isSpeaking }
}

