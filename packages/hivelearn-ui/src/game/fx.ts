/**
 * Partículas: chispas de ráfaga (aciertos y errores) y motas ambientales que flotan alrededor de la cámara. Son
 * billboards instanciados; la simulación es de CPU (cientos de partículas), sin buffers de cómputo.
 */
import { Color, InstancedMesh, Object3D, PlaneGeometry, type Vector3 } from 'three/webgpu'
import { sparkMaterial } from './materials'

interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number }

export class Particles {
  readonly burstMesh: InstancedMesh
  readonly moteMesh: InstancedMesh
  private readonly sparks: Spark[] = []
  private readonly motes: Array<{ x: number; y: number; z: number; speed: number; phase: number }> = []
  private readonly dummy = new Object3D()
  private readonly color = new Color()

  private activeBurst: number
  private activeMotes: number

  constructor(private burstCount: number, private moteCount: number) {
    this.activeBurst = burstCount
    this.activeMotes = moteCount
    const geometry = new PlaneGeometry(1, 1)
    this.burstMesh = new InstancedMesh(geometry, sparkMaterial(), Math.max(1, burstCount))
    this.moteMesh = new InstancedMesh(geometry, sparkMaterial(), Math.max(1, moteCount))
    for (const mesh of [this.burstMesh, this.moteMesh]) { mesh.frustumCulled = false; mesh.count = 0 }
    for (let i = 0; i < burstCount; i++) this.sparks.push({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1 })
    for (let i = 0; i < moteCount; i++) this.motes.push({ x: (Math.random() - 0.5) * 36, y: Math.random() * 7, z: (Math.random() - 0.5) * 26, speed: 0.15 + Math.random() * 0.35, phase: Math.random() * 6.28 })
  }

  /** Reduce cuántas partículas se usan (calidad más baja); las ya vivas terminan su vida. */
  limit(burst: number, motes: number): void {
    this.activeBurst = Math.min(this.burstCount, burst)
    this.activeMotes = Math.min(this.moteCount, motes)
  }

  /** Ráfaga desde un punto; `gravity` hace caer las chispas (miel) o las deja flotar (datos). */
  burst(origin: Vector3 | { x: number; y: number; z: number }, color: string, amount = 60, spread = 1): void {
    this.color.set(color)
    let spawned = 0
    for (let i = 0; i < this.activeBurst; i++) {
      const s = this.sparks[i]!
      if (s.life > 0) continue
      const angle = Math.random() * Math.PI * 2
      const speed = (1 + Math.random() * 2.6) * spread
      s.x = origin.x; s.y = origin.y; s.z = origin.z
      s.vx = Math.cos(angle) * speed; s.vy = 2 + Math.random() * 3.2; s.vz = Math.sin(angle) * speed
      s.max = s.life = 0.8 + Math.random() * 0.7
      s.size = 0.12 + Math.random() * 0.14
      this.sparkColors.set(s, this.color.clone())
      if (++spawned >= amount) break
    }
  }
  private readonly sparkColors = new Map<Spark, Color>()

  update(dt: number, time: number, center: { x: number; z: number }): void {
    let n = 0
    for (const s of this.sparks) {
      if (s.life <= 0) continue
      s.life -= dt
      s.vy -= 7 * dt
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt
      const fade = Math.max(0, s.life / s.max)
      this.dummy.position.set(s.x, s.y, s.z)
      this.dummy.scale.setScalar(s.size * (0.4 + fade))
      this.dummy.updateMatrix()
      this.burstMesh.setMatrixAt(n, this.dummy.matrix)
      this.burstMesh.setColorAt(n, (this.sparkColors.get(s) ?? this.color).clone().multiplyScalar(0.4 + fade))
      n++
    }
    this.burstMesh.count = n
    this.burstMesh.instanceMatrix.needsUpdate = true
    if (this.burstMesh.instanceColor) this.burstMesh.instanceColor.needsUpdate = true

    let m = 0
    for (let i = 0; i < this.activeMotes; i++) {
      const mote = this.motes[i]!
      mote.y += Math.sin(time * mote.speed + mote.phase) * dt * 0.25 + mote.speed * dt * 0.12
      if (mote.y > 8) mote.y = 0.2
      const x = center.x + wrap(mote.x - center.x, 36)
      const z = center.z + wrap(mote.z - center.z, 26)
      this.dummy.position.set(x, mote.y, z)
      this.dummy.scale.setScalar(0.07 + 0.04 * Math.sin(time * 2 + mote.phase))
      this.dummy.updateMatrix()
      this.moteMesh.setMatrixAt(m, this.dummy.matrix)
      this.moteMesh.setColorAt(m, this.color.set(m % 5 === 0 ? '#ffb000' : '#22d3ee').multiplyScalar(0.5))
      m++
    }
    this.moteMesh.count = m
    this.moteMesh.instanceMatrix.needsUpdate = true
    if (this.moteMesh.instanceColor) this.moteMesh.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.burstMesh.geometry.dispose()
    ;(this.burstMesh.material as { dispose(): void }).dispose()
    ;(this.moteMesh.material as { dispose(): void }).dispose()
  }
}

/** Envuelve `v` en [-size/2, size/2) para que las motas se repartan siempre alrededor de la cámara. */
function wrap(v: number, size: number): number {
  const half = size / 2
  return ((((v + half) % size) + size) % size) - half
}
