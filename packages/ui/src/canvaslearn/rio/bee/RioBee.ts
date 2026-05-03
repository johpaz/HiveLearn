import { Application, Graphics, Container, TextStyle, Text } from 'pixi.js'
import type { IsometricRenderer } from '../renderer/IsometricRenderer'
import type { RioCamera } from '../camera/RioCamera'
import type { AvatarState, BeeState } from '../types'

export class RioBee {
  private app: Application
  private renderer: IsometricRenderer
  private camera: RioCamera
  private container: Container
  private body: Graphics
  private wings: Graphics
  private glow: Graphics
  private bobOffset: number = 0
  private wingAngle: number = 0
  private targetX: number = 0
  private targetY: number = 0
  private lastState: BeeState = 'following'

  constructor(app: Application, renderer: IsometricRenderer, camera: RioCamera) {
    this.app = app
    this.renderer = renderer
    this.camera = camera

    this.container = new Container()
    this.container.zIndex = 2000

    // Glow effect
    this.glow = new Graphics()
    this.glow.circle(0, 0, 20)
    this.glow.fill({ color: 0xFFD700, alpha: 0.15 })
    this.container.addChild(this.glow)

    // Wings (behind body)
    this.wings = new Graphics()
    this.container.addChild(this.wings)

    // Body
    this.body = new Graphics()
    this.container.addChild(this.body)

    renderer.getEntityContainer().addChild(this.container)
    this.drawBee()
  }

  update(playerState: AvatarState, beeState: BeeState, dt: number, time: number) {
    // Calculate target position (near player, offset)
    const offsetDist = 2
    const dirOffsets: Record<string, { dx: number; dy: number }> = {
      'n': { dx: 1, dy: 2 },
      'ne': { dx: 1.5, dy: 1 },
      'e': { dx: 2, dy: 0 },
      'se': { dx: 1.5, dy: -1 },
      's': { dx: -1, dy: -2 },
      'sw': { dx: -1.5, dy: -1 },
      'w': { dx: -2, dy: 0 },
      'nw': { dx: -1.5, dy: 1 },
    }

    const off = dirOffsets[playerState.direction] || { dx: 0, dy: -2 }

    if (beeState === 'following' || beeState === 'idle') {
      this.targetX = playerState.x + off.dx
      this.targetY = playerState.y + off.dy
    } else if (beeState === 'guiding' || beeState === 'flying_ahead') {
      // Fly ahead in player's direction
      this.targetX = playerState.x + off.dx * 3
      this.targetY = playerState.y + off.dy * 3
    }

    // Smooth movement
    const currentX = parseFloat(this.container.x.toString()) || this.renderer.isoToScreen(playerState.x, playerState.y).x
    const currentY = parseFloat(this.container.y.toString()) || this.renderer.isoToScreen(playerState.x, playerState.y).y

    const targetScreen = this.renderer.isoToScreen(this.targetX, this.targetY)
    const lerpSpeed = 0.05

    this.container.x += (targetScreen.x - this.container.x) * lerpSpeed
    this.container.y += (targetScreen.y - this.container.y) * lerpSpeed

    // Bob animation
    this.bobOffset = Math.sin(time / 300) * 4
    this.container.y += this.bobOffset

    // Wing animation
    this.wingAngle = Math.sin(time / 50) * 0.8
    this.drawWings(time)

    // Glow pulse
    const glowAlpha = 0.1 + Math.sin(time / 500) * 0.05
    this.glow.alpha = glowAlpha

    // State-based effects
    if (beeState !== this.lastState) {
      this.onStateChange(beeState)
      this.lastState = beeState
    }

    // Depth sorting
    this.container.zIndex = this.targetY + 0.1 // Slightly above player
  }

  private drawBee() {
    this.body.clear()

    // Abdomen (stripes)
    this.body.ellipse(0, 2, 5, 7)
    this.body.fill({ color: 0xFFC107 })
    // Stripes
    for (let i = -2; i <= 2; i += 2) {
      this.body.rect(-5, i, 10, 2)
      this.body.fill({ color: 0x1a1a2e })
    }

    // Thorax
    this.body.circle(0, -7, 4)
    this.body.fill({ color: 0xFFC107 })

    // Head
    this.body.circle(0, -13, 3)
    this.body.fill({ color: 0x1a1a2e })

    // Eyes
    this.body.circle(-2, -14, 1.5)
    this.body.fill({ color: 0xFFFFFF })
    this.body.circle(2, -14, 1.5)
    this.body.fill({ color: 0xFFFFFF })

    // Antennae
    this.body.moveTo(-1, -15)
    this.body.lineTo(-4, -20)
    this.body.stroke({ width: 1, color: 0x1a1a2e })
    this.body.circle(-4, -20, 1.5)
    this.body.fill({ color: 0xFFC107 })

    this.body.moveTo(1, -15)
    this.body.lineTo(4, -20)
    this.body.stroke({ width: 1, color: 0x1a1a2e })
    this.body.circle(4, -20, 1.5)
    this.body.fill({ color: 0xFFC107 })

    // Stinger
    this.body.moveTo(-1, 9)
    this.body.lineTo(0, 13)
    this.body.lineTo(1, 9)
    this.body.fill({ color: 0x1a1a2e })
  }

  private drawWings(time: number) {
    this.wings.clear()
    const wingOffset = Math.sin(time / 40) * 6

    // Left wing
    this.wings.moveTo(-4, -6)
    this.wings.bezierCurveTo(-14, -12 + wingOffset * 0.3, -16, -2 + wingOffset * 0.3, -6, -4)
    this.wings.fill({ color: 0xE3F2FD, alpha: 0.5 })
    this.wings.stroke({ width: 0.5, color: 0xBBDEFB, alpha: 0.6 })

    // Right wing
    this.wings.moveTo(4, -6)
    this.wings.bezierCurveTo(14, -12 + wingOffset * 0.3, 16, -2 + wingOffset * 0.3, 6, -4)
    this.wings.fill({ color: 0xE3F2FD, alpha: 0.5 })
    this.wings.stroke({ width: 0.5, color: 0xBBDEFB, alpha: 0.6 })
  }

  private onStateChange(newState: BeeState) {
    switch (newState) {
      case 'celebrating':
        // Particle burst effect
        break
      case 'pointing':
        // Point toward target
        break
      case 'talking':
        // Hover in place, face player
        break
    }
  }

  getPosition(): { x: number; y: number } {
    return { x: this.targetX, y: this.targetY }
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}