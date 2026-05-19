import { TILE, W, H, COORDINATOR_DESK_X, COORDINATOR_DESK_Y, AGENT_DESKS, AGENT_COLORS, AGENT_LABELS } from './constants'
import type { CanvasState, CharSprite, DustMote } from './types'

const FLOOR_A = '#0f172a'
const FLOOR_B = '#111833'
const WALL_COLOR = '#1e293b'
const DESK_COLOR = '#78350f'
const DESK_TOP = '#92400e'
const MONITOR_BODY = '#1e293b'
const SIGN_BG = '#1e293b'
const SIGN_TEXT = '#fbbf24'

export function drawFloor(ctx: CanvasRenderingContext2D) {
  for (let r = 0; r < 25; r++) {
    for (let c = 0; c < 40; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? FLOOR_A : FLOOR_B
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE)
    }
  }
}

export function drawWalls(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = WALL_COLOR
  ctx.fillRect(0, 0, W, TILE)
  ctx.fillRect(0, (25 - 1) * TILE, W, TILE)
  ctx.fillRect(0, 0, TILE, H)
  ctx.fillRect((40 - 1) * TILE, 0, TILE, H)

  ctx.fillStyle = SIGN_BG
  ctx.fillRect(14 * TILE, 0, 12 * TILE, TILE)
  ctx.fillStyle = SIGN_TEXT
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🐝 HIVELEARN', 20 * TILE, TILE / 2)
}

export function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, glowColor?: string) {
  ctx.fillStyle = DESK_COLOR
  ctx.fillRect(x, y, 3 * TILE, TILE * 0.75)
  ctx.fillStyle = DESK_TOP
  ctx.fillRect(x + 1, y + 1, 3 * TILE - 2, TILE * 0.75 - 2)

  const mx = x + TILE
  const my = y - TILE * 0.7
  ctx.fillStyle = MONITOR_BODY
  ctx.fillRect(mx, my, TILE * 1.2, TILE * 0.7)
  if (glowColor) {
    ctx.fillStyle = glowColor
    ctx.globalAlpha = 0.6
    ctx.fillRect(mx + 2, my + 2, TILE * 1.2 - 4, TILE * 0.7 - 4)
    ctx.globalAlpha = 1
  } else {
    ctx.fillStyle = '#334155'
    ctx.fillRect(mx + 2, my + 2, TILE * 1.2 - 4, TILE * 0.7 - 4)
  }
}

export function drawCoordinatorDesk(ctx: CanvasRenderingContext2D, glowColor?: string) {
  const x = COORDINATOR_DESK_X
  const y = COORDINATOR_DESK_Y
  ctx.fillStyle = '#713f12'
  ctx.fillRect(x, y, 4 * TILE, TILE)
  ctx.fillStyle = '#92400e'
  ctx.fillRect(x + 1, y + 1, 4 * TILE - 2, TILE - 2)

  const mx = x + TILE * 1.2
  const my = y - TILE
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(mx, my, TILE * 1.6, TILE * 0.9)
  if (glowColor) {
    ctx.fillStyle = glowColor
    ctx.globalAlpha = 0.7
    ctx.fillRect(mx + 2, my + 2, TILE * 1.6 - 4, TILE * 0.9 - 4)
    ctx.globalAlpha = 1
  } else {
    ctx.fillStyle = '#fbbf24'
    ctx.globalAlpha = 0.3
    ctx.fillRect(mx + 2, my + 2, TILE * 1.6 - 4, TILE * 0.9 - 4)
    ctx.globalAlpha = 1
  }
}

