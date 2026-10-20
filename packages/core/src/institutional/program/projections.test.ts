import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HiveDB } from '@johpaz/hive-db'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Account } from '../accounts'
import { ProgramEngine } from './engine'
import type { ProgramNode } from './program-def'
import { PROGRAM_LEVELS_COLLECTION, PROGRAM_NODES_COLLECTION } from './program-def'
import { weakNodes, type NodeRow } from './projections'
import { ProgramReviews } from './review'

let db: HiveDB, directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'hl-program-proj-')); db = await HiveDB.open(directory) })
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

const acct = (id: string): Account => ({ id, institutionId: 'i1', username: id, name: id, role: 'student', passwordHash: null, age: 30, createdAt: '2026-10-13T00:00:00.000Z', teacherId: 'doc' })
const node = (id: string, title = `Nodo ${id}`): ProgramNode => ({ id, title, objective: `Obj ${id}`, evidence: `Ev ${id}`, tags: ['sql'], question: { prompt: `¿${id}?`, options: ['a', 'b', 'c'], correct: 1 } })
const intent = { topic: 'SQL básico', goal: 'consultar', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado' }

const engine = () => new ProgramEngine(db, {
  planner: async () => ({ objective: 'Al terminar podrá consultar datos con SQL.', levels: [{ title: 'Base', goal: 'g', plannedNodes: 2 }, { title: 'Final', goal: 'g', plannedNodes: 2 }, { title: 'Más', goal: 'g', plannedNodes: 2 }], firstLevelNodes: [node('joins', 'JOIN'), node('where', 'WHERE')] }),
  adapter: async () => ({ reason: 'x', ops: [] }),
})

describe('proyecciones de lectura', () => {
  test('niveles y nodos se proyectan con el programa y se mantienen al responder y adaptar', async () => {
    const e = engine()
    const { program } = await e.open(acct('a1'), intent)
    const levels = db.collection<{ nodeCount: number }>(PROGRAM_LEVELS_COLLECTION)
    const nodes = db.collection<NodeRow>(PROGRAM_NODES_COLLECTION)
    expect((await levels.findBy('programId', program.id)).length).toBe(3)
    expect((await nodes.findBy('programId', program.id)).map(n => n.doc.nodeId).sort()).toEqual(['joins', 'where'])

    await e.answer(acct('a1'), program.id, { nodeId: 'joins', choice: 0 })
    const row = (await nodes.get(`${program.id}:joins`))!.doc
    expect(row).toMatchObject({ attempts: 1, mastered: false, firstTry: false, topic: 'sql básico', institutionId: 'i1' })

    // El docente quita un nodo aún no iniciado de un nivel futuro y añade otro: las proyecciones lo siguen.
    const reviews = new ProgramReviews(db, e.store, e.audit, async () => acct('a1'))
    await reviews.adjustPlan({ ...acct('doc'), role: 'teacher', teacherId: undefined }, program.id, [
      { op: 'materialize_level', levelIndex: 1, nodes: [node('g1'), node('g2'), node('g3')] },
    ], 'Agregar nivel')
    expect((await nodes.findBy('programId', program.id)).map(n => n.doc.nodeId).sort()).toEqual(['g1', 'g2', 'g3', 'joins', 'where'])
    await reviews.adjustPlan({ ...acct('doc'), role: 'teacher', teacherId: undefined }, program.id, [{ op: 'drop_unstarted_node', levelIndex: 1, nodeId: 'g3' }], 'Quitar uno')
    expect((await nodes.findBy('programId', program.id)).map(n => n.doc.nodeId)).not.toContain('g3')
  })

  test('weakNodes agrupa por tema y título y ordena por lo que más cuesta', async () => {
    const e = engine()
    for (const [id, choiceJoin] of [['a1', 0], ['a2', 0], ['a3', 1]] as const) {
      const { program } = await e.open(acct(id), intent)
      await e.answer(acct(id), program.id, { nodeId: 'joins', choice: choiceJoin })
      await e.answer(acct(id), program.id, { nodeId: 'where', choice: 1 })
    }
    const weak = await weakNodes(db, 'i1', { topic: 'sql' })
    expect(weak[0]).toMatchObject({ title: 'JOIN', students: 3 })
    expect(weak[0].firstTryRate).toBeCloseTo(1 / 3, 2)
    expect(weak[1]).toMatchObject({ title: 'WHERE', firstTryRate: 1 })
    expect(await weakNodes(db, 'i1', { accountIds: new Set(['a3']) })).toHaveLength(2)
    expect(await weakNodes(db, 'otra', {})).toEqual([])
  })
})
