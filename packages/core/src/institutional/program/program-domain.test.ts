import { describe, expect, test } from 'bun:test'
import { applyAdaptation } from './guards'
import { PROGRAM_LIMITS, type PersonalProgram, type ProgramNode } from './program-def'
import { allowedNodes, sizeProgram } from './sizing'

const node = (id: string, title = id): ProgramNode => ({
  id, title, objective: `Objetivo de ${title}`, evidence: `Demuestra ${title}`, tags: [],
  question: { prompt: `¿Qué es ${title}?`, options: ['a', 'b', 'c'], correct: 0 },
})

function program(over: Partial<PersonalProgram> = {}): PersonalProgram {
  const now = '2026-10-13T00:00:00.000Z'
  return {
    id: 'p1', accountId: 'a1', institutionId: 'i1', status: 'active', language: 'es',
    intent: { topic: 'SQL', goal: 'consultar datos', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado', declaredAt: now },
    profile: { name: 'Ana', age: 30, ageBand: 'adulto' },
    objective: 'Consultar datos con SQL',
    sizing: { levels: 3, nodesPerLevel: [3, 3, 3], minutesPerNode: 10 },
    levels: [
      { index: 0, kind: 'learning', title: 'Base', goal: 'g0', status: 'active', plannedNodes: 3, nodes: [node('n1'), node('n2'), node('n3')], revision: 0 },
      { index: 1, kind: 'learning', title: 'Filtrar', goal: 'g1', status: 'outline', plannedNodes: 3, nodes: [], revision: 0 },
      { index: 2, kind: 'final', title: 'Final', goal: 'g2', status: 'outline', plannedNodes: 3, nodes: [], revision: 0 },
    ],
    currentLevel: 0, progress: {}, revisions: [], validation: 'formative',
    createdAt: now, updatedAt: now, lastActivityAt: now, ...over,
  }
}

describe('sizeProgram', () => {
  test('30 minutos de un adulto: 3 niveles de 3 nodos', () => {
    const s = sizeProgram({ intent: { minutes: 30, energy: 'media', priorKnowledge: 'ninguno' }, ageBand: 'adulto' })
    expect(s).toEqual({ levels: 3, nodesPerLevel: [3, 3, 3], minutesPerNode: 10 })
  })
  test('energía baja y conocimiento previo reducen, siempre dentro de los límites', () => {
    const s = sizeProgram({ intent: { minutes: 30, energy: 'baja', priorKnowledge: 'bastante' }, ageBand: 'adulto', alreadyMastered: 5 })
    expect(s.nodesPerLevel[0]).toBe(PROGRAM_LIMITS.minNodesPerLevel)
    expect(Math.min(...s.nodesPerLevel)).toBeGreaterThanOrEqual(PROGRAM_LIMITS.minNodesPerLevel)
  })
  test('un niño recibe tareas más cortas y por tanto más nodos para el mismo tiempo', () => {
    const kid = sizeProgram({ intent: { minutes: 30, energy: 'media', priorKnowledge: 'ninguno' }, ageBand: 'ninez' })
    const adult = sizeProgram({ intent: { minutes: 30, energy: 'media', priorKnowledge: 'ninguno' }, ageBand: 'adulto' })
    expect(kid.nodesPerLevel[0]).toBeGreaterThan(adult.nodesPerLevel[0])
  })
  test('el total nunca pasa del tope', () => {
    const s = sizeProgram({ intent: { minutes: 120, energy: 'alta', priorKnowledge: 'ninguno' }, ageBand: 'ninez' })
    expect(s.nodesPerLevel.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(PROGRAM_LIMITS.maxNodesTotal)
  })
  test('allowedNodes admite ±1 sobre lo dimensionado', () => {
    expect(allowedNodes({ levels: 3, nodesPerLevel: [3, 3, 3], minutesPerNode: 10 }, 1)).toEqual({ min: 2, max: 4 })
  })
})

describe('applyAdaptation', () => {
  const opts = { actor: 'agent' as const, reason: 'el alumno domina lo básico' }

  test('materializa el siguiente nivel y registra la revisión', () => {
    const r = applyAdaptation(program(), [{ op: 'materialize_level', levelIndex: 1, nodes: [node('f1'), node('f2'), node('f3')] }], opts)
    expect(r.rejected).toEqual([])
    expect(r.program.levels[1].nodes.map(n => n.id)).toEqual(['f1', 'f2', 'f3'])
    expect(r.program.revisions).toHaveLength(1)
    expect(r.program.revisions[0]).toMatchObject({ actor: 'agent', reason: opts.reason })
  })

  test('no toca el nivel activo ni los cerrados', () => {
    const closed = program({ currentLevel: 1, levels: program().levels.map((l, i) => i === 0 ? { ...l, status: 'closed' as const } : l) })
    const r = applyAdaptation(closed, [
      { op: 'add_node', levelIndex: 0, node: node('x') },
      { op: 'retitle', levelIndex: 0, title: 'otro' },
    ], opts)
    expect(r.applied).toEqual([])
    expect(r.rejected).toHaveLength(2)
    expect(r.program.levels[0].title).toBe('Base')
  })

  test('un nodo con intentos no se puede quitar ni mover', () => {
    const base = program({ currentLevel: 0, levels: program().levels.map((l, i) => i === 0 ? { ...l, status: 'outline' as const } : l) })
    base.progress.n1 = { attempts: 1, correct: false, firstTry: false, mastered: false }
    const r = applyAdaptation(base, [{ op: 'drop_unstarted_node', levelIndex: 0, nodeId: 'n1' }], opts)
    // Un nivel con intentos ya no es editable: la historia del alumno no se reescribe.
    expect(r.rejected[0].reason).toContain('cursa')
    expect(r.program.levels[0].nodes).toHaveLength(3)
  })

  test('ids repetidos en cualquier nivel se rechazan', () => {
    const r = applyAdaptation(program(), [{ op: 'materialize_level', levelIndex: 1, nodes: [node('n1'), node('f2')] }], opts)
    expect(r.rejected[0].reason).toContain('repetido')
  })

  test('respeta el rango de nodos del nivel y el tope global', () => {
    const tooMany = [1, 2, 3, 4, 5].map(i => node(`m${i}`))
    expect(applyAdaptation(program(), [{ op: 'materialize_level', levelIndex: 1, nodes: tooMany }], opts).rejected[0].reason).toContain('entre')
  })

  test('un refuerzo se inserta tras el nivel indicado y renumera', () => {
    const r = applyAdaptation(program(), [{ op: 'add_reinforcement_level', afterLevel: 0, title: 'Refuerzo', goal: 'afianzar', nodes: [node('r1'), node('r2')] }], opts)
    expect(r.rejected).toEqual([])
    expect(r.program.levels.map(l => [l.index, l.kind])).toEqual([[0, 'learning'], [1, 'reinforcement'], [2, 'learning'], [3, 'final']])
  })

  test('tope de niveles y de adaptaciones por nivel', () => {
    const six = program({ levels: Array.from({ length: 6 }, (_, i) => ({ index: i, kind: 'learning' as const, title: `N${i}`, goal: 'g', status: i === 0 ? 'active' as const : 'outline' as const, plannedNodes: 2, nodes: i === 0 ? [node('n1'), node('n2')] : [], revision: 0 })) })
    expect(applyAdaptation(six, [{ op: 'add_reinforcement_level', afterLevel: 0, title: 'R', goal: 'g', nodes: [node('r1'), node('r2')] }], opts).rejected[0].reason).toContain('niveles')

    let current = program()
    for (let i = 0; i < 3; i++) current = applyAdaptation(current, [{ op: 'retitle', levelIndex: 1, title: `Filtrar ${i}` }], opts).program
    const fourth = applyAdaptation(current, [{ op: 'retitle', levelIndex: 1, title: 'otra más' }], opts)
    expect(fourth.rejected[0].reason).toContain('por nivel')
    // El docente no está sujeto a ese tope por nivel.
    expect(applyAdaptation(current, [{ op: 'retitle', levelIndex: 1, title: 'docente' }], { actor: 'teacher', reason: 'ajuste' }).applied).toHaveLength(1)
  })

  test('operaciones mal formadas o desconocidas no rompen nada', () => {
    const r = applyAdaptation(program(), [{ op: 'borrar_todo' }, { nada: true }, null], opts)
    expect(r.applied).toEqual([])
    expect(r.rejected).toHaveLength(3)
    expect(r.program.levels).toHaveLength(3)
  })

  test('no muta el programa original', () => {
    const original = program()
    const snapshot = JSON.stringify(original)
    applyAdaptation(original, [{ op: 'materialize_level', levelIndex: 1, nodes: [node('f1'), node('f2')] }], opts)
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})
