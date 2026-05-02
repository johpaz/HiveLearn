import { Application, Container, Graphics, Text, TextStyle, Ticker } from 'pixi.js'

const C = {
  bg:          0x080c1a,
  panel:       0x0d1427,
  amber:       0xf59e0b,
  amberLight:  0xfbbf24,
  amberDark:   0xd97706,
  purple:      0x8b5cf6,
  emerald:     0x10b981,
  red:         0xef4444,
  white:       0xffffff,
  black:       0x000000,
  slate:       0x64748b,
  gold:        0xffd700,
}

const rnd  = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ─── Bezier ───────────────────────────────────────────────────────────────────

function bezierPt(
  t: number,
  p0: [number, number], p1: [number, number],
  p2: [number, number], p3: [number, number],
): [number, number] {
  const u = 1 - t
  return [
    u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
    u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
  ]
}

function bezierTan(
  t: number,
  p0: [number, number], p1: [number, number],
  p2: [number, number], p3: [number, number],
): [number, number] {
  const u = 1 - t
  return [
    3*(u*u*(p1[0]-p0[0]) + 2*u*t*(p2[0]-p1[0]) + t*t*(p3[0]-p2[0])),
    3*(u*u*(p1[1]-p0[1]) + 2*u*t*(p2[1]-p1[1]) + t*t*(p3[1]-p2[1])),
  ]
}

function curveCtrl(
  p0: [number, number], p3: [number, number], side: number,
): [[number, number], [number, number]] {
  const dx = p3[0] - p0[0]
  const dy = p3[1] - p0[1]
  const len = Math.hypot(dx, dy) || 1
  const perp: [number, number] = [-dy / len, dx / len]
  const off = clamp(len * 0.32, 55, 130) * side
  return [
    [p0[0] + dx * 0.25 + perp[0] * off, p0[1] + dy * 0.25 + perp[1] * off],
    [p0[0] + dx * 0.75 + perp[0] * off, p0[1] + dy * 0.75 + perp[1] * off],
  ]
}

// ─── Web Audio ────────────────────────────────────────────────────────────────

let _actx: AudioContext | null = null
function getACtx(): AudioContext {
  if (!_actx) _actx = new AudioContext()
  return _actx
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  try {
    const ctx = getACtx()
    const osc = ctx.createOscillator()
    const g   = ctx.createGain()
    osc.connect(g); g.connect(ctx.destination)
    osc.type = type; osc.frequency.value = freq
    const t0 = ctx.currentTime + delay
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    osc.start(t0); osc.stop(t0 + dur + 0.04)
  } catch (_) {}
}

function sfxAssign()  { tone(330, 0.11, 'sine', 0.12); tone(440, 0.1, 'sine', 0.12, 0.08) }
function sfxFly()     { tone(180, 0.07, 'sawtooth', 0.055) }
function sfxComplete(){ tone(523, 0.09, 'sine', 0.14); tone(659, 0.09, 'sine', 0.14, 0.09); tone(784, 0.18, 'sine', 0.14, 0.18) }
function sfxFail()    { tone(330, 0.12, 'sine', 0.1); tone(220, 0.24, 'sine', 0.1, 0.1) }
function sfxDeliver() { tone(880, 0.06, 'triangle', 0.15); tone(1046, 0.2, 'sine', 0.15, 0.06) }

// ─── Bee drawing ──────────────────────────────────────────────────────────────

