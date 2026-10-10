import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HiveDB } from '@johpaz/hive-db'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { Portal } from './portal'
import { QUESTION_BANK } from './learning'
import { STUDENT_COLUMNS, parseStudents, studentTemplate } from './spreadsheet'
import { applyMessage, boundValue, resolveAction, type Surface } from './a2ui-protocol'
import { DEFAULT_SETTINGS, saveSettings, setCredential, settingsView } from './settings'
import { Supplements, runSupplementWorker, type SupplementJob } from './supplements'
import { digest } from './accounts'
import { normalizeLogo } from './branding'
import { onLogEntry, removeLogListener, type LogEntry } from '../utils/logger'

let db: HiveDB, portal: Portal, directory: string
const password = 'Una contraseña de prueba 2026!'
const row = (nickname = 'alumna.uno', documento = '0012345') => ({ nickname, nombre: 'Alumna Ejemplo', tipo_documento: 'ti', documento, edad: 12, grupo: 'IA A' })
async function request(path: string, method = 'GET', data?: unknown, cookie = '', headers: Record<string, string> = {}) {
  return portal.handle(new Request(`http://localhost/api/portal${path}`, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), cookie, origin: 'http://localhost', ...headers }, body: data ? JSON.stringify(data) : undefined }))
}
async function login(username: string, role: string) {
  const response = await request('/login', 'POST', { username, password, role })
  expect(response.status).toBe(200)
  expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  return response.headers.get('set-cookie')!.split(';')[0]
}
async function institution() {
  const setup = await request('/setup', 'POST', { name: 'Admin Ejemplo', institution: 'Institución IA', username: 'admin.ia', password })
  expect(setup.status).toBe(201)
  return login('admin.ia', 'admin')
}
async function teacher(admin: string, username = 'maestro.uno') {
  const response = await request('/teachers', 'POST', { username, name: 'Docente Ejemplo' }, admin)
  expect(response.status).toBe(201)
  const result = await response.json()
  expect((await request('/activate', 'POST', { code: result.activationCode, password })).status).toBe(200)
  return login(username, 'teacher')
}
async function student(teacherCookie: string) {
  const response = await request('/students', 'POST', { rows: [row()], authorized: true }, teacherCookie)
  expect(response.status).toBe(201)
  const { invitations } = await response.json()
  expect((await request('/activate', 'POST', { code: invitations[0].activationCode, password })).status).toBe(200)
  return login('alumna.uno', 'student')
}
const diagnostic = () => ({ answers: QUESTION_BANK.map(q => ({ questionId: q.id, option: q.correct })) })
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'hivelearn-portal-test-')); db = await HiveDB.open(directory); portal = new Portal(db) })
afterEach(async () => { await db?.close(); if (directory) await rm(directory, { recursive: true, force: true }) })

