/**
 * Une la corrección con el contexto del alumno y del currículo para registrar evidencia.
 * El estado del currículo decide si lo hecho puede acreditar; un tema sin definición revisada no acredita.
 */
import type { HiveDB } from '@johpaz/hive-db'
import { resolveStudentId } from '../storage/migrations/student-ids'
import { findCurriculum } from '../institutional/curriculum-store'
import type { Account } from '../institutional/accounts'
import { CurriculumProgressStore } from '../institutional/curriculum-progress'
import { recordEvidence, type CurriculumStatus, type DecisionContext } from './evidence'
import type { Grade } from './grade'

export async function assessmentContext(db: HiveDB, alumnoId: string, curriculumId: string): Promise<{ studentId: string; context: DecisionContext }> {
  const studentId = await resolveStudentId(db, alumnoId)
  const account = (await db.collection<Account>('hl_accounts').get(studentId))?.doc
  const found = await findCurriculum(db, curriculumId).catch(() => null)
  const curriculumStatus: CurriculumStatus = found?.def.status ?? 'generated'
  return { studentId, context: { curriculumStatus, hasTeacher: !!account?.teacherId } }
}

export async function recordAssessment(
  db: HiveDB,
  input: { alumnoId: string; curriculumId: string; nodeId: string; sessionId: string; grade: Grade },
) {
  const { studentId, context } = await assessmentContext(db, input.alumnoId, input.curriculumId)
  const result = await recordEvidence(db, { studentId, curriculumId: input.curriculumId, nodeId: input.nodeId, sessionId: input.sessionId, grade: input.grade, context })
  // Regla híbrida: evidencia confiable en ≥2 sesiones de un currículo que acredita → dominio.
  if (result.masteryReady && context.curriculumStatus !== 'generated') {
    const found = await findCurriculum(db, input.curriculumId).catch(() => null)
    if (found) await new CurriculumProgressStore(db).masterByEvidence(studentId, found.def, input.nodeId).catch(() => false)
  }
  return result
}
