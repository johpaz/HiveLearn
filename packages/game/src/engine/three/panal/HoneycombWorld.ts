/**
 * HoneycombWorld — El panal viviente: la estructura 3D donde cada celda
 * hexagonal es un módulo del programa personalizado del alumno.
 *
 * "Tu currículum ES el mundo": las celdas se colocan en espiral hexagonal
 * desde el centro (el primer módulo) hacia afuera. Estados:
 *
 *   locked    → cera apagada (módulos futuros)
 *   available → ámbar pulsante (el siguiente a jugar)
 *   active    → abierta, el alumno está dentro del reto
 *   mastered  → miel dorada encendida + gota brillante
 *
 * La celda disponible más cercana atrae al jugador (glow) y con [E] se abre.
 */
import * as THREE from 'three'
import type { LevelSpec } from '@hivelearn/core/lesson/levelSpec'

export type CellState = 'locked' | 'available' | 'active' | 'mastered'

export interface HoneyCell {
  level: LevelSpec
  index: number
  state: CellState
  mesh: THREE.Mesh
  glow: THREE.Mesh
  honeyDrop: THREE.Mesh | null
  basePos: THREE.Vector3
  /** Progreso: conceptos abiertos del módulo (openedBlocks) */
  openedConcepts: number
}

const CELL_RADIUS = 0.85
const CELL_DEPTH = 0.5
const CELL_GAP = 0.12

/** Colores por estado (Panal de Cuentos) */
const STATE_COLORS: Record<CellState, { wax: number; emissive: number; emissiveIntensity: number }> = {
  locked:    { wax: 0x4a3315, emissive: 0x2a1c08, emissiveIntensity: 0.15 },
  available: { wax: 0xd69a2e, emissive: 0xffb300, emissiveIntensity: 0.55 },
  active:    { wax: 0xffb300, emissive: 0xffd54f, emissiveIntensity: 1.0 },
  mastered:  { wax: 0xffc94d, emissive: 0xffa000, emissiveIntensity: 0.85 },
}

export class HoneycombWorld {
  readonly root = new THREE.Group()
  readonly cells: HoneyCell[] = []

  private materials = new Map<CellState, THREE.MeshStandardMaterial>()
  private glowMaterial: THREE.MeshBasicMaterial
  private honeyMaterial: THREE.MeshStandardMaterial

