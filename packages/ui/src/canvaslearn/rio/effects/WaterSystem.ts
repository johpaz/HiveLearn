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
  private particleGraphics: Graphics
  private splashGraphics: Graphics
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

    // Single pooled Graphics — cleared and redrawn each frame instead of creating new objects
    this.particleGraphics = new Graphics()
    this.splashGraphics = new Graphics()
    this.container.addChild(this.particleGraphics)
    this.container.addChild(this.splashGraphics)

    renderer.getEntityContainer().addChild(this.container)
  }

  setMap(map: IsoMap) {
    this.map = map
  }

  spawnRiverParticles(count: number = 5) {
    if (!this.map) return

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break

      const pathIdx = Math.floor(Math.random() * this.map.riverPath.length)
      const point = this.map.riverPath[pathIdx]

      const particle: WaterParticle = {
        x: point.x + (Math.random() - 0.5) * 3,
        y: point.y,
        vx: (Math.random() - 0.5) * 0.02,
        vy: 0.05 + Math.random() * 0.03,
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

      // Flow from branch point OUTWARD (downstream toward portal)
      const dx = point.x - tributary.branchPoint.x
      const dy = point.y - tributary.branchPoint.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1

      const particle: WaterParticle = {
        x: point.x + (Math.random() - 0.5) * 2,
        y: point.y + (Math.random() - 0.5),
        vx: (dx / dist) * 0.03,   // downstream (was negated → upstream bug)
        vy: (dy / dist) * 0.03,
        life: 0,
        maxLife: 2000 + Math.random() * 1500,
        size: 1 + Math.random() * 1.5,
        alpha: 0.35 + Math.random() * 0.35,
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

    this.spawnRiverParticles(3)

    if (this.map) {
      for (const trib of this.map.tributaries) {
        if (trib.estado === 'fluyendo' || trib.estado === 'completado') {
          this.spawnTributaryParticles(trib, 2)
        }
      }
    }

    const dtMs = dt * 1000 / 60

    // Draw all particles to one persistent Graphics (avoids creating/destroying thousands of GPU objects)
    this.particleGraphics.clear()

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
      this.particleGraphics.circle(screen.x, screen.y, p.size)
      this.particleGraphics.fill({ color: p.color, alpha })
    }

    // Draw splashes to second persistent Graphics
    this.splashGraphics.clear()

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
      this.splashGraphics.circle(screen.x, screen.y, s.radius * (ISO_CONFIG.TILE_WIDTH / 2))
      this.splashGraphics.stroke({ width: 1, color: 0x90CAF9, alpha: s.alpha })
    }
  }

  destroy() {
    this.particles = []
    this.splashes = []
    this.container.destroy({ children: true })
  }
}
