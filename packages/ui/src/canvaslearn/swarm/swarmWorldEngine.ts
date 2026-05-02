import { Application, BlurFilter, Container, FillGradient, Graphics, Text, TextStyle, Ticker } from 'pixi.js'

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:         0x04080f,
  bgTop:      0x0d1b3e,
  bgMid:      0x060d1f,
  bgBot:      0x020408,
  amber:      0xf59e0b,
  amberLight: 0xfbbf24,
  amberDark:  0xd97706,
  purple:     0x8b5cf6,
  emerald:    0x10b981,
  red:        0xef4444,
  white:      0xffffff,
  black:      0x000000,
  slate:      0x475569,
  gold:       0xffd700,
  pathDim:    0x1a2a4a,
}

const rnd   = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ─── Bezier ───────────────────────────────────────────────────────────────────
function bezierPt(
  t: number,
  p0: [number,number], p1: [number,number],
  p2: [number,number], p3: [number,number],
): [number,number] {
  const u = 1 - t
  return [
    u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
    u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
  ]
}

function bezierTan(
  t: number,
  p0: [number,number], p1: [number,number],
  p2: [number,number], p3: [number,number],
): [number,number] {
  const u = 1 - t
  return [
    3*(u*u*(p1[0]-p0[0]) + 2*u*t*(p2[0]-p1[0]) + t*t*(p3[0]-p2[0])),
    3*(u*u*(p1[1]-p0[1]) + 2*u*t*(p2[1]-p1[1]) + t*t*(p3[1]-p2[1])),
  ]
}

function curveCtrl(
  p0: [number,number], p3: [number,number], side: number,
): [[number,number],[number,number]] {
  const dx = p3[0] - p0[0]
  const dy = p3[1] - p0[1]
  const len = Math.hypot(dx, dy) || 1
  const perp: [number,number] = [-dy / len, dx / len]
  const off = clamp(len * 0.3, 50, 120) * side
  return [
    [p0[0] + dx*0.25 + perp[0]*off, p0[1] + dy*0.25 + perp[1]*off],
    [p0[0] + dx*0.75 + perp[0]*off, p0[1] + dy*0.75 + perp[1]*off],
  ]
}

// ─── Web Audio ────────────────────────────────────────────────────────────────
let _actx: AudioContext | null = null
function getACtx(): AudioContext { if (!_actx) _actx = new AudioContext(); return _actx }

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

function sfxAssign()   { tone(330, 0.11, 'sine', 0.12); tone(440, 0.1, 'sine', 0.12, 0.08) }
function sfxFly()      { tone(180, 0.07, 'sawtooth', 0.05) }
function sfxComplete() { tone(523, 0.09, 'sine', 0.14); tone(659, 0.09, 'sine', 0.14, 0.09); tone(784, 0.18, 'sine', 0.14, 0.18) }
function sfxFail()     { tone(330, 0.12, 'sine', 0.1); tone(220, 0.24, 'sine', 0.1, 0.1) }
function sfxDeliver()  { tone(880, 0.06, 'triangle', 0.15); tone(1046, 0.2, 'sine', 0.15, 0.06) }
function sfxVictory()  { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'sine', 0.18, i * 0.12)) }

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

// ─── State machine ─────────────────────────────────────────────────────────────
type BeeState = 'idle'|'receiving'|'working'|'flying_back'|'delivering'|'done'|'failed'

interface Flight {
  p0: [number,number]; p1: [number,number]; p2: [number,number]; p3: [number,number]
  t: number; dur: number; onDone: () => void
}

// ─── BeeAgent ─────────────────────────────────────────────────────────────────
class BeeAgent extends Container {
  public id:       string
  public isQueen:  boolean
  public homeX = 0; public homeY = 0
  public beeState: BeeState = 'idle'

  private body:     Graphics
  private wings:    Container
  private glow:     Graphics
  private crown:    Graphics | null = null
  private dot:      Graphics
  private nameText: Text

  private sc:         number
  private flapT  = 0
  private hoverPh: number
  private buzzT  = 0
  private glowColor = C.amber

  private flight:  Flight | null = null
  private waitT  = -1
  private waitDur = 0
  private waitCb: (() => void) | null = null

  private onBurst: ((x: number, y: number) => void) | null