describe('login, activation and profiles', () => {
  test('expired invitations and sessions fail; reissued invitation invalidates the previous code', async () => {
    const admin = await institution()
    const { invitations } = await (await request('/students', 'POST', { rows: [row()], authorized: true }, admin)).json()
    const code = invitations[0].activationCode, col = db.collection<{ accountId: string; expiresAt: number }>('hl_invitations'), entry = (await col.get(digest(code)))!
    await col.put(entry.id, { ...entry.doc, expiresAt: Date.now() - 1000 })
    expect((await request('/activate', 'POST', { code, password })).status).toBe(400)
    const renewed = await (await request(`/accounts/${entry.doc.accountId}/invitation`, 'POST', {}, admin)).json()
    expect((await request('/activate', 'POST', { code, password })).status).toBe(400)
    expect((await request('/activate', 'POST', { code: renewed.activationCode, password })).status).toBe(200)
    const session = (await db.collection<{ accountId: string; expiresAt: number }>('hl_auth_sessions').scan())[0]
    await db.collection('hl_auth_sessions').put(session.id, { ...session.doc, expiresAt: Date.now() - 1 })
    expect((await request('/me', 'GET', undefined, admin)).status).toBe(401)
  })
  test('bootstrap is open only until the first institution exists; dashboard requires session', async () => {
    expect((await request('/dashboard')).status).toBe(401)
    const admin = await institution()
    expect((await request('/dashboard', 'GET', undefined, admin)).status).toBe(200)
    expect((await request('/setup', 'POST', { name: 'Otro Admin', institution: 'Otra IA', username: 'otro.admin', password })).status).toBe(409)
  })
  test('wrong password or wrong role cannot log in; logout revokes session', async () => {
    const admin = await institution()
    const entries: LogEntry[] = []
    const listener = (entry: LogEntry) => entries.push(entry)
    onLogEntry(listener)
    try {
      expect((await request('/login', 'POST', { username: 'admin.ia', password, role: 'teacher' })).status).toBe(401)
    } finally { removeLogListener(listener) }
    expect(entries.some(entry => entry.message.includes('Inicio de sesión rechazado') && entry.meta?.role === 'teacher')).toBeTrue()
    expect(JSON.stringify(entries)).not.toContain('admin.ia')
    expect((await request('/login', 'POST', { username: 'admin.ia', password: 'wrong', role: 'admin' })).status).toBe(401)
    await request('/logout', 'POST', {}, admin)
    expect((await request('/me', 'GET', undefined, admin)).status).toBe(401)
  })
  test('student creates password once, never receives document in responses', async () => {
    const admin = await institution()
    const create = await request('/students', 'POST', { rows: [row()], authorized: true }, admin)
    const result = await create.json(), code = result.invitations[0].activationCode
    expect(JSON.stringify(result)).not.toContain('0012345')
    expect((await request('/login', 'POST', { username: 'alumna.uno', password, role: 'student' })).status).toBe(401)
    expect((await request('/activate', 'POST', { code, password: 'short' })).status).toBe(422)
    expect((await request('/activate', 'POST', { code, password })).status).toBe(200)
    expect((await request('/activate', 'POST', { code, password })).status).toBe(400)
    const session = await login('alumna.uno', 'student')
    const identity = (await db.collection<Record<string, unknown>>('hl_student_identities').scan())[0].doc
    expect(identity.documentNumber).toBeUndefined()
    expect(identity.documentCiphertext).toBeString()
    const profile = await request('/profile', 'PATCH', { name: 'Nombre visible' }, session)
    expect((await profile.json()).account.name).toBe('Nombre visible')
    expect((await request('/profile', 'PATCH', { name: 'Admin', role: 'admin' }, session)).status).toBe(422)
  })
  test('rejects cross-origin writes and rate limits login', async () => {
    const cross = await portal.handle(new Request('http://localhost/api/portal/login', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }))
    expect(cross.status).toBe(403)
    for (let i = 0; i < 15; i++) await request('/login', 'POST', { username: 'none', password, role: 'student' })
    expect((await request('/login', 'POST', { username: 'none', password, role: 'student' })).status).toBe(429)
  })
})

