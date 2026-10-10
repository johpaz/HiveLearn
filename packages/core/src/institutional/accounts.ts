import type { HiveDB, BatchOp } from '@johpaz/hive-db'
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { ageBandFor } from './age'
import { readSettings } from './settings'

export const roles = ['admin', 'teacher', 'student'] as const
export type Role = typeof roles[number]
export interface Account {
  id: string; institutionId: string; username: string; name: string; role: Role
  passwordHash: string | null; teacherId?: string; group?: string; age?: number
  createdAt: string; activatedAt?: string
  /** Cuenta creada por el propio adulto (sin invitación ni docente). */
  selfRegistered?: boolean
}
interface Invitation { accountId: string; expiresAt: number; usedAt?: number; kind?: 'activate' | 'reset' }
interface Recovery { accountId: string; createdAt: number; usedAt?: number }
interface Session { accountId: string; expiresAt: number }
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,50}$/, 'Usa 3–50 letras sin tildes, números, punto, guion o guion bajo')
export const passwordSchema = z.string().min(12, 'La contraseña debe tener al menos 12 caracteres').max(128)
export const studentSchema = z.object({
  nickname: usernameSchema, nombre: z.string().trim().min(2).max(120),
  tipo_documento: z.enum(['cc', 'ti', 'ce', 'pasaporte', 'otro']),
  documento: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9 -]+$/, 'Documento inválido'),
  edad: z.coerce.number().int().min(8).max(120), grupo: z.string().trim().min(1).max(60),
})
export type StudentRow = z.infer<typeof studentSchema>
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const token = () => randomBytes(24).toString('base64url')
export const publicAccount = ({ passwordHash: _, ...account }: Account) => account

/** Per-installation secret, generated once with OCC. Never returned through the API. */
export async function installationKey(db: HiveDB): Promise<Buffer> {
  const col = db.collection<{ key: string }>('hl_private_keys')
  let entry = await col.get('identity')
  if (!entry) {
    try { await col.put('identity', { key: randomBytes(32).toString('base64') }, { expectedVersion: 0 }) }
    catch (error) { if (!(await col.get('identity'))) throw error }
    entry = await col.get('identity')
  }
  return Buffer.from(entry!.doc.key, 'base64')
}

