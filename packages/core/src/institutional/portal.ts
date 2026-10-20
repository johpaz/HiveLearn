import { CurriculumJourney } from './curriculum-journey'
import { curriculumJourneySurface, curriculumSurfaceId } from './curriculum-journey-a2ui'
import { cachedExplanation, nodeMaterial, saveExplanation } from './curriculum-material'
import { CurriculumProgressStore, LEVEL_REVIEWS_COLLECTION, type LevelReviewRequest } from './curriculum-progress'
import { kevForRun } from '../agent/kev/client'
import { listPendingReviews, resolveReview } from '../grading/evidence'
import { ageBandFor } from './age'
import { approveCurriculum, findCurriculum, CURRICULA_COLLECTION } from './curriculum-store'
import { canAccredit, type CurriculumDef } from './curriculum-def'
import type { HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'
import { Accounts, digest, publicAccount, roles, usernameSchema, passwordSchema, type Account } from './accounts'
import { Learning, QUESTION_BANK } from './learning'
import { curriculumRoute } from './curriculum'
import { learningSurface } from './a2ui'
import { GuidedJourney } from './journey'
import { journeySurface } from './journey-a2ui'
import { parseStudents, studentTemplate, XLSX_MIME } from './spreadsheet'
import { readSettings, saveSettings, setCredential, settingsView } from './settings'
import { Supplements, runSupplementWorker, type SupplementExecutor } from './supplements'
import { applyAgentModels } from './agents-config'
import { eraseAccount, ErasureError } from './erasure'
import { ProgramEngine, ProgramRuleError, type EngineDeps } from './program/engine'
import { ProgramActiveError, ProgramNotFoundError } from './program/program-store'
import { ProgramReviews, ReviewError } from './program/review'
import { studentProgram, teacherProgram } from './program/views'
import { CurriculumJobs, runCurriculumGeneration, type CurriculumGenerator } from './curriculum-jobs'
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
  readonly curriculumJobs: CurriculumJobs
  readonly programs: ProgramEngine
  readonly programReviews: ProgramReviews
  readonly journey: GuidedJourney
  readonly progress: CurriculumProgressStore
  readonly curriculumJourney: CurriculumJourney
  private attempts = new Map<string, { count: number; until: number }>()
  constructor(readonly db: HiveDB, supplementExecutor: SupplementExecutor = runSupplementWorker, curriculumGenerator: CurriculumGenerator = runCurriculumGeneration, programDeps?: Partial<EngineDeps>) {
    this.accounts = new Accounts(db)
    this.learning = new Learning(db)
    this.supplements = new Supplements(db, supplementExecutor)
    this.curriculumJobs = new CurriculumJobs(db, curriculumGenerator)
    this.programs = new ProgramEngine(db, {
      // Los agentes se cargan al primer uso: un portal sin programas no importa el motor de agentes.
      planner: programDeps?.planner ?? (async input => (await import('../agent/program-architect')).generateProgramPlan(input)),
      adapter: programDeps?.adapter ?? (async input => (await import('../agent/program-architect')).proposeAdaptation(input)),
      kev: programDeps?.kev ?? (async ctx => (await import('../agent/kev/client')).kevForRun(ctx)),
      guide: programDeps?.guide,
    })
    this.programReviews = new ProgramReviews(db, this.programs.store, this.programs.audit, id => this.accounts.get(id))
    this.journey = new GuidedJourney(db, this.learning)
    this.progress = new CurriculumProgressStore(db)
    this.curriculumJourney = new CurriculumJourney(db)
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
  /** Pantalla actual del recorrido de un currículo (cualquier tema). */
  async curriculumJourneySurface(actor: Account, def: CurriculumDef) {
    this.allow(actor, ['student'])
    const state = (await this.curriculumJourney.current(actor, def)).doc
    const material = state.focusNodeId && ['concept', 'practice'].includes(state.stage)
      ? await nodeMaterial(this.db, def, state.focusNodeId, ageBandFor(actor.age)) : null
    return curriculumJourneySurface(actor, def, state, material)
  }

  async curriculumJourneyAction(actor: Account, def: CurriculumDef, input: unknown) {
    this.allow(actor, ['student'])
    const envelope = z.object({ userAction: z.object({
      name: z.string().max(80), surfaceId: z.string().max(200), sourceComponentId: z.string().max(120),
      timestamp: z.string().datetime(), context: z.record(z.string(), z.string()).default({}),
    }).strict() }).strict().parse(input)
    if (envelope.userAction.surfaceId !== curriculumSurfaceId(actor, def)) throw new HttpError(400, 'La acción no pertenece a este recorrido')

    const band = ageBandFor(actor.age)
    const runContext = { studentId: actor.id, institutionId: actor.institutionId, ageBand: band }
    const brief = (nodeId: string) => {
      const n = def.nodes.find(x => x.id === nodeId)!
      return { title: n.title, objective: n.objective, evidence: n.evidence }
    }
    // Una sola consulta al oráculo por práctica: el feedback y la evidencia comparten el veredicto.
    let judged: Awaited<ReturnType<typeof import('../agent/kev/judge').judgeAnswer>> | null = null
    await this.curriculumJourney.transition(actor, def, { name: envelope.userAction.name, context: envelope.userAction.context }, {
      prepareMaterial: async nodeId => {
        if (await cachedExplanation(this.db, def, nodeId, band)) return
        const { generateNodeExplanation } = await import('../agent/curriculum-tutor')
        const text = await generateNodeExplanation({ topic: def.topic, node: brief(nodeId), runContext })
        if (text) await saveExplanation(this.db, def, nodeId, band, text)
      },
      feedback: async ({ nodeId, response, state }) => {
        const { tutorFeedback } = await import('../agent/curriculum-tutor')
        const kev = await kevForRun(runContext)
        const node = brief(nodeId)
        const [fb, verdict] = await Promise.all([
          tutorFeedback({ topic: def.topic, node, response, interest: state.interest, learningMode: state.learningMode, runContext }),
          kev ? import('../agent/kev/judge').then(m => m.judgeAnswer(kev, { objective: `${node.title}: ${node.objective}`, prompt: node.evidence, answer: response })).catch(() => null) : Promise.resolve(null),
        ])
        judged = verdict
        return { text: fb.hint ? `${fb.text}\n\nPista: ${fb.hint}` : fb.text, verdict: verdict?.verdict }
      },
      assess: async ({ nodeId, response, sessionId }) => {
        let verdict = judged
        if (!verdict) {
          const kev = await kevForRun(runContext)
          if (!kev) return
          const { judgeAnswer } = await import('../agent/kev/judge')
          const node = brief(nodeId)
          verdict = await judgeAnswer(kev, { objective: `${node.title}: ${node.objective}`, prompt: node.evidence, answer: response })
        }
        if (!verdict) return
        const { recordAssessment } = await import('../grading/assessment')
        await recordAssessment(this.db, { alumnoId: actor.id, curriculumId: def.id, nodeId, sessionId, grade: verdict.grade })
      },
    })
    return this.curriculumJourneySurface(actor, def)
  }

  async handle(req: Request, peer = 'local'): Promise<Response> {
    try {
      const url = new URL(req.url), path = url.pathname.replace(/^\/api\/portal/, ''), method = req.method
      if (!['GET', 'HEAD'].includes(method)) checkOrigin(req)
      if (path === '/status' && method === 'GET') {
        const entry = await this.db.collection<{ institutionId: string; name: string }>('hl_installation').get('main')
        const selfRegistration = entry ? !!(await readSettings(this.db, entry.doc.institutionId)).allowSelfRegistration : false
        return json({ configured: await this.accounts.initialized(), institution: entry?.doc.name ?? 'HiveLearn', hasLogo: !!(await this.db.collection('hl_branding').get('main')), selfRegistration, engine: (await import('../agent/sdk/bootstrap')).getAgentEngine() })
      }
      if (path === '/logo' && method === 'GET') {
        const logo = await this.db.collection<{ png: string }>('hl_branding').get('main')
        return logo ? new Response(Buffer.from(logo.doc.png, 'base64'), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }) : new Response(null, { status: 404 })
      }
      if (['/setup', '/login', '/activate', '/register', '/recover', '/reset'].includes(path) && method === 'POST') this.throttle(`${peer}:auth`)
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
      if (path === '/register' && method === 'POST') {
        const data = z.object({ username: usernameSchema, name: z.string(), password: passwordSchema, age: z.number() }).strict().parse(await body(req))
        try { return json(await this.accounts.register({ username: data.username!, name: data.name!, password: data.password!, age: data.age! }), 201) }
        catch (error) {
          if (error instanceof z.ZodError) throw error
          throw new HttpError(409, (error as Error).message)
        }
      }
      if (path === '/recover' && method === 'POST') {
        const data = z.object({ username: usernameSchema, code: z.string().min(10).max(100), password: passwordSchema }).strict().parse(await body(req))
        try { return json(await this.accounts.recover(data.username!, data.code!, data.password!)) }
        catch (error) {
          if (error instanceof z.ZodError) throw error
          throw new HttpError(400, 'Datos de recuperación inválidos')
        }
      }
      if (path === '/reset' && method === 'POST') {
        const data = z.object({ code: z.string().min(10).max(100), password: passwordSchema }).strict().parse(await body(req))
        try { return json(await this.accounts.completePasswordReset(data.code!, data.password!)) }
        catch (error) {
          if (error instanceof z.ZodError) throw error
          throw new HttpError(400, (error as Error).message)
        }
      }
      if (path === '/logout' && method === 'POST') { await this.accounts.logout(sessionCookie(req)); return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, '', 0) }) }
      const actor = await this.actor(req)
      const resetPath = path.match(/^\/accounts\/([^/]+)\/password-reset$/)
      if (resetPath && method === 'POST') {
        this.allow(actor, ['teacher', 'admin'])
        try { return json(await this.accounts.issuePasswordReset(actor, resetPath[1]), 201) }
        catch (error) { throw new HttpError(404, (error as Error).message) }
      }
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
      // ── Programa formativo personal (sesión activa única, plan por niveles que los agentes adaptan) ──
      const programPath = path.match(/^\/programs\/([^/]+)(?:\/(answer|checkpoint|prepare|close|trace|review|plan|material\/([^/]+)))?$/)
      if (path === '/programs/active' && method === 'GET') {
        this.allow(actor, ['student'])
        const view = await this.programs.active(actor)
        return json({ program: view ? studentProgram(view) : null })
      }
      if (path === '/programs' && method === 'POST') {
        this.allow(actor, ['student'])
        this.throttle(`${peer}:program:${actor.id}`)
        try { return json({ program: studentProgram(await this.programs.open(actor, await body(req))) }, 201) }
        catch (error) {
          if (error instanceof ProgramActiveError) return json({ error: error.message, code: 'active_program_exists', programId: error.programId }, 409)
          throw error
        }
      }
      if (path === '/programs/analytics' && method === 'GET') {
        this.allow(actor, ['teacher', 'admin'])
        const { weakNodes } = await import('./program/projections')
        const mine = actor.role === 'admin' ? undefined : new Set((await this.accounts.list(actor)).filter(a => a.role === 'student').map(a => a.id))
        const topic = url.searchParams.get('topic') ?? undefined
        return json({ weakNodes: await weakNodes(this.db, actor.institutionId, { topic, accountIds: mine, limit: 10 }) })
      }
      if (path === '/programs/review-queue' && method === 'GET') {
        this.allow(actor, ['teacher', 'admin'])
        const queue = await this.programReviews.queue(actor)
        const names = new Map((await this.accounts.list(actor)).map(a => [a.id, a.name]))
        return json({ queue: queue.map(p => ({ id: p.id, student: names.get(p.accountId) ?? 'Alumno', topic: p.intent.topic, objective: p.objective, finalScore: p.finalScore ?? null, levels: p.levels.length, closedAt: p.closedAt ?? null })) })
      }
      if (programPath) {
        const [, programId, action, nodeId] = programPath
        try {
          if (!action && method === 'GET') {
            const program = await this.programs.store.get(programId)
            if (!program) throw new ProgramNotFoundError()
            if (program.accountId === actor.id) return json({ program: studentProgram(this.programs.view(program)) })
            this.allow(actor, ['teacher', 'admin'])
            await this.programReviews.history(actor, programId) // comprueba acceso
            return json({ program: teacherProgram(program), reviews: await this.programReviews.history(actor, programId) })
          }
          if (action?.startsWith('material') && method === 'GET') {
            this.allow(actor, ['student'])
            const program = await this.programs.store.get(programId)
            if (!program || program.accountId !== actor.id) throw new ProgramNotFoundError()
            const node = program.levels.flatMap(l => l.nodes).find(n => n.id === nodeId)
            if (!node) throw new HttpError(404, 'Nodo no encontrado')
            const band = ageBandFor(actor.age)
            const ref = { id: `program-${program.id}`, hash: node.id }
            let explanation = await cachedExplanation(this.db, ref, node.id, band)
            if (!explanation) {
              try {
                const { generateNodeExplanation } = await import('../agent/curriculum-tutor')
                explanation = await generateNodeExplanation({ topic: program.intent.topic, node: { title: node.title, objective: node.objective, evidence: node.evidence }, runContext: { studentId: actor.id, institutionId: actor.institutionId, ageBand: band } })
                if (explanation) await saveExplanation(this.db, ref, node.id, band, explanation)
              } catch { /* sin explicación del modelo: se usa la base */ }
            }
            return json({ material: { title: node.title, objective: node.objective, evidence: node.evidence, explanation: explanation ?? `${node.objective} Cuando lo logres podrás mostrarlo así: ${node.evidence}`, generated: !!explanation, question: { prompt: node.question.prompt, options: node.question.options } } })
          }
          if (action === 'answer' && method === 'POST') {
            this.allow(actor, ['student'])
            const data = z.object({ nodeId: z.string().max(48), choice: z.number().int().min(0).max(2), open: z.string().max(600).optional() }).strict().parse(await body(req))
            const result = await this.programs.answer(actor, programId, { nodeId: data.nodeId!, choice: data.choice!, open: data.open })
            return json({ correct: result.correct, mastered: result.mastered, hint: result.hint, program: studentProgram(result.view) })
          }
          if (action === 'checkpoint' && method === 'POST') {
            this.allow(actor, ['student'])
            this.throttle(`${peer}:checkpoint:${actor.id}`)
            const result = await this.programs.checkpoint(actor, programId)
            return json({ decision: result.decision, reason: result.reason, adapted: result.adapted, program: studentProgram(result) })
          }
          if (action === 'prepare' && method === 'POST') {
            this.allow(actor, ['student'])
            return json({ program: studentProgram(await this.programs.ensureLevelContent(actor, programId)) })
          }
          if (action === 'close' && method === 'POST') {
            this.allow(actor, ['student'])
            const closed = await this.programs.close(actor, programId)
            return json({ program: studentProgram(this.programs.view(closed)) })
          }
          if (action === 'trace' && method === 'GET') {
            const program = await this.programs.store.get(programId)
            if (!program) throw new ProgramNotFoundError()
            if (program.accountId !== actor.id) { this.allow(actor, ['teacher', 'admin']); await this.programReviews.history(actor, programId) }
            return json({ thread: await this.programs.audit.thread(programId, program.accountId) })
          }
          if (action === 'review' && method === 'POST') {
            this.allow(actor, ['teacher', 'admin'])
            return json({ program: teacherProgram(await this.programReviews.review(actor, programId, await body(req))) })
          }
          if (action === 'plan' && method === 'PUT') {
            this.allow(actor, ['teacher', 'admin'])
            const data = z.object({ ops: z.array(z.unknown()).min(1).max(20), reason: z.string().min(5).max(300) }).strict().parse(await body(req))
            const result = await this.programReviews.adjustPlan(actor, programId, data.ops!, data.reason!)
            return json({ applied: result.applied, rejected: result.rejected, program: teacherProgram(result.saved) })
          }
        } catch (error) {
          if (error instanceof ProgramNotFoundError) throw new HttpError(404, error.message)
          if (error instanceof ProgramRuleError) throw new HttpError(error.code === 'not_owner' ? 403 : 409, error.message)
          if (error instanceof ReviewError) throw new HttpError(error.code === 'forbidden' ? 403 : error.code === 'invalid' ? 422 : 409, error.message)
          throw error
        }
      }
      if (path === '/agents/models' && method === 'PUT') {
        this.allow(actor, ['admin'])
        try { return json(await applyAgentModels(this.db, await body(req))) }
        catch (error) {
          if (error instanceof z.ZodError) throw error
          throw new HttpError(422, error instanceof Error ? error.message : 'No se pudieron guardar los modelos')
        }
      }
      if (path === '/models/sync' && method === 'GET') {
        this.allow(actor, ['admin'])
        const { lastSyncReport, isSyncRunning } = await import('../models/sync')
        const { modelSyncHours } = await import('../models/scheduler')
        return json({ running: isSyncRunning(), everyHours: modelSyncHours(), report: await lastSyncReport(this.db) })
      }
      if (path === '/models/sync' && method === 'POST') {
        this.allow(actor, ['admin'])
        this.throttle(`${peer}:models-sync`)
        const data = z.object({ providerId: z.string().max(100).optional(), dryRun: z.boolean().optional() }).strict().parse(await body(req))
        const { syncModels } = await import('../models/sync')
        // Un proveedor: se espera el resultado. Todos: puede tardar minutos, corre aparte y se consulta con GET.
        if (data.providerId) return json({ running: false, report: await syncModels(this.db, { providerId: data.providerId, dryRun: data.dryRun }) })
        void syncModels(this.db, { dryRun: data.dryRun }).catch(error => log.warn('Sincronización de modelos fallida', { error: (error as Error).message }))
        return json({ running: true, report: null }, 202)
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
      if (credential && method === 'PUT') {
        this.allow(actor, ['admin'])
        const saved = await setCredential(this.db, actor.institutionId, credential[1], await body(req))
        // Con la clave nueva el catálogo de ese proveedor se actualiza solo, sin que nadie lo pida.
        void import('../models/sync').then(m => m.syncModels(this.db, { providerId: credential[1] })).catch(error => log.warn('Sincronización tras guardar la clave fallida', { error: (error as Error).message }))
        return json(saved)
      }
      const erasure = path.match(/^\/accounts\/([^/]+)$/)
      if (erasure && method === 'DELETE') {
        this.allow(actor, ['admin'])
        this.throttle(`${peer}:erase:${actor.id}`)
        // Irreversible: el cliente debe repetir el nombre de usuario de la cuenta.
        const data = z.object({ confirm: z.string().min(1).max(80) }).strict().parse(await body(req))
        const target = await this.accounts.get(erasure[1])
        if (!target || target.institutionId !== actor.institutionId) throw new HttpError(404, 'Cuenta no encontrada')
        if (data.confirm !== target.username) throw new HttpError(422, 'La confirmación no coincide con el nombre de usuario')
        try { return json({ report: await eraseAccount(this.db, actor, erasure[1]) }) }
        catch (error) {
          if (error instanceof ErasureError) throw new HttpError(error.code === 'not_found' ? 404 : error.code === 'forbidden' ? 403 : 409, error.message)
          throw error
        }
      }
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
      // ── Currículos de cualquier tema (el de IA sigue por sus rutas históricas) ──
      if (path === '/curricula' && method === 'GET') {
        this.allow(actor, ['teacher', 'admin', 'student'])
        const defs = (await this.db.collection<CurriculumDef>(CURRICULA_COLLECTION).scan()).map(e => ({ docId: e.id, id: e.doc.id, topic: e.doc.topic, status: e.doc.status, accredits: canAccredit(e.doc), nodes: e.doc.nodes.length, createdAt: e.doc.createdAt }))
        return json({ curricula: actor.role === 'student' ? defs.filter(d => d.accredits) : defs })
      }
      if (path === '/curricula/generate' && method === 'POST') {
        this.allow(actor, ['teacher', 'admin'])
        this.throttle(`${peer}:generate:${actor.id}`)
        const data = z.object({
          topic: z.string().trim().min(3).max(160),
          audience: z.enum(['ninez', 'adolescencia_temprana', 'adolescencia', 'adulto']),
          language: z.enum(['es', 'en']).optional(), research: z.boolean().optional(),
        }).strict().parse(await body(req))
        try { return json({ job: await this.curriculumJobs.request(actor, { topic: data.topic!, audience: data.audience!, language: data.language, research: data.research }) }, 202) }
        catch (error) { throw new HttpError(429, error instanceof Error ? error.message : 'No se pudo encolar la generación') }
      }
      if (path === '/curricula/jobs' && method === 'GET') {
        this.allow(actor, ['teacher', 'admin'])
        return json({ jobs: await this.curriculumJobs.list(actor) })
      }
      const jobPath = path.match(/^\/curricula\/jobs\/([^/]+)$/)
      if (jobPath && method === 'GET') {
        this.allow(actor, ['teacher', 'admin'])
        const job = await this.curriculumJobs.get(actor, decodeURIComponent(jobPath[1]))
        if (!job) throw new HttpError(404, 'Trabajo no encontrado')
        return json({ job })
      }
      if (path === '/review-queue' && method === 'GET') {
        this.allow(actor, ['teacher', 'admin'])
        const students = (await this.accounts.list(actor)).filter(a => a.role === 'student')
        const names = new Map(students.map(a => [a.id, a.name]))
        const pending = await listPendingReviews(this.db, new Set(students.map(a => a.id)))
        return json({ queue: pending.map(item => ({ ...item, student: names.get(item.studentId) })) })
      }
      if (path === '/review-queue/resolve' && method === 'POST') {
        this.allow(actor, ['teacher', 'admin'])
        const data = z.object({
          studentId: z.string(), curriculumId: z.string().max(80), nodeId: z.string().max(80),
          decision: z.enum(['accept', 'reject']), evidence: z.string().trim().min(20).max(2000).optional(),
        }).strict().parse(await body(req))
        const student = await this.accessibleStudent(actor, data.studentId!)
        if (data.decision === 'accept') {
          if (!data.evidence) throw new HttpError(422, 'Aceptar exige describir la evidencia observada (mín. 20 caracteres)')
          if (data.curriculumId === 'ai') await this.learning.review(actor, student, { nodeId: data.nodeId, evidence: data.evidence })
          else {
            const found = await findCurriculum(this.db, data.curriculumId!)
            if (!found) throw new HttpError(404, 'Currículo no encontrado')
            await this.progress.review(actor, student, found.def, { nodeId: data.nodeId, evidence: data.evidence })
          }
        }
        await resolveReview(this.db, { studentId: student.id, curriculumId: data.curriculumId!, nodeId: data.nodeId!, reviewerId: actor.id })
        return json({ ok: true, decision: data.decision })
      }
      if (path === '/curricula/level-reviews' && method === 'GET') {
        this.allow(actor, ['teacher', 'admin'])
        const all = await this.db.collection<LevelReviewRequest>(LEVEL_REVIEWS_COLLECTION).scan()
        const students = new Map((await this.accounts.list(actor)).map(a => [a.id, a]))
        const pending = all.map(e => e.doc).filter(r => r.status === 'pending' && r.institutionId === actor.institutionId && students.has(r.studentId))
        return json({ reviews: pending.map(r => ({ ...r, student: students.get(r.studentId)?.name })) })
      }
      const journeyPath = path.match(/^\/curricula\/([^/]+)\/journey(\/actions)?$/)
      if (journeyPath) {
        this.allow(actor, ['student'])
        const found = await findCurriculum(this.db, decodeURIComponent(journeyPath[1]))
        if (!found) throw new HttpError(404, 'Currículo no encontrado')
        if (!canAccredit(found.def)) throw new HttpError(409, 'Este currículo aún no ha sido revisado por un docente')
        if (!journeyPath[2] && method === 'GET') return json({ messages: await this.curriculumJourneySurface(actor, found.def) })
        if (journeyPath[2] && method === 'POST') return json({ messages: await this.curriculumJourneyAction(actor, found.def, await body(req)) })
        throw new HttpError(405, 'Método no permitido')
      }
      const curriculumPath = path.match(/^\/curricula\/([^/]+)\/(approve|diagnostic|route|level)$/)
      if (curriculumPath) {
        const [, ref, action] = curriculumPath
        if (action === 'approve') {
          if (method !== 'POST') throw new HttpError(405, 'Método no permitido')
          this.allow(actor, ['teacher', 'admin'])
          const reviewed = await approveCurriculum(this.db, decodeURIComponent(ref), { id: actor.id, role: actor.role, institutionId: actor.institutionId })
          return json({ curriculum: { id: reviewed.id, status: reviewed.status, reviewedBy: reviewed.reviewedBy, reviewedAt: reviewed.reviewedAt } })
        }
        this.allow(actor, ['student'])
        const found = await findCurriculum(this.db, decodeURIComponent(ref))
        if (!found) throw new HttpError(404, 'Currículo no encontrado')
        // Un alumno solo trabaja con currículos que acreditan (canónicos o revisados por un docente).
        if (!canAccredit(found.def)) throw new HttpError(409, 'Este currículo aún no ha sido revisado por un docente')
        if (action === 'diagnostic' && method === 'GET') return json({ questions: found.def.questionBank.map(({ correct: _, ...question }) => question) })
        if (action === 'diagnostic' && method === 'POST') return json({ route: await this.progress.diagnostic(actor, found.def, await body(req)) })
        if (action === 'route' && method === 'GET') return json({ route: await this.progress.route(actor, found.def) })
        if (action === 'level' && method === 'GET') {
          const kev = await kevForRun({ studentId: actor.id, institutionId: actor.institutionId, ageBand: ageBandFor(actor.age) })
          return json({ level: await this.progress.levelCheck(actor, found.def, { kev }) })
        }
      }
      const curriculumReview = path.match(/^\/students\/([^/]+)\/curricula\/([^/]+)\/reviews$/)
      if (curriculumReview && method === 'POST') {
        this.allow(actor, ['teacher', 'admin'])
        const student = await this.accessibleStudent(actor, curriculumReview[1])
        const found = await findCurriculum(this.db, decodeURIComponent(curriculumReview[2]))
        if (!found) throw new HttpError(404, 'Currículo no encontrado')
        return json({ route: await this.progress.review(actor, student, found.def, await body(req)) })
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
