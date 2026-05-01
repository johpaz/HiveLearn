/**
 * SurpriseEvents — Eventos sorpresa aleatorios en el mundo
 * 
 * Genera eventos aleatorios para hacer el mundo más dinámico:
 * - Nubes de puntos bonus
 * - Power-ups temporales
 * - Agentes sorpresa que dan XP extra
 * - Coleccionables secretos
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { COLORS, WORLD_WIDTH, WORLD_HEIGHT, randomRange, randomInt } from '../constants'
import type { Sorpresa, SorpresaTipo } from '../types'

export interface SurpriseEventsOptions {
  /** Probabilidad de evento sorpresa por minuto (0-1) */
  probabilidad?: number
  
  /** Tiempo mínimo entre eventos (segundos) */
  minInterval?: number
  
  /** Tiempo máximo entre eventos (segundos) */
  maxInterval?: number
}

/**
 * SurpriseEventManager — Gestiona eventos sorpresa
 */
export class SurpriseEventManager extends Container {
  /** Sorpresas activas */
  private sorpresas: Sorpresa[] = []
  
  /** Contenedor de sprites de sorpresas */
  private spritesContainer: Container
  
  /** Timer para próximo evento */
  private nextEventTimer: number = 0
  
  /** Intervalo hasta próximo evento (segundos) */
  private nextEventInterval: number = 60
  
  /** Probabilidad de evento por minuto */
  private probabilidad: number = 0.3
  
  /** Callback cuando se activa una sorpresa */
  public onSorpresaActivada?: (sorpresa: Sorpresa) => void
  
  /** Callback cuando se recoge una sorpresa */
  public onSorpresaRecogida?: (sorpresa: Sorpresa) => void

  constructor(options?: SurpriseEventsOptions) {
    super()
    
    this.spritesContainer = new Container()
    this.addChild(this.spritesContainer)
    
    if (options) {
      this.probabilidad = options.probabilidad ?? this.probabilidad
      this.nextEventInterval = randomRange(
        options.minInterval ?? 30,
        options.maxInterval ?? 120
      )
    }
  }

  /**
   * Actualizar eventos sorpresa
   */
  update(dt: number): void {
    // Actualizar timer para próximo evento
    this.nextEventTimer += dt
    
    // Intentar generar evento sorpresa
    if (this.nextEventTimer >= this.nextEventInterval) {
      this.nextEventTimer = 0
      this.nextEventInterval = randomRange(30, 120)
      
      // Probabilidad de generar evento
      if (Math.random() < this.probabilidad * (dt / 60)) {
        this.generarSorpresa()
      }
    }
    
    // Actualizar sprites de sorpresas
    this.actualizarSprites()
  }

  /**
   * Generar sorpresa aleatoria
   */
  private generarSorpresa(): void {
    // Tipo de sorpresa
    const tipos: SorpresaTipo[] = ['xp_bonus', 'powerup_gratis', 'vida_extra', 'logro_secreto']
    const tipo = tipos[randomInt(0, tipos.length - 1)]
    
    // Posición aleatoria en el mundo
    const x = randomRange(200, WORLD_WIDTH - 200)
    const y = randomRange(100, WORLD_HEIGHT - 300)
    
    // Crear sorpresa
    const sorpresa: Sorpresa = {
      tipo,
      x,
      y,
      activo: true,
      duracion: 10000, // 10 segundos para recoger
      animacionOffset: Math.random() * Math.PI * 2,
    }
    
    // Crear sprite
    sorpresa.sprite = this.crearSpriteSorpresa(tipo, x, y)
    this.spritesContainer.addChild(sorpresa.sprite)
    
    this.sorpresas.push(sorpresa)
    
    console.log('[SurpriseEvents] Sorpresa generada:', tipo, 'en', x, y)
  }

