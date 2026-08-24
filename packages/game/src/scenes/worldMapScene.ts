/**
 * WorldMapScene — mapa estilo Mario World: los niveles del mundo (lección =
 * nodo) conectados por un camino de miel curvo. Solo el siguiente nivel sin
 * completar está desbloqueado; los completados muestran sus estrellas.
 *
 * Presentación: escala adaptativa al viewport, cielo 3D con sol/nubes,
 * decoración ambiental (nubes 2D, islas lejanas, polen), placas para
 * título/XP/hint, vignette y entrada cinematográfica. La lógica de
 * selección/desbloqueo/entrada al nivel no cambia.
 */

import { Container, FillGradient, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import type { LevelSpec } from '@hivelearn/core/lesson/levelSpec'
import { Scene } from '../engine/scene'
import { THEME_COLORS } from '../engine/textures'
import { Particles } from '../engine/particles'
import { buildLevelScene3D } from '../engine/three/builders'
import type { Scene3D } from '../engine/three/worldRenderer'
import type { Game } from '../game'
import { LevelScene } from './levelScene'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeOutBack = (t: number) => {
  const c = 1.70158
  const u = t - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}

interface MapNode {
  spec: LevelSpec
  x: number
  y: number
  unlocked: boolean
  stars: number
  view: Container
  hover: number
  popStart: number
}

interface Cloud { view: Container; speed: number; w: number }
interface Pollen { g: Graphics; vx: number; vy: number; phase: number }

export class WorldMapScene extends Scene {
  private nodes: MapNode[] = []
  private selected = 0
  private bee!: Sprite
  private beeFrames: Texture[] = []
  private hint!: Text
  private t = 0
  private scene3d: Scene3D | null = null
  private pathGfx: Graphics | null = null
  private pulseRings: Graphics[] = []
  private particles = new Particles()
  private sparkled = new Set<number>()
  private clouds: Cloud[] = []
  private pollen: Pollen[] = []
  private drips: Graphics[] = []
  private S = 1
  private nodeR = 26
  private beeArrived = false
  private beeStart = { x: 0, y: 0 }

  enter() {
    const g = this.game
    const world = g.world
    g.audio.playMusic('map')
    g.audio.setMusicTempo(g.theme.musicTempo)

    if (!world || world.levels.length === 0) {
      g.app.renderer.background.color = g.themedSky(0x1a1a2e)
      const t = new Text({
        text: 'No hay programa cargado todavía…',
        style: { fontFamily: 'monospace', fontSize: 24, fill: 0xffd700, fontWeight: 'bold', stroke: { color: 0x1a1a24, width: 4 } },
      })
      t.anchor.set(0.5)
      t.x = g.viewW / 2
      t.y = g.viewH / 2
      this.root.addChild(t)
      return
    }

    const colors = THEME_COLORS[world.theme]
    g.app.renderer.background.color = g.themedSky(colors.sky)

    // escala adaptativa: todo se dimensiona en función del viewport
    this.S = clamp(Math.min(g.viewW, g.viewH) / 500, 1, 2.4)
    const S = this.S
    this.nodeR = Math.round(26 * S)
    const R = this.nodeR

    // Fondo 3D: cielo ciclo día/noche con sol y nubes + polen flotante
    if (g.worldRenderer.isAlive) {
      this.scene3d = buildLevelScene3D()
      g.worldRenderer.setScene(this.scene3d)
      g.app.renderer.background.color = 0x000000
      g.app.renderer.background.alpha = 0
    }

    // ---- decoración ambiental (detrás de todo lo demás) ----
    this.buildClouds()
    this.buildFarIslands(colors.decor)
    this.buildAmbientPollen()
    this.root.addChild(this.particles.view)

    // ---- layout serpenteante ----
    const n = world.levels.length
    const marginX = g.viewW * 0.12
    const maxStep = 300 * S
    const rawStep = n > 1 ? (g.viewW - marginX * 2) / (n - 1) : 0
    const stepX = Math.min(rawStep, maxStep)
    const groupW = stepX * (n - 1)
    const startX = (g.viewW - groupW) / 2
    const midY = g.viewH * 0.52
    const amplitude = g.viewH * 0.16

    let firstLocked = -1
    world.levels.forEach((spec, i) => {
      const stars = g.progress.stars[spec.lessonId] ?? 0
      const prevDone = i === 0 || (g.progress.stars[world.levels[i - 1].lessonId] ?? 0) > 0
      const unlocked = prevDone && firstLocked === -1
      if (!unlocked && firstLocked === -1) firstLocked = i

      const x = startX + stepX * i
      const y = midY + (i % 2 === 0 ? -amplitude : amplitude)
      const view = new Container()
      view.scale.set(0)
      this.nodes.push({ spec, x, y, unlocked, stars, view, hover: 1, popStart: 0.35 + i * 0.14 })

      this.buildIsland(x, y + R + 52 * S, unlocked)
    })

    // camino entre nodos (se re-dibuja cada frame: curva + dash animado)
    this.pathGfx = new Graphics()
    this.root.addChild(this.pathGfx)
    this.drawPath(0, 0)

    // ---- nodos ----
    this.nodes.forEach((node, i) => this.buildNode(node, i))

    // seleccionar el primer nivel jugable (sin estrellas) por defecto
    const firstPlayable = this.nodes.findIndex(nd => nd.unlocked && nd.stars === 0)
    this.selected = firstPlayable >= 0 ? firstPlayable : 0

    // ---- abeja marcadora (entra volando desde fuera de pantalla) ----
    this.beeFrames = [g.textures.bee.idle, g.textures.bee.run1, g.textures.bee.idle, g.textures.bee.run2]
    this.bee = new Sprite(g.textures.bee.idle)
    this.bee.anchor.set(0.5, 1)
    this.bee.width = 40 * S
    this.bee.height = 40 * S
    const target = this.nodes[this.selected]
    this.beeStart = { x: -60 * S, y: (target?.y ?? midY) - 200 * S }
    this.bee.x = this.beeStart.x
    this.bee.y = this.beeStart.y
    this.root.addChild(this.bee)

    // ---- header / footer con placas ----
    this.buildHeader(world.nombre)
    this.buildHint()
    this.buildVignette()

    // entrada cinematográfica: fade + leve zoom-out
    this.root.alpha = 0
    this.root.scale.set(1.06)
    this.root.pivot.set(g.viewW / 2, g.viewH / 2)
    this.root.position.set(g.viewW / 2, g.viewH / 2)
  }

  exit() {
    this.scene3d?.dispose?.()
    this.scene3d = null
    this.game.worldRenderer.setScene(null)
    this.game.app.renderer.background.alpha = 1
  }

  // ---------------------------------------------------------------- construcción

  private buildClouds() {
    const g = this.game
    const S = this.S
    for (let i = 0; i < 7; i++) {
      const c = new Container()
      const puff = new Graphics()
      const scale = (0.7 + Math.random() * 0.9) * S
      const alpha = 0.35 + Math.random() * 0.4
      puff.ellipse(0, 0, 46, 20).fill({ color: 0xffffff, alpha })
      puff.ellipse(-32, 6, 28, 14).fill({ color: 0xffffff, alpha: alpha * 0.9 })
      puff.ellipse(34, 7, 30, 15).fill({ color: 0xffffff, alpha: alpha * 0.9 })
      puff.ellipse(8, -12, 26, 14).fill({ color: 0xffffff, alpha: alpha * 0.95 })
      c.addChild(puff)
      c.scale.set(scale)
      c.x = Math.random() * g.viewW
      c.y = g.viewH * (0.06 + Math.random() * 0.42)
      this.root.addChild(c)
      this.clouds.push({ view: c, speed: (6 + Math.random() * 12) * S, w: 110 * scale })
    }
  }

  private buildFarIslands(decorColor: string) {
    const g = this.game
    const S = this.S
    const decor = parseInt(decorColor.slice(1), 16)
    const spots: [number, number][] = [
      [g.viewW * 0.10, g.viewH * 0.74],
      [g.viewW * 0.90, g.viewH * 0.30],
      [g.viewW * 0.82, g.viewH * 0.80],
    ]
    for (const [x, y] of spots) {
      const isl = new Graphics()
      isl.ellipse(0, 0, 34 * S, 9 * S).fill({ color: 0x8d6e1e, alpha: 0.5 })
      isl.ellipse(0, -3 * S, 34 * S, 9 * S).fill({ color: 0xc98a1b, alpha: 0.55 })
      for (let f = 0; f < 3; f++) {
        isl.circle((f - 1) * 16 * S, -10 * S, 3.2 * S).fill({ color: decor, alpha: 0.7 })
      }
      isl.x = x
      isl.y = y
      this.root.addChild(isl)
    }
  }

  private buildAmbientPollen() {
    const g = this.game
    for (let i = 0; i < 22; i++) {
      const p = new Graphics()
      const r = 1.5 + Math.random() * 2
      p.circle(0, 0, r).fill({ color: 0xffe082, alpha: 0.35 + Math.random() * 0.3 })
      p.x = Math.random() * g.viewW
      p.y = Math.random() * g.viewH
      this.root.addChild(p)
      this.pollen.push({
        g: p,
        vx: (Math.random() - 0.5) * 14,
        vy: -4 - Math.random() * 8,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }

  private buildIsland(x: number, y: number, unlocked: boolean) {
    const S = this.S
    const island = new Graphics()
    // sombra proyectada bajo la isla
    island.ellipse(0, 16 * S, 62 * S, 10 * S).fill({ color: 0x1a1a24, alpha: 0.25 })
    // base rocosa + superficie de miel + borde de hierba
    island.ellipse(0, 0, 70 * S, 17 * S).fill({ color: 0x8d6e1e, alpha: 0.95 })
    island.ellipse(0, -5 * S, 70 * S, 17 * S).fill({ color: unlocked ? 0xffca28 : 0x6b6b7a, alpha: 0.97 })
    island.ellipse(0, -9 * S, 52 * S, 9 * S).fill({ color: unlocked ? 0xffe082 : 0x7c7c8c, alpha: 0.9 })
    island.x = x
    island.y = y
    this.root.addChild(island)

    // goteo de miel animado (solo en islas desbloqueadas)
    if (unlocked) {
      const drip = new Graphics()
      drip.circle(0, 0, 4 * S).fill({ color: 0xffb300, alpha: 0.9 })
      drip.x = x + 24 * S
      drip.y = y + 8 * S
      this.root.addChild(drip)
      this.drips.push(drip)
    }
  }

  private buildNode(node: MapNode, i: number) {
    const g = this.game
    const S = this.S
    const R = this.nodeR
    const c = node.view

    const base = new Graphics()
    // sombra del propio nodo
    base.ellipse(0, R * 0.35, R * 1.05, R * 0.9).fill({ color: 0x1a1a24, alpha: 0.22 })
    // anillo exterior + relleno + highlight
    base.circle(0, 0, R + 4 * S).fill(0x1a1a24)
    base.circle(0, 0, R).fill(node.unlocked ? 0xffb300 : 0x555566)
    base.ellipse(0, -R * 0.45, R * 0.55, R * 0.3).fill({ color: 0xffffff, alpha: node.unlocked ? 0.35 : 0.12 })
    c.addChild(base)

    const num = new Text({
      text: node.unlocked ? String(i + 1) : '🔒',
      style: { fontFamily: 'monospace', fontSize: Math.round(22 * S), fill: 0x1a1a24, fontWeight: 'bold' },
    })
    num.anchor.set(0.5)
    c.addChild(num)

    // estrellas ganadas
    for (let s = 0; s < node.stars; s++) {
      const star = new Sprite(g.textures.star)
      star.anchor.set(0.5)
      star.width = 18 * S
      star.height = 18 * S
      star.x = (s - (node.stars - 1) / 2) * 22 * S
      star.y = -R - 18 * S
      c.addChild(star)
    }

    // etiqueta con píldora
    const label = new Text({
      text: node.spec.titulo,
      style: {
        fontFamily: 'monospace', fontSize: Math.round(13 * S), fill: 0xffffff,
        stroke: { color: 0x1a1a24, width: 3 }, align: 'center',
      },
    })
    label.anchor.set(0.5, 0)
    const pill = new Graphics()
    const pw = label.width + 24 * S
    const ph = label.height + 12 * S
    pill.roundRect(-pw / 2, -6 * S, pw, ph, ph / 2).fill({ color: 0x1a1a24, alpha: 0.72 })
    pill.y = R + 14 * S
    c.addChild(pill)
    label.y = R + 14 * S
    c.addChild(label)

    c.x = node.x
    c.y = node.y

    // anillo de pulso dorado en el siguiente nivel jugable
    if (node.unlocked && node.stars === 0) {
      const ring = new Graphics()
      ring.circle(0, 0, R + 8 * S).stroke({ color: 0xffd700, width: 3 * S, alpha: 0.9 })
      ring.circle(0, 0, R + 14 * S).stroke({ color: 0xffd700, width: 1.5 * S, alpha: 0.5 })
      ring.x = node.x
      ring.y = node.y
      this.pulseRings.push(ring)
      this.root.addChild(ring)
    }

    if (node.unlocked) {
      c.eventMode = 'static'
      c.cursor = 'pointer'
      c.on('pointerdown', () => {
        this.selected = i
        this.enterLevel()
      })
      c.on('pointerover', () => { node.hover = 1.12 })
      c.on('pointerout', () => { node.hover = 1 })
    }
    this.root.addChild(c)
  }

  private buildHeader(nombre: string) {
    const g = this.game
    const S = this.S

    // banner central del mundo
    const title = new Text({
      text: `🌍 ${nombre}`,
      style: {
        fontFamily: 'monospace', fontSize: Math.round(22 * S), fill: 0xffd700,
        fontWeight: 'bold', stroke: { color: 0x1a1a24, width: 5 },
      },
    })
    title.anchor.set(0.5)
    const bw = title.width + 72 * S
    const bh = title.height + 26 * S
    const banner = new Graphics()
    banner.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2.6).fill({ color: 0x3a2a10, alpha: 0.85 })
    banner.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2.6).stroke({ color: 0xffd700, width: 2.5 * S, alpha: 0.9 })
    banner.x = g.viewW / 2
    banner.y = 30 * S + bh / 2
    this.root.addChild(banner)
    title.x = banner.x
    title.y = banner.y
    this.root.addChild(title)

    // pill de XP / estrellas
    const xpText = new Text({
      text: `⭐ ${this.totalStars()} · 🍯 ${g.progress.xpTotal} XP`,
      style: { fontFamily: 'monospace', fontSize: Math.round(15 * S), fill: 0xffffff, stroke: { color: 0x1a1a24, width: 3 } },
    })
    const xw = xpText.width + 32 * S
    const xh = xpText.height + 16 * S
    const xpPill = new Graphics()
    xpPill.roundRect(0, 0, xw, xh, xh / 2).fill({ color: 0x1a1a24, alpha: 0.72 })
    xpPill.x = 18 * S
    xpPill.y = 18 * S
    this.root.addChild(xpPill)
    xpText.x = xpPill.x + 16 * S
    xpText.y = xpPill.y + 8 * S
    this.root.addChild(xpText)
  }

  private buildHint() {
    const g = this.game
    const S = this.S
    this.hint = new Text({
      text: '◀▶ elegir nivel · [E] entrar',
      style: { fontFamily: 'monospace', fontSize: Math.round(13 * S), fill: 0xffffff, stroke: { color: 0x1a1a24, width: 3 } },
    })
    this.hint.anchor.set(0.5)
    const hw = this.hint.width + 36 * S
    const hh = this.hint.height + 14 * S
    const pill = new Graphics()
    pill.roundRect(-hw / 2, -hh / 2, hw, hh, hh / 2).fill({ color: 0x1a1a24, alpha: 0.66 })
    pill.x = g.viewW / 2
    pill.y = g.viewH - 34 * S
    this.root.addChild(pill)
    this.hint.x = pill.x
    this.hint.y = pill.y
    this.root.addChild(this.hint)
  }

  private buildVignette() {
    const g = this.game
    const grad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0.42,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.78,
      colorStops: [
        { offset: 0, color: 'rgba(0,0,0,0)' },
        { offset: 1, color: 'rgba(10,8,20,0.32)' },
      ],
    })
    const v = new Graphics()
    v.rect(0, 0, g.viewW, g.viewH).fill(grad)
    this.root.addChild(v)
  }

  // ---------------------------------------------------------------- camino de miel

  /** Punto sobre la curva cuadrática a→b con control desplazado (arco suave). */
  private curvePoint(a: MapNode, b: MapNode, t: number): { x: number; y: number } {
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    // arco perpendicular suave para que el camino serpentee
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const bow = len * 0.18
    const cx = mx + (-dy / len) * bow
    const cy = my + (dx / len) * bow
    const u = 1 - t
    return {
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      y: u * u * a.y + 2 * u * t * cy + t * t * b.y,
    }
  }

  /** Camino de miel animado: lecho + dashes que "marchan" hacia el siguiente nodo. */
  private drawPath(phase: number, reveal: number) {
    const path = this.pathGfx
    if (!path) return
    path.clear()
    const S = this.S
    const SEG_PTS = 26

    for (let i = 0; i < this.nodes.length - 1; i++) {
      const a = this.nodes[i]
      const b = this.nodes[i + 1]
      const done = a.stars > 0

      // puntos de la curva (recortados por la revelación progresiva de entrada)
      const total = SEG_PTS + 1
      const visible = Math.max(2, Math.floor(total * clamp(reveal * (this.nodes.length - 1) - i, 0, 1)))
      const pts: { x: number; y: number }[] = []
      for (let p = 0; p < visible; p++) pts.push(this.curvePoint(a, b, p / SEG_PTS))
      if (pts.length < 2) continue

      // sombra ancha + lecho de miel
      for (const [w, col, al] of [[14 * S, 0x1a1a24, 0.3], [8 * S, 0xc98a1b, 0.9]] as const) {
        path.moveTo(pts[0].x, pts[0].y)
        for (const p of pts) path.lineTo(p.x, p.y)
        path.stroke({ color: col, width: w, alpha: al, cap: 'round', join: 'round' })
      }

      // dashes animados fluyendo hacia adelante
      const dashOn = 3
      const dashPeriod = 7
      for (let p = 0; p < pts.length - 1; p++) {
        if (((p + Math.floor(phase)) % dashPeriod + dashPeriod) % dashPeriod >= dashOn) continue
        path.moveTo(pts[p].x, pts[p].y).lineTo(pts[p + 1].x, pts[p + 1].y)
      }
      path.stroke({ color: done ? 0xffd700 : 0xffffff, width: 4 * S, alpha: done ? 1 : 0.5, cap: 'round' })
    }
  }

  // ---------------------------------------------------------------- lógica (intacta)

  private totalStars(): number {
    return Object.values(this.game.progress.stars).reduce((a, b) => a + b, 0)
  }

  private moveSelection(dir: number) {
    const next = this.selected + dir
    if (next < 0 || next >= this.nodes.length) return
    if (!this.nodes[next].unlocked) return
    this.selected = next
    this.beeArrived = true // tras la entrada, la abeja salta directa al nodo
    this.game.audio.play('blip')
  }

  private enterLevel() {
    const node = this.nodes[this.selected]
    if (!node?.unlocked) return
    this.game.audio.play('unlock')
    this.game.currentLevel = node.spec
    void this.game.goTo(new LevelScene(this.game, node.spec))
  }

  update(dt: number) {
    if (this.nodes.length === 0) return
    this.t += dt
    const g = this.game
    const S = this.S

    if (g.input.isPressed('right')) this.moveSelection(1)
    if (g.input.isPressed('left')) this.moveSelection(-1)
    if (g.input.isPressed('interact') || g.input.isPressed('jump')) this.enterLevel()
    if (g.input.isPressed('pause')) g.bridge.emit('game:exit', {})

    // ---- entrada cinematográfica ----
    const fade = clamp(this.t / 0.45, 0, 1)
    this.root.alpha = fade
    const zoom = lerp(1.06, 1, easeOutCubic(clamp(this.t / 0.6, 0, 1)))
    this.root.scale.set(zoom)

    // pop elástico escalonado de nodos + hover suave
    for (const node of this.nodes) {
      const k = clamp((this.t - node.popStart) / 0.38, 0, 1)
      const pop = k <= 0 ? 0 : easeOutBack(k)
      const cur = node.view.scale.x / Math.max(pop, 0.0001) || node.hover
      node.view.scale.set(pop * lerp(cur, node.hover, 0.2))
    }

    // camino: revelado progresivo + flujo
    const reveal = clamp((this.t - 0.25) / 0.9, 0, 1)
    this.drawPath(this.t * 5, easeOutCubic(reveal))

    // abeja: vuelo de entrada y luego salto sobre el nodo seleccionado
    const node = this.nodes[this.selected]
    if (node) {
      if (!this.beeArrived) {
        const k = clamp((this.t - 0.5) / 1.1, 0, 1)
        const e = easeOutCubic(k)
        this.bee.x = lerp(this.beeStart.x, node.x, e)
        this.bee.y = lerp(this.beeStart.y, node.y - this.nodeR - 8 * S, e) + Math.sin(this.t * 10) * 8 * S * (1 - e)
        if (k >= 1) this.beeArrived = true
      } else {
        this.bee.x = node.x
        this.bee.y = node.y - this.nodeR - 8 * S + Math.sin(this.t * 4) * 5 * S
      }
      this.bee.texture = this.beeFrames[Math.floor(this.t * 8) % this.beeFrames.length]
    }

    // anillos de pulso en niveles jugables
    for (const ring of this.pulseRings) {
      const s = 1 + Math.sin(this.t * 3) * 0.12
      ring.scale.set(s)
      ring.alpha = 0.6 + Math.sin(this.t * 3) * 0.3
    }

    // nubes a la deriva (wrap horizontal)
    for (const cl of this.clouds) {
      cl.view.x += cl.speed * dt
      if (cl.view.x - cl.w > g.viewW) cl.view.x = -cl.w
    }

    // polen ambiental a la deriva
    for (const p of this.pollen) {
      p.g.x += (p.vx + Math.sin(this.t * 1.4 + p.phase) * 6) * dt
      p.g.y += p.vy * dt
      if (p.g.y < -6) { p.g.y = g.viewH + 6; p.g.x = Math.random() * g.viewW }
      if (p.g.x < -6) p.g.x = g.viewW + 6
      if (p.g.x > g.viewW + 6) p.g.x = -6
    }

    // goteo de miel en las islas
    this.drips.forEach((d, i) => {
      const cycle = (this.t * 0.7 + i * 0.45) % 1
      d.alpha = cycle < 0.85 ? 0.9 : 0
      d.scale.set(0.6 + cycle * 0.7)
      d.y += Math.sin(this.t * 2 + i) * 0.15
    })

    // chispa de celebración una vez por nodo completado
    this.nodes.forEach((nd, i) => {
      if (nd.stars > 0 && !this.sparkled.has(i) && this.t > 0.5 + i * 0.15) {
        this.sparkled.add(i)
        this.particles.burst(nd.x, nd.y - this.nodeR - 18 * S, 0xffd700, 12, 60 * S, 120 * S)
      }
    })
    this.particles.update(dt)
    this.game.worldRenderer.setCameraFocus(node?.x ?? 0, node?.y ?? 0)
  }
}
