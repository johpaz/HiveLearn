/**
 * TutorialScene — nivel 0 de onboarding. La abeja guía "Maya" enseña los
 * controles con acciones físicas y hace las preguntas del onboarding
 * (vía bridge ↔ pipeline). Mientras los agentes generan el programa,
 * el alumno recoge monedas de polen en la zona de espera jugable.
 */

import { Container, Text } from 'pixi.js'
import { Scene } from '../engine/scene'
import { Camera } from '../engine/camera'
import { Particles } from '../engine/particles'
import { Tilemap, Tile } from '../engine/tilemap'
import { buildTilemapView } from '../engine/tilemapView'
import { TILE, aabbOverlap } from '../engine/types'
import { Player } from '../entities/player'
import { Npc, Coin } from '../entities/items'
import { DialogBox } from '../ui/dialog'
import type { OnboardingMessage } from '../bridge/gameBridge'
import type { Game } from '../game'
import { WorldMapScene } from './worldMapScene'

const COLS = 60
const ROWS = 18
const GROUND = ROWS - 3

type Phase = 'controls' | 'conversation' | 'generating'

export class TutorialScene extends Scene {
  private world = new Container()
  private camera!: Camera
  private particles = new Particles()
  private player!: Player
  private maya!: Npc
  private dialog!: DialogBox
  private map!: Tilemap
  private coins: Coin[] = []
  private coinsCollected = 0

  private phase: Phase = 'controls'
  private controlStep = 0
  private genStatus!: Text
  private coinSpawnT = 0
  private unsubs: Array<() => void> = []
  private pendingMessage: OnboardingMessage | null = null
  private inDialog = false

