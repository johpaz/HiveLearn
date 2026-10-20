import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HiveDB } from '@johpaz/hive-db'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Account } from '../accounts'
import { ProgramAudit } from './audit'
import { ProgramEngine } from './engine'
import { ProgramGuides, MIN_PROGRAMS, describeGuide } from './guide'
import type { PersonalProgram, ProgramNode } from './program-def'
import { ProgramReviews, ReviewError } from './review'

let db: HiveDB, directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'hl-program-review-')); db = await HiveDB.open(directory) })
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

const acct = (id: string, role: Account['role'], extra: Partial<Account> = {}): Account => ({ id, institutionId: 'i1', username: id, name: id, role, passwordHash: null, age: 30, createdAt: '2026-10-13T00:00:00.000Z', ...extra })
const student = acct('est', 'student', { teacherId: 'doc' })
const teacher = acct('doc', 'teacher')
const otherTeacher = acct('otro', 'teacher')
const admin = acct('adm', 'admin')
const node = (id: string, tag = 'sql'): ProgramNode => ({ id, title: `Nodo ${id}`, objective: `Obj ${id}`, evidence: `Ev ${id}`, tags: [tag], question: { prompt: `¿${id}?`, options: ['a', 'b', 'c'], correct: 1 } })
const intent = { topic: 'SQL básico', goal: 'consultar datos', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado' }

async function completedProgram(owner = student, tag = 'sql'): Promise<{ engine: ProgramEngine; program: PersonalProgram }> {
  const engine = new ProgramEngine(db, {
    planner: async () => ({
      objective: 'Al terminar podrá consultar datos con SQL.',
      levels: [{ title: 'Base', goal: 'g', plannedNodes: 2 }, { title: 'Final', goal: 'g', plannedNodes: 2 }],
      firstLevelNodes: [node(`${owner.id}-a`, tag), node(`${owner.id}-b`, tag)],
    }),
    adapter: async input => ({ reason: 'ok', ops: [{ op: 'materialize_level', levelIndex: input.program.currentLevel + 1, nodes: [node(`${owner.id}-f1`, tag), node(`${owner.id}-f2`, tag)] }] }),
    guide: undefined,
  })
  let view = await engine.open(owner, intent)
  for (let i = 0; i < 2; i++) {
    for (const n of view.program.levels[view.program.currentLevel].nodes) await engine.answer(owner, view.program.id, { nodeId: n.id, choice: 1 })
    view = await engine.checkpoint(owner, view.program.id)
  }
  return { engine, program: view.program }
}

function reviews(engine: ProgramEngine) {
  return new ProgramReviews(db, engine.store, new ProgramAudit(db), async id => id === student.id ? student : null)
}

describe('validación docente', () => {
  test('el programa completado queda pendiente y el docente de ese alumno lo ve; otro docente no', async () => {
    const { engine, program } = await completedProgram()
    expect(program).toMatchObject({ status: 'closed', closeReason: 'completed', validation: 'pending_review', finalScore: 100 })
    const r = reviews(engine)
    expect((await r.queue(teacher)).map(p => p.id)).toEqual([program.id])
    expect(await r.queue(otherTeacher)).toEqual([])
    expect((await r.queue(admin)).map(p => p.id)).toEqual([program.id])
    await expect(r.review(otherTeacher, program.id, { decision: 'reaffirm', note: 'no es mi alumno' })).rejects.toBeInstanceOf(ReviewError)
    await expect(r.review(student, program.id, { decision: 'reaffirm', note: 'me autovalido ok' })).rejects.toBeInstanceOf(ReviewError)
  })

  test('reafirmar valida; modificar cambia la nota; queda el historial', async () => {
    const { engine, program } = await completedProgram()
    const r = reviews(engine)
    const modified = await r.review(teacher, program.id, { decision: 'modify', correctedScore: 70, note: 'La práctica abierta no mostró el criterio' })
    expect(modified).toMatchObject({ validation: 'validated', finalScore: 70 })
    const history = await r.history(teacher, program.id)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ decision: 'modify', previousScore: 100, correctedScore: 70, teacherId: 'doc' })
    expect(await r.queue(teacher)).toEqual([])
    await expect(r.review(teacher, program.id, { decision: 'modify', note: 'sin puntaje corregido' })).rejects.toMatchObject({ code: 'invalid' })
  })

  test('revocar quita el dominio de un nodo y recalcula la nota', async () => {
    const { engine, program } = await completedProgram()
    const r = reviews(engine)
    const nodeId = program.levels[0].nodes[0].id
    const updated = await r.review(teacher, program.id, { decision: 'revoke', nodeId, note: 'Acertó por azar: no explicó el porqué' })
    expect(updated.progress[nodeId]).toMatchObject({ mastered: false, teacher: { decision: 'revoke', by: 'doc' } })
    expect(updated.finalScore).toBe(75) // 3 de 4
    await expect(r.review(teacher, program.id, { decision: 'revoke', nodeId: 'no-existe', note: 'nodo inexistente aquí' })).rejects.toBeInstanceOf(ReviewError)
  })

  test('el docente ajusta niveles futuros de un programa activo, con las mismas guardas', async () => {
    const engine = new ProgramEngine(db, {
      planner: async () => ({ objective: 'Al terminar podrá hacer algo útil con SQL.', levels: [{ title: 'Base', goal: 'g', plannedNodes: 2 }, { title: 'Siguiente', goal: 'g', plannedNodes: 2 }, { title: 'Final', goal: 'g', plannedNodes: 2 }], firstLevelNodes: [node('x1'), node('x2')] }),
      adapter: async () => ({ reason: 'x', ops: [] }),
    })
    const { program } = await engine.open(student, intent)
    // El alumno ya empezó el nivel 1: eso es historia y el docente no puede reescribirlo.
    await engine.answer(student, program.id, { nodeId: 'x1', choice: 1 })
    const r = reviews(engine)
    const result = await r.adjustPlan(teacher, program.id, [
      { op: 'retitle', levelIndex: 1, title: 'Consultas con filtros' },
      { op: 'retitle', levelIndex: 0, title: 'No debería poder' },
    ], 'El grupo necesita énfasis en filtros')
    expect(result.applied).toHaveLength(1)
    expect(result.rejected).toHaveLength(1)
    expect(result.saved.levels[1].title).toBe('Consultas con filtros')
    expect(result.saved.revisions.at(-1)).toMatchObject({ actor: 'teacher' })
  })
})

