/**
 * Campos del onboarding y su interpretación determinista.
 *
 * Antes el modelo decidía qué campo guardar llamando tools y, si no lo hacía, el servidor adivinaba el campo
 * por palabras clave de la pregunta anterior. Ahora el orden de captura es fijo y cada respuesta se valida en
 * código: el modelo solo pone la voz (y, a lo sumo, clasifica una respuesta ambigua).
 */
import { rangoEdadForAge } from '../institutional/age'

export const FIELD_ORDER = ['nickname', 'nombre', 'edad', 'tema', 'objetivo', 'energia', 'tiempo_disponible', 'estilo'] as const
export type Field = typeof FIELD_ORDER[number]
export type FieldMap = Partial<Record<Field, string>>

export type Energia = 'baja' | 'media' | 'alta'
export type Estilo = 'visual' | 'lectura' | 'retos' | 'balanceado'
export type Tiempo = 15 | 30 | 45

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export type ParseResult = { ok: true; value: string } | { ok: false; hint: string }

export function parseEnergia(raw: string): Energia | null {
  const v = strip(raw)
  if (/\b(baja|cansad|agotad|sin pila|sueno|bajo)\w*/.test(v)) return 'baja'
  if (/\b(alta|motivad|a tope|con todo|emocionad|genial|energico|mucha)\w*/.test(v)) return 'alta'
  if (/\b(media|normal|regular|asi asi|bien)\b/.test(v)) return 'media'
  return null
}

export function parseEstilo(raw: string): Estilo | null {
  const v = strip(raw)
  if (/\b(balance|mezcla|ambos|todo|de todo|combina)\w*/.test(v)) return 'balanceado'
  if (/\b(visual|ver|imagen|imagenes|dibujo|video|grafic)\w*/.test(v)) return 'visual'
  if (/\b(lectura|leer|leyendo|texto|escrit)\w*/.test(v)) return 'lectura'
  if (/\b(reto|retos|juego|jugar|practic|desafio)\w*/.test(v)) return 'retos'
  return null
}

export function parseMinutes(raw: string): number | null {
  const v = strip(raw)
  if (/media hora/.test(v)) return 30
  if (/\b(una|1) hora/.test(v)) return 60
  const n = Number.parseInt(v.match(/\d+/)?.[0] ?? '', 10)
  return Number.isFinite(n) && n >= 5 && n <= 240 ? n : null
}

export function normalizeTiempo(raw: string | undefined): Tiempo {
  const n = parseMinutes(raw ?? '') ?? 30
  return n <= 20 ? 15 : n <= 37 ? 30 : 45
}

export function parseField(field: Field, input: string): ParseResult {
  const text = clean(input)
  if (!text) return { ok: false, hint: 'No recibí tu respuesta.' }
  switch (field) {
    case 'nickname': {
      const named = text.match(/(?:es|soy|llamo|apodo|nickname|usuario)\s+@?([\p{L}\p{N}._-]{3,40})\s*$/iu)?.[1]
      const candidate = named ?? (text.split(' ').length <= 2 ? text.replace(/^@/, '').replace(/\s+/g, '_') : '')
      return /^[\p{L}\p{N}._-]{3,40}$/u.test(candidate)
        ? { ok: true, value: candidate }
        : { ok: false, hint: 'Elige un apodo corto de 3 a 40 caracteres, sin espacios (letras, números, punto o guion).' }
    }
    case 'nombre': {
      const name = text.replace(/^(me llamo|mi nombre es|soy)\s+/i, '').trim()
      return /^[\p{L}][\p{L} '.-]{1,59}$/u.test(name) ? { ok: true, value: name } : { ok: false, hint: 'Escribe solo tu nombre (2 a 60 letras).' }
    }
    case 'edad': {
      const n = Number.parseInt(text.match(/\d{1,3}/)?.[0] ?? '', 10)
      return Number.isFinite(n) && n >= 4 && n <= 120 ? { ok: true, value: String(n) } : { ok: false, hint: 'Dime tu edad en años, con un número.' }
    }
    case 'tema':
      return text.length >= 2 && text.length <= 120 ? { ok: true, value: text } : { ok: false, hint: 'Cuéntame en pocas palabras qué quieres aprender (máx. 120 caracteres).' }
    case 'objetivo':
      return text.length >= 2 && text.length <= 200 ? { ok: true, value: text } : { ok: false, hint: 'Cuéntame para qué lo quieres aprender (máx. 200 caracteres).' }
    case 'energia': {
      const e = parseEnergia(text)
      return e ? { ok: true, value: e } : { ok: false, hint: '¿Cómo vienes hoy: con la energía baja, media o alta?' }
    }
    case 'tiempo_disponible': {
      const m = parseMinutes(text)
      return m ? { ok: true, value: String(m) } : { ok: false, hint: '¿Cuántos minutos tienes hoy? Dime un número, por ejemplo 20.' }
    }
    case 'estilo': {
      const e = parseEstilo(text)
      return e ? { ok: true, value: e } : { ok: false, hint: '¿Cómo prefieres aprender: visual, leyendo, con retos o un poco de todo?' }
    }
  }
}

export const FALLBACK_QUESTIONS: Record<Field, string> = {
  nickname: '¿Con qué apodo quieres que te identifique en HiveLearn?',
  nombre: '¿Cómo te llamas?',
  edad: '¿Cuántos años tienes?',
  tema: '¿Qué te gustaría aprender?',
  objetivo: '¿Para qué quieres aprenderlo?',
  energia: '¿Cómo vienes hoy de energía: baja, media o alta?',
  tiempo_disponible: '¿Cuántos minutos tienes hoy para estudiar?',
  estilo: '¿Cómo prefieres aprender: visual, leyendo, con retos o un poco de todo?',
}

/** Primer campo pendiente. Con un alumno ya conocido no se vuelve a preguntar nombre ni edad. */
export function nextField(fields: FieldMap, known?: { nombre?: string; edad?: number | string } | null): Field | null {
  for (const field of FIELD_ORDER) {
    if (known && (field === 'nombre' || field === 'edad')) continue
    if (!fields[field]?.trim()) return field
  }
  return null
}

export function normalizeOnboardingFields(fields: FieldMap): {
  perfil: Record<string, string | number>
  meta: string
  energia: Energia
  tiempoDisponible: Tiempo
} {
  // Sin edad declarada NO se asume adulto: edad 0 → banda restrictiva (ver institutional/age.ts).
  const parsed = Number.parseInt(fields.edad ?? '', 10)
  const edad = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  const estilo = parseEstilo(fields.estilo ?? '') ?? 'balanceado'
  const nickSlug = (fields.nickname?.trim() || fields.nombre?.trim() || 'alumno')
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  const tiempo = normalizeTiempo(fields.tiempo_disponible)
  return {
    perfil: {
      alumnoId: `alumno_${nickSlug}_${Date.now()}`,
      nickname: fields.nickname?.trim() ?? '',
      nombre: fields.nombre?.trim() || 'Alumno',
      edad,
      rangoEdad: rangoEdadForAge(edad),
      tiempoSesion: tiempo,
      nivelPrevio: 'principiante',
      estilo,
      sesionesTotal: 0,
      xpAcumulado: 0,
      nivelActual: 'Aprendiz',
    },
    energia: parseEnergia(fields.energia ?? '') ?? 'media',
    tiempoDisponible: tiempo,
    meta: fields.tema?.trim()
      ? `${fields.tema.trim()}${fields.objetivo?.trim() ? ` — ${fields.objetivo.trim()}` : ''}`
      : (fields.objetivo?.trim() || 'Aprender un tema nuevo'),
  }
}
