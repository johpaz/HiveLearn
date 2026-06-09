/**
 * Escena base + manager con transición de cortina de hexágonos (panal).
 * Una sola escena activa; update lógico a paso fijo, render por frame.
 */

import { Container, Graphics } from 'pixi.js'
import type { Game } from '../game'

export abstract class Scene {
  /** Raíz visual de la escena (el manager la agrega/quita del stage) */
  readonly root = new Container()

  constructor(protected game: Game) {}

  /** Llamada al activarse (cargar estado, construir vista) */
  abstract enter(): void | Promise<void>
  /** Tick lógico a paso fijo (dt en segundos) */
  abstract update(dt: number): void
  /** Llamada al desactivarse (liberar recursos propios) */
  exit(): void {}
  /** Redimensionamiento del viewport */
  resize(_w: number, _h: number): void {}
}

const HEX_SIZE = 36

export class SceneManager {
  private current: Scene | null = null
  private overlay = new Graphics()
  private transitioning = false
  /** Transición pedida mientras otra estaba en curso (p.ej. una escena que
   *  enruta síncronamente dentro de su enter()): se procesa al terminar. */
  private pending: { scene: Scene; viewW: number; viewH: number } | null = null

  constructor(private stage: Container) {
    this.overlay.zIndex = 1000
  }

  get active(): Scene | null {
    return this.current
  }

  /** Cambia de escena con cortina de hexágonos */
  async goTo(next: Scene, viewW: number, viewH: number): Promise<void> {
    if (this.transitioning) {
      this.pending = { scene: next, viewW, viewH }
      return
    }
    this.transitioning = true

    if (this.current) {
      await this.curtain(viewW, viewH, true)
      this.current.exit()
      this.stage.removeChild(this.current.root)
      this.current.root.destroy({ children: true })
    }

    this.current = next
    this.stage.addChild(next.root)
    await next.enter()
    next.resize(viewW, viewH)

    if (this.overlay.parent) await this.curtain(viewW, viewH, false)
    this.transitioning = false

    if (this.pending) {
      const p = this.pending
      this.pending = null
      await this.goTo(p.scene, p.viewW, p.viewH)
    }
  }

  /** Anima la cortina hexagonal entrando (cover=true) o saliendo */
  private curtain(w: number, h: number, cover: boolean): Promise<void> {
    this.stage.addChild(this.overlay)
    const cols = Math.ceil(w / (HEX_SIZE * 1.5)) + 2
    const rows = Math.ceil(h / (HEX_SIZE * 0.87)) + 2
    const total = 320 // ms
    const start = performance.now()

    return new Promise((resolve) => {
      const draw = () => {
        const t = Math.min(1, (performance.now() - start) / total)
        this.overlay.clear()
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            // cada hexágono crece con un pequeño retraso diagonal
            const delay = (c + r) / (cols + rows) * 0.5
            const local = Math.min(1, Math.max(0, (t - delay) / 0.5))
            const scale = cover ? local : 1 - local
            if (scale <= 0) continue
            const cx = c * HEX_SIZE * 1.5 + (r % 2 ? HEX_SIZE * 0.75 : 0)
            const cy = r * HEX_SIZE * 0.87
            this.hexagon(cx, cy, HEX_SIZE * 0.62 * scale)
          }
        }
        this.overlay.fill(0xffb300)
        if (t < 1) requestAnimationFrame(draw)
        else {
          if (!cover) {
            this.overlay.clear()
            this.stage.removeChild(this.overlay)
          }
          resolve()
        }
      }
      draw()
    })
  }

  private hexagon(cx: number, cy: number, r: number) {
    this.overlay.moveTo(cx + r, cy)
    for (let i = 1; i <= 6; i++) {
      const a = (Math.PI / 3) * i
      this.overlay.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
  }

  update(dt: number) {
    this.current?.update(dt)
  }

  resize(w: number, h: number) {
    this.current?.resize(w, h)
  }

  destroy() {
    if (this.current) {
      this.current.exit()
      this.current.root.destroy({ children: true })
      this.current = null
    }
  }
}
