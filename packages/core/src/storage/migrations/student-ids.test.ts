import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HiveDB } from '@johpaz/hive-db'
import { linkLegacyStudents, resolveStudentId } from './student-ids'

let dir: string
let db: HiveDB

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'hl-student-ids-'))
  db = await HiveDB.open(dir)
  await db.collection('hl_sessions').createIndex('alumno_id')
  await db.collection('hl_onboarding_progress').createIndex('alumno_id')
})
afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const account = (id: string, username: string, institutionId = 'inst-1', role = 'student') => ({ id, institutionId, username, role })
const profile = (nickname: string | null) => ({ nickname, nombre: 'Ana', edad: 12, rango_edad: 'adolescente', xp_acumulado: 40 })

async function seed() {
  await db.collection('hl_accounts').put('acc-ana', account('acc-ana', 'ana'))
  await db.collection('hl_accounts').put('acc-luis', account('acc-luis', 'luis'))
  await db.collection('hl_accounts').put('acc-otra', account('acc-otra', 'ana', 'inst-2'))
  await db.collection('hl_accounts').put('acc-prof', account('acc-prof', 'ana2', 'inst-1', 'teacher'))
  await db.collection('hl_student_profiles').put('alumno_ana_1', profile('Ana'))
  await db.collection('hl_sessions').put('s1', { alumno_id: 'alumno_ana_1', xp_total: 5 })
  await db.collection('hl_sessions').put('s2', { alumno_id: 'alumno_ana_1', xp_total: 9 })
  await db.collection('hl_sessions').put('s3', { alumno_id: 'alumno_ajeno', xp_total: 1 })
  await db.collection('hl_onboarding_progress').put('o1', { session_id: 'x', alumno_id: 'alumno_ana_1', step: 'edad' })
  await db.collection('hl_session_metrics').put('m1', { alumno_id: 'alumno_ana_1', tema: 'js' })
}

describe('linkLegacyStudents', () => {
  test('dryRun informa sin escribir', async () => {
    await seed()
    const report = await linkLegacyStudents(db, { institutionId: 'inst-1', dryRun: true })
    expect(report.linked).toEqual([{ legacyAlumnoId: 'alumno_ana_1', accountId: 'acc-ana', sessions: 2, onboarding: 1, metrics: 1 }])
    expect(await db.collection('hl_student_profiles').get('alumno_ana_1')).toBeDefined()
    expect(await db.collection('hl_student_aliases').get('alumno_ana_1')).toBeUndefined()
  })

  test('enlaza por nickname=username dentro de la institución y reescribe las referencias', async () => {
    await seed()
    const report = await linkLegacyStudents(db, { institutionId: 'inst-1' })
    expect(report.linked.map(l => l.accountId)).toEqual(['acc-ana'])

    expect(await db.collection('hl_student_profiles').get('alumno_ana_1')).toBeUndefined()
    const moved = await db.collection<Record<string, unknown>>('hl_student_profiles').get('acc-ana')
    expect(moved?.doc).toMatchObject({ nickname: 'Ana', xp_acumulado: 40 })

    const sessions = await db.collection<Record<string, unknown>>('hl_sessions').findBy('alumno_id', 'acc-ana')
    expect(sessions.map(s => s.id).sort()).toEqual(['s1', 's2'])
    // Las ajenas no se tocan.
    expect((await db.collection<Record<string, unknown>>('hl_sessions').get('s3'))?.doc.alumno_id).toBe('alumno_ajeno')
    expect((await db.collection<Record<string, unknown>>('hl_onboarding_progress').get('o1'))?.doc.alumno_id).toBe('acc-ana')
    expect((await db.collection<Record<string, unknown>>('hl_session_metrics').get('m1'))?.doc.alumno_id).toBe('acc-ana')

    expect(await resolveStudentId(db, 'alumno_ana_1')).toBe('acc-ana')
    expect(await resolveStudentId(db, 'acc-ana')).toBe('acc-ana')
  })

  test('deja copia de seguridad de lo que reescribe', async () => {
    await seed()
    await linkLegacyStudents(db, { institutionId: 'inst-1' })
    const backup = await db.collection<{ doc: Record<string, unknown> }>('hl_student_migration_backup').get('alumno_ana_1')
    expect(backup?.doc.doc).toMatchObject({ nickname: 'Ana', xp_acumulado: 40 })
    const sessionBackup = await db.collection<{ doc: Record<string, unknown> }>('hl_student_migration_backup').get('hl_sessions:s1')
    expect(sessionBackup?.doc.doc).toMatchObject({ alumno_id: 'alumno_ana_1' })
  })

  test('es idempotente', async () => {
    await seed()
    await linkLegacyStudents(db, { institutionId: 'inst-1' })
    const second = await linkLegacyStudents(db, { institutionId: 'inst-1' })
    expect(second.linked).toEqual([])
    expect(second.ambiguous).toEqual([])
  })

  test('no enlaza si hay dos perfiles para la misma cuenta', async () => {
    await seed()
    await db.collection('hl_student_profiles').put('alumno_ana_2', profile('ana'))
    const report = await linkLegacyStudents(db, { institutionId: 'inst-1' })
    expect(report.ambiguous.sort()).toEqual(['alumno_ana_1', 'alumno_ana_2'])
    expect(report.linked).toEqual([])
    expect(await db.collection('hl_student_profiles').get('alumno_ana_1')).toBeDefined()
  })

  test('no pisa un perfil que la cuenta ya tiene', async () => {
    await seed()
    await db.collection('hl_student_profiles').put('acc-ana', profile('ana'))
    const report = await linkLegacyStudents(db, { institutionId: 'inst-1' })
    expect(report.conflicts).toEqual(['alumno_ana_1'])
    expect(report.linked).toEqual([])
  })

  test('sin nickname o sin cuenta coincidente queda sin enlazar', async () => {
    await seed()
    await db.collection('hl_student_profiles').put('alumno_sin_nick', profile(null))
    await db.collection('hl_student_profiles').put('alumno_nadie', profile('nadie'))
    const report = await linkLegacyStudents(db, { institutionId: 'inst-1' })
    expect(report.unmatched.sort()).toEqual(['alumno_nadie', 'alumno_sin_nick'])
    expect(report.linked.map(l => l.accountId)).toEqual(['acc-ana'])
  })

  test('solo usa cuentas de alumno de la institución indicada', async () => {
    await seed()
    await db.collection('hl_student_profiles').put('alumno_ana2', profile('ana2'))
    const report = await linkLegacyStudents(db, { institutionId: 'inst-1' })
    // `ana2` es una cuenta de docente, y `acc-otra` (username `ana`) es de otra institución.
    expect(report.unmatched).toContain('alumno_ana2')
    expect(report.linked.map(l => l.accountId)).toEqual(['acc-ana'])
  })
})
