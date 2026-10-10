/**
 * Cliente del oráculo de decisiones (Kev/Jev) para HiveLearn.
 *
 * Kev responde preguntas CERRADAS (elegir entre opciones o una probabilidad) en ~0,5–1 s. Aquí se usa en
 * tres niveles: el coordinador (a quién delegar cada trabajo y con qué skills), cada especialista (esfuerzo y
 * skills de su corrida) y la app (¿la respuesta es correcta?, ¿el alumno superó el nivel?).
 *
 * Reglas que valen para todos los usos:
 *  - Devuelve `null` si no hay oráculo (sin clave, política lo impide, caída o cooldown): el llamador SIEMPRE
 *    tiene una ruta determinista de respaldo. Kev ayuda a decidir; el sistema nunca depende de él.
 *  - Lo que viaja en `state` es lo mínimo para decidir y sin identidad del alumno.
 *  - El texto del alumno va como campo de datos y la pregunta indica que se ignore cualquier instrucción dentro.
 */
import { askJev, type JevAnswer, type JevOption, type JevQuestion } from '@johpaz/hive-sdk/agent'
import { resolveOracleOption } from '../sdk/oracle'
import type { RunContext } from '../policy/age-policy'

export type KevQuestion = JevQuestion
export type KevAnswers = Record<string, JevAnswer>

export interface KevClient {
  readonly kind: 'kev' | 'jev' | 'custom'
  ask(state: unknown, questions: Record<string, KevQuestion>): Promise<KevAnswers | null>
}

/**
 * Kev tarda ~0,1 s por pregunta y el SDK corta cada consulta a los 3 s: por encima de ~24 preguntas la
 * consulta entera se pierde (medido). Tampoco sirve lanzar los lotes en paralelo: el servidor los atiende en
 * serie y todos terminan pasando de los 3 s (medido: 3 lotes de 16 en paralelo → 0 respuestas). Van uno tras
 * otro; si un lote falla, las demás respuestas se conservan y lo no respondido es "sin decisión".
 */
export const MAX_QUESTIONS_PER_CALL = 8

export function createKevClient(option: Exclude<JevOption, false>, kind: KevClient['kind'] = 'custom', fetcher?: typeof fetch): KevClient {
  const askBatch = async (state: unknown, questions: Record<string, KevQuestion>): Promise<KevAnswers | null> => {
    try {
      const result = await askJev(state, questions, { jev: option, fetcher })
      return result?.answers ?? null
    } catch {
      return null
    }
  }
  return {
    kind,
    async ask(state, questions) {
      const entries = Object.entries(questions)
      if (entries.length === 0) return null
      const batches: Array<Record<string, KevQuestion>> = []
      for (let i = 0; i < entries.length; i += MAX_QUESTIONS_PER_CALL) batches.push(Object.fromEntries(entries.slice(i, i + MAX_QUESTIONS_PER_CALL)))
      const merged: KevAnswers = {}
      let any = false
      for (const batch of batches) {
        const result = await askBatch(state, batch)
        if (!result) break // un fallo ya gasta del presupuesto de errores del SDK (3 seguidos = enfriamiento): no insistir
        Object.assign(merged, result)
        any = true
      }
      return any ? merged : null
    },
  }
}

/** El oráculo de esta ejecución, respetando la política de edad e institución. `null` = sin oráculo. */
export async function kevForRun(ctx: RunContext, fetcher?: typeof fetch): Promise<KevClient | null> {
  try {
    const resolved = await resolveOracleOption(ctx)
    if (!resolved.kind || resolved.option === false) return null
    return createKevClient(resolved.option, resolved.kind, fetcher)
  } catch {
    return null
  }
}

/** Texto acotado y sin caracteres de control, para meterlo en `state`. */
export function clip(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

export const probOf = (answers: KevAnswers | null, name: string): number | null => {
  const a = answers?.[name]
  return a?.type === 'noul' && Number.isFinite(a.noul) ? a.noul : null
}

export const choiceOf = (answers: KevAnswers | null, name: string, allowed: readonly string[], minConfidence: number): { choice: string; confidence: number } | null => {
  const a = answers?.[name]
  if (a?.type !== 'choice' || !allowed.includes(a.choice) || a.confidence < minConfidence) return null
  return { choice: a.choice, confidence: a.confidence }
}
