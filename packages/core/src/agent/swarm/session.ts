/**
 * runHiveLearnSession — función de alto nivel que encapsula todo el ciclo:
 * 1. Persiste perfil del alumno
 * 2. Corre el enjambre (HiveLearnSwarm)
 * 3. Persiste el currículum y crea la sesión en BD
 * 4. Devuelve LessonProgram listo para servir
 *
 * Esta es la función que el gateway de hive-cloud debe llamar.
 */
import { HiveLearnSwarm, type ProgressCallback } from './HiveLearnSwarm'
import { LessonPersistence } from '../../storage/LessonPersistence'
import type { StudentProfile, LessonProgram } from '../../types'

export interface RunSessionOptions {
  onProgress?: ProgressCallback
  /** Reanuda un run de generación interrumpido (checkpoint de blueprint + outputs por nodo) */
  resumeSessionId?: string
}

export async function runHiveLearnSession(
  perfil: StudentProfile,
  meta: string,
  opts: RunSessionOptions = {},
): Promise<LessonProgram> {
  const persistence = new LessonPersistence()

  // 1. Persistir perfil
  const persistedProfile = await persistence.ensureStudentProfile(perfil)

  // 2. Correr enjambre
  const swarm = new HiveLearnSwarm({ onProgress: opts.onProgress })
  const program = await swarm.run(persistedProfile, meta, { resumeSessionId: opts.resumeSessionId })

  // 3. Persistir currículum (skip si la sesión ya tiene uno — reanudación)
  const existingSession = await persistence.getSessionWithCurriculum(program.sessionId)
  if (!existingSession) {
    const curriculoId = await persistence.saveCurriculum(
      program.sessionId,
      meta,
      JSON.stringify(program.nodos),
      program.nodos.length,
      program.rangoEdad,
      program.topicSlug,
    )

    // 4. Crear sesión en BD
    await persistence.createSession(program.sessionId, persistedProfile.alumnoId, curriculoId, program.rangoEdad)
  }

  return program
}
