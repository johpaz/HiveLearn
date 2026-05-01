/**
 * ParticleSystem — Sistema de partículas para efectos visuales
 * 
 * Maneja partículas para XP, nivel up, logros, estelas, etc.
 */

import { Container, Graphics } from 'pixi.js'
import { PARTICULAS_CONFIG, COLORS, randomRange, randomInt } from '../constants'
import type { Particula, ParticulasTipo } from '../types'

interface ParticleGraphics extends Graphics {
  vx: number
  vy: number
  vida: number
  vidaMax: number
  rotacionVelocidad: number
}

/**
 * ParticleSystem — Sistema de partículas
 */
export class ParticleSystem extends Container {
  /** Sistemas de partículas activos */
  private sistemas: Map<string, Particula[]> = new Map()
  
  /** Pool de partículas reutilizables */
  private pool: Graphics[] = []
  
  /** Máximo de partículas activas */
  private maxParticulas: number = PARTICULAS_CONFIG.maxParticulas

  constructor() {
    super()
  }

  /**
   * Emitir partículas
   */
  emitParticles(
    tipo: ParticulasTipo,
    x: number,
    y: number,
    opciones?: {
      cantidad?: number
      direccionX?: number
      direccionY?: number
      radio?: number
    }
  ): void {
    const config = PARTICULAS_CONFIG[tipo]
    if (!config) return
    
    const cantidad = opciones?.cantidad ?? config.cantidad
    const direccionX = opciones?.direccionX ?? 0
    const direccionY = opciones?.direccionY ?? -1
    
    for (let i = 0; i < cantidad; i++) {
      const particula = this.crearParticula(tipo, x, y, config, direccionX, direccionY, opciones?.radio)
      if (particula) {
        this.addChild(particula)
        
        if (!this.sistemas.has(tipo)) {
          this.sistemas.set(tipo, [])
        }
        
        // Mapear a la interfaz Particula de types.ts
        this.sistemas.get(tipo)!.push({
          x: particula.x,
          y: particula.y,
          vx: particula.vx,
          vy: particula.vy,
          vida: particula.vida,
          vidaMax: particula.vidaMax,
          tamanio: 0, // No se usa directamente en el update pero es parte del tipo
          color: 0,
          rotacion: particula.rotation,
          rotacionVelocidad: particula.rotacionVelocidad,
          sprite: particula, // Añadir sprite dinámicamente si es necesario o ignorar si el tipo no lo tiene
        } as any)
      }
    }
  }

  /**
   * Crear partícula individual
   */
  private crearParticula(
    tipo: ParticulasTipo,
    x: number,
    y: number,
    config: any,
    direccionX: number,
    direccionY: number,
    radio?: number
  ): ParticleGraphics | null {
    // Reutilizar del pool o crear nueva
    let particula: ParticleGraphics
    if (this.pool.length > 0) {
      particula = this.pool.pop()! as ParticleGraphics
    } else {
      if (this.children.length >= this.maxParticulas) {
        return null
      }
      particula = new Graphics() as ParticleGraphics
    }
    
    // Tamaño
    const tamanio = randomRange(config.tamanioMin, config.tamanioMax)
    
    // Color
    const colores = config.colores || [config.color]
    const color = colores[randomInt(0, colores.length - 1)]
    
    // Velocidad
    const velocidad = randomRange(config.velocidadMin, config.velocidadMax)
    const anguloBase = Math.atan2(direccionY, direccionX) - Math.PI / 2
    const anguloVariacion = randomRange(-0.5, 0.5)
    const angulo = anguloBase + anguloVariacion
    
    // Vida
    const vida = randomRange(config.vidaMin, config.vidaMax)
    
    // Configurar partícula
    particula.clear()
    particula.circle(0, 0, tamanio)
    particula.fill({ color, alpha: 0.8 })
    
    particula.x = x + (radio ? Math.cos(angulo) * radio : 0)
    particula.y = y + (radio ? Math.sin(angulo) * radio : 0)
    particula.vx = Math.cos(angulo) * velocidad
    particula.vy = Math.sin(angulo) * velocidad
    particula.vida = vida
    particula.vidaMax = vida
    particula.rotation = 0
    particula.rotacionVelocidad = randomRange(-2, 2)
    
    // Propiedades custom para animación
    ;(particula as any).tipo = tipo
    
    return particula
  }

