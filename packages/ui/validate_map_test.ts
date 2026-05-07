import { generateRioMundo } from './src/canvaslearn/rio/world/RiverGenerator'

const map = generateRioMundo(5, 42)
const W = map.tiles[0].length
const H = map.tiles.length

console.log('=== MAP VALIDATION ===')
console.log(`Dimensions: ${W}x${H} (W×H)`)
console.log(`Spawn: (${map.spawn.x}, ${map.spawn.y})`)
console.log(`Tributaries: ${map.tributaries.length}`)

// 1. Tile counts
const tileCounts: Record<string, number> = {}
let walkable = 0, unwalkable = 0
for (const row of map.tiles) {
  for (const tile of row) {
    tileCounts[tile.type] = (tileCounts[tile.type] || 0) + 1
    tile.walkable ? walkable++ : unwalkable++
  }
}
console.log('\nTile counts:')
for (const [type, count] of Object.entries(tileCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(15)} ${count}`)
}
console.log(`\nWalkable: ${walkable}  Unwalkable: ${unwalkable}`)

// 2. Walkability matrix per type (and inconsistency check)
console.log('\nWalkability matrix:')
const walkByType: Record<string, { walkable: number; unwalkable: number }> = {}
for (const row of map.tiles) {
  for (const tile of row) {
    if (!walkByType[tile.type]) walkByType[tile.type] = { walkable: 0, unwalkable: 0 }
    if (tile.walkable) walkByType[tile.type].walkable++
    else walkByType[tile.type].unwalkable++
  }
}
const inconsistencies: string[] = []
for (const [type, counts] of Object.entries(walkByType).sort()) {
  const flag = counts.walkable > 0 && counts.unwalkable > 0 ? '  ⚠ INCONSISTENT' : ''
  console.log(`  ${type.padEnd(15)} walkable=${counts.walkable.toString().padStart(4)}  unwalkable=${counts.unwalkable.toString().padStart(4)}${flag}`)
  if (flag) inconsistencies.push(type)
}

// 3. Tributaries
console.log('\nTributaries:')
for (const t of map.tributaries) {
  const px = t.portalPos?.x ?? -1
  const py = t.portalPos?.y ?? -1
  const portalTile = map.tiles[py]?.[px]
  console.log(`  Zone ${t.id} (${t.name}): portal (${px}, ${py}) tile=${portalTile?.type} walkable=${portalTile?.walkable} | path=${t.path?.length} | estado: ${t.estado}`)
}

// 4. Spawn validation
const spawnTile = map.tiles[map.spawn.y]?.[map.spawn.x]
console.log(`\nSpawn tile: type=${spawnTile?.type} walkable=${spawnTile?.walkable}`)

// 5. Per-tile validation
let errors = 0, warnings = 0
if (!spawnTile?.walkable) { console.log('  ERROR: spawn is NOT walkable'); errors++ }

for (const t of map.tributaries) {
  if (!t.portalPos) { console.log(`  ERROR: tributary ${t.id} has no portalPos`); errors++; continue }
  const { x, y } = t.portalPos
  if (x < 0 || x >= W || y < 0 || y >= H) {
    console.log(`  ERROR: portal zone ${t.id} (${x},${y}) out of bounds`); errors++; continue
  }
  const pt = map.tiles[y][x]
  if (!pt.walkable) { console.log(`  WARN: portal ${t.id} not walkable (${pt.type})`); warnings++ }
  if (pt.type !== 'portal_zona') { console.log(`  WARN: portal ${t.id} tile is '${pt.type}' instead of portal_zona`); warnings++ }
  for (const p of t.path) {
    if (p.x < 0 || p.x >= W || p.y < 0 || p.y >= H) {
      console.log(`  ERROR: tributary ${t.id} path point (${p.x},${p.y}) out of bounds`); errors++; break
    }
  }
}

// 6. Bridges should be on tiles that were originally water
const bridges = map.tiles.flat().filter(t => t.type === 'puente')
console.log(`\nBridges: ${bridges.length}`)
for (const b of bridges) {
  if (!b.walkable) { console.log(`  WARN: puente at (${b.x},${b.y}) not walkable`); warnings++ }
}

// 7. BFS connectivity from spawn — can we reach every portal?
console.log('\nConnectivity (BFS from spawn):')
const visited = new Set<string>()
const queue: { x: number; y: number }[] = [{ x: map.spawn.x, y: map.spawn.y }]
visited.add(`${map.spawn.x},${map.spawn.y}`)
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
while (queue.length > 0) {
  const { x, y } = queue.shift()!
  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy
    const key = `${nx},${ny}`
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
    if (visited.has(key)) continue
    if (!map.tiles[ny][nx].walkable) continue
    visited.add(key)
    queue.push({ x: nx, y: ny })
  }
}
console.log(`  Reachable tiles from spawn: ${visited.size} / ${walkable}`)
let unreachablePortals = 0
for (const t of map.tributaries) {
  if (!t.portalPos) continue
  const reachable = visited.has(`${t.portalPos.x},${t.portalPos.y}`)
  console.log(`  Zone ${t.id}: ${reachable ? '✓ reachable' : '✗ UNREACHABLE'} from spawn`)
  if (!reachable) { unreachablePortals++; errors++ }
}

// 8. Final summary
console.log(`\nResult: ${errors} error(s), ${warnings} warning(s), ${inconsistencies.length} type inconsistencies`)
if (inconsistencies.length > 0) {
  console.log(`  Inconsistent types: ${inconsistencies.join(', ')}`)
}
if (unreachablePortals > 0) {
  console.log(`  ${unreachablePortals} portal(s) UNREACHABLE — fix river/bridge generation`)
}
if (errors === 0 && warnings === 0 && inconsistencies.length === 0) {
  console.log('✓ Map validation passed')
} else if (errors === 0) {
  console.log('✓ Map valid (warnings/inconsistencies present)')
} else {
  console.log('✗ Map validation FAILED')
  process.exit(1)
}
