/**
 * Render del tilemap: pinta cada tile con la textura del tema del mundo.
 * Separado de tilemap.ts para que la lógica sea testeable sin Pixi.
 */

import { Container, Sprite, Texture } from 'pixi.js'
import { Tilemap, Tile } from './tilemap'
import { TILE } from './types'

export function buildTilemapView(map: Tilemap, textures: Partial<Record<Tile, Texture>>): Container {
  const view = new Container()
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const t = map.get(c, r)
      if (t === Tile.Empty) continue
      const tex = textures[t]
      if (!tex) continue
      const sp = new Sprite(tex)
      sp.x = c * TILE
      sp.y = r * TILE
      sp.width = TILE
      sp.height = TILE
      view.addChild(sp)
    }
  }
  // cacheo como bitmap estático: el mapa no cambia durante el nivel
  view.cacheAsTexture(true)
  return view
}
