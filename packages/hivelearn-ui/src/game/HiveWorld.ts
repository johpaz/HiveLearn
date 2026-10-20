/**
 * Escena del juego: dibuja un `WorldDescription` (islas de celdas hexagonales, compuertas y puentes) y anima los
 * cambios de estado. Solo muestra; no decide nada de lo pedagógico (eso es del servidor).
 *  - un único `InstancedMesh` para todas las celdas, sin postproceso;
 *  - con `reducedMotion` no hay bucle: se dibuja un cuadro por cambio y las transiciones saltan al valor final;
 *  - se pausa con la pestaña oculta y limita el devicePixelRatio.
 */
import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute,
  Fog, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Points,
  PointsMaterial, Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer, ConeGeometry,
} from 'three'
import type { CellVisual, WorldCell, WorldDescription } from './layout'

export interface HiveWorldOptions { reducedMotion: boolean }

const COLORS: Record<CellVisual, string> = {
  locked: '#3b2d17',
  available: '#c2801c',
  tried: '#c4573b',
  mastered: '#ffc933',
  ready: '#fff1c2',
  passed: '#ffd966',
  hold: '#ff7a6b',
  review: '#b99cff',
}
const HEIGHTS: Record<CellVisual, number> = {
  locked: 0.25, available: 0.55, tried: 0.5, mastered: 1.05, ready: 0.9, passed: 1.2, hold: 0.7, review: 0.8,
}
const MAX_CELLS = 96
const PARTICLES = 90

interface Animated { cell: WorldCell; h: number; hTarget: number; color: Color; colorTarget: Color; shake: number; flash: number; flashColor: Color }

export class HiveWorld {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(40, 1, 0.1, 140)
  private mesh: InstancedMesh
  private crown: Mesh
  private bridgeGroup = new Group()
  private bee = new Group()
  private wings: Mesh[] = []
  private particles: Points
  private particleData = { pos: new Float32Array(PARTICLES * 3), vel: new Float32Array(PARTICLES * 3), life: new Float32Array(PARTICLES) }
  private cells: Animated[] = []
  private world: WorldDescription | null = null
  private selected: string | null = null
  private overview = false
  private pointer = new Vector2()
  private raycaster = new Raycaster()
  private dummy = new Object3D()
  private camTarget = new Vector3()
  private camPos = new Vector3()
  private beeTarget = new Vector3()
  private width = 1
  private height = 1
  private running = false
  private disposed = false
  private snapCamera = true
  private frame = 0
  private last = 0
  private time = 0
  private onPick: ((cellId: string | null) => void) | null = null

  constructor(private canvas: HTMLCanvasElement, private options: HiveWorldOptions) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.scene.background = new Color('#120c05')
    this.scene.fog = new Fog('#120c05', 22, 70)
    this.scene.add(new AmbientLight('#ffe9b5', 1.1))
    const sun = new DirectionalLight('#fff3d1', 2.2)
    sun.position.set(6, 14, 8)
    this.scene.add(sun)