function drawCharBody(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  color: string,
  scale: number,
  state: CharSprite['state'],
  animFrame: number,
  shakeX: number,
  tintFlash: number,
) {
  const s = scale
  const px = x + shakeX

  ctx.save()

  let bodyColor = color
  if (state === 'completed') bodyColor = '#22c55e'
  if (state === 'failed') bodyColor = '#ef4444'
  if (tintFlash > 0) {
    ctx.globalAlpha = 1 - tintFlash * 0.3
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.ellipse(px, y + 12 * s, 6 * s, 2 * s, 0, 0, Math.PI * 2)
  ctx.fill()

  // Body
  ctx.fillStyle = bodyColor
  ctx.fillRect(px - 5 * s, y - 6 * s, 10 * s, 12 * s)

  // Head
  ctx.fillStyle = bodyColor
  ctx.beginPath()
  ctx.arc(px, y - 10 * s, 6 * s, 0, Math.PI * 2)
  ctx.fill()

  // Eyes
  ctx.fillStyle = '#fff'
  ctx.fillRect(px - 3 * s, y - 12 * s, 2 * s, 2 * s)
  ctx.fillRect(px + 1 * s, y - 12 * s, 2 * s, 2 * s)
  ctx.fillStyle = '#000'
  ctx.fillRect(px - 2 * s, y - 11.5 * s, 1 * s, 1 * s)
  ctx.fillRect(px + 2 * s, y - 11.5 * s, 1 * s, 1 * s)

  if (state === 'running') {
    const armOffset = Math.sin(animFrame * 0.15) * 3 * s
    ctx.fillStyle = bodyColor
    ctx.fillRect(px - 8 * s, y - 4 * s + armOffset, 3 * s, 6 * s)
    ctx.fillRect(px + 5 * s, y - 4 * s - armOffset, 3 * s, 6 * s)
  } else if (state === 'completed') {
    ctx.fillStyle = '#22c55e'
    ctx.fillRect(px - 9 * s, y - 14 * s, 3 * s, 8 * s)
    ctx.fillRect(px + 6 * s, y - 14 * s, 3 * s, 8 * s)
  } else {
    ctx.fillStyle = bodyColor
    ctx.fillRect(px - 8 * s, y - 2 * s, 3 * s, 6 * s)
    ctx.fillRect(px + 5 * s, y - 2 * s, 3 * s, 6 * s)
  }

  if (state === 'failed') {
    const exY = y - 10 * s
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(px - 4 * s, exY - 2 * s, 2 * s, 1.5 * s)
    ctx.fillRect(px + 2 * s, exY - 2 * s, 2 * s, 1.5 * s)
  }

  ctx.restore()
}

export function drawCharacter(ctx: CanvasRenderingContext2D, char: CharSprite) {
  const color = AGENT_COLORS[char.agentId] ?? '#64748b'
  drawCharBody(ctx, char.x, char.y, color, 1, char.state, char.animFrame, char.shakeX, char.tintFlash)
}

export function drawCoordinator(ctx: CanvasRenderingContext2D, coord: CharSprite) {
  const color = '#fbbf24'
  drawCharBody(ctx, coord.x, coord.y, color, 1.8, coord.state, coord.animFrame, coord.shakeX, coord.tintFlash)

  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.moveTo(coord.x + coord.shakeX, coord.y - 20)
  ctx.lineTo(coord.x + coord.shakeX - 4, coord.y - 17)
  ctx.lineTo(coord.x + coord.shakeX + 4, coord.y - 17)
  ctx.closePath()
  ctx.fill()
}

export function drawNameLabel(ctx: CanvasRenderingContext2D, char: CharSprite) {
  const info = AGENT_LABELS[char.agentId]
  if (!info) return
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  const textW = ctx.measureText(info.label).width
  ctx.fillRect(char.x - textW / 2 - 2, char.y + 14, textW + 4, 10)
  ctx.fillStyle = char.state === 'idle' ? 'rgba(255,255,255,0.4)' : '#fff'
  ctx.font = '8px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(info.label, char.x, char.y + 15)
}

export function drawDust(ctx: CanvasRenderingContext2D, dust: DustMote[]) {
  for (const d of dust) {
    ctx.fillStyle = `rgba(255,255,255,${d.alpha})`
    ctx.fillRect(d.x, d.y, d.size, d.size)
  }
}

export function drawProgressBar(ctx: CanvasRenderingContext2D, progress: number) {
  const barW = 200
  const barH = 6
  const bx = (W - barW) / 2
  const by = H - 20

  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(bx, by, barW, barH)

  const grad = ctx.createLinearGradient(bx, by, bx + barW, by)
  grad.addColorStop(0, '#3b82f6')
  grad.addColorStop(1, '#a855f7')
  ctx.fillStyle = grad
  ctx.fillRect(bx, by, barW * (progress / 100), barH)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`${Math.round(progress)}%`, W / 2, by - 2)
}

