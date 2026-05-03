import { Application, Container, Graphics } from 'pixi.js'
import type { IsometricRenderer } from '../renderer/IsometricRenderer'
import type { IsoMap, Tributary } from '../types'
import { ISO_CONFIG } from '../types'

interface WaterParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  alpha: number
  color: number
}

interface Splash {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
  createdAt: number
  duration: number
}

export class RioWaterSystem {
  private app: Application
  private renderer: IsometricRenderer
  private container: Container
  private particles: WaterParticle[] = []
  private splashes: Splash[] = []
  private maxParticles: number = 300
  private map: IsoMap | null = null
  private time: number = 0

  constructor(app: Application, renderer: IsometricRenderer) {
    this.app = app
    this.renderer = renderer
    this.container = new Container()
    this.container.zIndex = 500
    renderer.getEntityContainer().addChild(this.container)
  }

  setMap(map: IsoMap) {
    this.map = map
  }

  spawnRiverParticles(count: number = 5) {
    if (!this.map) return

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break

      // Pick a random point along the river path
      const pathIdx = Math.floor(Math.random() * this.map.riverPath.length)
      const point = this.map.riverPath[pathIdx]

      // Flow direction: river flows from top to bottom (south)
      const particle: WaterParticle = {
        x: point.x + (Math.random() - 0.5) * 3,
        y: point.y,
        vx: (Math.random() - 0.5) * 0.02,
        vy: 0.05 + Math.random() * 0.03, // Flow south
        life: 0,
        maxLife: 3000 + Math.random() * 2000,
        size: 1 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.4,
        color: Math.random() < 0.7 ? 0x90CAF9 : (Math.random() < 0.5 ? 0xBBDEFB : 0x64B5F6),
      }
      this.particles.push(particle)
    }
  }

  spawnTributaryParticles(tributary: Tributary, count: number = 3) {
    if (tributary.estado === 'seco') return

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break

      const pathIdx = Math.floor(Math.random() * tributary.path.length)
      const point = tributary.path[pathIdx]

      // Flow from branch point outward
      const dx = point.x - tributary.branchPoint.x
      const dy = point.y - tributary.branchPoint.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1

      const particle: WaterParticle = {
        x: point.x + (Math.random() - 0.5) * 2,
        y: point.y + (Math.random() - 0.5),
        vx: -(dx / dist) * 0.03,
        vy: -(dy / dist) * 0.03,
        life: 0,
        maxLife: 2000 + Math.random() * 1500,
        size: 1 + Math.random() * 1.5,
        alpha: 0.3 + Math.random() * 0.3,
        color: tributary.estado === 'completado' ? 0x66BB6A : 0x90CAF9,
      }
      this.particles.push(particle)
    }
  }

  spawnSplash(isoX: number, isoY: number) {
    this.splashes.push({
      x: isoX,
      y: isoY,
      radius: 0,
      maxRadius: 3 + Math.random() * 2,
      alpha: 0.6,
      createdAt: Date.now(),
      duration: 600 + Math.random() * 400,
    })
  }

  update(dt: number, time: number) {
    this.time = time

    // Spawn new particles
    this.spawnRiverParticles(3)

    if (this.map) {
      for (const trib of this.map.tributaries) {
        if (trib.estado === 'fluyendo' || trib.estado === 'completado') {
          this.spawnTributaryParticles(trib, 2)
        }
      }
    }

    // Update particles
    const dtMs = dt * 1000 / 60
    this.container.removeChildren()

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life += dtMs
      p.x += p.vx * dt * 60
      p.y += p.vy * dt * 60

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1)
        continue
      }

      const lifeRatio = p.life / p.maxLife
      const alpha = p.alpha * (1 - lifeRatio * 0.5)

      const screen = this.renderer.isoToScreen(p.x, p.y)
      const g = new Graphics()
      g.circle(screen.x, screen.y, p.size)
      g.fill({ color: p.color, alpha })
      this.container.addChild(g)
    }

    // Update splashes
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i]
      const elapsed = Date.now() - s.createdAt

      if (elapsed >= s.duration) {
        this.splashes.splice(i, 1)
        continue
      }

      const progress = elapsed / s.duration
      s.radius = s.maxRadius * progress
      s.alpha = 0.6 * (1 - progress)

      const screen = this.renderer.isoToScreen(s.x, s.y)
      const g = new Graphics()
      g.circle(screen.x, screen.y, s.radius * (ISO_CONFIG.TILE_WIDTH / 2))
      g.stroke({ width: 1, color: 0x90CAF9, alpha: s.alpha })
      this.container.addChild(g)
    }

    // Depth sort
    this.container.sortChildren()
  }

  destroy() {
    this.particles = []
    this.splashes = []
    this.container.destroy({ children: true })
  }
}