function drawBody(g: Graphics, s: number, stripe: number) {
  g.clear()
  g.ellipse(0, 6*s, 11*s, 15*s).fill({ color: C.amber })
  g.rect(-11*s, 0, 22*s, 4*s).fill({ color: stripe, alpha: 0.75 })
  g.rect(-10*s, 7*s, 20*s, 4*s).fill({ color: stripe, alpha: 0.75 })
  g.rect(-9*s, 14*s, 18*s, 4*s).fill({ color: stripe, alpha: 0.6 })
  g.moveTo(0, 21*s).lineTo(0, 27*s).stroke({ color: stripe, width: 1.8*s })
  g.circle(0, -10*s, 9*s).fill({ color: C.amberDark })
  g.circle(0, -22*s, 8*s).fill({ color: C.amber })
  g.circle(-4*s, -23*s, 2.8*s).fill({ color: C.black })
  g.circle(4*s,  -23*s, 2.8*s).fill({ color: C.black })
  g.circle(-3.2*s, -23.5*s, 1*s).fill({ color: 0x88ccff, alpha: 0.8 })
  g.circle(4.8*s,  -23.5*s, 1*s).fill({ color: 0x88ccff, alpha: 0.8 })
  g.moveTo(-3*s, -29*s).lineTo(-8*s, -40*s).stroke({ color: stripe, width: 1.4*s })
  g.moveTo(3*s,  -29*s).lineTo(8*s,  -40*s).stroke({ color: stripe, width: 1.4*s })
  g.circle(-8*s, -41*s, 2*s).fill({ color: C.amber })
  g.circle(8*s,  -41*s, 2*s).fill({ color: C.amber })
}

function makeWings(s: number): Container {
  const c = new Container()
  const g = new Graphics()
  g.ellipse(-18*s, -14*s, 14*s, 8*s).fill({ color: C.white, alpha: 0.35 })
  g.ellipse(-22*s,  -2*s, 10*s, 6*s).fill({ color: C.white, alpha: 0.25 })
  g.ellipse(18*s,  -14*s, 14*s, 8*s).fill({ color: C.white, alpha: 0.35 })
  g.ellipse(22*s,   -2*s, 10*s, 6*s).fill({ color: C.white, alpha: 0.25 })
  c.addChild(g)
  return c
}

function drawCrown(g: Graphics, s: number) {
  g.clear()
  const pts = [-14*s,-4*s, -10*s,-14*s, -4*s,-4*s, 0,-18*s, 4*s,-4*s, 10*s,-14*s, 14*s,-4*s]
  g.poly(pts).fill({ color: C.amberLight })
  g.poly(pts).stroke({ color: C.amberDark, width: 1 })
  g.circle(-10*s, -15*s, 2.5*s).fill({ color: 0xff6b6b })
  g.circle(0,     -19*s, 2.5*s).fill({ color: C.purple })
  g.circle(10*s,  -15*s, 2.5*s).fill({ color: 0x3b82f6 })
}

// ─── Bee state machine ────────────────────────────────────────────────────────

type BeeState = 'idle'|'flying_out'|'receiving'|'flying_work'|'working'|'flying_back'|'delivering'|'done'|'failed'

interface Flight {
  p0: [number,number]; p1: [number,number]; p2: [number,number]; p3: [number,number]
  t: number; dur: number; onDone: () => void
}

class BeeAgent extends Container {
  public id:      string
  public isQueen: boolean
  public homeX = 0; public homeY = 0
  public queenX = 0; public queenY = 0
  public beeState: BeeState = 'idle'

  private body:   Graphics
  private wings:  Container
  private glow:   Graphics
  private crown:  Graphics | null = null
  private dot:    Graphics
  private label:  Text

  private sc:         number
  private flapT  = 0
  private hoverPh: number
  private buzzT  = 0
  private glowColor = C.amber

  private flight:   Flight | null = null
  private waitT  = -1
  private waitDur = 0
  private waitCb: (() => void) | null = null

  private onBurst: ((x: number, y: number) => void) | null

