/**
 * AudioManager — WebAudio puro, cero assets binarios (requisito offline LATAM).
 *
 * - SFX: sintetizados estilo jsfxr (salto, moneda, bloque, daño, golpe, victoria, blip).
 * - Música: secuenciador chiptune por tema de mundo (osciladores square/triangle).
 * - Voz: reproduce audio TTS (Piper) pre-generado, con ducking de la música.
 *
 * La API es estable: si luego se integran packs CC0 reales (Kenney/Howler),
 * solo cambia la implementación interna.
 */

export type SfxName =
  | 'jump' | 'coin' | 'block' | 'hurt' | 'bossHit' | 'victory'
  | 'blip' | 'stomp' | 'checkpoint' | 'wrong' | 'correct' | 'unlock'

export type MusicTrack = 'jardin' | 'almacen' | 'criadero' | 'sala_real' | 'boss' | 'map' | 'none'

interface NoteEvent {
  /** semitono relativo a A4 (0 = 440Hz), null = silencio */
  n: number | null
  /** duración en pasos del secuenciador */
  d?: number
}

// Melodías cortas en loop por pista (estilo chiptune, 8 pasos por compás)
const MELODIES: Record<Exclude<MusicTrack, 'none'>, { bpm: number; lead: NoteEvent[]; bass: NoteEvent[] }> = {
  jardin: {
    bpm: 112,
    lead: [{ n: 0 }, { n: 4 }, { n: 7 }, { n: 12 }, { n: 7 }, { n: 4 }, { n: 5 }, { n: 2 }],
    bass: [{ n: -24, d: 2 }, { n: -17, d: 2 }, { n: -19, d: 2 }, { n: -22, d: 2 }],
  },
  almacen: {
    bpm: 96,
    lead: [{ n: -3 }, { n: 0 }, { n: 2 }, { n: 5 }, { n: 2 }, { n: 0 }, { n: -1 }, { n: null }],
    bass: [{ n: -27, d: 2 }, { n: -22, d: 2 }, { n: -24, d: 2 }, { n: -20, d: 2 }],
  },
  criadero: {
    bpm: 104,
    lead: [{ n: 2 }, { n: 5 }, { n: 9 }, { n: 14 }, { n: 9 }, { n: 7 }, { n: 5 }, { n: 4 }],
    bass: [{ n: -22, d: 2 }, { n: -15, d: 2 }, { n: -17, d: 2 }, { n: -19, d: 2 }],
  },
  sala_real: {
    bpm: 120,
    lead: [{ n: 0 }, { n: 3 }, { n: 7 }, { n: 10 }, { n: 12 }, { n: 10 }, { n: 7 }, { n: 3 }],
    bass: [{ n: -24, d: 2 }, { n: -21, d: 2 }, { n: -17, d: 2 }, { n: -14, d: 2 }],
  },
  boss: {
    bpm: 140,
    lead: [{ n: -2 }, { n: -2 }, { n: 1 }, { n: -2 }, { n: 4 }, { n: 3 }, { n: 1 }, { n: -2 }],
    bass: [{ n: -26 }, { n: -26 }, { n: -23 }, { n: -26 }, { n: -26 }, { n: -26 }, { n: -21 }, { n: -23 }],
  },
  map: {
    bpm: 90,
    lead: [{ n: 7 }, { n: null }, { n: 4 }, { n: null }, { n: 0 }, { n: null }, { n: 4 }, { n: null }],
    bass: [{ n: -24, d: 4 }, { n: -19, d: 4 }],
  },
}

function freq(semitone: number): number {
  return 440 * Math.pow(2, semitone / 12)
}

