/**
 * DelegationParticles - Sistema de partículas para visualizar flujo de información
 * Muestra la delegación de tareas entre coordinador y agentes
 */
import { Container, Graphics } from 'pixi.js'
import { PARTICLE_CONFIG } from './constants'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: number
  size: number
  alpha: number
}

export type ParticleType = 'delegation' | 'completion' | 'fail'

/**
 * Clase DelegationParticles - Sistema de partículas para efectos visuales
 */
export class DelegationParticles extends Container {
  private particles: Particle[] = []
  private graphics: Graphics

  constructor() {
    super()
    this.graphics = new Graphics()
    this.addChild(this.graphics)
  }

  /**
   * Crear explosión de partículas para delegación
   */
  spawnDelegation(fromX: number, fromY: number, toX: number, toY: number): void {
    const color = PARTICLE_CONFIG.delegationColor
    const count = PARTICLE_CONFIG.particleCount

    // Crear partículas que viajan del coordinador al agente
    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(toY - fromY, toX - fromX)
      const spread = (Math.random() - 0.5) * 0.5 // dispersión
      const speed = PARTICLE_CONFIG.particleSpeed * (0.5 + Math.random() * 0.5)

      this.particles.push({
        x: fromX,
        y: fromY,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        life: 0,
        maxLife: PARTICLE_CONFIG.particleLife,
        color,
        size: 2 + Math.random() * 3,
        alpha: 1,
      })
    }

    // Crear partícula principal que viaja directamente
    this.particles.push({
      x: fromX,
      y: fromY,
      vx: (toX - fromX) * 0.1,
      vy: (toY - fromY) * 0.1,
      life: 0,
      maxLife: 1.0,
      color: 0xffffff,
      size: 6,
      alpha: 1,
    })
  }

  /**
   * Crear explosión de partículas para completación
   */
  spawnCompletion(x: number, y: number): void {
    const color = PARTICLE_CONFIG.completionColor
    const count = PARTICLE_CONFIG.particleCount * 2

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
      const speed = PARTICLE_CONFIG.particleSpeed * (0.3 + Math.random() * 0.7)

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: PARTICLE_CONFIG.particleLife * 1.5,
        color,
        size: 2 + Math.random() * 4,
        alpha: 1,
      })
    }
  }

  /**
   * Crear explosión de partículas para fallo
   */
  spawnFail(x: number, y: number): void {
    const color = PARTICLE_CONFIG.failColor
    const count = PARTICLE_CONFIG.particleCount

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = PARTICLE_CONFIG.particleSpeed * (0.2 + Math.random() * 0.5)

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: PARTICLE_CONFIG.particleLife,
        color,
        size: 2 + Math.random() * 3,
        alpha: 1,
      })
    }
  }

  /**
   * Crear línea de conexión entre dos puntos
   */
  drawConnectionLine(fromX: number, fromY: number, toX: number, toY: number, alpha: number): void {
    this.graphics.moveTo(fromX, fromY)
    this.graphics.lineTo(toX, toY)
    this.graphics.stroke({ color: PARTICLE_CONFIG.delegationColor, width: 2, alpha })
  }

  /**
   * Actualizar y renderizar partículas
   */
  update(delta: number): void {
    const dt = delta / 1000
    this.graphics.clear()

    // Actualizar y dibujar partículas
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life += dt

      // Actualizar posición
      p.x += p.vx * dt
      p.y += p.vy * dt

      // Gravedad suave
      p.vy += 50 * dt

      // Actualizar alpha basado en vida
      p.alpha = 1 - (p.life / p.maxLife)

      // Eliminar partículas muertas
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1)
        continue
      }

      // Dibujar partícula
      this.graphics.circle(p.x, p.y, p.size)
      this.graphics.fill({ color: p.color, alpha: p.alpha })
    }
  }

  /**
   * Limpiar todas las partículas
   */
  clear(): void {
    this.particles = []
    this.graphics.clear()
  }

  /**
   * Obtener número de partículas activas
   */
  getParticleCount(): number {
    return this.particles.length
  }
}

/**
 * Clase ConnectionLines - Líneas de conexión entre agentes
 */
export class ConnectionLines extends Container {
  private graphics: Graphics
  private connections: Array<{
    fromX: number
    fromY: number
    toX: number
    toY: number
    alpha: number
    pulseTimer: number
  }> = []

  constructor() {
    super()
    this.graphics = new Graphics()
    this.addChild(this.graphics)
  }

  /**
   * Añadir conexión entre dos puntos
   */
  addConnection(fromX: number, fromY: number, toX: number, toY: number): void {
    this.connections.push({
      fromX,
      fromY,
      toX,
      toY,
      alpha: 0,
      pulseTimer: 0,
    })
  }

  /**
   * Activar conexión (animación de pulso)
   */
  activateConnection(fromX: number, fromY: number, toX: number, toY: number): void {
    const conn = this.connections.find(
      c => Math.abs(c.fromX - fromX) < 5 && 
           Math.abs(c.fromY - fromY) < 5 && 
           Math.abs(c.toX - toX) < 5 && 
           Math.abs(c.toY - toY) < 5
    )
    
    if (conn) {
      conn.pulseTimer = 1
    }
  }

  /**
   * Actualizar y renderizar conexiones
   */
  update(delta: number): void {
    const dt = delta / 1000
    this.graphics.clear()

    // Dibujar conexiones de fondo
    this.graphics.moveTo(0, 0)
    for (const conn of this.connections) {
      this.graphics.moveTo(conn.fromX, conn.fromY)
      this.graphics.lineTo(conn.toX, conn.toY)
    }
    this.graphics.stroke({ color: 0x2a2a3f, width: 1, alpha: 0.3 })

    // Dibujar conexiones activas con pulso
    for (const conn of this.connections) {
      // Actualizar pulso
      if (conn.pulseTimer > 0) {
        conn.pulseTimer -= dt * 2
        conn.alpha = Math.sin(conn.pulseTimer * Math.PI) * 0.8
      } else {
        conn.alpha = Math.max(0, conn.alpha - dt * 0.5)
      }

      if (conn.alpha > 0.01) {
        // Línea principal
        this.graphics.moveTo(conn.fromX, conn.fromY)
        this.graphics.lineTo(conn.toX, conn.toY)
        this.graphics.stroke({ 
          color: 0xfbbf24, 
          width: 2 + Math.sin(conn.pulseTimer * Math.PI) * 2, 
          alpha: conn.alpha 
        })

        // Partícula viajando
        if (conn.pulseTimer > 0) {
          const progress = 1 - conn.pulseTimer
          const px = conn.fromX + (conn.toX - conn.fromX) * progress
          const py = conn.fromY + (conn.toY - conn.fromY) * progress
          this.graphics.circle(px, py, 4)
          this.graphics.fill({ color: 0xffffff, alpha: conn.alpha })
        }
      }
    }
  }

  /**
   * Limpiar todas las conexiones
   */
  clear(): void {
    this.connections = []
    this.graphics.clear()
  }
}
