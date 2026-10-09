import { describe, expect, test } from 'bun:test'
import { AGE_BANDS, ageBandFor, ageBandFromRango, isMinorAge, isMinorBand, rangoEdadFor, rangoEdadForAge } from './age'

describe('ageBandFor', () => {
  test('corta en 12, 15 y 18 años', () => {
    expect(ageBandFor(8)).toBe('ninez')
    expect(ageBandFor(11)).toBe('ninez')
    expect(ageBandFor(12)).toBe('adolescencia_temprana')
    expect(ageBandFor(14)).toBe('adolescencia_temprana')
    expect(ageBandFor(15)).toBe('adolescencia')
    expect(ageBandFor(17)).toBe('adolescencia')
    expect(ageBandFor(18)).toBe('adulto')
    expect(ageBandFor(90)).toBe('adulto')
  })

  test('una edad desconocida o inválida es la banda más restrictiva, nunca adulto', () => {
    for (const unknown of [undefined, null, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ageBandFor(unknown)).toBe('ninez')
      expect(isMinorAge(unknown)).toBe(true)
    }
  })
})

describe('proyecciones', () => {
  test('RangoEdad del flujo del enjambre se deriva de la banda (12 años ya no es niño)', () => {
    expect(rangoEdadForAge(11)).toBe('nino')
    expect(rangoEdadForAge(12)).toBe('adolescente')
    expect(rangoEdadForAge(17)).toBe('adolescente')
    expect(rangoEdadForAge(18)).toBe('adulto')
    expect(rangoEdadForAge(undefined)).toBe('nino')
    expect(rangoEdadFor('adolescencia_temprana')).toBe('adolescente')
  })

  test('ageBandFromRango elige la banda más restrictiva compatible', () => {
    expect(ageBandFromRango('nino')).toBe('ninez')
    expect(ageBandFromRango('adolescente')).toBe('adolescencia_temprana')
    expect(ageBandFromRango('adulto')).toBe('adulto')
    expect(ageBandFromRango('algo raro')).toBe('ninez')
    expect(ageBandFromRango(undefined)).toBe('ninez')
  })

  test('solo la banda adulta no es menor y el orden va de más a menos restrictiva', () => {
    expect(AGE_BANDS.filter(band => !isMinorBand(band))).toEqual(['adulto'])
    expect(AGE_BANDS[0]).toBe('ninez')
  })
})
