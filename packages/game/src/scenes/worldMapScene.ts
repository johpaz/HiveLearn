/**
 * WorldMapScene — mapa estilo Mario World: los niveles del mundo (lección =
 * nodo) conectados por un camino. Solo el siguiente nivel sin completar está
 * desbloqueado; los completados muestran sus estrellas.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js'
import type { LevelSpec } from '@hivelearn/core/lesson/levelSpec'
import { Scene } from '../engine/scene'
import { THEME_COLORS } from '../engine/textures'
import type { Game } from '../game'
import { LevelScene } from './levelScene'

const NODE_R = 26
const TITLE_STYLE = { fontFamily: 'monospace', fontSize: 24, fill: 0xffd700, fontWeight: 'bold' as const, stroke: { color: 0x1a1a24, width: 4 } }
const LABEL_STYLE = { fontFamily: 'monospace', fontSize: 13, fill: 0xffffff, stroke: { color: 0x1a1a24, width: 3 }, wordWrap: true, wordWrapWidth: 140, align: 'center' as const }

interface MapNode {
  spec: LevelSpec
  x: number
  y: number
  unlocked: boolean
  stars: number
  view: Container
}

export class WorldMapScene extends Scene {
  private nodes: MapNode[] = []
  private selected = 0
  private bee!: Sprite
  private hint!: Text
  private t = 0

  enter() {
    const g = this.game
    const world = g.world
    g.audio.playMusic('map')

    if (!world || world.levels.length === 0) {
      // sin programa: no debería pasar (Boot lo evita), pero por si acaso
      g.app.renderer.background.color = 0x1a1a2e
      const t = new Text({ text: 'No hay programa cargado todavía…', style: TITLE_STYLE })
      t.anchor.set(0.5)
      t.x = g.viewW / 2
      t.y = g.viewH / 2
      this.root.addChild(t)
      return
    }

    const colors = THEME_COLORS[world.theme]
    g.app.renderer.background.color = colors.sky

    // título del mundo
    const title = new Text({ text: `🌍 ${world.nombre}`, style: TITLE_STYLE })
    title.anchor.set(0.5, 0)
    title.x = g.viewW / 2
    title.y = 24
    this.root.addChild(title)

    const xpText = new Text({
      text: `⭐ ${this.totalStars()} · 🍯 ${g.progress.xpTotal} XP`,
      style: { ...LABEL_STYLE, wordWrap: false, fontSize: 15 },
    })
    xpText.x = 16
    xpText.y = 16
    this.root.addChild(xpText)

    // distribuir nodos en zig-zag
    const n = world.levels.length
    const usableW = g.viewW - 160
    const stepX = n > 1 ? usableW / (n - 1) : 0
    const midY = g.viewH / 2

    let firstLocked = -1
    world.levels.forEach((spec, i) => {
      const stars = g.progress.stars[spec.lessonId] ?? 0
      const prevDone = i === 0 || (g.progress.stars[world.levels[i - 1].lessonId] ?? 0) > 0
      const unlocked = prevDone && firstLocked === -1
      if (!unlocked && firstLocked === -1) firstLocked = i

      const x = 80 + stepX * i
      const y = midY + (i % 2 === 0 ? -40 : 40)
      this.nodes.push({ spec, x, y, unlocked, stars, view: new Container() })
    })

    // camino entre nodos
    const path = new Graphics()
    for (let i = 0; i < this.nodes.length - 1; i++) {
      const a = this.nodes[i]
      const b = this.nodes[i + 1]
      const done = a.stars > 0
      // línea punteada
      const steps = 10
      for (let s = 0; s < steps; s += 2) {
        const x1 = a.x + (b.x - a.x) * (s / steps)
        const y1 = a.y + (b.y - a.y) * (s / steps)
        const x2 = a.x + (b.x - a.x) * ((s + 1) / steps)
        const y2 = a.y + (b.y - a.y) * ((s + 1) / steps)
        path.moveTo(x1, y1).lineTo(x2, y2)
      }
      path.stroke({ color: done ? 0xffd700 : 0xffffff, width: 4, alpha: done ? 1 : 0.5 })
    }
    this.root.addChild(path)

    // nodos
    this.nodes.forEach((node, i) => {
      const c = node.view
      const circle = new Graphics()
      circle.circle(0, 0, NODE_R).fill(node.unlocked ? 0xffb300 : 0x555566)
      circle.circle(0, 0, NODE_R).stroke({ color: 0x1a1a24, width: 4 })
      c.addChild(circle)

      const num = new Text({
        text: node.unlocked ? String(i + 1) : '🔒',
        style: { fontFamily: 'monospace', fontSize: 20, fill: 0x1a1a24, fontWeight: 'bold' },
      })
      num.anchor.set(0.5)
      c.addChild(num)

      // estrellas ganadas
      for (let s = 0; s < node.stars; s++) {
        const star = new Sprite(this.game.textures.star)
        star.anchor.set(0.5)
        star.width = 18
        star.height = 18
        star.x = (s - (node.stars - 1) / 2) * 20
        star.y = -NODE_R - 16
        c.addChild(star)
      }

      const label = new Text({ text: node.spec.titulo, style: LABEL_STYLE })
      label.anchor.set(0.5, 0)
      label.y = NODE_R + 10
      c.addChild(label)

      c.x = node.x
      c.y = node.y
      if (node.unlocked) {
        c.eventMode = 'static'
        c.cursor = 'pointer'
        c.on('pointerdown', () => {
          this.selected = i
          this.enterLevel()
        })
      }
      this.root.addChild(c)
    })

    // seleccionar el primer nivel jugable (sin estrellas) por defecto
    const firstPlayable = this.nodes.findIndex(nd => nd.unlocked && nd.stars === 0)
    this.selected = firstPlayable >= 0 ? firstPlayable : 0

    // abeja marcadora
    this.bee = new Sprite(g.textures.bee.idle)
    this.bee.anchor.set(0.5, 1)
    this.bee.width = 40
    this.bee.height = 40
    this.root.addChild(this.bee)

    this.hint = new Text({
      text: '◀▶ elegir nivel · [E] entrar',
      style: { ...LABEL_STYLE, wordWrap: false },
    })
    this.hint.anchor.set(0.5)
    this.hint.x = g.viewW / 2
    this.hint.y = g.viewH - 30
    this.root.addChild(this.hint)
  }

  private totalStars(): number {
    return Object.values(this.game.progress.stars).reduce((a, b) => a + b, 0)
  }

  private moveSelection(dir: number) {
    const next = this.selected + dir
    if (next < 0 || next >= this.nodes.length) return
    if (!this.nodes[next].unlocked) return
    this.selected = next
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

    if (g.input.isPressed('right')) this.moveSelection(1)
    if (g.input.isPressed('left')) this.moveSelection(-1)
    if (g.input.isPressed('interact') || g.input.isPressed('jump')) this.enterLevel()
    if (g.input.isPressed('pause')) g.bridge.emit('game:exit', {})

    // abeja salta sobre el nodo seleccionado
    const node = this.nodes[this.selected]
    if (node) {
      this.bee.x = node.x
      this.bee.y = node.y - NODE_R - 8 + Math.sin(this.t * 4) * 5
    }
  }
}
