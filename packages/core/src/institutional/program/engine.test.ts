import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HiveDB } from '@johpaz/hive-db'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Account } from '../accounts'
import type { ProgramPlan } from '../../tools/curriculum/definir-programa.tool'
import type { AdapterFn, PlannerFn } from '../../agent/program-architect'
import { ProgramEngine, ProgramRuleError } from './engine'
import { ProgramActiveError } from './program-store'
import type { ProgramNode } from './program-def'

let db: HiveDB, directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'hl-program-engine-')); db = await HiveDB.open(directory) })
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

const account = (id = 'a1'): Account => ({ id, institutionId: 'i1', username: id, name: 'Ana Prueba', role: 'student', passwordHash: null, age: 30, createdAt: '2026-10-13T00:00:00.000Z' })
const node = (id: string): ProgramNode => ({ id, title: `Nodo ${id}`, objective: `Objetivo ${id}`, evidence: `Muestra ${id}`, tags: ['sql'], question: { prompt: `¿${id}?`, options: ['uno', 'dos', 'tres'], correct: 1 } })
const intent = { topic: 'SQL básico', goal: 'consultar datos de mi trabajo', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado' }

const plan: ProgramPlan = {
  objective: 'Al terminar podrá consultar y filtrar datos con SQL.',
  levels: [
    { title: 'Fundamentos', goal: 'Entiende tablas y SELECT', plannedNodes: 3 },
    { title: 'Filtrar y ordenar', goal: 'Usa WHERE y ORDER BY', plannedNodes: 3 },
    { title: 'Evaluación final', goal: 'Integra todo', plannedNodes: 3 },
  ],
  firstLevelNodes: [node('a1'), node('a2'), node('a3')],
}
const planner: PlannerFn = async () => plan

function engineWith(over: { adapter?: AdapterFn; kev?: ConstructorParameters<typeof ProgramEngine>[1]['kev'] } = {}) {
  const calls: Array<{ decision: string; evidence: string }> = []
  const adapter: AdapterFn = over.adapter ?? (async input => {
    calls.push({ decision: input.decision, evidence: input.evidence })
    const next = input.program.levels[input.program.currentLevel + 1]
    const prefix = `n${input.program.currentLevel + 1}`
    return {
      reason: 'según la evidencia',
      ops: [
        ...(input.decision === 'hold' ? [{ op: 'add_reinforcement_level', afterLevel: input.program.currentLevel, title: 'Refuerzo', goal: 'Afianzar', nodes: [node(`r${input.program.currentLevel}a`), node(`r${input.program.currentLevel}b`)] }] : []),
        ...(next && input.decision !== 'hold' ? [{ op: 'materialize_level', levelIndex: next.index, nodes: [node(`${prefix}a`), node(`${prefix}b`), node(`${prefix}c`)] }] : []),
      ],
    }
  })
  return { engine: new ProgramEngine(db, { planner, adapter, kev: over.kev }), calls }
}

async function answerAll(engine: ProgramEngine, programId: string, nodeIds: string[], correct: boolean) {
  for (const id of nodeIds) await engine.answer(account(), programId, { nodeId: id, choice: correct ? 1 : 0 })
}

describe('ProgramEngine', () => {
  test('abre un programa con solo el primer nivel detallado y no deja abrir otro', async () => {
    const { engine } = engineWith()
    const view = await engine.open(account(), intent)
    expect(view.program.levels.map(l => [l.status, l.nodes.length])).toEqual([['active', 3], ['outline', 0], ['outline', 0]])
    expect(view.program.levels[2].kind).toBe('final')
    expect(view.program.validation).toBe('formative')
    await expect(engine.open(account(), intent)).rejects.toBeInstanceOf(ProgramActiveError)
    // Otra cuenta sí puede.
    await engine.open(account('a2'), intent)
  })

  test('una intención inválida se rechaza antes de planificar', async () => {
    let planned = 0
    const engine = new ProgramEngine(db, { planner: async i => { planned++; return plan }, adapter: async () => ({ reason: '', ops: [] }) })
    await expect(engine.open(account(), { ...intent, minutes: 1 })).rejects.toThrow()
    expect(planned).toBe(0)
  })

  test('la clave manda: acierto da el nodo por logrado, fallo no; nodos ajenos al nivel se rechazan', async () => {
    const { engine } = engineWith()
    const { program } = await engine.open(account(), intent)
    const ok = await engine.answer(account(), program.id, { nodeId: 'a1', choice: 1 })
    expect(ok).toMatchObject({ correct: true, mastered: true })
    const bad = await engine.answer(account(), program.id, { nodeId: 'a2', choice: 0 })
    expect(bad).toMatchObject({ correct: false, mastered: false })
    expect(bad.hint).toContain('Objetivo a2')
    await expect(engine.answer(account(), program.id, { nodeId: 'zzz', choice: 1 })).rejects.toMatchObject({ code: 'unknown_node' })
    await expect(engine.answer(account('otra'), program.id, { nodeId: 'a1', choice: 1 })).rejects.toMatchObject({ code: 'not_owner' })
  })

  test('no se cierra un nivel con nodos sin intentar', async () => {
    const { engine } = engineWith()
    const { program } = await engine.open(account(), intent)
    await engine.answer(account(), program.id, { nodeId: 'a1', choice: 1 })
    await expect(engine.checkpoint(account(), program.id)).rejects.toBeInstanceOf(ProgramRuleError)
  })

  test('checkpoint con dominio: avanza y el adaptador crea el nivel siguiente con la evidencia', async () => {
    const { engine, calls } = engineWith()
    const { program } = await engine.open(account(), intent)
    await answerAll(engine, program.id, ['a1', 'a2', 'a3'], true)
    const result = await engine.checkpoint(account(), program.id)
    expect(result.decision).toBe('advance')
    expect(result.adapted.applied).toBe(1)
    expect(result.program.currentLevel).toBe(1)
    expect(result.program.levels[0]).toMatchObject({ status: 'closed', checkpoint: { decision: 'advance', masteredCount: 3, total: 3 } })
    expect(result.program.levels[1].nodes.map(n => n.id)).toEqual(['n1a', 'n1b', 'n1c'])
    expect(result.program.levels[1].status).toBe('active')
    expect(calls[0].evidence).toContain('logrado al primer intento')
    expect(result.program.revisions.at(-1)).toMatchObject({ actor: 'agent' })
  })

  test('checkpoint sin dominio: inserta un refuerzo y sigue (no hay callejón sin salida)', async () => {
    const { engine, calls } = engineWith()
    const { program } = await engine.open(account(), intent)
    await answerAll(engine, program.id, ['a1', 'a2', 'a3'], false)
    const result = await engine.checkpoint(account(), program.id)
    expect(result.decision).toBe('hold')
    expect(calls[0].decision).toBe('hold')
    expect(result.program.levels.map(l => l.kind)).toEqual(['learning', 'reinforcement', 'learning', 'final'])
    expect(result.program.currentLevel).toBe(1)
    expect(result.program.levels[1].nodes.map(n => n.id)).toEqual(['r0a', 'r0b'])
    // El nivel cursado no cambió.
    expect(result.program.levels[0].nodes.map(n => n.id)).toEqual(['a1', 'a2', 'a3'])
  })

  test('el adaptador no puede tocar lo cursado: las operaciones se rechazan y el plan queda intacto', async () => {
    const { engine } = engineWith({
      adapter: async () => ({ reason: 'intento malicioso', ops: [
        { op: 'drop_unstarted_node', levelIndex: 0, nodeId: 'a1' },
        { op: 'retitle', levelIndex: 0, title: 'Reescrito' },
      ] }),
    })
    const { program } = await engine.open(account(), intent)
    await answerAll(engine, program.id, ['a1', 'a2', 'a3'], true)
    const result = await engine.checkpoint(account(), program.id)
    expect(result.adapted).toEqual({ applied: 0, rejected: 2 })
    expect(result.program.levels[0]).toMatchObject({ title: 'Fundamentos', status: 'closed' })
    expect(result.program.levels[0].nodes).toHaveLength(3)
    expect(result.needsContent).toBe(true)
  })

  test('si el adaptador falla, el programa sigue y el contenido se pide después', async () => {
    let fail = true
    const { engine } = engineWith({
      adapter: async input => {
        if (fail) throw new Error('modelo no disponible')
        const level = input.program.currentLevel + 1
        return { reason: 'reintento', ops: [{ op: 'materialize_level', levelIndex: level, nodes: [node('x1'), node('x2')] }] }
      },
    })
    const { program } = await engine.open(account(), intent)
    await answerAll(engine, program.id, ['a1', 'a2', 'a3'], true)
    const result = await engine.checkpoint(account(), program.id)
    expect(result.needsContent).toBe(true)
    expect(result.program.currentLevel).toBe(1)

    fail = false
    const retried = await engine.ensureLevelContent(account(), program.id)
    expect(retried.needsContent).toBe(false)
    expect(retried.program.levels[1].nodes.map(n => n.id)).toEqual(['x1', 'x2'])
  })

  test('con el modelo caído, el nivel se arma con repaso determinista de lo no logrado', async () => {
    const { engine } = engineWith({ adapter: async () => { throw new Error('modelo no disponible') } })
    const { program } = await engine.open(account(), intent)
    await engine.answer(account(), program.id, { nodeId: 'a1', choice: 1 })
    await engine.answer(account(), program.id, { nodeId: 'a2', choice: 0 })
    await engine.answer(account(), program.id, { nodeId: 'a3', choice: 1 })
    const result = await engine.checkpoint(account(), program.id)
    expect(result.needsContent).toBe(true)
    const filled = await engine.ensureLevelContent(account(), program.id)
    expect(filled.needsContent).toBe(false)
    const nodes = filled.program.levels[1].nodes
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    // Primero lo no logrado, con ids nuevos y marcado como repaso.
    expect(nodes[0].title).toStartWith('Repaso:')
    expect(nodes[0].id).toBe('a2-r')
    expect(filled.program.revisions.at(-1)).toMatchObject({ actor: 'system' })
  })

  test('el oráculo asesora: si ve evidencia débil pide revisión docente, sin frenar el programa', async () => {
    const kev = async () => ({ kind: 'custom' as const, ask: async () => ({ ready: { type: 'noul' as const, noul: 0.1 } }) })
    const { engine } = engineWith({ kev: kev as never })
    const { program } = await engine.open(account(), intent)
    await answerAll(engine, program.id, ['a1', 'a2', 'a3'], true)
    const result = await engine.checkpoint(account(), program.id)
    expect(result.decision).toBe('teacher_review')
    expect(result.program.currentLevel).toBe(1)
  })

  test('la evaluación final cierra el programa, queda pendiente de validación y libera la sesión', async () => {
    const { engine } = engineWith()
    let view = await engine.open(account(), intent)
    for (let level = 0; level < 3; level++) {
      const ids = view.program.levels[view.program.currentLevel].nodes.map(n => n.id)
      await answerAll(engine, view.program.id, ids, true)
      const result = await engine.checkpoint(account(), view.program.id)
      view = result
    }
    expect(view.program).toMatchObject({ status: 'closed', closeReason: 'completed', validation: 'pending_review', finalScore: 100 })
    expect(await engine.active(account())).toBeNull()
    await engine.open(account(), intent)
  })

  test('cerrar de forma voluntaria libera la sesión', async () => {
    const { engine } = engineWith()
    const { program } = await engine.open(account(), intent)
    const closed = await engine.close(account(), program.id)
    expect(closed).toMatchObject({ status: 'closed', closeReason: 'voluntary' })
    await engine.open(account(), intent)
  })
})
