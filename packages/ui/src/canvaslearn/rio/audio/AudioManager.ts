export type WsStatus = 'disconnected' | 'connecting' | 'connected'

export interface AudioSettings {
  musicVolume: number
  sfxVolume: number
  musicMuted: boolean
  sfxMuted: boolean
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicVolume: 0.7,
  sfxVolume: 0.8,
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
  private sfxPoolIndex: number = 0
  private sfxPool: (AudioBufferSourceNode | null)[] = new Array(SFX_POOL_SIZE).fill(null)
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS }
  private ttsQueue: QueuedTTS[] = []
  private ttsPlaying: boolean = false
  private loaded: boolean = false

  async init(settings?: Partial<AudioSettings>) {
    if (this.ctx) return
    this.ctx = new AudioContext()
    this.musicGain = this.ctx.createGain()
    this.sfxGain = this.ctx.createGain()
    this.musicGain.connect(this.ctx.destination)
    this.sfxGain.connect(this.ctx.destination)

    if (settings) {
      this.settings = { ...this.settings, ...settings }
    }
    this.applyVolumes()
  }

  private ensureCtx() {
    if (!this.ctx) this.init()
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
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
    this.ensureCtx()
    if (!this.ctx) return

    const entries = Object.entries(assets)
    const promises = entries.map(async ([key, url]) => {
      try {
        const resp = await fetch(url)
        const arrayBuffer = await resp.arrayBuffer()
        const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer)
        this.buffers.set(key, audioBuffer)
      } catch (e) {
        console.warn(`[AudioManager] Failed to load: ${key} from ${url}`, e)
      }
    })

    await Promise.all(promises)
    this.loaded = true
  }

  playMusic(key: string) {
    this.ensureCtx()
    if (!this.ctx || !this.musicGain) return

    if (this.currentMusicKey === key && this.currentMusicSource) return

    this.stopMusic()

    const buffer = this.buffers.get(key)
    if (!buffer) return

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
  }

  playSFX(key: string) {
    this.ensureCtx()
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
    this.ensureCtx()

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
        item.resolve()
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
