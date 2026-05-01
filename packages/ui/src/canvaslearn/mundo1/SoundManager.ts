/**
 * SoundManager - Sistema de audio sintetizado con Web Audio API
 * 
 * Genera sonidos proceduralmente sin archivos externos
 * Perfecto para robots: beeps, boops, sonidos electrónicos
 */
import { SOUND_CONFIG } from './constants'

export interface SoundDef {
  freq?: number
  freqStart?: number
  freqEnd?: number
  notes?: number[]
  duration: number
  type: OscillatorType
}

/**
 * Gestor de sonidos sintetizados
 */
export class SoundManager {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private muted = false
  private volume = SOUND_CONFIG.masterVolume
  private initialized = false
  
  /**
   * Inicializar el contexto de audio
   * Debe llamarse después de una interacción del usuario
   */
  init(): void {
    if (this.initialized) return
    
    try {
      // Crear contexto de audio
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new AudioContextClass()
      
      // Crear gain master
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.value = this.volume
      this.masterGain.connect(this.ctx.destination)
      
      this.initialized = true
      this.muted = false
    } catch (error) {
      console.warn('Web Audio API no soportada:', error)
      this.muted = true
    }
  }
  
  /**
   * Reproducir un sonido por nombre
   */
  play(soundName: keyof typeof SOUND_CONFIG.sounds): void {
    if (!this.initialized) {
      // Intentar inicializar (puede fallar si no hay interacción)
      this.init()
    }
    
    if (this.muted || !this.ctx || !this.masterGain) return
    
    const soundDef = SOUND_CONFIG.sounds[soundName]
    if (!soundDef) {
      console.warn(`Sonido "${soundName}" no encontrado`)
      return
    }
    
    switch (soundName) {
      case 'hover':
        this.playTone(soundDef.freq!, soundDef.duration, soundDef.type)
        break
        
      case 'click':
        this.playSlide(
          soundDef.freq!,
          soundDef.freqEnd!,
          soundDef.duration,
          soundDef.type
        )
        break
        
      case 'delegateCharge':
        this.playSlide(
          soundDef.freqStart!,
          soundDef.freqEnd!,
          soundDef.duration,
          soundDef.type
        )
        break
        
      case 'delegateFire':
        this.playTone(soundDef.freq!, soundDef.duration, soundDef.type)
        this.playNoise(soundDef.duration * 0.5)
        break
        
      case 'delegateHit':
        this.playSlide(
          soundDef.freqStart!,
          soundDef.freqEnd!,
          soundDef.duration,
          soundDef.type
        )
        break
        
      case 'robotActivate':
        this.playSlide(
          soundDef.freqStart!,
          soundDef.freqEnd!,
          soundDef.duration,
          soundDef.type
        )
        break
        
      case 'robotMove':
        this.playFilteredNoise(soundDef.duration, soundDef.freq!)
        break
        
      case 'robotComplete':
        this.playArpeggio(soundDef.notes!, soundDef.duration, soundDef.type)
        break
        
      case 'robotFail':
        this.playSlide(
          soundDef.freqStart!,
          soundDef.freqEnd!,
          soundDef.duration,
          soundDef.type
        )
        break
        
      case 'levelUp':
        this.playArpeggio(soundDef.notes!, soundDef.duration, soundDef.type)
        break
        
      case 'achievement':
        this.playChord(soundDef.notes!, soundDef.duration, soundDef.type)
        break
    }
  }
  
  /**
   * Reproducir un tono simple
   */
  private playTone(freq: number, duration: number, type: OscillatorType): void {
    if (!this.ctx || !this.masterGain) return
    
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    
    osc.type = type
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime)
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)
    
    osc.connect(gain)
    gain.connect(this.masterGain)
    
    osc.start()
    osc.stop(this.ctx.currentTime + duration)
  }
  
  /**
   * Reproducir slide de frecuencia (glissando)
   */
  private playSlide(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType
  ): void {
    if (!this.ctx || !this.masterGain) return
    
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    
    osc.type = type
    osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration)
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)
    
    osc.connect(gain)
    gain.connect(this.masterGain)
    
    osc.start()
    osc.stop(this.ctx.currentTime + duration)
  }
  
  /**
   * Reproducir arpegio (notas secuenciales)
   */
  private playArpeggio(notes: number[], totalDuration: number, type: OscillatorType): void {
    const noteDuration = totalDuration / notes.length
    
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, noteDuration * 0.8, type)
      }, index * noteDuration * 1000)
    })
  }
  
  /**
   * Reproducir acorde (notas simultáneas)
   */
  private playChord(notes: number[], duration: number, type: OscillatorType): void {
    if (!this.ctx || !this.masterGain) return
    
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      
      osc.type = type
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime)
      
      const noteGain = 0.3 / notes.length
      gain.gain.setValueAtTime(noteGain, this.ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)
      
      osc.connect(gain)
      gain.connect(this.masterGain)
      
      osc.start()
      osc.stop(this.ctx.currentTime + duration)
    })
  }
  
  /**
   * Reproducir ruido blanco (para efectos mecánicos)
   */
  private playNoise(duration: number): void {
    if (!this.ctx || !this.masterGain) return
    
    const bufferSize = this.ctx.sampleRate * duration
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    
    // Llenar con ruido blanco
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }
    
    const noise = this.ctx.createBufferSource()
    noise.buffer = buffer
    
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)
    
    noise.connect(gain)
    gain.connect(this.masterGain)
    
    noise.start()
  }
  
  /**
   * Reproducir ruido filtrado (para motores/ruedas)
   */
  private playFilteredNoise(duration: number, cutoffFreq: number): void {
    if (!this.ctx || !this.masterGain) return
    
    const bufferSize = this.ctx.sampleRate * duration
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }
    
    const noise = this.ctx.createBufferSource()
    noise.buffer = buffer
    
    // Filtro paso bajo
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoffFreq
    
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)
    
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain)
    
    noise.start()
  }
  
  /**
   * Activar/desactivar sonido
   */
  setMuted(muted: boolean): void {
    this.muted = muted
    
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        muted ? 0 : this.volume,
        this.ctx?.currentTime || 0
      )
    }
  }
  
  /**
   * Obtener estado mute
   */
  isMuted(): boolean {
    return this.muted
  }
  
  /**
   * Cambiar volumen
   */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol))
    
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx?.currentTime || 0)
    }
  }
  
  /**
   * Obtener volumen actual
   */
  getVolume(): number {
    return this.volume
  }
  
  /**
   * Verificar si está inicializado
   */
  isInitialized(): boolean {
    return this.initialized && !this.muted
  }
  
  /**
   * Destruir el gestor de audio
   */
  destroy(): void {
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
      this.masterGain = null
      this.initialized = false
    }
  }
}

// Singleton exportado
export const soundManager = new SoundManager()
