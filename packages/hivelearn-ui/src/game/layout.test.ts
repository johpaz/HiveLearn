import { describe, expect, test } from 'bun:test'
import { axialToWorld, buildWorld, diffWorlds, honeyOf, spiral } from './layout'
import type { ProgramState } from '../types'

const node = (id: string) => ({ id, title: `Nodo ${id}`, objective: 'o', evidence: 'e', question: { prompt: 'p', options: ['a', 'b'] } })

function program(overrides: Partial<ProgramState> & { levels?: ProgramState['levels'] } = {}): ProgramState {
  return {
    id: 'p1', status: 'active', objective: 'Objetivo', intent: { topic: 't', goal: 'g', minutes: 30 },
    currentLevel: 0,
    levels: [
      { index: 0, kind: 'learning', title: 'Base', goal: 'g', status: 'active', plannedNodes: 3, nodes: [node('a'), node('b'), node('c')] },
      { index: 1, kind: 'learning', title: 'Más', goal: 'g', status: 'outline', plannedNodes: 3, nodes: [] },
      { index: 2, kind: 'final', title: 'Final', goal: 'g', status: 'outline', plannedNodes: 2, nodes: [] },
    ],
    progress: {}, needsContent: false, levelProgress: { mastered: 0, total: 3, attempted: 0 },
    validation: 'formative', finalScore: null, closeReason: null,
    ...overrides,
  }
}

describe('spiral', () => {
  test('da posiciones únicas, empieza en el centro y llena anillos', () => {
    const cells = spiral(19)
    expect(cells[0]).toEqual([0, 0])
    expect(new Set(cells.map(c => c.join(','))).size).toBe(19)
  })
})

describe('buildWorld', () => {
  test('es determinista y sin celdas encimadas, incluso con el máximo del plan', () => {
    const big = program({
      levels: Array.from({ length: 6 }, (_, i) => ({
        index: i, kind: i === 5 ? 'final' as const : 'learning' as const, title: `N${i}`, goal: 'g', status: 'active' as const,
        plannedNodes: 6, nodes: Array.from({ length: 6 }, (_, k) => node(`n${i}_${k}`)),
      })),
    })
    const a = buildWorld(big)
    expect(buildWorld(big)).toEqual(a)
    const min = Math.sqrt(3) * 0.99
    for (let i = 0; i < a.cells.length; i++) {
      for (let j = i + 1; j < a.cells.length; j++) {
        const d = Math.hypot(a.cells[i]!.x - a.cells[j]!.x, a.cells[i]!.z - a.cells[j]!.z)
        expect(d).toBeGreaterThanOrEqual(min)
      }
    }
    expect(a.cells.length).toBe(6 * 7)
  })

  test('niveles sin detallar aparecen como celdas fantasma bloqueadas', () => {
    const world = buildWorld(program())
    const ghosts = world.cells.filter(c => c.level === 1 && c.kind === 'node')
    expect(ghosts).toHaveLength(3)
    expect(ghosts.every(c => !c.real && c.visual === 'locked')).toBe(true)
  })

  test('estados visuales de nodos y compuerta', () => {
    const state = program({
      progress: { a: { attempts: 1, mastered: true, correct: true, openVerdict: null }, b: { attempts: 2, mastered: false, correct: false, openVerdict: null }, c: { attempts: 1, mastered: true, correct: true, openVerdict: null } },
      levelProgress: { mastered: 2, total: 3, attempted: 3 },
    })
    const world = buildWorld(state)
    const byId = Object.fromEntries(world.cells.map(c => [c.id, c.visual]))
    expect(byId.a).toBe('mastered')
    expect(byId.b).toBe('tried')
    expect(byId['gate:0']).toBe('ready')
    expect(byId['gate:1']).toBe('locked')
  })

  test('el puente se abre al superar el nivel y el refuerzo se marca', () => {
    const state = program({
      currentLevel: 1,
      levels: [
        { index: 0, kind: 'learning', title: 'Base', goal: 'g', status: 'closed', plannedNodes: 3, nodes: [node('a')], checkpoint: { decision: 'advance', masteredCount: 3, total: 3, reason: '' } },
        { index: 1, kind: 'reinforcement', title: 'Refuerzo', goal: 'g', status: 'active', plannedNodes: 2, nodes: [node('r1'), node('r2')] },
      ],
    })
    const world = buildWorld(state)
    expect(world.bridges).toHaveLength(1)
    expect(world.bridges[0]).toMatchObject({ toLevel: 1, open: true, reinforcement: true })
    expect(world.cells.find(c => c.id === 'gate:0')!.visual).toBe('passed')
  })

  test('mapa de nodos cabe en el eje: la cámara sigue la isla activa', () => {
    const world = buildWorld(program({ currentLevel: 2 }))
    expect(world.focus.x).toBeGreaterThan(buildWorld(program()).focus.x)
  })
})

describe('diffWorlds', () => {
  test('detecta niveles nuevos, celdas añadidas y cambios de estado', () => {
    const before = buildWorld(program())
    const after = buildWorld(program({
      progress: { a: { attempts: 1, mastered: true, correct: true, openVerdict: null } },
      levels: [
        { index: 0, kind: 'learning', title: 'Base', goal: 'g', status: 'active', plannedNodes: 4, nodes: [node('a'), node('b'), node('c'), node('d')] },
        { index: 1, kind: 'reinforcement', title: 'Refuerzo', goal: 'g', status: 'outline', plannedNodes: 2, nodes: [] },
        { index: 2, kind: 'learning', title: 'Más', goal: 'g', status: 'outline', plannedNodes: 3, nodes: [] },
        { index: 3, kind: 'final', title: 'Final', goal: 'g', status: 'outline', plannedNodes: 2, nodes: [] },
      ],
    }))
    const diff = diffWorlds(before, after)
    expect(diff.newLevels).toEqual([3])
    expect(diff.added).toContain('d')
    expect(diff.changed).toContain('a')
    expect(diffWorlds(null, after)).toEqual({ added: [], changed: [], removed: [], newLevels: [] })
  })
})

describe('honeyOf', () => {
  test('premia primer intento y niveles cerrados', () => {
    const state = program({
      progress: { a: { attempts: 1, mastered: true, correct: true, openVerdict: null }, b: { attempts: 3, mastered: true, correct: true, openVerdict: null } },
    })
    expect(honeyOf(state)).toBe(25)
  })
})

describe('axialToWorld', () => {
  test('vecinos axiales quedan a √3 de distancia', () => {
    const a = axialToWorld(0, 0)
    const b = axialToWorld(1, 0)
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(Math.sqrt(3), 5)
  })
})
