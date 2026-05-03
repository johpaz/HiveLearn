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
  private directionIndicator: Graphics
  private lastDirection: string = 's'

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

    // Player body (will be colored based on customization)
    this.sprite = new Graphics()
    this.container.addChild(this.sprite)

    // Direction indicator (small triangle)
    this.directionIndicator = new Graphics()
    this.container.addChild(this.directionIndicator)

    // Position in entity container
    renderer.getEntityContainer().addChild(this.container)
  }

  update(state: AvatarState, dt: number) {
    const screenPos = this.renderer.isoToScreen(state.x, state.y)

    // Depth sorting
    this.container.zIndex = state.y + state.x + 0.5

    // Position
    this.container.position.set(screenPos.x, screenPos.y)

    // Redraw if direction changed
    if (state.direction !== this.lastDirection) {
      this.drawCharacter(state)
      this.lastDirection = state.direction
    }

    // Animation bob
    const isMoving = state.animation === 'caminar' || state.animation === 'correr'
    const bob = isMoving ? Math.sin(Date.now() / (state.animation === 'correr' ? 80 : 120)) * 3 : 0

    this.container.position.set(screenPos.x, screenPos.y - bob)
    this.shadow.alpha = isMoving ? 0.2 : 0.3
  }

  private drawCharacter(state: AvatarState) {
    const colors = state.custom
    this.sprite.clear()
    this.directionIndicator.clear()

    // Body (torso)
    this.sprite.roundRect(-8, -18, 16, 14, 2)
    this.sprite.fill({ color: colors.shirtColor })

    // Head
    this.sprite.circle(0, -24, 7)
    this.sprite.fill({ color: colors.skinColor })

    // Hair
    this.sprite.ellipse(0, -28, 7, 4)
    this.sprite.fill({ color: colors.hairColor })

    // Legs
    this.sprite.roundRect(-6, -4, 5, 8, 1)
    this.sprite.fill({ color: colors.pantsColor })
    this.sprite.roundRect(1, -4, 5, 8, 1)
    this.sprite.fill({ color: colors.pantsColor })

    // Arms
    this.sprite.roundRect(-11, -16, 3, 10, 1)
    this.sprite.fill({ color: colors.skinColor })
    this.sprite.roundRect(8, -16, 3, 10, 1)
    this.sprite.fill({ color: colors.skinColor })

    // Direction indicator
    const dirVectors: Record<string, { dx: number; dy: number }> = {
      'n': { dx: 0, dy: -1 },
      'ne': { dx: 0.7, dy: -0.7 },
      'e': { dx: 1, dy: 0 },
      'se': { dx: 0.7, dy: 0.7 },
      's': { dx: 0, dy: 1 },
      'sw': { dx: -0.7, dy: 0.7 },
      'w': { dx: -1, dy: 0 },
      'nw': { dx: -0.7, dy: -0.7 },
    }
    const dv = dirVectors[state.direction] || { dx: 0, dy: 1 }
    this.directionIndicator.moveTo(dv.dx * 10, -12 + dv.dy * 10)
    this.directionIndicator.lineTo(dv.dx * 14, -12 + dv.dy * 14)
    this.directionIndicator.stroke({ width: 2, color: 0xFFFFFF, alpha: 0.6 })

    // Accessory
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