/**
 * ResultScene — fin de nivel: estrellas que aparecen una a una, XP ganado
 * y botones para volver al mapa o reintentar el nivel.
 */

import { Graphics, Sprite, Text } from 'pixi.js'
import type { LevelSpec } from '@hivelearn/core/lesson/levelSpec'
import { Scene } from '../engine/scene'
import { Particles } from '../engine/particles'
import { buildHiveScene3D } from '../engine/three/builders'
import type { Scene3D } from '../engine/three/worldRenderer'
import type { Game } from '../game'
import { WorldMapScene } from './worldMapScene'
import { LevelScene } from './levelScene'
import { HiveHubScene } from './hiveHubScene'

const TITLE_STYLE = { fontFamily: 'monospace', fontSize: 28, fill: 0xffd700, fontWeight: 'bold' as const, stroke: { color: 0x1a1a24, width: 5 } }
const BODY_STYLE = { fontFamily: 'monospace', fontSize: 17, fill: 0xffffff, stroke: { color: 0x1a1a24, width: 3 } }

export class ResultScene extends Scene {
  private particles = new Particles()
  private stars: Sprite[] = []
  private starTimer = 0
  private starsShown = 0
  private options: Text[] = []
  private selected = 0
  private t = 0
  private scene3d: Scene3D | null = null
  private confettiTimer = 0

  constructor(game: Game, private spec: LevelSpec) {
    super(game)
  }

  enter() {
    const g = this.game
    const r = g.lastResult ?? { correctas: 0, total: 1, stars: 0, xp: 0 }
    g.app.renderer.background.color = g.themedSky(0x1a1a2e)
    g.audio.playMusic('map')
    g.audio.setMusicTempo(g.theme.musicTempo)

    // Fondo 3D festivo: interior de colmena en modo calmo
    if (g.worldRenderer.isAlive) {
      this.scene3d = buildHiveScene3D({ variant: 'calm' })
      g.worldRenderer.setScene(this.scene3d)
      g.app.renderer.background.color = 0x000000
      g.app.renderer.background.alpha = 0
    }

    const w = g.viewW
    const h = g.viewH

    const panel = new Graphics()
    const pw = Math.min(w - 60, 520)
    const ph = 380
    panel.roundRect((w - pw) / 2, (h - ph) / 2, pw, ph, 16).fill({ color: 0x232338, alpha: 0.95 })
    panel.roundRect((w - pw) / 2, (h - ph) / 2, pw, ph, 16).stroke({ color: 0xffb300, width: 4 })
    this.root.addChild(panel)

    const title = new Text({
      text: r.stars > 0 ? '🎉 ¡Nivel completado!' : '💪 ¡Casi! Inténtalo de nuevo',
      style: TITLE_STYLE,
    })
    title.anchor.set(0.5, 0)
    title.x = w / 2
    title.y = (h - ph) / 2 + 30
    this.root.addChild(title)

    // estrellas (aparecen animadas en update)
    for (let i = 0; i < 3; i++) {
      const s = new Sprite(g.textures.star)
      s.anchor.set(0.5)
      s.width = 64
      s.height = 64
      s.x = w / 2 + (i - 1) * 84
      s.y = (h - ph) / 2 + 130
      s.alpha = 0.15
      s.scale.set(s.scale.x) // mantener tamaño
      this.root.addChild(s)
      this.stars.push(s)
    }

    const detail = new Text({
      text: `Respuestas: ${r.correctas}/${r.total}\nXP ganado: +${r.xp}\nPolen total: ${g.progress.xpTotal} XP`,
      style: { ...BODY_STYLE, align: 'center' as const, lineHeight: 28 },
    })
    detail.anchor.set(0.5, 0)
    detail.x = w / 2
    detail.y = (h - ph) / 2 + 190
    this.root.addChild(detail)

    // opciones
    const isLastLevel = this.isLastLevelOfWorld()
    const labels = isLastLevel
      ? ['🏰  Volver a la Colmena', '🔁  Repetir nivel', '🐝  Siguiente colmena']
      : ['🗺️  Volver al mapa', '🔁  Repetir nivel']
    labels.forEach((label, i) => {
      const t = new Text({ text: label, style: BODY_STYLE })
      t.anchor.set(0.5, 0)
      t.x = w / 2
      t.y = (h - ph) / 2 + ph - 90 + i * 32
      t.eventMode = 'static'
      t.cursor = 'pointer'
      t.on('pointerdown', () => { this.selected = i; this.choose() })
      this.root.addChild(t)
      this.options.push(t)
    })
    this.highlight()

    this.root.addChild(this.particles.view)
  }

  exit() {
    this.scene3d?.dispose?.()
    this.scene3d = null
    this.game.worldRenderer.setScene(null)
    this.game.app.renderer.background.alpha = 1
  }

  private highlight() {
    this.options.forEach((t, i) => {
      t.style.fill = i === this.selected ? 0xffd700 : 0xffffff
    })
  }

  private choose() {
    const g = this.game
    g.audio.play('correct')
    const isLastLevel = this.isLastLevelOfWorld()
    if (this.selected === 0) {
      void g.goTo(new WorldMapScene(g))
    } else if (this.selected === 1) {
      // reiniciar checkpoint para repetir desde el inicio
      g.progress.checkpoint = null
      const opened = { ...g.progress.openedBlocks }
      delete opened[this.spec.lessonId]
      g.progress.openedBlocks = opened
      void g.goTo(new LevelScene(g, this.spec))
    } else if (isLastLevel && this.selected === 2) {
      // Último nivel completado: volver a la Colmena para generar el siguiente mundo
      void g.goTo(new HiveHubScene(g, 'between-worlds'))
    }
  }

  private isLastLevelOfWorld(): boolean {
    const world = this.game.world
    if (!world || world.levels.length === 0) return false
    return world.levels[world.levels.length - 1].lessonId === this.spec.lessonId
  }

  update(dt: number) {
    this.t += dt
    const g = this.game
    const r = g.lastResult

    // estrellas una a una
    if (r && this.starsShown < r.stars) {
      this.starTimer += dt
      if (this.starTimer > 0.5) {
        this.starTimer = 0
        const s = this.stars[this.starsShown]
        s.alpha = 1
        this.particles.burst(s.x, s.y, 0xffe066, 14, 100)
        g.audio.play('coin')
        this.starsShown++
      }
    }

    // brillo de las estrellas ganadas
    this.stars.forEach((s, i) => {
      if (r && i < this.starsShown) s.rotation = Math.sin(this.t * 2 + i) * 0.08
    })

    if (g.input.isPressed('down') || g.input.isPressed('up')) {
      this.selected = (this.selected + 1) % this.options.length
      g.audio.play('blip')
      this.highlight()
    }
    if (g.input.isPressed('interact') || g.input.isPressed('jump')) {
      this.choose()
    }

    // confeti dorado ambiental tras completar con estrellas
    if (r && r.stars > 0) {
      this.confettiTimer += dt
      if (this.confettiTimer > 0.7) {
        this.confettiTimer = 0
        this.particles.burst(
          Math.random() * g.viewW,
          -10,
          [0xffd700, 0xffe066, 0xffb300][Math.floor(Math.random() * 3)],
          6, 40, 60,
        )
      }
    }

    this.particles.update(dt)
  }
}
