/**
 * heroMiniWorldEngine.ts — Motor puro del mini-mundo PixiJS del Hero
 *
 * Mundo autónomo e independiente de mundo2. Muestra 3 islas flotantes
 * representando Bun, Gemma 4 y PixiJS, con una abeja guía interactiva.
 * Fondo: cielo espacial, nubes, panal cósmico, mar de néctar, polen dorado.
 */

import { Application, Container, Graphics, Text } from 'pixi.js'
import { randomRange, lerp } from '../../canvaslearn/mundo2/constants'

// ─── Constantes del mini-mundo ───────────────────────────────────────────────

const WORLD_W = 600
const WORLD_H = 500

const COLORS = {
  bun: 0xfbbf24,
  bunLight: 0xfde68a,
  bunDark: 0xd97706,
  gemmaBlue: 0x4285f4,
  gemmaGreen: 0x34a853,
  gemmaRed: 0xea4335,
  gemmaYellow: 0xfbbc05,
  pixiMagenta: 0xe91e63,
  pixiPurple: 0x8b5cf6,
  pixiCyan: 0x06b6d4,
  amber: 0xf59e0b,
  white: 0xffffff,
  black: 0x000000,
  textMuted: 0x888888,
  skyTop: 0x1a1f3a,
  skyBottom: 0x0a0e27,
  nectar: 0xd97706,
  nectarLight: 0xfbbf24,
  honey: 0xf59e0b,
}

const ISLANDS_DATA = [
  {
    id: 'bun',
    name: 'Bun',
    emoji: '⚡',
    x: 120,
    y: 280,
    baseColor: COLORS.bun,
    accentColor: COLORS.bunLight,
    darkColor: COLORS.bunDark,
  },
  {
    id: 'gemma',
    name: 'Gemma 4',
    emoji: '🧠',
    x: 300,
    y: 240,
    baseColor: COLORS.gemmaBlue,
    accentColor: COLORS.gemmaGreen,
    darkColor: 0x1a73e8,
  },
  {
    id: 'pixi',
    name: 'PixiJS',
    emoji: '🎮',
    x: 480,
    y: 280,
    baseColor: COLORS.pixiMagenta,
    accentColor: COLORS.pixiPurple,
    darkColor: 0xc2185b,
  },
]

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface MiniParticle {
  g: Graphics
  vx: number
  vy: number
  life: number
  maxLife: number
  decay: number
}

interface FloatingLabel {
  text: Text
  life: number
  maxLife: number
  vy: number
}

interface IslandState {
  container: Container
  baseY: number
  floatOffset: number
  floatSpeed: number
  id: string
  name: string
  color: number
  scaleAnim: { active: boolean; t: number; from: number; to: number }
}

interface Star {
  g: Graphics
  phase: number
  speed: number
  baseAlpha: number
}

interface Cloud {
  g: Graphics
  x: number
  y: number
  speed: number
  scale: number
}

interface Pollen {
  g: Graphics
  vy: number
  vx: number
  phase: number
}

// ─── Utilidades de dibujo ────────────────────────────────────────────────────

function drawBunIcon(g: Graphics, color: number, lightColor: number) {
  g.ellipse(0, 0, 22, 18)
  g.fill({ color, alpha: 1 })
  g.ellipse(0, -5, 16, 10)
  g.fill({ color: lightColor, alpha: 0.6 })
  g.circle(-8, -2, 2.5)
  g.fill({ color: COLORS.black, alpha: 0.8 })
  g.circle(8, -2, 2.5)
  g.fill({ color: COLORS.black, alpha: 0.8 })
  g.arc(0, 2, 8, 0, Math.PI)
  g.stroke({ color: COLORS.black, width: 1.5, alpha: 0.6 })
  g.circle(-12, 2, 3)
  g.fill({ color: COLORS.bunDark, alpha: 0.3 })
  g.circle(12, 2, 3)
  g.fill({ color: COLORS.bunDark, alpha: 0.3 })
}