export function drawMensaje(ctx: CanvasRenderingContext2D, mensaje: string) {
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '9px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const truncated = mensaje.length > 50 ? mensaje.slice(0, 47) + '...' : mensaje
  ctx.fillText(truncated, W / 2, 18)
}

export function drawDecorations(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#78350f'
  ctx.fillRect(37 * TILE + 4, 0 * TILE + 3, 6, 8)
  ctx.fillStyle = '#92400e'
  ctx.beginPath()
  ctx.arc(37 * TILE + 7, 0 * TILE + 2, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fbbf24'
  ctx.fillRect(37 * TILE + 5, 0 * TILE - 4, 3, 5)

  drawHivePixel(ctx, 2 * TILE, 0 * TILE + 3, 6)
}

function drawHivePixel(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#fbbf2430'
  const h = size * 0.866
  ctx.beginPath()
  ctx.moveTo(x, y - h / 2)
  ctx.lineTo(x + size / 2, y + h / 2)
  ctx.lineTo(x - size / 2, y + h / 2)
  ctx.closePath()
  ctx.fill()
}

export function drawAllDesks(ctx: CanvasRenderingContext2D, state: CanvasState) {
  const statusMap: Record<string, string> = {}
  for (const c of state.chars) {
    statusMap[c.agentId] = c.state === 'running' ? (AGENT_COLORS[c.agentId] ?? '#3b82f6') : undefined!
  }

  for (const d of AGENT_DESKS) {
    drawDesk(ctx, d.deskX, d.deskY, statusMap[d.agentId])
  }

  const coordGlow = state.coordinator.state === 'running' ? '#fbbf24' : undefined
  drawCoordinatorDesk(ctx, coordGlow)
}

/**
 * Dibuja un efecto visual de delegación cuando el coordinador asigna tarea a un worker.
 * Muestra un arco energético que se desvanece.
 */
export function drawDelegationEffect(
  ctx: CanvasRenderingContext2D,
  targetX: number,
  targetY: number,
  progress: number,
  alpha: number,
) {
  ctx.save()
  ctx.globalAlpha = alpha

  // Círculo expansivo
  const radius = 20 + progress * 30
  ctx.strokeStyle = `rgba(251, 191, 36, ${0.8 - progress * 0.8})`
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(targetX, targetY, radius, 0, Math.PI * 2)
  ctx.stroke()

  // Rayos energéticos
  const numRays = 8
  for (let i = 0; i < numRays; i++) {
    const angle = (i / numRays) * Math.PI * 2 + progress * Math.PI
    const innerR = radius * 0.5
    const outerR = radius * 1.2
    const x1 = targetX + Math.cos(angle) * innerR
    const y1 = targetY + Math.sin(angle) * innerR
    const x2 = targetX + Math.cos(angle) * outerR
    const y2 = targetY + Math.sin(angle) * outerR

    ctx.strokeStyle = `rgba(251, 191, 36, ${0.6 - progress * 0.6})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // Símbolo de tarea delegada (pequeño icono pixelado)
  const iconSize = 8
  const iconX = targetX - iconSize / 2
  const iconY = targetY - iconSize / 2
  ctx.fillStyle = `rgba(255, 255, 255, ${0.9 - progress * 0.9})`
  ctx.fillRect(iconX + 2, iconY, iconSize - 4, 2)
  ctx.fillRect(iconX, iconY + 2, 2, iconSize - 4)
  ctx.fillRect(iconX + iconSize - 2, iconY + 2, 2, iconSize - 4)
  ctx.fillRect(iconX + 2, iconY + iconSize - 2, iconSize - 4, 2)

  ctx.restore()
}
