/**
 * TitleScene — presentación cinematográfica del juego.
 *
 * Fondo 3D de la colmena (hexágonos brillantes + miel + polen), logo con
 * pulso dorado, abejas cruzando la pantalla con estela de partículas y
 * prompt parpadeante. Al pulsar [E] / salto / toque → BootScene (enrutador).
 */

import { Container, Sprite, Text } from 'pixi.js'
import { Scene } from '../engine/scene'
import { Particles } from '../engine/particles'
import { buildHiveScene3D } from '../engine/three/builders'
import type { Scene3D } from '../engine/three/worldRenderer'
import { BootScene } from './bootScene'

interface FlyingBee {
  sprite: Sprite
  speed: number
  baseY: number
  phase: number
  trailTimer: number
}

export class TitleScene extends Scene {
  private scene3d: Scene3D | null = null
  private particles = new Particles()
  private bees: FlyingBee[] = []
  private logo!: Text
  private prompt!: Text
  private t = 0
  private leaving = false

  enter() {
    const g = this.game
    g.audio.playMusic('sala_real')
    g.audio.setMusicTempo(g.theme.musicTempo)

    if (g.worldRenderer.isAlive) {
      this.scene3d = buildHiveScene3D({ variant: 'calm' })
      g.worldRenderer.setScene(this.scene3d)
      g.app.renderer.background.color = 0x000000
      g.app.renderer.background.alpha = 0
    } else {
      g.app.renderer.background.color = g.themedSky(0x1a1a2e)
    }

    // Logo
    this.logo = new Text({
      text: '🐝 HIVELEARN',
      style: {
        fontFamily: 'monospace', fontSize: 64, fill: 0xffd700, fontWeight: 'bold',
        stroke: { color: 0x3a2503, width: 8 }, letterSpacing: 6,
        dropShadow: { color: 0xffb300, blur: 12, distance: 0, alpha: 0.7 },
      },
    })
    this.logo.anchor.set(0.5)
    this.logo.x = g.viewW / 2
    this.logo.y = g.viewH * 0.34
    this.root.addChild(this.logo)

    const subtitle = new Text({
      text: 'La Gran Colmena del Saber',
      style: { fontFamily: 'monospace', fontSize: 20, fill: 0xffe082, fontWeight: 'bold', stroke: { color: 0x1a1208, width: 4 } },
    })
    subtitle.anchor.set(0.5)
    subtitle.x = g.viewW / 2
    subtitle.y = g.viewH * 0.34 + 58
    this.root.addChild(subtitle)

    this.prompt = new Text({
      text: '— Pulsa [E] o toca la pantalla para empezar —',
      style: { fontFamily: 'monospace', fontSize: 16, fill: 0xffffff, stroke: { color: 0x1a1208, width: 3 } },
    })
    this.prompt.anchor.set(0.5)
    this.prompt.x = g.viewW / 2
    this.prompt.y = g.viewH * 0.72
    this.root.addChild(this.prompt)

    // Abejas volando con estela
    for (let i = 0; i < 3; i++) {
      const sprite = new Sprite(g.textures.bee.run1)
      sprite.anchor.set(0.5)
      sprite.width = 36
      sprite.height = 36
      sprite.x = -60 - i * 180
      this.root.addChild(sprite)
      this.bees.push({
        sprite,
        speed: 140 + i * 40,
        baseY: g.viewH * (0.5 + i * 0.12),
        phase: i * 2.1,
        trailTimer: 0,
      })
    }

    this.root.addChild(this.particles.view)

    // toque/click también arranca
    this.root.eventMode = 'static'
    this.root.hitArea = g.app.screen
    this.root.on('pointerdown', () => this.start())
  }

  exit() {
    this.scene3d?.dispose?.()
    this.scene3d = null
    this.game.worldRenderer.setScene(null)
    this.game.app.renderer.background.alpha = 1
  }

  private start() {
    if (this.leaving) return
    this.leaving = true
    this.game.audio.play('unlock')
    void this.game.goTo(new BootScene(this.game))
  }

  update(dt: number) {
    this.t += dt
    const g = this.game

    // logo con respiración dorada
    const s = 1 + Math.sin(this.t * 1.6) * 0.02
    this.logo.scale.set(s)
    this.logo.y = g.viewH * 0.34 + Math.sin(this.t * 1.2) * 6

    // prompt parpadeante
    this.prompt.alpha = 0.55 + 0.45 * Math.sin(this.t * 3.5)

    // abejas cruzando en seno con estela de polen
    for (const bee of this.bees) {
      bee.sprite.x += bee.speed * dt
      bee.sprite.y = bee.baseY + Math.sin(this.t * 2 + bee.phase) * 30
      bee.trailTimer += dt
      if (bee.trailTimer > 0.08) {
        bee.trailTimer = 0
        this.particles.burst(bee.sprite.x - 14, bee.sprite.y, 0xffe066, 1, 12, -20)
      }
      if (bee.sprite.x > g.viewW + 80) bee.sprite.x = -80
    }
    this.particles.update(dt)

    // deriva lenta del parallax 3D
    g.worldRenderer.setCameraFocus(Math.sin(this.t * 0.1) * 200, 0)

    if (g.input.isPressed('interact') || g.input.isPressed('jump') || g.input.isPressed('pause')) {
      this.start()
    }
  }

  resize(w: number, h: number) {
    if (this.logo) this.logo.x = w / 2
    if (this.prompt) { this.prompt.x = w / 2; this.prompt.y = h * 0.72 }
  }
}