describe('provider policy and durable Bun workers', () => {
  test('Bun.Image normalizes institution logos and rejects invalid inputs', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
    const result = await normalizeLogo(png)
    expect(Buffer.from(result).subarray(1, 4).toString()).toBe('PNG')
    await expect(normalizeLogo(new Uint8Array(1024 * 1024 + 1))).rejects.toThrow('1 MB')
    await expect(normalizeLogo(new TextEncoder().encode('<svg onload="alert(1)"/>'))).rejects.toThrow()
  })
  test('admin settings propagate to agents; teachers cannot edit; vault never returns credentials', async () => {
    const admin = await institution(), actor = (await portal.accounts.byUsername('admin.ia'))!
    await db.collection('providers').put('ollama', { name: 'Ollama', base_url: 'http://127.0.0.1:11434' })
    await db.collection('hl_agents').put('hl-content-agent', { active: 1 })
    expect((await request('/settings', 'PUT', { ...DEFAULT_SETTINGS, modelId: 'test-model' }, admin)).status).toBe(200)
    expect((await db.collection<{ model_id: string }>('hl_agents').get('hl-content-agent'))?.doc.model_id).toBe('test-model')
    const teacherSession = await teacher(admin)
    expect((await request('/settings', 'GET', undefined, teacherSession)).status).toBe(403)
    let stored = ''
    await setCredential(db, actor.institutionId, 'ollama', { apiKey: 'not-a-real-secret' }, { set: async input => { stored = input.value } })
    expect(stored).toBe('not-a-real-secret')
    expect(JSON.stringify(await settingsView(db, actor.institutionId))).not.toContain('not-a-real-secret')
    expect((await settingsView(db, actor.institutionId)).providers[0].hasApiKey).toBe(true)
  })
  test('remote providers and minor policy are enforced before scheduling', async () => {
    const admin = await institution(), learner = await student(admin), actor = (await portal.accounts.byUsername('alumna.uno'))!
    await request('/diagnostic', 'POST', diagnostic(), learner)
    await db.collection('providers').put('ollama', { base_url: 'https://remote.example' })
    const jobs = new Supplements(db, async () => 'Explicación de prueba, no llama a un provider real.')
    await expect(jobs.request(actor, 'ai-agency')).rejects.toThrow('política')
    await saveSettings(db, actor.institutionId, { ...DEFAULT_SETTINGS, allowRemoteProviders: true })
    await expect(jobs.request(actor, 'ai-agency')).rejects.toThrow('política')
    expect(await db.collection('hl_supplement_jobs').scan()).toHaveLength(0)
  })
  test('queued jobs resume, retain version and do not duplicate completed work', async () => {
    const admin = await institution(), learner = await student(admin), actor = (await portal.accounts.byUsername('alumna.uno'))!
    await request('/diagnostic', 'POST', diagnostic(), learner)
    await db.collection('providers').put('ollama', { base_url: 'http://127.0.0.1:11434' })
    let calls = 0
    const service = new Supplements(db, async input => { calls++; expect(input.prompt).not.toContain(actor.name); return 'Explicación complementaria de prueba, con supervisión humana.' })
    const job = await service.request(actor, 'ai-agency')
    for (let i = 0; i < 100 && (await service.list(actor, 'ai-agency'))[0].status !== 'completed'; i++) await Bun.sleep(10)
    expect((await service.list(actor, 'ai-agency'))[0].status).toBe('completed')
    await service.request(actor, 'ai-agency'); expect(calls).toBe(1)
    const col = db.collection<SupplementJob>('hl_supplement_jobs'), existing = (await col.get(job.id))!
    await col.put(job.id, { ...existing.doc, status: 'running', leaseUntil: Date.now() - 1, attempts: 1 })
    await new Supplements(db, async () => 'Trabajo recuperado después de una interrupción.').resume()
    for (let i = 0; i < 100 && (await col.get(job.id))!.doc.status !== 'completed'; i++) await Bun.sleep(10)
    expect((await col.get(job.id))!.doc.text).toContain('recuperado')
  })
  test('native Bun worker communicates with a local mock provider', async () => {
    const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: async req => {
      const data = await req.json() as { messages: { content: string }[] }
      expect(data.messages[0].content).toBe('Explain AI with human oversight')
      return Response.json({ message: { content: 'An AI model needs human oversight and evaluation.' } })
    } })
    try { expect(await runSupplementWorker({ url: `http://127.0.0.1:${server.port}/api/chat`, model: 'test', ollama: true, prompt: 'Explain AI with human oversight' })).toContain('human oversight') }
    finally { server.stop(true) }
  })
})

describe('role dashboards and ownership', () => {
  test('admin sees institution, teachers see assigned students, student sees self', async () => {
    const admin = await institution(), one = await teacher(admin), two = await teacher(admin, 'maestro.dos'), learner = await student(one)
    const adminData = await (await request('/dashboard', 'GET', undefined, admin)).json()
    const teacherData = await (await request('/dashboard', 'GET', undefined, one)).json()
    const otherData = await (await request('/dashboard', 'GET', undefined, two)).json()
    const studentData = await (await request('/dashboard', 'GET', undefined, learner)).json()
    expect(adminData.stats).toEqual({ students: 1, teachers: 2, diagnosed: 0 })
    expect(teacherData.stats.students).toBe(1)
    expect(otherData.stats.students).toBe(0)
    expect(studentData.accounts).toHaveLength(1)
    expect(JSON.stringify(adminData)).not.toContain('passwordHash')
    const id = studentData.account.id
    expect((await request(`/students/${id}/route`, 'GET', undefined, two)).status).toBe(404)
    expect((await request('/teachers', 'POST', { username: 'intruder', name: 'No permitido' }, learner)).status).toBe(403)
    expect((await request('/students/template', 'GET', undefined, learner)).status).toBe(403)
  })
})

