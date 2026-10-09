/**
 * Unificación de identidad: `studentId = Account.id`.
 *
 * El flujo antiguo (onboarding por WebSocket, enjambre) inventaba un `alumnoId` (`alumno_<slug>_<timestamp>`)
 * que no tiene relación con las cuentas del portal. Esta migración enlaza cada perfil antiguo con su cuenta
 * por `nickname` = `username` (sin distinguir mayúsculas) dentro de la institución y reescribe las
 * colecciones que lo referencian.
 *
 * Garantías:
 *  - Solo enlaza coincidencias INEQUÍVOCAS: si un nickname coincide con una cuenta pero hay dos perfiles
 *    para esa cuenta, o la cuenta ya tiene perfil, no toca nada y lo informa.
 *  - Reversible: cada perfil reescrito se copia antes a `hl_student_migration_backup` y queda un registro
 *    `hl_student_aliases` (`legacyAlumnoId → accountId`).
 *  - Idempotente: una segunda ejecución no cambia nada.
 *  - Atómico por alumno: todas las escrituras de un alumno van en un único `batch`.
 *  - `dryRun` calcula el informe sin escribir.
 *
 * Los perfiles antiguos NO guardan institución. Como una instalación equivale a una institución
 * (`hl_installation/main`), la migración debe ejecutarse solo con ese `institutionId`.
 */
import type { BatchOp, HiveDB } from '@johpaz/hive-db'

interface AccountRow { id: string; institutionId: string; username: string; role: string }
type Doc = Record<string, unknown>

export interface StudentAlias { legacyAlumnoId: string; accountId: string; institutionId: string; linkedAt: string }

export interface MigrationReport {
  dryRun: boolean
  linked: Array<{ legacyAlumnoId: string; accountId: string; sessions: number; onboarding: number; metrics: number }>
  /** Perfiles con varias cuentas candidatas o varios perfiles para la misma cuenta. */
  ambiguous: string[]
  /** Perfiles sin nickname o sin cuenta con ese username. */
  unmatched: string[]
  /** La cuenta ya tiene un perfil propio: no se pisa. */
  conflicts: string[]
  alreadyLinked: number
}

const PROFILES = 'hl_student_profiles'
const SESSIONS = 'hl_sessions'
const ONBOARDING = 'hl_onboarding_progress'
const METRICS = 'hl_session_metrics'
const ALIASES = 'hl_student_aliases'
const BACKUP = 'hl_student_migration_backup'

/** `accountId` si el id es un alias conocido; si no, el mismo id. */
export async function resolveStudentId(db: HiveDB, id: string): Promise<string> {
  const alias = await db.collection<StudentAlias>(ALIASES).get(id)
  return alias?.doc.accountId ?? id
}

async function rowsWith(db: HiveDB, collection: string, legacyId: string): Promise<Array<{ id: string; version: number; doc: Doc }>> {
  const col = db.collection<Doc>(collection)
  try {
    return await col.findBy('alumno_id', legacyId)
  } catch {
    // Sin índice secundario (instalación antigua): se filtra a mano.
    return (await col.scan()).filter(entry => entry.doc.alumno_id === legacyId)
  }
}

export async function linkLegacyStudents(db: HiveDB, opts: { institutionId: string; dryRun?: boolean }): Promise<MigrationReport> {
  const dryRun = opts.dryRun === true
  const report: MigrationReport = { dryRun, linked: [], ambiguous: [], unmatched: [], conflicts: [], alreadyLinked: 0 }

  const accounts = (await db.collection<AccountRow>('hl_accounts').scan())
    .map(entry => entry.doc)
    .filter(account => account.role === 'student' && account.institutionId === opts.institutionId)
  const accountIds = new Set(accounts.map(account => account.id))
  const byUsername = new Map(accounts.map(account => [account.username.trim().toLowerCase(), account.id]))

  const profiles = await db.collection<Doc>(PROFILES).scan()
  const aliases = db.collection<StudentAlias>(ALIASES)

  // Candidatos: perfil cuya clave todavía no es una cuenta y que no está ya enlazado.
  const candidates = new Map<string, Array<{ id: string; version: number; doc: Doc }>>()
  for (const profile of profiles) {
    if (accountIds.has(profile.id)) continue
    if (await aliases.get(profile.id)) { report.alreadyLinked++; continue }
    const nickname = typeof profile.doc.nickname === 'string' ? profile.doc.nickname.trim().toLowerCase() : ''
    const accountId = nickname ? byUsername.get(nickname) : undefined
    if (!accountId) { report.unmatched.push(profile.id); continue }
    const list = candidates.get(accountId) ?? []
    list.push(profile)
    candidates.set(accountId, list)
  }

  for (const [accountId, matches] of candidates) {
    if (matches.length > 1) { report.ambiguous.push(...matches.map(match => match.id)); continue }
    const profile = matches[0]
    const existing = await db.collection<Doc>(PROFILES).get(accountId)
    if (existing) { report.conflicts.push(profile.id); continue }

    const [sessions, onboarding, metrics] = await Promise.all([
      rowsWith(db, SESSIONS, profile.id),
      rowsWith(db, ONBOARDING, profile.id),
      rowsWith(db, METRICS, profile.id),
    ])
    report.linked.push({ legacyAlumnoId: profile.id, accountId, sessions: sessions.length, onboarding: onboarding.length, metrics: metrics.length })
    if (dryRun) continue

    const now = new Date().toISOString()
    const ops: BatchOp[] = [
      { op: 'put', collection: BACKUP, id: `${profile.id}`, doc: { collection: PROFILES, id: profile.id, doc: profile.doc, backedUpAt: now } },
      { op: 'put', collection: PROFILES, id: accountId, doc: { ...profile.doc, updated_at: now }, expectedVersion: 0 },
      { op: 'delete', collection: PROFILES, id: profile.id },
      { op: 'put', collection: ALIASES, id: profile.id, doc: { legacyAlumnoId: profile.id, accountId, institutionId: opts.institutionId, linkedAt: now } satisfies StudentAlias, expectedVersion: 0 },
    ]
    for (const [collection, rows] of [[SESSIONS, sessions], [ONBOARDING, onboarding], [METRICS, metrics]] as const) {
      for (const row of rows) {
        ops.push({ op: 'put', collection: BACKUP, id: `${collection}:${row.id}`, doc: { collection, id: row.id, doc: row.doc, backedUpAt: now } })
        ops.push({ op: 'put', collection, id: row.id, doc: { ...row.doc, alumno_id: accountId }, expectedVersion: row.version })
      }
    }
    await db.batch(ops)
  }

  return report
}
