import type { IsoMap, IsoTile, TileType, Tributary, ZoneFlowState } from '../types'
import { ISO_CONFIG } from '../types'

type SeededRandom = () => number

function createRng(seed: number): SeededRandom {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function generateRiverPath(
  mapWidth: number,
  mapHeight: number,
  rng: SeededRandom
): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = []
  const startX = Math.floor(mapWidth / 2)
  let cx = startX
  let cy = mapHeight - 2

  while (cy > 1) {
    path.push({ x: cx, y: cy })
    const drift = (rng() - 0.5) * 3
    cx = Math.max(2, Math.min(mapWidth - 3, Math.round(cx + drift)))
    cy -= 1
  }
  path.push({ x: cx, y: cy })

  return path
}

function generateTributaryPath(
  riverPath: { x: number; y: number }[],
  side: 'left' | 'right',
  length: number,
  rng: SeededRandom
): { x: number; y: number; branchIdx: number }[] {
  const branchIdx = Math.floor(rng() * (riverPath.length - 4)) + 2
  const branchPoint = riverPath[branchIdx]
  const path: { x: number; y: number; branchIdx: number }[] = []
  let cx = branchPoint.x
  let cy = branchPoint.y

  for (let i = 0; i < length; i++) {
    if (side === 'left') {
      cx -= 1 + Math.round(rng() * 0.5)
    } else {
      cx += 1 + Math.round(rng() * 0.5)
    }
    cy -= Math.round(rng() * 0.8)
    path.push({ x: cx, y: cy, branchIdx })
  }

  return path
}

