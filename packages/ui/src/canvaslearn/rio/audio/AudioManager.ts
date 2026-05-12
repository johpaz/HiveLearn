export type WsStatus = 'disconnected' | 'connecting' | 'connected'

export interface AudioSettings {
  musicVolume: number
  sfxVolume: number
  musicMuted: boolean
  sfxMuted: boolean
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicVolume: 70,
  sfxVolume: 80,
  musicMuted: false,
  sfxMuted: false,
}

const SFX_POOL_SIZE = 4

type AudioKey = string

interface QueuedTTS {
  data: ArrayBuffer
  resolve: () => void
}

export class AudioManager {
  private ctx: AudioContext | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private buffers: Map<AudioKey, AudioBuffer> = new Map()
  private currentMusicSource: AudioBufferSourceNode | null = null
  private currentMusicKey: string | null = null
  private previousMusicKey: string | null = null
  private crossfadeGain: GainNode | null = null
  private crossfadeSource: AudioBufferSourceNode | null = null
  private sfxPoolIndex: number = 0
  private sfxPool: (AudioBufferSourceNode | null)[] = new Array(SFX_POOL_SIZE).fill(null)
  private settings: AudioSettings = {
    musicVolume: DEFAULT_AUDIO_SETTINGS.musicVolume / 100,
    sfxVolume: DEFAULT_AUDIO_SETTINGS.sfxVolume / 100,
    musicMuted: DEFAULT_AUDIO_SETTINGS.musicMuted,
    sfxMuted: DEFAULT_AUDIO_SETTINGS.sfxMuted,
  }
  private ttsQueue: QueuedTTS[] = []
  private ttsPlaying: boolean = false
  private loaded: boolean = false
  private pendingMusic: { mode: 'play' | 'crossfade'; key: string; durationMs?: number } | null = null

