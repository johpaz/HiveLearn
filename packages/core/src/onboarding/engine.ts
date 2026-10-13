/**
 * Motor del onboarding conversacional.
 *
 * El ORDEN, la validación y el cierre son código; el modelo solo pone la voz de Maya (opcional) y, si una
 * respuesta de opción cerrada es ambigua, la clasifica (Kev). Sin modelo ni oráculo el flujo funciona igual con
 * preguntas fijas.
 */
import { FALLBACK_QUESTIONS, nextField, normalizeOnboardingFields, parseField, type Field, type FieldMap } from './fields'

export interface EngineDeps {
  /** Clasifica una respuesta ambigua de un campo de opciones cerradas (energía, estilo). */
  classify?: (field: 'energia' | 'estilo', text: string) => Promise<string | null>
  /** Redacta la siguiente pregunta con la voz del personaje. null = usar la pregunta fija. */
  voice?: (ctx: { field: Field; fallback: string; lastUser: string; fields: FieldMap }) => Promise<string | null>
}

export interface Advance {
  fields: FieldMap
  /** Campo recién guardado, si la respuesta fue válida. */
  saved?: { key: Field; value: string }
  /** Campo que queda por preguntar (null = completo). */
  pending: Field | null
  reply: string
  complete?: ReturnType<typeof normalizeOnboardingFields>
}

const MAX_VOICE = 400

function safeVoice(text: string | null | undefined): string | null {
  const t = (text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length >= 3 ? t.slice(0, MAX_VOICE) : null
}

export async function advanceOnboarding(
  fields: FieldMap,
  userText: string,
  deps: EngineDeps = {},
  known?: { nombre?: string; edad?: number | string } | null,
): Promise<Advance> {
  const field = nextField(fields, known)
  if (!field) return { fields, pending: null, reply: '', complete: normalizeOnboardingFields(withKnown(fields, known)) }

  let parsed = parseField(field, userText)
  if (!parsed.ok && (field === 'energia' || field === 'estilo') && deps.classify) {
    const guess = await deps.classify(field, userText).catch(() => null)
    if (guess) parsed = parseField(field, guess)
  }
  if (!parsed.ok) {
    return { fields, pending: field, reply: `${(parsed as { hint: string }).hint} ${FALLBACK_QUESTIONS[field]}`.trim() }
  }

  const value = (parsed as { value: string }).value
  const next: FieldMap = { ...fields, [field]: value }
  const pending = nextField(next, known)
  if (!pending) {
    return {
      fields: next, saved: { key: field, value }, pending: null,
      reply: '¡Listo! Ya tengo todo para preparar tu sesión.',
      complete: normalizeOnboardingFields(withKnown(next, known)),
    }
  }
  const fallback = FALLBACK_QUESTIONS[pending]
  const voiced = deps.voice ? safeVoice(await deps.voice({ field: pending, fallback, lastUser: userText, fields: next }).catch(() => null)) : null
  return { fields: next, saved: { key: field, value }, pending, reply: voiced ?? fallback }
}

function withKnown(fields: FieldMap, known?: { nombre?: string; edad?: number | string } | null): FieldMap {
  if (!known) return fields
  return { ...fields, nombre: fields.nombre || known.nombre || '', edad: fields.edad || (known.edad !== undefined ? String(known.edad) : '') }
}
