/**
 * Mismo guion que el E2E de navegador pero contra el portal (sin Chromium): siempre corre en `bun test`.
 * Fija el contrato que el juego usa: crear, responder, checkpoint (advance/hold + refuerzo), cierre y validación docente.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HiveDB } from '@johpaz/hive-db'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Portal } from '../../packages/core/src/institutional/portal'
import { CORRECT, FIRST_LEVEL_IDS, WRONG, fakeProgramDeps } from './fakes'

let db: HiveDB, portal: Portal, directory: string, log: ReturnType<typeof fakeProgramDeps>['log']
const password = 'Contraseña de pruebas 2026!'
const intent = { topic: 'SQL básico', goal: 'consultar datos de mi trabajo', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado' }

async function request(path: string, method = 'GET', data?: unknown, cookie = '') {
  return portal.handle(new Request(`http://localhost/api/portal${path}`, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), cookie, origin: 'http://localhost' }, body: data ? JSON.stringify(data) : undefined }))
}
async function login(username: string, role: string) {
  const response = await request('/login', 'POST', { username, password, role })
  expect(response.status).toBe(200)
  return response.headers.get('set-cookie')!.split(';')[0]
}
async function addStudent(teacher: string, nickname: string) {
  const s = await (await request('/students', 'POST', { rows: [{ nickname, nombre: `Alumno ${nickname}`, tipo_documento: 'ti', documento: String(1000000 + Math.floor(Math.random() * 8999999)), edad: 30, grupo: 'E2E' }], authorized: true }, teacher)).json()
  await request('/activate', 'POST', { code: s.invitations[0].activationCode, password })
  return login(nickname, 'student')
}

interface View { id: string; status: string; closeReason?: string; validation: string; finalScore?: number; currentLevel: number; levels: Array<{ index: number; kind: string; status: string; nodes: Array<{ id: string }> }> }

/** Responde todos los nodos del nivel activo con `choice` y pide el checkpoint. */
async function playLevel(student: string, program: View, choice: number) {
  for (const node of program.levels[program.currentLevel].nodes) {
    const answer = await request(`/programs/${program.id}/answer`, 'POST', { nodeId: node.id, choice }, student)
    expect(answer.status).toBe(200)
  }
  const checkpoint = await request(`/programs/${program.id}/checkpoint`, 'POST', {}, student)
  expect(checkpoint.status).toBe(200)
  return (await checkpoint.json()) as { decision: string; program: View }
}

let teacher: string, admin: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hl-e2e-api-'))
  db = await HiveDB.open(directory)
  const deps = fakeProgramDeps()
  log = deps.log
  portal = new Portal(db, undefined, undefined, deps)
  await request('/setup', 'POST', { name: 'Admin', institution: 'Colegio IA', username: 'admin.ia', password })
  admin = await login('admin.ia', 'admin')
  const t = await (await request('/teachers', 'POST', { username: 'doc.uno', name: 'Docente Uno' }, admin)).json()
  await request('/activate', 'POST', { code: t.activationCode, password })
  teacher = await login('doc.uno', 'teacher')
})
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

describe('E2E de API: programa por niveles', () => {
  test('camino feliz: 3 niveles acertando, cierre con nota 100 y pendiente de validación', async () => {
    const student = await addStudent(teacher, 'ana')
    let { program } = await (await request('/programs', 'POST', intent, student)).json() as { program: View }
    expect(program.levels.map(l => l.status)).toEqual(['active', 'outline', 'outline'])
    expect(program.levels[0].nodes.map(n => n.id)).toEqual(FIRST_LEVEL_IDS)

    const decisions: string[] = []
    while (program.status !== 'closed') {
      const result = await playLevel(student, program, CORRECT)
      decisions.push(result.decision)
      program = result.program
    }
    expect(decisions).toEqual(['advance', 'advance', 'advance'])
    expect(program).toMatchObject({ closeReason: 'completed', validation: 'pending_review', finalScore: 100 })
    expect(log.planned).toBe(1)
  })

  test('fallar un nivel inserta un refuerzo, no cambia lo cursado y el programa igual termina', async () => {
    const student = await addStudent(teacher, 'beto')
    let { program } = await (await request('/programs', 'POST', intent, student)).json() as { program: View }

    const first = await playLevel(student, program, WRONG)
    expect(first.decision).toBe('hold')
    program = first.program
    expect(program.levels.map(l => l.kind)).toEqual(['learning', 'reinforcement', 'learning', 'final'])
    expect(program.currentLevel).toBe(1)
    expect(program.levels[0].nodes.map(n => n.id)).toEqual(FIRST_LEVEL_IDS)

    let guard = 0
    while (program.status !== 'closed' && guard++ < 6) program = (await playLevel(student, program, CORRECT)).program
    expect(program.status).toBe('closed')
    expect(log.adapted[0]).toEqual({ decision: 'hold', level: 0 })
  })

  test('el docente valida y queda la bitácora ordenada; el alumno no puede validar ni ver programas ajenos', async () => {
    const student = await addStudent(teacher, 'carla')
    const other = await addStudent(teacher, 'dario')
    let { program } = await (await request('/programs', 'POST', intent, student)).json() as { program: View }
    while (program.status !== 'closed') program = (await playLevel(student, program, CORRECT)).program

    const note = 'Evidencia suficiente en la práctica'
    expect((await request(`/programs/${program.id}/review`, 'POST', { decision: 'reaffirm', note }, student)).status).toBe(403)
    expect((await request(`/programs/${program.id}`, 'GET', undefined, other)).status).toBe(403)
    expect((await request(`/programs/${program.id}/answer`, 'POST', { nodeId: 'f1', choice: 1 }, other)).status).toBe(403)

    const queue = await (await request('/programs/review-queue', 'GET', undefined, teacher)).json()
    expect(queue.queue).toHaveLength(1)
    const reviewed = await request(`/programs/${program.id}/review`, 'POST', { decision: 'reaffirm', note }, teacher)
    expect(reviewed.status).toBe(200)
    expect((await reviewed.json()).program).toMatchObject({ validation: 'validated' })
    expect((await (await request('/programs/review-queue', 'GET', undefined, admin)).json()).queue).toEqual([])

    const { thread } = await (await request(`/programs/${program.id}/trace`, 'GET', undefined, teacher)).json()
    const types: string[] = thread.timeline.map((e: { type: string }) => e.type)
    expect(types[0]).toBe('intent')
    expect(types.at(-1)).toBe('validation')
    expect(types).toEqual(expect.arrayContaining(['answer', 'checkpoint', 'adaptation', 'state']))
  })

  test('contrato: sin sesión 401; un solo programa activo (409); la clave no llega al alumno', async () => {
    expect((await request('/programs/active')).status).toBe(401)
    const student = await addStudent(teacher, 'eva')
    const created = await request('/programs', 'POST', intent, student)
    expect(created.status).toBe(201)
    const body = await created.json()
    expect(JSON.stringify(body)).not.toContain('"correct"')
    const second = await request('/programs', 'POST', intent, student)
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ code: 'active_program_exists' })
  })
})
