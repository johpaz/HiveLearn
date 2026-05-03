import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { IsometricRenderer } from '../renderer/IsometricRenderer'
import type { RioCamera } from '../camera/RioCamera'
import type { AgentStatus } from '@hivelearn/core'
import type { Tributary } from '../types'

const AGENT_COLORS: Record<string, number> = {
  'hl-coordinator-agent': 0xFFD700,
  'hl-profile-agent': 0xFF6B6B,
  'hl-intent-agent': 0xFFA07A,
  'hl-structure-agent': 0x87CEEB,
  'hl-explanation-agent': 0x98FB98,
  'hl-exercise-agent': 0xDDA0DD,
  'hl-quiz-agent': 0xFFB347,
  'hl-challenge-agent': 0xFF6347,
  'hl-code-agent': 0x00CED1,
  'hl-svg-agent': 0x9370DB,
  'hl-gif-agent': 0xFF69B4,
  'hl-infographic-agent': 0x20B2AA,
  'hl-image-agent': 0xFF8C00,
  'hl-audio-agent': 0x6495ED,
  'hl-gamification-agent': 0xFFD700,
  'hl-evaluation-agent': 0xDC143C,
  'hl-feedback-agent': 0x32CD32,
  'hl-monitor-agent': 0x708090,
  'hl-vision-pedagogica-agent': 0xDA70D6,
}

const AGENT_NAMES: Record<string, string> = {
  'hl-coordinator-agent': 'Coordinador',
  'hl-profile-agent': 'Perfil',
  'hl-intent-agent': 'Intencion',
  'hl-structure-agent': 'Estructura',
  'hl-explanation-agent': 'Explicacion',
  'hl-exercise-agent': 'Ejercicio',
  'hl-quiz-agent': 'Quiz',
  'hl-challenge-agent': 'Desafio',
  'hl-code-agent': 'Codigo',
  'hl-svg-agent': 'SVG',
  'hl-gif-agent': 'GIF',
  'hl-infographic-agent': 'Infografia',
  'hl-image-agent': 'Imagen',
  'hl-audio-agent': 'Audio',
  'hl-gamification-agent': 'Juego',
  'hl-evaluation-agent': 'Evaluacion',
  'hl-feedback-agent': 'Feedback',
  'hl-monitor-agent': 'Monitor',
  'hl-vision-pedagogica-agent': 'Vision',
}

interface SwarmBee {
  agentId: string
  container: Container
  body: Graphics
  wings: Graphics
  glow: Graphics
  label: Text
  statusGraphic: Graphics
  status: AgentStatus
  homeX: number
  homeY: number
  phase: number
  visible: boolean
}

const STATUS_VISUAL: Record<AgentStatus, { color: number; alpha: number; visible: boolean }> = {
  idle: { color: 0x555555, alpha: 0.3, visible: true },
  pending: { color: 0xfbbf24, alpha: 0.5, visible: true },
  running: { color: 0xFFC107, alpha: 0.9, visible: true },
  thinking: { color: 0x87CEEB, alpha: 0.8, visible: true },
  tool_call: { color: 0xFF8C00, alpha: 0.9, visible: true },
  completed: { color: 0x4CAF50, alpha: 0.7, visible: true },
  failed: { color: 0xEF4444, alpha: 0.6, visible: true },
}

export class RioSwarmBees {
  private app: Application
  private renderer: IsometricRenderer
  private camera: RioCamera
  private rootContainer: Container
  private bees: Map<string, SwarmBee> = new Map()
  private destroyed: boolean = false

  constructor(app: Application, renderer: IsometricRenderer, camera: RioCamera) {
    this.app = app
    this.renderer = renderer
    this.camera = camera

    this.rootContainer = new Container()
    this.rootContainer.zIndex = 1500
    this.rootContainer.sortableChildren = true

    renderer.getEntityContainer().addChild(this.rootContainer)
  }

