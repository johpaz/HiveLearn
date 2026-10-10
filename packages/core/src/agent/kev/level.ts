/**
 * ¿El alumno superó el nivel? Regla combinada de evidencia determinista y opinión de Kev.
 *
 * Kev NUNCA acredita por sí solo: la evidencia contada (dominio por nodo) es la base. Kev puede
 *   - frenar un avance dudoso (todo dominado pero Kev ve evidencia débil) → revisión docente;
 *   - proponer un avance que la evidencia aún no sostiene → revisión docente, no ascenso.
 */
export type LevelDecision = 'advance' | 'hold' | 'teacher_review'

export interface LevelDecisionInput {
  /** Ids de los nodos del nivel. */
  levelNodes: readonly string[]
  /** Ids dominados por evidencia que cuenta o por revisión docente. */
  mastered: readonly string[]
  /** Opinión de Kev: probabilidad de "listo", o null si no hubo. */
  kevReady: number | null
  /** El currículo acredita (canónico o revisado). */
  accredits: boolean
}

export interface LevelDecisionResult {
  decision: LevelDecision
  masteredCount: number
  total: number
  reason: string
}

const KEV_AGAINST = 0.3
const KEV_FOR = 0.7

export function decideLevelAdvance(input: LevelDecisionInput): LevelDecisionResult {
  const total = input.levelNodes.length
  const done = new Set(input.mastered)
  const masteredCount = input.levelNodes.filter(id => done.has(id)).length
  const base = { masteredCount, total }
  if (total === 0) return { ...base, decision: 'hold', reason: 'El nivel no tiene competencias' }
  if (!input.accredits) return { ...base, decision: 'hold', reason: 'Currículo sin revisar: el progreso es autodeclarado y no acredita el nivel' }

  const allMastered = masteredCount === total
  if (allMastered) {
    if (input.kevReady !== null && input.kevReady < KEV_AGAINST) {
      return { ...base, decision: 'teacher_review', reason: 'Toda la evidencia cubre el nivel, pero el oráculo ve evidencia débil: revisión docente' }
    }
    return { ...base, decision: 'advance', reason: 'Todas las competencias del nivel están dominadas con evidencia' }
  }
  if (input.kevReady !== null && input.kevReady >= KEV_FOR && masteredCount / total >= 0.75) {
    return { ...base, decision: 'teacher_review', reason: 'Casi toda la evidencia está y el oráculo lo ve listo: un docente decide' }
  }
  return { ...base, decision: 'hold', reason: `Faltan ${total - masteredCount} competencia(s) por dominar` }
}
