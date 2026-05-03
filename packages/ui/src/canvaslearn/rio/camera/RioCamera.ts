import { Application, Container } from 'pixi.js'
import { ISO_CONFIG } from '../types'

export interface CameraConfig {
  x: number
  y: number
  zoom: number
  smoothing: number
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

export class RioCamera {
  private app: Application
  private worldContainer: Container
  private x: number
  private y: number
  private targetX: number
  private targetY: number
  private zoom: number
  private targetZoom: number
  private smoothing: number
  private bounds: CameraConfig['bounds']

  constructor(app: Application, config: CameraConfig) {
    this.app = app
    this.x = config.x
    this.y = config.y
    this.targetX = config.x
    this.targetY = config.y
    this.zoom = config.zoom
    this.targetZoom = config.zoom
    this.smoothing = config.smoothing
    this.bounds = config.bounds

    this.worldContainer = new Container()
    this.worldContainer.sortableChildren = true
    app.stage.addChildAt(this.worldContainer, 0)
  }

  setTarget(x: number, y: number) {
    this.targetX = x
    this.targetY = y
  }

  setZoom(zoom: number) {
    this.targetZoom = Math.max(ISO_CONFIG.CAMERA_MIN_ZOOM, Math.min(ISO_CONFIG.CAMERA_MAX_ZOOM, zoom))
  }

  update(dt: number) {
    // Smooth follow
    this.x += (this.targetX - this.x) * this.smoothing
    this.y += (this.targetY - this.y) * this.smoothing
    this.zoom += (this.targetZoom - this.zoom) * this.smoothing

    // Apply bounds
    this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x))
    this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y))

    // Apply to container
    const screenCenterX = this.app.screen.width / 2
    const screenCenterY = this.app.screen.height / 2

    this.worldContainer.position.set(
      screenCenterX - this.x * this.zoom,
      screenCenterY - this.y * this.zoom,
    )
    this.worldContainer.scale.set(this.zoom)
  }

  getContainer(): Container {
    return this.worldContainer
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y }
  }

  getZoom(): number {
    return this.zoom
  }

  destroy() {
    this.app.stage.removeChild(this.worldContainer)
    this.worldContainer.destroy()
  }
}