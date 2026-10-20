/**
 * Movimiento del dron sobre el mundo. Puro (sin three ni DOM): qué se puede pisar, cómo se mueve el dron, qué celda
 * tiene cerca y por dónde va si se le manda a una celda lejana. El servidor sigue decidiendo el progreso; esto solo
 * es navegación.
 */
import type { WorldCell, WorldDescription } from './layout'

export interface Vec2 { x: number; z: number }
export interface Disc extends Vec2 { radius: number }
export interface BridgeLane { from: Vec2; to: Vec2; width: number; open: boolean }
/** Se pisan las baldosas (un disco por celda, con margen para cubrir los huecos) y los puentes abiertos. */
export interface Walkable { tiles: Disc[]; bridges: BridgeLane[] }

/** Margen del suelo visual de la isla (la base bajo las baldosas) más allá de su celda más lejana. */
const PAD_MARGIN = 1.1
export const MIN_PAD_RADIUS = 2.6
export const TILE_RADIUS = 1.15
export const BRIDGE_WIDTH = 1.1
export const FOCUS_RADIUS = 1.3

export function padRadius(world: WorldDescription, index: number): number {
  const island = world.islands.find(i => i.index === index)
  if (!island) return MIN_PAD_RADIUS
  let far = 0
  for (const c of world.cells) if (c.level === index) far = Math.max(far, Math.hypot(c.x - island.x, c.z - island.z))
  return Math.max(MIN_PAD_RADIUS, far + PAD_MARGIN)
}

export function buildWalkable(world: WorldDescription): Walkable {
  return {
    tiles: world.cells.map(c => ({ x: c.x, z: c.z, radius: TILE_RADIUS })),
    bridges: world.bridges.map(b => ({ from: b.from, to: b.to, width: BRIDGE_WIDTH, open: b.open })),
  }
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

/** ¿Se puede estar aquí? Sobre una baldosa, o en un puente abierto (los cerrados son barreras de energía). */
export function isWalkable(w: Walkable, p: Vec2): boolean {
  for (const tile of w.tiles) if (Math.hypot(p.x - tile.x, p.z - tile.z) <= tile.radius) return true
  for (const b of w.bridges) if (b.open && distanceToSegment(p, b.from, b.to) <= b.width / 2) return true
  return false
}

export interface Mover extends Vec2 { vx: number; vz: number }

export interface StepOptions { speed?: number; response?: number }

/**
 * Un paso de movimiento. `input` va de -1 a 1 en cada eje (mundo: +x derecha, +z hacia el jugador). Con `walkable`
 * nulo no hay colisión (piloto automático). Si el destino no se puede pisar se desliza por un eje, y si no, se frena.
 */
export function stepMover(m: Mover, input: Vec2, dt: number, walkable: Walkable | null, options: StepOptions = {}): Mover {
  const speed = options.speed ?? 5.2
  const response = options.response ?? 9
  let ix = input.x
  let iz = input.z
  const length = Math.hypot(ix, iz)
  if (length > 1) { ix /= length; iz /= length }
  const k = 1 - Math.exp(-response * dt)
  const vx = m.vx + (ix * speed - m.vx) * k
  const vz = m.vz + (iz * speed - m.vz) * k
  const nx = m.x + vx * dt
  const nz = m.z + vz * dt
  if (!walkable || isWalkable(walkable, { x: nx, z: nz })) return { x: nx, z: nz, vx, vz }
  if (isWalkable(walkable, { x: nx, z: m.z })) return { x: nx, z: m.z, vx, vz: 0 }
  if (isWalkable(walkable, { x: m.x, z: nz })) return { x: m.x, z: nz, vx: 0, vz }
  return { x: m.x, z: m.z, vx: 0, vz: 0 }
}

/** Celda real más cercana dentro del radio de foco (la primera por orden si hay empate). */
export function focusCell(world: WorldDescription, p: Vec2, radius = FOCUS_RADIUS): string | null {
  let best: string | null = null
  let bestDistance = radius
  for (const c of world.cells) {
    if (!c.real) continue
    const d = Math.hypot(c.x - p.x, c.z - p.z)
    if (d < bestDistance) { bestDistance = d; best = c.id }
  }
  return best
}

/** Isla donde está un punto: la de centro más cercano. */
export function islandAt(world: WorldDescription, p: Vec2): number {
  let best = 0
  let bestDistance = Infinity
  for (const i of world.islands) {
    const d = Math.hypot(i.x - p.x, i.z - p.z)
    if (d < bestDistance) { bestDistance = d; best = i.index }
  }
  return best
}

/**
 * Ruta del dron hasta una celda: directa dentro de la isla; entre islas pasa por las compuertas y los puentes. Si hay
 * un puente cerrado en el camino la ruta termina ante él (no se cruza una barrera).
 */
export function routeToCell(world: WorldDescription, from: Vec2, target: WorldCell): Vec2[] {
  const here = islandAt(world, from)
  const goal = { x: target.x, z: target.z }
  if (here === target.level) return [goal]
  const route: Vec2[] = []
  const direction = target.level > here ? 1 : -1
  for (let level = here; level !== target.level; level += direction) {
    const bridge = world.bridges.find(b => b.toLevel === (direction > 0 ? level + 1 : level))
    if (!bridge || !bridge.open) return route
    if (direction > 0) route.push(bridge.from, bridge.to)
    else route.push(bridge.to, bridge.from)
  }
  route.push(goal)
  return route
}

/** Entrada de teclado → eje de movimiento (WASD y flechas; la cámara no gira, así que W es «hacia el fondo»). */
export function keysToInput(keys: ReadonlySet<string>): Vec2 {
  const has = (...names: string[]) => names.some(n => keys.has(n))
  return {
    x: (has('d', 'D', 'ArrowRight') ? 1 : 0) - (has('a', 'A', 'ArrowLeft') ? 1 : 0),
    z: (has('s', 'S', 'ArrowDown') ? 1 : 0) - (has('w', 'W', 'ArrowUp') ? 1 : 0),
  }
}
