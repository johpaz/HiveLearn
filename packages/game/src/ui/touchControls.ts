/**
 * Botones virtuales para pantallas táctiles (tablets escolares):
 * cruceta ◀ ▶ a la izquierda, saltar (A) e interactuar (B) a la derecha.
 * Solo se muestran si el dispositivo tiene puntero táctil.
 */

import { Container, Graphics, Text } from 'pixi.js'
import type { Input, GameAction } from '../engine/input'

const BTN_RADIUS = 34
const MARGIN = 24

export class TouchControls {
  readonly view = new Container()
  private buttons: Array<{ g: Container; action: GameAction; x: (w: number) => number; y: (h: number) => number }> = []

  constructor(private input: Input) {
    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
    this.view.visible = isTouch
    if (!isTouch) return

    this.addButton('◀', 'left', (_w) => MARGIN + BTN_RADIUS, (h) => h - MARGIN - BTN_RADIUS)
    this.addButton('▶', 'right', (_w) => MARGIN + BTN_RADIUS * 3.4, (h) => h - MARGIN - BTN_RADIUS)
    this.addButton('A', 'jump', (w) => w - MARGIN - BTN_RADIUS, (h) => h - MARGIN - BTN_RADIUS * 1.8)
    this.addButton('B', 'interact', (w) => w - MARGIN - BTN_RADIUS * 3.2, (h) => h - MARGIN - BTN_RADIUS)
    // Botón 🎤 — push-to-talk de voz (mismo mapeo que la tecla V)
    this.addButton('🎤', 'talk', (w) => w - MARGIN - BTN_RADIUS * 5.4, (h) => h - MARGIN - BTN_RADIUS)
  }

  private addButton(label: string, action: GameAction, x: (w: number) => number, y: (h: number) => number) {
    const g = new Container()
    const circle = new Graphics()
    circle.circle(0, 0, BTN_RADIUS).fill({ color: 0x1a1a24, alpha: 0.35 })
    circle.circle(0, 0, BTN_RADIUS).stroke({ color: 0xffffff, alpha: 0.5, width: 2 })
    const txt = new Text({
      text: label,
      style: { fontFamily: 'monospace', fontSize: 22, fill: 0xffffff, fontWeight: 'bold' },
    })
    txt.anchor.set(0.5)
    g.addChild(circle, txt)
    g.eventMode = 'static'
    g.cursor = 'pointer'

    const down = () => {
      this.input.setTouch(action, true)
      circle.alpha = 1.5
    }
    const up = () => {
      this.input.setTouch(action, false)
      circle.alpha = 1
    }
    g.on('pointerdown', down)
    g.on('pointerup', up)
    g.on('pointerupoutside', up)
    g.on('pointercancel', up)

    this.view.addChild(g)
    this.buttons.push({ g, action, x, y })
  }

  layout(w: number, h: number) {
    for (const b of this.buttons) {
      b.g.x = b.x(w)
      b.g.y = b.y(h)
    }
  }

  /** Oculta los controles (modo cinemático Three.js) recordando el estado táctil */
  hide() {
    this.view.visible = false
  }

  /** Restaura la visibilidad según si el dispositivo es táctil */
  show() {
    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
    this.view.visible = isTouch
  }
}
