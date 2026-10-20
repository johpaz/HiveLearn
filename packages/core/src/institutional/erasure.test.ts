import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HiveDB } from '@johpaz/hive-db'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Portal } from './portal'
import type { ProgramNode } from './program/program-def'

let db: HiveDB, portal: Portal, directory: string
const password = 'Una contraseña de prueba 2026!'
const node = (id: string): ProgramNode => ({ id, title: `Nodo ${id}`, objective: `Obj ${id}`, evidence: `Ev ${id}`, tags: ['sql'], question: { prompt: `¿${id}?`, options: ['a', 'b', 'c'], correct: 2 } })
// Todas las colecciones con datos de la aplicación (menos el log de eventos, que es de solo anexar).
const ALL = ['hl_accounts', 'hl_usernames', 'hl_auth_sessions', 'hl_invitations', 'hl_recovery', 'hl_student_identities', 'hl_document_keys', 'hl_enrollment_attestations',
  'hl_learning_records', 'hl_learning_journeys', 'hl_curriculum_progress', 'hl_curriculum_journeys', 'hl_curriculum_reviews', 'hl_competency_reviews', 'hl_level_reviews',
  'hl_student_evidence', 'hl_assessment_evidence', 'hl_student_memory', 'hl_supplement_jobs', 'hl_student_aliases',
  'hl_personal_programs', 'hl_program_levels', 'hl_program_nodes', 'hl_program_locks', 'hl_program_reviews', 'hl_program_trace']

async function request(path: string, method = 'GET', data?: unknown, cookie = '') {
  return portal.handle(new Request(`http://localhost/api/portal${path}`, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), cookie, origin: 'http://localhost' }, body: data ? JSON.stringify(data) : undefined }))
}
async function login(username: string, role: string) {
  const response = await request('/login', 'POST', { username, password, role })
  expect(response.status).toBe(200)
  return response.headers.get('set-cookie')!.split(';')[0]
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hl-erasure-'))
  db = await HiveDB.open(directory)
  portal = new Portal(db, undefined, undefined, {
    planner: async () => ({ objective: 'Al terminar podrá consultar datos con SQL.', levels: [{ title: 'Base', goal: 'g', plannedNodes: 2 }, { title: 'Final', goal: 'g', plannedNodes: 2 }], firstLevelNodes: [node('q1'), node('q2')] }),
    adapter: async input => ({ reason: 'ok', ops: [{ op: 'materialize_level', levelIndex: input.program.currentLevel + 1, nodes: [node('f1'), node('f2')] }] }),
    kev: async () => null,
  })
})
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

async function world() {
  await request('/setup', 'POST', { name: 'Admin', institution: 'Colegio IA', username: 'admin.ia', password })
  const admin = await login('admin.ia', 'admin')
  const t = await (await request('/teachers', 'POST', { username: 'doc.uno', name: 'Docente Uno' }, admin)).json()
  await request('/activate', 'POST', { code: t.activationCode, password })
  const teacher = await login('doc.uno', 'teacher')
  const s = await (await request('/students', 'POST', { rows: [
    { nickname: 'est.uno', nombre: 'Estudiante Uno', tipo_documento: 'ti', documento: '0012345', edad: 30, grupo: 'A' },
    { nickname: 'est.dos', nombre: 'Estudiante Dos', tipo_documento: 'ti', documento: '0099999', edad: 31, grupo: 'A' },
  ], authorized: true }, teacher)).json()
  const accounts = await Promise.all(s.invitations.map(async (i: { username: string; activationCode: string }) => {
    await request('/activate', 'POST', { code: i.activationCode, password })
    return { username: i.username, cookie: await login(i.username, 'student') }
  }))
  const list = (await (await request('/dashboard', 'GET', undefined, admin)).json()).accounts as Array<{ id: string; username: string; role: string }>
  const idOf = (u: string) => list.find(a => a.username === u)!.id
  return { admin, teacher, uno: accounts[0], dos: accounts[1], idOf }
}

async function everythingMentioning(id: string): Promise<string[]> {
  const found: string[] = []
  for (const name of ALL) {
    for (const entry of await db.collection<unknown>(name).scan()) {
      if (entry.id.includes(id) || JSON.stringify(entry.doc).includes(id)) { found.push(name); break }
    }
  }
  return found
}

describe('borrado en cascada de una cuenta', () => {
  test('elimina todo lo del alumno y deja intacto lo de otro', async () => {
    const { admin, uno, dos, idOf } = await world()
    const intent = { topic: 'SQL básico', goal: 'consultar datos', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado' }
    for (const who of [uno, dos]) {
      const { program } = await (await request('/programs', 'POST', intent, who.cookie)).json()
      for (const id of ['q1', 'q2']) await request(`/programs/${program.id}/answer`, 'POST', { nodeId: id, choice: 2 }, who.cookie)
      await request(`/programs/${program.id}/checkpoint`, 'POST', {}, who.cookie)
    }
    const unoId = idOf('est.uno'), dosId = idOf('est.dos')
    expect(await everythingMentioning(unoId)).toEqual(expect.arrayContaining(['hl_accounts', 'hl_personal_programs', 'hl_program_nodes', 'hl_student_memory']))

    // Solo el administrador, con confirmación explícita.
    expect((await request(`/accounts/${unoId}`, 'DELETE', { confirm: 'est.uno' }, uno.cookie)).status).toBe(403)
    expect((await request(`/accounts/${unoId}`, 'DELETE', { confirm: 'otro' }, admin)).status).toBe(422)

    const response = await request(`/accounts/${unoId}`, 'DELETE', { confirm: 'est.uno' }, admin)
    expect(response.status).toBe(200)
    const { report } = await response.json()
    expect(report.removed).toMatchObject({ hl_accounts: 1, hl_personal_programs: 1 })

    expect(await everythingMentioning(unoId)).toEqual([])
    expect(await everythingMentioning(dosId)).toEqual(expect.arrayContaining(['hl_accounts', 'hl_personal_programs']))
    // Sin su cuenta no puede entrar, y su nombre de usuario queda libre.
    expect((await request('/login', 'POST', { username: 'est.uno', password, role: 'student' })).status).toBe(401)
    expect((await request('/me', 'GET', undefined, uno.cookie)).status).toBe(401)
    // Constancia sin datos personales.
    const log = await db.collection<{ by: string; removed: Record<string, number> }>('hl_erasure_log').scan()
    expect(log).toHaveLength(1)
    expect(JSON.stringify(log[0].doc)).not.toContain('est.uno')
  })

  test('reglas: no a un administrador, no a uno mismo, no a un docente con alumnos', async () => {
    const { admin, teacher, idOf } = await world()
    expect((await request(`/accounts/${idOf('admin.ia')}`, 'DELETE', { confirm: 'admin.ia' }, admin)).status).toBe(409)
    const refused = await request(`/accounts/${idOf('doc.uno')}`, 'DELETE', { confirm: 'doc.uno' }, admin)
    expect(refused.status).toBe(409)
    expect((await refused.json()).error).toContain('alumno')
    expect((await request(`/accounts/${idOf('est.uno')}`, 'DELETE', { confirm: 'est.uno' }, teacher)).status).toBe(403)
    expect((await request('/accounts/no-existe', 'DELETE', { confirm: 'x' }, admin)).status).toBe(404)
  })
})
