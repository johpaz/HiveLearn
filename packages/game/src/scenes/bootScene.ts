/**
 * BootScene — punto de entrada: muestra carga, espera los datos de sesión
 * por el bridge y enruta a la escena correcta:
 *  - ?devLevel=1            → LevelScene con nivel demo
 *  - programa cargado       → WorldMapScene
 *  - sin programa           → TutorialScene (onboarding)
 */

import { Sprite, Text } from 'pixi.js'
import { Scene } from '../engine/scene'
import { demoLevelSpec } from '../levels/generator'
import { LevelScene } from './levelScene'
import { WorldMapScene } from './worldMapScene'
import { TutorialScene } from './tutorialScene'

export class BootScene extends Scene {
  private bee!: Sprite
  private text!: Text
  private t = 0
  private unsubs: Array<() => void> = []
  private routed = false

  enter() {
    const g = this.game
    g.app.renderer.background.color = 0x1a1a2e

    this.bee = new Sprite(g.textures.bee.idle)
    this.bee.anchor.set(0.5)
    this.bee.width = 96
    this.bee.height = 96
    this.bee.x = g.viewW / 2
    this.bee.y = g.viewH / 2 - 30
    this.root.addChild(this.bee)

    this.text = new Text({
      text: 'Cargando la colmena…',
      style: { fontFamily: 'monospace', fontSize: 18, fill: 0xffb300, fontWeight: 'bold' },
    })
    this.text.anchor.set(0.5)
    this.text.x = g.viewW / 2
    this.text.y = g.viewH / 2 + 50
    this.root.addChild(this.text)

    if (g.options.devLevel) {
      g.currentLevel = demoLevelSpec()
      g.world = {
        id: 'demo',
        nombre: 'Mundo de Prueba',
        theme: 'prado',
        levels: [demoLevelSpec()],
      }
      void this.route(new LevelScene(g, g.currentLevel))
      return
    }

    this.unsubs.push(g.bridge.on('program:loaded', ({ world, progress }) => {
      g.world = world
      if (progress) g.progress = progress
      void this.route(new WorldMapScene(g))
    }))
    this.unsubs.push(g.bridge.on('program:none', () => {
      void this.route(new TutorialScene(g))
    }))
    this.unsubs.push(g.bridge.on('program:generating', () => {
      // sesión a medio generar: el tutorial muestra la zona de espera
      void this.route(new TutorialScene(g))
    }))

    // avisar a React que el juego ya escucha
    g.bridge.emit('game:ready', {})
  }

  exit() {
    for (const u of this.unsubs) u()
    this.unsubs = []
  }

  private async route(scene: Scene) {
    if (this.routed) return
    this.routed = true
    await this.game.goTo(scene)
  }

  update(dt: number) {
    this.t += dt
    if (this.bee) {
      this.bee.y = this.game.viewH / 2 - 30 + Math.sin(this.t * 3) * 10
      this.bee.rotation = Math.sin(this.t * 2) * 0.1
    }
    if (this.text) {
      const dots = '.'.repeat(1 + (Math.floor(this.t * 2) % 3))
      this.text.text = `Cargando la colmena${dots}`
    }
  }

  resize(w: number, h: number) {
    if (this.bee) { this.bee.x = w / 2; this.bee.y = h / 2 - 30 }
    if (this.text) { this.text.x = w / 2; this.text.y = h / 2 + 50 }
  }
}
