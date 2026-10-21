/**
 * Mundo 3D de HiveLearn: una estación de plataformas hexagonales holográficas en el espacio. Este módulo orquesta la
 * escena (baldosas, bases de isla, puentes de energía, portales, dron, cielo, partículas), la cámara y la entrada; las
 * posiciones y estados vienen de `layout.ts` (puro, probado) y el progreso de verdad lo decide siempre el servidor.
 *
 * Contrato con `GameShell`: `create`, `setPickHandler`, `resize`, `setWorld`, `select`, `setOverview`, `react`,
 * `start`, `screenPosition`, `dispose` (más los controles del dron y la calidad).
 */
import {
  Color, CylinderGeometry, DirectionalLight, Fog, HemisphereLight, InstancedBufferAttribute, InstancedMesh,
  Mesh, Object3D, PerspectiveCamera, PlaneGeometry, Plane, Raycaster, Scene, SphereGeometry, Vector2, Vector3,
} from 'three/webgpu'
import type { WorldCell, WorldDescription } from './layout'
import { TIERS, QualityGovernor, type QualityTier, type RenderStats } from './quality'
import { createGameRenderer, type GameRenderer } from './renderer'
import { LOOK, bridgeMaterial, padMaterial, platformMaterial, skyMaterial } from './materials'
import { createProceduralDrone, type DroneRig } from './drone'
import { GateProp } from './props'
import { Particles } from './fx'
import { loadModel } from './models'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import {
  buildWalkable, focusCell, keysToInput, padRadius, routeToCell, stepMover, type Mover, type Vec2, type Walkable,
} from './controller'

const MAX_CELLS = 96
const HOVER = 1.55

export interface HiveWorldOptions { reducedMotion: boolean; tier: QualityTier }
export interface WorldHandlers {
  /** El jugador eligió una celda (clic, `E`/Enter/Espacio sobre la enfocada) o `null` (Escape). */
  pick?: (cellId: string | null) => void
  /** El dron se acercó a una celda (o se alejó de todas). */
  focus?: (cellId: string | null) => void
  /** Velocidad del dron en cada cuadro (para el zumbido del audio). */
  thrust?: (speed: number) => void
  /** La calidad bajó sola porque el equipo iba lento. */
  quality?: (tier: QualityTier) => void
  /** El jugador pidió el panel de diagnóstico (F3). */
  debug?: () => void
}

interface Animated {
  cell: WorldCell
  h: number; hTarget: number
  tint: Color; tintTarget: Color
  glow: number; glowTarget: number
  shake: number; flash: number
}

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
const INTERACT_KEYS = new Set(['e', 'E', 'Enter', ' '])

export class HiveWorld {
  static async create(canvas: HTMLCanvasElement, options: HiveWorldOptions): Promise<HiveWorld> {
    const scene = new Scene()
    const camera = new PerspectiveCamera(42, 1, 0.1, 600)
    const gr = await createGameRenderer(canvas, scene, camera, options.tier)
    const world = new HiveWorld(canvas, options, scene, camera, gr)
    void world.loadModels()
    return world
  }

  private portalModel: GLTF | null = null
  private coreModel: GLTF | null = null

  /** Carga los modelos de Blender en segundo plano; mientras tanto (o si fallan) se ven las piezas procedurales. */
  private async loadModels(): Promise<void> {
    const [drone, portal, core] = await Promise.all([loadModel('drone'), loadModel('portal'), loadModel('core')])
    if (this.disposed) return
    if (drone) this.drone.useModel(drone)
    this.portalModel = portal
    this.coreModel = core
    for (const gate of this.gates.values()) this.dress(gate)
    this.renderNow()
  }

  private dress(gate: GateProp): void {
    if (this.portalModel) gate.useFrame(this.portalModel)
    if (this.coreModel) gate.useCore(this.coreModel)
  }

  private cells: Animated[] = []
  private world: WorldDescription | null = null
  private walkable: Walkable | null = null
  private selected: string | null = null
  private focused: string | null = null
  private overview = false
  private handlers: WorldHandlers = {}

