import { COORDINATOR_CHAR_X, COORDINATOR_CHAR_Y, W } from './constants'
import type { CanvasState } from './types'

const HEART_S = 7

export function drawGamification(ctx: CanvasRenderingContext2D, state: CanvasState) {
  const coord = state.coordinator
  const baseX = coord.x - 10
  const baseY = coord.y - 28

  drawHearts(ctx, baseX, baseY - 10, state.vidas)
  drawXpBar(ctx, coord.x - 16, coord.y + 16, 32, 3, state.porcentajeNivel, state.xpTotal, state.nivelActual)
  drawFlame(ctx, coord.x, baseY - 24, state.racha)
}

function drawHearts(ctx: CanvasRenderingContext2D, x: number, y: number, vidas: number) {
  for (let i = 0; i < 3; i++) {
    const hx = x + i * (HEART_S + 2)
    const hy = y + Math.sin(Date.now() * 0.003 + i) * 2
    if (i < vidas) {
      drawPixelHeart(ctx, hx, hy, '#ef4444')
    } else {
      drawPixelHeart(ctx, hx, hy, '#334155')
    }
  }
}

function drawPixelHeart(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color
  const p = 1
  ctx.fillRect(x + p, y, p, p)
  ctx.fillRect(x + 3 * p, y, p, p)
  ctx.fillRect(x, y + p, 3 * p, p)
  ctx.fillRect(x + 2 * p, y + p, 3 * p, p)
  ctx.fillRect(x, y + 2 * p, 5 * p, p)
  ctx.fillRect(x + p, y + 3 * p, 3 * p, p)
  ctx.fillRect(x + 2 * p, y + 4 * p, p, p)
}

function drawXpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, xp: number, nivel: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(x, y, w, h)

  const grad = ctx.createLinearGradient(x, y, x + w, y)
  grad.addColorStop(0, '#92400e')
  grad.addColorStop(1, '#fbbf24')
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w * (pct / 100), h)

  ctx.fillStyle = 'rgba(251,191,36,0.7)'
  ctx.font = '7px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(nivel, x + w / 2, y - 1)
}

function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, racha: number) {
  if (racha < 2) return

  const t = Date.now() * 0.005
  const intensity = Math.min(racha / 5, 1.6)

  ctx.save()
  ctx.globalAlpha = 0.8

  const flameH = 6 + intensity * 6
  for (let i = 0; i < 3; i++) {
    const ox = Math.sin(t + i * 2) * (1 + intensity)
    const oy = -i * (flameH / 3)
    const s = (3 - i) * (1 + intensity * 0.3)

    ctx.fillStyle = i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#fbbf24'
    ctx.fillRect(x - s / 2 + ox, y + oy, s, flameH / 3)
  }

  ctx.restore()

  ctx.fillStyle = '#fbbf24'
  ctx.font = 'bold 7px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`${racha}🔥`, x, y - flameH - 2)
}
