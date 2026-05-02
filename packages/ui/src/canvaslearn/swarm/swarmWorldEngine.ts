import { Application, Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js'

const W = 1000
const H = 700

const C = {
  bg:           0x080c1a,
  panel:        0x0d1427,
  amber:        0xf59e0b,
  amberLight:   0xfbbf24,
  amberDark:    0xd97706,
  purple:       0x8b5cf6,
  purpleLight:  0xa78bfa,
  emerald:      0x10b981,
  red:          0xef4444,
  white:        0xffffff,
  black:        0x000000,
  slate:        0x64748b,
  navy:         0x1e3a5f,
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export interface SwarmWorldEngine {
  destroy(): void
  updateAgent(agentId: string, status: string): void
  setAgents(agents: { id: string; name: string; role: string }[]): void
  createDataStream(x1: number, y1: number, x2: number, y2: number): void
}

// ─── Bee drawing helpers ──────────────────────────────────────────────────────

function drawBeeBody(g: Graphics, scale: number = 1, stripeColor: number = C.black) {
  const s = scale
  g.clear()
  // Abdomen
  g.ellipse(0, 6 * s, 11 * s, 15 * s)
  g.fill({ color: C.amber })
  // Stripes
  g.rect(-11 * s, 0, 22 * s, 4 * s)
  g.fill({ color: stripeColor, alpha: 0.75 })
  g.rect(-10 * s, 7 * s, 20 * s, 4 * s)
  g.fill({ color: stripeColor, alpha: 0.75 })
  g.rect(-9 * s, 14 * s, 18 * s, 4 * s)
  g.fill({ color: stripeColor, alpha: 0.6 })
  // Stinger
  g.moveTo(0, 21 * s)
  g.lineTo(0, 27 * s)
  g.stroke({ color: stripeColor, width: 1.8 * s })
  // Thorax
  g.circle(0, -10 * s, 9 * s)
  g.fill({ color: C.amberDark })
  // Head
  g.circle(0, -22 * s, 8 * s)
  g.fill({ color: C.amber })
  // Eyes
  g.circle(-4 * s, -23 * s, 2.8 * s)
  g.fill({ color: C.black })
  g.circle(4 * s, -23 * s, 2.8 * s)
  g.fill({ color: C.black })
  g.circle(-3.2 * s, -23.5 * s, 1 * s)
  g.fill({ color: 0x88ccff, alpha: 0.8 })
  g.circle(4.8 * s, -23.5 * s, 1 * s)
  g.fill({ color: 0x88ccff, alpha: 0.8 })
  // Antennae
  g.moveTo(-3 * s, -29 * s).lineTo(-8 * s, -40 * s)
  g.stroke({ color: C.black, width: 1.4 * s })
  g.moveTo(3 * s, -29 * s).lineTo(8 * s, -40 * s)
  g.stroke({ color: C.black, width: 1.4 * s })
  g.circle(-8 * s, -41 * s, 2 * s).fill({ color: C.amber })
  g.circle(8 * s, -41 * s, 2 * s).fill({ color: C.amber })
}

function drawWings(c: Container, scale: number = 1) {
  c.removeChildren()
  const s = scale
  const lw = new Graphics()
  lw.ellipse(-18 * s, -14 * s, 14 * s, 8 * s)
  lw.fill({ color: C.white, alpha: 0.35 })
  lw.ellipse(-22 * s, -2 * s, 10 * s, 6 * s)
  lw.fill({ color: C.white, alpha: 0.25 })
  const rw = new Graphics()
  rw.ellipse(18 * s, -14 * s, 14 * s, 8 * s)
  rw.fill({ color: C.white, alpha: 0.35 })
  rw.ellipse(22 * s, -2 * s, 10 * s, 6 * s)
  rw.fill({ color: C.white, alpha: 0.25 })
  c.addChild(lw, rw)
}

// ─── Crown for Queen ─────────────────────────────────────────────────────────

function drawCrown(g: Graphics, s: number = 1) {
  g.clear()
  const pts = [-14 * s, -4 * s, -10 * s, -14 * s, -4 * s, -4 * s, 0, -18 * s, 4 * s, -4 * s, 10 * s, -14 * s, 14 * s, -4 * s]
  g.poly(pts).fill({ color: C.amberLight })
  g.poly(pts).stroke({ color: C.amberDark, width: 1 })
  // Crown gems
  g.circle(-10 * s, -15 * s, 2.5 * s).fill({ color: 0xff6b6b })
  g.circle(0, -19 * s, 2.5 * s).fill({ color: C.purple })
  g.circle(10 * s, -15 * s, 2.5 * s).fill({ color: 0x3b82f6 })
}

// ─── BeeAgent class ───────────────────────────────────────────────────────────

class BeeAgent extends Container {
  public id: string
  public status: string = 'idle'
  public isQueen: boolean
  public homeX: number = 0
  public homeY: number = 0

  private body:      Graphics
  private wings:     Container
  private glow:      Graphics
  private crown:   Graphics | null = null
  private nameLabel: Text
  private t:       number = 0
  private flapT:   number = 0
  private taskT:   number = -1  // mission animation timer
  private missionDir: number = 0  // 1=going out, -1=returning

  constructor(id: string, name: string, queen: boolean) {
    super()
    this.id    = id
    this.isQueen = queen

    const s = queen ? 1.5 : 1

    this.glow = new Graphics()
    this.glow.circle(0, 0, 52 * s)
    this.glow.fill({ color: queen ? C.purple : C.amber, alpha: 0.12 })
    this.addChild(this.glow)

    this.wings = new Container()
    drawWings(this.wings, s)
    this.addChild(this.wings)

    this.body = new Graphics()
    drawBeeBody(this.body, s, queen ? 0x2d1b69 : C.black)
    this.addChild(this.body)

    if (queen) {
      this.crown = new Graphics()
      drawCrown(this.crown, s)
      this.crown.y = -38 * s
      this.addChild(this.crown)
    }

    const shortName = name.replace('Agent', '').replace('hl-', '').trim()
    this.nameLabel = new Text({
      text: queen ? '👑 Reina' : shortName,
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: queen ? 13 : 11,
        fill: queen ? C.amberLight : C.white,
        fontWeight: 'bold',
      }),
    })
    this.nameLabel.anchor.set(0.5, 0)
    this.nameLabel.y = 34 * s
    this.addChild(this.nameLabel)
  }

  updateStatus(status: string) {
    this.status = status
    let glowColor = C.amber
    let glowAlpha = 0.12
    if (status === 'thinking') { glowColor = C.purple;  glowAlpha = 0.25 }
    if (status === 'running')  { glowColor = C.emerald; glowAlpha = 0.28 }
    if (status === 'failed')   { glowColor = C.red;     glowAlpha = 0.3  }
    if (status === 'completed'){ glowColor = C.amberLight; glowAlpha = 0.22 }
    const s = this.isQueen ? 1.5 : 1
    this.glow.clear()
    this.glow.circle(0, 0, 52 * s)
    this.glow.fill({ color: glowColor, alpha: glowAlpha })

    // Trigger mission animation on start
    if (status === 'running' && !this.isQueen) {
      this.taskT = 0
      this.missionDir = 1
    }
    if (status === 'completed' && !this.isQueen) {
      this.missionDir = -1
    }
  }

  tick(dt: number) {
    this.t     += dt
    this.flapT += dt * (this.status === 'running' ? 22 : 14)

    // Wing flap via scaleX oscillation
    const flapAngle = Math.sin(this.flapT) * 0.18
    this.wings.scale.x = 1 + flapAngle

    // Hover
    const hoverAmp = this.isQueen ? 5 : 3.5
    const hoverSpeed = this.isQueen ? 1.4 : 1.8 + (this.id.charCodeAt(0) % 5) * 0.2
    this.y = this.homeY + Math.sin(this.t * hoverSpeed) * hoverAmp

    // Mission animation: lean slightly outward when assigned task
    if (this.taskT >= 0 && this.missionDir === 1) {
      this.taskT += dt * 2
      const lean = Math.sin(Math.min(this.taskT, Math.PI) * 0.5) * 6
      this.x = this.homeX + lean * Math.sign(this.homeX - W / 2 || 1)
      if (this.taskT >= Math.PI) this.taskT = -1
    }

    // Pulse glow for queen when sending
    if (this.isQueen && (this.status === 'running' || this.status === 'thinking')) {
      this.glow.alpha = 0.18 + Math.sin(this.t * 5) * 0.1
    }
  }
}