  constructor(id: string, name: string, queen: boolean, onBurst?: (x: number, y: number) => void) {
    super()
    this.id = id; this.isQueen = queen
    this.onBurst = onBurst ?? null
    this.sc = queen ? 1.5 : 1
    this.hoverPh = rnd(0, Math.PI * 2)

    this.glow = new Graphics()
    this.rebuildGlow(queen ? C.purple : C.amber)
    this.glow.alpha = 0.12
    this.addChild(this.glow)

    this.wings = makeWings(this.sc)
    this.addChild(this.wings)

    this.body = new Graphics()
    drawBody(this.body, this.sc, queen ? 0x2d1b69 : C.black)
    this.addChild(this.body)

    if (queen) {
      this.crown = new Graphics()
      drawCrown(this.crown, this.sc)
      this.crown.y = -38 * this.sc
      this.addChild(this.crown)
    }

    this.dot = new Graphics()
    this.dot.circle(0, 0, 4).fill({ color: C.slate })
    this.dot.y = 50 * this.sc
    if (!queen) this.addChild(this.dot)

    const shortName = name.replace(/hl-/gi, '').replace(/-agent/gi, '').replace(/-/g, ' ').trim()
    this.label = new Text({
      text: queen ? '👑 Reina' : shortName,
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: queen ? 13 : 10,
        fill: queen ? C.amberLight : C.white,
        fontWeight: 'bold',
      }),
    })
    this.label.anchor.set(0.5, 0)
    this.label.y = 36 * this.sc
    this.addChild(this.label)
  }

  private rebuildGlow(color: number) {
    const s = this.sc
    this.glowColor = color
    this.glow.clear()
    this.glow.circle(0, 0, 52 * s).fill({ color, alpha: 1 })
  }

  private fly(from: [number,number], to: [number,number], dur: number, onDone: () => void) {
    const side = Math.random() > 0.5 ? 1 : -1
    const [c1, c2] = curveCtrl(from, to, side)
    this.flight = { p0: from, p1: c1, p2: c2, p3: to, t: 0, dur, onDone }
    sfxFly()
  }

  private wait(dur: number, cb: () => void) {
    this.waitT = 0; this.waitDur = dur; this.waitCb = cb
  }

  triggerAssignment() {
    if (this.beeState !== 'idle' && this.beeState !== 'done') return
    this.beeState = 'flying_out'
    sfxAssign()
    this.fly([this.homeX, this.homeY], [this.queenX, this.queenY], 0.9, () => {
      this.beeState = 'receiving'
      this.wait(0.38, () => {
        this.beeState = 'flying_work'
        this.fly([this.queenX, this.queenY], [this.homeX, this.homeY], 0.9, () => {
          this.beeState = 'working'
          this.buzzT = 0
        })
      })
    })
  }

  triggerComplete() {
    if (this.beeState !== 'working') return
    this.beeState = 'flying_back'
    this.fly([this.homeX, this.homeY], [this.queenX, this.queenY], 0.9, () => {
      this.beeState = 'delivering'
      sfxDeliver()
      this.onBurst?.(this.queenX, this.queenY)
      this.wait(0.35, () => {
        this.beeState = 'done'
        this.fly([this.queenX, this.queenY], [this.homeX, this.homeY], 0.7, () => {
          this.beeState = 'idle'
        })
      })
    })
  }

  triggerFailed() {
    this.beeState = 'failed'
    sfxFail()
  }

  updateStatus(status: string) {
    if (!this.isQueen) {
      if ((status === 'thinking' || status === 'running') &&
          (this.beeState === 'idle' || this.beeState === 'done')) {
        this.triggerAssignment()
      }
      if (status === 'completed' && this.beeState === 'working') {
        this.triggerComplete()
        sfxComplete()
      }
      if (status === 'failed') this.triggerFailed()
    }
    // Status dot
    const dotCol: Record<string, number> = {
      idle: C.slate, thinking: C.purple, running: C.emerald,
      completed: C.gold, failed: C.red,
    }
    this.dot.clear()
    this.dot.circle(0, 0, 4).fill({ color: dotCol[status] ?? C.slate })
  }

  tick(dt: number, time: number) {
    // Wing flap — faster during flight
    const flying = this.beeState === 'flying_out' || this.beeState === 'flying_work' || this.beeState === 'flying_back'
    this.flapT += dt * (flying ? 30 : 16)
    this.wings.scale.x = 1 + Math.sin(this.flapT) * 0.22

    // Wait timer
    if (this.waitT >= 0) {
      this.waitT += dt
      if (this.waitT >= this.waitDur) {
        this.waitT = -1
        const cb = this.waitCb; this.waitCb = null
        cb?.()
      }
    }

    // Movement
    if (this.flight) {
      this.flight.t += dt / this.flight.dur
      if (this.flight.t >= 1) {
        const pos = bezierPt(1, this.flight.p0, this.flight.p1, this.flight.p2, this.flight.p3)
        this.x = pos[0]; this.y = pos[1]; this.rotation = 0
        const cb = this.flight.onDone; this.flight = null
        cb()
      } else {
        const pos = bezierPt(this.flight.t, this.flight.p0, this.flight.p1, this.flight.p2, this.flight.p3)
        const tan = bezierTan(this.flight.t, this.flight.p0, this.flight.p1, this.flight.p2, this.flight.p3)
        this.x = pos[0]; this.y = pos[1]
        this.rotation = Math.atan2(tan[1], tan[0]) + Math.PI / 2
      }
    } else if (this.beeState === 'working') {
      this.buzzT += dt * 18
      this.x = this.homeX + Math.sin(this.buzzT) * 2.5
      this.y = this.homeY + Math.cos(this.buzzT * 1.3) * 1.8 + Math.sin(time * 2 + this.hoverPh) * 2
    } else {
      const atQueen = this.beeState === 'receiving' || this.beeState === 'delivering'
      this.x = atQueen ? this.queenX : this.homeX
      this.y = (atQueen ? this.queenY : this.homeY) + Math.sin(time * 1.8 + this.hoverPh) * (this.isQueen ? 5 : 3.5)
      this.rotation = 0
    }

    // Glow by state
    const glowSpec: Record<BeeState, { color: number; alpha: number }> = {
      idle:        { color: C.amber,      alpha: 0.12 },
      flying_out:  { color: C.amber,      alpha: 0.2 },
      receiving:   { color: C.purple,     alpha: 0.28 },
      flying_work: { color: C.amber,      alpha: 0.2 },
      working:     { color: C.emerald,    alpha: 0.18 + Math.sin(time * 6) * 0.12 },
      flying_back: { color: C.amber,      alpha: 0.2 },
      delivering:  { color: C.gold,       alpha: 0.45 + Math.sin(time * 14) * 0.28 },
      done:        { color: C.gold,       alpha: 0.22 },
      failed:      { color: C.red,        alpha: 0.28 + Math.sin(time * 4) * 0.1 },
    }
    if (this.isQueen) {
      if (this.glowColor !== C.purple) this.rebuildGlow(C.purple)
      this.glow.alpha = 0.13 + Math.sin(time * 2.8) * 0.07
    } else {
      const spec = glowSpec[this.beeState]
      if (spec.color !== this.glowColor) this.rebuildGlow(spec.color)
      this.glow.alpha = spec.alpha
    }

    // Crown gem shimmer
    if (this.crown && Math.random() < 0.025) this.crown.alpha = 0.75 + Math.random() * 0.25
  }
}

