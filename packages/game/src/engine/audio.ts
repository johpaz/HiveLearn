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

export type MusicTrack = 'prado' | 'bosque' | 'montana' | 'colmena' | 'boss' | 'map' | 'none'

interface NoteEvent {
  /** semitono relativo a A4 (0 = 440Hz), null = silencio */
  n: number | null
  /** duración en pasos del secuenciador */
  d?: number
}

// Melodías cortas en loop por pista (estilo chiptune, 8 pasos por compás)
const MELODIES: Record<Exclude<MusicTrack, 'none'>, { bpm: number; lead: NoteEvent[]; bass: NoteEvent[] }> = {
  prado: {
    bpm: 112,
    lead: [{ n: 0 }, { n: 4 }, { n: 7 }, { n: 12 }, { n: 7 }, { n: 4 }, { n: 5 }, { n: 2 }],
    bass: [{ n: -24, d: 2 }, { n: -17, d: 2 }, { n: -19, d: 2 }, { n: -22, d: 2 }],
  },
  bosque: {
    bpm: 96,
    lead: [{ n: -3 }, { n: 0 }, { n: 2 }, { n: 5 }, { n: 2 }, { n: 0 }, { n: -1 }, { n: null }],
    bass: [{ n: -27, d: 2 }, { n: -22, d: 2 }, { n: -24, d: 2 }, { n: -20, d: 2 }],
  },
  montana: {
    bpm: 104,
    lead: [{ n: 2 }, { n: 5 }, { n: 9 }, { n: 14 }, { n: 9 }, { n: 7 }, { n: 5 }, { n: 4 }],
    bass: [{ n: -22, d: 2 }, { n: -15, d: 2 }, { n: -17, d: 2 }, { n: -19, d: 2 }],
  },
  colmena: {
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

  /** Reproduce una URL de audio TTS con ducking de la música. */
  async playVoice(url: string): Promise<void> {
    this.stopVoice()
    const ctx = this.ensureContext()
    if (this.musicGain && ctx) this.musicGain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.1)
    return new Promise((resolve) => {
      const audio = new Audio(url)
      this.voiceSource = audio
      const done = () => {
        if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.3)
        if (this.voiceSource === audio) this.voiceSource = null
        resolve()
      }
      audio.onended = done
      audio.onerror = done
      void audio.play().catch(done)
    })
  }

  stopVoice() {
    if (this.voiceSource instanceof HTMLAudioElement) {
      this.voiceSource.pause()
      this.voiceSource = null
      if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.2)
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
