import { describe, expect, test } from 'bun:test'
import { buildWorld } from './layout'
import { buildWalkable, focusCell, isWalkable, islandAt, joystickAxis, keysToInput, routeToCell, stepMover, type Mover } from './controller'
import type { ProgramState } from '../types'

const node = (id: string) => ({ id, title: `Nodo ${id}`, objective: 'o', evidence: 'e', question: { prompt: 'p', options: ['a', 'b'] } })

function program(closedFirst = false): ProgramState {
  return {
    id: 'p1', status: 'active', objective: 'Objetivo', intent: { topic: 't', goal: 'g', minutes: 30 },
    currentLevel: closedFirst ? 1 : 0,
    levels: [
      { index: 0, kind: 'learning', title: 'Base', goal: 'g', status: closedFirst ? 'closed' : 'active', plannedNodes: 3, nodes: [node('a'), node('b'), node('c')], ...(closedFirst ? { checkpoint: { decision: 'advance', reason: 'ok', masteredCount: 3, total: 3 } } : {}) },
      { index: 1, kind: 'learning', title: 'Más', goal: 'g', status: closedFirst ? 'active' : 'outline', plannedNodes: 2, nodes: closedFirst ? [node('d'), node('e')] : [] },
      { index: 2, kind: 'final', title: 'Final', goal: 'g', status: 'outline', plannedNodes: 2, nodes: [] },
    ] as ProgramState['levels'],
    progress: {}, needsContent: false, levelProgress: { mastered: 0, total: 3, attempted: 0 },
    validation: 'formative', finalScore: null, closeReason: null,
  }
}

const at = (x: number, z: number): Mover => ({ x, z, vx: 0, vz: 0 })

describe('walkable', () => {
  test('el suelo de la isla se pisa y el vacío no', () => {
    const world = buildWorld(program())
    const w = buildWalkable(world)
    expect(isWalkable(w, { x: 0, z: 0 })).toBe(true)
    expect(isWalkable(w, { x: 0, z: 40 })).toBe(false)
    expect(isWalkable(w, { x: -30, z: 0 })).toBe(false)
  })

  test('un puente cerrado es una barrera y uno abierto se cruza', () => {
    const closed = buildWalkable(buildWorld(program()))
    const open = buildWalkable(buildWorld(program(true)))
    const middle = (w: typeof closed) => {
      const b = w.bridges[0]!
      return { x: (b.from.x + b.to.x) / 2, z: (b.from.z + b.to.z) / 2 }
    }
    // El punto medio está fuera de ambas islas: solo es pisable con el puente abierto.
    expect(isWalkable(closed, middle(closed))).toBe(false)
    expect(isWalkable(open, middle(open))).toBe(true)
  })
})

describe('stepMover', () => {
  test('acelera hacia la entrada y no pasa de la velocidad máxima', () => {
    let m = at(0, 0)
    const w = buildWalkable(buildWorld(program()))
    for (let i = 0; i < 20; i++) m = stepMover(m, { x: 1, z: 0 }, 0.05, w)
    expect(m.x).toBeGreaterThan(0)
    expect(Math.hypot(m.vx, m.vz)).toBeLessThanOrEqual(5.2 + 1e-6)
  })

  test('no sale del suelo: se detiene en el borde y desliza por el eje libre', () => {
    const world = buildWorld(program())
    const w = buildWalkable(world)
    let m = at(0, 0)
    for (let i = 0; i < 200; i++) m = stepMover(m, { x: 0, z: 1 }, 0.05, w)
    expect(isWalkable(w, m)).toBe(true)
    expect(m.z).toBeLessThan(world.islands[0]!.z + 6)
    // Contra el borde sur sigue pudiendo moverse hacia el costado.
    const edge = { x: 0, z: m.z, vx: 0, vz: 0 }
    const moved = stepMover(edge, { x: 1, z: 1 }, 0.05, w)
    expect(moved.x).toBeGreaterThan(0)
  })

  test('la diagonal no es más rápida que un eje', () => {
    let a = at(0, 0), b = at(0, 0)
    for (let i = 0; i < 30; i++) { a = stepMover(a, { x: 1, z: 0 }, 0.05, null); b = stepMover(b, { x: 1, z: 1 }, 0.05, null) }
    expect(Math.hypot(b.vx, b.vz)).toBeCloseTo(Math.hypot(a.vx, a.vz), 1)
  })

  test('sin mundo (piloto automático) no hay colisión', () => {
    const m = stepMover(at(0, 0), { x: 0, z: 1 }, 0.5, null)
    expect(m.z).toBeGreaterThan(0)
  })
})

describe('focusCell', () => {
  test('elige la celda real más cercana dentro del radio y nada si no hay', () => {
    const world = buildWorld(program())
    const a = world.cells.find(c => c.id === 'a')!
    expect(focusCell(world, { x: a.x + 0.2, z: a.z })).toBe('a')
    expect(focusCell(world, { x: 0, z: 30 })).toBeNull()
  })

  test('ignora las celdas fantasma de niveles sin detallar', () => {
    const world = buildWorld(program())
    const ghost = world.cells.find(c => !c.real)!
    expect(focusCell(world, { x: ghost.x, z: ghost.z })).not.toBe(ghost.id)
  })
})

describe('routeToCell', () => {
  test('dentro de la isla va directo; entre islas pasa por la compuerta y el puente', () => {
    const world = buildWorld(program(true))
    const target = world.cells.find(c => c.id === 'd')!
    const from = world.cells.find(c => c.id === 'a')!
    expect(islandAt(world, from)).toBe(0)
    const route = routeToCell(world, { x: from.x, z: from.z }, target)
    expect(route).toHaveLength(3)
    expect(route.at(-1)).toEqual({ x: target.x, z: target.z })
    expect(routeToCell(world, { x: from.x, z: from.z }, world.cells.find(c => c.id === 'b')!)).toHaveLength(1)
  })

  test('un puente cerrado corta la ruta ante la barrera', () => {
    const world = buildWorld(program())
    const final = world.cells.find(c => c.level === 2)!
    expect(routeToCell(world, { x: 0, z: 0 }, final)).toEqual([])
  })
})

describe('keysToInput', () => {
  test('WASD y flechas dan el mismo eje; teclas opuestas se anulan', () => {
    expect(keysToInput(new Set(['w']))).toEqual({ x: 0, z: -1 })
    expect(keysToInput(new Set(['ArrowDown', 'ArrowRight']))).toEqual({ x: 1, z: 1 })
    expect(keysToInput(new Set(['a', 'd']))).toEqual({ x: 0, z: 0 })
  })
})

describe('joystickAxis', () => {
  test('zona muerta, tope en el radio y dirección conservada', () => {
    expect(joystickAxis(0, 0)).toEqual({ x: 0, z: 0 })
    expect(joystickAxis(3, 2)).toEqual({ x: 0, z: 0 })
    const full = joystickAxis(200, 0)
    expect(full.x).toBeCloseTo(1, 5)
    expect(full.z).toBeCloseTo(0, 5)
    const diagonal = joystickAxis(-30, 30)
    expect(diagonal.x).toBeLessThan(0)
    expect(diagonal.z).toBeGreaterThan(0)
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeLessThanOrEqual(1)
  })
})