function drawGemmaIcon(g: Graphics) {
  const r = 24
  const points: number[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    points.push(Math.cos(angle) * r, Math.sin(angle) * r)
  }
  g.poly(points)
  g.fill({ color: COLORS.gemmaBlue, alpha: 0.9 })
  g.poly(points)
  g.stroke({ color: COLORS.gemmaYellow, width: 2, alpha: 0.8 })
  const innerR = 12
  const innerPoints: number[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    innerPoints.push(Math.cos(angle) * innerR, Math.sin(angle) * innerR)
  }
  g.poly(innerPoints)
  g.fill({ color: COLORS.gemmaGreen, alpha: 0.5 })
  g.circle(0, 0, 6)
  g.fill({ color: COLORS.gemmaYellow, alpha: 0.9 })
}

function drawPixiIcon(g: Graphics) {
  const outerR = 24
  const innerR = 10
  const points: number[] = []
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    points.push(Math.cos(angle) * r, Math.sin(angle) * r)
  }
  g.poly(points)
  g.fill({ color: COLORS.pixiMagenta, alpha: 0.9 })
  g.poly(points)
  g.stroke({ color: COLORS.pixiPurple, width: 2, alpha: 0.8 })
  g.circle(0, 0, 7)
  g.fill({ color: COLORS.pixiCyan, alpha: 0.8 })
}

function drawIslandBase(g: Graphics, color: number) {
  g.ellipse(0, 18, 55, 12)
  g.fill({ color: COLORS.black, alpha: 0.25 })
  g.ellipse(0, 0, 60, 22)
  g.fill({ color, alpha: 0.85 })
  g.ellipse(0, -4, 56, 18)
  g.fill({ color: COLORS.white, alpha: 0.15 })
  g.ellipse(0, 2, 50, 14)
  g.fill({ color, alpha: 0.4 })
}

function drawBee(g: Graphics) {
  g.ellipse(-10, -8, 10, 5)
  g.fill({ color: COLORS.white, alpha: 0.6 })
  g.ellipse(10, -8, 10, 5)
  g.fill({ color: COLORS.white, alpha: 0.6 })
  g.ellipse(0, 0, 10, 12)
  g.fill({ color: COLORS.amber, alpha: 1 })
  g.rect(-9, -4, 18, 3)
  g.fill({ color: COLORS.black, alpha: 0.8 })
  g.rect(-9, 2, 18, 3)
  g.fill({ color: COLORS.black, alpha: 0.8 })
  g.circle(0, -10, 7)
  g.fill({ color: COLORS.amber, alpha: 1 })
  g.circle(-3, -12, 1.8)
  g.fill({ color: COLORS.black, alpha: 0.9 })
  g.circle(3, -12, 1.8)
  g.fill({ color: COLORS.black, alpha: 0.9 })
  g.moveTo(-2, -16)
  g.lineTo(-4, -22)
  g.stroke({ color: COLORS.black, width: 1 })
  g.moveTo(2, -16)
  g.lineTo(4, -22)
  g.stroke({ color: COLORS.black, width: 1 })
  g.circle(-4, -22, 1.5)
  g.fill({ color: COLORS.black, alpha: 0.8 })
  g.circle(4, -22, 1.5)
  g.fill({ color: COLORS.black, alpha: 0.8 })
}

function drawCloud(g: Graphics) {
  g.ellipse(0, 0, 40, 18)
  g.fill({ color: COLORS.white, alpha: 0.08 })
  g.ellipse(20, -5, 30, 15)
  g.fill({ color: COLORS.white, alpha: 0.05 })
  g.ellipse(-15, 3, 25, 12)
  g.fill({ color: COLORS.white, alpha: 0.06 })
}