describe('Excel enrollment', () => {
  test('downloadable workbook has required headers and no example enrollment', () => {
    expect(parseStudents(studentTemplate())).toEqual([])
  })
  test('preview and import preserve text documents and create activation codes', async () => {
    const admin = await institution()
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([row()], { header: [...STUDENT_COLUMNS] }), 'Alumnos')
    const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'buffer', compression: true })
    for (const path of ['/students/import/preview', '/students/import']) {
      const form = new FormData(); form.set('file', new File([bytes], 'alumnos.xlsx')); form.set('authorized', 'true')
      const response = await portal.handle(new Request(`http://localhost/api/portal${path}`, { method: 'POST', headers: { cookie: admin }, body: form }))
      expect(response.status).toBe(path.endsWith('preview') ? 200 : 201)
      expect(await response.text()).not.toContain('0012345')
    }
    expect((await db.collection('hl_accounts').scan())).toHaveLength(2)
  })
  test('rejects duplicate batch atomically and rejects numeric documents and formulas', async () => {
    const admin = await institution()
    expect((await request('/students', 'POST', { rows: [row(), row('second')], authorized: true }, admin)).status).toBe(400)
    expect((await db.collection('hl_accounts').scan())).toHaveLength(1)
    const book = XLSX.utils.book_new(), sheet = XLSX.utils.json_to_sheet([{ ...row(), documento: 123 }], { header: [...STUDENT_COLUMNS] })
    XLSX.utils.book_append_sheet(book, sheet, 'Alumnos')
    expect(() => parseStudents(XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }))).toThrow('texto')
    sheet.D2 = { t: 's', v: '0012345', f: '1+1' }
    expect(() => parseStudents(XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }))).toThrow('fórmulas')
  })
})