  private readonly mesh: InstancedMesh
  private readonly tintAttr: InstancedBufferAttribute
  private readonly infoAttr: InstancedBufferAttribute
  private readonly sky: Mesh
  private readonly sun: DirectionalLight
  private readonly bridgeGroup = new Object3D()
  private readonly padGroup = new Object3D()
  private pads: Array<{ mesh: Mesh; tint: { value: Color }; glow: { value: number } }> = []
  private gates = new Map<string, GateProp>()
  private readonly drone: DroneRig
  private readonly particles: Particles
  private readonly governor: QualityGovernor

  private mover: Mover = { x: 0, z: 0, vx: 0, vz: 0 }
  private heading = 0
  private route: Vec2[] = []
  private readonly keys = new Set<string>()
  private axis: Vec2 = { x: 0, z: 0 }
  private groundY = 0.5
  private activeIsland = -1

  private readonly pointer = new Vector2()
  private readonly raycaster = new Raycaster()
  private readonly floor = new Plane(new Vector3(0, 1, 0), -0.5)
  private readonly dummy = new Object3D()
  private readonly camTarget = new Vector3()
  private readonly camPos = new Vector3()
  private kick = 0
  private width = 1
  private height = 1
  private running = false
  private disposed = false
  private snapCamera = true
  private frame = 0
  private last = 0
  private time = 0
  private frameEma = 16.7

  /** Medición para el panel de diagnóstico: promedio móvil del tiempo por cuadro. */
  stats(): RenderStats { return { backend: this.gr.backend, tier: this.governor.tier, fps: 1000 / this.frameEma, frameMs: this.frameEma } }

  get backend(): 'webgpu' | 'webgl2' { return this.gr.backend }
  get tier(): QualityTier { return this.governor.tier }