  /**
   * Actualizar sistema de partículas
   */
  update(dt: number): void {
    this.sistemas.forEach((particulas, tipo) => {
      for (let i = particulas.length - 1; i >= 0; i--) {
        const p = particulas[i] as any
        const sprite = p.sprite as ParticleGraphics
        
        if (!sprite || !sprite.parent) {
          particulas.splice(i, 1)
          continue
        }
        
        // Actualizar vida
        p.vida -= dt
        sprite.alpha = (p.vida / p.vidaMax) * 0.8
        
        // Actualizar posición
        sprite.x += p.vx * dt
        sprite.y += p.vy * dt
        
        // Gravedad
        p.vy += 200 * dt
        
        // Rotación
        sprite.rotation += sprite.rotacionVelocidad * dt
        
        // Escala (desvanecimiento)
        const escala = p.vida / p.vidaMax
        sprite.scale.set(escala)
        
        // Eliminar si murió
        if (p.vida <= 0) {
          sprite.clear()
          this.removeChild(sprite)
          this.pool.push(sprite)
          particulas.splice(i, 1)
        }
      }
      
      // Limpiar sistema vacío
      if (particulas.length === 0) {
        this.sistemas.delete(tipo)
      }
    })
  }

  /**
   * Emitir explosión de XP
   */
  xpExplosion(x: number, y: number, cantidad?: number): void {
    this.emitParticles('xp', x, y, {
      cantidad: cantidad ?? 20,
      direccionY: -1,
      radio: 30,
    })
  }

  /**
   * Emitir explosión de nivel up
   */
  levelUpExplosion(x: number, y: number): void {
    this.emitParticles('nivelUp', x, y, {
      cantidad: 100,
      direccionY: -1,
      radio: 50,
    })
    
    // Múltiples oleadas
    setTimeout(() => {
      this.emitParticles('nivelUp', x, y, {
        cantidad: 50,
        direccionY: -1,
        radio: 70,
      })
    }, 200)
    
    setTimeout(() => {
      this.emitParticles('nivelUp', x, y, {
        cantidad: 30,
        direccionY: -1,
        radio: 90,
      })
    }, 400)
  }

  /**
   * Emitir explosión de logro
   */
  achievementExplosion(x: number, y: number): void {
    this.emitParticles('logro', x, y, {
      cantidad: 50,
      direccionY: -1,
      radio: 40,
    })
  }

  /**
   * Emitir estela de jugador
   */
  playerTrail(x: number, y: number, direccion: number): void {
    this.emitParticles('estela', x, y, {
      cantidad: 5,
      direccionX: -direccion,
      direccionY: 0,
    })
  }

  /**
   * Emitir polvo de salto
   */
  jumpDust(x: number, y: number): void {
    this.emitParticles('polvo', x, y, {
      cantidad: 10,
      direccionY: 1,
      radio: 20,
    })
  }

  /**
   * Emitir chispas de power-up
   */
  powerupSparks(x: number, y: number): void {
    this.emitParticles('chispas', x, y, {
      cantidad: 30,
      direccionY: -1,
      radio: 30,
    })
  }

  /**
   * Emitir confeti
   */
  confetti(x: number, y: number, cantidad?: number): void {
    this.emitParticles('confeti', x, y, {
      cantidad: cantidad ?? 100,
      direccionY: -1,
      radio: 100,
    })
  }

  /**
   * Limpiar todas las partículas
   */
  clear(): void {
    this.sistemas.forEach((particulas) => {
      particulas.forEach((p: any) => {
        if (p.sprite && p.sprite.parent) {
          this.removeChild(p.sprite)
          this.pool.push(p.sprite)
        }
      })
    })
    this.sistemas.clear()
  }

  /**
   * Destruir
   */
  destroy(): void {
    this.clear()
    this.pool.forEach((p) => p.destroy())
    this.pool = []
  }
}
