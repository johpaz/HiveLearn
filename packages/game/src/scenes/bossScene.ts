/**
 * BossScene — la evaluación como combate de jefe.
 * El Avispón lanza una pregunta por turno: responder bien le quita una vida
 * (con animación de golpe); responder mal te quita un corazón. La música
 * acelera cuando al jefe le queda poca vida.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js'
import type { LevelSpec } from '@hivelearn/core/lesson/levelSpec'
import { Scene } from '../engine/scene'
import { Particles } from '../engine/particles'
import { THEME_COLORS } from '../engine/textures'
import type { Game } from '../game'
import { ResultScene } from './resultScene'
import { WorldMapScene } from './worldMapScene'

const Q_STYLE = { fontFamily: 'monospace', fontSize: 17, fill: 0xffffff, wordWrap: true, lineHeight: 24, fontWeight: 'bold' as const }
const OPT_STYLE = { fontFamily: 'monospace', fontSize: 15, fill: 0xffffff }

export class BossScene extends Scene {
  private boss!: Sprite
  private bee!: Sprite
  private particles = new Particles()
  private bossHpBar = new Graphics()
  private heartsView = new Container()
  private questionText = new Text({ text: '', style: Q_STYLE })
  private optionTexts: Text[] = []
  private nameText!: Text

  private qIndex = 0
  private selected = 0
  private correctas = 0
  private hearts = 3
  private bossHp: number
  private bossMaxHp: number
  private locked = false
  private bossBaseX = 0
  private t = 0

  constructor(game: Game, private spec: LevelSpec, private coinsCollected: number) {
    super(game)
    this.bossMaxHp = spec.boss.preguntas.length
    this.bossHp = this.bossMaxHp
  }

  enter() {
    const g = this.game
    const colors = THEME_COLORS[this.spec.theme]
    // cielo más oscuro: ambiente de pelea
    g.app.renderer.background.color = darken(colors.sky, 0.5)
    g.audio.playMusic('boss')

    const w = g.viewW
    const h = g.viewH

    // suelo decorativo
    const floor = new Graphics()
    floor.rect(0, h - 80, w, 80).fill(darken(colors.sky, 0.35))
    this.root.addChild(floor)

    // jefe a la derecha (grande)
    this.boss = new Sprite(g.textures.boss)
    this.boss.anchor.set(0.5, 1)
    this.boss.width = 160
    this.boss.height = 160
    this.boss.x = w * 0.75
    this.boss.y = h - 90
    this.bossBaseX = this.boss.x
    this.root.addChild(this.boss)

    // abeja a la izquierda
    this.bee = new Sprite(g.textures.bee.idle)
    this.bee.anchor.set(0.5, 1)
    this.bee.width = 80
    this.bee.height = 80
    this.bee.x = w * 0.2
    this.bee.y = h - 85
    this.root.addChild(this.bee)

    this.nameText = new Text({
      text: `⚔️ ${this.spec.boss.nombre}`,
      style: { fontFamily: 'monospace', fontSize: 20, fill: 0xff6b6b, fontWeight: 'bold', stroke: { color: 0x1a1a24, width: 4 } },
    })
    this.nameText.anchor.set(0.5, 0)
    this.nameText.x = w / 2
    this.nameText.y = 16
    this.root.addChild(this.nameText, this.bossHpBar, this.heartsView)

    this.buildHearts()
    this.drawBossHp()
    this.root.addChild(this.particles.view)
    this.root.addChild(this.questionText)

    this.askQuestion()
  }

  private buildHearts() {
    this.heartsView.removeChildren()
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(this.game.textures.heart)
      s.width = 26
      s.height = 26
      s.x = 16 + i * 30
      s.y = 16
      s.alpha = i < this.hearts ? 1 : 0.25
      this.heartsView.addChild(s)
    }
  }

  private drawBossHp() {
    const w = this.game.viewW
    const bw = Math.min(w - 100, 400)
    const x = (w - bw) / 2
    this.bossHpBar.clear()
    this.bossHpBar.roundRect(x, 50, bw, 18, 6).fill(0x1a1a24)
    if (this.bossHp > 0) {
      this.bossHpBar.roundRect(x + 2, 52, (bw - 4) * (this.bossHp / this.bossMaxHp), 14, 5).fill(0xe25822)
    }
    this.bossHpBar.roundRect(x, 50, bw, 18, 6).stroke({ color: 0xffffff, width: 2 })
  }

  private askQuestion() {
    const q = this.spec.boss.preguntas[this.qIndex]
    const w = this.game.viewW
    const h = this.game.viewH

    this.questionText.text = q.pregunta
    this.questionText.style.wordWrapWidth = Math.min(w - 60, 640)
    this.questionText.x = (w - Math.min(w - 60, 640)) / 2
    this.questionText.y = h * 0.16 + 60

    this.clearOptions()
    this.selected = 0
    q.opciones.forEach((opt, i) => {
      const t = new Text({ text: opt, style: { ...OPT_STYLE } })
      t.x = this.questionText.x + 20
      t.y = this.questionText.y + this.questionText.height + 24 + i * 30
      t.eventMode = 'static'
      t.cursor = 'pointer'
      t.on('pointerdown', () => { this.selected = i; void this.answer() })
      this.root.addChild(t)
      this.optionTexts.push(t)
    })
    this.highlight()
    this.locked = false
  }

  private highlight() {
    const q = this.spec.boss.preguntas[this.qIndex]
    this.optionTexts.forEach((t, i) => {
      t.text = `${i === this.selected ? '▶' : ' '} ${q.opciones[i]}`
      t.style.fill = i === this.selected ? 0xffd700 : 0xffffff
    })
  }

  private clearOptions() {
    for (const t of this.optionTexts) {
      this.root.removeChild(t)
      t.destroy()
    }
    this.optionTexts = []
  }

  private async answer() {
    if (this.locked) return
    this.locked = true
    const g = this.game
    const q = this.spec.boss.preguntas[this.qIndex]
    const correct = this.selected === q.indiceCorrecto

    g.bridge.emit('boss:answer', {
      lessonId: this.spec.lessonId,
      questionIndex: this.qIndex,
      answerIndex: this.selected,
      correct,
    })

    if (correct) {
      this.correctas++
      this.bossHp--
      g.audio.play('bossHit')
      // la abeja embiste
      await this.lunge(this.bee, this.boss.x - 120)
      this.particles.burst(this.boss.x, this.boss.y - 80, 0xe25822, 16, 120)
      this.boss.tint = 0xff8888
      setTimeout(() => { this.boss.tint = 0xffffff }, 200)
      this.drawBossHp()
      if (this.bossHp <= this.bossMaxHp * 0.34) g.audio.setMusicTempo(1.3)
    } else {
      this.hearts--
      g.audio.play('wrong')
      g.audio.play('hurt')
      // el jefe embiste
      await this.lunge(this.boss, this.bee.x + 100)
      this.bee.tint = 0xff8888
      setTimeout(() => { this.bee.tint = 0xffffff }, 200)
      this.buildHearts()
    }

    this.qIndex++

    if (this.bossHp <= 0 || this.qIndex >= this.spec.boss.preguntas.length || this.hearts <= 0) {
      await this.finish()
      return
    }
    this.askQuestion()
  }

  /** Animación de embestida ida y vuelta */
  private lunge(sprite: Sprite, targetX: number): Promise<void> {
    const startX = sprite.x
    const dur = 350
    const start = performance.now()
    return new Promise((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / dur)
        const k = t < 0.5 ? t * 2 : (1 - t) * 2
        sprite.x = startX + (targetX - startX) * k
        if (t < 1) requestAnimationFrame(step)
        else { sprite.x = startX; resolve() }
      }
      step()
    })
  }

  private async finish() {
    const g = this.game
    const total = this.spec.boss.preguntas.length
    const ratio = this.correctas / total
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0
    const xp = this.correctas * 20 + this.coinsCollected * 2 + stars * 15

    g.audio.setMusicTempo(1)
    if (stars > 0) g.audio.play('victory')

    // persistir
    const prev = g.progress.stars[this.spec.lessonId] ?? 0
    g.progress.stars[this.spec.lessonId] = Math.max(prev, stars)
    g.progress.xpTotal += xp
    g.progress.checkpoint = null
    g.saveProgress()

    g.lastResult = { correctas: this.correctas, total, stars, xp }
    g.bridge.emit('level:completed', {
      lessonId: this.spec.lessonId,
      stars,
      xp,
      correctas: this.correctas,
      total,
    })

    await g.goTo(new ResultScene(g, this.spec))
  }

  update(dt: number) {
    this.t += dt
    // jefe flota amenazante
    if (!this.locked) {
      this.boss.y = this.game.viewH - 90 + Math.sin(this.t * 2) * 8
      this.boss.x = this.bossBaseX + Math.sin(this.t * 0.7) * 12
      this.bee.y = this.game.viewH - 85 + Math.sin(this.t * 3) * 4
    }
    this.particles.update(dt)

    const g = this.game
    if (this.locked) return
    const q = this.spec.boss.preguntas[this.qIndex]
    if (!q) return
    if (g.input.isPressed('down')) {
      this.selected = (this.selected + 1) % q.opciones.length
      g.audio.play('blip')
      this.highlight()
    }
    if (g.input.isPressed('up')) {
      this.selected = (this.selected - 1 + q.opciones.length) % q.opciones.length
      g.audio.play('blip')
      this.highlight()
    }
    if (g.input.isPressed('interact') || g.input.isPressed('jump')) {
      void this.answer()
    }
    if (g.input.isPressed('pause')) {
      void g.goTo(new WorldMapScene(g))
    }
  }
}

function darken(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor)
  const g = Math.floor(((color >> 8) & 0xff) * factor)
  const b = Math.floor((color & 0xff) * factor)
  return (r << 16) | (g << 8) | b
}