  constructor(id: string, name: string, queen: boolean, onBurst?: (x: number, y: number) => void) {
    super()
    this.id = id; this.isQueen = queen
    this.onBurst = onBurst ?? null
    this.sc = queen ? 1.6 : 0.88
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
    this.dot.circle(0, 0, 3.5).fill({ color: C.slate })
    this.dot.y = 48 * this.sc
    if (!queen) this.addChild(this.dot)

    const shortName = name.replace(/hl-/gi, '').replace(/-agent/gi, '').replace(/-/g, ' ').trim()
    this.nameText = new Text({
      text: queen ? '👑 Coordinadora' : shortName,
      style: new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: queen ? 12 : 9,
        fill: queen ? C.amberLight : C.white,
        fontWeight: 'bold',
      }),
    })
    this.nameText.anchor.set(0.5, 0)
    this.nameText.y = 34 * this.sc
    this.addChild(this.nameText)
  }

  private rebuildGlow(color: number) {
    const s = this.sc
    this.glowColor = color
    this.glow.clear()
    this.glow.circle(0, 0, 48 * s).fill({ color, alpha: 1 })
  }

  private doFly(from: [number,number], to: [number,number], dur: number, onDone: () => void) {
    const side = Math.random() > 0.5 ? 1 : -1
    const [c1, c2] = curveCtrl(from, to, side)
    this.flight = { p0: from, p1: c1, p2: c2, p3: to, t: 0, dur, onDone }
    sfxFly()
  }

  private doWait(dur: number, cb: () => void) {
    this.waitT = 0; this.waitDur = dur; this.waitCb = cb
  }

  /** Public: fly coordinator to an arbitrary position */
  public flyToPosition(to: [number,number], dur: number, onDone: () => void) {
    this.doFly([this.x, this.y], to, dur, onDone)
  }

  /** Public: update coordinator's resting home position on the path */
  public updateHome(x: number, y: number) {
    this.homeX = x; this.homeY = y
  }

  /** Called when coordinator arrives at this worker — worker starts receiving/working */
  public startReceiving(onWorking?: () => void) {
    this.beeState = 'receiving'
    this.doWait(0.4, () => {
      this.beeState = 'working'
      this.buzzT = 0
      onWorking?.()
    })
  }

  /** Called when backend reports 'completed' — worker flies to coord to deliver */
  public triggerDelivery(to: [number,number], onDelivered?: () => void) {
    if (this.beeState !== 'working') return
    this.beeState = 'flying_back'
    this.doFly([this.homeX, this.homeY], to, 0.85, () => {
      this.beeState = 'delivering'
      sfxDeliver()
      this.onBurst?.(to[0], to[1])
      this.doWait(0.35, () => {
        onDelivered?.()
        this.beeState = 'done'
        this.doFly(to, [this.homeX, this.homeY], 0.7, () => { this.beeState = 'idle' })
      })
    })
  }

  public triggerFailed() { this.beeState = 'failed'; sfxFail() }

  public updateStatus(status: string) {
    const dotCol: Record<string, number> = {
      idle: C.slate, thinking: C.purple, running: C.emerald,
      completed: C.gold, failed: C.red,
    }
    this.dot.clear()
    this.dot.circle(0, 0, 3.5).fill({ color: dotCol[status] ?? C.slate })
  }

  public tick(dt: number, time: number) {
    const flying = this.beeState === 'flying_back'
    this.flapT += dt * (flying || !!this.flight ? 30 : 16)
    this.wings.scale.x = 1 + Math.sin(this.flapT) * 0.22

    if (this.waitT >= 0) {
      this.waitT += dt
      if (this.waitT >= this.waitDur) {
        this.waitT = -1
        const cb = this.waitCb; this.waitCb = null; cb?.()
      }
    }

    if (this.flight) {
      this.flight.t += dt / this.flight.dur
      if (this.flight.t >= 1) {
        const pos = bezierPt(1, this.flight.p0, this.flight.p1, this.flight.p2, this.flight.p3)
        this.x = pos[0]; this.y = pos[1]; this.rotation = 0
        const cb = this.flight.onDone; this.flight = null; cb()
      } else {
        const pos = bezierPt(this.flight.t, this.flight.p0, this.flight.p1, this.flight.p2, this.flight.p3)
        const tan = bezierTan(this.flight.t, this.flight.p0, this.flight.p1, this.flight.p2, this.flight.p3)
        this.x = pos[0]; this.y = pos[1]
        this.rotation = Math.atan2(tan[1], tan[0]) + Math.PI / 2
      }
    } else if (this.beeState === 'working') {
      this.buzzT += dt * 18
      this.x = this.homeX + Math.sin(this.buzzT) * 2.2
      this.y = this.homeY + Math.cos(this.buzzT * 1.3) * 1.6 + Math.sin(time * 2 + this.hoverPh) * 2
    } else {
      const atDeliver = this.beeState === 'receiving' || this.beeState === 'delivering'
      this.x = this.homeX
      this.y = this.homeY + Math.sin(time * 1.8 + this.hoverPh) * (this.isQueen ? 5 : 3)
      this.rotation = 0
      void atDeliver
    }

    // Glow by state
    const glowSpec: Record<BeeState, { color: number; alpha: number }> = {
      idle:        { color: C.amber,   alpha: 0.1 },
      receiving:   { color: C.purple,  alpha: 0.32 },
      working:     { color: C.emerald, alpha: 0.16 + Math.sin(time * 6) * 0.12 },
      flying_back: { color: C.amber,   alpha: 0.22 },
      delivering:  { color: C.gold,    alpha: 0.45 + Math.sin(time * 14) * 0.28 },
      done:        { color: C.gold,    alpha: 0.2 },
      failed:      { color: C.red,     alpha: 0.28 + Math.sin(time * 4) * 0.1 },
    }
    if (this.isQueen) {
      if (this.glowColor !== C.purple) this.rebuildGlow(C.purple)
      this.glow.alpha = (this.flight ? 0.35 : 0.14) + Math.sin(time * 2.8) * 0.07
    } else {
      const spec = glowSpec[this.beeState]
      if (spec.color !== this.glowColor) this.rebuildGlow(spec.color)
      this.glow.alpha = spec.alpha
    }

    if (this.crown && Math.random() < 0.025) this.crown.alpha = 0.75 + Math.random() * 0.25
  }
}