  async init(settings?: Partial<AudioSettings>) {
    if (this.ctx) return
    
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
      this.ctx = new AudioContextClass()
      console.log('[AudioManager] AudioContext created. State:', this.ctx!.state)
      
      this.musicGain = this.ctx!.createGain()
      this.sfxGain = this.ctx!.createGain()
      this.musicGain.connect(this.ctx!.destination)
      this.sfxGain.connect(this.ctx!.destination)

      if (settings) {
        this.settings = { ...this.settings, ...settings }
      }
      this.applyVolumes()

      // Try to resume immediately if suspended (though it might need a gesture)
      if (this.ctx!.state === 'suspended') {
        this.ctx!.resume().catch(() => {
          console.log('[AudioManager] Context suspended, waiting for user interaction.')
        })
      }
    } catch (e) {
      console.error('[AudioManager] Failed to initialize AudioContext:', e)
    }
  }

  async ensureCtx() {
    if (!this.ctx) await this.init()
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch (e) {
        console.warn('[AudioManager] Failed to resume context:', e)
      }
    }
  }

  private applyVolumes() {
    if (this.musicGain) {
      this.musicGain.gain.value = this.settings.musicMuted ? 0 : this.settings.musicVolume
    }
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.settings.sfxMuted ? 0 : this.settings.sfxVolume
    }
  }

  async preloadAssets(assets: Record<AudioKey, string>): Promise<void> {
    await this.ensureCtx()
    if (!this.ctx) {
      console.error('[AudioManager] Cannot preload assets: No AudioContext')
      return
    }

    const entries = Object.entries(assets)
    console.log(`[AudioManager] Starting sequential preload of ${entries.length} assets...`)
    
    for (const [key, url] of entries) {
      // Si el ctx fue destruido entre iteraciones (componente desmontado), abortar.
      if (!this.ctx || (this.ctx as AudioContext).state === 'closed') {
        console.warn(`[AudioManager] AudioContext unavailable, aborting preload at ${key}`)
        return
      }
      try {
        const resp = await fetch(url)
        const contentType = resp.headers.get('content-type') || 'unknown'

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText} (Type: ${contentType})`)
        }

        // Detectar HTML (SPA fallback del dev server) — saltear sin lanzar
        if (contentType.includes('text/html')) {
          console.warn(`[AudioManager] Skipping ${key}: server returned HTML (asset not served at ${url})`)
          continue
        }

        const arrayBuffer = await resp.arrayBuffer()
        if (arrayBuffer.byteLength === 0) {
          throw new Error(`Empty buffer received for ${url}`)
        }

        // Re-check ctx después del fetch (puede haberse cerrado)
        if (!this.ctx || (this.ctx as AudioContext).state === 'closed') {
          console.warn(`[AudioManager] AudioContext closed during fetch of ${key}, aborting`)
          return
        }

        // Log first bytes to identify content
        const bytes = new Uint8Array(arrayBuffer.slice(0, 16))
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
        console.log(`[AudioManager] Loading ${key}: ${arrayBuffer.byteLength} bytes, type=${contentType}, magic=${hex}`)

        // decodeAudioData SIEMPRE detacha el ArrayBuffer al llamarse (incluso en fallo),
        // así que la copia debe hacerse ANTES del primer intento.
        const fallbackBuffer = arrayBuffer.slice(0)
        let audioBuffer: AudioBuffer
        try {
          audioBuffer = await this.ctx.decodeAudioData(arrayBuffer)
        } catch (decodeError) {
          console.warn(`[AudioManager] Promise-based decode failed for ${key}, trying callback...`, decodeError)
          if (!this.ctx) {
            console.warn(`[AudioManager] ctx vanished mid-decode for ${key}, aborting`)
            return
          }
          audioBuffer = await new Promise((resolve, reject) => {
            this.ctx!.decodeAudioData(fallbackBuffer, resolve, reject)
          })
        }

        this.buffers.set(key, audioBuffer)
      } catch (e) {
        console.warn(`[AudioManager] Failed to load: ${key} from ${url}`, e)
      }
    }

    this.loaded = true
    console.log(`[AudioManager] Preload complete. Loaded ${this.buffers.size}/${entries.length} assets.`)

    const pending = this.pendingMusic
    this.pendingMusic = null
    if (pending) {
      if (pending.mode === 'play') {
        await this.playMusic(pending.key)
      } else {
        await this.crossfadeMusic(pending.key, pending.durationMs)
      }
    }
  }

  async playMusic(key: string) {
    await this.ensureCtx()
    if (!this.ctx || !this.musicGain) return

    if (this.currentMusicKey === key && this.currentMusicSource) return

    const buffer = this.buffers.get(key)
    if (!buffer) {
      if (!this.loaded) this.pendingMusic = { mode: 'play', key }
      console.warn(`[AudioManager] Buffer not found for music: ${key}`)
      return
    }

    this.stopMusic()

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(this.musicGain)
    source.start(0)

    this.currentMusicSource = source
    this.currentMusicKey = key
  }

  stopMusic() {
    if (this.currentMusicSource) {
      try {
        this.currentMusicSource.stop()
        this.currentMusicSource.disconnect()
      } catch {}
      this.currentMusicSource = null
      this.currentMusicKey = null
    }
    if (this.crossfadeSource) {
      try {
        this.crossfadeSource.stop()
        this.crossfadeSource.disconnect()
      } catch {}
      this.crossfadeSource = null
    }
    if (this.crossfadeGain) {
      try {
        this.crossfadeGain.disconnect()
      } catch {}
      this.crossfadeGain = null
    }
  }

  /** Crossfade suave entre tracks de música */
  async crossfadeMusic(toKey: string, durationMs = 1500) {
    await this.ensureCtx()
    if (!this.ctx) return
    if (this.currentMusicKey === toKey) return

    const newBuffer = this.buffers.get(toKey)
    if (!newBuffer) {
      if (!this.loaded) this.pendingMusic = { mode: 'crossfade', key: toKey, durationMs }
      console.warn(`[AudioManager] Buffer not found for crossfade: ${toKey}`)
      return
    }

    const duration = durationMs / 1000
    const now = this.ctx.currentTime

    // Crear nuevo gain node para fade in
    const newGain = this.ctx.createGain()
    newGain.gain.setValueAtTime(0, now)
    newGain.gain.linearRampToValueAtTime(
      this.settings.musicMuted ? 0 : this.settings.musicVolume,
      now + duration
    )
    newGain.connect(this.ctx.destination)

    // Nuevo source con loop
    const newSource = this.ctx.createBufferSource()
    newSource.buffer = newBuffer
    newSource.loop = true
    newSource.connect(newGain)
    newSource.start(0)

    // Fade out del anterior
    if (this.currentMusicSource && this.musicGain) {
      this.musicGain.gain.linearRampToValueAtTime(0, now + duration)

      // Limpiar el anterior después del fade
      const oldSource = this.currentMusicSource
      const oldGain = this.musicGain

      setTimeout(() => {
        try {
          oldSource.stop()
          oldSource.disconnect()
          oldGain.disconnect()
        } catch {}
      }, durationMs + 50)
    }

    // Actualizar referencias
    this.previousMusicKey = this.currentMusicKey
    this.currentMusicSource = newSource
    this.musicGain = newGain
    this.currentMusicKey = toKey
  }

  /** Reproduce un track UNA VEZ (no loop), luego vuelve a previousMusicKey */
  async playMusicOnce(key: string) {
    await this.ensureCtx()
    if (!this.ctx || !this.musicGain) return

    const buffer = this.buffers.get(key)
    if (!buffer) return

    // Guardar música actual para volver después
    const returnKey = this.currentMusicKey

    // Fade out música actual
    if (this.musicGain) {
      const now = this.ctx.currentTime
      this.musicGain.gain.linearRampToValueAtTime(0, now + 0.5)
    }

    // Crear source temporal (sin loop)
    const tempGain = this.ctx.createGain()
    tempGain.gain.setValueAtTime(0, this.ctx.currentTime)
    tempGain.gain.linearRampToValueAtTime(
      this.settings.musicMuted ? 0 : this.settings.musicVolume,
      this.ctx.currentTime + 0.5
    )
    tempGain.connect(this.ctx.destination)

    const tempSource = this.ctx.createBufferSource()
    tempSource.buffer = buffer
    tempSource.connect(tempGain)
    tempSource.start(0)

    // Al terminar, volver a la música anterior
    tempSource.onended = () => {
      try {
        tempGain.disconnect()
      } catch {}
      if (returnKey) {
        this.crossfadeMusic(returnKey, 1500)
      }
    }
  }

  async playSFX(key: string) {
    await this.ensureCtx()
    if (!this.ctx || !this.sfxGain) return

    const buffer = this.buffers.get(key)
    if (!buffer) return

    const prev = this.sfxPool[this.sfxPoolIndex]
    if (prev) {
      try { prev.stop(); prev.disconnect() } catch {}
    }

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.sfxGain)
    source.start(0)

    this.sfxPool[this.sfxPoolIndex] = source
    this.sfxPoolIndex = (this.sfxPoolIndex + 1) % SFX_POOL_SIZE

    source.onended = () => {
      const idx = this.sfxPool.indexOf(source)
      if (idx !== -1) this.sfxPool[idx] = null
    }
  }

  async playTTS(pcmData: ArrayBuffer): Promise<void> {
    return new Promise((resolve) => {
      this.ttsQueue.push({ data: pcmData, resolve })
      if (!this.ttsPlaying) this.processTTSQueue()
    })
  }

  private async processTTSQueue() {
    if (this.ttsPlaying || this.ttsQueue.length === 0) return
    this.ttsPlaying = true

    const item = this.ttsQueue.shift()!
    await this.ensureCtx()

    try {
      if (this.ctx) {
        const buffer = await this.ctx.decodeAudioData(item.data.slice(0))
        const source = this.ctx.createBufferSource()
        source.buffer = buffer
        const gain = this.ctx.createGain()
        gain.gain.value = this.settings.sfxMuted ? 0 : this.settings.sfxVolume
        source.connect(gain)
        gain.connect(this.ctx.destination)
        source.start(0)
        source.onended = () => {
          this.ttsPlaying = false
          item.resolve()
          this.processTTSQueue()
        }
      } else {
        this.ttsPlaying = false
        item.resolve()
        this.processTTSQueue()
      }
    } catch {
      this.ttsPlaying = false
      item.resolve()
      this.processTTSQueue()
    }
  }

  setMusicVolume(v: number) {
    this.settings.musicVolume = Math.max(0, Math.min(1, v))
    this.applyVolumes()
  }

  setSFXVolume(v: number) {
    this.settings.sfxVolume = Math.max(0, Math.min(1, v))
    this.applyVolumes()
  }

  toggleMusicMuted() {
    this.settings.musicMuted = !this.settings.musicMuted
    this.applyVolumes()
    return this.settings.musicMuted
  }

  toggleSFXMuted() {
    this.settings.sfxMuted = !this.settings.sfxMuted
    this.applyVolumes()
    return this.settings.sfxMuted
  }

  getCurrentMusicKey(): string | null {
    return this.currentMusicKey
  }

  getSettings(): AudioSettings {
    return { ...this.settings }
  }

  isLoaded(): boolean {
    return this.loaded
  }

  muteAll() {
    this.settings.musicMuted = true
    this.settings.sfxMuted = true
    this.applyVolumes()
  }

  unmuteAll() {
    this.settings.musicMuted = false
    this.settings.sfxMuted = false
    this.applyVolumes()
  }

  destroy() {
    this.stopMusic()
    for (const s of this.sfxPool) {
      if (s) { try { s.stop(); s.disconnect() } catch {} }
    }
    this.sfxPool.fill(null)
    this.ttsQueue = []
    this.pendingMusic = null
    this.buffers.clear()
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
    this.musicGain = null
    this.sfxGain = null
    this.loaded = false
  }
}
