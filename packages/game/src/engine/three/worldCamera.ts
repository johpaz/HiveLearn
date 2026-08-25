/**
 * worldCamera — Cámara isométrica ortográfica para el Panal Viviente.
 *
 * El WorldRenderer usa una cámara mapeada a píxeles para los fondos shader
 * (que ignoran la matriz: NDC passthrough). Esta cámara vive en espacio de
 * mundo real (unidades arbitrarias) y proyecta el diorama 2.5D:
 *
 *   - Proyección ortográfica (sin perspectiva: estética diorama)
 *   - Ángulo isométrico clásico (azimut 45°, elevación ~35.264°)
 *   - Follow suavizado del objetivo (la abeja) + shake
 *   - Zoom en unidades de mundo (altura visible del frustum)
 */
import * as THREE from 'three'
import { clamp, lerp } from '../types'

const ISO_AZIMUTH = Math.PI / 4
const ISO_ELEVATION = Math.atan(1 / Math.sqrt(2)) // ~35.26° — iso "verdadera"

export class IsoCamera {
  readonly camera: THREE.OrthographicCamera
  /** Altura visible del frustum en unidades de mundo (zoom) */
  viewHeight = 11

  private target = new THREE.Vector3(0, 0, 0)
  private smooth = new THREE.Vector3(0, 0, 0)
  private shakeTime = 0
  private shakeMag = 0
  private aspect = 1

  constructor(aspect = 1) {
    this.aspect = aspect
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
    this.applyProjection()
    this.positionCamera()
  }

  resize(aspect: number, viewHeight?: number) {
    this.aspect = aspect
    if (viewHeight) this.viewHeight = viewHeight
    this.applyProjection()
  }

  zoomBy(factor: number) {
    this.viewHeight = clamp(this.viewHeight / factor, 6, 22)
    this.applyProjection()
  }

  private applyProjection() {
    const halfH = this.viewHeight / 2
    const halfW = halfH * this.aspect
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.updateProjectionMatrix()
  }

  private positionCamera() {
    const dist = 60
    const dir = new THREE.Vector3(
      Math.cos(ISO_ELEVATION) * Math.cos(ISO_AZIMUTH),
      Math.sin(ISO_ELEVATION),
      Math.cos(ISO_ELEVATION) * Math.sin(ISO_AZIMUTH),
    )
    this.camera.position.copy(this.smooth).addScaledVector(dir, dist)
    this.camera.lookAt(this.smooth)
  }

  follow(x: number, y: number, z: number, dt: number) {
    this.target.set(x, y, z)
    const t = 1 - Math.pow(0.0005, dt)
    this.smooth.lerp(this.target, t)
    if (this.shakeTime > 0) this.shakeTime -= dt
    this.positionCamera()
    if (this.shakeTime > 0) {
      const s = this.shakeMag * this.shakeTime * 4
      this.camera.position.x += (Math.random() * 2 - 1) * s
      this.camera.position.y += (Math.random() * 2 - 1) * s
    }
  }

  snapTo(x: number, y: number, z: number) {
    this.target.set(x, y, z)
    this.smooth.copy(this.target)
    this.positionCamera()
  }

  shake(mag = 0.15, dur = 0.3) {
    this.shakeMag = mag
    this.shakeTime = dur
  }

  /** Proyecta un punto de mundo a píxeles de pantalla (para prompts DOM) */
  projectToScreen(point: THREE.Vector3, viewW: number, viewH: number): { x: number; y: number } {
    const v = point.clone().project(this.camera)
    return { x: (v.x + 1) / 2 * viewW, y: (1 - v.y) / 2 * viewH }
  }
}
