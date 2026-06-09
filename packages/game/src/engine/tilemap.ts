/**
 * Tilemap lógico (sin Pixi: testeable en bun). La física consulta solidez
 * por tile; el render vive en tilemapView.ts.
 */

import { TILE } from './types'

export enum Tile {
  Empty = 0,
  Ground = 1,      // suelo sólido
  Platform = 2,    // plataforma atravesable desde abajo
  Hazard = 3,      // espinas: daño al tocar
  GoalDoor = 4,    // puerta del jefe
  Checkpoint = 5,  // bandera de checkpoint
  Decor = 6,       // decoración sin colisión (flores, pasto)
}

export function isSolid(t: Tile): boolean {
  return t === Tile.Ground
}

export function isOneWay(t: Tile): boolean {
  return t === Tile.Platform
}

export class Tilemap {
  readonly cols: number
  readonly rows: number
  private tiles: Uint8Array

  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.tiles = new Uint8Array(cols * rows)
  }

  get(col: number, row: number): Tile {
    if (col < 0 || col >= this.cols) return Tile.Ground // paredes en los bordes
    if (row < 0) return Tile.Empty
    if (row >= this.rows) return Tile.Empty // caer al vacío
    return this.tiles[row * this.cols + col] as Tile
  }

  set(col: number, row: number, t: Tile) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return
    this.tiles[row * this.cols + col] = t
  }

  /** Rellena un rango horizontal con un tile */
  fillRow(row: number, colFrom: number, colTo: number, t: Tile) {
    for (let c = colFrom; c <= colTo; c++) this.set(c, row, t)
  }

  get widthPx() { return this.cols * TILE }
  get heightPx() { return this.rows * TILE }

  tileAtPx(x: number, y: number): Tile {
    return this.get(Math.floor(x / TILE), Math.floor(y / TILE))
  }
}