// ─── initSwarmWorld ───────────────────────────────────────────────────────────

export async function initSwarmWorld(container: HTMLDivElement): Promise<SwarmWorldEngine> {
  const app = new Application()
  await app.init({
    width: W, height: H,
    background: C.bg,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  const canvas = app.canvas as HTMLCanvasElement
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  container.appendChild(canvas)

  const bgLayer     = new Container()
  const labLayer    = new Container()
  const effectsLayer = new Container()
  const beeLayer    = new Container()
  const uiLayer     = new Container()
  app.stage.addChild(bgLayer, labLayer, effectsLayer, beeLayer, uiLayer)

  // ── Background: Honeycomb grid ────────────────────────────────────────────
  const hexGrid = new Graphics()
  const hexR = 32
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 18; col++) {
      const cx = col * hexR * 1.74 + (row % 2) * hexR * 0.87
      const cy = row * hexR * 1.5
      const pts: number[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i
        pts.push(cx + Math.cos(a) * hexR, cy + Math.sin(a) * hexR)
      }
      const dist = Math.hypot(cx - W / 2, cy - H / 2)
      const fillAlpha = dist < 180 ? 0.06 : 0.022
      hexGrid.poly(pts).fill({ color: C.amber, alpha: fillAlpha })
      hexGrid.poly(pts).stroke({ color: C.amber, width: 0.8, alpha: 0.055 })
    }
  }
  bgLayer.addChild(hexGrid)

  // ── Lab panels (floor lines) ──────────────────────────────────────────────
  const labFloor = new Graphics()
  // Bottom bench
  labFloor.rect(0, H - 90, W, 90)
  labFloor.fill({ color: C.panel, alpha: 1 })
  labFloor.rect(0, H - 92, W, 2)
  labFloor.fill({ color: C.amber, alpha: 0.18 })
  // Side panels
  labFloor.rect(0, 0, 70, H)
  labFloor.fill({ color: C.panel, alpha: 0.6 })
  labFloor.rect(W - 70, 0, 70, H)
  labFloor.fill({ color: C.panel, alpha: 0.6 })
  labLayer.addChild(labFloor)

  // ── Lab decorations: beakers + test tubes ─────────────────────────────────
  function drawBeaker(g: Graphics, x: number, y: number, h: number, color: number) {
    g.rect(x - 10, y, 20, h)
    g.fill({ color, alpha: 0.18 })
    g.circle(x, y, 14)
    g.fill({ color, alpha: 0.14 })
    g.rect(x - 10, y, 20, h)
    g.stroke({ color, width: 1, alpha: 0.35 })
    // Liquid level
    g.rect(x - 9, y + h * 0.55, 18, h * 0.42)
    g.fill({ color, alpha: 0.32 })
    // Glow
    g.circle(x, y + h * 0.7, 8)
    g.fill({ color, alpha: 0.12 })
  }
  const decoG = new Graphics()
  drawBeaker(decoG, 28, H - 88, 45, C.amber)
  drawBeaker(decoG, 44, H - 78, 35, C.emerald)
  drawBeaker(decoG, W - 28, H - 88, 45, C.purple)
  drawBeaker(decoG, W - 44, H - 78, 35, C.amberLight)
  // Small test tube racks
  for (let i = 0; i < 5; i++) {
    const tx = 18 + i * 8
    decoG.rect(tx, H - 72 - i * 4, 4, 22 + i * 4)
    decoG.fill({ color: C.amber, alpha: 0.18 })
  }
  labLayer.addChild(decoG)

  // ── Central queen platform ────────────────────────────────────────────────
  const queenPlatform = new Graphics()
  queenPlatform.circle(W / 2, H / 2, 80)
  queenPlatform.fill({ color: C.amber, alpha: 0.05 })
  queenPlatform.circle(W / 2, H / 2, 80)
  queenPlatform.stroke({ color: C.amber, width: 1.5, alpha: 0.22 })
  queenPlatform.circle(W / 2, H / 2, 60)
  queenPlatform.stroke({ color: C.amberLight, width: 0.8, alpha: 0.15 })
  labLayer.addChild(queenPlatform)

  // ── Title label ───────────────────────────────────────────────────────────
  const titleLabel = new Text({
    text: 'LABORATORIO DE LA COLMENA',
    style: new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 11,
      fill: C.amber,
      fontWeight: '900',
      letterSpacing: 4,
      alpha: 0.45,
    }),
  })
  titleLabel.anchor.set(0.5, 0)
  titleLabel.x = W / 2
  titleLabel.y = 14
  uiLayer.addChild(titleLabel)

  // ── Floating pollen particles ─────────────────────────────────────────────
  type Pollen = { g: Graphics; vx: number; vy: number; ph: number }
  const pollens: Pollen[] = []
  for (let i = 0; i < 30; i++) {
    const p = new Graphics()
    p.circle(0, 0, rnd(1, 2.2))
    p.fill({ color: C.amberLight, alpha: rnd(0.15, 0.4) })
    p.x = rnd(70, W - 70)
    p.y = rnd(30, H - 100)
    bgLayer.addChild(p)
    pollens.push({ g: p, vx: rnd(-6, 6), vy: rnd(-10, -18), ph: rnd(0, Math.PI * 2) })
  }

  let bees: Map<string, BeeAgent> = new Map()
  let queen: BeeAgent | null = null
  let globalTime = 0

  const loop = (ticker: Ticker) => {
    const dt = ticker.deltaTime / 60
    globalTime += dt

    hexGrid.alpha = 0.7 + Math.sin(globalTime * 0.4) * 0.2

    pollens.forEach(p => {
      p.g.x += (p.vx * 0.4 + Math.sin(globalTime * 0.5 + p.ph) * 4) * dt
      p.g.y += p.vy * dt * 0.3
      p.g.alpha = 0.2 + Math.sin(globalTime + p.ph) * 0.12
      if (p.g.y < 20) { p.g.y = H - 110; p.g.x = rnd(70, W - 70) }
      if (p.g.x < 60) p.g.x = W - 80
      if (p.g.x > W - 60) p.g.x = 80
    })

    bees.forEach(b => b.tick(dt))
    if (queen) queen.tick(dt)
  }

  app.ticker.add(loop)

  return {
    destroy() {
      app.ticker.remove(loop)
      app.destroy(true, { children: true, texture: true })
    },

    setAgents(agents) {
      beeLayer.removeChildren()
      bees.clear()
      queen = null

      const coordData = agents.find(a => a.role === 'coordinator')
      const workersData = agents.filter(a => a.role !== 'coordinator')

      // Place queen at center
      if (coordData) {
        queen = new BeeAgent(coordData.id, coordData.name, true)
        queen.homeX = W / 2
        queen.homeY = H / 2
        queen.x = queen.homeX
        queen.y = queen.homeY
        beeLayer.addChild(queen)
      }

      // Place worker bees in ring
      const radius = 260
      workersData.forEach((a, i) => {
        const angle = (i / workersData.length) * Math.PI * 2 - Math.PI / 2
        const bee = new BeeAgent(a.id, a.name, false)
        bee.homeX = W / 2 + Math.cos(angle) * radius
        bee.homeY = H / 2 + Math.sin(angle) * radius
        bee.x = bee.homeX
        bee.y = bee.homeY
        beeLayer.addChild(bee)
        bees.set(a.id, bee)
      })
    },

    updateAgent(agentId, status) {
      if (queen?.id === agentId) {
        queen.updateStatus(status)
      } else {
        const bee = bees.get(agentId)
        if (bee) {
          const wasIdle = bee.status === 'idle' || bee.status === 'completed'
          bee.updateStatus(status)
          // Trigger data stream when assigned
          if ((status === 'thinking' || status === 'running') && wasIdle && queen) {
            this.createDataStream(queen.x, queen.homeY, bee.homeX, bee.homeY)
          }
          // Return stream when completed
          if (status === 'completed' && queen) {
            setTimeout(() => {
              this.createDataStream(bee.homeX, bee.homeY, queen!.x, queen!.homeY)
            }, 350)
          }
        }
      }
    },

    createDataStream(x1: number, y1: number, x2: number, y2: number) {
      const arc = new Graphics()
      effectsLayer.addChild(arc)

      // Pollen particles travelling along the arc
      const particles: { x: number; y: number; g: Graphics }[] = []
      for (let i = 0; i < 4; i++) {
        const pg = new Graphics()
        pg.circle(0, 0, 2.5)
        pg.fill({ color: C.amberLight, alpha: 0.9 })
        effectsLayer.addChild(pg)
        particles.push({ x: 0, y: 0, g: pg })
      }

      let t = 0
      const isReturn = x2 < x1  // heuristic: return arcs go toward center
      const curveDrop = isReturn ? 60 : -55

      const arcTicker = (ticker: Ticker) => {
        t += ticker.deltaTime / 60 * 1.8
        arc.clear()

        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2 + curveDrop
        const alpha = Math.max(0, 1 - t * 1.2)

        arc.moveTo(x1, y1)
        arc.quadraticCurveTo(midX, midY, x2, y2)
        arc.stroke({
          color: isReturn ? C.amberLight : C.emerald,
          width: 2.5,
          alpha: alpha * 0.7,
        })

        // Animate particles along bezier
        particles.forEach((p, pi) => {
          const pt = Math.min(1, (t * 1.4 - pi * 0.18))
          if (pt < 0) { p.g.visible = false; return }
          p.g.visible = true
          const bx = (1 - pt) * (1 - pt) * x1 + 2 * (1 - pt) * pt * midX + pt * pt * x2
          const by = (1 - pt) * (1 - pt) * y1 + 2 * (1 - pt) * pt * midY + pt * pt * y2
          p.g.x = bx
          p.g.y = by
          p.g.alpha = Math.max(0, 1 - pt * 1.2)
        })

        if (t >= 1) {
          app.ticker.remove(arcTicker)
          effectsLayer.removeChild(arc)
          arc.destroy()
          particles.forEach(p => { effectsLayer.removeChild(p.g); p.g.destroy() })
        }
      }
      app.ticker.add(arcTicker)
    },
  }
}
