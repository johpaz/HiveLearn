import { describe, expect, test } from 'bun:test'
import { QualityGovernor, TIERS, initialTier, lowerTier, parseTier } from './quality'

describe('initialTier', () => {
  test('una preferencia guardada manda', () => {
    expect(initialTier({ stored: 'low', coarsePointer: false, cores: 16 })).toBe('low')
    expect(initialTier({ stored: 'basura', coarsePointer: false, cores: 16 })).toBe('high')
  })
  test('móviles y equipos modestos arrancan más abajo', () => {
    expect(initialTier({ coarsePointer: true, cores: 4 })).toBe('low')
    expect(initialTier({ coarsePointer: true, cores: 8 })).toBe('medium')
    expect(initialTier({ coarsePointer: false, cores: 4 })).toBe('medium')
    expect(initialTier({ coarsePointer: false, cores: 2 })).toBe('low')
  })
})

describe('niveles', () => {
  test('cada nivel pide menos que el anterior', () => {
    expect(TIERS.high.particles).toBeGreaterThan(TIERS.medium.particles)
    expect(TIERS.medium.particles).toBeGreaterThan(TIERS.low.particles)
    expect(TIERS.low.bloom).toBe(false)
    expect(lowerTier('high')).toBe('medium')
    expect(lowerTier('low')).toBe('low')
    expect(parseTier('medium')).toBe('medium')
    expect(parseTier(3)).toBeNull()
  })
})

describe('QualityGovernor', () => {
  const feed = (g: QualityGovernor, ms: number, frames: number) => {
    let result: ReturnType<QualityGovernor['sample']> = null
    for (let i = 0; i < frames; i++) result = g.sample(ms) ?? result
    return result
  }

  test('con buen rendimiento no cambia', () => {
    expect(feed(new QualityGovernor('high'), 12, 600)).toBeNull()
  })

  test('baja un nivel por ventana lenta y nunca por debajo de low', () => {
    const g = new QualityGovernor('high')
    expect(feed(g, 40, 120)).toBe('medium')
    expect(feed(g, 40, 90)).toBe('low')
    expect(feed(g, 40, 300)).toBeNull()
    expect(g.tier).toBe('low')
  })

  test('ignora el calentamiento: los primeros cuadros lentos no cuentan', () => {
    const g = new QualityGovernor('high', { warmupFrames: 30, windowFrames: 90 })
    expect(feed(g, 90, 30)).toBeNull()
    expect(feed(g, 10, 90)).toBeNull()
    expect(g.tier).toBe('high')
  })

  test('un cuadro enorme (pestaña en segundo plano) no hunde la media por sí solo', () => {
    const g = new QualityGovernor('high', { warmupFrames: 0, windowFrames: 90 })
    for (let i = 0; i < 89; i++) g.sample(10)
    expect(g.sample(60000)).toBeNull()
  })

  test('el cambio manual reinicia la medición', () => {
    const g = new QualityGovernor('low')
    g.set('high')
    expect(g.tier).toBe('high')
  })
})
