/**
 * WorldCamera — Cámara con scroll horizontal suave
 * 
 * Sigue al jugador con interpolación suave y límites del mundo
 */

import type { Container } from 'pixi.js'
import { CAMARA_CONFIG, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, lerp, clamp } from '../constants'
import type { Player } from '../player/Player'

export interface WorldCameraOptions {
  /** Suavizado del seguimiento (0-1) */
  suavizado?: number
  
  /** Límite izquierdo */
  limiteIzquierdo?: number
  
  /** Límite derecho */
  limiteDerecho?: number
}

/**
 * WorldCamera — Cámara que sigue al jugador
 */
export class WorldCamera {
  /** Posición X actual */
  public x: number = 0
  
  /** Posición Y actual */
  public y: number = 0
  
  /** Zoom actual */
  public zoom: number = 1
  
  /** Objetivo X */
  public objetivoX: number = 0
  
  /** Objetivo Y */
  public objetivoY: number = 0
  
  /** Está siguiendo al jugador */
  public siguiendoJugador: boolean = true
  
  /** Jugador objetivo */
  private player: Player
  
  /** Contenedor del mundo (stage) */
  private stage: Container
  
  /** Configuración */
  private config: Required<WorldCameraOptions>

  constructor(stage: Container, player: Player, options?: WorldCameraOptions) {
    this.stage = stage
    this.player = player
    
    this.config = {
      suavizado: options?.suavizado ?? CAMARA_CONFIG.suavizado,
      limiteIzquierdo: options?.limiteIzquierdo ?? CAMARA_CONFIG.limiteIzquierdo,
      limiteDerecho: options?.limiteDerecho ?? CAMARA_CONFIG.limiteDerecho,
    }
    
    // Posición inicial
    this.x = 0
    this.y = 0
    this.zoom = CAMARA_CONFIG.zoomDefault
  }

  /**
   * Actualizar cámara
   */
  update(dt: number): void {
    if (!this.siguiendoJugador) return
    
    // Calcular objetivo basado en el jugador
    const jugadorCentroX = this.player.x + this.player.width / 2
    const jugadorCentroY = this.player.y + this.player.height / 2
    
    // Deadzone: la cámara solo se mueve si el jugador está cerca del borde
    const deadzoneWidth = VIEWPORT_WIDTH * CAMARA_CONFIG.deadzoneX
    const deadzoneHeight = VIEWPORT_HEIGHT * CAMARA_CONFIG.deadzoneY
    
    const viewportLeft = this.x + deadzoneWidth
    const viewportRight = this.x + VIEWPORT_WIDTH - deadzoneWidth
    const viewportTop = this.y + deadzoneHeight
    const viewportBottom = this.y + VIEWPORT_HEIGHT - deadzoneHeight
    
    // Calcular nuevo objetivo X
    if (jugadorCentroX < viewportLeft) {
      this.objetivoX = jugadorCentroX - deadzoneWidth
    } else if (jugadorCentroX > viewportRight) {
      this.objetivoX = jugadorCentroX - (VIEWPORT_WIDTH - deadzoneWidth)
    }
    
    // Calcular nuevo objetivo Y (menos importante en plataformer horizontal)
    if (jugadorCentroY < viewportTop) {
      this.objetivoY = jugadorCentroY - deadzoneHeight
    } else if (jugadorCentroY > viewportBottom) {
      this.objetivoY = jugadorCentroY - (VIEWPORT_HEIGHT - deadzoneHeight)
    }
    
    // Clamp a los límites del mundo
    this.objetivoX = clamp(this.objetivoX, this.config.limiteIzquierdo, this.config.limiteDerecho)
    this.objetivoY = clamp(this.objetivoY, -100, 200) // Rango Y limitado
    
    // Interpolación suave hacia el objetivo
    this.x = lerp(this.x, this.objetivoX, this.config.suavizado)
    this.y = lerp(this.y, this.objetivoY, this.config.suavizado)
    
    // Aplicar transformación al stage
    this.stage.x = -this.x
    this.stage.y = -this.y
    this.stage.scale.set(this.zoom)
  }

  /**
   * Mover cámara a posición específica
   */
  moveTo(x: number, y: number, duracion?: number): void {
    this.siguiendoJugador = false
    this.objetivoX = clamp(x, this.config.limiteIzquierdo, this.config.limiteDerecho)
    this.objetivoY = clamp(y, -100, 200)
    
    if (duracion) {
      // Animación suave (implementar con tween)
      const startX = this.x
      const startY = this.y
      const startTime = Date.now()
      
      const animate = () => {
        const elapsed = Date.now() - startTime
        const t = Math.min(elapsed / duracion, 1)
        const easeT = this.easeOutCubic(t)
        
        this.x = lerp(startX, this.objetivoX, easeT)
        this.y = lerp(startY, this.objetivoY, easeT)
        
        if (t < 1) {
          requestAnimationFrame(animate)
        } else {
          this.siguiendoJugador = true
        }
      }
      
      animate()
    } else {
      this.x = this.objetivoX
      this.y = this.objetivoY
      this.siguiendoJugador = true
    }
  }

  /**
   * Seguir jugador
   */
  followPlayer(): void {
    this.siguiendoJugador = true
  }

  /**
   * Dejar de seguir jugador
   */
  stopFollowing(): void {
    this.siguiendoJugador = false
  }

  /**
   * Set zoom
   */
  setZoom(zoom: number, duracion?: number): void {
    const startZoom = this.zoom
    const targetZoom = clamp(zoom, CAMARA_CONFIG.zoomMin, CAMARA_CONFIG.zoomMax)
    
    if (duracion) {
      const startTime = Date.now()
      
      const animate = () => {
        const elapsed = Date.now() - startTime
        const t = Math.min(elapsed / duracion, 1)
        const easeT = this.easeOutCubic(t)
        
        this.zoom = lerp(startZoom, targetZoom, easeT)
        
        if (t < 1) {
          requestAnimationFrame(animate)
        }
      }
      
      animate()
    } else {
      this.zoom = targetZoom
    }
  }

  /**
   * Zoom in
   */
  zoomIn(duracion?: number): void {
    this.setZoom(this.zoom + 0.1, duracion)
  }

  /**
   * Zoom out
   */
  zoomOut(duracion?: number): void {
    this.setZoom(this.zoom - 0.1, duracion)
  }

  /**
   * Reset zoom
   */
  resetZoom(duracion?: number): void {
    this.setZoom(CAMARA_CONFIG.zoomDefault, duracion)
  }

  /**
   * Easing ease-out-cubic
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  /**
   * Obtener bounds visibles
   */
  getVisibleBounds(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.x,
      y: this.y,
      width: VIEWPORT_WIDTH / this.zoom,
      height: VIEWPORT_HEIGHT / this.zoom,
    }
  }

  /**
   * Chequear si punto está visible
   */
  pointIsVisible(x: number, y: number): boolean {
    const bounds = this.getVisibleBounds()
    return x >= bounds.x && x <= bounds.x + bounds.width &&
           y >= bounds.y && y <= bounds.y + bounds.height
  }
}
