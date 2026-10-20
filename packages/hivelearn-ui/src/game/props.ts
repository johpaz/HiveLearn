/**
 * Piezas de escenografía de las compuertas: un portal por checkpoint y, en el último nivel, el núcleo de La Reina.
 * Son geometría procedural (sirve de respaldo a modelos .glb). El estado de la compuerta cambia su color y su brillo.
 */
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import {
  AnimationMixer, CylinderGeometry, Group, IcosahedronGeometry, Mesh, Object3D, MeshStandardNodeMaterial, AdditiveBlending, MeshBasicNodeMaterial, RingGeometry, TorusGeometry, CircleGeometry,
} from 'three/webgpu'
import { portalVeilMaterial, ringMaterial } from './materials'
import type { CellVisual } from './layout'

const GATE_COLOR: Partial<Record<CellVisual, { color: string; level: number }>> = {
  locked: { color: '#2b4766', level: 0.35 },
  ready: { color: '#7dffd8', level: 1.7 },
  passed: { color: '#ffd966', level: 1.2 },
  hold: { color: '#ff7a6b', level: 1.1 },
  review: { color: '#b99cff', level: 1.0 },
}

export class GateProp {
  readonly group = new Group()
  private readonly ring = ringMaterial('#22d3ee', 1)
  private readonly veil = portalVeilMaterial()
  private readonly outer: Mesh
  private readonly inner: Mesh
  private readonly disc: Mesh
  private core: Mesh | null = null
  private readonly beam: Mesh | null = null
  private readonly pylons: Mesh[] = []
  private mixer: AnimationMixer | null = null
  private lastTime = 0
  private modelParts: Object3D[] = []
  private visual: CellVisual = 'locked'

  constructor(readonly final: boolean) {
    this.outer = new Mesh(new TorusGeometry(final ? 1.25 : 0.95, 0.07, 10, 48), this.ring.material)
    this.outer.position.y = final ? 2.0 : 1.35
    this.inner = new Mesh(new TorusGeometry(final ? 0.95 : 0.7, 0.035, 8, 40), this.ring.material)
    this.inner.position.copy(this.outer.position)
    this.disc = new Mesh(new CircleGeometry(final ? 1.2 : 0.9, 40), this.veil.material)
    this.disc.position.copy(this.outer.position)
    this.group.add(this.outer, this.inner, this.disc)
    const pylonMaterial = new MeshStandardNodeMaterial({ color: '#141c2b', roughness: 0.35, metalness: 0.85 })
    for (const side of [-1, 1]) {
      const pylon = new Mesh(new CylinderGeometry(0.08, 0.12, this.outer.position.y * 1.3, 8), pylonMaterial)
      pylon.position.set(side * (final ? 1.25 : 0.95), this.outer.position.y * 0.65, 0)
      this.pylons.push(pylon)
      this.group.add(pylon)
    }
    if (final) {
      const coreMaterial = new MeshStandardNodeMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 2.6, roughness: 0.25, metalness: 0.5 })
      this.core = new Mesh(new IcosahedronGeometry(0.5, 1), coreMaterial)
      this.core.position.y = 2.0
      const beamMaterial = new MeshBasicNodeMaterial({ color: '#ffd966', transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false })
      this.beam = new Mesh(new CylinderGeometry(0.16, 0.5, 9, 14, 1, true), beamMaterial)
      this.beam.position.y = 4.8
      this.group.add(this.core, this.beam)
    }
  }

  /** Marco de Blender (base, pilares y lámparas) en lugar de los pilares procedurales. */
  useFrame(gltf: GLTF): void {
    for (const p of this.pylons) this.group.remove(p)
    this.pylons.length = 0
    const frame = gltf.scene.clone(true)
    if (this.final) frame.scale.setScalar(1.3)
    this.group.add(frame)
    this.modelParts.push(frame)
  }

  /** Núcleo de La Reina de Blender (gema, anillos y púas animados) en lugar del icosaedro procedural. */
  useCore(gltf: GLTF): void {
    if (!this.final) return
    if (this.core) this.group.remove(this.core)
    this.core = null
    const model = gltf.scene.clone(true)
    model.position.y = 2.0
    model.scale.setScalar(1.15)
    this.group.add(model)
    this.modelParts.push(model)
    if (gltf.animations.length > 0) {
      this.mixer = new AnimationMixer(model)
      for (const clip of gltf.animations) this.mixer.clipAction(clip).play()
    }
  }

  setVisual(visual: CellVisual): void {
    this.visual = visual
    const look = GATE_COLOR[visual] ?? GATE_COLOR.locked!
    this.ring.tint.value.set(look.color)
    this.veil.tint.value.set(look.color)
  }

  update(time: number, reduced: boolean): void {
    const look = GATE_COLOR[this.visual] ?? GATE_COLOR.locked!
    const pulse = this.visual === 'ready' && !reduced ? 0.75 + 0.25 * Math.sin(time * 4) : 1
    this.ring.intensity.value = look.level * pulse
    this.veil.intensity.value = (this.visual === 'locked' ? 0.08 : this.visual === 'ready' ? 0.55 : 0.28) * pulse
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime))
    this.lastTime = time
    if (!reduced) this.mixer?.update(dt)
    if (reduced) return
    this.inner.rotation.z = time * 0.9
    this.outer.rotation.z = -time * 0.25
    if (this.core) {
      this.core.rotation.x = time * 0.6
      this.core.rotation.y = time * 0.9
      this.core.position.y = 2.0 + Math.sin(time * 1.6) * 0.1
    }
  }

  dispose(): void {
    this.group.traverse(o => {
      const mesh = o as Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
  }
}

/** Anillo plano bajo una isla, para dar sensación de estación orbital. */
export function haloRing(radius: number, material: MeshBasicNodeMaterial): Mesh {
  const mesh = new Mesh(new RingGeometry(radius, radius + 0.12, 64), material)
  mesh.rotation.x = -Math.PI / 2
  return mesh
}
