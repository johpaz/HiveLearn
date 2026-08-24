import { describe, expect, test } from 'bun:test'
import { resolveTheme, shadeHex, DEFAULT_THEME } from './theme'

describe('theme — Panal de Cuentos', () => {
  test('resuelve por rango de edad', () => {
    expect(resolveTheme('nino').id).toBe('nino-media')
    expect(resolveTheme('adolescente').id).toBe('adolescente-media')
    expect(resolveTheme('adulto').id).toBe('adulto-media')
  })

  test('acepta edad numérica directa', () => {
    expect(resolveTheme('8').characterScale).toBeGreaterThan(1)
    expect(resolveTheme('15').id).toBe('adolescente-media')
    expect(resolveTheme('30').id).toBe('adulto-media')
  })

  test('la energía modula mood y tempo monótonamente', () => {
    const baja = resolveTheme('nino', 'baja')
    const alta = resolveTheme('nino', 'alta')
    expect(baja.shaderMood).toBeLessThan(alta.shaderMood)
    expect(baja.musicTempo).toBeLessThan(alta.musicTempo)
    expect(baja.particleDensity).toBeLessThan(alta.particleDensity)
  })

  test('adulto cansado = colmena nocturna sobria', () => {
    const t = resolveTheme('adulto', 'baja')
    expect(t.skyShade).toBeLessThan(0)
    expect(t.celebrationFx).toBe(false)
    expect(t.motionAmp).toBeLessThan(resolveTheme('nino', 'alta').motionAmp)
  })

  test('fallback seguro con valores desconocidos', () => {
    expect(resolveTheme('', '')).toEqual(DEFAULT_THEME)
    expect(resolveTheme(null, null)).toEqual(DEFAULT_THEME)
    expect(resolveTheme('marciano', 'turbo')).toEqual(DEFAULT_THEME)
  })

  test('shadeHex interpola hacia blanco y negro', () => {
    expect(shadeHex(0x808080, 0)).toBe(0x808080)
    expect(shadeHex(0x000000, 1)).toBe(0xffffff)
    expect(shadeHex(0xffffff, -1)).toBe(0x000000)
    const half = shadeHex(0x000000, 0.5)
    expect(half).toBe(0x808080)
  })
})
