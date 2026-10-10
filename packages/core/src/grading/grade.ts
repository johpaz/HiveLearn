/**
 * Corrección de respuestas.
 *
 * Principio: cuando existe una clave de respuesta, la corrección es CÓDIGO (determinista y con confianza
 * alta). Un LLM solo interviene en respuestas abiertas, con una rúbrica de criterios que él marca pero cuyo
 * puntaje calcula el código, y su confianza nunca supera `LLM_CONFIDENCE_CAP`.
 *
 * Un fallo de coincidencia en texto libre NO es un "incorrecto" confiable (el alumno pudo parafrasear): se
 * devuelve con confianza baja para que la regla híbrida lo mande a revisión en lugar de penalizar.
 */
import { z } from 'zod'

export type AnswerSpec =
  | { kind: 'choice'; options: readonly string[]; correctIndex: number }
  | { kind: 'true_false'; correct: boolean }
  | { kind: 'numeric'; value: number; tolerance?: number; relativeTolerance?: number }
  | { kind: 'text'; accepted: readonly string[]; requiredKeywords?: readonly string[] }

export type GradeMethod = 'deterministic' | 'rubric'
export interface Grade {
  /** null = no se pudo decidir (p. ej. opción ambigua). */
  correct: boolean | null
  score: number
  confidence: number
  method: GradeMethod
  detail: string
}

export const LLM_CONFIDENCE_CAP = 0.9

/** Minúsculas, sin acentos, sin signos; espacios colapsados. */
export function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.,-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const hit = (detail: string): Grade => ({ correct: true, score: 1, confidence: 1, method: 'deterministic', detail })
const miss = (detail: string, confidence = 1): Grade => ({ correct: false, score: 0, confidence, method: 'deterministic', detail })
const unknown = (detail: string): Grade => ({ correct: null, score: 0, confidence: 0, method: 'deterministic', detail })