  enter() {
    const g = this.game
    g.app.renderer.background.color = 0x8ecae6
    g.audio.playMusic('prado')

    // mapa fijo del tutorial: prado con un tronco (muro bajo) para saltar
    this.map = new Tilemap(COLS, ROWS)
    for (let c = 0; c < COLS; c++) {
      for (let r = GROUND; r < ROWS; r++) this.map.set(c, r, Tile.Ground)
    }
    // tronco a saltar
    this.map.set(22, GROUND - 1, Tile.Ground)
    // flores decorativas
    for (const c of [5, 9, 14, 27, 33, 40, 47]) this.map.set(c, GROUND - 1, Tile.Decor)
    // plataforma con monedas en la zona de espera
    this.map.fillRow(GROUND - 4, 36, 42, Tile.Platform)

    this.camera = new Camera(g.viewW, g.viewH, this.map.widthPx, this.map.heightPx)
    this.root.addChild(this.world)
    this.world.addChild(buildTilemapView(this.map, g.textures.tiles('prado')))

    this.maya = new Npc(30 * TILE, GROUND * TILE, g.textures)
    this.world.addChild(this.maya.view)

    this.player = new Player(g.input, g.textures)
    this.player.spawnAt(4 * TILE, (GROUND - 2) * TILE)
    this.world.addChild(this.player.view)
    this.world.addChild(this.particles.view)
    this.camera.snapTo(this.player.centerX, this.player.centerY)

    this.dialog = new DialogBox(g.audio, g.input, g.textures.maya, 'Maya 🐝')
    this.root.addChild(this.dialog.view)

    this.genStatus = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 15, fill: 0xffffff, stroke: { color: 0x1a1a24, width: 3 }, align: 'center' },
    })
    this.genStatus.anchor.set(0.5, 0)
    this.genStatus.x = g.viewW / 2
    this.genStatus.y = 16
    this.root.addChild(this.genStatus)

    // mensajes del pipeline → Maya
    this.unsubs.push(g.bridge.on('onboarding:message', (msg) => {
      this.pendingMessage = msg
    }))
    this.unsubs.push(g.bridge.on('program:generating', ({ porcentaje, mensaje }) => {
      if (this.phase === 'generating') {
        this.genStatus.text = `🐝 Las abejas trabajan: ${mensaje} (${Math.round(porcentaje)}%)\nMientras tanto, ¡recoge polen!`
      }
    }))
    this.unsubs.push(g.bridge.on('program:loaded', () => {
      // el Game ya guardó world/progress; pasar al mapa
      void g.goTo(new WorldMapScene(g))
    }))

    void this.runControlsTutorial()
  }

  exit() {
    for (const u of this.unsubs) u()
    this.unsubs = []
  }

  /** Pasos guiados de controles antes de la conversación */
  private async runControlsTutorial() {
    await this.say('¡Hola! Soy Maya, tu abeja guía. 🐝\n¡Bienvenido a la Gran Colmena del saber!')
    await this.say('Primero lo primero: muévete con las flechas (o A/D) y ven hacia mí.\n¡Salta el tronco con ESPACIO!')
    this.controlStep = 1
    // el avance lo detecta update() cuando llega hasta Maya
  }

  private async startConversation() {
    this.phase = 'conversation'
    await this.say('¡Lo lograste! Ya sabes moverte como toda una abeja. 🎉')
    // avisar a React que estamos listos para el onboarding del pipeline
    this.game.bridge.emit('game:ready', {})
    // si no llega ningún mensaje del pipeline (modo demo), conversación local
    setTimeout(() => {
      if (!this.pendingMessage && this.phase === 'conversation' && !this.inDialog) {
        this.pendingMessage = {
          text: '¿Qué te gustaría aprender hoy? Escríbelo y las abejas prepararán tu aventura.',
          freeText: true,
        }
      }
    }, 1500)
  }

  private say(text: string, opts: { options?: string[]; freeText?: boolean } = {}) {
    this.inDialog = true
    return this.dialog.say(text, opts).finally(() => { this.inDialog = false })
  }

  private async handleMessage(msg: OnboardingMessage) {
    if (msg.done) {
      await this.say(msg.text || '¡Perfecto! Las abejas ya están construyendo tu mundo. 🍯\nRecoge polen mientras esperas.')
      this.phase = 'generating'
      this.genStatus.text = '🐝 Las abejas están preparando tu programa…\nMientras tanto, ¡recoge polen!'
      return
    }
    const result = await this.say(msg.text, { options: msg.options, freeText: msg.freeText })
    const answer = result.freeText ?? (result.optionIndex >= 0 ? msg.options?.[result.optionIndex] ?? '' : '')
    if (answer) this.game.bridge.emit('onboarding:answer', { answer })
  }

  private spawnWaitingCoin() {
    const g = this.game
    const x = (34 + Math.random() * 14) * TILE
    const onPlatform = Math.random() < 0.5
    const y = onPlatform ? (GROUND - 5) * TILE : (GROUND - 1.5) * TILE
    const c = new Coin(x, y, g.textures)
    this.world.addChild(c.view)
    this.coins.push(c)
  }

  update(dt: number) {
    const g = this.game

    if (this.dialog.isOpen) {
      this.dialog.update(dt)
      this.maya.update(dt)
      return
    }

    // mensaje pendiente del pipeline
    if (this.pendingMessage && this.phase !== 'controls' && !this.inDialog) {
      const msg = this.pendingMessage
      this.pendingMessage = null
      void this.handleMessage(msg)
      return
    }

    const res = this.player.update(dt, this.map)
    if ((res as { jumped?: boolean }).jumped) g.audio.play('jump')
    if (res.landed) this.particles.dust(this.player.centerX, this.player.body.y + this.player.body.h)

    // no caer fuera
    if (this.player.body.y > this.map.heightPx + 40) {
      this.player.spawnAt(4 * TILE, (GROUND - 2) * TILE)
    }

    this.maya.update(dt)

    // paso 1: llegar hasta Maya
    if (this.phase === 'controls' && this.controlStep === 1) {
      if (Math.abs(this.player.centerX - this.maya.x) < TILE * 2) {
        this.controlStep = 2
        void this.startConversation()
      }
    }

    // zona de espera: monedas que aparecen
    if (this.phase === 'generating') {
      this.coinSpawnT += dt
      if (this.coinSpawnT > 1.2 && this.coins.filter(c => !c.collected).length < 8) {
        this.coinSpawnT = 0
        this.spawnWaitingCoin()
      }
    }

    for (const c of this.coins) {
      c.update(dt)
      if (!c.collected && aabbOverlap(c.rect, this.player.body)) {
        c.collect()
        this.coinsCollected++
        this.particles.burst(c.x, c.y, 0xffd700, 8, 60)
        g.audio.play('coin')
        g.progress.xpTotal += 1
      }
    }

    this.particles.update(dt)
    this.camera.follow(this.player.centerX, this.player.centerY, this.player.body.vx, dt)
    this.camera.apply(this.world)
  }

  resize(w: number, h: number) {
    this.camera?.resize(w, h)
    this.dialog?.layout(w, h)
    if (this.genStatus) this.genStatus.x = w / 2
  }
}
