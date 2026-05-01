/**
 * ParticleSystem - Sistema avanzado de partículas con ParticleContainer
 * 
 * Optimizado para renderizar miles de partículas eficientemente
 * Usa pooling de objetos para evitar garbage collection
 */
import { ParticleContainer, Particle, Graphics, Color } from 'pixi.js'
import { PARTICLE_CONFIG, randomRange, randomInt } from './constants'

export type ParticleType = 'spark' | 'steam' | 'trail' | 'confetti' | 'energy' | 'dust' | 'exhaust'

export interface ParticleData {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: number
  alpha: number
  rotation: number
  rotationSpeed: number
  gravity: number
  type: ParticleType
  active: boolean
}

/**
 * Pool de partículas para reutilización
 */
class ParticlePool {
  private pool: ParticleData[] = []
  private maxSize: number

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize
    
    // Pre-crear partículas
    for (let i = 0; i < maxSize; i++) {
      this.pool.push(this.createParticle())
    }
  }

  private createParticle(): ParticleData {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 1,
      color: 0xffffff,
      alpha: 1,
      rotation: 0,
      rotationSpeed: 0,
      gravity: 0,
      type: 'spark',
      active: false,
    }
  }

  get(): ParticleData | null {
    const particle = this.pool.find(p => !p.active)
    if (particle) {
      particle.active = true
      return particle
    }
    return null
  }

  release(particle: ParticleData): void {
    particle.active = false
  }

  getAllActive(): ParticleData[] {
    return this.pool.filter(p => p.active)
  }

  reset(): void {
    this.pool.forEach(p => {
      p.active = false
    })
  }
}

/**
 * Sistema de partículas
 */
export class ParticleSystem {
  private container: ParticleContainer
  private graphics: Graphics
  private pool: ParticlePool
  private particles: ParticleData[] = []
  
  constructor(maxParticles: number = 2000) {
    this.container = new ParticleContainer({
      maxSize: maxParticles,
      properties: {
        position: true,
        scale: true,
        rotation: true,
        alpha: true,
        tint: true,
      },
    })
    
    this.graphics = new Graphics()
    this.pool = new ParticlePool(maxParticles)
  }

  /**
   * Obtener el contenedor para añadir al stage
   */
  getContainer(): ParticleContainer {
    return this.container
  }

  /**
   * Obtener gráficos para debug/rendering custom
   */
  getGraphics(): Graphics {
    return this.graphics
  }

  /**
   * Emitir partículas
   */
  emit(
    x: number,
    y: number,
    type: ParticleType,
    count?: number,
    options?: {
      vx?: [number, number]
      vy?: [number, number]
      size?: [number, number]
      life?: [number, number]
      colors?: number[]
      gravity?: number
      spread?: number
    }
  ): void {
    const config = (PARTICLE_CONFIG as any)[type]
    if (!config) return

    const particleCount = count ?? config.count
    
    for (let i = 0; i < particleCount; i++) {
      const particle = this.pool.get()
      if (!particle) continue

      // Posición
      particle.x = x
      particle.y = y

      // Velocidad
      const spread = options?.spread ?? Math.PI * 2
      const baseAngle = Math.random() * spread
      const speedRange = config.speed || [50, 150]
      const speed = randomRange(speedRange[0], speedRange[1])
      
      if (options?.vx && options?.vy) {
        particle.vx = randomRange(options.vx[0], options.vx[1])
        particle.vy = randomRange(options.vy[0], options.vy[1])
      } else {
        particle.vx = Math.cos(baseAngle) * speed
        particle.vy = Math.sin(baseAngle) * speed
      }

      // Tamaño
      const sizeRange = options?.size ?? config.size
      particle.size = randomRange(sizeRange[0], sizeRange[1])

      // Vida
      const lifeRange = options?.life ?? config.life
      particle.life = 0
      particle.maxLife = randomRange(lifeRange[0], lifeRange[1])

      // Color
      const colors = options?.colors ?? (config.colors || [config.color])
      particle.color = colors[randomInt(0, colors.length - 1)]

      // Alpha inicial
      particle.alpha = 1

      // Rotación
      particle.rotation = Math.random() * Math.PI * 2
      particle.rotationSpeed = randomRange(-2, 2)

      // Gravedad
      particle.gravity = options?.gravity ?? (config.gravity || 50)

      particle.type = type
      this.particles.push(particle)
    }
  }

  /**
   * Emitir chispas (para herramientas trabajando)
   */
  emitSparks(x: number, y: number, count?: number): void {
    this.emit(x, y, 'spark', count)
  }

  /**
   * Emitir vapor (para robots cansados/fallando)
   */
  emitSteam(x: number, y: number, count?: number): void {
    this.emit(x, y, 'steam', count, {
      vy: [-50, -20],
      vx: [-20, 20],
    })
  }

  /**
   * Emitir estela de movimiento
   */
  emitTrail(x: number, y: number, color: number, count?: number): void {
    this.emit(x, y, 'trail', count, {
      colors: [color],
      vx: [-30, 30],
      vy: [-30, 30],
    })
  }