describe('guía agregada', () => {
  test('se aprende al completar, respeta k-anonimato y no contiene datos personales', async () => {
    const guides = new ProgramGuides(db)
    expect(await guides.brief('SQL básico', 'adulto', 'es')).toBeUndefined()
    for (let i = 0; i < MIN_PROGRAMS; i++) {
      const owner = acct(`alumno-${i}`, 'student', { name: `Nombre Secreto ${i}` })
      // El motor aprende solo al completar el programa: aquí no se registra a mano.
      await completedProgram(owner, 'joins')
      if (i < MIN_PROGRAMS - 1) expect(await guides.brief('SQL básico', 'adulto', 'es')).toBeUndefined()
    }
    const brief = await guides.brief('SQL básico', 'adulto', 'es')
    expect(brief).toContain(`${MIN_PROGRAMS} programas`)
    expect(brief).toContain('joins')
    expect(brief).not.toMatch(/Nombre Secreto|alumno-/)
    expect(brief!.length).toBeLessThanOrEqual(800)
  })

  test('un tema parecido encuentra la guía con la búsqueda híbrida de HiveDB', async () => {
    const guides = new ProgramGuides(db)
    for (let i = 0; i < MIN_PROGRAMS; i++) {
      await completedProgram(acct(`b-${i}`, 'student'), 'consultas')
    }
    // No coincide la clave exacta: "SQL" vs "SQL básico". La búsqueda por texto la encuentra igualmente.
    const found = await guides.brief('SQL', 'adulto', 'es')
    expect(found).toBeDefined()
    expect(await guides.brief('SQL', 'ninez', 'es')).toBeUndefined()
  })

  test('describeGuide resume sin identidad', () => {
    const text = describeGuide({ key: 'k', topic: 'sql', band: 'adulto', language: 'es', programs: 4, totals: { levels: 12, nodes: 20, mastered: 15, attempts: 30, reinforcements: 2, firstTry: 10 }, weakTags: { joins: 3 }, strongTags: { select: 5 }, updatedAt: '' })
    expect(text).toContain('4 programas')
    expect(text).toContain('refuerzo en 50%')
    expect(text).toContain('joins')
  })
})
