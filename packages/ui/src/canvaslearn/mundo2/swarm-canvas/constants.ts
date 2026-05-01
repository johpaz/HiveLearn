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
  { agentId: 'hl-profile-agent', deskX: 3 * TILE, deskY: 2 * TILE, charX: 3 * TILE + 8, charY: 1 * TILE },
  { agentId: 'hl-intent-agent', deskX: 9 * TILE, deskY: 2 * TILE, charX: 9 * TILE + 8, charY: 1 * TILE },
  { agentId: 'hl-structure-agent', deskX: 15 * TILE, deskY: 2 * TILE, charX: 15 * TILE + 8, charY: 1 * TILE },
  { agentId: 'hl-explanation-agent', deskX: 24 * TILE, deskY: 2 * TILE, charX: 24 * TILE + 8, charY: 1 * TILE },
  { agentId: 'hl-exercise-agent', deskX: 30 * TILE, deskY: 2 * TILE, charX: 30 * TILE + 8, charY: 1 * TILE },
  { agentId: 'hl-quiz-agent', deskX: 36 * TILE, deskY: 2 * TILE, charX: 36 * TILE + 8, charY: 1 * TILE },
  { agentId: 'hl-challenge-agent', deskX: 3 * TILE, deskY: 16 * TILE, charX: 3 * TILE + 8, charY: 15 * TILE },
  { agentId: 'hl-code-agent', deskX: 9 * TILE, deskY: 16 * TILE, charX: 9 * TILE + 8, charY: 15 * TILE },
  { agentId: 'hl-svg-agent', deskX: 15 * TILE, deskY: 16 * TILE, charX: 15 * TILE + 8, charY: 15 * TILE },
  { agentId: 'hl-gif-agent', deskX: 24 * TILE, deskY: 16 * TILE, charX: 24 * TILE + 8, charY: 15 * TILE },
  { agentId: 'hl-infographic-agent', deskX: 30 * TILE, deskY: 16 * TILE, charX: 30 * TILE + 8, charY: 15 * TILE },
  { agentId: 'hl-image-agent', deskX: 36 * TILE, deskY: 16 * TILE, charX: 36 * TILE + 8, charY: 15 * TILE },
  { agentId: 'hl-gamification-agent', deskX: 3 * TILE, deskY: 21 * TILE, charX: 3 * TILE + 8, charY: 20 * TILE },
  { agentId: 'hl-evaluation-agent', deskX: 9 * TILE, deskY: 21 * TILE, charX: 9 * TILE + 8, charY: 20 * TILE },
  { agentId: 'hl-feedback-agent', deskX: 15 * TILE, deskY: 21 * TILE, charX: 15 * TILE + 8, charY: 20 * TILE },
]

export const AGENT_COLORS: Record<string, string> = {
  'hl-profile-agent': '#3b82f6',
  'hl-intent-agent': '#8b5cf6',
  'hl-structure-agent': '#06b6d4',
  'hl-explanation-agent': '#10b981',
  'hl-exercise-agent': '#f59e0b',
  'hl-quiz-agent': '#ec4899',
  'hl-challenge-agent': '#ef4444',
  'hl-code-agent': '#6366f1',
  'hl-svg-agent': '#14b8a6',
  'hl-gif-agent': '#f97316',
  'hl-infographic-agent': '#a855f7',
  'hl-image-agent': '#e879f9',
  'hl-gamification-agent': '#fbbf24',
  'hl-evaluation-agent': '#22c55e',
  'hl-feedback-agent': '#38bdf8',
}

export const AGENT_LABELS: Record<string, { label: string; icon: string }> = {
  'hl-profile-agent': { label: 'Perfil', icon: '👤' },
  'hl-intent-agent': { label: 'Intención', icon: '🎯' },
  'hl-structure-agent': { label: 'Estructura', icon: '🗺️' },
  'hl-explanation-agent': { label: 'Explicación', icon: '📖' },
  'hl-exercise-agent': { label: 'Ejercicios', icon: '✏️' },
  'hl-quiz-agent': { label: 'Quiz', icon: '❓' },
  'hl-challenge-agent': { label: 'Reto', icon: '⚡' },
  'hl-code-agent': { label: 'Código', icon: '💻' },
  'hl-svg-agent': { label: 'Diagrama', icon: '📊' },
  'hl-gif-agent': { label: 'Animación', icon: '🎞️' },
  'hl-infographic-agent': { label: 'Infografía', icon: '📈' },
  'hl-image-agent': { label: 'Imagen', icon: '🖼️' },
  'hl-gamification-agent': { label: 'Gamificación', icon: '🏆' },
  'hl-evaluation-agent': { label: 'Evaluación', icon: '📝' },
  'hl-feedback-agent': { label: 'Feedback', icon: '🧠' },
}

export const AGENT_SPEECH: Record<string, Record<string, string>> = {
  'hl-profile-agent': { running: 'Leyendo historial...', completed: 'Perfil listo ✓' },
  'hl-intent-agent': { running: 'Interpretando objetivo...', completed: 'Intención lista ✓' },
  'hl-structure-agent': { running: 'Diseñando secuencia...', completed: 'Estructura lista ✓' },
  'hl-explanation-agent': { running: 'Redactando explicación...', completed: 'Explicación lista ✓' },
  'hl-exercise-agent': { running: 'Diseñando ejercicio...', completed: 'Ejercicio listo ✓' },
  'hl-quiz-agent': { running: 'Formulando pregunta...', completed: 'Quiz listo ✓' },
  'hl-challenge-agent': { running: 'Construyendo reto...', completed: 'Reto listo ✓' },
  'hl-code-agent': { running: 'Escribiendo código...', completed: 'Código listo ✓' },
  'hl-svg-agent': { running: 'Dibujando diagrama...', completed: 'Diagrama listo ✓' },
  'hl-gif-agent': { running: 'Creando animación...', completed: 'Animación lista ✓' },
  'hl-infographic-agent': { running: 'Organizando datos...', completed: 'Infografía lista ✓' },
  'hl-image-agent': { running: 'Generando imagen...', completed: 'Imagen lista ✓' },
  'hl-gamification-agent': { running: 'Calculando XP...', completed: 'Gamificación lista ✓' },
  'hl-evaluation-agent': { running: 'Formulando evaluación...', completed: 'Evaluación lista ✓' },
  'hl-feedback-agent': { running: 'Generando feedback...', completed: 'Feedback listo ✓' },
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
