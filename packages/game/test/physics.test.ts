import { describe, expect, test } from 'bun:test'
import { Tilemap, Tile } from '../src/engine/tilemap'
import { stepBody, type Body } from '../src/engine/physics'
import { TILE, FIXED_DT } from '../src/engine/types'

function flatMap(): Tilemap {
  // 20 columnas, 10 filas, suelo en la fila 8
  const map = new Tilemap(20, 10)
  map.fillRow(8, 0, 19, Tile.Ground)
  return map
}

function makeBody(x: number, y: number): Body {
  return { x, y, w: 11, h: 12, vx: 0, vy: 0, onGround: false }
}

describe('física AABB', () => {
  test('un cuerpo cae y aterriza sobre el suelo', () => {
    const map = flatMap()
    const body = makeBody(5 * TILE, 3 * TILE)
    let landed = false
    for (let i = 0; i < 120; i++) {
      const res = stepBody(body, map, FIXED_DT)
      if (res.landed) landed = true
    }
    expect(landed).toBe(true)
    expect(body.onGround).toBe(true)
    // queda apoyado justo sobre la fila 8
    expect(body.y + body.h).toBeCloseTo(8 * TILE, 0)
    expect(body.vy).toBe(0)
  })

  test('choca contra una pared y se detiene', () => {
    const map = flatMap()
    // pared en la columna 8
    for (let r = 0; r < 8; r++) map.set(8, r, Tile.Ground)
    const body = makeBody(6 * TILE, 7 * TILE - 12)
    body.vx = 200
    let hitWall = false
    for (let i = 0; i < 60; i++) {
      const res = stepBody(body, map, FIXED_DT)
      if (res.hitWall) hitWall = true
    }
    expect(hitWall).toBe(true)
    expect(body.x + body.w).toBeLessThanOrEqual(8 * TILE)
    expect(body.vx).toBe(0)
  })

  test('golpea el techo con la cabeza y reporta el tile', () => {
    const map = flatMap()
    map.set(5, 5, Tile.Ground) // techo
    const body = makeBody(5 * TILE + 2, 7 * TILE)
    body.vy = -300
    let bumped: { col: number; row: number } | null = null
    for (let i = 0; i < 30; i++) {
      const res = stepBody(body, map, FIXED_DT)
      if (res.headBumps.length > 0) { bumped = res.headBumps[0]; break }
    }
    expect(bumped).toEqual({ col: 5, row: 5 })
    expect(body.vy).toBe(0)
  })

  test('plataforma one-way: aterriza desde arriba pero la atraviesa desde abajo', () => {
    const map = new Tilemap(20, 12)
    map.fillRow(10, 0, 19, Tile.Ground)
    map.fillRow(6, 0, 19, Tile.Platform)

    // cae desde arriba → aterriza en la plataforma
    const a = makeBody(5 * TILE, 3 * TILE)
    for (let i = 0; i < 120; i++) stepBody(a, map, FIXED_DT)
    expect(a.y + a.h).toBeCloseTo(6 * TILE, 0)

    // salta desde abajo → la atraviesa sin chocar
    const b = makeBody(5 * TILE, 9 * TILE)
    b.vy = -400
    let hitCeiling = false
    for (let i = 0; i < 30; i++) {
      const res = stepBody(b, map, FIXED_DT)
      if (res.hitCeiling) hitCeiling = true
    }
    expect(hitCeiling).toBe(false)
  })

  test('detecta hazards al tocarlos', () => {
    const map = flatMap()
    map.set(5, 7, Tile.Hazard)
    const body = makeBody(5 * TILE, 7 * TILE - 12)
    let touched = false
    for (let i = 0; i < 30; i++) {
      const res = stepBody(body, map, FIXED_DT)
      if (res.touchedHazard) touched = true
    }
    expect(touched).toBe(true)
  })
})
