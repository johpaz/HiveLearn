import type { IsoMap, IsoTile, TileType } from '../../rio/types'

interface TiledTileProperty {
  name: string
  type: 'string' | 'bool' | 'int' | 'float'
  value: string | number | boolean
}

interface TiledTilesetTile {
  id: number
  properties?: TiledTileProperty[]
}

interface TiledTileset {
  firstgid: number
  name?: string
  tiles?: TiledTilesetTile[]
}

interface TiledLayer {
  name: string
  type: 'tilelayer' | 'objectgroup'
  width?: number
  height?: number
  data?: number[]
  objects?: Array<{
    name?: string
    type?: string
    x: number
    y: number
    properties?: TiledTileProperty[]
  }>
}

interface TiledTilemap {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TiledLayer[]
  tilesets: TiledTileset[]
}

const VALID_TILE_TYPES: ReadonlySet<TileType> = new Set<TileType>([
  'agua_profunda', 'agua', 'cascada', 'tierra', 'pasto', 'piedra',
  'camino', 'arena', 'barro', 'flores', 'arbusto', 'arbol', 'tronco',
  'puente', 'portal_zona', 'desembo_roca', 'montana',
])

function findProperty(
  properties: TiledTileProperty[] | undefined,
  name: string,
): TiledTileProperty | undefined {
  return properties?.find(p => p.name === name)
}

function buildTileLookup(tilesets: TiledTileset[]): Map<number, TiledTilesetTile> {
  const lookup = new Map<number, TiledTilesetTile>()
  for (const ts of tilesets) {
    if (!ts.tiles) continue
    for (const t of ts.tiles) {
      lookup.set(ts.firstgid + t.id, t)
    }
  }
  return lookup
}

function tileFromGid(
  gid: number,
  x: number,
  y: number,
  lookup: Map<number, TiledTilesetTile>,
): IsoTile {
  const def = lookup.get(gid)
  const props = def?.properties

  const typeProp = findProperty(props, 'type')
  const walkableProp = findProperty(props, 'walkable')
  const elevationProp = findProperty(props, 'elevation')

  const rawType = (typeProp?.value as string | undefined)?.trim() || 'pasto'
  const type: TileType = VALID_TILE_TYPES.has(rawType as TileType)
    ? (rawType as TileType)
    : 'pasto'

  const walkable = walkableProp ? Boolean(walkableProp.value) : type !== 'piedra' && type !== 'arbol' && type !== 'agua_profunda'
  const elevation = elevationProp ? Number(elevationProp.value) : 0

  return { x, y, type, elevation, walkable }
}

export interface ProgramaMapData {
  map: IsoMap
  beeAnchor: { x: number; y: number }
}

export function tiledToIsoMap(raw: TiledTilemap): IsoMap {
  if (raw.width !== raw.height) {
    throw new Error(`TiledMapLoader: el mapa debe ser cuadrado (got ${raw.width}x${raw.height}).`)
  }
  const ground = raw.layers.find(l => l.name === 'ground' && l.type === 'tilelayer')
  if (!ground || !ground.data) {
    throw new Error('TiledMapLoader: falta layer "ground" tipo tilelayer.')
  }

  const lookup = buildTileLookup(raw.tilesets)
  const tiles: IsoTile[][] = []
  for (let y = 0; y < raw.height; y++) {
    const row: IsoTile[] = []
    for (let x = 0; x < raw.width; x++) {
      const gid = ground.data[y * raw.width + x] || 0
      row.push(tileFromGid(gid, x, y, lookup))
    }
    tiles.push(row)
  }

  // Spawn por defecto: centro del mapa
  let spawn = { x: Math.floor(raw.width / 2), y: Math.floor(raw.height / 2) }

  // Buscar objeto "spawn" en object layer si existe
  const objects = raw.layers.find(l => l.type === 'objectgroup')
  if (objects?.objects) {
    const spawnObj = objects.objects.find(o => (o.name || '').toLowerCase() === 'spawn' || (o.type || '').toLowerCase() === 'spawn')
    if (spawnObj) {
      spawn = {
        x: Math.floor(spawnObj.x / raw.tilewidth),
        y: Math.floor(spawnObj.y / raw.tileheight),
      }
    }
  }

  return {
    width: raw.width,
    height: raw.height,
    tiles,
    spawn,
    riverPath: [],
    tributaries: [],
  }
}

export async function loadTiledMap(url: string): Promise<IsoMap> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) {
    throw new Error(`TiledMapLoader: HTTP ${res.status} cargando ${url}`)
  }
  const raw = await res.json() as TiledTilemap
  return tiledToIsoMap(raw)
}

/**
 * Mapa por defecto (12x12) usado como fallback si no hay TMJ disponible.
 * Una habitación con piso de pasto, bordes de piedra, spawn en (6,9), bee en (6,4).
 */
export function buildDefaultProgramaMap(): IsoMap {
  const SIZE = 12
  const tiles: IsoTile[][] = []
  for (let y = 0; y < SIZE; y++) {
    const row: IsoTile[] = []
    for (let x = 0; x < SIZE; x++) {
      const isBorder = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1
      const isPath = (x === 6 && y >= 4 && y <= 9)
      const isFlowers = (x === 4 && y === 5) || (x === 8 && y === 5)
      const type: TileType = isBorder ? 'piedra' : isPath ? 'camino' : isFlowers ? 'flores' : 'pasto'
      row.push({
        x,
        y,
        type,
        elevation: isBorder ? 1 : 0,
        walkable: !isBorder,
      })
    }
    tiles.push(row)
  }
  return {
    width: SIZE,
    height: SIZE,
    tiles,
    spawn: { x: 6, y: 9 },
    riverPath: [],
    tributaries: [],
  }
}