// ─── Particle burst ────────────────────────────────────────────────────────────

interface Particle {
  g: Graphics; vx: number; vy: number; life: number; decay: number; grav: number
}

function burst(x: number, y: number, color: number, n: number, layer: Container): Particle[] {
  const out: Particle[] = []
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + rnd(-0.25, 0.25)
    const speed = rnd(55, 175)
    const g = new Graphics()
    if (i % 3 === 0) {
      const r = rnd(3, 5.5)
      const pts: number[] = []
      for (let j = 0; j < 5; j++) {
        const a0 = (j * 2 * Math.PI) / 5 - Math.PI / 2
        const a1 = ((j + 0.5) * 2 * Math.PI) / 5 - Math.PI / 2
        pts.push(Math.cos(a0)*r, Math.sin(a0)*r, Math.cos(a1)*r*0.4, Math.sin(a1)*r*0.4)
      }
      g.poly(pts).fill({ color, alpha: 0.9 })
    } else {
      g.circle(0, 0, rnd(2, 4.5)).fill({ color, alpha: 0.85 })
    }
    g.x = x; g.y = y
    layer.addChild(g)
    out.push({ g, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, life: 1, decay: rnd(0.9, 1.7), grav: rnd(80, 150) })
  }
  return out
}

// ─── Hex grid helper ──────────────────────────────────────────────────────────

