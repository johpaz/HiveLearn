/**
 * Escena de la portada: un panal de prismas hexagonales que respira, con un grafo de "nodos de conocimiento"
 * flotando encima (la metáfora del mapa curricular). Three.js directo, sin postproceso:
 *  - un solo `InstancedMesh` (≈600 hexágonos) y un `LineSegments` para las aristas del grafo;
 *  - el puntero genera una onda en el panal y desplaza ligeramente la cámara;
 *  - con `reducedMotion` se pinta un cuadro fijo y no hay bucle de animación;
 *  - se pausa si la pestaña no está visible y limita el devicePixelRatio.
 */
import {
  AdditiveBlending, AmbientLight, CanvasTexture, Color, CylinderGeometry, DirectionalLight, DynamicDrawUsage,
  Fog, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, BufferGeometry, Float32BufferAttribute,
  Matrix4, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, PointLight, Raycaster, Scene, Sprite, SpriteMaterial,
  Vector2, Vector3, WebGLRenderer, Plane, SphereGeometry, MeshBasicMaterial,
} from 'three'

export interface HiveSceneOptions {
  reducedMotion: boolean
}

const RADIUS = 15          // anillos del panal (631 celdas)
const CELL = 0.62          // circunradio de la celda
const NODE_COUNT = 16
const LINK_DISTANCE = 4.6

const DEEP = new Color('#140d05')
const AMBER = new Color('#d98a00')
const HONEY = new Color('#ffc933')
const CREAM = new Color('#fff1c2')

