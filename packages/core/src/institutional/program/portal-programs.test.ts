import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HiveDB } from '@johpaz/hive-db'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Portal } from '../portal'
import type { ProgramNode } from './program-def'

let db: HiveDB, portal: Portal, directory: string
const password = 'Una contraseña de prueba 2026!'
const node = (id: string): ProgramNode => ({ id, title: `Nodo ${id}`, objective: `Obj ${id}`, evidence: `Ev ${id}`, tags: ['sql'], question: { prompt: `¿${id}?`, options: ['a', 'b', 'c'], correct: 2 } })

async function request(path: string, method = 'GET', data?: unknown, cookie = '') {
  return portal.handle(new Request(`http://localhost/api/portal${path}`, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), cookie, origin: 'http://localhost' }, body: data ? JSON.stringify(data) : undefined }))
}
async function login(username: string, role: string) {
  const response = await request('/login', 'POST', { username, password, role })
  expect(response.status).toBe(200)
  return response.headers.get('set-cookie')!.split(';')[0]
}
async function world(username = 'est.uno') {
  await request('/setup', 'POST', { name: 'Admin', institution: 'Colegio IA', username: 'admin.ia', password })
  const admin = await login('admin.ia', 'admin')
  const t = await (await request('/teachers', 'POST', { username: 'doc.uno', name: 'Docente Uno' }, admin)).json()
  await request('/activate', 'POST', { code: t.activationCode, password })
  const teacher = await login('doc.uno', 'teacher')
  const s = await (await request('/students', 'POST', { rows: [{ nickname: username, nombre: 'Estudiante Uno', tipo_documento: 'ti', documento: '0012345', edad: 30, grupo: 'A' }], authorized: true }, teacher)).json()
  await request('/activate', 'POST', { code: s.invitations[0].activationCode, password })
  return { admin, teacher, student: await login(username, 'student') }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hl-portal-programs-'))
  db = await HiveDB.open(directory)
  portal = new Portal(db, undefined, undefined, {
    planner: async () => ({
      objective: 'Al terminar podrá consultar datos con SQL en su trabajo.',
      levels: [{ title: 'Base', goal: 'g', plannedNodes: 2 }, { title: 'Final', goal: 'g', plannedNodes: 2 }],
      firstLevelNodes: [node('q1'), node('q2')],
    }),
    adapter: async input => ({ reason: 'ok', ops: [{ op: 'materialize_level', levelIndex: input.program.currentLevel + 1, nodes: [node('f1'), node('f2')] }] }),
    kev: async () => null,
  })
})
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

