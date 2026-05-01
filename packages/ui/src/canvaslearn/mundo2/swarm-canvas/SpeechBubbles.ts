import { W } from './constants'
import type { Bubble, CharSprite } from './types'
import { AGENT_LABELS } from './constants'

export function drawBubbles(ctx: CanvasRenderingContext2D, bubbles: Bubble[], chars: CharSprite[]) {
  for (const b of bubbles) {
    const ch = chars.find(c => c.agentId === b.agentId)
    if (!ch) continue

    ctx.save()
    ctx.globalAlpha = b.alpha

    const info = AGENT_LABELS[b.agentId]
    const displayName = info?.label ?? b.agentId
    const text = b.text
    ctx.font = '8px monospace'
    const textW = Math.max(ctx.measureText(text).width, ctx.measureText(displayName).width) + 10

    const bx = ch.x - textW / 2
    const by = ch.y - 32

    ctx.fillStyle = 'rgba(10,15,30,0.9)'
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    roundRect(ctx, bx, by, textW, 18, 3)
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(ch.x - 3, by + 18)
    ctx.lineTo(ch.x, by + 22)
    ctx.lineTo(ch.x + 3, by + 18)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = 'bold 7px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(displayName, ch.x, by + 2)

    ctx.fillStyle = '#fff'
    ctx.font = '8px monospace'
    ctx.fillText(text, ch.x, by + 10)

    ctx.restore()
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