  constructor() {
    for (const [state, cfg] of Object.entries(STATE_COLORS) as Array<[CellState, typeof STATE_COLORS[CellState]]>) {
      this.materials.set(state, new THREE.MeshStandardMaterial({
        color: cfg.wax,
        emissive: cfg.emissive,
        emissiveIntensity: cfg.emissiveIntensity,
        roughness: 0.55,
        metalness: 0.1,
      }))
    }
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd54f, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
    this.honeyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: 0xffb300, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3,
    })
  }

  /**
   * Construye el panal desde los módulos del programa.
   * @param levels módulos (LevelSpec[]) en orden curricular
   * @param openedByLesson lessonId → nodeIds abiertos (string[]) o conteo
   * @param starsByLesson lessonId → estrellas (0 = sin dominar)
   */
  build(
    levels: LevelSpec[],
    openedByLesson: Record<string, string[] | number>,
    starsByLesson: Record<string, number>,
  ): void {
    // Espiral hexagonal axial: centro → anillos hacia afuera
    const positions = hexSpiral(levels.length)
    const geo = new THREE.CylinderGeometry(CELL_RADIUS, CELL_RADIUS, CELL_DEPTH, 6)

    levels.forEach((level, i) => {
      const [qx, qy] = positions[i]!
      // Layout: panal vertical (pared) — X horizontal, Y vertical, Z hacia la cámara
      const x = (Math.sqrt(3) * (qx + qy / 2)) * (CELL_RADIUS + CELL_GAP)
      const y = -(1.5 * qy) * (CELL_RADIUS + CELL_GAP)
      const basePos = new THREE.Vector3(x, y, 0)

      const mesh = new THREE.Mesh(geo, this.materials.get('locked')!.clone())
      mesh.rotation.x = Math.PI / 2 // eje del cilindro → Z (celda mirando a cámara)
      mesh.position.copy(basePos)
      this.root.add(mesh)

      // Halo frontal (plano hexagonal) para glow del estado
      const glowGeo = new THREE.CircleGeometry(CELL_RADIUS * 0.92, 6)
      const glow = new THREE.Mesh(glowGeo, this.glowMaterial.clone())
      glow.position.copy(basePos).z += CELL_DEPTH / 2 + 0.02
      glow.rotation.z = Math.PI / 6
      this.root.add(glow)

      // Gota de miel para celdas dominadas (se muestra/oculta)
      const drop = new THREE.Mesh(new THREE.SphereGeometry(CELL_RADIUS * 0.22, 12, 8), this.honeyMaterial.clone())
      drop.scale.z = 0.5
      drop.position.set(basePos.x, basePos.y, CELL_DEPTH / 2 + 0.12)
      drop.visible = false
      this.root.add(drop)

      const openedRaw = openedByLesson[level.lessonId]
      const openedConcepts = Array.isArray(openedRaw) ? openedRaw.length : Number(openedRaw ?? 0)
      const stars = starsByLesson[level.lessonId] ?? 0
      const cell: HoneyCell = {
        level, index: i, mesh, glow, honeyDrop: drop, basePos,
        state: 'locked', openedConcepts,
      }
      this.cells.push(cell)
    })

    // Estados iniciales según progreso
    this.refreshStates(starsByLesson)
  }

  /** Recalcula estados: dominadas (stars>0), disponible (primera no dominada), resto locked */
  refreshStates(starsByLesson: Record<string, number>): void {
    let availableAssigned = false
    for (const cell of this.cells) {
      const stars = starsByLesson[cell.level.lessonId] ?? 0
      const prev = cell.state
      if (stars > 0) {
        cell.state = 'mastered'
      } else if (!availableAssigned) {
        cell.state = 'available'
        availableAssigned = true
      } else {
        cell.state = 'locked'
      }
      if (prev !== cell.state) this.applyState(cell)
    }
  }

  private applyState(cell: HoneyCell): void {
    const cfg = STATE_COLORS[cell.state]
    const mat = cell.mesh.material as THREE.MeshStandardMaterial
    mat.color.setHex(cfg.wax)
    mat.emissive.setHex(cfg.emissive)
    mat.emissiveIntensity = cfg.emissiveIntensity
    cell.honeyDrop && (cell.honeyDrop.visible = cell.state === 'mastered')
    if (cell.state !== 'available' && cell.state !== 'active') {
      ;(cell.glow.material as THREE.MeshBasicMaterial).opacity = 0
    }
  }

  markActive(cell: HoneyCell | null): void {
    for (const c of this.cells) {
      if (c.state === 'active') {
        c.state = c.honeyDrop?.visible ? 'mastered' : 'available'
        this.applyState(c)
      }
    }
    if (cell) {
      cell.state = 'active'
      this.applyState(cell)
    }
  }

  /** Animación por frame: pulso de la disponible, bob sutil del panal, drop shine */
  update(dt: number, time: number): void {
    for (const cell of this.cells) {
      if (cell.state === 'available' || cell.state === 'active') {
        const pulse = 0.18 + 0.14 * Math.sin(time * 2.6 + cell.index * 0.7)
        ;(cell.glow.material as THREE.MeshBasicMaterial).opacity = pulse
      }
      if (cell.state === 'mastered' && cell.honeyDrop?.visible) {
        cell.honeyDrop.position.y = cell.basePos.y + Math.sin(time * 1.8 + cell.index) * 0.02
      }
    }
    // respiración del panal completo
    this.root.position.z = Math.sin(time * 0.6) * 0.03
  }

  /** Celda disponible (la siguiente a jugar) */
  get availableCell(): HoneyCell | null {
    return this.cells.find(c => c.state === 'available') ?? null
  }

  cellAt(point: THREE.Vector3, maxDist = 1.1): HoneyCell | null {
    let best: HoneyCell | null = null
    let bestD = maxDist
    for (const c of this.cells) {
      const d = Math.hypot(c.basePos.x - point.x, c.basePos.y - point.y)
      if (d < bestD) { bestD = d; best = c }
    }
    return best
  }

  dispose(): void {
    this.root.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        mats.forEach(x => x?.dispose())
      }
    })
    this.cells.length = 0
  }
}

/** Coordenadas axiales en espiral: centro, anillo 1 (6), anillo 2 (12)… */
function hexSpiral(n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[0, 0]]
  if (n <= 1) return out
  let ring = 1
  while (out.length < n) {
    // empieza en la celda "oeste" del anillo y recorre las 6 direcciones
    let q = -ring, r = ring
    const dirs: Array<[number, number]> = [
      [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1],
    ]
    for (const [dq, dr] of dirs) {
      for (let step = 0; step < ring && out.length < n; step++) {
        out.push([q, r])
        q += dq; r += dr
      }
    }
    ring++
  }
  return out.slice(0, n)
}
