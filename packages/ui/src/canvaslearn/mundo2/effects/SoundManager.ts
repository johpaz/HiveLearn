/**
 * SoundManager — Gestor de efectos de sonido
 * 
 * Usa Web Audio API para generar sonidos 8-bit / pixel art
 * sin necesidad de archivos externos
 */

import { SONIDOS_CONFIG } from '../constants'

export interface SoundDef {
  freq?: number
  freqEnd?: number
  freqStart?: number
  duracion: number
  tipo: OscillatorType
  notas?: number[]
  volumen?: number
}

/**
 * SoundManager — Genera sonidos con Web Audio API
 */
export class SoundManager {
  /** Contexto de audio */
  private audioContext: AudioContext | null = null
  
  /** Volumen general (0-1) */
  private masterVolume: number = SONIDOS_CONFIG.volumenGeneral
  
  /** Sonidos habilitados */
  private enabled: boolean = SONIDOS_CONFIG.habilitado
  
  /** Pool de osciladores activos */
  private activeOscillators: OscillatorNode[] = []

  constructor() {
    // Inicializar contexto de audio (lazy)
    this.initContext()
  }

  /**
   * Inicializar contexto de audio
   */
  private initContext(): void {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      this.audioContext = new AudioContextClass()
    } catch (error) {
      console.warn('Web Audio API no soportada')
      this.enabled = false
    }
  }

  /**
   * Reproducir sonido
   */
  play(soundDef: SoundDef): void {
    if (!this.enabled || !this.audioContext) return

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    // Configurar oscilador
    oscillator.type = soundDef.tipo
    oscillator.connect(gainNode)
    gainNode.connect(this.audioContext.destination)

    // Configurar volumen
    const volumen = soundDef.volumen ?? this.masterVolume
    gainNode.gain.setValueAtTime(volumen, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + soundDef.duracion)

    // Configurar frecuencia
    const def = soundDef as any
    if (def.notas) {
      // Secuencia de notas
      this.playNotas(def.notas, def.duracion, def.tipo)
      return
    } else if (def.freq !== undefined) {
      oscillator.frequency.setValueAtTime(def.freq, this.audioContext.currentTime)
      
      if (def.freqEnd !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(
          def.freqEnd,
          this.audioContext.currentTime + def.duracion
        )
      }
    } else if (def.freqStart !== undefined && def.freqEnd !== undefined) {
      oscillator.frequency.setValueAtTime(def.freqStart, this.audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(
        def.freqEnd,
        this.audioContext.currentTime + def.duracion
      )
    }

    // Iniciar y detener
    oscillator.start(this.audioContext.currentTime)
    oscillator.stop(this.audioContext.currentTime + soundDef.duracion)

    // Limpiar
    this.activeOscillators.push(oscillator)
    setTimeout(() => {
      const index = this.activeOscillators.indexOf(oscillator)
      if (index > -1) {
        this.activeOscillators.splice(index, 1)
      }
    }, soundDef.duracion * 1000)
  }

  /**
   * Reproducir secuencia de notas
   */
  private playNotas(notas: number[], duracionTotal: number, tipo: OscillatorType): void {
    if (!this.audioContext) return

    const duracionNota = duracionTotal / notas.length

    notas.forEach((nota, index) => {
      const oscillator = this.audioContext!.createOscillator()
      const gainNode = this.audioContext!.createGain()

      oscillator.type = tipo
      oscillator.connect(gainNode)
      gainNode.connect(this.audioContext!.destination)

      const volumen = this.masterVolume / notas.length
      gainNode.gain.setValueAtTime(volumen, this.audioContext!.currentTime + index * duracionNota)
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext!.currentTime + (index + 1) * duracionNota)

      oscillator.frequency.setValueAtTime(nota, this.audioContext!.currentTime + index * duracionNota)

      oscillator.start(this.audioContext!.currentTime + index * duracionNota)
      oscillator.stop(this.audioContext!.currentTime + (index + 1) * duracionNota)
    })
  }

  // ─── Sonidos predefinidos ──────────────────────────────────────────────────

  /**
   * Sonido de salto
   */
  jump(): void {
    this.play(SONIDOS_CONFIG.salto as any)
  }

  /**
   * Sonido de XP ganada
   */
  xp(): void {
    this.play(SONIDOS_CONFIG.xp as any)
  }

  /**
   * Sonido de nivel up
   */
  levelUp(): void {
    this.play(SONIDOS_CONFIG.nivelUp as any)
  }

  /**
   * Sonido de logro desbloqueado
   */
  achievement(): void {
    this.play(SONIDOS_CONFIG.logro as any)
  }

  /**
   * Sonido de daño
   */
  damage(): void {
    this.play(SONIDOS_CONFIG.dano as any)
  }

  /**
   * Sonido de power-up
   */
  powerup(): void {
    this.play(SONIDOS_CONFIG.powerup as any)
  }

  /**
   * Sonido de aterrizaje
   */
  land(): void {
    this.play(SONIDOS_CONFIG.aterrizaje as any)
  }

  /**
   * Sonido de moneda/oro
   */
  coin(): void {
    this.play(SONIDOS_CONFIG.moneda as any)
  }

  // ─── Sonidos personalizados ────────────────────────────────────────────────

  /**
   * Sonido personalizado
   */
  custom(freq: number, duracion: number, tipo: OscillatorType = 'sine'): void {
    this.play({ freq, duracion, tipo })
  }

  /**
   * Sonido de explosión (ruido blanco simulado)
   */
  explosion(): void {
    if (!this.audioContext) return

    const bufferSize = this.audioContext.sampleRate * 0.5 // 0.5 segundos
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate)
    const data = buffer.getChannelData(0)

    // Generar ruido blanco
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const noise = this.audioContext.createBufferSource()
    noise.buffer = buffer

    const gainNode = this.audioContext.createGain()
    gainNode.gain.setValueAtTime(this.masterVolume * 0.5, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5)

    // Filtro lowpass para sonido más grave
    const filter = this.audioContext.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1000

    noise.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(this.audioContext.destination)

    noise.start()
  }

  // ─── Control de volumen ────────────────────────────────────────────────────

  /**
   * Set volumen general
   */
  setVolume(volumen: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volumen))
  }

  /**
   * Obtener volumen general
   */
  getVolume(): number {
    return this.masterVolume
  }

  /**
   * Habilitar sonidos
   */
  enable(): void {
    this.enabled = true
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume()
    }
  }

  /**
   * Deshabilitar sonidos
   */
  disable(): void {
    this.enabled = false
  }

  /**
   * Toggle sonidos
   */
  toggle(): void {
    this.enabled = !this.enabled
  }

  // ─── Utilidades ────────────────────────────────────────────────────────────

  /**
   * Detener todos los sonidos activos
   */
  stopAll(): void {
    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop()
      } catch {
        // Ya detenido
      }
    })
    this.activeOscillators = []
  }

  /**
   * Destruir manager
   */
  destroy(): void {
    this.stopAll()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}

/**
 * Instancia singleton del SoundManager
 */
export const soundManager = new SoundManager()

export default soundManager
