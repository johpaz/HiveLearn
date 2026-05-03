import { Application, Container, Graphics } from 'pixi.js'
import type { IsometricRenderer } from '../renderer/IsometricRenderer'
import type { RioCamera } from '../camera/RioCamera'
import type { RioWaterSystem } from './WaterSystem'
import type { RioPlayer } from '../player/RioPlayer'
import type { RioBee } from '../bee/RioBee'

interface Sparkle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: number
}

export class RioEntryAnimation {
  private app: Application
  private renderer: IsometricRenderer
  private camera: RioCamera
  private container: Container
  private overlay: Graphics
  private sparkles: Sparkle[] = []
  private active: boolean = false
  private startTime: number = 0
  private duration: number = 2500
  private spawnX: number
  private spawnY: number
  private destroyed: boolean = false
  private onComplete?: () => void

  constructor(
    app: Application,
    renderer: IsometricRenderer,
    camera: RioCamera,
    spawnX: number,
    spawnY: number,
  ) {
    this.app = app
    this.renderer = renderer
    this.camera = camera
    this.spawnX = spawnX
    this.spawnY = spawnY

    this.container = new Container()
    this.container.zIndex = 9999
    renderer.getEntityContainer().addChild(this.container)

    this.overlay = new Graphics()
    this.overlay.rect(0, 0, window.innerWidth * 3, window.innerHeight * 3)
    this.overlay.fill({ color: 0x0a0e27, alpha: 1.0 })
    this.overlay.pivot.set(window.innerWidth * 1.5, window.innerHeight * 1.5)
    this.container.addChild(this.overlay)
  }

  start(water?: RioWaterSystem, player?: RioPlayer, bee?: RioBee) {
    this.active = true
    this.startTime = Date.now()

    if (water) {
      water.spawnSplash(this.spawnX, this.spawnY)
      setTimeout(() => water.spawnSplash(this.spawnX, this.spawnY), 300)
      setTimeout(() => water.spawnSplash(this.spawnX, this.spawnY), 600)
    }

    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20
      this.sparkles.push({
        x: this.spawnX,
        y: this.spawnY,
        vx: Math.cos(angle) * (0.03 + Math.random() * 0.02),
        vy: Math.sin(angle) * (0.03 + Math.random() * 0.02),
        life: 0,
        maxLife: 1000 + Math.random() * 1500,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? 0xFFD700 : 0x90CAF9,
      })
    }
  }

  setOnComplete(cb: () => void) {
    this.onComplete = cb
  }

  update(time: number) {
    if (!this.active || this.destroyed) return

    const elapsed = Date.now() - this.startTime
    const progress = Math.min(elapsed / this.duration, 1)

    // Fade overlay from black to transparent
    if (progress < 0.6) {
      this.overlay.alpha = 1.0 - (progress / 0.6)
    } else {
      this.overlay.alpha = 0
    }

    // Update sparkles
    this.container.removeChildren()
    if (this.overlay.alpha > 0) {
      this.container.addChild(this.overlay)
    }

    const dtMs = 16
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i]
      s.life += dtMs
      s.x += s.vx * dtMs
      s.y += s.vy * dtMs

      if (s.life >= s.maxLife) {
        this.sparkles.splice(i, 1)
        continue
      }

      const lifeRatio = s.life / s.maxLife
      const alpha = 1.0 - lifeRatio
      const screen = this.renderer.isoToScreen(s.x, s.y)

      const g = new Graphics()
      const size = s.size * (1 - lifeRatio * 0.5)

      g.moveTo(screen.x, screen.y - size)
      g.lineTo(screen.x + size * 0.3, screen.y - size * 0.3)
      g.lineTo(screen.x + size, screen.y)
      g.lineTo(screen.x + size * 0.3, screen.y + size * 0.3)
      g.lineTo(screen.x, screen.y + size)
      g.lineTo(screen.x - size * 0.3, screen.y + size * 0.3)
      g.lineTo(screen.x - size, screen.y)
      g.lineTo(screen.x - size * 0.3, screen.y - size * 0.3)
      g.closePath()
      g.fill({ color: s.color, alpha })
      this.container.addChild(g)
    }

    if (progress >= 1 && this.sparkles.length === 0) {
      this.active = false
      this.overlay.alpha = 0
      if (this.onComplete) this.onComplete()
    }
  }

  destroy() {
    this.destroyed = true
    this.sparkles = []
    this.container.destroy({ children: true })
  }
}
