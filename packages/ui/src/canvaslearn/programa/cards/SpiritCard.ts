import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { IsometricRenderer } from '../../rio/renderer/IsometricRenderer'

export interface SpiritCardConfig {
  id: string
  label: string
  icon: string
  value: string
  tint?: number
}

const DEFAULT_TINT = 0xfbbf24

export class SpiritCard {
  private app: Application
  private renderer: IsometricRenderer
  private container: Container
  private bg: Graphics
  private glow: Graphics
  private iconText: Text
  private labelText: Text
  private isoX: number
  private isoY: number
  private appearStart = 0
  private appearDelay: number
  private hoverFactor = 0
  private targetHoverFactor = 0
  private selectedAt: number | null = null
  private dismissedAt: number | null = null
  private alive = true
  readonly config: SpiritCardConfig

  constructor(
    app: Application,
    renderer: IsometricRenderer,
    config: SpiritCardConfig,
    isoX: number,
    isoY: number,
    appearDelay = 0,
  ) {
    this.app = app
    this.renderer = renderer
    this.config = config
    this.isoX = isoX
    this.isoY = isoY
    this.appearDelay = appearDelay
    this.appearStart = performance.now()

    this.container = new Container()
    this.container.zIndex = 9000 + isoY * 10 + isoX // sort by depth
    this.container.alpha = 0
    this.container.scale.set(0)

    const tint = config.tint ?? DEFAULT_TINT

    this.glow = new Graphics()
    this.glow.circle(0, 0, 50)
    this.glow.fill({ color: tint, alpha: 0.18 })
    this.container.addChild(this.glow)

    // Card body: marco redondeado con gradient simulado
    this.bg = new Graphics()
    this.drawCardBg(tint, false)
    this.container.addChild(this.bg)

    // Icon (emoji grande)
    this.iconText = new Text({
      text: config.icon,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 36,
        align: 'center',
      }),
    })
    this.iconText.anchor.set(0.5)
    this.iconText.position.set(0, -16)
    this.container.addChild(this.iconText)

    // Label
    this.labelText = new Text({
      text: config.label,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 11,
        fontWeight: '700',
        fill: 0x0a0e27,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 96,
      }),
    })
    this.labelText.anchor.set(0.5)
    this.labelText.position.set(0, 24)
    this.container.addChild(this.labelText)

    renderer.getOverlayContainer().addChild(this.container)
  }

  private drawCardBg(tint: number, hovered: boolean) {
    this.bg.clear()
    const w = 80
    const h = 100
    // Sombra
    this.bg.roundRect(-w / 2 + 2, -h / 2 + 4, w, h, 12)
    this.bg.fill({ color: 0x000000, alpha: 0.35 })
    // Frente
    this.bg.roundRect(-w / 2, -h / 2, w, h, 12)
    this.bg.fill({ color: hovered ? 0xfff8e1 : 0xffe18a, alpha: 0.97 })
    this.bg.stroke({ width: hovered ? 3 : 2, color: tint, alpha: 1 })
    // Brillo superior
    this.bg.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, 14, 6)
    this.bg.fill({ color: 0xffffff, alpha: 0.35 })
  }

  setHovered(hovered: boolean) {
    this.targetHoverFactor = hovered ? 1 : 0
    this.drawCardBg(this.config.tint ?? DEFAULT_TINT, hovered)
  }

  triggerSelect() {
    if (this.selectedAt) return
    this.selectedAt = performance.now()
  }

  triggerDismiss() {
    if (this.dismissedAt) return
    this.dismissedAt = performance.now()
  }

  isAlive(): boolean {
    return this.alive
  }

  getIsoPosition(): { x: number; y: number } {
    return { x: this.isoX, y: this.isoY }
  }

  update(time: number) {
    if (!this.alive) return

    const now = performance.now()
    const screen = this.renderer.isoToScreen(this.isoX, this.isoY)

    // Appear animation (0 → 1) with delay
    const sinceAppear = now - this.appearStart - this.appearDelay
    if (sinceAppear < 0) {
      this.container.alpha = 0
      this.container.scale.set(0)
    } else if (sinceAppear < 500) {
      const t = sinceAppear / 500
      const ease = 1 - Math.pow(1 - t, 3)
      this.container.alpha = ease
      this.container.scale.set(0.4 + ease * 0.6)
    } else {
      this.container.alpha = 1
      // smooth hover scale
      this.hoverFactor += (this.targetHoverFactor - this.hoverFactor) * 0.15
      const baseScale = 1 + this.hoverFactor * 0.18
      this.container.scale.set(baseScale)
    }

    // Bob float
    const bob = Math.sin(time / 400 + this.isoX * 0.5 + this.isoY * 0.3) * 6
    // Hover lift
    const lift = this.hoverFactor * 8
    // Select pop animation
    let dy = bob - 70 - lift
    if (this.selectedAt) {
      const sinceSelect = now - this.selectedAt
      if (sinceSelect < 600) {
        const t = sinceSelect / 600
        const ease = Math.pow(t, 2)
        const burst = Math.sin(t * Math.PI) * 0.4
        this.container.scale.set((1 + burst) * (1 - ease * 0.5))
        this.container.alpha = 1 - ease
        dy -= ease * 60
      } else {
        this.alive = false
        this.destroy()
        return
      }
    } else if (this.dismissedAt) {
      const sinceDismiss = now - this.dismissedAt
      if (sinceDismiss < 350) {
        const t = sinceDismiss / 350
        this.container.alpha = 1 - t
        this.container.scale.set(this.container.scale.x * (1 - t * 0.4))
      } else {
        this.alive = false
        this.destroy()
        return
      }
    }

    this.container.position.set(screen.x, screen.y + dy)

    // Glow pulse
    const pulse = 0.15 + Math.sin(time / 300 + this.isoX) * 0.05 + this.hoverFactor * 0.2
    this.glow.alpha = pulse
  }

  destroy() {
    this.alive = false
    if (this.container.parent) {
      this.container.parent.removeChild(this.container)
    }
    this.container.destroy({ children: true })
  }
}
