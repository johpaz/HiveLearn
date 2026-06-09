/**
 * Cámara con seguimiento suavizado, look-ahead horizontal y screen shake,
 * limitada a los bordes del nivel. Aplica transform a un Container "mundo".
 */

import { Container } from 'pixi.js'
import { clamp, lerp } from './types'

export class Camera {
  x = 0
  y = 0
  /** Escala de zoom del mundo (pixel-art nítido a 3x por defecto) */
  zoom = 3

  private shakeTime = 0
  private shakeMag = 0
  private lookAhead = 0

  constructor(
    public viewW: number,
    public viewH: number,
    public worldW: number,
    public worldH: number,
  ) {}

  resize(viewW: number, viewH: number) {
    this.viewW = viewW
    this.viewH = viewH
  }

  setWorldSize(w: number, h: number) {
    this.worldW = w
    this.worldH = h
  }

  shake(magnitude = 4, duration = 0.25) {
    this.shakeMag = magnitude
    this.shakeTime = duration
  }

  /** Sigue al objetivo (centro) con suavizado y look-ahead según su velocidad */
  follow(targetX: number, targetY: number, vx: number, dt: number) {
    this.lookAhead = lerp(this.lookAhead, clamp(vx * 0.25, -40, 40), 1 - Math.pow(0.001, dt))
    const goalX = targetX + this.lookAhead - this.viewW / this.zoom / 2
    const goalY = targetY - this.viewH / this.zoom / 2
    const t = 1 - Math.pow(0.0001, dt)
    this.x = lerp(this.x, goalX, t)
    this.y = lerp(this.y, goalY, t * 0.8)
    this.clampToWorld()
    if (this.shakeTime > 0) this.shakeTime -= dt
  }

  /** Centra inmediatamente (al entrar a la escena) */
  snapTo(targetX: number, targetY: number) {
    this.x = targetX - this.viewW / this.zoom / 2
    this.y = targetY - this.viewH / this.zoom / 2
    this.clampToWorld()
  }

  private clampToWorld() {
    const vw = this.viewW / this.zoom
    const vh = this.viewH / this.zoom
    this.x = this.worldW > vw ? clamp(this.x, 0, this.worldW - vw) : (this.worldW - vw) / 2
    this.y = this.worldH > vh ? clamp(this.y, 0, this.worldH - vh) : (this.worldH - vh) / 2
  }

  /** Aplica posición/escala al contenedor del mundo */
  apply(world: Container) {
    let ox = 0, oy = 0
    if (this.shakeTime > 0) {
      ox = (Math.random() * 2 - 1) * this.shakeMag
      oy = (Math.random() * 2 - 1) * this.shakeMag
    }
    world.scale.set(this.zoom)
    world.x = Math.round((-this.x + ox / this.zoom) * this.zoom)
    world.y = Math.round((-this.y + oy / this.zoom) * this.zoom)
  }
}
