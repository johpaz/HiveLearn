import { Application, Container, Graphics, Text } from 'pixi.js'

const W = 800
const H = 600

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rnd = (min: number, max: number) => min + Math.random() * (max - min)

const C = {
  skyTop:     0x1a1f3a,
  skyBottom:  0x0a0e27,
  amber:      0xf59e0b,
  amberLight: 0xfbbf24,
  amberDark:  0xd97706,
  purple:     0x8b5cf6,
  white:      0xffffff,
  black:      0x000000,
}

const QUESTIONS = [
  '¿Qué tema quieres explorar?',
  '¿Cuál es tu objetivo de hoy?',
]

export interface NuevaSesionWorldEngine {
  destroy(): void
  setStep(step: number): void
  celebrate(): void
  triggerLaunch(): void
}

export async function initNuevaSesionWorld(
  container: HTMLDivElement
): Promise<NuevaSesionWorldEngine> {
  const app = new Application()
  await app.init({
    width: W,
    height: H,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  const canvas = app.canvas as HTMLCanvasElement
  canvas.style.pointerEvents = 'none'
  container.appendChild(canvas)

  const bgL    = new Container()
  const worldL = new Container()
  const fxL    = new Container()
  const uiL    = new Container()
  app.stage.addChild(bgL, worldL, fxL, uiL)

  // Gradient background
  const sky = new Graphics()
  for (let y = 0; y < H; y += 3) {
    const t = y / H
    const r = Math.round(lerp(26, 10, t))
    const g = Math.round(lerp(31, 14, t))
    const b = Math.round(lerp(58, 39, t))
    sky.rect(0, y, W, 3)
    sky.fill({ color: (r << 16) | (g << 8) | b })
  }
  bgL.addChild(sky)

  // Hex grid
  const hexGrid = new Graphics()
  const hexR = 42
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 12; col++) {
      const cx = col * hexR * 1.8 + (row % 2) * hexR * 0.9
      const cy = row * hexR * 1.56
      const pts: number[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        pts.push(cx + Math.cos(a) * hexR, cy + Math.sin(a) * hexR)
      }
      hexGrid.poly(pts)
      hexGrid.fill({ color: C.amber, alpha: 0.01 })
      hexGrid.poly(pts)
      hexGrid.stroke({ color: C.amber, width: 1, alpha: 0.028 })
    }
  }
  bgL.addChild(hexGrid)

  // Stars
  type Star = { g: Graphics; phase: number; speed: number; base: number }
  const stars: Star[] = []
  for (let i = 0; i < 52; i++) {
    const s = new Graphics()
    s.circle(0, 0, Math.random() < 0.25 ? 1.5 : 1)
    s.fill({ color: C.amberLight, alpha: 1 })
    s.x = rnd(0, W)
    s.y = rnd(0, H * 0.7)
    const base = rnd(0.12, 0.65)
    s.alpha = base
    bgL.addChild(s)
    stars.push({ g: s, phase: rnd(0, Math.PI * 2), speed: rnd(0.8, 2.4), base })
  }

  // ── Bee (left side, facing right toward portal) ──────────────────────────
  const bee = new Container()
  bee.x = 215
  bee.y = 278

  const beeG = new Graphics()
  beeG.ellipse(-13, -7, 12, 6)
  beeG.fill({ color: C.white, alpha: 0.55 })
  beeG.ellipse(13, -7, 12, 6)
  beeG.fill({ color: C.white, alpha: 0.55 })
  beeG.ellipse(0, 2, 12, 15)
  beeG.fill({ color: C.amber })
  beeG.rect(-11, -2, 22, 3)
  beeG.fill({ color: C.black, alpha: 0.75 })
  beeG.rect(-11, 4, 22, 3)
  beeG.fill({ color: C.black, alpha: 0.75 })
  beeG.circle(0, -12, 9)
  beeG.fill({ color: C.amber })
  beeG.circle(-3.5, -14, 2.2)
  beeG.fill({ color: C.black })
  beeG.circle(3.5, -14, 2.2)
  beeG.fill({ color: C.black })
  beeG.moveTo(-2, -20)
  beeG.lineTo(-5, -28)
  beeG.stroke({ color: C.black, width: 1.2 })
  beeG.moveTo(2, -20)
  beeG.lineTo(5, -28)
  beeG.stroke({ color: C.black, width: 1.2 })
  beeG.circle(-5, -28, 1.8)
  beeG.fill({ color: C.black })
  beeG.circle(5, -28, 1.8)
  beeG.fill({ color: C.black })
  bee.addChild(beeG)
  // Face right (mirror)
  bee.scale.x = -1
  worldL.addChild(bee)

  // ── Speech bubble (above bee) ────────────────────────────────────────────
  const bubble = new Container()
  bubble.x = 215
  bubble.y = 162

  const bubbleBg = new Graphics()
  bubble.addChild(bubbleBg)

  const bubbleTxt = new Text({
    text: QUESTIONS[0],
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 13,
      fontWeight: '700',
      fill: C.white,
      wordWrap: true,
      wordWrapWidth: 170,
      align: 'center',
    },
  })
  bubbleTxt.anchor.set(0.5, 0.5)
  bubble.addChild(bubbleTxt)
  uiL.addChild(bubble)

  function redrawBubble(text: string) {
    bubbleTxt.text = text
    const pad = 18
    const bw = Math.max(bubbleTxt.width + pad * 2, 140)
    const bh = bubbleTxt.height + pad
    bubbleBg.clear()
    bubbleBg.roundRect(-bw / 2, -bh / 2, bw, bh, 12)
    bubbleBg.fill({ color: 0x111827, alpha: 0.94 })
    bubbleBg.roundRect(-bw / 2, -bh / 2, bw, bh, 12)
    bubbleBg.stroke({ color: C.amber, width: 1.5, alpha: 0.65 })
    bubbleBg.moveTo(-8, bh / 2)
    bubbleBg.lineTo(0, bh / 2 + 13)
    bubbleBg.lineTo(8, bh / 2)
    bubbleBg.fill({ color: 0x111827, alpha: 0.94 })
    bubbleBg.moveTo(-7, bh / 2 - 1)
    bubbleBg.lineTo(0, bh / 2 + 12)
    bubbleBg.lineTo(7, bh / 2 - 1)
    bubbleBg.stroke({ color: C.amber, width: 1.5, alpha: 0.65 })
  }
  redrawBubble(QUESTIONS[0])

  // ── Mission portal (right side) ──────────────────────────────────────────
  const PORTAL_X = 565
  const PORTAL_Y = 290

  const portal = new Container()
  portal.x = PORTAL_X
  portal.y = PORTAL_Y
  worldL.addChild(portal)

  // Pre-built portal rings — rotated in ticker, never clear/redraw
  const NS_RING_DEFS = [
    { r: 76, color: C.amber,  alphaBase: 0.10, dir:  0.5  },
    { r: 54, color: C.purple, alphaBase: 0.19, dir: -0.40 },
    { r: 34, color: C.amber,  alphaBase: 0.36, dir:  0.70 },
  ]
  const portalRings = NS_RING_DEFS.map(def => {
    const c = new Container()
    const g = new Graphics()
    const pts: number[] = []
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i - Math.PI / 2
      pts.push(Math.cos(ang) * def.r, Math.sin(ang) * def.r)
    }
    g.poly(pts)
    g.fill({ color: def.color, alpha: def.alphaBase })
    g.poly(pts)
    g.stroke({ color: def.color === C.amber ? C.amberLight : C.purple, width: 1.8, alpha: def.alphaBase * 2.2 })
    c.addChild(g)
    portal.addChild(c)
    return { c, def }
  })
  const portalCore = new Graphics()
  portalCore.circle(0, 0, 20)
  portalCore.fill({ color: C.amber, alpha: 0.75 })
  portalCore.circle(0, 0, 11)
  portalCore.fill({ color: C.white, alpha: 0.65 })
  portal.addChild(portalCore)

  // Burst wave — only during launch (few frames, acceptable clear/redraw)
  const burstWave = new Graphics()
  portal.addChild(burstWave)

  // "MISIÓN" label (added last so it renders above rings)
  const missionLabel = new Text({
    text: 'M I S I Ó N',
    style: {
      fontFamily: 'monospace',
      fontSize: 9,
      fontWeight: 'bold',
      fill: C.amber,
      letterSpacing: 3,
    },
  })
  missionLabel.anchor.set(0.5, 1)
  missionLabel.y = -90
  missionLabel.alpha = 0.65
  portal.addChild(missionLabel)

  // Honey threads from bee to portal
  const threads = new Graphics()
  worldL.addChildAt(threads, 0)

  // Progress orbs (2 steps)
  const orbs: Graphics[] = []
  for (let i = 0; i < 2; i++) {
    const orb = new Graphics()
    orb.x = W / 2 - 16 + i * 32
    orb.y = 564
    uiL.addChild(orb)
    orbs.push(orb)
  }

  function drawOrbs(step: number) {
    orbs.forEach((orb, i) => {
      orb.clear()
      if (i < step) {
        orb.circle(0, 0, 9)
        orb.fill({ color: C.amber })
        orb.circle(0, 0, 4)
        orb.fill({ color: C.amberDark })
      } else if (i === step) {
        orb.circle(0, 0, 9)
        orb.fill({ color: C.amber, alpha: 0.28 })
        orb.circle(0, 0, 9)
        orb.stroke({ color: C.amber, width: 2 })
        orb.circle(0, 0, 4)
        orb.fill({ color: C.amber })
      } else {
        orb.circle(0, 0, 9)
        orb.fill({ color: C.amber, alpha: 0.1 })
        orb.circle(0, 0, 9)
        orb.stroke({ color: C.amber, width: 1, alpha: 0.28 })
      }
    })
  }
  drawOrbs(0)

  // Pollen
  type Pollen = { g: Graphics; vx: number; vy: number; ph: number }
  const pollens: Pollen[] = []
  for (let i = 0; i < 20; i++) {
    const p = new Graphics()
    p.circle(0, 0, rnd(1.2, 2.8))
    p.fill({ color: C.amberLight, alpha: rnd(0.2, 0.45) })
    p.x = rnd(0, W)
    p.y = rnd(0, H)
    fxL.addChild(p)
    pollens.push({ g: p, vx: rnd(-4, 4), vy: rnd(-12, -18), ph: rnd(0, Math.PI * 2) })
  }

  // Burst particles
  type Particle = { g: Graphics; vx: number; vy: number; life: number; decay: number }
  let particles: Particle[] = []

  function burst(x: number, y: number, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      const g = new Graphics()
      g.circle(0, 0, rnd(2, 4))
      g.fill({ color, alpha: 0.95 })
      g.x = x + rnd(-25, 25)
      g.y = y + rnd(-15, 15)
      const a = rnd(0, Math.PI * 2)
      const sp = rnd(55, 145)
      particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 55, life: rnd(0.7, 1.2), decay: rnd(0.8, 1.4) })
      fxL.addChild(g)
    }
  }

  // Resize
  const ro = new ResizeObserver(() => {
    const rect = container.getBoundingClientRect()
    const scale = Math.min(rect.width / W, rect.height / H, 1)
    canvas.style.width = `${W * scale}px`
    canvas.style.height = `${H * scale}px`
  })
  ro.observe(container)
  {
    const rect = container.getBoundingClientRect()
    const scale = Math.min(rect.width / W, rect.height / H, 1)
    canvas.style.width = `${W * scale}px`
    canvas.style.height = `${H * scale}px`
  }

  // State
  let time = 0
  let beeJumpT  = -1
  let beeBaseX  = 215
  let beeBaseY  = 278
  let launching = false
  let launchT   = 0

  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime / 60
    time += dt

    stars.forEach(s => {
      s.g.alpha = s.base + Math.sin(time * s.speed + s.phase) * 0.13
    })

    if (beeJumpT >= 0) {
      beeJumpT += dt * 2.8
      if (beeJumpT >= 1) beeJumpT = -1
    }
    const jumpOffset = beeJumpT >= 0 ? -Math.sin(Math.min(beeJumpT, 1) * Math.PI) * 26 : 0

    if (!launching) {
      bee.y = beeBaseY + jumpOffset + Math.sin(time * 2.2) * 4
    }

    bubble.scale.set(0.97 + Math.sin(time * 1.6) * 0.018)

    // Honey thread bee → portal
    threads.clear()
    const bx = bee.x
    const by = bee.y
    const px = PORTAL_X
    const py = PORTAL_Y
    for (let d = 0; d < 3; d++) {
      const t2 = (d + 0.5) / 3
      const mx = lerp(bx, px, t2)
      const my = lerp(by, py, t2) + Math.sin(t2 * Math.PI) * 22
      const dl = 4 + Math.sin(time * 3 + d * 2) * 1.5
      threads.moveTo(mx, my)
      threads.lineTo(mx, my + dl)
      threads.stroke({ color: C.amber, width: 1.8, alpha: 0.28 })
      threads.ellipse(mx, my + dl, 1.8, 2.5)
      threads.fill({ color: C.amber, alpha: 0.32 })
    }
    threads.moveTo(bx, by)
    for (let x = 0; x <= 1; x += 0.05) {
      const tx = lerp(bx, px, x)
      const ty = lerp(by, py, x) + Math.sin(x * Math.PI) * 20 + Math.sin(time * 2 + x * 5) * 2
      threads.lineTo(tx, ty)
    }
    threads.stroke({ color: C.amber, width: 2.5, alpha: 0.15 })

    // Portal draw
    const lt = launching ? launchT : 0
    drawPortal(time, lt)

    if (launching) {
      launchT += dt * 1.0
      const dx = PORTAL_X - bee.x
      const dy = PORTAL_Y - bee.y
      bee.x += dx * dt * 4
      bee.y += dy * dt * 4
      const shrink = Math.max(0, 1 - launchT * 0.95)
      bee.scale.x = -shrink
      bee.scale.y = shrink
    }

    pollens.forEach(p => {
      p.g.x += (p.vx + Math.sin(time * 0.7 + p.ph) * 5) * dt
      p.g.y += p.vy * dt
      p.g.alpha = 0.25 + Math.sin(time * 1.5 + p.ph) * 0.15
      if (p.g.y < -10) { p.g.y = H + 10; p.g.x = rnd(0, W) }
      if (p.g.x < -10) p.g.x = W + 10
      if (p.g.x > W + 10) p.g.x = -10
    })

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life -= dt * p.decay
      p.g.x += p.vx * dt
      p.g.y += p.vy * dt
      p.vy += 100 * dt
      p.g.alpha = Math.max(0, p.life)
      p.g.scale.set(Math.max(0.1, p.life))
      if (p.life <= 0) {
        fxL.removeChild(p.g)
        p.g.destroy()
        particles.splice(i, 1)
      }
    }
  })

  return {
    destroy() {
      ro.disconnect()
      app.ticker.stop()
      app.destroy(true, { children: true, texture: true })
    },
    setStep(step: number) {
      if (step < QUESTIONS.length) redrawBubble(QUESTIONS[step])
      drawOrbs(step)
      beeJumpT = 0
    },
    celebrate() {
      beeJumpT = 0
      burst(PORTAL_X, PORTAL_Y, C.amber, 18)
      burst(PORTAL_X, PORTAL_Y, C.purple, 10)
    },
    triggerLaunch() {
      launching = true
      launchT = 0
      burst(PORTAL_X, PORTAL_Y, C.amber, 32)
      burst(PORTAL_X, PORTAL_Y, C.white, 14)
    },
  }
}
