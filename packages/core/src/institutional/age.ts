/**
 * Única fuente de verdad de la edad en HiveLearn.
 *
 * Antes había tres cálculos de banda en el portal (accounts, store, curriculum) y dos cortes distintos
 * en el flujo del enjambre (≤12 niño, ≤17 adolescente), de modo que un alumno de 12 años era `nino` en
 * un lado y `adolescencia_temprana` en el otro. Aquí se define una sola banda y el resto son proyecciones.
 *
 * Regla de seguridad: una edad ausente o inválida se trata como la banda MÁS restrictiva (`ninez`), nunca
 * como adulto. Un menor que no declaró su edad no debe heredar los permisos de un adulto.
 */
import type { RangoEdad } from '../types'
import type { AgeBand } from './types'

export type { AgeBand }

/** De la más restrictiva a la menos restrictiva. */
export const AGE_BANDS: readonly AgeBand[] = ['ninez', 'adolescencia_temprana', 'adolescencia', 'adulto']

/** Banda de una edad en años. Edad desconocida, no finita o no positiva → `ninez`. */
export function ageBandFor(age: number | null | undefined): AgeBand {
  if (typeof age !== 'number' || !Number.isFinite(age) || age <= 0) return 'ninez'
  if (age < 12) return 'ninez'
  if (age < 15) return 'adolescencia_temprana'
  if (age < 18) return 'adolescencia'
  return 'adulto'
}

/** Verdadero para toda banda que no sea adulta. */
export function isMinorBand(band: AgeBand): boolean {
  return band !== 'adulto'
}

/** `true` si la edad es la de un menor — o desconocida, que se trata como menor. */
export function isMinorAge(age: number | null | undefined): boolean {
  return isMinorBand(ageBandFor(age))
}

/** Proyección a la taxonomía de 3 niveles del flujo del enjambre (prompts, tono, validación pedagógica). */
export function rangoEdadFor(band: AgeBand): RangoEdad {
  if (band === 'ninez') return 'nino'
  if (band === 'adulto') return 'adulto'
  return 'adolescente'
}

/** Atajo: de una edad en años directamente a `RangoEdad`. */
export function rangoEdadForAge(age: number | null | undefined): RangoEdad {
  return rangoEdadFor(ageBandFor(age))
}

/**
 * Banda a partir de un `RangoEdad` guardado cuando no se conoce la edad exacta (filas antiguas).
 * Se elige la banda más restrictiva compatible con el rango.
 */
export function ageBandFromRango(rango: RangoEdad | string | null | undefined): AgeBand {
  if (rango === 'adulto') return 'adulto'
  if (rango === 'adolescente') return 'adolescencia_temprana'
  return 'ninez'
}