export class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null

  private musicTimer: ReturnType<typeof setInterval> | null = null
  private currentTrack: MusicTrack = 'none'
  private tempoScale = 1
  private voiceSource: AudioBufferSourceNode | HTMLAudioElement | null = null
  /** Nodos WebAudio activos de la voz (ruta moderna). */
  private voiceAnalyser: AnalyserNode | null = null
  private voiceGainNode: GainNode | null = null
  private voicePannerNode: StereoPannerNode | null = null
  private voiceSpectrumBuf: Uint8Array | null = null
  /** Callback que las escenas enganchan para karaoke (recibe duración del audio). */
  onVoiceStart: ((durationSec: number) => void) | null = null

  muted = false

  /** Debe llamarse tras un gesto del usuario (política de autoplay) */
  ensureContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = 0.35
      this.musicGain.connect(this.master)
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = 0.8
      this.sfxGain.connect(this.master)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.5
  }

  // ─── SFX ───────────────────────────────────────────────────────────────────

  play(name: SfxName) {
    const ctx = this.ensureContext()
    if (!ctx || !this.sfxGain || this.muted) return
    const t = ctx.currentTime
    switch (name) {
      case 'jump': this.sweep(t, 'square', 220, 660, 0.12, 0.25); break
      case 'coin': this.tone(t, 'square', 988, 0.06, 0.2); this.tone(t + 0.06, 'square', 1319, 0.18, 0.2); break
      case 'block': this.sweep(t, 'square', 392, 523, 0.08, 0.25); this.tone(t + 0.08, 'triangle', 784, 0.12, 0.2); break
      case 'hurt': this.sweep(t, 'sawtooth', 330, 110, 0.25, 0.3); break
      case 'bossHit': this.sweep(t, 'square', 196, 98, 0.15, 0.35); this.noise(t, 0.12, 0.15); break
      case 'stomp': this.sweep(t, 'square', 440, 880, 0.1, 0.2); break
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.13, 'square', f, 0.14, 0.22))
        break
      case 'blip': this.tone(t, 'square', 587 + Math.random() * 80, 0.035, 0.12); break
      case 'checkpoint': this.tone(t, 'triangle', 659, 0.1, 0.25); this.tone(t + 0.1, 'triangle', 880, 0.2, 0.25); break
      case 'wrong': this.tone(t, 'sawtooth', 175, 0.18, 0.25); this.tone(t + 0.18, 'sawtooth', 147, 0.3, 0.25); break
      case 'correct': this.tone(t, 'square', 660, 0.09, 0.2); this.tone(t + 0.1, 'square', 880, 0.2, 0.2); break
      case 'unlock': [392, 494, 587, 784].forEach((f, i) => this.tone(t + i * 0.09, 'triangle', f, 0.1, 0.22)); break
    }
  }

  private tone(at: number, type: OscillatorType, f: number, dur: number, vol: number) {
    if (!this.ctx || !this.sfxGain) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = f
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + dur)
    osc.connect(g).connect(this.sfxGain)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  private sweep(at: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    if (!this.ctx || !this.sfxGain) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f0, at)
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), at + dur)
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + dur)
    osc.connect(g).connect(this.sfxGain)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  private noise(at: number, dur: number, vol: number) {
    if (!this.ctx || !this.sfxGain) return
    const len = Math.floor(this.ctx.sampleRate * dur)
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const g = this.ctx.createGain()
    g.gain.value = vol
    src.connect(g).connect(this.sfxGain)
    src.start(at)
  }

  // ─── Música ────────────────────────────────────────────────────────────────

  playMusic(track: MusicTrack) {
    if (track === this.currentTrack) return
    this.stopMusic()
    this.currentTrack = track
    if (track === 'none') return
    const ctx = this.ensureContext()
    if (!ctx || !this.musicGain) return

    const melody = MELODIES[track]
    let step = 0
    const scheduleStep = () => {
      if (!this.ctx || !this.musicGain || this.muted) { step++; return }
      const t = this.ctx.currentTime
      const stepDur = 60 / (melody.bpm * this.tempoScale) / 2

      const lead = melody.lead[step % melody.lead.length]
      if (lead.n !== null) this.musicNote(t, 'square', freq(lead.n), stepDur * (lead.d ?? 1) * 0.9, 0.16)

      const bassPattern = melody.bass
      const bassStepsPerNote = melody.lead.length / bassPattern.length
      if (step % bassStepsPerNote === 0) {
        const bass = bassPattern[Math.floor(step / bassStepsPerNote) % bassPattern.length]
        if (bass.n !== null) this.musicNote(t, 'triangle', freq(bass.n), stepDur * bassStepsPerNote * 0.95, 0.22)
      }
      step++
    }
    const interval = () => 60 / (MELODIES[track].bpm * this.tempoScale) / 2 * 1000
    const tick = () => {
      scheduleStep()
      this.musicTimer = setTimeout(tick, interval()) as unknown as ReturnType<typeof setInterval>
    }
    tick()
  }

  private musicNote(at: number, type: OscillatorType, f: number, dur: number, vol: number) {
    if (!this.ctx || !this.musicGain) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.value = f
    g.gain.setValueAtTime(vol, at)
    g.gain.setValueAtTime(vol, at + dur * 0.7)
    g.gain.linearRampToValueAtTime(0.001, at + dur)
    osc.connect(g).connect(this.musicGain)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  stopMusic() {
    if (this.musicTimer) {
      clearTimeout(this.musicTimer as unknown as number)
      this.musicTimer = null
    }
    this.currentTrack = 'none'
    this.tempoScale = 1
  }

  /** Acelera la música del jefe cuando le queda poca vida */
  setMusicTempo(scale: number) {
    this.tempoScale = scale
  }

  // ─── Voz (TTS Piper pre-generado) ─────────────────────────────────────────

  /**
   * Reproduce una URL de audio TTS con ducking de la música.
   *
   * Ruta moderna: fetch → decodeAudioData → source → gain → analyser → panner → master.
   * Esto habilita:
   *   - `opts.volume` / `opts.pan` para sonido posicional por distancia al NPC.
   *   - `getVoiceSpectrum()` para visualizador FFT (32 bandas) mientras habla.
   *   - `onVoiceStart(duration)` para karaoke de subtítulos sincronizado.
   *
   * Devuelve una Promise que se resuelve al terminar con `{ duration }` en segundos.
   * Fallback: si decode falla, cae a HTMLAudioElement (ruta antigua).
   */
  async playVoice(
    url: string,
    opts: { volume?: number; pan?: number } = {},
  ): Promise<{ duration: number }> {
    this.stopVoice()
    const ctx = this.ensureContext()
    if (!ctx || !this.master) {
      return await this.playVoiceFallback(url)
    }
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.1)

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.arrayBuffer()
      const buffer = await ctx.decodeAudioData(raw)
      const source = ctx.createBufferSource()
      source.buffer = buffer

      // Gain
      const gain = ctx.createGain()
      gain.gain.value = opts.volume ?? 1

      // Analyser (FFT)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64 // 32 bins
      analyser.smoothingTimeConstant = 0.7
      this.voiceSpectrumBuf = new Uint8Array(analyser.frequencyBinCount)

      // Conectar: source → gain → analyser → (panner?) → master
      source.connect(gain)
      gain.connect(analyser)
      let out: AudioNode = analyser
      if (typeof StereoPannerNode !== 'undefined' && typeof opts.pan === 'number') {
        const panner = ctx.createStereoPanner()
        panner.pan.value = Math.max(-1, Math.min(1, opts.pan))
        analyser.connect(panner)
        out = panner
        this.voicePannerNode = panner
      }
      out.connect(this.master)

      this.voiceSource = source
      this.voiceAnalyser = analyser
      this.voiceGainNode = gain

      const duration = buffer.duration
      this.onVoiceStart?.(duration)

      return await new Promise<{ duration: number }>((resolve) => {
        const done = () => {
          this.restoreVoiceDucking()
          if (this.voiceSource === source) this.voiceSource = null
          this.voiceAnalyser = null
          this.voiceGainNode = null
          this.voicePannerNode = null
          this.voiceSpectrumBuf = null
          resolve({ duration })
        }
        source.onended = done
        try { source.start() } catch { done() }
      })
    } catch {
      // Ruta fallback (decode no disponible, o fetch falló): HTMLAudioElement
      return await this.playVoiceFallback(url)
    }
  }

  /** Ruta fallback con HTMLAudioElement (sin analyser/pan). */
  private async playVoiceFallback(url: string): Promise<{ duration: number }> {
    const ctx = this.ensureContext()
    if (this.musicGain && ctx) this.musicGain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.1)
    return await new Promise((resolve) => {
      const audio = new Audio(url)
      this.voiceSource = audio
      const done = () => {
        this.restoreVoiceDucking()
        if (this.voiceSource === audio) this.voiceSource = null
        this.onVoiceStart?.(audio.duration || 0)
        resolve({ duration: audio.duration || 0 })
      }
      audio.onended = done
      audio.onerror = done
      void audio.play().catch(done)
    })
  }

  /** Devuelve el espectro FFT actual de la voz (32 bandas) o null si no hay voz. */
  getVoiceSpectrum(): Uint8Array | null {
    if (!this.voiceAnalyser || !this.voiceSpectrumBuf) return null
    this.voiceAnalyser.getByteFrequencyData(this.voiceSpectrumBuf as Uint8Array<ArrayBuffer>)
    return this.voiceSpectrumBuf
  }

  /** Restaura el nivel de música tras ducking de voz. */
  private restoreVoiceDucking(): void {
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.3)
  }

  stopVoice() {
    if (this.voiceSource instanceof HTMLAudioElement) {
      this.voiceSource.pause()
      this.voiceSource = null
      this.restoreVoiceDucking()
    } else if (this.voiceSource instanceof AudioBufferSourceNode) {
      try { this.voiceSource.stop() } catch { /* already stopped */ }
      this.voiceSource = null
      this.restoreVoiceDucking()
    }
    this.voiceAnalyser = null
    this.voiceGainNode = null
    this.voicePannerNode = null
    this.voiceSpectrumBuf = null
  }

  // ─── Leitmotivs por personaje (identidad sonora de la colmena) ────────────

  /**
   * Identidad melódica de cada abeja. Espejo offline del seed en
   * `packages/core/src/storage/voices.ts` (hl_agent_voices); el backend puede
   * sobreescribirla en caliente vía `setAgentLeitmotif()` cuando React trae
   * `/api/tts-local/voices` (hiveDB = fuente de verdad).
   */
  private static LEITMOTIFS: Record<string, { notas: number[]; bpm: number }> = {
    coordinator:  { notas: [0, 3, 7, 12], bpm: 96 },
    onboarding:   { notas: [7, 4, 0, 4], bpm: 108 },
    content:      { notas: [0, 4, 9], bpm: 120 },
    practice:     { notas: [-5, 0, 0, 5], bpm: 104 },
    assessment:   { notas: [0, -2, -5], bpm: 84 },
    image:        { notas: [4, 9, 11], bpm: 112 },
    infographic:  { notas: [0, 5, 9, 5], bpm: 100 },
    audio:        { notas: [12, 9, 5, 9], bpm: 90 },
    gamification: { notas: [0, 4, 7, 12, 7, 12], bpm: 132 },
  }

  /** Alias aceptados → agentId canónico (mismos que resolveCharacter del core) */
  private static normalizeAgentId(agentId: string): string {
    const id = agentId.trim().toLowerCase()
    if (id === 'maya' || id.includes('onboarding')) return 'onboarding'
    if (id.includes('coordinator') || id === 'reina' || id === 'reina_miel') return 'coordinator'
    if (id.includes('content') || id.includes('explanation') || id === 'polen') return 'content'
    if (id.includes('practice') || id.includes('exercise') || id === 'cera') return 'practice'
    if (id.includes('assessment') || id.includes('evaluation') || id === 'guardia') return 'assessment'
    if (id.includes('image') || id === 'pigmento') return 'image'
    if (id.includes('infographic') || id === 'mapa') return 'infographic'
    if (id.includes('audio') || id === 'melodia') return 'audio'
    if (id.includes('gamification') || id === 'festiva') return 'gamification'
    return id
  }

  /** Sobrescribe el leitmotiv de un agente con la identidad de hiveDB */
  setAgentLeitmotif(agentId: string, leitmotiv: { notas: number[]; bpm: number }) {
    const id = AudioManager.normalizeAgentId(agentId)
    if (!id || !Array.isArray(leitmotiv.notas) || leitmotiv.notas.length === 0) return
    AudioManager.LEITMOTIFS[id] = { notas: leitmotiv.notas.slice(0, 8), bpm: leitmotiv.bpm || 100 }
  }

  /** Carga masiva desde GET /api/tts-local/voices (hiveDB) */
  loadAgentVoices(voices: Array<{ agentId: string; leitmotiv?: { notas: number[]; bpm: number } }>) {
    for (const v of voices) {
      if (v.leitmotiv?.notas?.length) this.setAgentLeitmotif(v.agentId, v.leitmotiv)
    }
  }

  /**
   * Reproduce la frase melódica única de un personaje (una vez, no en loop).
   * Usar al entrar un agente a escena, al hablar o al celebrar.
   */
  playLeitmotiv(agentId: string, opts: { volume?: number } = {}) {
    const ctx = this.ensureContext()
    const motif = AudioManager.LEITMOTIFS[AudioManager.normalizeAgentId(agentId)]
    if (!ctx || !this.sfxGain || this.muted || !motif) return

    const stepDur = 60 / motif.bpm / 2
    let t = ctx.currentTime + 0.02
    for (const semitone of motif.notas) {
      this.tone(t, 'triangle', freq(semitone), stepDur * 0.95, opts.volume ?? 0.28)
      t += stepDur
    }
  }

  /** Stingers de ceremonia: entrada solemne, graduación y fanfarria del enjambre */
  playStinger(kind: 'entrance' | 'graduacion' | 'ceremonia') {
    const ctx = this.ensureContext()
    if (!ctx || !this.sfxGain || this.muted) return
    const t = ctx.currentTime
    switch (kind) {
      case 'entrance':
        this.sweep(t, 'triangle', 392, 784, 0.35, 0.22)
        this.tone(t + 0.36, 'triangle', 784, 0.25, 0.2)
        break
      case 'graduacion':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.14, 'square', f, 0.22, 0.2))
        break
      case 'ceremonia':
        [262, 330, 392].forEach((f, i) => this.tone(t + i * 0.08, 'triangle', f, 0.4, 0.16))
        break
    }
  }

  destroy() {
    this.stopMusic()
    this.stopVoice()
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
  }
}