export function generateRioMundo(
  zoneCount: number = 5,
  seed: number = Date.now()
): IsoMap {
  const rng = createRng(seed)
  const W = ISO_CONFIG.MAP_WIDTH
  const H = ISO_CONFIG.MAP_HEIGHT
  const tiles: IsoTile[][] = []

  // Initialize all as tierra
  for (let y = 0; y < H; y++) {
    tiles[y] = []
    for (let x = 0; x < W; x++) {
      const distToEdge = Math.min(x, y, W - 1 - x, H - 1 - y)
      let type: TileType
      if (distToEdge === 0) type = 'montana'
      else if (distToEdge <= 1) type = 'piedra'
      else if (rng() < 0.35) type = 'pasto'

      tiles[y][x] = {
        x,
        y,
        type,
        elevation: type === 'montana' ? 3 : type === 'piedra' ? 1 : 0,
        walkable: type !== 'montana' && type !== 'agua_profunda',
      }
    }
  }

  // Generate main river
  const riverPath = generateRiverPath(W, H, rng)

  // Paint river tiles
  for (const point of riverPath) {
    const { x, y } = point
    // River width: 2-4 tiles
    const width = ISO_CONFIG.RIVER_WIDTH_MIN + Math.floor(rng() * (ISO_CONFIG.RIVER_WIDTH_MAX - ISO_CONFIG.RIVER_WIDTH_MIN + 1))

    for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
      const tx = x + dx
      if (tx >= 0 && tx < W && y >= 0 && y < H) {
        if (Math.abs(dx) <= 1) {
          tiles[y][tx] = { x: tx, y, type: 'agua', elevation: -1, walkable: false }
        } else {
          tiles[y][tx] = { x: tx, y, type: 'agua_profunda', elevation: -1, walkable: false }
        }
      }
    }

    // Sand banks next to river
    for (let dx = -Math.floor(width / 2) - 1; dx <= Math.floor(width / 2) + 1; dx++) {
      const tx = x + dx
      if (tx >= 0 && tx < W && y >= 0 && y < H) {
        if (tiles[y][tx].type === 'tierra' || tiles[y][tx].type === 'pasto') {
          if (rng() < 0.6) {
            tiles[y][tx] = { x: tx, y, type: 'arena', elevation: 0, walkable: true }
          }
        }
      }
    }

    // Path next to river (caminos)
    const leftPathX = x - Math.floor(width / 2) - 2
    const rightPathX = x + Math.floor(width / 2) + 2
    for (const pathX of [leftPathX, rightPathX]) {
      if (pathX >= 0 && pathX < W) {
        if (tiles[y][pathX].type !== 'agua' && tiles[y][pathX].type !== 'agua_profunda') {
          tiles[y][pathX] = { x: pathX, y, type: 'camino', elevation: 0, walkable: true }
        }
      }
    }
  }

  // Bridge tiles where river crosses a camino
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (tiles[y][x].type === 'agua' && y > 0 && y < H - 1) {
        if (tiles[y - 1][x].type === 'camino' || tiles[y + 1][x].type === 'camino') {
          // This is probably a river crossing - not needed yet but mark it
        }
      }
    }
  }

  // Spawn point at river mouth (bottom)
  const spawn = { x: riverPath[0].x, y: riverPath[0].y - 2 }

  // Clear path around spawn
  for (let dy = -3; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const sx = spawn.x + dx
      const sy = spawn.y + dy
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
        if (tiles[sy][sx].type !== 'agua' && tiles[sy][sx].type !== 'agua_profunda') {
          tiles[sy][sx] = { x: sx, y: sy, type: 'camino', elevation: 0, walkable: true }
        }
      }
    }
  }

  // Spawn desembarcadero rocks
  tiles[spawn.y + 1][spawn.x] = { x: spawn.x, y: spawn.y + 1, type: 'desembo_roca', elevation: 1, walkable: true }

  // Generate tributaries
  const tributaries: Tributary[] = []
  const usedBranchIndices = new Set<number>()

  for (let i = 0; i < zoneCount; i++) {
    // Alternate sides
    const side = i % 2 === 0 ? 'left' : 'right' as const
    const length = ISO_CONFIG.TRIBUTARY_LENGTH_MIN + Math.floor(rng() * (ISO_CONFIG.TRIBUTARY_LENGTH_MAX - ISO_CONFIG.TRIBUTARY_LENGTH_MIN + 1))

    const path = generateTributaryPath(riverPath, side, length, rng)
    if (path.length === 0) continue

    const branchPoint = riverPath[path[0].branchIdx]
    const lastPoint = path[path.length - 1]

    // Paint tributary tiles
    for (const point of path) {
      const { x, y } = point
      if (x >= 0 && x < W && y >= 0 && y < H) {
        // Main stream
        tiles[y][x] = { x, y, type: 'agua', elevation: -1, walkable: false, zoneRef: i + 1, flowState: 'seco' }

        // Banks
        for (const dx of [-1, 1]) {
          const bx = x + dx
          if (bx >= 0 && bx < W) {
            if (tiles[y][bx].type === 'tierra' || tiles[y][bx].type === 'pasto') {
              tiles[y][bx] = { x: bx, y, type: 'arena', elevation: 0, walkable: true }
            }
          }
        }
      }
    }

    // Portal at end of tributary
    const portalX = lastPoint.x + (side === 'left' ? -2 : 2)
    const portalY = lastPoint.y
    if (portalX >= 0 && portalX < W && portalY >= 0 && portalY < H) {
      tiles[portalY][portalX] = {
        x: portalX,
        y: portalY,
        type: 'portal_zona',
        elevation: 2,
        walkable: true,
        zoneRef: i + 1,
        flowState: 'seco',
      }
    }

    // Wooden bridge from river path to tributary
    const bridgeY = branchPoint.y
    const bridgeStartX = side === 'left' ? branchPoint.x - Math.floor(ISO_CONFIG.RIVER_WIDTH_MAX / 2) - 1 : branchPoint.x + Math.floor(ISO_CONFIG.RIVER_WIDTH_MAX / 2) + 1
    const bridgeEndX = path[0].x + (side === 'left' ? -1 : 1)
    const minX = Math.min(bridgeStartX, bridgeEndX)
    const maxX = Math.max(bridgeStartX, bridgeEndX)

    for (let bx = minX; bx <= maxX; bx++) {
      if (bx >= 0 && bx < W && bridgeY >= 0 && bridgeY < H) {
        if (tiles[bridgeY][bx].type === 'agua' || tiles[bridgeY][bx].type === 'agua_profunda') {
          tiles[bridgeY][bx] = { x: bx, y: bridgeY, type: 'puente', elevation: 1, walkable: true }
        }
      }
    }

    // Add some vegetation near tributaries
    for (const point of path.slice(0, -2)) {
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -1]]) {
        const vx = point.x + dx
        const vy = point.y + dy
        if (vx >= 0 && vx < W && vy >= 0 && vy < H && rng() < 0.3) {
          if (tiles[vy][vx].type === 'pasto' || tiles[vy][vx].type === 'tierra') {
            tiles[vy][vx] = { x: vx, y: vy, type: rng() < 0.5 ? 'arbusto' : 'flores', elevation: 0, walkable: false }
          }
        }
      }
    }

    tributaries.push({
      id: i + 1,
      zoneNumero: i + 1,
      name: `Zona ${i + 1}`,
      tipoPedagogico: 'concept',
      xpRecompensa: 100 * (i + 1),
      estado: 'seco',
      path: path.map(p => ({ x: p.x, y: p.y })),
      branchPoint: { x: branchPoint.x, y: branchPoint.y },
      portalPos: { x: portalX, y: portalY },
    })
  }

  // Add trees and bushes scattered
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (tiles[y][x].type === 'pasto' && rng() < 0.08) {
        tiles[y][x] = { x, y, type: 'arbol', elevation: 2, walkable: false }
      } else if (tiles[y][x].type === 'pasto' && rng() < 0.05) {
        tiles[y][x] = { x, y, type: 'arbusto', elevation: 0, walkable: false }
      }
    }
  }

  // Add flowers near river
  for (const point of riverPath) {
    for (const [dx, dy] of [[-3, 0], [3, 0], [-2, 0], [2, 0]]) {
      const fx = point.x + dx
      const fy = point.y + dy
      if (fx >= 0 && fx < W && fy >= 0 && fy < H) {
        if (tiles[fy][fx].type === 'pasto' && rng() < 0.15) {
          tiles[fy][fx] = { x: fx, y: fy, type: 'flores', elevation: 0, walkable: true }
        }
      }
    }
  }

  return {
    width: W,
    height: H,
    tiles,
    spawn,
    riverPath,
    tributaries,
  }
}