  initialize(tributaries: Tributary[]) {
    const agentIds = Object.keys(AGENT_COLORS)

    const coordinatorPos = { x: 20, y: 37 }
    this.createBee('hl-coordinator-agent', coordinatorPos.x, coordinatorPos.y)

    const workerIds = agentIds.filter(id => id !== 'hl-coordinator-agent')
    const beesPerZone = Math.ceil((workerIds.length) / Math.max(1, tributaries.length))

    for (let i = 0; i < workerIds.length; i++) {
      const agentId = workerIds[i]
      const zoneIdx = Math.min(Math.floor(i / beesPerZone), tributaries.length - 1)
      const tributary = tributaries[zoneIdx]

      if (tributary && tributary.portalPos) {
        const offsetAngle = (i % beesPerZone) * (Math.PI * 2 / beesPerZone)
        const offsetRadius = 1.5 + (i % beesPerZone) * 0.5
        const homeX = tributary.portalPos.x + Math.cos(offsetAngle) * offsetRadius
        const homeY = tributary.portalPos.y + Math.sin(offsetAngle) * offsetRadius

        this.createBee(agentId, homeX, homeY)
      } else {
        const fallbackX = 5 + (i % 8) * 4
        const fallbackY = 5 + Math.floor(i / 8) * 4
        this.createBee(agentId, fallbackX, fallbackY)
      }
    }
  }

