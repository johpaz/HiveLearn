import { Application, Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js'

const W = 1000
const H = 700

const COLORS = {
  bg: 0x0a0e27,
  accent: 0xf59e0b, // Hive Amber
  accentLight: 0xfbbf24,
  accentDark: 0xd97706,
  coordinator: 0x8b5cf6, // Purple for coordinator
  worker: 0x10b981, // Emerald for workers
  thinking: 0xa855f7,
  running: 0x22c55e,
  idle: 0x64748b,
  failed: 0xef4444,
}

interface RobotState {
  id: string
  status: 'idle' | 'running' | 'thinking' | 'completed' | 'failed'
  label: string
}

export interface SwarmWorldEngine {
  destroy(): void
  updateAgent(agentId: string, status: string): void
  setAgents(agents: { id: string; name: string; role: string }[]): void
  createDataStream(x1: number, y1: number, x2: number, y2: number): void
}

class Robot extends Container {
  public id: string
  public status: string = 'idle'
  private body: Graphics
  private labelText: Text
  private statusGlow: Graphics
  private time: number = 0

  constructor(id: string, name: string, color: number) {
    super()
    this.id = id

    // Status Glow
    this.statusGlow = new Graphics()
    this.statusGlow.circle(0, 0, 40)
    this.statusGlow.fill({ color, alpha: 0.2 })
    this.addChild(this.statusGlow)

    // Body
    this.body = new Graphics()
    this.drawBody(color)
    this.addChild(this.body)

    // Label
    this.labelText = new Text({
      text: name,
      style: new TextStyle({
        fontFamily: 'Inter, sans-serif',
        fontSize: 12,
        fill: 0xffffff,
        fontWeight: 'bold',
      })
    })
    this.labelText.anchor.set(0.5, 2.5)
    this.addChild(this.labelText)
  }

  private drawBody(color: number) {
    this.body.clear()
    
    // Antennas
    this.body.moveTo(-8, -20).lineTo(-12, -30).stroke({ color: 0xffffff, width: 1.5, alpha: 0.5 })
    this.body.moveTo(8, -20).lineTo(12, -30).stroke({ color: 0xffffff, width: 1.5, alpha: 0.5 })
    this.body.circle(-12, -30, 2).fill({ color })
    this.body.circle(12, -30, 2).fill({ color })

    // Body
    this.body.roundRect(-22, -22, 44, 44, 10)
    this.body.fill({ color: 0x111827, alpha: 0.9 })
    this.body.stroke({ color, width: 2, alpha: 0.6 })
    
    // Eyes with glow
    const eyeColor = this.status === 'thinking' ? COLORS.thinking : (this.status === 'running' ? COLORS.running : 0x00ffff)
    this.body.circle(-8, -5, 4).fill({ color: eyeColor, alpha: 0.8 })
    this.body.circle(8, -5, 4).fill({ color: eyeColor, alpha: 0.8 })
    this.body.circle(-8, -5, 2).fill({ color: 0xffffff })
    this.body.circle(8, -5, 2).fill({ color: 0xffffff })
  }

  public updateStatus(status: string) {
    this.status = status
    let color = COLORS.idle
    if (status === 'thinking') color = COLORS.thinking
    if (status === 'running') color = COLORS.running
    if (status === 'failed') color = COLORS.failed
    if (status === 'completed') color = COLORS.running

    this.drawBody(color) // Redraw with new eye color

    this.statusGlow.clear()
    this.statusGlow.circle(0, 0, 50)
    this.statusGlow.fill({ color, alpha: 0.15 })
  }

  public tick(dt: number) {
    this.time += dt
    this.y += Math.sin(this.time * 2) * 0.4
    this.x += Math.cos(this.time * 1.5) * 0.2
    
    if (this.status === 'thinking' || this.status === 'running') {
      this.statusGlow.alpha = 0.3 + Math.sin(this.time * 8) * 0.2
      this.scale.set(1 + Math.sin(this.time * 12) * 0.015)
    } else {
      this.statusGlow.alpha = 0.1
      this.scale.set(1)
    }
  }
}

export async function initSwarmWorld(
  container: HTMLDivElement
): Promise<SwarmWorldEngine> {
  const app = new Application()
  await app.init({
    width: W,
    height: H,
    background: COLORS.bg,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  container.appendChild(app.canvas as HTMLCanvasElement)

  const bgLayer = new Container()
  const robotsLayer = new Container()
  const effectsLayer = new Container()
  app.stage.addChild(bgLayer, effectsLayer, robotsLayer)

  // Premium Background: Hex Grid + Stars
  const hexGrid = new Graphics()
  const hexR = 30
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 20; col++) {
      const cx = col * hexR * 1.8 + (row % 2) * hexR * 0.9
      const cy = row * hexR * 1.56
      const pts: number[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        pts.push(cx + Math.cos(a) * hexR, cy + Math.sin(a) * hexR)
      }
      hexGrid.poly(pts).stroke({ color: COLORS.accent, width: 1, alpha: 0.05 })
    }
  }
  bgLayer.addChild(hexGrid)

  let robots: Map<string, Robot> = new Map()
  let coordinator: Robot | null = null
  let time = 0

  const gameLoop = (ticker: Ticker) => {
    const dt = ticker.deltaTime / 60
    time += dt
    hexGrid.alpha = 0.5 + Math.sin(time * 0.5) * 0.2
    robots.forEach(r => r.tick(dt))
    if (coordinator) coordinator.tick(dt)
  }

  app.ticker.add(gameLoop)

  return {
    destroy() {
      app.ticker.remove(gameLoop)
      app.destroy(true, { children: true, texture: true })
    },
    setAgents(agents) {
      robotsLayer.removeChildren()
      robots.clear()

      const coordData = agents.find(a => a.role === 'coordinator')
      const workersData = agents.filter(a => a.role !== 'coordinator')

      if (coordData) {
        coordinator = new Robot(coordData.id, "Coordinador Enjambre", COLORS.coordinator)
        coordinator.x = W / 2
        coordinator.y = H / 2 - 20
        robotsLayer.addChild(coordinator)
      }

      const radius = 280
      workersData.forEach((a, i) => {
        const angle = (i / workersData.length) * Math.PI * 2
        const robot = new Robot(a.id, a.name, COLORS.worker)
        robot.x = W / 2 + Math.cos(angle) * radius
        robot.y = H / 2 + Math.sin(angle) * radius - 20
        robotsLayer.addChild(robot)
        robots.set(a.id, robot)
      })
    },
    updateAgent(agentId, status) {
      if (coordinator?.id === agentId) {
        coordinator.updateStatus(status)
      } else {
        const robot = robots.get(agentId)
        if (robot) {
          const oldStatus = robot.status
          robot.updateStatus(status)
          
          // Trigger energy arc when agent starts thinking
          if (status === 'thinking' && oldStatus !== 'thinking' && coordinator) {
            this.createDataStream(coordinator.x, coordinator.y, robot.x, robot.y)
          }
        }
      }
    },
    createDataStream(x1: number, y1: number, x2: number, y2: number) {
      const arc = new Graphics()
      effectsLayer.addChild(arc)
      
      let t = 0
      const arcTicker = (ticker: Ticker) => {
        t += ticker.deltaTime / 60
        arc.clear()
        
        // Animated curve
        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2 - 50
        
        arc.moveTo(x1, y1)
        arc.quadraticCurveTo(midX, midY, x2, y2)
        arc.stroke({ color: COLORS.accentLight, width: 3, alpha: (1 - t * 1.5) * 0.8 })
        
        if (t >= 0.7) {
          app.ticker.remove(arcTicker)
          effectsLayer.removeChild(arc)
          arc.destroy()
        }
      }
      app.ticker.add(arcTicker)
    }
  }
}
