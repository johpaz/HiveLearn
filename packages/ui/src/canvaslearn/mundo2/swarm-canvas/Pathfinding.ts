import { WALKABLE, COLS, ROWS, TILE } from './constants'

interface Point { x: number; y: number }

export function bfs(start: Point, end: Point): Point[] {
  const sc = Math.floor(start.x / TILE)
  const sr = Math.floor(start.y / TILE)
  const ec = Math.floor(end.x / TILE)
  const er = Math.floor(end.y / TILE)

  if (sc === ec && sr === er) return [end]

  const visited = new Set<string>()
  const queue: { c: number; r: number; path: { c: number; r: number }[] }[] = [{ c: sc, r: sr, path: [{ c: sc, r: sr }] }]
  visited.add(`${sc},${sr}`)

  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]

  while (queue.length > 0) {
    const { c, r, path } = queue.shift()!
    for (const [dc, dr] of dirs) {
      const nc = c + dc
      const nr = r + dr
      const key = `${nc},${nr}`
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue
      if (visited.has(key)) continue
      if (!WALKABLE[nr]?.[nc]) continue
      visited.add(key)
      const newPath = [...path, { c: nc, r: nr }]
      if (nc === ec && nr === er) {
        return newPath.map(p => ({ x: p.c * TILE + TILE / 2, y: p.r * TILE + TILE / 2 }))
      }
      queue.push({ c: nc, r: nr, path: newPath })
    }
  }

  return [end]
}

export function moveToward(cx: number, cy: number, tx: number, ty: number, speed: number): { x: number; y: number; arrived: boolean } {
  const dx = tx - cx
  const dy = ty - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist <= speed) return { x: tx, y: ty, arrived: true }
  return { x: cx + (dx / dist) * speed, y: cy + (dy / dist) * speed, arrived: false }
}
