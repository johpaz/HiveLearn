import type { HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'
import { Accounts, digest, publicAccount, roles, usernameSchema, passwordSchema, type Account } from './accounts'
import { Learning, QUESTION_BANK } from './learning'
import { curriculumRoute } from './curriculum'
import { learningSurface } from './a2ui'
import { GuidedJourney } from './journey'
import { journeySurface } from './journey-a2ui'
import { parseStudents, studentTemplate, XLSX_MIME } from './spreadsheet'
import { saveSettings, setCredential, settingsView } from './settings'
import { Supplements, runSupplementWorker, type SupplementExecutor } from './supplements'
import { normalizeLogo } from './branding'
import { logger } from '../utils/logger'

export class HttpError extends Error { constructor(readonly status: number, message: string) { super(message) } }
const cookieName = 'hivelearn_session'
const log = logger.child('institutional-portal')
export function sessionCookie(req: Request) { return req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '' }
function cookie(req: Request, value: string, age = 28800) { return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}` }
export function checkOrigin(req: Request) {
  const origin = req.headers.get('origin')
  const allowed = [new URL(req.url).origin, ...(process.env.HIVELEARN_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)]
  if (origin && !allowed.includes(origin) || req.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Origen no autorizado')
}
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } })
async function body(req: Request) {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Se requiere JSON')
  if (Number(req.headers.get('content-length')) > 65536) throw new HttpError(413, 'Solicitud demasiado grande')
  const text = await req.text()
  if (text.length > 65536) throw new HttpError(413, 'Solicitud demasiado grande')
  try { return JSON.parse(text) } catch { throw new HttpError(400, 'JSON inválido') }
}
export const actionSchema = z.object({ userAction: z.object({ name: z.literal('submit_evidence'), surfaceId: z.string(), sourceComponentId: z.literal('submit'), timestamp: z.string().datetime(), context: z.object({ nodeId: z.string(), response: z.string().trim().min(20).max(2000) }).strict() }).strict() }).strict()
export class Portal {
  readonly accounts: Accounts
  readonly learning: Learning
  readonly supplements: Supplements
  readonly journey: GuidedJourney
  private attempts = new Map<string, { count: number; until: number }>()
  constructor(readonly db: HiveDB, supplementExecutor: SupplementExecutor = runSupplementWorker) {
    this.accounts = new Accounts(db)
    this.learning = new Learning(db)
    this.supplements = new Supplements(db, supplementExecutor)
    this.journey = new GuidedJourney(db, this.learning)
  }
  async actor(req: Request) {
    const actor = await this.accounts.session(sessionCookie(req))
    if (!actor) throw new HttpError(401, 'Inicia sesión para continuar')
    return actor
  }
  private allow(actor: Account, allowed: string[]) { if (!allowed.includes(actor.role)) throw new HttpError(403, 'No tienes permiso para esta operación') }
  private throttle(key: string) {
    const now = Date.now()
    if (this.attempts.size > 1000) for (const [id, item] of this.attempts) if (item.until <= now) this.attempts.delete(id)
    if (this.attempts.size > 5000) throw new HttpError(429, 'Demasiados intentos. Intenta más tarde')
    const attempt = this.attempts.get(key)
    if (!attempt || attempt.until <= now) this.attempts.set(key, { count: 1, until: now + 60_000 })
    else if (++attempt.count > 15) throw new HttpError(429, 'Demasiados intentos. Espera un minuto')
  }
  async accessibleStudent(actor: Account, id: string) {
    const student = await this.accounts.get(id)
    if (!student || student.role !== 'student' || student.institutionId !== actor.institutionId || !(actor.role === 'admin' || actor.id === student.id || actor.role === 'teacher' && student.teacherId === actor.id)) throw new HttpError(404, 'Alumno no encontrado')
    return student
  }
  async surface(actor: Account, nodeId: string) {
    this.allow(actor, ['student'])
    const route = await this.learning.route(actor)
    if (!route.diagnosticCompleted) throw new HttpError(409, 'Completa primero el diagnóstico')
    const node = route.nodes.find(n => n.id === nodeId)
    if (!node) throw new HttpError(404, 'Competencia fuera de la ruta')
    return learningSurface(node, `${route.guidance.context} ${route.guidance.supervision}`, '', actor.age)
  }
  async action(actor: Account, input: unknown) {
    this.allow(actor, ['student'])
    const { userAction: action } = actionSchema.parse(input)
    if (action.surfaceId !== `competency:${action.context.nodeId}`) throw new HttpError(400, 'La acción no pertenece a la superficie')
    const route = await this.learning.route(actor)
    if (!route.diagnosticCompleted) throw new HttpError(409, 'Completa primero el diagnóstico')
    const node = route.nodes.find(n => n.id === action.context.nodeId)
    if (!node || node.status === 'pending') throw new HttpError(409, 'Primero completa los prerrequisitos')
    const id = digest(`${actor.id}:${action.timestamp}:${node.id}:${action.context.response}`)
    const col = this.db.collection('hl_student_evidence')
    if (!(await col.get(id))) {
      try { await col.put(id, { studentId: actor.id, institutionId: actor.institutionId, nodeId: node.id, text: action.context.response, version: route.version, createdAt: new Date().toISOString() }, { expectedVersion: 0 }) }
      catch (error) { if (!(await col.get(id))) throw error }
    }
    return learningSurface(node, route.guidance.context, 'Evidencia recibida. Tu docente la revisará; enviarla no acredita dominio automáticamente.', actor.age)
  }
  async guidedSurface(actor: Account) {
    this.allow(actor, ['student'])
    return journeySurface(actor, (await this.journey.current(actor)).doc)
  }
  async guidedAction(actor: Account, input: unknown) {
    this.allow(actor, ['student'])
    const envelope = z.object({ userAction: z.object({
      name: z.string().max(80), surfaceId: z.string().max(160), sourceComponentId: z.string().max(120),
      timestamp: z.string().datetime(), context: z.record(z.string(), z.string()).default({}),
    }).strict() }).strict().parse(input)
    if (envelope.userAction.surfaceId !== `journey:${actor.id}`) throw new HttpError(400, 'La acción no pertenece a este recorrido')
    const next = await this.journey.transition(actor, { name: envelope.userAction.name, context: envelope.userAction.context }, async (nodeId, response, state) =>
      this.supplements.formativeFeedback(actor, nodeId, response, { interest: state.interest, learningMode: state.learningMode }))
    return journeySurface(actor, next)
  }
  async handle(req: Request, peer = 'local'): Promise<Response> {
    try {
      const url = new URL(req.url), path = url.pathname.replace(/^\/api\/portal/, ''), method = req.method
      if (!['GET', 'HEAD'].includes(method)) checkOrigin(req)
      if (path === '/status' && method === 'GET') {
        const entry = await this.db.collection<{ institutionId: string; name: string }>('hl_installation').get('main')
        return json({ configured: !!entry, institution: entry?.doc.name ?? 'HiveLearn', hasLogo: !!(await this.db.collection('hl_branding').get('main')) })
      }
      if (path === '/logo' && method === 'GET') {
        const logo = await this.db.collection<{ png: string }>('hl_branding').get('main')
        return logo ? new Response(Buffer.from(logo.doc.png, 'base64'), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }) : new Response(null, { status: 404 })
      }
      if (['/setup', '/login', '/activate'].includes(path) && method === 'POST') this.throttle(`${peer}:auth`)
      if (path === '/setup' && method === 'POST') {
        if (await this.accounts.initialized()) throw new HttpError(409, 'La institución ya está configurada')
        const data = z.object({ name: z.string(), institution: z.string(), username: usernameSchema, password: passwordSchema }).strict().parse(await body(req))
        return json({ account: await this.accounts.setup({ name: data.name!, institution: data.institution!, username: data.username!, password: data.password! }) }, 201)
      }
      if (path === '/login' && method === 'POST') {
        const data = z.object({ username: usernameSchema, password: z.string().max(128), role: z.enum(roles) }).strict().parse(await body(req))
        let result
        try { result = await this.accounts.login(data.username, data.password, data.role) }
        catch {
          log.warn('Inicio de sesión rechazado', { peer, role: data.role })
          throw new HttpError(401, 'Usuario, contraseña o rol incorrectos')
        }
        log.info('Inicio de sesión exitoso', { peer, role: data.role })
        return json({ account: result.account }, 200, { 'Set-Cookie': cookie(req, result.token) })
      }
      if (path === '/activate' && method === 'POST') {
        const data = z.object({ code: z.string().min(10).max(100), password: passwordSchema }).strict().parse(await body(req))
        return json(await this.accounts.activate(data.code, data.password))
      }
      if (path === '/logout' && method === 'POST') { await this.accounts.logout(sessionCookie(req)); return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, '', 0) }) }
      const actor = await this.actor(req)
      if (path === '/me' && method === 'GET') return json({ account: publicAccount(actor) })
      if (path === '/profile' && method === 'PATCH') {
        const data = z.object({ name: z.string().trim().min(2).max(120) }).strict().parse(await body(req))
        const col = this.db.collection<Account>('hl_accounts'), old = await col.get(actor.id)
        await col.put(actor.id, { ...old!.doc, name: data.name }, { expectedVersion: old!.version })
        return json({ account: publicAccount({ ...actor, name: data.name }) })
      }
      if (path === '/dashboard' && method === 'GET') {
        const accounts = await this.accounts.list(actor)
        const students = accounts.filter(a => a.role === 'student')
        const progress = await Promise.all(students.map(async student => ({ studentId: student.id, diagnostic: !!(await this.learning.record(student.id)) })))
        return json({ account: publicAccount(actor), accounts, stats: { students: students.length, teachers: accounts.filter(a => a.role === 'teacher').length, diagnosed: progress.filter(p => p.diagnostic).length }, progress })
      }
      if (path === '/settings') {
        this.allow(actor, ['admin'])
        if (method === 'GET') return json(await settingsView(this.db, actor.institutionId))
        if (method === 'PUT') return json({ settings: await saveSettings(this.db, actor.institutionId, await body(req)) })
      }
      if (path === '/branding' && method === 'PUT') {
        this.allow(actor, ['admin'])
        if (Number(req.headers.get('content-length')) > 1.1 * 1024 * 1024) throw new HttpError(413, 'Logo demasiado grande')
        const form = await req.formData(), name = z.string().trim().min(2).max(120).parse(form.get('name')), logo = form.get('logo')
        const installation = await this.db.collection<{ institutionId: string; name: string }>('hl_installation').get('main')
        const png = logo instanceof File && logo.size ? Buffer.from(await normalizeLogo(new Uint8Array(await logo.arrayBuffer()))).toString('base64') : null
        await this.db.batch([
          { op: 'put', collection: 'hl_installation', id: 'main', doc: { ...installation!.doc, name }, expectedVersion: installation!.version },
          ...(png ? [{ op: 'put' as const, collection: 'hl_branding', id: 'main', doc: { institutionId: actor.institutionId, png } }] : []),
        ])
        return json({ ok: true })
      }
      const credential = path.match(/^\/providers\/([^/]+)\/credential$/)
      if (credential && method === 'PUT') { this.allow(actor, ['admin']); return json(await setCredential(this.db, actor.institutionId, credential[1], await body(req))) }
      const invitation = path.match(/^\/accounts\/([^/]+)\/invitation$/)
      if (invitation && method === 'POST') { this.allow(actor, ['admin', 'teacher']); return json(await this.accounts.reissue(actor, invitation[1]), 201) }
      if (path === '/teachers' && method === 'POST') {
        this.allow(actor, ['admin'])
        const data = z.object({ username: usernameSchema, name: z.string() }).strict().parse(await body(req))
        return json(await this.accounts.createTeacher(actor, { username: data.username!, name: data.name! }), 201)
      }
      if (path === '/students' && method === 'POST') {
        this.allow(actor, ['admin', 'teacher'])
        const data = z.object({ rows: z.array(z.unknown()).min(1).max(200), authorized: z.literal(true) }).strict().parse(await body(req))
        return json({ invitations: await this.accounts.createStudents(actor, data.rows) }, 201)
      }
      if (path === '/students/template' && method === 'GET') {
        this.allow(actor, ['admin', 'teacher'])
        return new Response(new Uint8Array(studentTemplate()), { headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': 'attachment; filename="hivelearn-alumnos.xlsx"', 'Cache-Control': 'no-store' } })
      }
      if (['/students/import/preview', '/students/import'].includes(path) && method === 'POST') {
        this.allow(actor, ['admin', 'teacher'])
        if (Number(req.headers.get('content-length')) > 2.1 * 1024 * 1024) throw new HttpError(413, 'Máximo 2 MB')
        const form = await req.formData(), file = form.get('file')
        if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') || file.size > 2 * 1024 * 1024) throw new HttpError(400, 'Selecciona un archivo .xlsx de hasta 2 MB')
        const rows = parseStudents(new Uint8Array(await file.arrayBuffer()))
        if (path.endsWith('/preview')) {
          const preview = await this.accounts.validateStudents(actor, rows)
          return json({ rows: preview.rows.map(({ documento: _, ...row }) => row), errors: preview.errors })
        }
        if (form.get('authorized') !== 'true') throw new HttpError(400, 'Confirma la autorización institucional de los datos')
        return json({ invitations: await this.accounts.createStudents(actor, rows) }, 201)
      }
      if (path === '/diagnostic' && method === 'GET') { this.allow(actor, ['student']); return json({ questions: QUESTION_BANK.map(({ correct: _, ...question }) => question) }) }
      if (path === '/diagnostic' && method === 'POST') { this.allow(actor, ['student']); return json({ route: await this.learning.diagnostic(actor, await body(req)) }) }
      if (path === '/route' && method === 'GET') { this.allow(actor, ['student']); return json({ route: await this.learning.route(actor) }) }
      if (path === '/journey' && method === 'GET') return json({ messages: await this.guidedSurface(actor) })
      if (path === '/journey/actions' && method === 'POST') return json({ messages: await this.guidedAction(actor, await body(req)) })
      if (path === '/supplements') {
        this.allow(actor, ['student'])
        if (method === 'GET') { await this.supplements.resume(); return json({ jobs: await this.supplements.list(actor, url.searchParams.get('nodeId') ?? '') }) }
        if (method === 'POST') { const data = z.object({ nodeId: z.string().max(80) }).strict().parse(await body(req)); return json({ job: await this.supplements.request(actor, data.nodeId!) }, 202) }
      }
      if (path === '/curriculum' && method === 'GET') {
        this.allow(actor, ['teacher', 'admin'])
        const query = z.object({ age: z.coerce.number().int().min(8).max(120), level: z.enum(['fundamentos', 'usuario_responsable', 'aplicador', 'constructor', 'creador_avanzado']) }).parse({ age: url.searchParams.get('age') ?? 18, level: url.searchParams.get('level') ?? 'fundamentos' })
        return json({ route: curriculumRoute(query.age, query.level) })
      }
      const studentPath = path.match(/^\/students\/([^/]+)\/(route|reviews|evidence)$/)
      if (studentPath) {
        const student = await this.accessibleStudent(actor, studentPath[1])
        if (studentPath[2] === 'route' && method === 'GET') return json({ student: publicAccount(student), route: await this.learning.route(student) })
        if (studentPath[2] === 'evidence' && method === 'GET') return json({ evidence: (await this.db.collection<Record<string, unknown>>('hl_student_evidence').scan()).filter(e => e.doc.studentId === student.id).map(e => ({ id: e.id, ...e.doc })) })
        if (studentPath[2] === 'reviews' && method === 'POST') { this.allow(actor, ['teacher', 'admin']); return json({ route: await this.learning.review(actor, student, await body(req)) }) }
      }
      if (path === '/a2ui' && method === 'GET') return new Response((await this.surface(actor, url.searchParams.get('nodeId') ?? '')).map(m => JSON.stringify(m)).join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
      if (path === '/a2ui/actions' && method === 'POST') return json({ messages: await this.action(actor, await body(req)) })
      throw new HttpError(404, 'Ruta no encontrada')
    } catch (error) { return this.error(error) }
  }
  error(error: unknown) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    if (error instanceof z.ZodError) return json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }, 422)
    // Do not leak native DB paths, payloads or hashes from persistence failures.
    if (error instanceof Error && /conflict|version|already exists/i.test(error.message)) return json({ error: 'El registro cambió o ya existe. Actualiza y vuelve a intentar.' }, 409)
    return json({ error: error instanceof Error && !/hivedb|redb|panic|IO error/i.test(error.message) ? error.message : 'No se pudo completar la operación' }, 400)
  }
}