describe('diagnostic, knowledge graph, learning route and A2UI', () => {
  test('guided A2UI journey persists onboarding, adapts diagnostic order and returns local-agent feedback', async () => {
    const admin = await institution(), learner = await student(admin)
    let feedbackPrompt = ''
    portal = new Portal(db, async input => { feedbackPrompt = input.prompt; return 'Explicaste bien la responsabilidad humana. Añade ahora un límite concreto. ¿Qué debería ocurrir si faltan datos?' })
    await db.collection('providers').put('ollama', { name: 'Ollama', base_url: 'http://127.0.0.1:11434' })
    const actor = (await portal.accounts.byUsername('alumna.uno'))!
    const act = (name: string, context: Record<string, string> = {}, surfaceId = `journey:${actor.id}`) => request('/journey/actions', 'POST', { userAction: { name, surfaceId, sourceComponentId: 'test-control', timestamp: new Date().toISOString(), context } }, learner)

    expect((await request('/journey', 'GET', undefined, learner)).status).toBe(200)
    expect((await act('start_journey')).status).toBe(200)
    expect((await act('choose_interest', { value: 'ciencia' })).status).toBe(200)
    expect((await act('choose_learning_mode', { value: 'retos' })).status).toBe(200)
    expect((await db.collection<{ questionOrder: string[] }>('hl_learning_journeys').get(actor.id))?.doc.questionOrder[0]).toBe('patterns')

    for (let index = 0; index < QUESTION_BANK.length; index++) {
      const state = (await db.collection<{ questionOrder: string[]; answers: unknown[] }>('hl_learning_journeys').get(actor.id))!.doc
      const questionId = state.questionOrder[state.answers.length]
      const question = QUESTION_BANK.find(item => item.id === questionId)!
      const option = index === 0 ? (question.correct + 1) % question.options.length : question.correct
      expect((await act('answer_diagnostic', { questionId, option: String(option) })).status).toBe(200)
    }
    const ready = (await db.collection<{ stage: string; focusNodeId: string }>('hl_learning_journeys').get(actor.id))!.doc
    expect(ready.stage).toBe('route_ready')
    expect(ready.focusNodeId).toBe('data-patterns')
    expect((await act('begin_learning')).status).toBe(200)
    expect((await act('continue_to_practice')).status).toBe(200)
    const response = 'Los datos muestran solo una parte del mundo; probaría perros de distintos colores y revisaría los errores.'
    const result = await act('submit_practice', { nodeId: 'data-patterns', response })
    expect(result.status).toBe(200)
    expect(feedbackPrompt).toContain(response)
    expect(feedbackPrompt).toContain('ciencia')
    const body = await result.json()
    expect(JSON.stringify(body)).toContain('Añade ahora un límite concreto')
    expect(await db.collection('hl_student_evidence').scan()).toHaveLength(1)
    expect((await act('revise_practice')).status).toBe(200)
    expect((await act('start_journey', {}, 'journey:otro-alumno')).status).toBe(400)
  })

  test('scores server-side, persists route and rejects client mastery or duplicate questions', async () => {
    const admin = await institution(), learner = await student(admin)
    const questions = await (await request('/diagnostic', 'GET', undefined, learner)).json()
    expect(questions.questions[0].correct).toBeUndefined()
    expect((await request('/diagnostic', 'POST', { ...diagnostic(), mastered: ['ai-agency'] }, learner)).status).toBe(422)
    const invalid = diagnostic(); invalid.answers[1] = invalid.answers[0]
    expect((await request('/diagnostic', 'POST', invalid, learner)).status).toBe(400)
    const route = (await (await request('/diagnostic', 'POST', diagnostic(), learner)).json()).route
    expect(route.level).toBe('creador_avanzado')
    expect(route.nodes.filter((n: { status: string }) => n.status === 'mastered')).toHaveLength(0)
    expect((await (await request('/route', 'GET', undefined, learner)).json()).route).toEqual(route)
  })
  test('A2UI JSONL binds data, posts evidence and teacher review unlocks dependency', async () => {
    const admin = await institution(), learner = await student(admin)
    expect((await request('/a2ui?nodeId=ai-agency', 'GET', undefined, learner)).status).toBe(409)
    await request('/diagnostic', 'POST', diagnostic(), learner)
    const response = await request('/a2ui?nodeId=ai-agency', 'GET', undefined, learner)
    expect(response.headers.get('content-type')).toContain('ndjson')
    let state: Record<string, Surface> = {}
    for (const line of (await response.text()).trim().split('\n')) state = applyMessage(state, JSON.parse(line))
    const surface = state['competency:ai-agency']
    expect(boundValue({ path: '/title' }, surface.data)).toBe('IA y decisiones humanas')
    const component = surface.components.submit
    if (!('Button' in component)) throw new Error('Button required')
    const action = resolveAction('competency:ai-agency', 'submit', component.Button.action, { ...surface.data, response: 'Las personas que usan el sistema deben revisar sus decisiones.' })
    expect((await request('/a2ui/actions', 'POST', action, learner)).status).toBe(200)
    expect((await request('/a2ui/actions', 'POST', action, learner)).status).toBe(200)
    expect(await db.collection('hl_student_evidence').scan()).toHaveLength(1)
    const id = (await (await request('/me', 'GET', undefined, learner)).json()).account.id
    expect((await request(`/students/${id}/reviews`, 'POST', { nodeId: 'data-patterns', evidence: 'Una evidencia revisada y suficiente para acreditar.' }, admin)).status).toBe(400)
    const reviewed = await request(`/students/${id}/reviews`, 'POST', { nodeId: 'ai-agency', evidence: 'Explica correctamente la responsabilidad humana en tres casos.' }, admin)
    expect(reviewed.status).toBe(200)
    expect((await reviewed.json()).route.nodes.find((n: { id: string }) => n.id === 'data-patterns').status).toBe('available')
  })
  test('renderer rejects cycles, unsupported components and prototype pollution', () => {
    expect(() => applyMessage({}, JSON.parse('{"dataModelUpdate":{"surfaceId":"x","contents":[{"key":"__proto__","valueString":"bad"}]}}'))).toThrow()
    const state = applyMessage({}, { surfaceUpdate: { surfaceId: 'x', components: [{ id: 'root', component: { Card: { child: 'root' } } }] } })
    expect(() => applyMessage(state, { beginRendering: { surfaceId: 'x', root: 'root' } })).toThrow()
    expect(() => applyMessage({}, JSON.parse('{"surfaceUpdate":{"surfaceId":"x","components":[{"id":"root","component":{"Script":{}}}]}}'))).toThrow()
  })
  test('surface updates and deletion do not affect another surface', () => {
    let state: Record<string, Surface> = {}
    state = applyMessage(state, { dataModelUpdate: { surfaceId: 'one', contents: [{ key: 'title', valueString: 'first' }] } })
    state = applyMessage(state, { dataModelUpdate: { surfaceId: 'two', contents: [{ key: 'title', valueString: 'second' }] } })
    state = applyMessage(state, { deleteSurface: { surfaceId: 'one' } })
    expect(state.one).toBeUndefined()
    expect(boundValue({ path: '/title' }, state.two.data)).toBe('second')
  })
})