const intent = { topic: 'SQL básico', goal: 'consultar datos de mi trabajo', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado' }

describe('programa personal en el portal', () => {
  test('el alumno declara su sesión, no recibe la clave y solo puede tener una activa', async () => {
    const { student } = await world()
    expect((await request('/programs/active', 'GET', undefined, student).then(r => r.json())).program).toBeNull()

    const created = await request('/programs', 'POST', intent, student)
    expect(created.status).toBe(201)
    const { program } = await created.json()
    expect(program.levels[0].nodes.map((n: { id: string }) => n.id)).toEqual(['q1', 'q2'])
    expect(JSON.stringify(program)).not.toContain('"correct"')
    expect(program.levels[1].nodes).toEqual([])

    const second = await request('/programs', 'POST', intent, student)
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ code: 'active_program_exists', programId: program.id })

    expect((await request('/programs', 'POST', { ...intent, minutes: 1 }, student)).status).toBe(422)
  })

  test('responde, cierra el nivel, recibe el siguiente adaptado y termina con evaluación final', async () => {
    const { student } = await world()
    let { program } = await (await request('/programs', 'POST', intent, student)).json()

    const wrong = await (await request(`/programs/${program.id}/answer`, 'POST', { nodeId: 'q1', choice: 0 }, student)).json()
    expect(wrong).toMatchObject({ correct: false, mastered: false })
    expect((await request(`/programs/${program.id}/checkpoint`, 'POST', {}, student)).status).toBe(409) // falta q2

    for (const id of ['q1', 'q2']) await request(`/programs/${program.id}/answer`, 'POST', { nodeId: id, choice: 2 }, student)
    const cp = await (await request(`/programs/${program.id}/checkpoint`, 'POST', {}, student)).json()
    expect(cp.decision).toBe('advance')
    expect(cp.program.currentLevel).toBe(1)
    expect(cp.program.levels[1].nodes.map((n: { id: string }) => n.id)).toEqual(['f1', 'f2'])

    for (const id of ['f1', 'f2']) await request(`/programs/${program.id}/answer`, 'POST', { nodeId: id, choice: 2 }, student)
    const final = await (await request(`/programs/${program.id}/checkpoint`, 'POST', {}, student)).json()
    expect(final.program).toMatchObject({ status: 'closed', closeReason: 'completed', validation: 'pending_review', finalScore: 100 })
    program = final.program
    // La sesión quedó libre.
    expect((await request('/programs', 'POST', intent, student)).status).toBe(201)
  })

  test('otro alumno no puede responder ni ver; el docente valida y se registra el hilo causal', async () => {
    const { student, teacher, admin } = await world()
    const { program } = await (await request('/programs', 'POST', intent, student)).json()
    for (const id of ['q1', 'q2']) await request(`/programs/${program.id}/answer`, 'POST', { nodeId: id, choice: 2 }, student)
    await request(`/programs/${program.id}/checkpoint`, 'POST', {}, student)
    for (const id of ['f1', 'f2']) await request(`/programs/${program.id}/answer`, 'POST', { nodeId: id, choice: 2 }, student)
    await request(`/programs/${program.id}/checkpoint`, 'POST', {}, student)

    // Un alumno ajeno (de otra institución simulada con otra cuenta) no puede ver el programa.
    const stranger = await (await request('/students', 'POST', { rows: [{ nickname: 'est.dos', nombre: 'Estudiante Dos', tipo_documento: 'ti', documento: '0099999', edad: 25, grupo: 'A' }], authorized: true }, teacher)).json()
    await request('/activate', 'POST', { code: stranger.invitations[0].activationCode, password })
    const other = await login('est.dos', 'student')
    expect((await request(`/programs/${program.id}`, 'GET', undefined, other)).status).toBe(403)
    expect((await request(`/programs/${program.id}/answer`, 'POST', { nodeId: 'q1', choice: 2 }, other)).status).toBe(403)

    const queue = await (await request('/programs/review-queue', 'GET', undefined, teacher)).json()
    expect(queue.queue).toHaveLength(1)
    expect(queue.queue[0]).toMatchObject({ id: program.id, topic: 'SQL básico', finalScore: 100 })

    expect((await request(`/programs/${program.id}/review`, 'POST', { decision: 'reaffirm', note: 'Evidencia suficiente en la práctica' }, student)).status).toBe(403)
    const reviewed = await request(`/programs/${program.id}/review`, 'POST', { decision: 'modify', correctedScore: 80, note: 'La práctica fue superficial en el nivel 2' }, teacher)
    expect(reviewed.status).toBe(200)
    expect((await reviewed.json()).program).toMatchObject({ validation: 'validated', finalScore: 80 })
    expect((await (await request('/programs/review-queue', 'GET', undefined, admin)).json()).queue).toEqual([])

    const trace = await request(`/programs/${program.id}/trace`, 'GET', undefined, teacher)
    expect(trace.status).toBe(200)
    const { thread } = await trace.json()
    expect(thread.timeline.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(['intent', 'answer', 'checkpoint', 'adaptation', 'state', 'validation']))
    // Es el registro tal como ocurrió: el orden de los eventos es el de la sesión.
    expect(thread.timeline[0].type).toBe('intent')
    expect(thread.timeline.at(-1).type).toBe('validation')
  })
})
