/**
 * Sistema de partículas minimalista: estallidos de polen, polvo de aterrizaje
 * y chispas de bloques. Pool simple de Graphics cuadrados pixel-art.
 */

import { Container, Graphics } from 'pixi.js'

interface Particle {
  g: Graphics
  vx: number
  vy: number
  life: number
  maxLife: number
  gravity: number
}

export class Particles {
  readonly view = new Container()
  private active: Particle[] = []

  burst(x: number, y: number, color: number, count = 8, speed = 80, gravity = 300) {
    for (let i = 0; i < count; i++) {
      const g = new Graphics()
      const size = 1 + Math.random() * 2
      g.rect(0, 0, size, size).fill(color)
      g.x = x
      g.y = y
      const angle = Math.random() * Math.PI * 2
      const v = speed * (0.4 + Math.random() * 0.6)
      this.view.addChild(g)
      this.active.push({
        g,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - speed * 0.4,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.4,
        gravity,
      })
    }
  }

  /** Polvo al aterrizar: partículas horizontales bajas */
  dust(x: number, y: number, color = 0xd9cfa3) {
    for (let i = 0; i < 6; i++) {
      const g = new Graphics()
      g.rect(0, 0, 2, 1).fill(color)
      g.x = x + (Math.random() * 12 - 6)
      g.y = y
      this.view.addChild(g)
      this.active.push({
        g,
        vx: (Math.random() * 2 - 1) * 50,
        vy: -Math.random() * 25,
        life: 0,
        maxLife: 0.3,
        gravity: 60,
      })
    }
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]
      p.life += dt
      if (p.life >= p.maxLife) {
        this.view.removeChild(p.g)
        p.g.destroy()
        this.active.splice(i, 1)
        continue
      }
      p.vy += p.gravity * dt
      p.g.x += p.vx * dt
      p.g.y += p.vy * dt
      p.g.alpha = 1 - p.life / p.maxLife
    }
  }

  clear() {
    for (const p of this.active) {
      this.view.removeChild(p.g)
      p.g.destroy()
    }
    this.active = []
  }
}