  private createBee(agentId: string, homeX: number, homeY: number) {
    const container = new Container()
    const screenPos = this.renderer.isoToScreen(homeX, homeY)
    container.x = screenPos.x
    container.y = screenPos.y

    const beeColor = AGENT_COLORS[agentId] || 0xFFC107

    const glow = new Graphics()
    glow.circle(0, 0, 14)
    glow.fill({ color: beeColor, alpha: 0.08 })
    container.addChild(glow)

    const wings = new Graphics()
    container.addChild(wings)

    const body = new Graphics()
    this.drawMiniBee(body, beeColor)
    container.addChild(body)

    const statusGraphic = new Graphics()
    statusGraphic.y = 18
    container.addChild(statusGraphic)

    const name = AGENT_NAMES[agentId] || agentId.split('-')[1] || '?'
    const labelStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 8,
      fill: 0xAAAAAA,
      align: 'center',
    })
    const label = new Text({ text: name, style: labelStyle })
    label.anchor.set(0.5)
    label.y = 24
    container.addChild(label)

    const bee: SwarmBee = {
      agentId,
      container,
      body,
      wings,
      glow,
      label,
      statusGraphic,
      status: 'idle',
      homeX,
      homeY,
      phase: Math.random() * Math.PI * 2,
      visible: true,
    }

    this.bees.set(agentId, bee)
    this.rootContainer.addChild(container)
    this.updateBeeVisual(bee)
  }

  private drawMiniBee(body: Graphics, color: number) {
    body.ellipse(0, 1, 4, 5).fill(color)
    for (let i = -1; i <= 1; i += 2) {
      body.rect(-4, i, 8, 1.5).fill(0x1a1a2e)
    }
    body.circle(0, -5, 3).fill(color)
    body.circle(0, -9, 2.5).fill(0x1a1a2e)
    body.circle(-1.5, -10, 1).fill(0xffffff)
    body.circle(1.5, -10, 1).fill(0xffffff)
  }

  updateAgentStatus(agentId: string, status: AgentStatus) {
    const bee = this.bees.get(agentId)
    if (!bee) return
    bee.status = status
    this.updateBeeVisual(bee)
  }

  private updateBeeVisual(bee: SwarmBee) {
    const visual = STATUS_VISUAL[bee.status]
    bee.container.alpha = visual.alpha
    bee.visible = visual.visible

    bee.statusGraphic.clear()
    switch (bee.status) {
      case 'running':
        bee.statusGraphic.circle(0, 0, 3).fill(0xFFC107)
        break
      case 'thinking':
        bee.statusGraphic.circle(0, 0, 4).fill({ color: 0x87CEEB, alpha: 0.6 })
        bee.statusGraphic.circle(0, 0, 2).fill(0x87CEEB)
        break
      case 'tool_call':
        bee.statusGraphic.roundRect(-3, -3, 6, 6, 1).fill(0xFF8C00)
        break
      case 'completed':
        bee.statusGraphic.moveTo(-3, 0).lineTo(-1, 2).lineTo(3, -2).stroke({ width: 1.5, color: 0x4CAF50 })
        break
      case 'failed':
        bee.statusGraphic.moveTo(-2, -2).lineTo(2, 2).stroke({ width: 1.5, color: 0xEF4444 })
        bee.statusGraphic.moveTo(2, -2).lineTo(-2, 2).stroke({ width: 1.5, color: 0xEF4444 })
        break
      case 'pending':
        bee.statusGraphic.circle(0, 0, 2).fill(0xfbbf24)
        break
      default:
        break
    }

    const beeColor = AGENT_COLORS[bee.agentId] || 0xFFC107
    if (bee.status === 'completed') {
      bee.glow.clear()
      bee.glow.circle(0, 0, 14)
      bee.glow.fill({ color: 0x4CAF50, alpha: 0.1 })
    } else if (bee.status === 'running' || bee.status === 'thinking' || bee.status === 'tool_call') {
      bee.glow.clear()
      bee.glow.circle(0, 0, 14)
      bee.glow.fill({ color: beeColor, alpha: 0.12 })
    }
  }

  update(time: number) {
    if (this.destroyed) return

    for (const bee of this.bees.values()) {
      if (!bee.visible) continue

      bee.phase += 0.02
      const bobOffset = Math.sin(bee.phase + time * 0.002) * 3
      const screenPos = this.renderer.isoToScreen(bee.homeX, bee.homeY)
      bee.container.x = screenPos.x
      bee.container.y = screenPos.y + bobOffset

      bee.container.zIndex = bee.homeY

      const wingOffset = Math.sin(time / 40 + bee.phase) * 4
      bee.wings.clear()
      if (bee.status === 'running' || bee.status === 'thinking' || bee.status === 'tool_call') {
        bee.wings.moveTo(-3, -4)
        bee.wings.bezierCurveTo(-10, -8 + wingOffset * 0.3, -12, -1 + wingOffset * 0.3, -5, -3)
        bee.wings.fill({ color: 0xE3F2FD, alpha: 0.4 })
        bee.wings.moveTo(3, -4)
        bee.wings.bezierCurveTo(10, -8 + wingOffset * 0.3, 12, -1 + wingOffset * 0.3, 5, -3)
        bee.wings.fill({ color: 0xE3F2FD, alpha: 0.4 })
      } else if (bee.status === 'completed') {
        bee.wings.moveTo(-3, -3)
        bee.wings.lineTo(-7, -6)
        bee.wings.lineTo(-5, -2)
        bee.wings.fill({ color: 0xE3F2FD, alpha: 0.2 })
        bee.wings.moveTo(3, -3)
        bee.wings.lineTo(7, -6)
        bee.wings.lineTo(5, -2)
        bee.wings.fill({ color: 0xE3F2FD, alpha: 0.2 })
      }

      if (bee.status === 'pending') {
        bee.glow.alpha = 0.05 + Math.sin(time / 400) * 0.04
      } else if (bee.status === 'running' || bee.status === 'thinking') {
        bee.glow.alpha = 0.08 + Math.sin(time / 300) * 0.04
      }
    }
  }

  getBeePosition(agentId: string): { x: number; y: number } | null {
    const bee = this.bees.get(agentId)
    if (!bee) return null
    return { x: bee.homeX, y: bee.homeY }
  }

  destroy() {
    this.destroyed = true
    for (const bee of this.bees.values()) {
      bee.container.destroy({ children: true })
    }
    this.bees.clear()
    this.rootContainer.destroy()
  }
}