describe('currículos de cualquier tema en el portal', () => {
  const content = {
    id: 'sql-basico', topic: 'SQL básico', language: 'es', version: 'sql-1', levels: ['inicial', 'avanzado'],
    nodes: [
      { id: 'tablas', title: 'Tablas', level: 'inicial', prerequisites: [], objective: 'Explicar una tabla.', evidence: 'Describe una tabla.', tags: [], sources: [] },
      { id: 'select', title: 'SELECT', level: 'avanzado', prerequisites: ['tablas'], objective: 'Escribir SELECT.', evidence: 'Consulta una tabla.', tags: [], sources: [] },
    ],
    questionBank: [
      { id: 'q1', nodeId: 'tablas', prompt: '¿Qué guarda una fila?', options: ['Un registro', 'Un índice', 'Una vista'], correct: 0 },
      { id: 'q2', nodeId: 'select', prompt: '¿Qué elige columnas?', options: ['WHERE', 'SELECT', 'ORDER'], correct: 1 },
    ],
    sources: {},
  }

  test('un generado no se ofrece al alumno hasta que un docente lo aprueba; luego diagnóstico, ruta y dominio', async () => {
    const { saveGeneratedCurriculum } = await import('./curriculum-store')
    const admin = await institution(), teacherCookie = await teacher(admin), learner = await student(teacherCookie)
    const { docId } = await saveGeneratedCurriculum(db, content)

    expect((await (await request('/curricula', 'GET', undefined, learner)).json()).curricula).toEqual([])
    expect((await request('/curricula/sql-basico/diagnostic', 'GET', undefined, learner)).status).toBe(409)
    expect((await request(`/curricula/${encodeURIComponent(docId)}/approve`, 'POST', undefined, learner)).status).toBe(403)

    const approved = await request(`/curricula/${encodeURIComponent(docId)}/approve`, 'POST', undefined, teacherCookie)
    expect(approved.status).toBe(200)
    expect((await approved.json()).curriculum.status).toBe('reviewed')

    const questions = await (await request('/curricula/sql-basico/diagnostic', 'GET', undefined, learner)).json()
    expect(questions.questions).toHaveLength(2)
    expect(questions.questions[0].correct).toBeUndefined()

    const answers = { answers: [{ questionId: 'q1', option: 0 }, { questionId: 'q2', option: 0 }] }
    const route = (await (await request('/curricula/sql-basico/diagnostic', 'POST', answers, learner)).json()).route
    expect(route).toMatchObject({ curriculumId: 'sql-basico', diagnosticCompleted: true, accredits: true })

    const actor = (await portal.accounts.byUsername('alumna.uno'))!
    const review = await request(`/students/${actor.id}/curricula/sql-basico/reviews`, 'POST', { nodeId: 'tablas', evidence: 'Explicó con sus palabras qué es una tabla y puso un ejemplo.' }, teacherCookie)
    expect(review.status).toBe(200)
    expect((await review.json()).route.nodes.find((n: { id: string }) => n.id === 'tablas').status).toBe('mastered')
    // ¿Superó el nivel? Con un solo nodo dominado de dos y sin oráculo, la evidencia decide.
    const level = await (await request('/curricula/sql-basico/level', 'GET', undefined, learner)).json()
    expect(level.level).toMatchObject({ curriculumId: 'sql-basico', level: 'avanzado', decision: 'hold', kevReady: null })
    // El docente ve las solicitudes de revisión de nivel de sus alumnos.
    expect((await (await request('/curricula/level-reviews', 'GET', undefined, teacherCookie)).json()).reviews).toEqual([])
    // El diagnóstico del currículo de IA no se ve afectado.
    expect((await (await request('/route', 'GET', undefined, learner)).json()).route.diagnosticCompleted).toBe(false)
  })
})