export async function identityDocument(db: HiveDB, row: StudentRow, account: Account) {
  const key = await installationKey(db)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(row.documento, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return {
    studentId: account.id, accountId: account.id, institutionId: account.institutionId,
    nickname: row.nickname, displayName: row.nombre, legalName: row.nombre,
    documentType: row.tipo_documento,
    documentFingerprint: createHmac('sha256', key).update(`${account.institutionId}:${row.tipo_documento}:${row.documento.replace(/[ -]/g, '').toUpperCase()}`).digest('hex'),
    documentCiphertext: encrypted.toString('base64'), documentIv: iv.toString('base64'),
    ageBand: ageBandFor(row.edad), role: 'student' as const,
  }
}

export class Accounts {
  constructor(readonly db: HiveDB) {}
  async initialized() { return !!(await this.db.collection('hl_installation').get('main')) }
  async setup(input: { name: string; institution: string; username: string; password: string }) {
    if (await this.initialized()) throw new Error('La institución ya está configurada')
    const account: Account = { id: crypto.randomUUID(), institutionId: crypto.randomUUID(), name: z.string().trim().min(2).max(120).parse(input.name), username: usernameSchema.parse(input.username), role: 'admin', passwordHash: await Bun.password.hash(passwordSchema.parse(input.password), { algorithm: 'argon2id' }), createdAt: new Date().toISOString() }
    await this.db.batch([
      { op: 'put', collection: 'hl_installation', id: 'main', doc: { institutionId: account.institutionId, name: z.string().trim().min(2).max(120).parse(input.institution) }, expectedVersion: 0 },
      { op: 'put', collection: 'hl_accounts', id: account.id, doc: account, expectedVersion: 0 },
      { op: 'put', collection: 'hl_usernames', id: account.username, doc: { accountId: account.id }, expectedVersion: 0 },
    ])
    return publicAccount(account)
  }
  async get(id: string) { return (await this.db.collection<Account>('hl_accounts').get(id))?.doc ?? null }
  async byUsername(username: string) {
    const ref = await this.db.collection<{ accountId: string }>('hl_usernames').get(username.trim().toLowerCase())
    return ref ? this.get(ref.doc.accountId) : null
  }
  async login(username: string, password: string, role: Role) {
    const account = await this.byUsername(username)
    if (!account?.passwordHash || account.role !== role || !(await Bun.password.verify(password, account.passwordHash))) throw new Error('Usuario, contraseña o rol incorrectos')
    const value = token()
    await this.db.collection<Session>('hl_auth_sessions').put(digest(value), { accountId: account.id, expiresAt: Date.now() + 8 * 3600_000 })
    return { token: value, account: publicAccount(account) }
  }
  async session(value: string) {
    if (!value) return null
    const session = await this.db.collection<Session>('hl_auth_sessions').get(digest(value))
    return session && session.doc.expiresAt > Date.now() ? this.get(session.doc.accountId) : null
  }
  async logout(value: string) { if (value) await this.db.collection('hl_auth_sessions').delete(digest(value)) }
  async activate(code: string, password: string) {
    const col = this.db.collection<Invitation>('hl_invitations')
    const invite = await col.get(digest(code.trim()))
    if (!invite || invite.doc.kind === 'reset' || invite.doc.usedAt || invite.doc.expiresAt < Date.now()) throw new Error('Código inválido, vencido o ya utilizado')
    const account = await this.db.collection<Account>('hl_accounts').get(invite.doc.accountId)
    if (!account || account.doc.passwordHash) throw new Error('La cuenta ya fue activada')
    const passwordHash = await Bun.password.hash(passwordSchema.parse(password), { algorithm: 'argon2id' })
    await this.db.batch([
      { op: 'put', collection: 'hl_accounts', id: account.id, doc: { ...account.doc, passwordHash, activatedAt: new Date().toISOString() }, expectedVersion: account.version },
      { op: 'put', collection: 'hl_invitations', id: invite.id, doc: { ...invite.doc, usedAt: Date.now() }, expectedVersion: invite.version },
    ])
    return { username: account.doc.username, role: account.doc.role }
  }
  /**
   * Registro autónomo de un ADULTO. Requiere que la institución lo habilite y que el alumno declare ≥ 18 años
   * (la edad es declarada, no verificada). La cuenta nace sin docente: su evidencia queda como autodeclarada
   * y no acredita. Devuelve un código de recuperación que se muestra una sola vez.
   */
  async register(input: { username: string; name: string; password: string; age: number }) {
    const installation = await this.db.collection<{ institutionId: string }>('hl_installation').get('main')
    if (!installation) throw new Error('La institución aún no está configurada')
    const settings = await readSettings(this.db, installation.doc.institutionId)
    if (!settings.allowSelfRegistration) throw new Error('El registro autónomo no está habilitado')
    const age = z.number().int().min(18, 'El registro autónomo es solo para mayores de 18 años').max(120).parse(input.age)
    const username = usernameSchema.parse(input.username)
    if (await this.byUsername(username)) throw new Error('Ese nombre de usuario no está disponible')
    const now = new Date().toISOString()
    const account: Account = {
      id: crypto.randomUUID(), institutionId: installation.doc.institutionId, username,
      name: z.string().trim().min(2).max(120).parse(input.name), role: 'student', age, selfRegistered: true,
      passwordHash: await Bun.password.hash(passwordSchema.parse(input.password), { algorithm: 'argon2id' }),
      createdAt: now, activatedAt: now,
    }
    const recoveryCode = token()
    try {
      await this.db.batch([
        { op: 'put', collection: 'hl_accounts', id: account.id, doc: account, expectedVersion: 0 },
        { op: 'put', collection: 'hl_usernames', id: account.username, doc: { accountId: account.id }, expectedVersion: 0 },
        { op: 'put', collection: 'hl_recovery', id: digest(recoveryCode), doc: { accountId: account.id, createdAt: Date.now() } as Recovery, expectedVersion: 0 },
      ])
    } catch {
      // Carrera por el mismo nombre: la reserva de `hl_usernames` es atómica.
      throw new Error('Ese nombre de usuario no está disponible')
    }
    return { account: publicAccount(account), recoveryCode }
  }

  private async revokeSessions(accountId: string) {
    const sessions = this.db.collection<Session>('hl_auth_sessions')
    for (const entry of await sessions.scan()) if (entry.doc.accountId === accountId) await sessions.delete(entry.id)
  }

  /** Recuperación con el código entregado al registrarse. Un solo uso; entrega uno nuevo. Mensaje único ante cualquier fallo. */
  async recover(username: string, code: string, newPassword: string) {
    const fail = () => new Error('Datos de recuperación inválidos')
    const account = await this.byUsername(username)
    if (!account || !account.selfRegistered) throw fail()
    const col = this.db.collection<Recovery>('hl_recovery')
    const entry = await col.get(digest(code.trim()))
    if (!entry || entry.doc.accountId !== account.id || entry.doc.usedAt) throw fail()
    const passwordHash = await Bun.password.hash(passwordSchema.parse(newPassword), { algorithm: 'argon2id' })
    const next = token()
    const current = await this.db.collection<Account>('hl_accounts').get(account.id)
    if (!current) throw fail()
    await this.db.batch([
      { op: 'put', collection: 'hl_recovery', id: entry.id, doc: { ...entry.doc, usedAt: Date.now() }, expectedVersion: entry.version },
      { op: 'put', collection: 'hl_recovery', id: digest(next), doc: { accountId: account.id, createdAt: Date.now() } as Recovery, expectedVersion: 0 },
      { op: 'put', collection: 'hl_accounts', id: account.id, doc: { ...current.doc, passwordHash }, expectedVersion: current.version },
    ])
    await this.revokeSessions(account.id)
    return { recoveryCode: next }
  }

  /** Un administrador (o el docente de ese alumno) emite un código de un solo uso, válido 24 h, para fijar otra contraseña. */
  async issuePasswordReset(actor: Account, accountId: string) {
    const target = await this.get(accountId)
    if (!target || target.institutionId !== actor.institutionId || target.id === actor.id || target.role === 'admin'
      || !(actor.role === 'admin' || actor.role === 'teacher' && target.teacherId === actor.id)) throw new Error('Cuenta no accesible')
    if (!target.passwordHash) throw new Error('La cuenta aún no está activada: reemite su invitación')
    const code = token()
    await this.db.collection<Invitation>('hl_invitations').put(digest(code), { accountId: target.id, expiresAt: Date.now() + 86400_000, kind: 'reset' }, { expectedVersion: 0 })
    return { username: target.username, name: target.name, resetCode: code }
  }

  async completePasswordReset(code: string, newPassword: string) {
    const col = this.db.collection<Invitation>('hl_invitations')
    const invite = await col.get(digest(code.trim()))
    if (!invite || invite.doc.kind !== 'reset' || invite.doc.usedAt || invite.doc.expiresAt < Date.now()) throw new Error('Código inválido, vencido o ya utilizado')
    const account = await this.db.collection<Account>('hl_accounts').get(invite.doc.accountId)
    if (!account?.doc.passwordHash) throw new Error('Código inválido, vencido o ya utilizado')
    const passwordHash = await Bun.password.hash(passwordSchema.parse(newPassword), { algorithm: 'argon2id' })
    await this.db.batch([
      { op: 'put', collection: 'hl_accounts', id: account.id, doc: { ...account.doc, passwordHash }, expectedVersion: account.version },
      { op: 'put', collection: 'hl_invitations', id: invite.id, doc: { ...invite.doc, usedAt: Date.now() }, expectedVersion: invite.version },
    ])
    await this.revokeSessions(account.id)
    return { username: account.doc.username, role: account.doc.role }
  }

  async list(actor: Account) {
    return (await this.db.collection<Account>('hl_accounts').scan()).map(e => e.doc)
      .filter(a => a.institutionId === actor.institutionId && (actor.role === 'admin' || (a.role === 'student' && a.teacherId === actor.id) || a.id === actor.id))
      .map(publicAccount)
  }
  async createTeacher(actor: Account, input: { username: string; name: string }) {
    if (actor.role !== 'admin') throw new Error('Solo el administrador puede crear maestros')
    const account: Account = { id: crypto.randomUUID(), institutionId: actor.institutionId, username: usernameSchema.parse(input.username), name: z.string().trim().min(2).max(120).parse(input.name), role: 'teacher', passwordHash: null, createdAt: new Date().toISOString() }
    const code = token()
    await this.db.batch([
      { op: 'put', collection: 'hl_accounts', id: account.id, doc: account, expectedVersion: 0 },
      { op: 'put', collection: 'hl_usernames', id: account.username, doc: { accountId: account.id }, expectedVersion: 0 },
      { op: 'put', collection: 'hl_invitations', id: digest(code), doc: { accountId: account.id, expiresAt: Date.now() + 7 * 86400_000 }, expectedVersion: 0 },
    ])
    return { account: publicAccount(account), activationCode: code }
  }
  async reissue(actor: Account, accountId: string) {
    const target = await this.get(accountId)
    if (!target || target.institutionId !== actor.institutionId || target.role === 'admin' || !(actor.role === 'admin' || actor.role === 'teacher' && target.teacherId === actor.id)) throw new Error('Cuenta no accesible')
    if (target.passwordHash) throw new Error('La cuenta ya fue activada; no se puede sustituir su contraseña con una invitación')
    const invitations = await this.db.collection<Invitation>('hl_invitations').scan()
    const code = token()
    await this.db.batch([
      ...invitations.filter(e => e.doc.accountId === target.id && !e.doc.usedAt).map(e => ({ op: 'put' as const, collection: 'hl_invitations', id: e.id, doc: { ...e.doc, usedAt: Date.now() }, expectedVersion: e.version })),
      { op: 'put', collection: 'hl_invitations', id: digest(code), doc: { accountId: target.id, expiresAt: Date.now() + 7 * 86400_000 }, expectedVersion: 0 },
    ])
    return { username: target.username, name: target.name, activationCode: code }
  }
  async validateStudents(actor: Account, rows: unknown[]) {
    if (!['teacher', 'admin'].includes(actor.role)) throw new Error('No autorizado')
    if (!rows.length || rows.length > 200) throw new Error('El archivo debe contener entre 1 y 200 alumnos')
    const names = new Set<string>(), documents = new Set<string>()
    const errors: { row: number; message: string }[] = []
    const valid: StudentRow[] = []
    for (let index = 0; index < rows.length; index++) {
      const parsed = studentSchema.safeParse(rows[index])
      if (!parsed.success) { errors.push({ row: index + 2, message: parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') }); continue }
      const row = parsed.data
      const doc = await identityDocument(this.db, row, actor)
      const duplicate = names.has(row.nickname) || documents.has(doc.documentFingerprint) || await this.byUsername(row.nickname) || await this.db.collection('hl_document_keys').get(doc.documentFingerprint)
      if (duplicate) errors.push({ row: index + 2, message: 'Nickname o documento ya registrado o duplicado en el archivo' })
      names.add(row.nickname); documents.add(doc.documentFingerprint); valid.push(row)
    }
    return { rows: valid, errors }
  }
  async createStudents(actor: Account, rows: unknown[]) {
    const result = await this.validateStudents(actor, rows)
    if (result.errors.length) throw new Error(result.errors.map(e => `Fila ${e.row}: ${e.message}`).join('\n'))
    const ops: BatchOp[] = []
    const invitations = []
    for (const row of result.rows) {
      const account: Account = { id: crypto.randomUUID(), institutionId: actor.institutionId, username: row.nickname, name: row.nombre, role: 'student', passwordHash: null, teacherId: actor.id, group: row.grupo, age: row.edad, createdAt: new Date().toISOString() }
      const identity = await identityDocument(this.db, row, account)
      const code = token()
      ops.push(
        { op: 'put', collection: 'hl_accounts', id: account.id, doc: account, expectedVersion: 0 },
        { op: 'put', collection: 'hl_usernames', id: account.username, doc: { accountId: account.id }, expectedVersion: 0 },
        { op: 'put', collection: 'hl_student_identities', id: account.id, doc: identity, expectedVersion: 0 },
        { op: 'put', collection: 'hl_document_keys', id: identity.documentFingerprint, doc: { accountId: account.id }, expectedVersion: 0 },
        { op: 'put', collection: 'hl_invitations', id: digest(code), doc: { accountId: account.id, expiresAt: Date.now() + 7 * 86400_000 }, expectedVersion: 0 },
        { op: 'put', collection: 'hl_enrollment_attestations', id: account.id, doc: { accountId: account.id, institutionId: actor.institutionId, recordedBy: actor.id, purpose: 'Formación institucional en inteligencia artificial', kind: 'institutional_authorization_attestation', recordedAt: new Date().toISOString() }, expectedVersion: 0 },
      )
      invitations.push({ username: account.username, name: account.name, activationCode: code })
    }
    await this.db.batch(ops)
    return invitations
  }
}
