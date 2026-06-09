/**
 * Física AABB contra tilemap: gravedad, movimiento por ejes separados
 * (primero X, luego Y) y resolución de colisión por tile. Funciones puras
 * sobre un Body mutable — testeable sin Pixi.
 */

import { Tilemap, Tile, isSolid, isOneWay } from './tilemap'
import { TILE, GRAVITY, clamp } from './types'

export interface Body {
  /** Posición de la esquina superior izquierda del hitbox */
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  onGround: boolean
  /** Si true, atraviesa plataformas one-way hacia abajo este tick */
  dropThrough?: boolean
}

export interface PhysicsResult {
  hitWall: boolean
  hitCeiling: boolean
  landed: boolean
  touchedHazard: boolean
  /** Tiles de techo golpeados con la cabeza (col,row) — para bloques '?' */
  headBumps: Array<{ col: number; row: number }>
}

const MAX_FALL = 480

/** Avanza el cuerpo un paso de física dt contra el mapa */
export function stepBody(body: Body, map: Tilemap, dt: number, gravityScale = 1): PhysicsResult {
  const res: PhysicsResult = { hitWall: false, hitCeiling: false, landed: false, touchedHazard: false, headBumps: [] }
  const wasOnGround = body.onGround

  body.vy = clamp(body.vy + GRAVITY * gravityScale * dt, -10000, MAX_FALL)

  // ── Eje X ──
  body.x += body.vx * dt
  if (body.vx !== 0) {
    const dir = body.vx > 0 ? 1 : -1
    const edgeX = dir > 0 ? body.x + body.w : body.x
    const col = Math.floor(edgeX / TILE)
    for (let row = Math.floor(body.y / TILE); row <= Math.floor((body.y + body.h - 0.01) / TILE); row++) {
      const t = map.get(col, row)
      if (isSolid(t)) {
        body.x = dir > 0 ? col * TILE - body.w - 0.01 : (col + 1) * TILE + 0.01
        body.vx = 0
        res.hitWall = true
        break
      }
    }
  }

  // ── Eje Y ──
  const prevBottom = body.y + body.h
  body.y += body.vy * dt
  body.onGround = false

  if (body.vy > 0) {
    // cayendo: suelo sólido o plataforma one-way (solo si veníamos por encima)
    const bottom = body.y + body.h
    const row = Math.floor(bottom / TILE)
    for (let col = Math.floor(body.x / TILE); col <= Math.floor((body.x + body.w - 0.01) / TILE); col++) {
      const t = map.get(col, row)
      const oneWayLanding = isOneWay(t) && !body.dropThrough && prevBottom <= row * TILE + 0.5
      if (isSolid(t) || oneWayLanding) {
        body.y = row * TILE - body.h - 0.01
        body.vy = 0
        body.onGround = true
        if (!wasOnGround) res.landed = true
        break
      }
    }
  } else if (body.vy < 0) {
    // subiendo: techo
    const row = Math.floor(body.y / TILE)
    for (let col = Math.floor(body.x / TILE); col <= Math.floor((body.x + body.w - 0.01) / TILE); col++) {
      const t = map.get(col, row)
      if (isSolid(t)) {
        body.y = (row + 1) * TILE + 0.01
        body.vy = 0
        res.hitCeiling = true
        res.headBumps.push({ col, row })
        break
      }
    }
  }

  // ── Hazards: revisar tiles que toca el hitbox ──
  outer:
  for (let row = Math.floor(body.y / TILE); row <= Math.floor((body.y + body.h - 0.01) / TILE); row++) {
    for (let col = Math.floor(body.x / TILE); col <= Math.floor((body.x + body.w - 0.01) / TILE); col++) {
      if (map.get(col, row) === Tile.Hazard) {
        res.touchedHazard = true
        break outer
      }
    }
  }

  body.dropThrough = false
  return res
}
