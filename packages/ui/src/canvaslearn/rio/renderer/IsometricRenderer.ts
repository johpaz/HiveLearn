import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { ISO_CONFIG, type IsoMap, type IsoTile, type TileType, type ZoneFlowState } from '../types'

const TILE_COLORS: Record<TileType, { base: number; variant: number }> = {
  agua_profunda: { base: 0x0D47A1, variant: 0x1565C0 },
  agua: { base: 0x1976D2, variant: 0x2196F3 },
  cascada: { base: 0x42A5F5, variant: 0x64B5F6 },
  tierra: { base: 0x8D6E63, variant: 0xA1887F },
  pasto: { base: 0x4CAF50, variant: 0x66BB6A },
  piedra: { base: 0x9E9E9E, variant: 0xBDBDBD },
  camino: { base: 0xD7CCC8, variant: 0xEFEBE9 },
  arena: { base: 0xFFE082, variant: 0xFFF8E1 },
  barro: { base: 0x795548, variant: 0x6D4C41 },
  flores: { base: 0xE91E63, variant: 0xF48FB1 },
  arbusto: { base: 0x2E7D32, variant: 0x388E3C },
  arbol: { base: 0x1B5E20, variant: 0x2E7D32 },
  tronco: { base: 0x5D4037, variant: 0x6D4C41 },
  puente: { base: 0xBCAAA4, variant: 0xD7CCC8 },
  portal_zona: { base: 0xFFD600, variant: 0xFFAB00 },
  desembo_roca: { base: 0x78909C, variant: 0x90A4AE },
  montana: { base: 0x546E7A, variant: 0x78909C },
}

const FLOW_STATE_COLORS: Record<ZoneFlowState, number> = {
  seco: 0x5D4037,
  fluyendo: 0x1976D2,
  completado: 0x4CAF50,
}

function getTileColor(tile: IsoTile, time: number): number {
  if (tile.zoneRef !== undefined && tile.flowState) {
    const base = FLOW_STATE_COLORS[tile.flowState]
    if (tile.flowState === 'fluyendo') {
      return animateWater(base, time)
    }
    return base
  }
  const colors = TILE_COLORS[tile.type] || TILE_COLORS.tierra
  const base = tile.variant ? colors.variant : colors.base
  if (tile.type === 'agua' || tile.type === 'agua_profunda') {
    return animateWater(base, time)
  }
  if (tile.type === 'cascada') {
    return animateWater(base, time + 500)
  }
  return base
}

function animateWater(base: number, time: number): number {
  const r = (base >> 16) & 0xFF
  const g = (base >> 8) & 0xFF
  const b = base & 0xFF
  const shimmer = Math.sin(time / 800) * 10
  return ((r & 0xFF) << 16) | ((Math.min(255, g + shimmer) & 0xFF) << 8) | ((Math.min(255, b + shimmer * 0.5)) & 0xFF)
}

export class IsometricRenderer {
  private app: Application
  private mapContainer: Container
  private entityContainer: Container
  private overlayContainer: Container
  private tileGraphics: Map<string, Graphics> = new Map()
  private labelGraphics: Map<string, Text> = new Map()
  private mapa: IsoMap | null = null
  private time: number = 0
  private needsRedraw: boolean = false

  constructor(app: Application) {
    this.app = app

    this.mapContainer = new Container()
    this.mapContainer.sortableChildren = true

    this.entityContainer = new Container()
    this.entityContainer.sortableChildren = true

    this.overlayContainer = new Container()
    this.overlayContainer.sortableChildren = true
  }

  isoToScreen(isoX: number, isoY: number): { x: number; y: number } {
    return {
      x: (isoX - isoY) * (ISO_CONFIG.TILE_WIDTH / 2),
      y: (isoX + isoY) * (ISO_CONFIG.TILE_HEIGHT / 2),
    }
  }

  screenToIso(screenX: number, screenY: number): { x: number; y: number } {
    const tw = ISO_CONFIG.TILE_WIDTH / 2
    const th = ISO_CONFIG.TILE_HEIGHT / 2
    return {
      x: (screenX / tw + screenY / th) / 2,
      y: (screenY / th - screenX / tw) / 2,
    }
  }

  setMap(mapa: IsoMap) {
    this.mapa = mapa
    this.clearMap()
    this.drawMap()
    this.needsRedraw = false
  }

  private clearMap() {
    this.mapContainer.removeChildren()
    this.tileGraphics.clear()
    this.labelGraphics.clear()
  }

  private drawMap() {
    if (!this.mapa) return

    for (let y = 0; y < this.mapa.height; y++) {
      for (let x = 0; x < this.mapa.width; x++) {
        const tile = this.mapa.tiles[y]?.[x]
        if (!tile) continue
        this.drawTile(tile)
      }
    }
  }

