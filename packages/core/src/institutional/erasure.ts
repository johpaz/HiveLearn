/**
 * Borrado en cascada de una cuenta.
 *
 * HiveDB es de documentos: no hay claves foráneas que el motor haga cumplir, así que cada colección que guarda algo
 * de una cuenta se declara aquí con CÓMO encontrarlo (por id, por prefijo `<cuenta>:` o por un campo). Una prueba
 * comprueba que ninguna colección con datos de alumno quede fuera de la lista.
 *
 * Alcance honesto:
 *  - el log de eventos de HiveDB es de solo anexar y no se puede reescribir: lo que el programa anexa NO lleva texto
 *    libre del alumno (solo ids, conteos y decisiones) y, sin la cuenta, `student:<id>` no identifica a nadie;
 *  - las guías agregadas (k ≥ 3) no contienen datos personales y no se deshacen.
 */
import type { HiveDB } from '@johpaz/hive-db'
import { ProgramStore } from './program/program-store'

type Locator = { by: 'id' } | { by: 'prefix' } | { by: 'field'; field: string }

export const ERASURE_RULES: Array<{ collection: string; locate: Locator }> = [
  { collection: 'hl_student_identities', locate: { by: 'id' } },
  { collection: 'hl_enrollment_attestations', locate: { by: 'id' } },
  { collection: 'hl_learning_records', locate: { by: 'id' } },
  { collection: 'hl_learning_journeys', locate: { by: 'id' } },
  { collection: 'hl_curriculum_progress', locate: { by: 'prefix' } },
  { collection: 'hl_curriculum_journeys', locate: { by: 'prefix' } },
  { collection: 'hl_student_memory', locate: { by: 'prefix' } },
  { collection: 'hl_assessment_evidence', locate: { by: 'prefix' } },
  { collection: 'hl_student_evidence', locate: { by: 'field', field: 'studentId' } },
  { collection: 'hl_curriculum_reviews', locate: { by: 'field', field: 'studentId' } },
  { collection: 'hl_competency_reviews', locate: { by: 'field', field: 'studentId' } },
  { collection: 'hl_level_reviews', locate: { by: 'field', field: 'studentId' } },
  { collection: 'hl_supplement_jobs', locate: { by: 'field', field: 'studentId' } },
  { collection: 'hl_invitations', locate: { by: 'field', field: 'accountId' } },
  { collection: 'hl_recovery', locate: { by: 'field', field: 'accountId' } },
  { collection: 'hl_auth_sessions', locate: { by: 'field', field: 'accountId' } },
  { collection: 'hl_document_keys', locate: { by: 'field', field: 'accountId' } },
  { collection: 'hl_student_aliases', locate: { by: 'field', field: 'accountId' } },
  { collection: 'hl_usernames', locate: { by: 'field', field: 'accountId' } },
]

export class ErasureError extends Error {
  constructor(readonly code: 'forbidden' | 'not_found' | 'has_students' | 'self' | 'admin', message: string) {
    super(message)
    this.name = 'ErasureError'
  }
}

export interface ErasureReport { accountId: string; role: string; removed: Record<string, number>; at: string }

export async function eraseAccount(
  db: HiveDB,
  actor: { id: string; role: string; institutionId: string },
  targetId: string,
): Promise<ErasureReport> {
  if (actor.role !== 'admin') throw new ErasureError('forbidden', 'Solo el administrador elimina cuentas')
  if (actor.id === targetId) throw new ErasureError('self', 'No puedes eliminar tu propia cuenta')
  const accounts = db.collection<{ id: string; institutionId: string; role: string; username: string; teacherId?: string }>('hl_accounts')
  const entry = await accounts.get(targetId)
  if (!entry || entry.doc.institutionId !== actor.institutionId) throw new ErasureError('not_found', 'Cuenta no encontrada')
  if (entry.doc.role === 'admin') throw new ErasureError('admin', 'Las cuentas de administrador no se eliminan desde aquí')
  if (entry.doc.role === 'teacher') {
    const students = (await accounts.scan()).filter(a => a.doc.teacherId === targetId).length
    if (students > 0) throw new ErasureError('has_students', `El docente tiene ${students} alumno(s): elimínalos o reasígnalos primero`)
  }

  const removed: Record<string, number> = {}
  const count = (key: string, n = 1) => { removed[key] = (removed[key] ?? 0) + n }

  for (const rule of ERASURE_RULES) {
    const col = db.collection<Record<string, unknown>>(rule.collection)
    let rows: Array<{ id: string }> = []
    if (rule.locate.by === 'id') { const one = await col.get(targetId); rows = one ? [{ id: targetId }] : [] }
    else if (rule.locate.by === 'prefix') rows = await col.scan({ prefix: `${targetId}:` })
    else {
      const field = rule.locate.field
      rows = (await col.scan()).filter(e => e.doc[field] === targetId)
    }
    for (const row of rows) { await col.delete(row.id); count(rule.collection) }
  }

  const programs = await new ProgramStore(db).purgeAccount(targetId)
  count('hl_personal_programs', programs.programs)
  count('hl_program_levels', programs.levels)
  count('hl_program_nodes', programs.nodes)
  count('hl_program_reviews', programs.reviews)

  await accounts.delete(targetId)
  count('hl_accounts')

  const report: ErasureReport = { accountId: targetId, role: entry.doc.role, removed, at: new Date().toISOString() }
  // Constancia del borrado sin datos personales: quién lo hizo, qué rol tenía la cuenta y cuántas filas.
  await db.collection('hl_erasure_log').put(`${report.at}:${crypto.randomUUID().slice(0, 8)}`, { by: actor.id, role: report.role, removed, at: report.at })
  return report
}