  /**
   * Emitir confeti (celebración)
   */
  emitConfetti(x: number, y: number, count?: number): void {
    this.emit(x, y, 'confetti', count, {
      gravity: 100,
      vx: [-100, 100],
      vy: [-200, -100],
      spread: Math.PI,
    })
  }

  /**
   * Emitir energía (delegación)
   */
  emitEnergy(x: number, y: number, targetX: number, targetY: number, count?: number): void {
    const angle = Math.atan2(targetY - y, targetX - x)
    const speed = randomRange(200, 400)
    
    this.emit(x, y, 'energy', count, {
      vx: [Math.cos(angle) * speed * 0.8, Math.cos(angle) * speed * 1.2],
      vy: [Math.sin(angle) * speed * 0.8, Math.sin(angle) * speed * 1.2],
      spread: 0.3,
    })
  }

  /**
   * Emitir polvo ambiental (decorativo)
   */
  emitDust(x: number, y: number, count?: number): void {
    this.emit(x, y, 'dust', count, {
      vx: [-5, 5],
      vy: [-5, 5],
      life: [10, 20],
    })
  }

  /**
   * Emitir exhaust de ruedas (movimiento)
   */
  emitExhaust(x: number, y: number, color: number, count?: number): void {
    this.emit(x, y, 'exhaust', count, {
      colors: [color],
      vx: [-20, 20],
      vy: [20, 50],
      size: [2, 5],
      life: [0.3, 0.6],
    })
  }

  /**
   * Actualizar partículas
   */
  update(delta: number): void {
    const dt = delta / 1000

    // Actualizar lógica de partículas
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      
      if (!p.active) {
        this.particles.splice(i, 1)
        this.pool.release(p)
        continue
      }

      // Actualizar vida
      p.life += dt

      if (p.life >= p.maxLife) {
        p.active = false
        this.particles.splice(i, 1)
        this.pool.release(p)
        continue
      }

      // Actualizar posición
      p.x += p.vx * dt
      p.y += p.vy * dt

      // Actualizar velocidad con gravedad
      p.vy += p.gravity * dt

      // Actualizar rotación
      p.rotation += p.rotationSpeed * dt

      // Actualizar alpha (fade out al final de la vida)
      const lifePercent = p.life / p.maxLife
      if (lifePercent > 0.7) {
        p.alpha = 1 - (lifePercent - 0.7) / 0.3
      }

      // Actualizar tamaño (algunas partículas crecen)
      if (p.type === 'steam' || p.type === 'dust') {
        p.size *= 1 + dt * 0.5
      }
    }

    // Renderizar partículas
    this.render()
  }

  /**
   * Renderizar partículas en el graphics
   */
  private render(): void {
    this.graphics.clear()

    const activeParticles = this.particles.filter(p => p.active)
    
    // Batch render por color para eficiencia
    const colorGroups = new Map<number, ParticleData[]>()
    
    for (const p of activeParticles) {
      if (!colorGroups.has(p.color)) {
        colorGroups.set(p.color, [])
      }
      colorGroups.get(p.color)!.push(p)
    }

    // Dibujar cada grupo de color
    for (const [color, particles] of colorGroups.entries()) {
      for (const p of particles) {
        if (p.alpha <= 0) continue

        switch (p.type) {
          case 'spark':
            this.graphics.circle(p.x, p.y, p.size)
            break
          case 'steam':
          case 'dust':
            this.graphics.circle(p.x, p.y, p.size)
            break
          case 'trail':
            this.graphics.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
            break
          case 'confetti':
            this.graphics.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 1.5)
            break
          case 'energy':
            this.graphics.circle(p.x, p.y, p.size)
            break
          case 'exhaust':
            this.graphics.circle(p.x, p.y, p.size)
            break
        }
      }
      
      // Convertir color de número a Color
      const colorObj = new Color(color)
      this.graphics.fill({ color: colorObj.toArray() })
    }
  }

  /**
   * Limpiar todas las partículas
   */
  clear(): void {
    this.particles = []
    this.pool.reset()
    this.graphics.clear()
  }

  /**
   * Obtener número de partículas activas
   */
  getActiveCount(): number {
    return this.particles.filter(p => p.active).length
  }

  /**
   * Crear explosión en posición
   */
  explode(x: number, y: number, color: number, count?: number): void {
    this.emit(x, y, 'spark', count, {
      colors: [color],
      spread: Math.PI * 2,
      vx: [-200, 200],
      vy: [-200, 200],
    })
  }

  /**
   * Crear fuente de partículas continua
   */
  fountain(
    x: number,
    y: number,
    type: ParticleType,
    duration: number,
    particlesPerSecond: number = 50
  ): void {
    const totalParticles = Math.floor(duration * particlesPerSecond)
    const interval = 1000 / particlesPerSecond
    
    let emitted = 0
    
    const emitLoop = () => {
      if (emitted >= totalParticles) return
      
      this.emit(x, y, type, Math.floor(particlesPerSecond / 10))
      emitted += particlesPerSecond / 10
      
      setTimeout(emitLoop, interval)
    }
    
    emitLoop()
  }

  /**
   * Destruir el sistema de partículas
   */
  destroy(): void {
    this.clear()
    this.container.destroy({ children: true })
    this.graphics.destroy()
  }
}

// Singleton exportado
export const particleSystem = new ParticleSystem()
