import { describe, expect, test } from 'bun:test'
import { generateLevel, demoLevelSpec } from '../src/levels/generator'
import { Tile, isSolid } from '../src/engine/tilemap'
import { TILE } from '../src/engine/types'
import type { LevelSpec } from '@hivelearn/core/lesson/levelSpec'

function specWith(concepts: number, seed = 'test:0', difficulty: 1 | 2 | 3 = 1): LevelSpec {
  const base = demoLevelSpec()
  return {
    ...base,
    seed,
    difficulty,
    concepts: Array.from({ length: concepts }, (_, i) => ({
      nodeId: `n-${i}`,
      titulo: `Concepto ${i}`,
      contenido: 'contenido',
      xp: 10,
      ttsText: 'texto',
    })),
  }
}

describe('generador de niveles', () => {
  test('misma seed produce exactamente el mismo nivel (determinismo)', () => {
    const a = generateLevel(specWith(3, 'igual:1'))
    const b = generateLevel(specWith(3, 'igual:1'))

    expect(a.map.cols).toBe(b.map.cols)
    for (let r = 0; r < a.map.rows; r++) {
      for (let c = 0; c < a.map.cols; c++) {
        expect(a.map.get(c, r)).toBe(b.map.get(c, r))
      }
    }
    expect(a.blocks.map(x => [x.col, x.row])).toEqual(b.blocks.map(x => [x.col, x.row]))
    expect(a.entities).toEqual(b.entities)
  })

  test('seeds distintas producen niveles distintos', () => {
    const a = generateLevel(specWith(3, 'seed:A'))
    const b = generateLevel(specWith(3, 'seed:B'))
    let differs = false
    for (let r = 0; r < a.map.rows && !differs; r++) {
      for (let c = 0; c < Math.min(a.map.cols, b.map.cols); c++) {
        if (a.map.get(c, r) !== b.map.get(c, r)) { differs = true; break }
      }
    }
    expect(differs).toBe(true)
  })

  test('genera un bloque ? por concepto', () => {
    for (const n of [1, 2, 4, 6]) {
      const level = generateLevel(specWith(n, `bloques:${n}`))
      expect(level.blocks.length).toBe(n)
      // cada bloque conserva su concepto
      expect(level.blocks.map(b => b.concept.nodeId)).toEqual(
        Array.from({ length: n }, (_, i) => `n-${i}`),
      )
    }
  })

  test('el spawn del jugador está sobre suelo sólido', () => {
    const level = generateLevel(specWith(3, 'spawn:1'))
    const col = Math.floor(level.playerSpawn.x / TILE)
    // buscar suelo debajo del spawn
    let hasGround = false
    for (let r = Math.floor(level.playerSpawn.y / TILE); r < level.map.rows; r++) {
      if (isSolid(level.map.get(col, r))) { hasGround = true; break }
    }
    expect(hasGround).toBe(true)
  })

  test('la puerta del jefe existe al final del nivel', () => {
    const level = generateLevel(specWith(2, 'puerta:1'))
    const doorCol = Math.floor(level.door.x / TILE)
    expect(doorCol).toBeGreaterThan(level.map.cols - 8)
    const doorRow = Math.floor(level.door.y / TILE)
    expect(level.map.get(doorCol, doorRow)).toBe(Tile.GoalDoor)
  })

  test('los bloques ? son alcanzables (espacio libre encima del suelo)', () => {
    const level = generateLevel(specWith(4, 'alcanzable:1', 3))
    for (const b of level.blocks) {
      // el tile justo debajo del bloque no es sólido (espacio para golpearlo)
      expect(isSolid(level.map.get(b.col, b.row + 1))).toBe(false)
    }
  })
})
