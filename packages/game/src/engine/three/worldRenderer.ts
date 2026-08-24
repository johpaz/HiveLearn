/**
 * worldRenderer — wrapper de THREE.WebGLRenderer que vive detrás del canvas
 * PixiJS. Mantiene un lienzo WebGL propio (transparente) sincronizado
 * con el contenedor del juego, y dibuja un fondo 3D por escena.
 *
 * Loop:
 *   - enganchado al ticker de Pixi vía `Game` (ver game.ts).
 *   - update(dt) alimenta el QualityScaler, empuja uTime / uCamera a todos los
 *     ShaderMaterials activos, y pide el render.
 *
 * Parallax:
 *   - Las escenas piden `setCameraFocus(worldX, worldY)` con coords del mundo
 *     del juego. WorldRenderer desplaza la cámara 3D proporcionalmente, yema-
 *     ja según el factor por capa (lejanos mueven menos).
 */

import * as THREE from 'three'
import { QualityScaler, initialQuality, detectWebGL2, type QualityState } from './quality'
import type { HiveUniforms } from './shaderMaterial'

export interface Scene3D {
  /** Object3D root de la escena 3D — añadido a la scene principal. */
  root: THREE.Object3D
  /** Hook de actualización por frame (delta en segundos). Recibe uniforms base. */
  update?(dt: number, uniforms: HiveUniforms): void
  /** Llamado al desmontar para liberar GPU. */
  dispose?(): void
}

export interface WorldRendererOptions {
  /** Profundidad relativa del parallax: 0=no parallax, 1=muncho. */
  parallaxDepth?: number
}

export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer | null
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera | THREE.PerspectiveCamera
  readonly uniforms: HiveUniforms
  private scaler: QualityScaler
  private container: HTMLElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private current: Scene3D | null = null
  private cameraTarget = new THREE.Vector2(0, 0)
  private cameraSmooth = new THREE.Vector2(0, 0)
  private parallaxDepth: number
  private disposed = false
  private alive = false

  constructor(opts: WorldRendererOptions = {}) {
    this.parallaxDepth = opts.parallaxDepth ?? 1
    this.scaler = new QualityScaler()
    this.uniforms = baseHiveUniforms()

    if (!detectWebGL2()) {
      this.renderer = null
      // Cámara dummy — el renderer null nunca dibuja
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
      this.scene = new THREE.Scene()
      return
    }

    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
      })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.scaler.current.pixelRatio))
      this.renderer = renderer
      this.canvas = renderer.domElement
      this.canvas.style.position = 'absolute'
      this.canvas.style.top = '0'
      this.canvas.style.left = '0'
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'
      this.canvas.style.pointerEvents = 'none'
      this.canvas.style.zIndex = '0'

      this.scene = new THREE.Scene()
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 10)
      this.camera.position.z = 1
      this.alive = true
    } catch (e) {
      console.warn('[WorldRenderer] WebGL init failed', e)
      this.renderer = null
      this.scene = new THREE.Scene()
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
      this.scaler.reportGlError()
    }
  }

  get quality(): QualityState { return this.scaler.current }
  get isAlive(): boolean { return this.alive && !this.disposed }
  /** Canvas WebGL real (para modo cinemático: clics sobre actores 3D) */
  get domCanvas(): HTMLCanvasElement | null { return this.canvas }

  /** Habilita/deshabilita interacción de puntero sobre el canvas 3D */
  setInteractive(active: boolean): void {
    if (!this.canvas) return
    this.canvas.style.pointerEvents = active ? 'auto' : 'none'
    this.canvas.style.zIndex = active ? '2' : '0'
  }

  /** Attaches the 3D canvas behind the Pixi canvas inside `container`. */
  attach(container: HTMLElement): void {
    this.container = container
    if (!this.canvas || !this.renderer) return
    // Insertar ANTES del canvas de Pixi si existe, si no al principio
    const pixiCanvas = container.querySelector('canvas')
    if (pixiCanvas) {
      container.insertBefore(this.canvas, pixiCanvas)
      // Un canvas posicionado (z-index 0) pinta POR ENCIMA de uno estático:
      // hay que elevar el canvas Pixi para que el mundo 3D quede detrás.
      pixiCanvas.style.position = 'relative'
      pixiCanvas.style.zIndex = '1'
    } else {
      container.appendChild(this.canvas)
    }
    this.resize()
  }

  resize(): void {
    if (!this.renderer || !this.container) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.renderer.setSize(w, h, false)
    this.uniforms.uResolution.value.set(w, h)
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.left = 0
      this.camera.right = w
      this.camera.top = 0
      this.camera.bottom = h
      this.camera.updateProjectionMatrix()
    }
  }

  setQuality(q: QualityState): void {
    if (!this.renderer) return
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio))
  }

  /** Cambia la escena 3D activa. Si se pasa null, limpia el fondo. */
  setScene(scene3d: Scene3D | null): void {
    if (this.current) {
      if (this.current.root.parent === this.scene) this.scene.remove(this.current.root)
      this.current.dispose?.()
    }
    this.current = scene3d
    if (scene3d && this.renderer) this.scene.add(scene3d.root)
  }

  /** Las escenas llaman esto para informar de dónde está el foco del mundo. */
  setCameraFocus(worldX: number, worldY: number): void {
    this.cameraTarget.set(worldX, worldY)
  }

  /** Avanza el mundo 3D un frame. Lo llama Game desde el ticker. */
  update(dtMs: number): void {
    if (!this.renderer || !this.alive) return
    const dt = dtMs / 1000
    this.scaler.observeFrame(dtMs)
    // Machacar pixel ratio si el scaler lo cambió
    const q = this.scaler.current
    if (this.renderer.getPixelRatio() !== q.pixelRatio) this.setQuality(q)

    // Parallax: la cámara 3D sigue al foco del mundo con suavizado
    const smoothing = 0.08
    this.cameraSmooth.x += (this.cameraTarget.x - this.cameraSmooth.x) * smoothing
    this.cameraSmooth.y += (this.cameraTarget.y - this.cameraSmooth.y) * smoothing
    this.uniforms.uTime.value += dt
    this.uniforms.uCamera.value.set(
      this.cameraSmooth.x * this.parallaxDepth,
      this.cameraSmooth.y * this.parallaxDepth,
    )
    this.uniforms.uQuality.value = q.tier === 'high' ? 1 : q.tier === 'mid' ? 0.6 : q.tier === 'low' ? 0.3 : 0

    this.current?.update?.(dt, this.uniforms)
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.disposed = true
    this.alive = false
    if (this.current) {
      this.current.dispose?.()
      this.current = null
    }
    if (this.renderer) {
      this.renderer.dispose()
      // liberar contexto GL
      const gl = this.renderer.getContext()
      const ext = gl.getExtension('WEBGL_lose_context')
      ext?.loseContext?.()
    }
    if (this.canvas?.parentElement) this.canvas.parentElement.removeChild(this.canvas)
    this.container = null
  }
}

function baseHiveUniforms(): HiveUniforms {
  return {
    uTime: { value: 0 },
    uCamera: { value: new THREE.Vector2(0, 0) },
    uMood: { value: 0.5 },
    uQuality: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  }
}