export function activateTributary(map: IsoMap, tributaryIdx: number): IsoMap {
  const trib = map.tributaries.find(t => t.id === tributaryIdx)
  if (!trib) return map

  const newMap = structuredClone(map)
  const newTrib = newMap.tributaries.find(t => t.id === tributaryIdx)!

  // Change flow state
  newTrib.estado = 'fluyendo'

  // Change tiles from seco to fluyendo
  for (const point of newTrib.path) {
    const { x, y } = point
    if (x >= 0 && x < newMap.width && y >= 0 && y < newMap.height) {
      const tile = newMap.tiles[y][x]
      if (tile.zoneRef === tributaryIdx && tile.flowState === 'seco') {
        newMap.tiles[y][x] = { ...tile, flowState: 'fluyendo' }
      }
    }
  }

  // Portal becomes active
  const portal = newTrib.portalPos
  if (portal.x >= 0 && portal.x < newMap.width && portal.y >= 0 && portal.y < newMap.height) {
    newMap.tiles[portal.y][portal.x] = {
      ...newMap.tiles[portal.y][portal.x],
      flowState: 'fluyendo',
    }
  }

  return newMap
}

export function completeTributary(map: IsoMap, tributaryIdx: number): IsoMap {
  const newMap = structuredClone(map)
  const trib = newMap.tributaries.find(t => t.id === tributaryIdx)!

  trib.estado = 'completado'

  for (const point of trib.path) {
    const { x, y } = point
    if (x >= 0 && x < newMap.width && y >= 0 && y < newMap.height) {
      const tile = newMap.tiles[y][x]
      if (tile.zoneRef === tributaryIdx) {
        newMap.tiles[y][x] = { ...tile, flowState: 'completado' }
      }
    }
  }

  const portal = trib.portalPos
  if (portal.x >= 0 && portal.x < newMap.width && portal.y >= 0 && portal.y < newMap.height) {
    newMap.tiles[portal.y][portal.x] = {
      ...newMap.tiles[portal.y][portal.x],
      flowState: 'completado',
    }
  }

  // Add flowers/vegetation around completed tributary
  for (const point of trib.path) {
    for (const [dx, dy] of [[-2, 0], [2, 0], [-1, -1], [1, -1]]) {
      const fx = point.x + dx
      const fy = point.y + dy
      if (fx >= 0 && fx < newMap.width && fy >= 0 && fy < newMap.height) {
        const tile = newMap.tiles[fy][fx]
        if (tile.type === 'arena' || tile.type === 'tierra') {
          newMap.tiles[fy][fx] = { ...tile, type: 'flores', walkable: true }
        }
      }
    }
  }

  return newMap
}

export function getWalkableTiles(map: IsoMap): Set<string> {
  const walkable = new Set<string>()
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x].walkable) {
        walkable.add(`${x},${y}`)
      }
    }
  }
  return walkable
}

export function findPath(map: IsoMap, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] | null {
  const walkable = getWalkableTiles(map)
  const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [{ x: from.x, y: from.y, path: [from] }]
  const visited = new Set<string>()
  visited.add(`${from.x},${from.y}`)

  const neighbors = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current.x === to.x && current.y === to.y) {
      return current.path
    }

    for (const { dx, dy } of neighbors) {
      const nx = current.x + dx
      const ny = current.y + dy
      const key = `${nx},${ny}`
      if (!visited.has(key) && walkable.has(key)) {
        visited.add(key)
        queue.push({ x: nx, y: ny, path: [...current.path, { x: nx, y: ny }] })
      }
    }
  }

  return null
}