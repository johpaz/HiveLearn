/**
 * Mundo del juego a partir del estado del programa. Todo aquí es puro (sin three ni DOM) para poder probarlo:
 * cada nivel es una isla de celdas hexagonales (una por nodo + una compuerta que representa el checkpoint) y las
 * islas se encadenan con puentes. El servidor decide el estado; este módulo solo lo traduce a coordenadas y estados
 * visuales, y calcula qué cambió entre dos estados para poder animar la adaptación del plan.
 */
import type { ProgramState } from '../types'

export const CELL_SIZE = 1
export const ISLAND_GAP = 10

export type CellKind = 'node' | 'gate'
export type NodeVisual = 'locked' | 'available' | 'tried' | 'mastered'
export type GateVisual = 'locked' | 'ready' | 'passed' | 'hold' | 'review'
export type CellVisual = NodeVisual | GateVisual

export interface WorldCell {
  id: string
  kind: CellKind
  level: number
  levelKind: 'learning' | 'reinforcement' | 'final'
  x: number
  z: number
  visual: CellVisual
  title: string
  /** Nodo real (no marcador de posición de un nivel aún sin detallar). */
  real: boolean
}

export interface WorldIsland {
  index: number
  kind: 'learning' | 'reinforcement' | 'final'
  title: string
  status: 'outline' | 'active' | 'closed'
  x: number
  z: number
}

export interface WorldBridge {
  /** Nivel al que lleva el puente. */
  toLevel: number
  from: { x: number; z: number }
  to: { x: number; z: number }
  open: boolean
  reinforcement: boolean
}

export interface WorldDescription {
  islands: WorldIsland[]
  cells: WorldCell[]
  bridges: WorldBridge[]
  /** Isla activa: hacia ella apunta la cámara. */
  focus: { x: number; z: number }
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

const DIRECTIONS: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]

/** Posiciones axiales en espiral desde el centro: 0, anillo 1 (6), anillo 2 (12)… */
export function spiral(count: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[0, 0]]
  for (let ring = 1; out.length < count; ring++) {
    let q = DIRECTIONS[4]![0] * ring
    let r = DIRECTIONS[4]![1] * ring
    for (const [dq, dr] of DIRECTIONS) {
      for (let step = 0; step < ring; step++) {
        out.push([q, r])
        q += dq
        r += dr
      }
    }
  }
  return out.slice(0, count)
}

export function axialToWorld(q: number, r: number): { x: number; z: number } {
  return { x: CELL_SIZE * Math.sqrt(3) * (q + r / 2), z: CELL_SIZE * 1.5 * r }
}

/** Centro de cada isla: cadena en x con un zigzag suave para que el mapa no sea una recta. */
export function islandCenter(index: number): { x: number; z: number } {
  return { x: index * ISLAND_GAP, z: index % 2 === 0 ? 0 : 3 }
}

const GATE_SLOT: [number, number] = [2, 0]

function nodeVisual(state: ProgramState, levelStatus: string, nodeId: string): NodeVisual {
  const progress = state.progress[nodeId]
  if (progress?.mastered) return 'mastered'
  if (levelStatus === 'outline') return 'locked'
  return progress && progress.attempts > 0 ? 'tried' : 'available'
}

function gateVisual(state: ProgramState, level: ProgramState['levels'][number]): GateVisual {
  if (level.checkpoint) {
    if (level.checkpoint.decision === 'hold') return 'hold'
    if (level.checkpoint.decision === 'teacher_review') return 'review'
    return 'passed'
  }
  if (level.status === 'outline') return 'locked'
  const attempted = level.index === state.currentLevel
    && state.levelProgress.total > 0
    && state.levelProgress.attempted === state.levelProgress.total
  return attempted ? 'ready' : 'locked'
}

