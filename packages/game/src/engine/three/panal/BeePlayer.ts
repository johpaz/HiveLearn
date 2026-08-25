/**
 * BeePlayer — la abeja del alumno en el Panal Viviente.
 *
 * Vuelo libre sin gravedad: aceleración en el plano del panal (X/Y) con
 * inercia y amortiguación, inclinación (banking) según velocidad, sprite
 * billboard pixel-art con animación idle/move y aleteo continuo.
 *
 * Controles: flechas/WASD mueven, la abeja siempre "flota" (es una abeja).
 */
import * as THREE from 'three'
import { agentBeeTexture } from '../atlas'

const ACCEL = 7.5
const DAMPING = 3.2
const MAX_SPEED = 4.2

export class BeePlayer {
  readonly root = new THREE.Group()
  readonly pos = new THREE.Vector3(0, 0, 1.2)
  private vel = new THREE.Vector2(0, 0)
  private sprite: THREE.Sprite
  private mat: THREE.SpriteMaterial
  private wingT = 0
  /** Límites del mundo panal (se fijan tras construir las celdas) */
  bounds = { minX: -8, maxX: 8, minY: -6, maxY: 6 }

  constructor() {
    this.mat = new THREE.SpriteMaterial({
      map: agentBeeTexture('coordinator'),
      transparent: true,
      depthTest: true,
    })
    this.sprite = new THREE.Sprite(this.mat)
    const s = 0.72
    this.sprite.scale.set(s, s, 1)
    this.sprite.center.set(0.5, 0.5)
    this.root.add(this.sprite)
    this.root.renderOrder = 20
  }

  get x() { return this.pos.x }
  get y() { return this.pos.y }

  /**
   * @param axisX -1..1 (derecha/izquierda)
   * @param axisY -1..1 (arriba/abajo)
   */
  update(dt: number, axisX: number, axisY: number): void {
    // aceleración con inercia
    this.vel.x += axisX * ACCEL * dt
    this.vel.y += axisY * ACCEL * dt
    // amortiguación (vuelo en miel: se frena suave)
    const damp = Math.exp(-DAMPING * dt)
    this.vel.multiplyScalar(damp)
    // cap de velocidad
    const sp = this.vel.length()
    if (sp > MAX_SPEED) this.vel.multiplyScalar(MAX_SPEED / sp)

    this.pos.x = THREE.MathUtils.clamp(this.pos.x + this.vel.x * dt, this.bounds.minX, this.bounds.maxX)
    this.pos.y = THREE.MathUtils.clamp(this.pos.y + this.vel.y * dt, this.bounds.minY, this.bounds.maxY)
    // flotación idle
    const hover = Math.sin(performance.now() / 1000 * 3) * 0.04
    this.root.position.set(this.pos.x, this.pos.y + hover, this.pos.z)

    // banking según velocidad + aleteo
    this.wingT += dt * (6 + sp * 4)
    const flap = Math.sin(this.wingT * 4) * 0.12
    this.mat.rotation = -this.vel.x * 0.09 + flap
    const squash = 1 + Math.sin(this.wingT * 8) * 0.03
    this.sprite.scale.set(0.72 * squash, 0.72 / squash, 1)
  }

  snapTo(x: number, y: number) {
    this.pos.set(x, y, 1.2)
    this.vel.set(0, 0)
    this.root.position.set(x, y, this.pos.z)
  }

  dispose(): void {
    this.mat.dispose()
  }
}