    const geometry = new CylinderGeometry(0.94, 0.94, 1, 6)
    const material = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 })
    this.mesh = new InstancedMesh(geometry, material, MAX_CELLS)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)

    this.crown = new Mesh(new ConeGeometry(0.55, 0.8, 5), new MeshStandardMaterial({ color: '#ffd23f', roughness: 0.3, metalness: 0.6, emissive: '#6b4a00' }))
    this.crown.visible = false
    this.scene.add(this.crown)
    this.scene.add(this.bridgeGroup)

    const body = new Mesh(new SphereGeometry(0.28, 16, 12), new MeshStandardMaterial({ color: '#ffc933', emissive: '#7a5200', roughness: 0.4 }))
    body.scale.set(1, 0.85, 1.25)
    this.bee.add(body)
    const wingMat = new MeshBasicMaterial({ color: '#fff7dc', transparent: true, opacity: 0.7, side: DoubleSide })
    for (const side of [-1, 1]) {
      const wing = new Mesh(new SphereGeometry(0.22, 10, 8), wingMat)
      wing.scale.set(0.9, 0.12, 1.4)
      wing.position.set(side * 0.28, 0.2, 0)
      this.wings.push(wing)
      this.bee.add(wing)
    }
    this.scene.add(this.bee)

    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(this.particleData.pos, 3))
    this.particles = new Points(geo, new PointsMaterial({ color: '#ffd966', size: 0.16, transparent: true, opacity: 0.95, depthWrite: false }))
    this.particles.frustumCulled = false
    this.particles.visible = false
    this.scene.add(this.particles)

    canvas.addEventListener('pointerdown', this.handlePointer)
    canvas.addEventListener('pointermove', this.handleMove)
    this.camera.position.set(0, 12, 12)
  }

  setPickHandler(handler: (cellId: string | null) => void): void { this.onPick = handler }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.renderer.setSize(this.width, this.height, false)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    this.renderNow()
  }

  /** Aplica un mundo nuevo conservando la animación de las celdas que ya existían. */
  setWorld(world: WorldDescription): void {
    const previous = new Map(this.cells.map(a => [a.cell.id, a]))
    this.world = world
    this.cells = world.cells.slice(0, MAX_CELLS).map(cell => {
      const old = previous.get(cell.id)
      const target = new Color(COLORS[cell.visual])
      const hTarget = HEIGHTS[cell.visual]
      if (old) return { ...old, cell, hTarget, colorTarget: target }
      // Celda nueva: nace desde el suelo (el plan creció) y sube.
      return { cell, h: this.options.reducedMotion ? hTarget : 0.02, hTarget, color: this.options.reducedMotion ? target.clone() : new Color('#fff1c2'), colorTarget: target, shake: 0, flash: 0, flashColor: new Color('#ffffff') }
    })
    this.mesh.count = this.cells.length
    this.buildBridges(world)
    if (!this.options.reducedMotion) this.start(); else { this.snap(); this.renderNow() }
  }

  select(cellId: string | null): void {
    this.selected = cellId
    this.syncBeeTarget()
    this.renderNow()
  }

  /** Posición en pantalla (píxeles CSS del lienzo) de la parte superior de una celda; null si no existe o no se ve. */
  screenPosition(cellId: string): { x: number; y: number } | null {
    const a = this.cells.find(c => c.cell.id === cellId)
    if (!a) return null
    this.camera.updateMatrixWorld()
    const p = new Vector3(a.cell.x, a.h, a.cell.z).project(this.camera)
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null
    const rect = this.canvas.getBoundingClientRect()
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height }
  }

  setOverview(on: boolean): void { this.overview = on; this.renderNow() }

  /** Reacción a una respuesta: destello de color y, si acertó, lluvia de miel. */
  react(cellId: string, kind: 'ok' | 'bad'): void {
    const a = this.cells.find(c => c.cell.id === cellId)
    if (!a) return
    a.flash = 1
    a.flashColor = new Color(kind === 'ok' ? '#fff7c4' : '#ff5a4a')
    if (kind === 'bad') a.shake = 1
    if (kind === 'ok' && !this.options.reducedMotion) this.burst(a.cell.x, HEIGHTS.mastered, a.cell.z)
    this.renderNow()
  }

  start(): void {
    if (this.running || this.disposed || this.options.reducedMotion) return
    this.running = true
    this.last = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      this.frame = requestAnimationFrame(loop)
      if (document.hidden) { this.last = now; return }
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.time += dt
      this.step(dt)
      this.draw()
    }
    this.frame = requestAnimationFrame(loop)
  }

  /** Cuadro bajo demanda cuando no hay bucle (movimiento reducido). */
  private renderNow(): void {
    if (this.disposed || this.running) return
    this.step(0.3)
    this.draw()
  }

  private snap(): void {
    for (const a of this.cells) { a.h = a.hTarget; a.color.copy(a.colorTarget); a.shake = 0; a.flash = 0 }
  }

  private syncBeeTarget(): void {
    const a = this.cells.find(c => c.cell.id === this.selected)
    const focus = a?.cell ?? this.world?.cells.find(c => c.level === (this.world?.islands.find(i => i.status === 'active')?.index ?? 0) && c.kind === 'node')
    if (focus) this.beeTarget.set(focus.x, 2.1, focus.z)
  }

  private step(dt: number): void {
    const k = this.options.reducedMotion ? 1 : 1 - Math.exp(-dt * 7)
    for (const a of this.cells) {
      a.h += (a.hTarget - a.h) * k
      a.color.lerp(a.colorTarget, k)
      a.shake = Math.max(0, a.shake - dt * 2.4)
      a.flash = Math.max(0, a.flash - dt * 1.6)
    }
    this.syncBeeTarget()
    // cámara: sigue la isla activa o la celda elegida; en vista general se aleja y centra el mapa
    const w = this.world
    if (w) {
      const sel = this.cells.find(c => c.cell.id === this.selected)?.cell
      let tx = sel ? sel.x : w.focus.x
      let tz = sel ? sel.z : w.focus.z
      let dist = 15
      if (this.overview) {
        tx = (w.bounds.minX + w.bounds.maxX) / 2
        tz = (w.bounds.minZ + w.bounds.maxZ) / 2
        dist = Math.max(14, (w.bounds.maxX - w.bounds.minX) * 0.62 + 6)
      }
      const aspect = this.camera.aspect
      if (aspect < 1) dist *= 1 + (1 - aspect) * 0.9
      const kc = this.options.reducedMotion || this.snapCamera ? 1 : k * 0.6
      this.camTarget.lerp(new Vector3(tx, 0, tz), kc)
      const want = new Vector3(this.camTarget.x + this.pointer.x * 1.2, dist * 0.95, this.camTarget.z + dist * 0.82 - this.pointer.y * 0.8)
      this.camPos.lerp(want, kc)
      this.camera.position.copy(this.camPos)
      this.camera.lookAt(this.camTarget)
    }
    this.bee.position.lerp(this.beeTarget, this.options.reducedMotion || this.snapCamera ? 1 : k * 0.8)
    if (this.world) this.snapCamera = false
    if (!this.options.reducedMotion) {
      this.bee.position.y += Math.sin(this.time * 3) * 0.004
      this.wings.forEach((wing, i) => { wing.rotation.z = Math.sin(this.time * 38) * 0.5 * (i === 0 ? 1 : -1) })
    }
    this.stepParticles(dt)
  }

  private draw(): void {
    let crownCell: Animated | null = null
    for (let i = 0; i < this.cells.length; i++) {
      const a = this.cells[i]!
      const selected = a.cell.id === this.selected
      const lift = selected ? 0.22 : 0
      const pulse = a.cell.visual === 'ready' && !this.options.reducedMotion ? 0.12 * Math.sin(this.time * 4) : 0
      const shakeX = a.shake > 0 ? Math.sin(this.time * 60) * 0.12 * a.shake : 0
      const h = Math.max(0.02, a.h + lift + pulse)
      this.dummy.position.set(a.cell.x + shakeX, h / 2, a.cell.z)
      this.dummy.scale.set(1, h, 1)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
      const c = a.color.clone()
      if (selected) c.offsetHSL(0, 0, 0.12)
      if (a.flash > 0) c.lerp(a.flashColor, Math.min(1, a.flash))
      this.mesh.setColorAt(i, c)
      if (a.cell.kind === 'gate' && a.cell.levelKind === 'final') crownCell = a
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true

    if (crownCell) {
      this.crown.visible = true
      this.crown.position.set(crownCell.cell.x, crownCell.h + 0.7 + (this.options.reducedMotion ? 0 : Math.sin(this.time * 2) * 0.08), crownCell.cell.z)
      this.crown.rotation.y = this.options.reducedMotion ? 0 : this.time * 0.8
    } else this.crown.visible = false
    this.renderer.render(this.scene, this.camera)
  }

  private buildBridges(world: WorldDescription): void {
    this.disposeBridges()
    for (const b of world.bridges) {
      const dx = b.to.x - b.from.x
      const dz = b.to.z - b.from.z
      const length = Math.hypot(dx, dz)
      const mat = new MeshStandardMaterial({
        color: b.open ? '#ffd966' : b.reinforcement ? '#7a4a3a' : '#3b2d17',
        roughness: 0.6, transparent: !b.open, opacity: b.open ? 1 : 0.55,
      })
      const mesh = new Mesh(new BoxGeometry(length, 0.12, 0.5), mat)
      mesh.position.set((b.from.x + b.to.x) / 2, 0.06, (b.from.z + b.to.z) / 2)
      mesh.rotation.y = -Math.atan2(dz, dx)
      this.bridgeGroup.add(mesh)
    }
  }

  private disposeBridges(): void {
    for (const child of [...this.bridgeGroup.children]) {
      const m = child as Mesh
      m.geometry.dispose()
      ;(m.material as MeshStandardMaterial).dispose()
      this.bridgeGroup.remove(child)
    }
  }

  private burst(x: number, y: number, z: number): void {
    const { pos, vel, life } = this.particleData
    for (let i = 0; i < PARTICLES; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
      const angle = Math.random() * Math.PI * 2
      const speed = 1 + Math.random() * 2.4
      vel[i * 3] = Math.cos(angle) * speed
      vel[i * 3 + 1] = 2 + Math.random() * 3
      vel[i * 3 + 2] = Math.sin(angle) * speed
      life[i] = 0.9 + Math.random() * 0.5
    }
    this.particles.visible = true
  }

  private stepParticles(dt: number): void {
    if (!this.particles.visible) return
    const { pos, vel, life } = this.particleData
    let alive = 0
    for (let i = 0; i < PARTICLES; i++) {
      if (life[i]! <= 0) continue
      life[i]! -= dt
      vel[i * 3 + 1]! -= 7 * dt
      pos[i * 3]! += vel[i * 3]! * dt
      pos[i * 3 + 1]! += vel[i * 3 + 1]! * dt
      pos[i * 3 + 2]! += vel[i * 3 + 2]! * dt
      if (life[i]! > 0) alive++
      else pos[i * 3 + 1] = -50
    }
    ;(this.particles.geometry.getAttribute('position') as Float32BufferAttribute).needsUpdate = true
    if (alive === 0) this.particles.visible = false
  }

  private toNdc(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1))
  }

  private pickAt(): string | null {
    if (this.cells.length === 0) return null
    // InstancedMesh.raycast descarta todo si su esfera de contorno quedó vacía (se calculó antes de colocar las celdas).
    this.mesh.computeBoundingSphere()
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObject(this.mesh)[0]
    if (!hit || hit.instanceId === undefined) return null
    const a = this.cells[hit.instanceId]
    return a && a.cell.real ? a.cell.id : null
  }

  private handleMove = (event: PointerEvent): void => {
    this.toNdc(event)
    this.canvas.style.cursor = this.pickAt() ? 'pointer' : 'default'
  }

  private handlePointer = (event: PointerEvent): void => {
    this.toNdc(event)
    const id = this.pickAt()
    if (id) this.onPick?.(id)
  }

  dispose(): void {
    this.disposed = true
    this.running = false
    cancelAnimationFrame(this.frame)
    this.canvas.removeEventListener('pointerdown', this.handlePointer)
    this.canvas.removeEventListener('pointermove', this.handleMove)
    this.disposeBridges()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
    this.mesh.dispose()
    this.crown.geometry.dispose()
    ;(this.crown.material as MeshStandardMaterial).dispose()
    this.particles.geometry.dispose()
    ;(this.particles.material as PointsMaterial).dispose()
    for (const child of this.bee.children) {
      const m = child as Mesh
      m.geometry.dispose()
      ;(m.material as MeshStandardMaterial | MeshBasicMaterial).dispose()
    }
    this.renderer.dispose()
  }
}
