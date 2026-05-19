export const TILE = 16
export const COLS = 40
export const ROWS = 25
export const W = COLS * TILE
export const H = ROWS * TILE
export const FPS = 30
export const FRAME_MS = 1000 / FPS

export const COORDINATOR_DESK_X = 18 * TILE
export const COORDINATOR_DESK_Y = 10 * TILE
export const COORDINATOR_CHAR_X = 18 * TILE + 8
export const COORDINATOR_CHAR_Y = 9 * TILE

export const AGENT_DESKS: { agentId: string; deskX: number; deskY: number; charX: number; charY: number }[] = [
  { agentId: 'hl-explanation-agent', deskX: 6 * TILE, deskY: 2 * TILE, charX: 6 * TILE + 8, charY: 1 * TILE },
  { agentId: 'hl-exercise-agent', deskX: 13 * TILE, deskY: 2 * TILE, charX: 13 * TILE + 8, charY: 1 * TILE },
  { agentId: 'hl-image-agent', deskX: 24 * TILE, deskY: 2 * TILE, charX: 24 * TILE + 8, charY: 1 * TILE },
  { agentId: 'hl-infographic-agent', deskX: 6 * TILE, deskY: 16 * TILE, charX: 6 * TILE + 8, charY: 15 * TILE },
  { agentId: 'hl-audio-agent', deskX: 30 * TILE, deskY: 16 * TILE, charX: 30 * TILE + 8, charY: 15 * TILE },
  { agentId: 'hl-gamification-agent', deskX: 3 * TILE, deskY: 21 * TILE, charX: 3 * TILE + 8, charY: 20 * TILE },
  { agentId: 'hl-evaluation-agent', deskX: 16 * TILE, deskY: 21 * TILE, charX: 16 * TILE + 8, charY: 20 * TILE },
]

export const AGENT_COLORS: Record<string, string> = {
  'hl-explanation-agent': '#10b981',
  'hl-exercise-agent': '#f59e0b',
  'hl-image-agent': '#14b8a6',
  'hl-infographic-agent': '#a855f7',
  'hl-gamification-agent': '#fbbf24',
  'hl-evaluation-agent': '#22c55e',
  'hl-audio-agent': '#4ade80',
}

export const AGENT_LABELS: Record<string, { label: string; icon: string }> = {
  'hl-explanation-agent': { label: 'Explicación', icon: '📖' },
  'hl-exercise-agent': { label: 'Ejercicios', icon: '✏️' },
  'hl-image-agent': { label: 'Imagen', icon: '🖼️' },
  'hl-infographic-agent': { label: 'Infografía', icon: '📈' },
  'hl-gamification-agent': { label: 'Gamificación', icon: '🏆' },
  'hl-evaluation-agent': { label: 'Evaluación', icon: '📝' },
  'hl-audio-agent': { label: 'Audio', icon: '🔊' },
}

export const AGENT_SPEECH: Record<string, Record<string, string>> = {
  'hl-explanation-agent': { running: 'Redactando explicación...', completed: 'Explicación lista ✓' },
  'hl-exercise-agent': { running: 'Diseñando ejercicio...', completed: 'Ejercicio listo ✓' },
  'hl-image-agent': { running: 'Generando apoyo visual...', completed: 'Imagen lista ✓' },
  'hl-infographic-agent': { running: 'Organizando datos...', completed: 'Infografía lista ✓' },
  'hl-gamification-agent': { running: 'Calculando XP...', completed: 'Gamificación lista ✓' },
  'hl-evaluation-agent': { running: 'Formulando evaluación...', completed: 'Evaluación lista ✓' },
  'hl-audio-agent': { running: 'Generando narración...', completed: 'Audio listo ✓' },
}

export const WALK_SPEED = 2

export const WALKABLE: number[][] = (() => {
  const grid: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    grid[r] = []
    for (let c = 0; c < COLS; c++) {
      let blocked = false
      if (r === 0 || r === ROWS - 1) blocked = true
      for (const d of AGENT_DESKS) {
        const dc = Math.floor(d.deskX / TILE)
        const dr = Math.floor(d.deskY / TILE)
        if (c >= dc && c < dc + 3 && r >= dr && r < dr + 2) blocked = true
      }
      const cdc = Math.floor(COORDINATOR_DESK_X / TILE)
      const cdr = Math.floor(COORDINATOR_DESK_Y / TILE)
      if (c >= cdc && c < cdc + 4 && r >= cdr && r < cdr + 2) blocked = true
      if (r <= 1 && c >= 0 && c < COLS) blocked = true
      grid[r][c] = blocked ? 0 : 1
    }
  }
  return grid
})()
