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
import { getDb } from '../../storage/hivedb'
import { findCurriculum } from '../../institutional/curriculum-store'
import { ageBandFor, type AgeBand } from '../../institutional/age'
import { dossierKey, findFreshDossier, type Dossier } from '../../research/dossier'
import type { CurriculumDef } from '../../institutional/curriculum-def'
import type { HiveDB } from '@johpaz/hive-db'

const BANDS: AgeBand[] = ['ninez', 'adolescencia_temprana', 'adolescencia', 'adulto']

/** Error de entrada del llamador (el currículo pedido no existe): el gateway lo responde como 404. */
export class CurriculumNotFoundError extends Error {
  constructor(id: string) { super(`Currículo no encontrado: ${id}`); this.name = 'CurriculumNotFoundError' }
}

export interface RunSessionOptions {
  onProgress?: ProgressCallback
  /** Reanuda un run de generación interrumpido (checkpoint de blueprint + outputs por nodo) */
  resumeSessionId?: string
  /**
   * Currículo (de `hl_curricula_defs`) sobre el que se genera la sesión. Sin él, el de IA histórico.
   * Se usa su dossier de investigación vigente, si lo hay. Un currículo sin revisar se practica pero no acredita.
   */
  curriculumId?: string
}

/** Definición del currículo pedido y su dossier vigente (el de la banda del alumno primero). */
export async function resolveCurriculumContext(db: HiveDB, curriculumId: string, edad: number | null | undefined): Promise<{ curriculum: CurriculumDef; dossier?: Dossier }> {
  const found = await findCurriculum(db, curriculumId)
  if (!found) throw new CurriculumNotFoundError(curriculumId)
  // El dossier se indexa por (tema, idioma, banda del público): se prueba primero la del alumno.
  const own = ageBandFor(edad)
  for (const band of [own, ...BANDS.filter(b => b !== own)]) {
    const dossier = await findFreshDossier(db, dossierKey(found.def.topic, found.def.language, band))
    if (dossier) return { curriculum: found.def, dossier }
  }
  return { curriculum: found.def }
}

export async function runHiveLearnSession(
  perfil: StudentProfile,
  meta: string,
  opts: RunSessionOptions = {},
): Promise<LessonProgram> {
  const persistence = new LessonPersistence()

  // 1. Persistir perfil
  const persistedProfile = await persistence.ensureStudentProfile(perfil)

  // 2. Currículo y dossier (opcionales)
  const context = opts.curriculumId ? await resolveCurriculumContext(getDb(), opts.curriculumId, persistedProfile.edad) : null

  // 3. Correr enjambre
  const swarm = new HiveLearnSwarm({ onProgress: opts.onProgress })
  const program = await swarm.run(persistedProfile, meta, { resumeSessionId: opts.resumeSessionId, curriculum: context?.curriculum, dossier: context?.dossier })

  // 4. Persistir currículum (skip si la sesión ya tiene uno — reanudación)
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

    // 5. Crear sesión en BD
    await persistence.createSession(program.sessionId, persistedProfile.alumnoId, curriculoId, program.rangoEdad)
  }

  return program
}