function drawHexBackground(g: Graphics) {
  const hexR = 45
  const rows = 8
  const cols = 10
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * hexR * 1.8 + (row % 2) * hexR * 0.9
      const cy = row * hexR * 1.5
      const points: number[] = []
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        points.push(cx + Math.cos(angle) * hexR, cy + Math.sin(angle) * hexR)
      }
      g.poly(points)
      g.fill({ color: COLORS.amber, alpha: 0.015 })
      g.poly(points)
      g.stroke({ color: COLORS.amber, width: 1, alpha: 0.04 })
    }
  }
}

// ─── Motor principal ─────────────────────────────────────────────────────────

export interface HeroMiniWorldEngine {
  destroy: () => void
}

export async function initHeroMiniWorld(
  container: HTMLDivElement
): Promise<HeroMiniWorldEngine> {
  const app = new Application()
  await app.init({
    width: WORLD_W,
    height: WORLD_H,
    background: 0x0a0e27,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    eventMode: 'static',
  })

  container.appendChild(app.canvas as HTMLCanvasElement)

  // ─── Capas del mundo ───────────────────────────────────────────────────────
  const bgLayer = new Container()
  const midLayer = new Container()
  const islandLayer = new Container()
  const fxLayer = new Container()
  const uiLayer = new Container()

  app.stage.addChild(bgLayer)
  app.stage.addChild(midLayer)
  app.stage.addChild(islandLayer)
  app.stage.addChild(fxLayer)
  app.stage.addChild(uiLayer)

  // ─── Fondo base sólido (visible) ───────────────────────────────────────────
  const skyBg = new Graphics()
  skyBg.rect(0, 0, WORLD_W, WORLD_H)
  skyBg.fill({ color: 0x121530, alpha: 1 })
  bgLayer.addChild(skyBg)

  // ─── Estrellas parpadeantes ────────────────────────────────────────────────
  const stars: Star[] = []
  for (let i = 0; i < 50; i++) {
    const s = new Graphics()
    const size = Math.random() < 0.3 ? 2.5 : 1.5
    s.circle(0, 0, size)
    s.fill({ color: 0xffd700, alpha: 1 })
    s.x = randomRange(10, WORLD_W - 10)
    s.y = randomRange(10, WORLD_H * 0.65)
    const baseAlpha = randomRange(0.5, 1.0)
    s.alpha = baseAlpha
    bgLayer.addChild(s)
    stars.push({
      g: s,
      phase: randomRange(0, Math.PI * 2),
      speed: randomRange(1.5, 3.5),
      baseAlpha,
    })
  }

  // ─── Nubes flotantes ───────────────────────────────────────────────────────
  const clouds: Cloud[] = []
  for (let i = 0; i < 5; i++) {
    const c = new Graphics()
    c.ellipse(0, 0, 40, 16)
    c.fill({ color: 0xffffff, alpha: 0.15 })
    c.ellipse(18, -5, 28, 14)
    c.fill({ color: 0xffffff, alpha: 0.1 })
    c.ellipse(-14, 3, 24, 12)
    c.fill({ color: 0xffffff, alpha: 0.12 })
    const cloud: Cloud = {
      g: c,
      x: randomRange(-50, WORLD_W + 50),
      y: randomRange(40, 170),
      speed: randomRange(2, 6),
      scale: randomRange(0.6, 1.0),
    }
    c.x = cloud.x
    c.y = cloud.y
    c.scale.set(cloud.scale)
    bgLayer.addChild(c)
    clouds.push(cloud)
  }

  // ─── Mar de néctar dorado (ondas) ──────────────────────────────────────────
  const seaContainer = new Container()
  const seaWaves: Graphics[] = []
  for (let i = 0; i < 4; i++) {
    const w = new Graphics()
    seaWaves.push(w)
    seaContainer.addChild(w)
  }
  seaContainer.y = WORLD_H - 85
  midLayer.addChild(seaContainer)

  // ─── Polen dorado flotante ─────────────────────────────────────────────────
  const pollens: Pollen[] = []
  for (let i = 0; i < 30; i++) {
    const p = new Graphics()
    const size = randomRange(2, 3.5)
    p.circle(0, 0, size)
    p.fill({ color: 0xfbbf24, alpha: randomRange(0.7, 1.0) })
    p.x = randomRange(0, WORLD_W)
    p.y = randomRange(WORLD_H - 80, WORLD_H)
    fxLayer.addChild(p)
    pollens.push({
      g: p,
      vy: randomRange(-10, -20),
      vx: randomRange(-6, 6),
      phase: randomRange(0, Math.PI * 2),
    })
  }

  // ─── Hilos de miel conectando islas ────────────────────────────────────────
  const honeyThreads = new Graphics()
  islandLayer.addChildAt(honeyThreads, 0)

  // ─── Estado ────────────────────────────────────────────────────────────────
  const islands: IslandState[] = []
  let particles: MiniParticle[] = []
  let floatingLabels: FloatingLabel[] = []

  // Abeja
  const bee = new Graphics()
  drawBee(bee)
  bee.x = ISLANDS_DATA[0].x
  bee.y = ISLANDS_DATA[0].y - 50
  islandLayer.addChild(bee)

  const beeState = {
    targetX: bee.x,
    targetY: bee.y,
    isJumping: false,
    jumpT: 0,
    jumpDuration: 0.8,
    startX: bee.x,
    startY: bee.y,
    wingPhase: 0,
  }

  // ─── Letrero HiveLearn ─────────────────────────────────────────────────────
  const titleContainer = new Container()
  titleContainer.x = WORLD_W / 2
  titleContainer.y = 42
  uiLayer.addChild(titleContainer)

  const titleText = new Text({
    text: 'HiveLearn',
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 30,
      fontWeight: '900',
      fill: '#ffffff',
      letterSpacing: 2,
      dropShadow: {
        color: '#f59e0b',
        alpha: 0.6,
        blur: 12,
        distance: 0,
        angle: 0,
      },
    },
  })
  titleText.anchor.set(0.5, 0.5)
  titleContainer.addChild(titleText)

  const subtitleText = new Text({
    text: 'Mini-mundo de aprendizaje',
    style: {
      fontFamily: 'monospace',
      fontSize: 9,
      fill: 'rgba(255,255,255,0.35)',
      letterSpacing: 2,
    },
  })
  subtitleText.anchor.set(0.5, 0)
  subtitleText.y = 22
  titleContainer.addChild(subtitleText)

  // ─── Crear islas ───────────────────────────────────────────────────────────
  ISLANDS_DATA.forEach((data, index) => {
    const islandContainer = new Container()
    islandContainer.x = data.x
    islandContainer.y = data.y
    islandContainer.eventMode = 'static'
    islandContainer.cursor = 'pointer'

    const base = new Graphics()
    drawIslandBase(base, data.baseColor)
    islandContainer.addChild(base)

    const icon = new Graphics()
    if (data.id === 'bun') drawBunIcon(icon, data.baseColor, data.accentColor)
    else if (data.id === 'gemma') drawGemmaIcon(icon)
    else drawPixiIcon(icon)
    icon.y = -35
    islandContainer.addChild(icon)

    const label = new Text({
      text: data.name,
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        fontWeight: 'bold',
        fill: '#ffffff',
        letterSpacing: 1,
        dropShadow: {
          color: '#000000',
          alpha: 0.8,
          blur: 4,
          distance: 0,
          angle: 0,
        },
      },
    })
    label.anchor.set(0.5, 0)
    label.y = 28
    islandContainer.addChild(label)

    const hit = new Graphics()
    hit.ellipse(0, 0, 65, 35)
    hit.fill({ color: 0xffffff, alpha: 0.001 })
    islandContainer.addChild(hit)

    islandContainer.on('pointerdown', () => {
      onIslandClick(index)
    })

    const islandState: IslandState = {
      container: islandContainer,
      baseY: data.y,
      floatOffset: randomRange(0, Math.PI * 2),
      floatSpeed: 0.8 + randomRange(0, 0.6),
      id: data.id,
      name: data.name,
      color: data.baseColor,
      scaleAnim: { active: false, t: 0, from: 1, to: 1 },
    }

    islandContainer.on('pointerover', () => {
      islandContainer.scale.set(1.08)
    })
    islandContainer.on('pointerout', () => {
      if (!islandState.scaleAnim.active) {
        islandContainer.scale.set(1)
      }
    })

    islandLayer.addChild(islandContainer)
    islands.push(islandState)
  })

  // ─── Texto inferior ────────────────────────────────────────────────────────
  const footerText = new Text({
    text: 'HiveLearn potenciado por Bun + Gemma 4 + PixiJS',
    style: {
      fontFamily: 'monospace',
      fontSize: 10,
      fill: 'rgba(255,255,255,0.25)',
      letterSpacing: 1,
    },
  })
  footerText.anchor.set(0.5, 1)
  footerText.x = WORLD_W / 2
  footerText.y = WORLD_H - 12
  uiLayer.addChild(footerText)

  // ─── Funciones de interacción ──────────────────────────────────────────────

  function onIslandClick(index: number) {
    const island = islands[index]
    const data = ISLANDS_DATA[index]

    island.scaleAnim = { active: true, t: 0, from: 1, to: 1.15 }

    if (!beeState.isJumping) {
      beeState.isJumping = true
      beeState.jumpT = 0
      beeState.startX = bee.x
      beeState.startY = bee.y
      beeState.targetX = data.x
      beeState.targetY = data.y - 55
    }

    emitParticles(data.x, data.y - 20, data.baseColor, 30)
    emitParticles(data.x, data.y - 20, COLORS.white, 10)
    spawnFloatingText(data.x, data.y - 70, `${data.emoji} ${data.name}`, data.baseColor)
  }

  function emitParticles(x: number, y: number, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const g = new Graphics()
      const size = randomRange(2, 5)
      g.circle(0, 0, size)
      g.fill({ color, alpha: 0.9 })
      g.x = x + randomRange(-20, 20)
      g.y = y + randomRange(-10, 10)

      const angle = randomRange(0, Math.PI * 2)
      const speed = randomRange(40, 140)
      const p: MiniParticle = {
        g,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: randomRange(0.5, 1.2),
        maxLife: 1,
        decay: randomRange(0.8, 1.5),
      }
      particles.push(p)
      fxLayer.addChild(g)
    }
  }

  function spawnFloatingText(x: number, y: number, textStr: string, color: number) {
    const t = new Text({
      text: textStr,
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: color,
        dropShadow: {
          color: '#000000',
          alpha: 0.8,
          blur: 6,
          distance: 0,
          angle: 0,
        },
      },
    })
    t.anchor.set(0.5, 1)
    t.x = x
    t.y = y
    fxLayer.addChild(t)

    floatingLabels.push({
      text: t,
      life: 1.5,
      maxLife: 1.5,
      vy: -40,
    })
  }

  // ─── Resize handler ────────────────────────────────────────────────────────

  const resizeObserver = new ResizeObserver(() => {
    const rect = container.getBoundingClientRect()
    const scale = Math.min(rect.width / WORLD_W, rect.height / WORLD_H, 1)
    const canvas = app.canvas as HTMLCanvasElement
    canvas.style.width = `${WORLD_W * scale}px`
    canvas.style.height = `${WORLD_H * scale}px`
  })
  resizeObserver.observe(container)

  const rect = container.getBoundingClientRect()
  const initialScale = Math.min(rect.width / WORLD_W, rect.height / WORLD_H, 1)
  ;(app.canvas as HTMLCanvasElement).style.width = `${WORLD_W * initialScale}px`
  ;(app.canvas as HTMLCanvasElement).style.height = `${WORLD_H * initialScale}px`

  // ─── Game Loop ─────────────────────────────────────────────────────────────

  let time = 0

  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime / 60
    time += dt

    // ─── Estrellas parpadeantes ──────────────────────────────────────────────
    stars.forEach((star) => {
      const alpha = star.baseAlpha + Math.sin(time * star.speed + star.phase) * 0.15
      star.g.alpha = Math.max(0.1, Math.min(1, alpha))
    })

    // ─── Nubes flotantes ─────────────────────────────────────────────────────
    clouds.forEach((cloud) => {
      cloud.x += cloud.speed * dt
      if (cloud.x > WORLD_W + 80) cloud.x = -80
      cloud.g.x = cloud.x
      cloud.g.y = cloud.y + Math.sin(time * 0.5 + cloud.x * 0.01) * 3
    })

    // ─── Ondas del mar de néctar ─────────────────────────────────────────────
    seaWaves.forEach((wave, i) => {
      wave.clear()
      const yOffset = i * 14
      const alpha = 0.15 + i * 0.06
      const color = i % 2 === 0 ? COLORS.nectar : COLORS.nectarLight
      wave.moveTo(0, yOffset)
      for (let x = 0; x <= WORLD_W; x += 4) {
        const waveY =
          yOffset +
          Math.sin((x + time * 30 + i * 80) * 0.015) * 8 +
          Math.sin((x + time * 20 + i * 120) * 0.01) * 5
        wave.lineTo(x, waveY)
      }
      wave.lineTo(WORLD_W, 90)
      wave.lineTo(0, 90)
      wave.closePath()
      wave.fill({ color, alpha })
    })

    // ─── Polen dorado ────────────────────────────────────────────────────────
    pollens.forEach((pollen) => {
      pollen.g.x += (pollen.vx + Math.sin(time + pollen.phase) * 8) * dt
      pollen.g.y += pollen.vy * dt
      pollen.g.alpha = 0.4 + Math.sin(time * 2 + pollen.phase) * 0.2
      if (pollen.g.y < WORLD_H - 120) {
        pollen.g.y = WORLD_H
        pollen.g.x = randomRange(0, WORLD_W)
      }
      if (pollen.g.x < -10) pollen.g.x = WORLD_W + 10
      if (pollen.g.x > WORLD_W + 10) pollen.g.x = -10
    })

    // ─── Hilos de miel ───────────────────────────────────────────────────────
    honeyThreads.clear()
    for (let i = 0; i < ISLANDS_DATA.length - 1; i++) {
      const a = ISLANDS_DATA[i]
      const b = ISLANDS_DATA[i + 1]
      const islandA = islands[i]
      const islandB = islands[i + 1]
      const ax = a.x
      const ay = islandA.container.y + 10
      const bx = b.x
      const by = islandB.container.y + 10

      // Gotas de miel cayendo
      const dropCount = 4
      for (let d = 0; d < dropCount; d++) {
        const t2 = (d + 0.5) / dropCount
        const dx = lerp(ax, bx, t2)
        const dy = lerp(ay, by, t2) + Math.sin(t2 * Math.PI) * 25
        const dropLen = 4 + Math.sin(time * 3 + d * 2 + i) * 2
        honeyThreads.moveTo(dx, dy)
        honeyThreads.lineTo(dx, dy + dropLen)
        honeyThreads.stroke({ color: COLORS.honey, width: 2, alpha: 0.35 })
        // Gota en la punta
        honeyThreads.ellipse(dx, dy + dropLen, 2, 3)
        honeyThreads.fill({ color: COLORS.honey, alpha: 0.4 })
      }

      // Línea principal ondulada
      honeyThreads.moveTo(ax, ay)
      for (let x = 0; x <= 1; x += 0.05) {
        const px = lerp(ax, bx, x)
        const py = lerp(ay, by, x) + Math.sin(x * Math.PI) * 20 + Math.sin(time * 2 + x * 6) * 2
        honeyThreads.lineTo(px, py)
      }
      honeyThreads.stroke({ color: COLORS.honey, width: 3, alpha: 0.2 })

      // Brillo interno
      honeyThreads.moveTo(ax, ay)
      for (let x = 0; x <= 1; x += 0.05) {
        const px = lerp(ax, bx, x)
        const py = lerp(ay, by, x) + Math.sin(x * Math.PI) * 20 + Math.sin(time * 2 + x * 6) * 2
        honeyThreads.lineTo(px, py)
      }
      honeyThreads.stroke({ color: COLORS.nectarLight, width: 1, alpha: 0.3 })
    }

    // ─── Flotación de islas ──────────────────────────────────────────────────
    islands.forEach((island) => {
      const floatY = Math.sin(time * island.floatSpeed + island.floatOffset) * 6
      island.container.y = island.baseY + floatY

      if (island.scaleAnim.active) {
        island.scaleAnim.t += dt * 4
        if (island.scaleAnim.t >= 1) {
          island.scaleAnim.active = false
          island.scaleAnim.t = 1
          island.container.scale.set(1)
        } else {
          const t2 = island.scaleAnim.t
          let s: number
          if (t2 < 0.3) {
            s = lerp(1, 1.15, t2 / 0.3)
          } else if (t2 < 0.6) {
            s = lerp(1.15, 0.92, (t2 - 0.3) / 0.3)
          } else {
            s = lerp(0.92, 1, (t2 - 0.6) / 0.4)
          }
          island.container.scale.set(s)
        }
      }
    })

    // ─── Abeja ───────────────────────────────────────────────────────────────
    beeState.wingPhase += dt * 25

    if (beeState.isJumping) {
      beeState.jumpT += dt / beeState.jumpDuration
      if (beeState.jumpT >= 1) {
        beeState.jumpT = 1
        beeState.isJumping = false
        bee.x = beeState.targetX
        bee.y = beeState.targetY
      } else {
        const t2 = beeState.jumpT
        bee.x = lerp(beeState.startX, beeState.targetX, t2)
        const arcHeight = 60
        const arcY = -4 * arcHeight * t2 * (1 - t2)
        bee.y = lerp(beeState.startY, beeState.targetY, t2) + arcY
      }
    } else {
      bee.y += Math.sin(time * 3 + 1) * 0.3
    }

    const dx = beeState.targetX - bee.x
    bee.scale.x = dx > 0 ? 1 : -1

    // ─── Partículas de explosión ─────────────────────────────────────────────
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life -= dt * p.decay
      p.g.x += p.vx * dt
      p.g.y += p.vy * dt
      p.vy += 120 * dt
      p.g.alpha = Math.max(0, p.life)
      p.g.scale.set(Math.max(0, p.life))

      if (p.life <= 0) {
        fxLayer.removeChild(p.g)
        p.g.destroy()
        particles.splice(i, 1)
      }
    }

    // ─── Textos flotantes ────────────────────────────────────────────────────
    for (let i = floatingLabels.length - 1; i >= 0; i--) {
      const f = floatingLabels[i]
      f.life -= dt
      f.text.y += f.vy * dt
      f.text.alpha = Math.max(0, f.life / f.maxLife)
      if (f.life <= 0) {
        fxLayer.removeChild(f.text)
        f.text.destroy()
        floatingLabels.splice(i, 1)
      }
    }

    // ─── Glow pulsante del título ────────────────────────────────────────────
    const glowAlpha = 0.4 + Math.sin(time * 2.5) * 0.2
    titleText.style.dropShadow = {
      color: '#f59e0b',
      alpha: glowAlpha,
      blur: 12,
      distance: 0,
      angle: 0,
    }
  })

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  return {
    destroy: () => {
      resizeObserver.disconnect()
      app.ticker.stop()
      app.destroy(true, { children: true, texture: true })
    },
  }
}