  private constructor(private canvas: HTMLCanvasElement, private options: HiveWorldOptions, private scene: Scene, private camera: PerspectiveCamera, private gr: GameRenderer) {
    scene.fog = new Fog('#070a18', 34, 120)
    scene.add(new HemisphereLight('#6aa9ff', '#1b1038', 1.0))
    this.sun = new DirectionalLight('#d6ecff', 2.3)
    this.sun.position.set(8, 16, 6)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 70 })
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.03
    scene.add(this.sun, this.sun.target)

    this.sky = new Mesh(new SphereGeometry(300, 32, 20), skyMaterial())
    this.sky.frustumCulled = false
    scene.add(this.sky)

    const geometry = new CylinderGeometry(0.94, 0.94, 1, 6)
    this.tintAttr = new InstancedBufferAttribute(new Float32Array(MAX_CELLS * 3), 3)
    this.infoAttr = new InstancedBufferAttribute(new Float32Array(MAX_CELLS * 2), 2)
    geometry.setAttribute('aTint', this.tintAttr)
    geometry.setAttribute('aInfo', this.infoAttr)
    this.mesh = new InstancedMesh(geometry, platformMaterial(), MAX_CELLS)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    scene.add(this.mesh, this.padGroup, this.bridgeGroup)

    const t = TIERS[options.tier]
    this.particles = new Particles(TIERS.high.particles, TIERS.high.motes)
    this.particles.limit(t.particles, t.motes)
    scene.add(this.particles.burstMesh, this.particles.moteMesh)

    this.drone = createProceduralDrone()
    scene.add(this.drone.group)

    this.governor = new QualityGovernor(options.tier)
    this.camera.position.set(0, 14, 12)

    canvas.addEventListener('pointerdown', this.handlePointer)
    canvas.addEventListener('pointermove', this.handleMove)
    canvas.addEventListener('keydown', this.handleKeyDown)
    canvas.addEventListener('keyup', this.handleKeyUp)
    canvas.addEventListener('blur', this.handleBlur)
  }

  /** Joystick virtual (táctil): eje -1..1 que se suma al teclado. */
  setAxis(axis: Vec2): void { this.axis = axis }

  setPickHandler(handler: (cellId: string | null) => void): void { this.handlers.pick = handler }
  setHandlers(handlers: WorldHandlers): void { this.handlers = { ...this.handlers, ...handlers } }

  setTier(tier: QualityTier): void {
    this.governor.set(tier)
    this.applyTier(tier)
  }

  private applyTier(tier: QualityTier): void {
    this.gr.setTier(tier)
    this.particles.limit(TIERS[tier].particles, TIERS[tier].motes)
    this.renderNow()
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.gr.resize(this.width, this.height)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    this.renderNow()
  }

  /** Aplica un mundo nuevo conservando la animación de las celdas que ya existían. */
  setWorld(world: WorldDescription): void {
    const previous = new Map(this.cells.map(a => [a.cell.id, a]))
    const firstWorld = this.world === null
    this.world = world
    this.walkable = buildWalkable(world)
    this.cells = world.cells.slice(0, MAX_CELLS).map(cell => {
      const look = LOOK[cell.visual]
      const old = previous.get(cell.id)
      if (old) return { ...old, cell, hTarget: look.height, tintTarget: new Color(look.color), glowTarget: look.glow }
      const born = !this.options.reducedMotion && !firstWorld
      return {
        cell, h: born ? 0.02 : look.height, hTarget: look.height,
        tint: born ? new Color('#ffffff') : new Color(look.color), tintTarget: new Color(look.color),
        glow: born ? 2.2 : look.glow, glowTarget: look.glow, shake: 0, flash: born ? 1 : 0,
      }
    })
    this.mesh.count = this.cells.length
    this.buildPads(world)
    this.buildBridges(world)
    this.buildGates(world)

    const island = world.islands.find(i => i.status === 'active')?.index ?? 0
    if (firstWorld) {
      const start = world.cells.find(c => c.level === island && c.kind === 'node' && c.real && c.visual !== 'mastered')
        ?? world.cells.find(c => c.level === island && c.real)
      if (start) this.mover = { x: start.x, z: start.z, vx: 0, vz: 0 }
    } else if (island !== this.activeIsland) {
      // Cambio de nivel: la cámara se aleja un instante, el portal destella y el dron cruza al nuevo nivel.
      this.kick = this.options.reducedMotion ? 0 : 1
      this.gr.bloomBoost.value = this.options.reducedMotion ? 0 : 1.2
      const arrival = world.cells.find(c => c.level === island && c.kind === 'node' && c.real)
      if (arrival) this.flyTo(arrival)
    }
    this.activeIsland = island
    if (this.options.reducedMotion) { this.snap(); this.renderNow() } else this.start()
  }

  select(cellId: string | null): void {
    this.selected = cellId
    const cell = cellId ? this.cells.find(c => c.cell.id === cellId)?.cell : undefined
    if (cell && this.world) this.flyTo(cell)
    this.renderNow()
  }

  setOverview(on: boolean): void { this.overview = on; this.renderNow() }

  /** Posición del dron (para pruebas y para el HUD). */
  dronePosition(): Vec2 { return { x: this.mover.x, z: this.mover.z } }
  focusedCell(): string | null { return this.focused }

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

  /** Reacción a una respuesta: destello, temblor o ráfaga de chispas. */
  react(cellId: string, kind: 'ok' | 'bad'): void {
    const a = this.cells.find(c => c.cell.id === cellId)
    if (!a) return
    a.flash = 1
    if (kind === 'bad') a.shake = 1
    const origin = { x: a.cell.x, y: a.h + 0.4, z: a.cell.z }
    if (!this.options.reducedMotion) {
      this.particles.burst(origin, kind === 'ok' ? '#ffc933' : '#ff4d4d', kind === 'ok' ? 70 : 34, kind === 'ok' ? 1 : 0.7)
      if (a.cell.kind === 'gate') { this.gr.bloomBoost.value = 1.4; this.kick = Math.max(this.kick, 0.4) }
    }
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
      const frameMs = now - this.last
      this.last = now
      this.time += dt
      if (frameMs > 0 && frameMs < 250) this.frameEma += (frameMs - this.frameEma) * 0.05
      this.step(dt)
      this.gr.render()
      const lowered = this.governor.sample(frameMs)
      if (lowered) { this.applyTier(lowered); this.handlers.quality?.(lowered) }
    }
    this.frame = requestAnimationFrame(loop)
  }

  /** Un cuadro bajo demanda cuando no hay bucle (movimiento reducido). */
  private renderNow(): void {
    if (this.disposed || this.running) return
    this.step(0.3)
    this.gr.render()
  }

  private snap(): void {
    for (const a of this.cells) { a.h = a.hTarget; a.tint.copy(a.tintTarget); a.glow = a.glowTarget; a.shake = 0; a.flash = 0 }
  }

  /** Manda al dron a una celda (por puentes si hace falta). Sin movimiento, aparece allí. */
  private flyTo(cell: WorldCell): void {
    if (!this.world) return
    const route = routeToCell(this.world, this.mover, cell)
    if (this.options.reducedMotion) {
      const end = route.at(-1) ?? this.mover
      this.mover = { x: end.x, z: end.z, vx: 0, vz: 0 }
      this.route = []
    } else this.route = route
  }

  private step(dt: number): void {
    const world = this.world
    // ── dron ──────────────────────────────────────────────────────────────────────────────
    const pressed = keysToInput(this.keys)
    let input = { x: Math.max(-1, Math.min(1, pressed.x + this.axis.x)), z: Math.max(-1, Math.min(1, pressed.z + this.axis.z)) }
    if (input.x !== 0 || input.z !== 0) this.route = []
    let walkable = this.walkable
    let speed = 5.4
    if (this.route.length > 0) {
      const target = this.route[0]!
      const dx = target.x - this.mover.x
      const dz = target.z - this.mover.z
      const distance = Math.hypot(dx, dz)
      if (distance < 0.18) this.route.shift()
      else input = { x: dx / distance, z: dz / distance }
      walkable = null
      speed = 7.2
    }
    this.mover = stepMover(this.mover, input, dt, walkable, { speed })
    const velocity = Math.hypot(this.mover.vx, this.mover.vz)
    this.handlers.thrust?.(velocity)
    if (velocity > 0.4) {
      const want = Math.atan2(-this.mover.vx, -this.mover.vz)
      let delta = want - this.heading
      delta = Math.atan2(Math.sin(delta), Math.cos(delta))
      this.heading += delta * Math.min(1, dt * 9)
    }
    const under = this.cells.find(a => Math.hypot(a.cell.x - this.mover.x, a.cell.z - this.mover.z) < 1.1)
    this.groundY += ((under ? under.h : 0.4) - this.groundY) * Math.min(1, dt * 6)
    const bob = this.options.reducedMotion ? 0 : Math.sin(this.time * 2.4) * 0.07
    this.drone.group.position.set(this.mover.x, this.groundY + HOVER + bob, this.mover.z)
    this.drone.group.rotation.set(0, this.heading, 0)
    ;(this.drone.group.children[0] as Object3D).rotation.set(this.mover.vz * 0.02, 0, -this.mover.vx * 0.02)
    this.drone.update(this.time, velocity, this.groundY)

    // ── foco (la celda más cercana) ───────────────────────────────────────────────────────
    if (world) {
      const near = focusCell(world, this.mover)
      if (near !== this.focused) { this.focused = near; this.handlers.focus?.(near) }
    }

    // ── celdas ────────────────────────────────────────────────────────────────────────────
    const k = this.options.reducedMotion ? 1 : 1 - Math.exp(-dt * 7)
    for (let i = 0; i < this.cells.length; i++) {
      const a = this.cells[i]!
      a.h += (a.hTarget - a.h) * k
      a.tint.lerp(a.tintTarget, k)
      a.glow += (a.glowTarget - a.glow) * k
      a.shake = Math.max(0, a.shake - dt * 2.4)
      a.flash = Math.max(0, a.flash - dt * 1.6)
      const selected = a.cell.id === this.selected
      const focused = a.cell.id === this.focused
      const lift = selected ? 0.22 : focused ? 0.12 : 0
      const pulse = a.cell.visual === 'ready' && !this.options.reducedMotion ? 0.12 * Math.sin(this.time * 4) : 0
      const shakeX = a.shake > 0 ? Math.sin(this.time * 60) * 0.12 * a.shake : 0
      const h = Math.max(0.02, a.h + lift + pulse)
      this.dummy.position.set(a.cell.x + shakeX, h / 2, a.cell.z)
      this.dummy.scale.set(1, h, 1)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
      this.tintAttr.setXYZ(i, a.tint.r, a.tint.g, a.tint.b)
      this.infoAttr.setXY(i, a.glow * (selected ? 1.5 : focused ? 1.25 : 1), a.flash)
      const gate = this.gates.get(a.cell.id)
      if (gate) { gate.group.position.set(a.cell.x, h, a.cell.z); gate.setVisual(a.cell.visual) }
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.tintAttr.needsUpdate = true
    this.infoAttr.needsUpdate = true
    for (const gate of this.gates.values()) gate.update(this.time, this.options.reducedMotion)

    // ── cámara ────────────────────────────────────────────────────────────────────────────
    let tx = this.mover.x
    let tz = this.mover.z
    let dist = 12.5
    if (world && this.overview) {
      tx = (world.bounds.minX + world.bounds.maxX) / 2
      tz = (world.bounds.minZ + world.bounds.maxZ) / 2
      dist = Math.max(15, (world.bounds.maxX - world.bounds.minX) * 0.62 + 7)
    }
    if (this.camera.aspect < 1) dist *= 1 + (1 - this.camera.aspect) * 0.9
    this.kick = Math.max(0, this.kick - dt * 0.55)
    dist *= 1 + this.kick * 0.55
    const kc = this.options.reducedMotion || this.snapCamera ? 1 : 1 - Math.exp(-dt * 3.2)
    this.camTarget.lerp(new Vector3(tx, 0.6, tz), kc)
    this.camPos.lerp(new Vector3(this.camTarget.x + this.pointer.x * 0.8, dist * 0.82, this.camTarget.z + dist * 0.74 - this.pointer.y * 0.5), kc)
    this.camera.position.copy(this.camPos)
    this.camera.lookAt(this.camTarget)
    if (world) this.snapCamera = false
    this.sky.position.copy(this.camera.position)
    this.sun.position.set(this.camTarget.x + 8, 16, this.camTarget.z + 6)
    this.sun.target.position.copy(this.camTarget)

    // ── efectos ───────────────────────────────────────────────────────────────────────────
    this.particles.update(dt, this.time, this.camTarget)
    this.gr.bloomBoost.value = Math.max(0, this.gr.bloomBoost.value - dt * 1.1)
  }

  // ── construcción de piezas ──────────────────────────────────────────────────────────────

  private buildPads(world: WorldDescription): void {
    for (const p of this.pads) { p.mesh.geometry.dispose(); (p.mesh.material as { dispose(): void }).dispose(); this.padGroup.remove(p.mesh) }
    this.pads = world.islands.map(island => {
      const { material, tint, glow } = padMaterial()
      const radius = padRadius(world, island.index)
      const mesh = new Mesh(new CylinderGeometry(0.94, 0.94, 0.22, 6), material)
      mesh.scale.set(radius / 0.94, 1, radius / 0.94)
      mesh.position.set(island.x, -0.16, island.z)
      mesh.receiveShadow = true
      tint.value.set(island.kind === 'reinforcement' ? '#ff9a3d' : island.status === 'closed' ? '#ffc933' : island.status === 'active' ? '#22d3ee' : '#2b4766')
      glow.value = island.status === 'outline' ? 0.35 : 1
      this.padGroup.add(mesh)
      return { mesh, tint, glow }
    })
  }

  private buildBridges(world: WorldDescription): void {
    for (const child of [...this.bridgeGroup.children]) {
      const m = child as Mesh
      m.geometry.dispose()
      ;(m.material as { dispose(): void }).dispose()
      this.bridgeGroup.remove(child)
    }
    for (const b of world.bridges) {
      const dx = b.to.x - b.from.x
      const dz = b.to.z - b.from.z
      const length = Math.hypot(dx, dz)
      const mesh = new Mesh(new PlaneGeometry(length, 0.7), bridgeMaterial(b.open, length, b.reinforcement))
      mesh.rotation.order = 'YXZ'
      mesh.rotation.set(-Math.PI / 2, -Math.atan2(dz, dx), 0)
      mesh.position.set((b.from.x + b.to.x) / 2, 0.12, (b.from.z + b.to.z) / 2)
      this.bridgeGroup.add(mesh)
    }
  }

  private buildGates(world: WorldDescription): void {
    const keep = new Set(world.cells.filter(c => c.kind === 'gate').map(c => c.id))
    for (const [id, gate] of this.gates) {
      if (keep.has(id)) continue
      this.scene.remove(gate.group)
      gate.dispose()
      this.gates.delete(id)
    }
    for (const cell of world.cells) {
      if (cell.kind !== 'gate' || this.gates.has(cell.id)) continue
      const gate = new GateProp(cell.levelKind === 'final')
      this.dress(gate)
      this.scene.add(gate.group)
      this.gates.set(cell.id, gate)
    }
  }

  // ── entrada ─────────────────────────────────────────────────────────────────────────────

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
    this.canvas.focus({ preventScroll: true })
    const id = this.pickAt()
    if (id) { this.handlers.pick?.(id); return }
    // Suelo vacío: el dron va hacia allí si hay camino (toque en pantalla táctil).
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const point = this.raycaster.ray.intersectPlane(this.floor, new Vector3())
    if (!point || !this.world) return
    const island = this.world.islands.reduce((best, i) => (Math.hypot(i.x - point.x, i.z - point.z) < Math.hypot(best.x - point.x, best.z - point.z) ? i : best))
    const probe = { ...this.world.cells[0]!, x: point.x, z: point.z, level: island.index }
    const route = routeToCell(this.world, this.mover, probe)
    if (route.length > 0) { this.route = route; this.renderNow() }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (MOVE_KEYS.has(event.key)) {
      event.preventDefault()
      this.keys.add(event.key)
      if (this.options.reducedMotion) {
        // Sin bucle de animación: cada pulsación es un paso discreto.
        this.mover = stepMover({ ...this.mover, vx: 0, vz: 0 }, keysToInput(this.keys), 0.2, this.walkable, { response: 1000 })
        this.keys.delete(event.key)
        this.renderNow()
      }
    } else if (INTERACT_KEYS.has(event.key)) {
      event.preventDefault()
      if (this.focused) this.handlers.pick?.(this.focused)
    } else if (event.key === '[' || event.key === ']') {
      event.preventDefault()
      this.cycle(event.key === ']' ? 1 : -1)
    } else if (event.key === 'F3') {
      event.preventDefault()
      this.handlers.debug?.()
    } else if (event.key === 'Escape') {
      this.handlers.pick?.(null)
    }
  }

  private handleKeyUp = (event: KeyboardEvent): void => { this.keys.delete(event.key) }
  private handleBlur = (): void => { this.keys.clear() }

  /** Salta a la celda real siguiente o anterior del nivel activo (teclas `]` y `[`). */
  private cycle(direction: 1 | -1): void {
    if (!this.world) return
    const level = this.world.islands.find(i => i.status === 'active')?.index ?? 0
    const ring = this.world.cells.filter(c => c.level === level && c.real)
    if (ring.length === 0) return
    const at = ring.findIndex(c => c.id === (this.focused ?? this.selected))
    const next = ring[(at + direction + ring.length) % ring.length]!
    this.flyTo(next)
    this.renderNow()
  }

  dispose(): void {
    this.disposed = true
    this.running = false
    cancelAnimationFrame(this.frame)
    this.canvas.removeEventListener('pointerdown', this.handlePointer)
    this.canvas.removeEventListener('pointermove', this.handleMove)
    this.canvas.removeEventListener('keydown', this.handleKeyDown)
    this.canvas.removeEventListener('keyup', this.handleKeyUp)
    this.canvas.removeEventListener('blur', this.handleBlur)
    for (const p of this.pads) { p.mesh.geometry.dispose(); (p.mesh.material as { dispose(): void }).dispose() }
    for (const child of this.bridgeGroup.children) { const m = child as Mesh; m.geometry.dispose(); (m.material as { dispose(): void }).dispose() }
    for (const gate of this.gates.values()) gate.dispose()
    this.drone.dispose()
    this.particles.dispose()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as { dispose(): void }).dispose()
    this.sky.geometry.dispose()
    ;(this.sky.material as { dispose(): void }).dispose()
    this.gr.dispose()
  }
}