function hexPts(cx: number, cy: number, r: number): number[] {
  const pts: number[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  return pts
}

// ─── Public interface ──────────────────────────────────────────────────────────

export interface SwarmWorldEngine {
  destroy(): void
  updateAgent(agentId: string, status: string): void
  setAgents(agents: { id: string; name: string; role: string }[]): void
  createDataStream(x1: number, y1: number, x2: number, y2: number): void
}

// ─── initSwarmWorld ────────────────────────────────────────────────────────────

export async function initSwarmWorld(container: HTMLDivElement): Promise<SwarmWorldEngine> {
  let W = container.clientWidth  || 1200
  let H = container.clientHeight || 700

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

  const bgLayer      = new Container()
  const labLayer     = new Container()
  const ringLayer    = new Container()
  const fxLayer      = new Container()
  const beeLayer     = new Container()
  const uiLayer      = new Container()
  app.stage.addChild(bgLayer, labLayer, ringLayer, fxLayer, beeLayer, uiLayer)

  // ── Honeycomb grid (static, rebuilt on resize) ─────────────────────────────
  const hexGrid = new Graphics()

  function buildGrid() {
    bgLayer.removeChild(hexGrid)
    hexGrid.clear()
    const R = 30
    const cols = Math.ceil(W / (R * 1.74)) + 2
    const rows = Math.ceil(H / (R * 1.5))  + 2
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = col * R * 1.74 + (row % 2) * R * 0.87 - R
        const cy = row * R * 1.5 - R
        const pts = hexPts(cx, cy, R - 1)
        const dist = Math.hypot(cx - W / 2, cy - H / 2)
        const a = dist < 180 ? 0.055 : 0.018
        hexGrid.poly(pts).fill({ color: C.amber, alpha: a })
        hexGrid.poly(pts).stroke({ color: C.amber, width: 0.7, alpha: 0.04 })
      }
    }
    bgLayer.addChildAt(hexGrid, 0)
  }

  // ── Pollen ─────────────────────────────────────────────────────────────────
  type Pollen = { g: Graphics; vx: number; vy: number; ph: number }
  const pollens: Pollen[] = []

  function buildPollen() {
    pollens.forEach(p => bgLayer.removeChild(p.g))
    pollens.length = 0
    for (let i = 0; i < 40; i++) {
      const p = new Graphics()
      p.circle(0, 0, rnd(1, 2.3)).fill({ color: C.amberLight, alpha: rnd(0.1, 0.35) })
      p.x = rnd(30, W - 30); p.y = rnd(20, H - 70)
      bgLayer.addChild(p)
      pollens.push({ g: p, vx: rnd(-5, 5), vy: rnd(-9, -17), ph: rnd(0, Math.PI * 2) })
    }
  }

  // ── Lab panels ─────────────────────────────────────────────────────────────
  function buildLab() {
    labLayer.removeChildren()
    const g = new Graphics()
    g.rect(0, H - 82, W, 82).fill({ color: C.panel })
    g.rect(0, H - 84, W, 2).fill({ color: C.amber, alpha: 0.18 })
    g.rect(0, 0, 62, H).fill({ color: C.panel, alpha: 0.55 })
    g.rect(W - 62, 0, 62, H).fill({ color: C.panel, alpha: 0.55 })
    // Beakers
    const beakers: [number, number, number, number][] = [
      [28, H-80, 40, C.amber], [45, H-71, 30, C.emerald],
      [W-28, H-80, 40, C.purple], [W-45, H-71, 30, C.amberLight],
    ]
    beakers.forEach(([x, y, h, col]) => {
      g.rect(x-9, y, 18, h).fill({ color: col, alpha: 0.13 })
      g.circle(x, y, 12).fill({ color: col, alpha: 0.1 })
      g.rect(x-9, y + h*0.55, 16, h*0.42).fill({ color: col, alpha: 0.26 })
      g.rect(x-9, y, 18, h).stroke({ color: col, width: 1, alpha: 0.28 })
    })
    // Test tubes
    for (let i = 0; i < 6; i++) {
      g.rect(14 + i*7, H-65-i*3, 4, 18+i*3).fill({ color: C.amber, alpha: 0.14 })
    }
    labLayer.addChild(g)
  }

  // ── Queen zone + rotating rings ────────────────────────────────────────────
  const queenPlatformG = new Graphics()
  const hexRings: Container[] = []
  const ringSpeeds = [0.22, -0.14, 0.09]

  function buildQueenZone() {
    ringLayer.removeChildren()
    queenPlatformG.clear()
    hexRings.length = 0
    const qx = W / 2, qy = H / 2

    // Aura gradients
    for (let r = 115; r >= 28; r -= 16) {
      queenPlatformG.circle(qx, qy, r).fill({ color: C.amber, alpha: 0.008 * (115 - r + 18) / 100 })
    }
    // Platform hex
    queenPlatformG.poly(hexPts(qx, qy, 50)).fill({ color: C.amber, alpha: 0.05 })
    queenPlatformG.poly(hexPts(qx, qy, 50)).stroke({ color: C.amberLight, width: 1.5, alpha: 0.25 })
    ringLayer.addChild(queenPlatformG)

    // 3 rotating rings
    const radii  = [82, 112, 145]
    const counts = [6, 8, 10]
    const colors = [C.amber, C.purple, C.amberLight]
    radii.forEach((rad, ri) => {
      const ring = new Container()
      ring.x = qx; ring.y = qy
      const rg = new Graphics()
      for (let j = 0; j < counts[ri]; j++) {
        const a = (j / counts[ri]) * Math.PI * 2
        const rx = Math.cos(a) * rad, ry = Math.sin(a) * rad
        rg.poly(hexPts(rx, ry, 13)).fill({ color: colors[ri], alpha: 0.065 })
        rg.poly(hexPts(rx, ry, 13)).stroke({ color: colors[ri], width: 1, alpha: 0.16 })
      }
      ring.addChild(rg)
      ringLayer.addChild(ring)
      hexRings.push(ring)
    })
  }

  // ── Title ──────────────────────────────────────────────────────────────────
  const titleLabel = new Text({
    text: 'LABORATORIO DE LA COLMENA',
    style: new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 11, fill: C.amber, fontWeight: '900', letterSpacing: 4,
    }),
  })
  titleLabel.alpha = 0.4
  titleLabel.anchor.set(0.5, 0)
  uiLayer.addChild(titleLabel)

  function layoutUI() { titleLabel.x = W / 2; titleLabel.y = 14 }

  // Initial build
  buildGrid(); buildPollen(); buildLab(); buildQueenZone(); layoutUI()

  // ── Scene state ─────────────────────────────────────────────────────────────
  let bees: Map<string, BeeAgent> = new Map()
  let queen: BeeAgent | null = null
  let globalTime = 0
  const particles: Particle[] = []

  function spawnBurstAt(x: number, y: number) {
    particles.push(...burst(x, y, C.amberLight, 20, fxLayer))
    particles.push(...burst(x, y, C.gold, 8, fxLayer))
  }

  // ── Ticker ──────────────────────────────────────────────────────────────────
  const loop = (ticker: Ticker) => {
    const dt = ticker.deltaTime / 60
    globalTime += dt

    hexGrid.alpha = 0.62 + Math.sin(globalTime * 0.32) * 0.18

    hexRings.forEach((r, i) => { r.rotation += dt * ringSpeeds[i] })

    pollens.forEach(p => {
      p.g.x += (p.vx * 0.33 + Math.sin(globalTime * 0.55 + p.ph) * 3.2) * dt
      p.g.y += p.vy * dt * 0.26
      p.g.alpha = 0.15 + Math.sin(globalTime + p.ph) * 0.1
      if (p.g.y < 12) { p.g.y = H - 90; p.g.x = rnd(30, W - 30) }
      if (p.g.x < 30) p.g.x = W - 50
      if (p.g.x > W - 30) p.g.x = 50
    })

    const dead: Particle[] = []
    particles.forEach(p => {
      p.vy += p.grav * dt
      p.life -= p.decay * dt
      p.g.x += p.vx * dt; p.g.y += p.vy * dt
      p.g.alpha = Math.max(0, p.life)
      if (p.life <= 0) { fxLayer.removeChild(p.g); p.g.destroy(); dead.push(p) }
    })
    dead.forEach(p => particles.splice(particles.indexOf(p), 1))

    bees.forEach(b => b.tick(dt, globalTime))
    queen?.tick(dt, globalTime)
  }

  app.ticker.add(loop)

  // ── ResizeObserver ──────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const nw = container.clientWidth  || W
    const nh = container.clientHeight || H
    if (nw === W && nh === H) return
    W = nw; H = nh
    app.renderer.resize(W, H)
    buildGrid(); buildPollen(); buildLab(); buildQueenZone(); layoutUI()
    if (queen) { queen.homeX = W/2; queen.homeY = H/2; queen.queenX = W/2; queen.queenY = H/2 }
    // Worker positions are relative to queen — re-set
    const workers = Array.from(bees.values())
    const radius  = Math.min(W, H) * 0.38
    workers.forEach((bee, i) => {
      const angle = (i / workers.length) * Math.PI * 2 - Math.PI / 2
      bee.homeX = W/2 + Math.cos(angle) * radius
      bee.homeY = H/2 + Math.sin(angle) * radius
      bee.queenX = W/2; bee.queenY = H/2
    })
  })
  ro.observe(container)

  return {
    destroy() {
      ro.disconnect()
      app.ticker.remove(loop)
      app.destroy(true, { children: true, texture: true })
    },

    setAgents(agents) {
      beeLayer.removeChildren()
      bees.clear(); queen = null
      const qx = W / 2, qy = H / 2

      const coord   = agents.find(a => a.role === 'coordinator')
      const workers = agents.filter(a => a.role !== 'coordinator')

      if (coord) {
        queen = new BeeAgent(coord.id, coord.name, true)
        queen.homeX = qx; queen.homeY = qy
        queen.queenX = qx; queen.queenY = qy
        queen.x = qx; queen.y = qy
        beeLayer.addChild(queen)
      }

      const radius = Math.min(W, H) * 0.38
      workers.forEach((a, i) => {
        const angle = (i / workers.length) * Math.PI * 2 - Math.PI / 2
        const bee = new BeeAgent(a.id, a.name, false, spawnBurstAt)
        bee.homeX  = qx + Math.cos(angle) * radius
        bee.homeY  = qy + Math.sin(angle) * radius
        bee.queenX = qx; bee.queenY = qy
        bee.x = bee.homeX; bee.y = bee.homeY
        beeLayer.addChild(bee)
        bees.set(a.id, bee)
      })
    },

    updateAgent(agentId, status) {
      if (queen?.id === agentId) {
        queen.updateStatus(status)
      } else {
        const bee = bees.get(agentId)
        if (!bee) return
        bee.updateStatus(status)
        if ((status === 'thinking' || status === 'running') && queen) {
          setTimeout(() => this.createDataStream(queen!.x, queen!.homeY, bee.homeX, bee.homeY), 120)
        }
        if (status === 'completed' && queen) {
          setTimeout(() => this.createDataStream(bee.homeX, bee.homeY, queen!.x, queen!.homeY), 850)
        }
      }
    },

    createDataStream(x1, y1, x2, y2) {
      const toCenter = Math.hypot(x2 - W/2, y2 - H/2) < Math.hypot(x1 - W/2, y1 - H/2)
      const side = toCenter ? -1 : 1
      const [c1, c2] = curveCtrl([x1, y1], [x2, y2], side * 0.5)

      const arc = new Graphics()
      fxLayer.addChild(arc)

      const dots: { g: Graphics; off: number }[] = []
      for (let i = 0; i < 6; i++) {
        const pg = new Graphics()
        pg.circle(0, 0, 2.2).fill({ color: toCenter ? C.gold : C.amberLight, alpha: 0.9 })
        fxLayer.addChild(pg)
        dots.push({ g: pg, off: i / 6 * 0.38 })
      }

      let t = 0
      const streamTick = (ticker: Ticker) => {
        t += ticker.deltaTime / 60 * 1.55
        arc.clear()
        arc.moveTo(x1, y1)
        arc.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x2, y2)
        arc.stroke({ color: toCenter ? C.gold : C.emerald, width: 2, alpha: Math.max(0, (1 - t) * 0.6) })

        dots.forEach(d => {
          const pt = clamp(t * 1.3 - d.off, 0, 1)
          if (pt === 0) { d.g.visible = false; return }
          d.g.visible = true
          const pos = bezierPt(pt, [x1, y1], c1, c2, [x2, y2])
          d.g.x = pos[0]; d.g.y = pos[1]
          d.g.alpha = Math.max(0, 1 - pt)
        })

        if (t >= 1) {
          app.ticker.remove(streamTick)
          fxLayer.removeChild(arc); arc.destroy()
          dots.forEach(d => { fxLayer.removeChild(d.g); d.g.destroy() })
        }
      }
      app.ticker.add(streamTick)
    },
  }
}