// ─── Particles ────────────────────────────────────────────────────────────────
interface Particle {
  g: Graphics; vx: number; vy: number; life: number; decay: number; grav: number
}

function spawnBurst(x: number, y: number, color: number, n: number, layer: Container): Particle[] {
  const out: Particle[] = []
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3)
    const speed = rnd(50, 160)
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
    out.push({ g, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, life: 1, decay: rnd(0.8, 1.5), grav: rnd(70, 140) })
  }
  return out
}

// ─── Hex helper ───────────────────────────────────────────────────────────────
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
  let W = container.clientWidth  || 1280
  let H = container.clientHeight || 720

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

  // Layers back→front
  const bgLayer      = new Container()
  const glowLayer    = new Container()
  const pathLayer    = new Container()
  const cellLayer    = new Container()
  const fxLayer      = new Container()
  const beeLayer     = new Container()
  const hudLayer     = new Container()
  app.stage.addChild(bgLayer, glowLayer, pathLayer, cellLayer, fxLayer, beeLayer, hudLayer)

  // Blend add on glow layer for light emission effect
  glowLayer.blendMode = 'add'

  // ── Path geometry helpers ──────────────────────────────────────────────────
  const pathPad  = () => ({ start: W * 0.08, end: W * 0.9, y: H * 0.5 })

  // ── Background: FillGradient + hex grid ────────────────────────────────────
  const bgG = new Graphics()

  function buildBg() {
    bgLayer.removeChild(bgG)
    bgG.clear()
    // Top-to-bottom gradient
    const grad = new FillGradient(0, 0, 0, H)
    grad.addColorStop(0,   C.bgTop)
    grad.addColorStop(0.55, C.bgMid)
    grad.addColorStop(1,   C.bgBot)
    bgG.rect(0, 0, W, H).fill(grad)

    // Honeycomb overlay
    const R = 28
    const cols = Math.ceil(W / (R * 1.74)) + 2
    const rows = Math.ceil(H / (R * 1.5))  + 2
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = col * R * 1.74 + (row % 2) * R * 0.87 - R
        const cy = row * R * 1.5 - R
        bgG.poly(hexPts(cx, cy, R - 1)).stroke({ color: C.amber, width: 0.6, alpha: 0.028 })
      }
    }
    bgLayer.addChildAt(bgG, 0)
  }

  // ── Ambient glow pools (BlurFilter + blend:add) ────────────────────────────
  const ambientGlows: Graphics[] = []

  function buildGlowPools() {
    glowLayer.removeChildren()
    ambientGlows.length = 0

    const pp = pathPad()

    // Path corridor glow (elongated horizontal pool)
    const pathGlow = new Graphics()
    pathGlow.ellipse(W / 2, pp.y, W * 0.4, H * 0.06).fill({ color: C.amber, alpha: 0.15 })
    try { pathGlow.filters = [new BlurFilter({ strength: 30 })] } catch (_) {}
    glowLayer.addChild(pathGlow)

    // Meta portal glow
    const metaGlow = new Graphics()
    metaGlow.circle(pp.end, pp.y, 80).fill({ color: C.gold, alpha: 0.25 })
    try { metaGlow.filters = [new BlurFilter({ strength: 25 })] } catch (_) {}
    glowLayer.addChild(metaGlow)

    ambientGlows.push(pathGlow, metaGlow)
  }

  // ── Pollen particles ───────────────────────────────────────────────────────
  type Pollen = { g: Graphics; vx: number; vy: number; ph: number }
  const pollens: Pollen[] = []

  function buildPollen() {
    pollens.forEach(p => bgLayer.removeChild(p.g))
    pollens.length = 0
    for (let i = 0; i < 35; i++) {
      const p = new Graphics()
      p.circle(0, 0, rnd(1, 2.2)).fill({ color: C.amberLight, alpha: rnd(0.08, 0.3) })
      p.x = rnd(0, W); p.y = rnd(0, H)
      bgLayer.addChild(p)
      pollens.push({ g: p, vx: rnd(-4, 4), vy: rnd(-8, -15), ph: rnd(0, Math.PI * 2) })
    }
  }

  // ── Horizontal path + progress light ──────────────────────────────────────
  const pathStaticG  = new Graphics()  // hex chain (static)
  const pathLitG     = new Graphics()  // progress illumination (dynamic)
  const pathConnG    = new Graphics()  // connector lines to workers (rebuilt in setAgents)
  let   pathHexXs:   number[] = []

  function buildPathGeometry() {
    const pp = pathPad()
    pathStaticG.clear()
    pathHexXs = []

    // Hex chain
    const R = 16, step = R * 1.75
    for (let x = pp.start; x <= pp.end; x += step) {
      pathStaticG.poly(hexPts(x, pp.y, R)).fill({ color: C.pathDim, alpha: 0.55 })
      pathStaticG.poly(hexPts(x, pp.y, R)).stroke({ color: C.amber, width: 0.8, alpha: 0.18 })
      pathHexXs.push(x)
    }
    // Start/end markers
    pathStaticG.circle(pp.start, pp.y, 10).fill({ color: C.amberLight, alpha: 0.25 })
    pathStaticG.circle(pp.start, pp.y, 10).stroke({ color: C.amberLight, width: 1.5, alpha: 0.5 })

    pathLayer.removeChildren()
    pathLayer.addChild(pathStaticG, pathLitG, pathConnG)
  }

  // Meta portal (end of path)
  const metaG = new Graphics()
  let metaBuilt = false

  function buildMeta() {
    const pp = pathPad()
    metaG.clear()
    const pts = hexPts(pp.end, pp.y, 42)
    metaG.poly(pts).fill({ color: C.gold, alpha: 0.07 })
    metaG.poly(pts).stroke({ color: C.gold, width: 2, alpha: 0.6 })
    // Inner hex
    metaG.poly(hexPts(pp.end, pp.y, 30)).fill({ color: C.gold, alpha: 0.05 })
    metaG.poly(hexPts(pp.end, pp.y, 30)).stroke({ color: C.amberLight, width: 1.5, alpha: 0.8 })
    pathLayer.addChild(metaG)
    metaBuilt = true

    const lbl = new Text({
      text: 'MUNDO →',
      style: new TextStyle({ fontFamily: 'Inter, system-ui', fontSize: 10, fill: C.gold, fontWeight: '900', letterSpacing: 3 }),
    })
    lbl.anchor.set(0.5, 1)
    lbl.x = pp.end; lbl.y = pp.y - 50
    lbl.alpha = 0.7
    hudLayer.addChild(lbl)
  }

  // ─── Scene state ─────────────────────────────────────────────────────────────
  let bees: Map<string, BeeAgent> = new Map()
  let queen: BeeAgent | null = null
  let globalTime = 0
  const particles: Particle[] = []

  // Coordinator journey state
  let coordPathX   = 0
  let coordPathY   = 0
  let coordBusy    = false
  let completedCnt = 0
  let totalWorkers = 0
  const coordQueue: string[] = []

  // Worker cells (visual state rings per bee)
  interface CellData { stateRing: Graphics; lastState: BeeState }
  const cellData: Map<string, CellData> = new Map()

  function spawnBurstAt(x: number, y: number) {
    particles.push(...spawnBurst(x, y, C.amberLight, 18, fxLayer))
    particles.push(...spawnBurst(x, y, C.gold, 8, fxLayer))
  }

  function advanceCoord() {
    completedCnt++
    const pp = pathPad()
    const progress = Math.min(1, completedCnt / Math.max(1, totalWorkers))
    coordPathX = pp.start + progress * (pp.end - pp.start)
    queen?.updateHome(coordPathX, coordPathY)

    if (completedCnt >= totalWorkers) {
      // Victory: fly to meta
      setTimeout(() => {
        const pp2 = pathPad()
        queen?.flyToPosition([pp2.end, pp2.y], 1.2, () => {
          spawnBurstAt(pp2.end, pp2.y)
          sfxVictory()
        })
      }, 600)
    }
  }

  function processCoordQueue() {
    if (coordBusy || coordQueue.length === 0 || !queen) return
    coordBusy = true
    const agentId = coordQueue.shift()!
    const bee = bees.get(agentId)
    if (!bee) { coordBusy = false; processCoordQueue(); return }

    sfxAssign()

    // Fly coordinator to worker
    queen.flyToPosition([bee.homeX, bee.homeY], 0.9, () => {
      // Park coordinator at worker's position for the visit
      queen!.updateHome(bee.homeX, bee.homeY)

      // Small pulse burst at handoff
      spawnBurst(bee.homeX, bee.homeY, C.purple, 8, fxLayer).forEach(p => particles.push(p))

      // Worker starts receiving task
      bee.startReceiving()

      // Coordinator waits 0.42s then flies back to path
      setTimeout(() => {
        const pp = pathPad()
        queen?.flyToPosition([coordPathX, coordPathY], 0.85, () => {
          queen?.updateHome(coordPathX, coordPathY)
          coordBusy = false
          processCoordQueue()
        })
      }, 420)
    })
  }

  // ── Main ticker ─────────────────────────────────────────────────────────────
  const loop = (ticker: Ticker) => {
    const dt = ticker.deltaTime / 60
    globalTime += dt

    // Pollen
    pollens.forEach(p => {
      p.g.x += (p.vx * 0.3 + Math.sin(globalTime * 0.5 + p.ph) * 3) * dt
      p.g.y += p.vy * dt * 0.25
      p.g.alpha = 0.12 + Math.sin(globalTime + p.ph) * 0.08
      if (p.g.y < 0) { p.g.y = H; p.g.x = rnd(0, W) }
      if (p.g.x < 0) p.g.x = W; if (p.g.x > W) p.g.x = 0
    })

    // Particles physics
    const dead: Particle[] = []
    particles.forEach(p => {
      p.vy += p.grav * dt; p.life -= p.decay * dt
      p.g.x += p.vx * dt; p.g.y += p.vy * dt
      p.g.alpha = Math.max(0, p.life)
      if (p.life <= 0) { fxLayer.removeChild(p.g); p.g.destroy(); dead.push(p) }
    })
    dead.forEach(p => particles.splice(particles.indexOf(p), 1))

    // Path progress light (follows coordinator X)
    const pp = pathPad()
    pathLitG.clear()
    const litW = coordPathX - pp.start
    if (litW > 2) {
      pathLitG.rect(pp.start, pp.y - 5, litW, 10).fill({ color: C.amber, alpha: 0.2 })
      pathLitG.rect(pp.start, pp.y - 2, litW, 4).fill({ color: C.amberLight, alpha: 0.35 })
    }
    // Coordinator glow indicator on path
    if (queen && !queen['flight']) {
      pathLitG.circle(coordPathX, pp.y, 8).fill({ color: C.amber, alpha: 0.35 + Math.sin(globalTime * 4) * 0.15 })
    }

    // Worker cell state rings
    cellData.forEach((cd, id) => {
      const bee = bees.get(id)
      if (!bee) return
      if (bee.beeState !== cd.lastState) {
        cd.lastState = bee.beeState
        const cols: Partial<Record<BeeState, number>> = {
          receiving: C.purple, working: C.emerald,
          flying_back: C.amber, delivering: C.gold, done: C.gold, failed: C.red,
        }
        const col = cols[bee.beeState] ?? C.slate
        const a   = bee.beeState === 'idle' ? 0.22 : 0.75
        cd.stateRing.clear()
        cd.stateRing.poly(hexPts(0, 0, 26)).stroke({ color: col, width: 2, alpha: a })
      }
      // Pulse working state
      cd.stateRing.alpha = bee.beeState === 'working'
        ? 0.4 + Math.sin(globalTime * 5.5) * 0.6
        : 1
    })

    // Meta portal pulse
    if (metaBuilt) {
      metaG.alpha = 0.7 + Math.sin(globalTime * 2.2) * 0.3
    }

    // Bees
    bees.forEach(b => b.tick(dt, globalTime))
    queen?.tick(dt, globalTime)
  }

  app.ticker.add(loop)

  // ── ResizeObserver ──────────────────────────────────────────────────────────
  function rebuildAll() {
    buildBg()
    buildGlowPools()
    buildPathGeometry()
    buildMeta()
    buildPollen()

    // Reposition queen + workers
    const pp = pathPad()
    coordPathY = pp.y
    if (queen) {
      coordPathX = pp.start + (completedCnt / Math.max(1, totalWorkers)) * (pp.end - pp.start)
      queen.updateHome(coordPathX, coordPathY)
      if (!queen['flight']) { queen.x = coordPathX; queen.y = coordPathY }
    }

    // Reposition workers
    const workers = Array.from(bees.values())
    const ROW_TOP    = H * 0.26
    const ROW_BOTTOM = H * 0.74
    const xStep = (pp.end - pp.start) / Math.max(1, Math.ceil(workers.length / 2) - 1)
    workers.forEach((bee, i) => {
      const col = i % Math.ceil(workers.length / 2)
      const row = i < Math.ceil(workers.length / 2) ? 0 : 1
      bee.homeX = pp.start + col * xStep
      bee.homeY = row === 0 ? ROW_TOP : ROW_BOTTOM
    })

    // Rebuild connector lines
    pathConnG.clear()
    workers.forEach(bee => {
      pathConnG.moveTo(bee.homeX, bee.homeY > pp.y ? bee.homeY - 26 : bee.homeY + 26)
      pathConnG.lineTo(bee.homeX, pp.y)
      pathConnG.stroke({ color: C.amber, width: 1, alpha: 0.12 })
    })

    // Rebuild cell containers
    cellLayer.removeChildren()
    cellData.clear()
    workers.forEach(bee => {
      const cont = new Container()
      cont.x = bee.homeX; cont.y = bee.homeY
      const hexBg = new Graphics()
      hexBg.poly(hexPts(0, 0, 26)).fill({ color: 0x0a1525, alpha: 0.85 })
      hexBg.poly(hexPts(0, 0, 26)).stroke({ color: C.slate, width: 1.2, alpha: 0.35 })
      const stateRing = new Graphics()
      stateRing.poly(hexPts(0, 0, 26)).stroke({ color: C.slate, width: 2, alpha: 0.22 })
      cont.addChild(hexBg, stateRing)
      cellLayer.addChild(cont)
      cellData.set(bee.id, { stateRing, lastState: 'idle' })
    })
  }

  const ro = new ResizeObserver(() => {
    const nw = container.clientWidth  || W
    const nh = container.clientHeight || H
    if (nw === W && nh === H) return
    W = nw; H = nh
    app.renderer.resize(W, H)
    rebuildAll()
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
      completedCnt = 0

      const coordData = agents.find(a => a.role === 'coordinator')
      const workersData = agents.filter(a => a.role !== 'coordinator')
      totalWorkers = workersData.length

      const pp = pathPad()
      coordPathX = pp.start
      coordPathY = pp.y

      if (coordData) {
        queen = new BeeAgent(coordData.id, coordData.name, true)
        queen.updateHome(coordPathX, coordPathY)
        queen.x = coordPathX; queen.y = coordPathY
        beeLayer.addChild(queen)
      }

      // Layout: 2 rows, top and bottom, x evenly spaced
      const ROW_TOP    = H * 0.26
      const ROW_BOTTOM = H * 0.74
      const half  = Math.ceil(workersData.length / 2)
      const xStep = (pp.end - pp.start) / Math.max(1, half - 1)

      workersData.forEach((a, i) => {
        const col = i % half
        const row = i < half ? 0 : 1
        const bee = new BeeAgent(a.id, a.name, false, spawnBurstAt)
        bee.homeX = pp.start + col * xStep
        bee.homeY = row === 0 ? ROW_TOP : ROW_BOTTOM
        bee.x = bee.homeX; bee.y = bee.homeY
        beeLayer.addChild(bee)
        bees.set(a.id, bee)
      })

      // Static connector lines
      pathConnG.clear()
      workersData.forEach((_, i) => {
        const col = i % half
        const row = i < half ? 0 : 1
        const bx  = pp.start + col * xStep
        const by  = row === 0 ? ROW_TOP : ROW_BOTTOM
        pathConnG.moveTo(bx, by > pp.y ? by - 26 : by + 26)
        pathConnG.lineTo(bx, pp.y)
        pathConnG.stroke({ color: C.amber, width: 1, alpha: 0.12 })
      })

      // Worker cells
      cellLayer.removeChildren(); cellData.clear()
      bees.forEach(bee => {
        const cont = new Container()
        cont.x = bee.homeX; cont.y = bee.homeY
        const hexBg = new Graphics()
        hexBg.poly(hexPts(0, 0, 26)).fill({ color: 0x0a1525, alpha: 0.85 })
        hexBg.poly(hexPts(0, 0, 26)).stroke({ color: C.slate, width: 1.2, alpha: 0.35 })
        const stateRing = new Graphics()
        stateRing.poly(hexPts(0, 0, 26)).stroke({ color: C.slate, width: 2, alpha: 0.22 })
        cont.addChild(hexBg, stateRing)
        cellLayer.addChild(cont)
        cellData.set(bee.id, { stateRing, lastState: 'idle' })
      })

      // Initial build of bg + path
      rebuildAll()
    },

    updateAgent(agentId, status) {
      if (queen?.id === agentId) {
        queen.updateStatus(status)
        return
      }
      const bee = bees.get(agentId)
      if (!bee) return
      bee.updateStatus(status)

      if ((status === 'thinking' || status === 'running') &&
          (bee.beeState === 'idle' || bee.beeState === 'done')) {
        coordQueue.push(agentId)
        processCoordQueue()
      }
      if (status === 'completed' && bee.beeState === 'working') {
        const deliverTo: [number,number] = [coordPathX, coordPathY]
        bee.triggerDelivery(deliverTo, () => { advanceCoord(); sfxComplete() })
      }
      if (status === 'failed') bee.triggerFailed()
    },

    createDataStream(x1, y1, x2, y2) {
      const side = Math.random() > 0.5 ? 1 : -1
      const [c1, c2] = curveCtrl([x1, y1], [x2, y2], side * 0.45)
      const arc = new Graphics()
      fxLayer.addChild(arc)

      const dots: { g: Graphics; off: number }[] = []
      for (let i = 0; i < 5; i++) {
        const pg = new Graphics()
        pg.circle(0, 0, 2).fill({ color: C.amberLight, alpha: 0.9 })
        fxLayer.addChild(pg)
        dots.push({ g: pg, off: i / 5 * 0.35 })
      }

      let t = 0
      const st = (ticker: Ticker) => {
        t += ticker.deltaTime / 60 * 1.5
        arc.clear()
        arc.moveTo(x1, y1)
        arc.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], x2, y2)
        arc.stroke({ color: C.emerald, width: 1.8, alpha: Math.max(0, (1 - t) * 0.55) })
        dots.forEach(d => {
          const pt = clamp(t * 1.25 - d.off, 0, 1)
          if (pt === 0) { d.g.visible = false; return }
          d.g.visible = true
          const pos = bezierPt(pt, [x1, y1], c1, c2, [x2, y2])
          d.g.x = pos[0]; d.g.y = pos[1]
          d.g.alpha = Math.max(0, 1 - pt)
        })
        if (t >= 1) {
          app.ticker.remove(st)
          fxLayer.removeChild(arc); arc.destroy()
          dots.forEach(d => { fxLayer.removeChild(d.g); d.g.destroy() })
        }
      }
      app.ticker.add(st)
    },
  }
}