/** Hash estable [0,1) por celda, para variar la altura base sin ruido en cada cuadro. */
function cellNoise(q: number, r: number): number {
  const n = Math.sin(q * 127.1 + r * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function glowTexture(): CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,241,194,1)')
  gradient.addColorStop(0.25, 'rgba(255,201,51,0.55)')
  gradient.addColorStop(1, 'rgba(255,201,51,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new CanvasTexture(canvas)
}

interface Cell { x: number; z: number; q: number; r: number; dist: number; base: number }
interface GraphNode { object: Object3D; glow: Sprite; orbit: number; speed: number; height: number; phase: number; radius: number }

export class HiveScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(38, 1, 0.1, 80)
  private mesh: InstancedMesh
  private cells: Cell[] = []
  private nodes: GraphNode[] = []
  private links: LineSegments
  private linkPositions: Float32Array
  private glowMap: CanvasTexture
  private pointerLight = new PointLight('#ffb300', 14, 12, 1.6)
  private raycaster = new Raycaster()
  private ground = new Plane(new Vector3(0, 1, 0), 0)
  private pointer = new Vector2(0, 0)
  private pointerTarget = new Vector2(0, 0)
  private hit = new Vector3(0, 0, 0)
  private hitTarget = new Vector3(0, 0, 0)
  private hasPointer = false
  private dummy = new Object3D()
  private matrix = new Matrix4()
  private color = new Color()
  private frame = 0
  private clockStart = performance.now()
  private running = false
  private disposed = false
  private width = 1
  private height = 1
  private onVisibility = () => {
    if (document.hidden) this.pause()
    else if (!this.options.reducedMotion) this.start()
  }

  constructor(private canvas: HTMLCanvasElement, private options: HiveSceneOptions) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

    this.scene.fog = new Fog(DEEP, 14, 34)
    this.camera.position.set(0, 11, 16)
    this.camera.lookAt(0, 0, 0)

    this.scene.add(new AmbientLight('#7a5a2a', 0.9))
    const sun = new DirectionalLight('#ffe2a8', 2.2)
    sun.position.set(-6, 12, 5)
    this.scene.add(sun)
    this.scene.add(this.pointerLight)

    // Panal: coordenadas axiales, celdas con la punta hacia ±z.
    const geometry = new CylinderGeometry(CELL * 0.93, CELL * 0.93, 1, 6)
    geometry.translate(0, 0.5, 0)
    const material = new MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 })
    for (let q = -RADIUS; q <= RADIUS; q++) {
      for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++) {
        const x = CELL * Math.sqrt(3) * (q + r / 2)
        const z = CELL * 1.5 * r
        this.cells.push({ x, z, q, r, dist: Math.hypot(x, z), base: 0.25 + cellNoise(q, r) * 0.55 })
      }
    }
    this.mesh = new InstancedMesh(geometry, material, this.cells.length)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(this.cells.length * 3), 3)
    this.mesh.instanceColor.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)

    // Grafo flotante.
    this.glowMap = glowTexture()
    const sphere = new SphereGeometry(0.11, 14, 14)
    for (let i = 0; i < NODE_COUNT; i++) {
      const object = new Mesh(sphere, new MeshBasicMaterial({ color: CREAM }))
      const glow = new Sprite(new SpriteMaterial({ map: this.glowMap, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }))
      glow.scale.setScalar(1.3)
      object.add(glow)
      this.scene.add(object)
      this.nodes.push({
        object, glow,
        orbit: Math.random() * Math.PI * 2,
        speed: 0.05 + Math.random() * 0.07,
        height: 1.6 + Math.random() * 2.6,
        phase: Math.random() * Math.PI * 2,
        radius: 2.2 + Math.random() * 7,
      })
    }
    this.linkPositions = new Float32Array(NODE_COUNT * NODE_COUNT * 6)
    const linkGeometry = new BufferGeometry()
    linkGeometry.setAttribute('position', new Float32BufferAttribute(this.linkPositions, 3).setUsage(DynamicDrawUsage))
    this.links = new LineSegments(linkGeometry, new LineBasicMaterial({ color: HONEY, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }))
    this.links.frustumCulled = false
    this.scene.add(this.links)

    document.addEventListener('visibilitychange', this.onVisibility)
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.renderer.setSize(this.width, this.height, false)
    this.camera.aspect = this.width / this.height
    // En vertical (móvil) se aleja la cámara para que el panal siga llenando el cuadro.
    this.camera.position.z = this.camera.aspect < 0.8 ? 21 : 16
    this.camera.updateProjectionMatrix()
    if (!this.running) this.renderFrame(performance.now())
  }

  /** `x`, `y` en [-1, 1] (coordenadas normalizadas del puntero sobre la ventana). */
  setPointer(x: number, y: number): void {
    this.pointerTarget.set(x, y)
    this.hasPointer = true
  }

  start(): void {
    if (this.running || this.disposed) return
    if (this.options.reducedMotion) { this.renderFrame(performance.now()); return }
    this.running = true
    const loop = (now: number) => {
      if (!this.running) return
      this.renderFrame(now)
      this.frame = requestAnimationFrame(loop)
    }
    this.frame = requestAnimationFrame(loop)
  }

  pause(): void {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  private renderFrame(now: number): void {
    // Cuadro fijo y agradable cuando no hay animación.
    const t = this.options.reducedMotion ? 2.4 : (now - this.clockStart) / 1000

    // Suavizado del puntero y su proyección sobre el plano del panal.
    this.pointer.lerp(this.pointerTarget, 0.06)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    if (this.hasPointer && this.raycaster.ray.intersectPlane(this.ground, this.hitTarget)) this.hit.lerp(this.hitTarget, 0.1)
    this.pointerLight.position.set(this.hit.x, 2.6, this.hit.z)

    // Cámara: deriva lenta + paralaje con el puntero.
    const drift = Math.sin(t * 0.12) * 1.2
    this.camera.position.x = drift + this.pointer.x * 1.4
    this.camera.position.y = 11 + this.pointer.y * 0.8
    this.camera.lookAt(0, 0.4, 0)

    const ripple = this.hasPointer && !this.options.reducedMotion
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      let h = cell.base
        + Math.sin(cell.dist * 0.55 - t * 0.9) * 0.28
        + Math.sin((cell.x * 0.7 + cell.z * 0.4) * 0.6 + t * 0.5) * 0.18
      if (ripple) {
        const d = Math.hypot(cell.x - this.hit.x, cell.z - this.hit.z)
        h += Math.exp(-(d * d) / 5) * 1.5 + Math.sin(d * 2.4 - t * 4.5) * Math.exp(-d * 0.45) * 0.28
      }
      h = Math.max(0.12, h)
      this.dummy.position.set(cell.x, 0, cell.z)
      this.dummy.scale.set(1, h, 1)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)

      // Color por altura: marrón profundo → ámbar → miel; el borde exterior se funde con la niebla.
      const k = Math.min(1, Math.max(0, (h - 0.15) / 1.8))
      this.color.copy(DEEP).lerp(AMBER, Math.min(1, k * 1.9))
      if (k > 0.4) this.color.lerp(HONEY, (k - 0.4) / 0.6)
      this.mesh.setColorAt(i, this.color)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor!.needsUpdate = true

    this.updateGraph(t)
    this.renderer.render(this.scene, this.camera)
  }

  private updateGraph(t: number): void {
    for (const node of this.nodes) {
      const angle = node.orbit + t * node.speed
      node.object.position.set(
        Math.cos(angle) * node.radius,
        node.height + Math.sin(t * 0.6 + node.phase) * 0.35,
        Math.sin(angle) * node.radius * 0.7 - 1.5,
      )
      node.glow.material.opacity = 0.65 + Math.sin(t * 1.4 + node.phase) * 0.25
    }
    let cursor = 0
    const out = this.linkPositions
    for (let a = 0; a < this.nodes.length; a++) {
      for (let b = a + 1; b < this.nodes.length; b++) {
        const pa = this.nodes[a].object.position, pb = this.nodes[b].object.position
        if (pa.distanceTo(pb) > LINK_DISTANCE) continue
        out[cursor++] = pa.x; out[cursor++] = pa.y; out[cursor++] = pa.z
        out[cursor++] = pb.x; out[cursor++] = pb.y; out[cursor++] = pb.z
      }
    }
    const attribute = this.links.geometry.getAttribute('position') as Float32BufferAttribute
    attribute.needsUpdate = true
    this.links.geometry.setDrawRange(0, cursor / 3)
  }

  dispose(): void {
    this.disposed = true
    this.pause()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
    this.mesh.dispose()
    this.links.geometry.dispose()
    ;(this.links.material as LineBasicMaterial).dispose()
    for (const node of this.nodes) {
      node.glow.material.dispose()
      ;(node.object as Mesh).material instanceof MeshBasicMaterial && ((node.object as Mesh).material as MeshBasicMaterial).dispose()
    }
    ;(this.nodes[0]?.object as Mesh | undefined)?.geometry.dispose()
    this.glowMap.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