export function buildWorld(state: ProgramState): WorldDescription {
  const islands: WorldIsland[] = []
  const cells: WorldCell[] = []
  const bridges: WorldBridge[] = []
  const gates: Array<{ x: number; z: number }> = []

  for (const level of state.levels) {
    const center = islandCenter(level.index)
    islands.push({ index: level.index, kind: level.kind, title: level.title, status: level.status, x: center.x, z: center.z })

    const real = level.nodes.length > 0
    const count = real ? level.nodes.length : Math.max(1, level.plannedNodes)
    // El hueco de la compuerta se salta para que ningún nodo caiga encima, cualquiera sea el tamaño del nivel.
    const slots = spiral(count + 1).filter(([q, r]) => q !== GATE_SLOT[0] || r !== GATE_SLOT[1]).slice(0, count)
    for (let i = 0; i < count; i++) {
      const node = level.nodes[i]
      const [q, r] = slots[i]!
      const p = axialToWorld(q, r)
      cells.push({
        id: node ? node.id : `L${level.index}:ghost:${i}`,
        kind: 'node',
        level: level.index,
        levelKind: level.kind,
        x: center.x + p.x,
        z: center.z + p.z,
        visual: node ? nodeVisual(state, level.status, node.id) : 'locked',
        title: node?.title ?? '',
        real: Boolean(node),
      })
    }

    const gate = axialToWorld(GATE_SLOT[0], GATE_SLOT[1])
    const gx = center.x + gate.x
    const gz = center.z + gate.z
    gates.push({ x: gx, z: gz })
    cells.push({
      id: `gate:${level.index}`,
      kind: 'gate',
      level: level.index,
      levelKind: level.kind,
      x: gx,
      z: gz,
      visual: gateVisual(state, level),
      title: level.kind === 'final' ? 'La Reina: evaluación final' : `Compuerta del nivel ${level.index + 1}`,
      real: true,
    })
  }

  for (let i = 1; i < state.levels.length; i++) {
    const target = state.levels[i]!
    const previous = state.levels[i - 1]!
    const to = islandCenter(i)
    bridges.push({
      toLevel: i,
      from: gates[i - 1]!,
      to: { x: to.x - 1.6, z: to.z },
      open: previous.status === 'closed' && previous.checkpoint?.decision !== 'hold',
      reinforcement: target.kind === 'reinforcement',
    })
  }

  const focusLevel = Math.min(Math.max(state.currentLevel, 0), Math.max(0, state.levels.length - 1))
  const focus = islandCenter(focusLevel)
  const xs = cells.map(c => c.x)
  const zs = cells.map(c => c.z)
  const bounds = cells.length
    ? { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
    : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
  return { islands, cells, bridges, focus: { x: focus.x + 1, z: focus.z }, bounds }
}

export interface WorldDiff {
  /** Celdas nuevas: el plan creció (nivel de refuerzo, nodo añadido, nivel materializado). */
  added: string[]
  /** Celdas que cambiaron de estado visual. */
  changed: string[]
  removed: string[]
  /** Niveles que no existían antes. */
  newLevels: number[]
}

export function diffWorlds(previous: WorldDescription | null, next: WorldDescription): WorldDiff {
  if (!previous) return { added: [], changed: [], removed: [], newLevels: [] }
  const before = new Map(previous.cells.map(c => [c.id, c]))
  const after = new Map(next.cells.map(c => [c.id, c]))
  const added: string[] = []
  const changed: string[] = []
  const removed: string[] = []
  for (const [id, cell] of after) {
    const old = before.get(id)
    if (!old) { if (cell.real) added.push(id) } else if (old.visual !== cell.visual) changed.push(id)
  }
  for (const [id, cell] of before) if (!after.has(id) && cell.real) removed.push(id)
  const known = new Set(previous.islands.map(i => i.index))
  return { added, changed, removed, newLevels: next.islands.map(i => i.index).filter(i => !known.has(i)) }
}

/** Puntos para la miel (solo visual): el servidor sigue siendo quien acredita. */
export function honeyOf(state: ProgramState): number {
  let honey = 0
  for (const p of Object.values(state.progress)) if (p.mastered) honey += p.attempts <= 1 ? 15 : 10
  honey += state.levels.filter(l => l.status === 'closed').length * 50
  return honey
}