  private drawTile(tile: IsoTile) {
    const key = `${tile.x},${tile.y}`
    const screen = this.isoToScreen(tile.x, tile.y)
    const color = getTileColor(tile, this.time)
    const elevation = tile.elevation || 0
    const tw = ISO_CONFIG.TILE_WIDTH / 2
    const th = ISO_CONFIG.TILE_HEIGHT / 2
    const elevationOffset = elevation * 4

    const g = new Graphics()
    g.zIndex = tile.y + tile.x

    // Isometric diamond
    g.moveTo(0, -th - elevationOffset)
    g.lineTo(tw, 0 - elevationOffset)
    g.lineTo(0, th - elevationOffset)
    g.lineTo(-tw, 0 - elevationOffset)
    g.closePath()
    g.fill(color)

    // Right side (if elevated)
    if (elevation > 0) {
      const sideColor = darken(color, 0.2)
      g.moveTo(tw, 0 - elevationOffset)
      g.lineTo(tw, 0)
      g.lineTo(0, th)
      g.lineTo(0, th - elevationOffset)
      g.closePath()
      g.fill(sideColor)

      const leftColor = darken(color, 0.4)
      g.moveTo(-tw, 0 - elevationOffset)
      g.lineTo(-tw, 0)
      g.lineTo(0, th)
      g.lineTo(0, th - elevationOffset)
      g.closePath()
      g.fill(leftColor)
    }

    // Water shimmer edge highlight
    if (tile.type === 'agua' || tile.type === 'agua_profunda') {
      g.moveTo(0, -th - elevationOffset + 1)
      g.lineTo(tw * 0.6, -th * 0.4 - elevationOffset)
      g.stroke({ width: 1, color: 0x64B5F6, alpha: 0.3 })
    }

    // Portal glow
    if (tile.type === 'portal_zona') {
      g.circle(0, -elevationOffset, 8)
      g.fill({ color: 0xFFD600, alpha: 0.6 })
      g.circle(0, -elevationOffset, 12)
      g.stroke({ width: 2, color: 0xFFAB00, alpha: 0.8 })
    }

    // Zone flow indicator
    if (tile.zoneRef !== undefined && tile.flowState === 'fluyendo') {
      g.moveTo(-6, -elevationOffset)
      g.lineTo(6, -elevationOffset)
      g.stroke({ width: 1, color: 0x42A5F5, alpha: 0.5 })
    }

    g.position.set(screen.x, screen.y)
    this.mapContainer.addChild(g)
    this.tileGraphics.set(key, g)
  }

  updateTile(tile: IsoTile) {
    if (!this.mapa) return
    const key = `${tile.x},${tile.y}`
    const existing = this.tileGraphics.get(key)
    if (existing) {
      existing.destroy()
      this.tileGraphics.delete(key)
    }
    this.drawTile(tile)
  }

  update(time: number) {
    this.time = time
    if (!this.mapa) return

    // Only redraw water tiles for animation
    let hasWater = false
    for (const [key, g] of this.tileGraphics) {
      const [xStr, yStr] = key.split(',')
      const x = parseInt(xStr)
      const y = parseInt(yStr)
      const tile = this.mapa.tiles[y]?.[x]
      if (tile && (tile.type === 'agua' || tile.type === 'agua_profunda' || tile.type === 'cascada' ||
          (tile.zoneRef !== undefined && tile.flowState === 'fluyendo'))) {
        hasWater = true
        const color = getTileColor(tile, time)
        // Update fill color
        g.clear()
        this.drawTileAt(tile, g, color)
      }
    }
  }

  private drawTileAt(tile: IsoTile, g: Graphics, color: number) {
    const elevation = tile.elevation || 0
    const tw = ISO_CONFIG.TILE_WIDTH / 2
    const th = ISO_CONFIG.TILE_HEIGHT / 2
    const elevationOffset = elevation * 4

    g.moveTo(0, -th - elevationOffset)
    g.lineTo(tw, 0 - elevationOffset)
    g.lineTo(0, th - elevationOffset)
    g.lineTo(-tw, 0 - elevationOffset)
    g.closePath()
    g.fill(color)

    if (elevation > 0) {
      const sideColor = darken(color, 0.2)
      g.moveTo(tw, 0 - elevationOffset)
      g.lineTo(tw, 0)
      g.lineTo(0, th)
      g.lineTo(0, th - elevationOffset)
      g.closePath()
      g.fill(sideColor)

      const leftColor = darken(color, 0.4)
      g.moveTo(-tw, 0 - elevationOffset)
      g.lineTo(-tw, 0)
      g.lineTo(0, th)
      g.lineTo(0, th - elevationOffset)
      g.closePath()
      g.fill(leftColor)
    }

    if (tile.type === 'portal_zona') {
      g.circle(0, -elevationOffset, 8)
      g.fill({ color: 0xFFD600, alpha: 0.6 })
      g.circle(0, -elevationOffset, 12)
      g.stroke({ width: 2, color: 0xFFAB00, alpha: 0.8 })
    }

    const screen = this.isoToScreen(tile.x, tile.y)
    g.position.set(screen.x, screen.y)
  }

  getMapContainer(): Container { return this.mapContainer }
  getEntityContainer(): Container { return this.entityContainer }
  getOverlayContainer(): Container { return this.overlayContainer }

  destroy() {
    this.clearMap()
  }
}

function darken(color: number, amount: number): number {
  const r = Math.max(0, ((color >> 16) & 0xFF) * (1 - amount)) | 0
  const g = Math.max(0, ((color >> 8) & 0xFF) * (1 - amount)) | 0
  const b = Math.max(0, (color & 0xFF) * (1 - amount)) | 0
  return (r << 16) | (g << 8) | b
}