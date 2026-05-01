/**
 * Tween - Sistema de interpolación para animaciones suaves
 * 
 * Soporta múltiples funciones de easing para movimientos naturales
 * Usado para movimiento de robots, cámaras, y efectos visuales
 */
import { easeOutElastic, easeInOutCubic, lerp, clamp } from './constants'

export type EasingFunction = (t: number) => number

export const Easings = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
  easeInOutCubic,
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t: number) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  easeInQuint: (t: number) => t * t * t * t * t,
  easeOutQuint: (t: number) => 1 + (--t) * t * t * t * t,
  easeInOutQuint: (t: number) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
  easeOutElastic,
  easeOutBounce: (t: number) => {
    const n1 = 7.5625
    const d1 = 2.75
    
    if (t < 1 / d1) {
      return n1 * t * t
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375
    }
  },
  easeInBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return c3 * t * t * t - c1 * t * t
  },
  easeOutBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  easeInOutBack: (t: number) => {
    const c1 = 1.70158
    const c2 = c1 * 1.525
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2
  },
}

export interface TweenConfig {
  from: number
  to: number
  duration: number
  easing?: EasingFunction
  delay?: number
  yoyo?: boolean
  repeat?: number
  onStart?: () => void
  onUpdate?: (value: number) => void
  onComplete?: () => void
}

export interface Tween2DConfig {
  from: { x: number; y: number }
  to: { x: number; y: number }
  duration: number
  easing?: EasingFunction
  delay?: number
  onStart?: () => void
  onUpdate?: (x: number, y: number) => void
  onComplete?: () => void
}

export interface TweenOptions {
  id?: string
  paused?: boolean
}

/**
 * Clase Tween para animaciones de un valor
 */
export class Tween {
  public id?: string
  public isPlaying: boolean = false
  public isPaused: boolean = false
  public isComplete: boolean = false
  
  private config: TweenConfig
  private elapsedTime: number = 0
  private currentValue: number = 0
  private repeatCount: number = 0
  private isYoyoBack: boolean = false
  private totalDuration: number
  
  constructor(config: TweenConfig, options?: TweenOptions) {
    this.id = options?.id
    this.config = {
      ...config,
      easing: config.easing ?? Easings.easeInOutCubic,
      delay: config.delay ?? 0,
      yoyo: config.yoyo ?? false,
      repeat: config.repeat ?? 0,
    }
    this.isPlaying = !options?.paused
    this.totalDuration = this.config.duration + (this.config.delay || 0)
    this.currentValue = this.config.from
    
    if (this.config.delay) {
      setTimeout(() => {
        this.isPlaying = true
        this.config.onStart?.()
      }, this.config.delay)
    } else {
      this.config.onStart?.()
    }
  }
  
  update(delta: number): boolean {
    if (!this.isPlaying || this.isPaused) return false
    if (this.isComplete) return true
    
    this.elapsedTime += delta
    
    // Durante el delay
    const delay = this.config.delay || 0
    if (this.elapsedTime < delay) {
      return false
    }
    
    const progressTime = Math.min(this.elapsedTime - delay, this.config.duration)
    const progress = progressTime / this.config.duration
    const easedProgress = this.config.easing!(clamp(progress, 0, 1))
    
    // Calcular valor actual
    if (this.isYoyoBack) {
      this.currentValue = lerp(this.config.to, this.config.from, easedProgress)
    } else {
      this.currentValue = lerp(this.config.from, this.config.to, easedProgress)
    }
    
    // Llamar callback de actualización
    this.config.onUpdate?.(this.currentValue)
    
    // Verificar completado
    if (progressTime >= this.config.duration) {
      this.repeatCount++
      
      if (this.config.yoyo) {
        this.isYoyoBack = !this.isYoyoBack
      }
      
      if (this.repeatCount >= (this.config.repeat || 0) + 1) {
        this.isComplete = true
        this.isPlaying = false
        this.config.onComplete?.()
        return true
      } else {
        this.elapsedTime = delay
      }
    }
    
    return false
  }
  
  getValue(): number {
    return this.currentValue
  }
  
  pause(): void {
    this.isPaused = true
  }
  
  resume(): void {
    this.isPaused = false
  }
  
  stop(): void {
    this.isPlaying = false
    this.isComplete = true
  }
  
  seek(progress: number): void {
    const targetTime = progress * this.config.duration
    this.elapsedTime = targetTime + (this.config.delay || 0)
  }
}

