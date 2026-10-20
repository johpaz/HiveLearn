/**
 * Audio del juego, 100 % procedural (Web Audio, sin archivos): un ambiente grave, el zumbido del dron según su
 * velocidad y efectos para acierto, error, compuerta, nivel, foco y selección. Empieza silenciado: solo suena si el
 * jugador lo activa (y el navegador exige un gesto antes de crear el contexto). La preferencia se guarda.
 */
export const AUDIO_KEY = 'hivelearn.audio'

export interface AudioPrefs { muted: boolean; volume: number }
export type Sfx = 'ok' | 'bad' | 'gate' | 'level' | 'focus' | 'select'

export interface PrefStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function loadPrefs(store: PrefStore | null): AudioPrefs {
  const fallback: AudioPrefs = { muted: true, volume: 0.6 }
  try {
    const raw = store?.getItem(AUDIO_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>
    return {
      muted: parsed.muted !== false,
      volume: typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1 ? parsed.volume : fallback.volume,
    }
  } catch { return fallback }
}

function browserStore(): PrefStore | null {
  try { return localStorage } catch { return null }
}

function browserContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    return Ctor ? new Ctor() : null
  } catch { return null }
}

export class GameAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private thrust: { gain: GainNode } | null = null
  private prefs: AudioPrefs

  constructor(private readonly makeContext: () => AudioContext | null = browserContext, private readonly store: PrefStore | null = browserStore()) {
    this.prefs = loadPrefs(store)
  }

  get muted(): boolean { return this.prefs.muted }
  get volume(): number { return this.prefs.volume }
  /** ¿Hay contexto de audio creado? (nunca lo hay mientras esté silenciado desde el inicio). */
  get active(): boolean { return this.ctx !== null }

  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted }
    this.persist()
    if (muted) { if (this.master) this.master.gain.value = 0; return }
    this.ensure()
    if (this.master) this.master.gain.value = this.prefs.volume
    void this.ctx?.resume?.()
  }

  setVolume(volume: number): void {
    this.prefs = { ...this.prefs, volume: Math.min(1, Math.max(0, volume)) }
    this.persist()
    if (this.master && !this.prefs.muted) this.master.gain.value = this.prefs.volume
  }

  /** Zumbido del dron: más agudo y fuerte cuanto más rápido va. */
  setThrust(speed: number): void {
    if (this.prefs.muted || !this.ctx || !this.thrust) return
    this.thrust.gain.gain.value = Math.min(0.05, speed * 0.008)
  }

  sfx(kind: Sfx): void {
    if (this.prefs.muted) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    switch (kind) {
      case 'ok': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, t + i * 0.07, 0.22, 'triangle', 0.16)); break
      case 'bad': this.tone(150, t, 0.32, 'sawtooth', 0.12, 85); break
      case 'gate': this.tone(180, t, 0.55, 'sine', 0.18, 900); break
      case 'level': [523.25, 659.25, 783.99].forEach(f => this.tone(f, t, 0.9, 'triangle', 0.12)); this.tone(1046.5, t + 0.25, 0.8, 'sine', 0.1); break
      case 'focus': this.tone(880, t, 0.05, 'sine', 0.04); break
      case 'select': this.tone(660, t, 0.08, 'square', 0.04, 990); break
    }
  }

  dispose(): void {
    void this.ctx?.close?.()
    this.ctx = null
    this.master = null
    this.thrust = null
  }

  private persist(): void {
    try { this.store?.setItem(AUDIO_KEY, JSON.stringify(this.prefs)) } catch { /* sin almacenamiento */ }
  }

  /** Crea el contexto la primera vez que hace falta (tras un gesto del jugador) y arranca el ambiente. */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx
    const ctx = this.makeContext()
    if (!ctx) return null
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.prefs.muted ? 0 : this.prefs.volume
    this.master.connect(ctx.destination)

    const pad = ctx.createBiquadFilter()
    pad.type = 'lowpass'
    pad.frequency.value = 420
    const padGain = ctx.createGain()
    padGain.gain.value = 0.05
    pad.connect(padGain)
    padGain.connect(this.master)
    for (const [freq, detune] of [[55, 0], [55, 7], [82.4, -5]] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.detune.value = detune
      osc.connect(pad)
      osc.start()
    }

    const hum = ctx.createOscillator()
    hum.type = 'sawtooth'
    hum.frequency.value = 96
    const humFilter = ctx.createBiquadFilter()
    humFilter.type = 'lowpass'
    humFilter.frequency.value = 260
    const humGain = ctx.createGain()
    humGain.gain.value = 0
    hum.connect(humFilter)
    humFilter.connect(humGain)
    humGain.connect(this.master)
    hum.start()
    this.thrust = { gain: humGain }
    return ctx
  }

  private tone(freq: number, start: number, duration: number, type: OscillatorType, level: number, endFreq?: number): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    if (endFreq) osc.frequency.linearRampToValueAtTime(endFreq, start + duration)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(level, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(start)
    osc.stop(start + duration + 0.05)
  }
}
