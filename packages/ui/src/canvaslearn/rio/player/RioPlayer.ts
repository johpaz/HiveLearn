import { Application, Container, Graphics } from 'pixi.js'
import type { IsometricRenderer } from '../renderer/IsometricRenderer'
import type { RioCamera } from '../camera/RioCamera'
import type { AvatarState } from '../types'
import { ISO_CONFIG } from '../types'

export class RioPlayer {
  private app: Application
  private renderer: IsometricRenderer
  private camera: RioCamera
  private container: Container
  private sprite: Graphics
  private shadow: Graphics
  private lastDirection: string = 's'
  private lastAnimation: string = 'idle'
  private frameIndex: number = 0
  private frameTimer: number = 0

  constructor(app: Application, renderer: IsometricRenderer, camera: RioCamera) {
    this.app = app
    this.renderer = renderer
    this.camera = camera

    this.container = new Container()
    this.container.zIndex = 1000

    // Shadow
    this.shadow = new Graphics()
    this.shadow.ellipse(0, 4, 12, 6)
    this.shadow.fill({ color: 0x000000, alpha: 0.3 })
    this.container.addChild(this.shadow)

    // Player body
    this.sprite = new Graphics()
    this.container.addChild(this.sprite)

    renderer.getEntityContainer().addChild(this.container)
    this.drawCharacter({ direction: 's', animation: 'idle', x: 0, y: 0, speed: 0, custom: { skinColor: 0xFFDFC4, hairColor: 0x4A3728, hairStyle: 0, shirtColor: 0x3F51B5, pantsColor: 0x37474F, accessory: '' } })
  }

  update(state: AvatarState, dt: number) {
    const screenPos = this.renderer.isoToScreen(state.x, state.y)
    this.container.zIndex = state.y + state.x + 0.5

    const isMoving = state.animation === 'caminar' || state.animation === 'correr'
    const isRunning = state.animation === 'correr'
    const frameSpeed = isRunning ? 120 : 180

    // Advance walk frame
    if (isMoving) {
      this.frameTimer += dt * 1000
      if (this.frameTimer >= frameSpeed) {
        this.frameTimer -= frameSpeed
        this.frameIndex = (this.frameIndex + 1) % 2
        this.drawCharacter(state)
      }
    } else if (this.lastAnimation !== 'idle') {
      this.frameIndex = 0
      this.frameTimer = 0
      this.drawCharacter(state)
    } else if (state.direction !== this.lastDirection) {
      this.drawCharacter(state)
    }

    this.lastDirection = state.direction
    this.lastAnimation = state.animation

    // Bob in lock-step with frame phase (no Date.now desync, no jitter)
    const phase = isMoving ? (this.frameTimer / frameSpeed) * Math.PI * 2 : 0
    const bob = isMoving ? Math.sin(phase) * 2 : 0

    this.container.position.set(screenPos.x, screenPos.y - bob)
    this.shadow.alpha = isMoving ? 0.2 : 0.3

    // Subtle running lean
    if (isRunning) {
      const leanDir = ['e', 'ne', 'se'].includes(state.direction) ? 1 : -1
      this.sprite.skew.x = leanDir * 0.05
    } else {
      this.sprite.skew.x = 0
    }
  }

  private drawCharacter(state: AvatarState) {
    const colors = state.custom
    const isMoving = state.animation === 'caminar' || state.animation === 'correr'
    const frame = this.frameIndex

    this.sprite.clear()

    // Leg swing (frame 0: left forward, frame 1: right forward)
    const leftLegOff = isMoving ? (frame === 0 ? -2 : 2) : 0
    const rightLegOff = -leftLegOff

    // Left leg
    this.sprite.roundRect(-6, -4 + leftLegOff, 5, 8, 1)
    this.sprite.fill({ color: colors.pantsColor })
    // Right leg
    this.sprite.roundRect(1, -4 + rightLegOff, 5, 8, 1)
    this.sprite.fill({ color: colors.pantsColor })

    // Body (torso)
    this.sprite.roundRect(-8, -18, 16, 14, 2)
    this.sprite.fill({ color: colors.shirtColor })

    // Arm swing (opposite phase to legs)
    const leftArmOff = -leftLegOff * 0.6
    const rightArmOff = -rightLegOff * 0.6

    // Left arm
    this.sprite.roundRect(-11, -16 + leftArmOff, 3, 10, 1)
    this.sprite.fill({ color: colors.skinColor })
    // Right arm
    this.sprite.roundRect(8, -16 + rightArmOff, 3, 10, 1)
    this.sprite.fill({ color: colors.skinColor })

    // Head
    this.sprite.circle(0, -24, 7)
    this.sprite.fill({ color: colors.skinColor })

    // Hair
    this.sprite.ellipse(0, -28, 7, 4)
    this.sprite.fill({ color: colors.hairColor })

    // Eyes (direction-aware)
    const eyeDir = (['e', 'ne', 'se'].includes(state.direction)) ? 2 : (['w', 'nw', 'sw'].includes(state.direction)) ? -2 : 0
    this.sprite.circle(eyeDir - 2, -24, 1)
    this.sprite.fill({ color: 0x222222 })
    this.sprite.circle(eyeDir + 2, -24, 1)
    this.sprite.fill({ color: 0x222222 })

    // Direction dot (subtle indicator above head)
    const dirVectors: Record<string, { dx: number; dy: number }> = {
      'n': { dx: 0, dy: -1 }, 'ne': { dx: 0.7, dy: -0.7 }, 'e': { dx: 1, dy: 0 },
      'se': { dx: 0.7, dy: 0.7 }, 's': { dx: 0, dy: 1 }, 'sw': { dx: -0.7, dy: 0.7 },
      'w': { dx: -1, dy: 0 }, 'nw': { dx: -0.7, dy: -0.7 },
    }
    const dv = dirVectors[state.direction] || { dx: 0, dy: 1 }
    this.sprite.moveTo(dv.dx * 10, -12 + dv.dy * 10)
    this.sprite.lineTo(dv.dx * 14, -12 + dv.dy * 14)
    this.sprite.stroke({ width: 2, color: 0xFFFFFF, alpha: 0.5 })

    if (colors.accessory) {
      this.drawAccessory(colors.accessory, colors)
    }
  }

  private drawAccessory(accessory: string, colors: AvatarState['custom']) {
    switch (accessory) {
      case 'mochila':
        this.sprite.roundRect(6, -16, 5, 10, 2)
        this.sprite.fill({ color: 0x795548 })
        break
      case 'sombrero':
        this.sprite.ellipse(0, -32, 10, 4)
        this.sprite.fill({ color: 0xD7CCC8 })
        this.sprite.roundRect(-5, -36, 10, 4, 2)
        this.sprite.fill({ color: 0xEFEBE9 })
        break
      case 'bota':
        this.sprite.circle(0, -36, 5)
        this.sprite.fill({ color: 0xFFD700 })
        break
    }
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}