describe('registro autónomo de adultos y recuperación de contraseña', () => {
  const adult = (extra: Record<string, unknown> = {}) => ({ username: 'ana.adulta', name: 'Ana Adulta', password, age: 30, ...extra })
  const enable = async (admin: string) => {
    await db.collection('providers').put('ollama', { name: 'Ollama', base_url: 'http://127.0.0.1:11434' })
    const response = await request('/settings', 'PUT', { ...DEFAULT_SETTINGS, allowSelfRegistration: true }, admin)
    expect(response.status).toBe(200)
  }

  test('está cerrado por defecto y antes de configurar la institución', async () => {
    expect((await request('/register', 'POST', adult())).status).toBe(409)
    await institution()
    expect((await request('/register', 'POST', adult())).status).toBe(409)
  })

  test('adulto se registra, entra, no tiene docente y no puede repetir usuario; menores y datos inválidos se rechazan', async () => {
    const admin = await institution()
    await enable(admin)
    expect((await request('/register', 'POST', adult({ age: 17 }))).status).toBe(422)
    expect((await request('/register', 'POST', adult({ password: 'corta' }))).status).toBe(422)
    expect((await request('/register', 'POST', { ...adult(), role: 'admin' })).status).toBe(422)

    const created = await request('/register', 'POST', adult())
    expect(created.status).toBe(201)
    const body = await created.json()
    expect(body.recoveryCode.length).toBeGreaterThan(20)
    expect(body.account).toMatchObject({ role: 'student', selfRegistered: true, age: 30 })
    expect(body.account.passwordHash).toBeUndefined()
    expect((await request('/register', 'POST', adult())).status).toBe(409)

    const cookie = await login('ana.adulta', 'student')
    const me = await (await request('/me', 'GET', undefined, cookie)).json()
    expect(me.account.teacherId).toBeUndefined()
    // Un adulto no puede usar rutas de docente.
    expect((await request('/teachers', 'POST', { username: 'x.y.z', name: 'Nadie' }, cookie)).status).toBe(403)
  })

  test('recuperación: código de un solo uso, cierra sesiones y entrega uno nuevo', async () => {
    const admin = await institution()
    await enable(admin)
    const { recoveryCode } = await (await request('/register', 'POST', adult())).json()
    const oldSession = await login('ana.adulta', 'student')
    const newPassword = 'Otra contraseña segura 2026!'

    expect((await request('/recover', 'POST', { username: 'ana.adulta', code: 'codigo-incorrecto-123', password: newPassword })).status).toBe(400)
    const recovered = await request('/recover', 'POST', { username: 'ana.adulta', code: recoveryCode, password: newPassword })
    expect(recovered.status).toBe(200)
    const next = (await recovered.json()).recoveryCode
    expect(next).not.toBe(recoveryCode)

    // El código usado ya no sirve y la sesión anterior quedó revocada.
    expect((await request('/recover', 'POST', { username: 'ana.adulta', code: recoveryCode, password: newPassword })).status).toBe(400)
    expect((await request('/me', 'GET', undefined, oldSession)).status).toBe(401)
    expect((await request('/login', 'POST', { username: 'ana.adulta', password, role: 'student' })).status).toBe(401)
    expect((await request('/login', 'POST', { username: 'ana.adulta', password: newPassword, role: 'student' })).status).toBe(200)
    // El código de otra cuenta no sirve para esta.
    expect((await request('/recover', 'POST', { username: 'alumna.uno', code: next, password: newPassword })).status).toBe(400)
  })

  test('restablecimiento por el docente: solo de sus alumnos, código de un solo uso', async () => {
    const admin = await institution(), teacherCookie = await teacher(admin), learner = await student(teacherCookie)
    const actor = (await portal.accounts.byUsername('alumna.uno'))!
    const otherTeacher = await teacher(admin, 'maestro.dos')

    expect((await request(`/accounts/${actor.id}/password-reset`, 'POST', undefined, otherTeacher)).status).toBe(404)
    expect((await request(`/accounts/${actor.id}/password-reset`, 'POST', undefined, learner)).status).toBe(403)
    const issued = await request(`/accounts/${actor.id}/password-reset`, 'POST', undefined, teacherCookie)
    expect(issued.status).toBe(201)
    const { resetCode } = await issued.json()

    // Un código de restablecimiento no activa cuentas, y activa y restablece son rutas distintas.
    expect((await request('/activate', 'POST', { code: resetCode, password: 'Nueva contraseña segura 1!' })).status).toBeGreaterThanOrEqual(400)
    const done = await request('/reset', 'POST', { code: resetCode, password: 'Nueva contraseña segura 1!' })
    expect(done.status).toBe(200)
    expect((await request('/me', 'GET', undefined, learner)).status).toBe(401)
    expect((await request('/reset', 'POST', { code: resetCode, password: 'Nueva contraseña segura 2!' })).status).toBe(400)
    expect((await request('/login', 'POST', { username: 'alumna.uno', password: 'Nueva contraseña segura 1!', role: 'student' })).status).toBe(200)
  })

  test('cola de revisión docente: aparece, el docente acepta con evidencia o rechaza, y desaparece', async () => {
    const { saveGeneratedCurriculum, approveCurriculum } = await import('./curriculum-store')
    const { recordEvidence } = await import('../grading/evidence')
    const admin = await institution(), teacherCookie = await teacher(admin), learner = await student(teacherCookie)
    const otherTeacher = await teacher(admin, 'maestro.dos')
    const actor = (await portal.accounts.byUsername('alumna.uno'))!
    const saved = await saveGeneratedCurriculum(db, {
      id: 'sql-basico', topic: 'SQL básico', language: 'es', version: 'sql-1', levels: ['inicial', 'avanzado'],
      nodes: [
        { id: 'tablas', title: 'Tablas', level: 'inicial', prerequisites: [], objective: 'Explicar una tabla.', evidence: 'Describe una tabla.', tags: [], sources: [] },
        { id: 'select', title: 'SELECT', level: 'avanzado', prerequisites: ['tablas'], objective: 'Escribir SELECT.', evidence: 'Consulta una tabla.', tags: [], sources: [] },
      ],
      questionBank: [
        { id: 'q1', nodeId: 'tablas', prompt: '¿Qué guarda una fila?', options: ['Un registro', 'Un índice', 'Una vista'], correct: 0 },
        { id: 'q2', nodeId: 'select', prompt: '¿Qué elige columnas?', options: ['WHERE', 'SELECT', 'ORDER'], correct: 1 },
      ],
      sources: {},
    })
    await approveCurriculum(db, saved.docId, { id: 'x', role: 'teacher' })
    await request('/curricula/sql-basico/diagnostic', 'POST', { answers: [{ questionId: 'q1', option: 0 }, { questionId: 'q2', option: 1 }] }, learner)

    // Evidencia de confianza media (p. ej. un juicio del oráculo a 0,74): va a revisión.
    const grade = { correct: true, score: 0.74, confidence: 0.74, method: 'oracle' as const, detail: '' }
    await recordEvidence(db, { studentId: actor.id, curriculumId: 'sql-basico', nodeId: 'tablas', sessionId: 's1', grade, context: { curriculumStatus: 'reviewed', hasTeacher: true } })

    const queue = (await (await request('/review-queue', 'GET', undefined, teacherCookie)).json()).queue
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ curriculumId: 'sql-basico', nodeId: 'tablas', student: 'Alumna Ejemplo', method: 'oracle' })
    // Otro docente no ve alumnos ajenos; un alumno no accede.
    expect((await (await request('/review-queue', 'GET', undefined, otherTeacher)).json()).queue).toEqual([])
    expect((await request('/review-queue', 'GET', undefined, learner)).status).toBe(403)

    const resolve = (body: object, cookie = teacherCookie) => request('/review-queue/resolve', 'POST', { studentId: actor.id, curriculumId: 'sql-basico', nodeId: 'tablas', ...body }, cookie)
    expect((await resolve({ decision: 'accept' })).status).toBe(422) // aceptar exige evidencia
    expect((await resolve({ decision: 'accept', evidence: 'Explicó una tabla con un ejemplo propio.' }, otherTeacher)).status).toBeGreaterThanOrEqual(400)
    const ok = await resolve({ decision: 'accept', evidence: 'Explicó con sus palabras qué es una tabla y dio un ejemplo propio.' })
    expect(ok.status).toBe(200)
    expect((await (await request('/review-queue', 'GET', undefined, teacherCookie)).json()).queue).toEqual([])
    const route = (await (await request('/curricula/sql-basico/route', 'GET', undefined, learner)).json()).route
    expect(route.nodes.find((n: { id: string }) => n.id === 'tablas').status).toBe('mastered')
  })
})