/** Número desde texto del alumno: admite coma decimal, miles con punto/espacio y unidades al final. */
export function parseNumber(raw: string): number | null {
  let text = raw.trim().replace(/\s+/g, '')
  text = text.replace(/[a-zA-Z%°$€]+$/u, '')
  if (!/^[-+]?[\d.,]+$/.test(text)) return null
  const lastComma = text.lastIndexOf(','), lastDot = text.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.'
    text = decimal === ',' ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  } else if (lastComma >= 0) {
    text = text.split(',').length > 2 ? text.replace(/,/g, '') : text.replace(',', '.')
  } else if (text.split('.').length > 2) {
    text = text.replace(/\./g, '')
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export function gradeAnswer(spec: AnswerSpec, answer: unknown): Grade {
  const raw = String(answer ?? '').trim()
  if (!raw) return miss('sin respuesta')

  switch (spec.kind) {
    case 'choice': {
      const { options, correctIndex } = spec
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return unknown('clave de respuesta inválida')
      const normalized = options.map(normalize)
      // Opciones duplicadas tras normalizar: la clave es ambigua, no se corrige.
      if (new Set(normalized).size !== normalized.length) return unknown('opciones ambiguas')
      let chosen = -1
      if (/^\d+$/.test(raw) && Number(raw) < options.length) chosen = Number(raw)
      else chosen = normalized.indexOf(normalize(raw))
      if (chosen < 0) return miss('la respuesta no coincide con ninguna opción', 0.7)
      return chosen === correctIndex ? hit('opción correcta') : miss('opción incorrecta')
    }
    case 'true_false': {
      const n = normalize(raw)
      const yes = ['verdadero', 'v', 'true', 'si', 'cierto'], no = ['falso', 'f', 'false', 'no']
      const value = yes.includes(n) ? true : no.includes(n) ? false : null
      if (value === null) return miss('no se entiende como verdadero/falso', 0.7)
      return value === spec.correct ? hit('correcto') : miss('incorrecto')
    }
    case 'numeric': {
      const value = parseNumber(raw)
      if (value === null) return miss('no es un número', 0.9)
      const tolerance = Math.max(spec.tolerance ?? 0, Math.abs(spec.value) * (spec.relativeTolerance ?? 0))
      return Math.abs(value - spec.value) <= tolerance + Number.EPSILON ? hit('valor dentro de la tolerancia') : miss(`valor ${value} fuera de tolerancia`)
    }
    case 'text': {
      const n = normalize(raw)
      if (spec.accepted.some(a => normalize(a) === n)) return hit('coincide con una respuesta aceptada')
      if (spec.requiredKeywords?.length) {
        const tokens = new Set(n.split(' '))
        if (spec.requiredKeywords.every(k => tokens.has(normalize(k)))) return { correct: true, score: 1, confidence: 0.8, method: 'deterministic', detail: 'contiene todas las palabras clave' }
      }
      // Puede ser una paráfrasis válida: no se afirma que sea incorrecta con confianza.
      return miss('no coincide con las respuestas aceptadas', 0.5)
    }
  }
}

// ─── Rúbrica evaluada por LLM ───────────────────────────────────────────────

export interface Rubric { criteria: Array<{ id: string; description: string; weight?: number }>; passMark?: number }

const verdictSchema = z.object({
  criteria: z.array(z.object({ id: z.string(), met: z.boolean(), evidence: z.string().max(400).default('') }).strict()).max(20),
  confidence: z.number().min(0).max(1),
}).strict()

/**
 * Convierte el veredicto de un LLM en una nota. El LLM marca criterios; el puntaje lo calcula el código.
 * Un criterio dado por cumplido debe citar un fragmento que aparezca realmente en la respuesta del alumno.
 */
export function applyRubric(rubric: Rubric, verdictInput: unknown, studentAnswer: string): Grade {
  const parsed = verdictSchema.safeParse(verdictInput)
  if (!parsed.success) return { correct: null, score: 0, confidence: 0, method: 'rubric', detail: 'veredicto del evaluador inválido' }
  const verdict = parsed.data
  const known = new Set(rubric.criteria.map(c => c.id))
  const given = new Map(verdict.criteria.map(c => [c.id, c]))
  if (given.size !== verdict.criteria.length || verdict.criteria.some(c => !known.has(c.id)) || rubric.criteria.some(c => !given.has(c.id))) {
    return { correct: null, score: 0, confidence: 0, method: 'rubric', detail: 'el veredicto no cubre exactamente los criterios de la rúbrica' }
  }
  const answer = normalize(studentAnswer)
  let total = 0, met = 0, ungrounded = 0
  for (const criterion of rubric.criteria) {
    const weight = criterion.weight ?? 1
    total += weight
    const entry = given.get(criterion.id)!
    if (!entry.met) continue
    const quote = normalize(entry.evidence)
    if (quote.length < 3 || !answer.includes(quote)) { ungrounded++; continue }
    met += weight
  }
  const score = total > 0 ? met / total : 0
  // Una cita que no está en la respuesta es una alucinación del evaluador: baja la confianza.
  const confidence = Math.min(verdict.confidence, LLM_CONFIDENCE_CAP) * (ungrounded ? 0.5 : 1)
  return {
    correct: score >= (rubric.passMark ?? 0.7), score, confidence, method: 'rubric',
    detail: `${rubric.criteria.length - ungrounded} criterios evaluables, puntaje ${Math.round(score * 100)}%${ungrounded ? `, ${ungrounded} sin cita verificable` : ''}`,
  }
}

/** Veredicto de un juez LLM sin clave ni rúbrica (el tutor): útil para la memoria, no para acreditar. */
export function judgedByModel(correct: boolean): Grade {
  return { correct, score: correct ? 1 : 0, confidence: 0.6, method: 'rubric', detail: 'juicio del tutor sin clave de respuesta' }
}
