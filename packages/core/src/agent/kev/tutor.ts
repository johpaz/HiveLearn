/**
 * Qué hace el tutor tras una respuesta incorrecta. Kev elige entre ayudas; el código fija lo que es posible:
 *  - `advance` (seguir sin crédito) solo desde el 3.er intento fallido, nunca antes;
 *  - cada ayuda solo está disponible si el nodo tiene con qué darla (pista, explicación, ejemplo);
 *  - sin oráculo, escalera determinista: pista → repasar → avanzar.
 */
import { choiceOf, clip, type KevClient } from './client'
import type { AgeBand } from '../../institutional/age'

export type TutorMove = 'hint' | 'reexplain' | 'simplify' | 'advance'

export const ADVANCE_FROM_ATTEMPT = 3

export interface TutorMoveInput {
  band: AgeBand
  /** Intento fallido número N (1 = primer fallo). */
  attempts: number
  node: { title: string; concept: string }
  available: { hint: boolean; reexplain: boolean; simplify: boolean }
  /** Resumen anónimo de la memoria del alumno (sin identidad). */
  brief?: string
}

export function fallbackMove(input: TutorMoveInput): TutorMove {
  if (input.attempts >= ADVANCE_FROM_ATTEMPT) return 'advance'
  if (input.attempts <= 1 && input.available.hint) return 'hint'
  if (input.available.reexplain) return 'reexplain'
  if (input.available.simplify) return 'simplify'
  // Nunca se abandona un nodo antes del 3.er fallo: sin material específico se da una pista genérica.
  return 'hint'
}

export async function decideTutorMove(kev: KevClient | null, input: TutorMoveInput): Promise<{ move: TutorMove; source: 'oracle' | 'default' }> {
  const fallback = fallbackMove(input)
  if (!kev || input.attempts >= ADVANCE_FROM_ATTEMPT) return { move: fallback, source: 'default' }

  const options: Record<string, string> = {}
  if (input.available.hint) options.hint = 'Give a short hint that guides without revealing the answer; the learner mostly slipped'
  if (input.available.reexplain) options.reexplain = 'Re-explain the concept; the learner seems to have a gap in understanding'
  if (input.available.simplify) options.simplify = 'Give a simpler concrete example; the learner seems overwhelmed or far from the answer'
  if (Object.keys(options).length < 2) return { move: fallback, source: 'default' }

  const answers = await kev.ask(
    {
      age_band: input.band,
      failed_attempts: input.attempts,
      step: { title: clip(input.node.title, 100), concept: clip(input.node.concept, 160) },
      ...(input.brief ? { learner_summary: clip(input.brief, 500) } : {}),
    },
    { move: { type: 'choice', instructions: 'The learner answered incorrectly. Which support should the tutor give next?', criteria: options } },
  )
  const picked = choiceOf(answers, 'move', Object.keys(options), 0.6)
  return picked ? { move: picked.choice as TutorMove, source: 'oracle' } : { move: fallback, source: 'default' }
}
