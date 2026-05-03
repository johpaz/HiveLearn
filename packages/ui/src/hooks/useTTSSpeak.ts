import { useCallback, useRef } from 'react'

const TTS_URL = import.meta.env.VITE_TTS_URL || ''
const TTS_TIMEOUT = 10000

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

export function useTTSSpeak() {
  const queueRef = useRef<boolean>(false)

  const speak = useCallback(async (text: string, voice?: string): Promise<void> => {
    if (!text.trim()) return

    const baseUrl = TTS_URL || `${window.location.protocol}//${window.location.hostname}:8787`

    try {
      const res = await fetch(`${baseUrl}/api/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), voice: voice || 'sorah' }),
        signal: AbortSignal.timeout(TTS_TIMEOUT),
      })

      if (!res.ok) {
        fallbackBrowserSpeak(text)
        return
      }

      const audioData = await res.arrayBuffer()
      audioQueue.push(audioData)

      if (!isPlaying) {
        await playNextInQueue()
      }
    } catch {
      fallbackBrowserSpeak(text)
    }
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

function fallbackBrowserSpeak(text: string) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-ES'
    utterance.rate = 0.9
    utterance.pitch = 1.1
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  }
}