/**
 * Clase Tween2D para animaciones de posición (x, y)
 */
export class Tween2D {
  public id?: string
  public isPlaying: boolean = false
  public isPaused: boolean = false
  public isComplete: boolean = false
  
  private config: Tween2DConfig
  private elapsedTime: number = 0
  private currentX: number = 0
  private currentY: number = 0
  
  constructor(config: Tween2DConfig, options?: TweenOptions) {
    this.id = options?.id
    this.config = {
      ...config,
      easing: config.easing ?? Easings.easeInOutCubic,
    }
    this.isPlaying = !options?.paused
    this.currentX = this.config.from.x
    this.currentY = this.config.from.y
    
    this.config.onStart?.()
  }
  
  update(delta: number): boolean {
    if (!this.isPlaying || this.isPaused) return false
    if (this.isComplete) return true
    
    this.elapsedTime += delta
    const progress = clamp(this.elapsedTime / this.config.duration, 0, 1)
    const easedProgress = this.config.easing!(progress)
    
    // Calcular valores actuales
    this.currentX = lerp(this.config.from.x, this.config.to.x, easedProgress)
    this.currentY = lerp(this.config.from.y, this.config.to.y, easedProgress)
    
    // Llamar callback de actualización
    this.config.onUpdate?.(this.currentX, this.currentY)
    
    // Verificar completado
    if (progress >= 1) {
      this.isComplete = true
      this.isPlaying = false
      this.config.onComplete?.()
      return true
    }
    
    return false
  }
  
  getPosition(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY }
  }
  
  pause(): void {
    this.isPaused = true
  }
  
  resume(): void {
    this.isPaused = false
  }
  
  stop(): void {
    this.isPlaying = false
    this.isComplete = true
  }
}

/**
 * Gestor de Tweens
 */
export class TweenManager {
  private tweens: Map<string, Tween | Tween2D> = new Map()
  private tweensArray: (Tween | Tween2D)[] = []
  
  /**
   * Crear un tween de un valor
   */
  createTween(config: TweenConfig, options?: TweenOptions): Tween {
    const tween = new Tween(config, options)
    
    if (options?.id) {
      this.tweens.set(options.id, tween)
    }
    
    this.tweensArray.push(tween)
    
    return tween
  }
  
  /**
   * Crear un tween de posición 2D
   */
  createTween2D(config: Tween2DConfig, options?: TweenOptions): Tween2D {
    const tween = new Tween2D(config, options)
    
    if (options?.id) {
      this.tweens.set(options.id, tween)
    }
    
    this.tweensArray.push(tween)
    
    return tween
  }
  
  /**
   * Actualizar todos los tweens
   */
  update(delta: number): void {
    // Actualizar y remover tweens completados
    for (let i = this.tweensArray.length - 1; i >= 0; i--) {
      const tween = this.tweensArray[i]
      tween.update(delta)
      
      if (tween.isComplete) {
        this.tweensArray.splice(i, 1)
        
        if (tween.id) {
          this.tweens.delete(tween.id)
        }
      }
    }
  }
  
  /**
   * Obtener un tween por ID
   */
  getTween(id: string): Tween | Tween2D | undefined {
    return this.tweens.get(id)
  }
  
  /**
   * Eliminar un tween por ID
   */
  removeTween(id: string): void {
    const tween = this.tweens.get(id)
    if (tween) {
      tween.stop()
      this.tweens.delete(id)
      
      const index = this.tweensArray.indexOf(tween)
      if (index !== -1) {
        this.tweensArray.splice(index, 1)
      }
    }
  }
  
  /**
   * Detener todos los tweens
   */
  stopAll(): void {
    for (const tween of this.tweensArray) {
      tween.stop()
    }
    this.tweensArray = []
    this.tweens.clear()
  }
  
  /**
   * Obtener número de tweens activos
   */
  getActiveCount(): number {
    return this.tweensArray.filter(t => t.isPlaying && !t.isComplete).length
  }
  
  /**
   * Limpiar tweens completados
   */
  cleanup(): void {
    this.tweensArray = this.tweensArray.filter(t => !t.isComplete)
    
    for (const [id, tween] of this.tweens.entries()) {
      if (tween.isComplete) {
        this.tweens.delete(id)
      }
    }
  }
}

// Singleton exportado
export const tweenManager = new TweenManager()