  /**
   * Crear sprite de sorpresa
   */
  private crearSpriteSorpresa(tipo: SorpresaTipo, x: number, y: number): Container {
    const container = new Container()
    
    // Ícono según tipo
    const iconos: Record<SorpresaTipo, string> = {
      'xp_bonus': '⭐',
      'powerup_gratis': '⚡',
      'vida_extra': '❤️',
      'logro_secreto': '🏆',
    }
    
    // Círculo de fondo
    const bg = new Graphics()
    bg.circle(0, 0, 25)
    bg.fill({ color: this.getColorPorTipo(tipo), alpha: 0.3 })
    bg.stroke({ color: this.getColorPorTipo(tipo), width: 2 })
    container.addChild(bg)
    
    // Ícono
    const icono = new Text({
      text: iconos[tipo],
      style: new TextStyle({
        fontSize: 24,
      }),
      anchor: { x: 0.5, y: 0.5 },
    })
    container.addChild(icono)
    
    // Posición
    container.x = x
    container.y = y
    
    return container
  }

  /**
   * Obtener color por tipo
   */
  private getColorPorTipo(tipo: SorpresaTipo): number {
    const colores: Record<SorpresaTipo, number> = {
      'xp_bonus': COLORS.xp,
      'powerup_gratis': COLORS.magia,
      'vida_extra': COLORS.vida,
      'logro_secreto': COLORS.acento,
    }
    return colores[tipo]
  }

  /**
   * Actualizar sprites de sorpresas
   */
  private actualizarSprites(): void {
    const tiempo = Date.now() / 1000
    
    for (let i = this.sorpresas.length - 1; i >= 0; i--) {
      const sorpresa = this.sorpresas[i]
      
      if (!sorpresa.activo || !sorpresa.sprite) {
        this.removerSorpresa(i)
        continue
      }
      
      // Animación de flotación
      sorpresa.sprite.y = sorpresa.y + Math.sin(tiempo * 2 + sorpresa.animacionOffset) * 5
      sorpresa.sprite.rotation = Math.sin(tiempo * 1.5) * 0.1
      
      // Decrecer duración
      if (sorpresa.duracion !== undefined) {
        sorpresa.duracion -= 16 // ~60fps
        if (sorpresa.duracion <= 0) {
          this.removerSorpresa(i)
        }
      }
    }
  }

  /**
   * Remover sorpresa
   */
  private removerSorpresa(index: number): void {
    const sorpresa = this.sorpresas[index]
    
    if (sorpresa.sprite && sorpresa.sprite.parent) {
      this.spritesContainer.removeChild(sorpresa.sprite)
    }
    
    this.sorpresas.splice(index, 1)
  }

  /**
   * Recoger sorpresa
   */
  recogerSorpresa(index: number): void {
    const sorpresa = this.sorpresas[index]
    
    if (!sorpresa) return
    
    // Efecto visual de recogida
    this.crearEfectoRecogida(sorpresa)
    
    // Notificar
    this.onSorpresaRecogida?.(sorpresa)
    
    // Remover
    this.removerSorpresa(index)
  }

  /**
   * Crear efecto visual de recogida
   */
  private crearEfectoRecogida(sorpresa: Sorpresa): void {
    if (!sorpresa.sprite) return
    
    // Animación de escala hacia arriba
    const sprite = sorpresa.sprite
    const startTime = Date.now()
    const duracion = 300
    
    const animar = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duracion, 1)
      
      sprite.scale.set(1 + t * 0.5)
      sprite.alpha = 1 - t
      
      if (t < 1) {
        requestAnimationFrame(animar)
      }
    }
    
    animar()
  }

  /**
   * Chequear colisión con jugador
   */
  chequearColision(jugadorX: number, jugadorY: number, jugadorAncho: number, jugadorAlto: number): number {
    for (let i = 0; i < this.sorpresas.length; i++) {
      const sorpresa = this.sorpresas[i]
      
      const dx = sorpresa.x - jugadorX - jugadorAncho / 2
      const dy = sorpresa.y - jugadorY - jugadorAlto / 2
      const distancia = Math.sqrt(dx * dx + dy * dy)
      
      if (distancia < 40) { // Radio de recogida
        return i
      }
    }
    
    return -1
  }

  /**
   * Limpiar todas las sorpresas
   */
  clear(): void {
    while (this.sorpresas.length > 0) {
      this.removerSorpresa(0)
    }
  }

  /**
   * Destruir manager
   */
  destroy(): void {
    this.clear()
    this.removeChildren()
  }
}

/**
 * Instancia singleton del SurpriseEventManager
 */
export const surpriseEventManager = new SurpriseEventManager({
  probabilidad: 0.5,
  minInterval: 30,
  maxInterval: 90,
})

export default surpriseEventManager
