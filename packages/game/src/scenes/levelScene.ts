/**
 * LevelScene — el platformer. Construye el nivel desde el LevelSpec,
 * corre física/entidades, abre el panel de contenido al golpear bloques '?'
 * y lleva al jefe cuando todos los bloques fueron abiertos.
 */

import { Container, Graphics, Text } from 'pixi.js'
import type { LevelSpec } from '@hivelearn/core/lesson/levelSpec'
import { Scene } from '../engine/scene'
import { Camera } from '../engine/camera'
import { Particles } from '../engine/particles'
import { buildTilemapView } from '../engine/tilemapView'
import { THEME_COLORS } from '../engine/textures'
import { aabbOverlap, TILE } from '../engine/types'
import { generateLevel, type GeneratedLevel } from '../levels/generator'
import { Player } from '../entities/player'
import { QuestionBlock, Coin, Wasp } from '../entities/items'
import { Hud } from '../ui/hud'
import { ContentPanel } from '../ui/contentPanel'
import type { Game } from '../game'
import { BossScene } from './bossScene'
import { WorldMapScene } from './worldMapScene'

export class LevelScene extends Scene {
  private world = new Container()
  private camera!: Camera
  private particles = new Particles()
  private player!: Player
  private hud!: Hud
  private panel!: ContentPanel

  private level!: GeneratedLevel
  private blocks: QuestionBlock[] = []
  private coins: Coin[] = []
  private wasps: Wasp[] = []
  private coinsCollected = 0
  private hearts = 3
  private checkpoint: { x: number; y: number } | null = null
  private doorHint!: Text
  private exitHint!: Text
  private ttsUnsub: (() => void) | null = null

  constructor(game: Game, private spec: LevelSpec) {
    super(game)
  }

  enter() {
    const g = this.game
    const colors = THEME_COLORS[this.spec.theme]
    g.app.renderer.background.color = colors.sky

    this.level = generateLevel(this.spec)
    this.camera = new Camera(g.viewW, g.viewH, this.level.map.widthPx, this.level.map.heightPx)

    // mundo escalado por la cámara
    this.root.addChild(this.world)
    this.world.addChild(buildTilemapView(this.level.map, g.textures.tiles(this.spec.theme)))

    // entidades
    const opened = new Set(g.progress.openedBlocks[this.spec.lessonId] ?? [])
    for (const b of this.level.blocks) {
      const qb = new QuestionBlock(b.col, b.row, b.concept, g.textures)
      if (opened.has(b.concept.nodeId)) qb.markOpened()
      this.world.addChild(qb.view)
      this.blocks.push(qb)
    }
    for (const e of this.level.entities) {
      if (e.kind === 'coin') {
        const c = new Coin(e.x, e.y, g.textures)
        this.world.addChild(c.view)
        this.coins.push(c)
      } else if (e.kind === 'wasp') {
        const w = new Wasp(e.x, e.y, this.spec.difficulty, g.textures)
        this.world.addChild(w.view)
        this.wasps.push(w)
      }
    }

    this.player = new Player(g.input, g.textures)
    // checkpoint guardado de una sesión anterior
    const saved = g.progress.checkpoint
    if (saved && saved.lessonId === this.spec.lessonId) {
      this.checkpoint = { x: saved.x, y: saved.y }
      this.player.spawnAt(saved.x, saved.y)
    } else {
      this.player.spawnAt(this.level.playerSpawn.x, this.level.playerSpawn.y)
    }
    this.world.addChild(this.player.view)
    this.world.addChild(this.particles.view)
    this.camera.snapTo(this.player.centerX, this.player.centerY)

    // HUD + panel (capa de pantalla, sin escalar)
    this.hud = new Hud(g.textures)
    this.hud.setHearts(this.hearts)
    this.hud.setBlocks(this.openedCount(), this.blocks.length)
    this.root.addChild(this.hud.view)

    this.panel = new ContentPanel(g.audio, g.input)
    this.root.addChild(this.panel.view)

    this.doorHint = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 14, fill: 0xffffff, stroke: { color: 0x1a1a24, width: 3 } },
    })
    this.doorHint.anchor.set(0.5)
    this.world.addChild(this.doorHint)

    this.exitHint = new Text({
      text: `🏠 ${this.spec.titulo}`,
      style: { fontFamily: 'monospace', fontSize: 13, fill: 0xffffff, stroke: { color: 0x1a1a24, width: 3 } },
    })
    this.exitHint.x = 12
    this.exitHint.y = this.game.viewH - 28
    this.root.addChild(this.exitHint)

    // TTS que llegue por el bridge se inyecta al panel
    this.ttsUnsub = g.bridge.on('tts:ready', ({ url }) => this.panel.setTtsUrl(url))

    g.audio.playMusic(this.spec.theme)
  }

  exit() {
    this.ttsUnsub?.()
    this.game.audio.stopVoice()
  }

  private openedCount(): number {
    return this.blocks.filter(b => b.opened).length
  }

  update(dt: number) {
    const g = this.game

    // pausa total mientras el panel está abierto
    if (this.panel.isOpen) {
      this.panel.update(dt)
      return
    }

    const res = this.player.update(dt, this.level.map)

    // sonido + efectos del movimiento
    if ((res as { jumped?: boolean }).jumped) g.audio.play('jump')
    if (res.landed) {
      this.particles.dust(this.player.centerX, this.player.body.y + this.player.body.h)
    }

    // golpe de cabeza a bloques '?'
    for (const bump of res.headBumps) void bump
    this.checkBlockHits()

    // hazard o caída al vacío
    if (res.touchedHazard || this.player.body.y > this.level.map.heightPx + 60) {
      this.onHurt(true)
    }

    // monedas
    const pRect = this.player.body
    for (const c of this.coins) {
      if (!c.collected && aabbOverlap(c.rect, pRect)) {
        c.collect()
        this.coinsCollected++
        this.hud.setCoins(this.coinsCollected)
        this.particles.burst(c.x, c.y, 0xffd700, 8, 60)
        g.audio.play('coin')
      }
      c.update(dt)
    }

    // enemigos
    for (const w of this.wasps) {
      w.update(dt, this.level.map)
      if (w.overlaps(pRect)) {
        // pisotón si caemos sobre él
        if (this.player.body.vy > 50 && this.player.body.y + this.player.body.h < w.rect.y + w.rect.h * 0.6) {
          w.stomp()
          this.player.bounce()
          this.particles.burst(w.view.x, w.view.y - 6, 0xe25822, 10, 70)
          g.audio.play('stomp')
        } else {
          this.onHurt(false)
        }
      }
    }

    // checkpoints
    for (const e of this.level.entities) {
      if (e.kind !== 'checkpoint') continue
      const cpRect = { x: e.x - 8, y: e.y - 16, w: 16, h: 32 }
      if (aabbOverlap(cpRect, pRect) && (!this.checkpoint || this.checkpoint.x < e.x)) {
        this.checkpoint = { x: e.x, y: e.y - 16 }
        g.progress.checkpoint = { lessonId: this.spec.lessonId, x: e.x, y: e.y - 16 }
        g.saveProgress()
        g.audio.play('checkpoint')
        this.particles.burst(e.x, e.y, 0x3aa655, 12, 80)
      }
    }

    // bloques (animación)
    for (const b of this.blocks) b.update(dt)

    // puerta del jefe
    const door = this.level.door
    const nearDoor = Math.abs(this.player.centerX - door.x - TILE / 2) < TILE * 1.5
      && Math.abs(this.player.centerY - door.y - TILE) < TILE * 2
    const allOpen = this.openedCount() === this.blocks.length
    if (nearDoor) {
      this.doorHint.text = allOpen ? '[E] ¡Enfrentar al jefe!' : `Te faltan ${this.blocks.length - this.openedCount()} bloques ?`
      this.doorHint.x = door.x + TILE / 2
      this.doorHint.y = door.y - 14
      if (allOpen && g.input.isPressed('interact')) {
        void this.goToBoss()
        return
      }
    } else {
      this.doorHint.text = ''
    }

    // salir al mapa
    if (g.input.isPressed('pause')) {
      void g.goTo(new WorldMapScene(g))
      return
    }

    this.particles.update(dt)
    this.hud.update(dt)
    this.camera.follow(this.player.centerX, this.player.centerY, this.player.body.vx, dt)
    this.camera.apply(this.world)
  }

  private checkBlockHits() {
    const p = this.player.body
    if (p.vy >= 0) return
    const headRect = { x: p.x + 2, y: p.y - 2, w: p.w - 4, h: 4 }
    for (const b of this.blocks) {
      if (b.opened || !aabbOverlap(b.rect, headRect)) continue
      b.hit()
      this.player.body.vy = 30
      this.particles.burst(b.col * TILE + TILE / 2, b.row * TILE, 0xffb300, 12, 80)
      this.camera.shake(3, 0.15)
      void this.openConcept(b)
      break
    }
  }

  private async openConcept(b: QuestionBlock) {
    const g = this.game
    g.bridge.emit('concept:opened', { lessonId: this.spec.lessonId, nodeId: b.concept.nodeId })
    g.bridge.emit('tts:request', { nodeId: b.concept.nodeId, text: b.concept.ttsText })

    const result = await this.panel.open(b.concept)

    // registrar progreso
    const list = g.progress.openedBlocks[this.spec.lessonId] ?? []
    if (!list.includes(b.concept.nodeId)) {
      list.push(b.concept.nodeId)
      g.progress.openedBlocks[this.spec.lessonId] = list
    }
    g.progress.xpTotal += b.concept.xp
    g.saveProgress()
    g.bridge.emit('concept:completed', {
      lessonId: this.spec.lessonId,
      nodeId: b.concept.nodeId,
      xp: b.concept.xp,
      correct: result.correct,
    })

    this.hud.setBlocks(this.openedCount(), this.blocks.length)
    this.hud.floatXp(this.game.viewW / 2, this.game.viewH / 2 - 60, b.concept.xp)
  }

  private onHurt(fall: boolean) {
    const g = this.game
    if (!fall && !this.player.hurt()) return
    this.hearts--
    this.hud.setHearts(this.hearts)
    g.audio.play('hurt')
    this.camera.shake(5, 0.3)

    if (fall || this.hearts <= 0) {
      // respawn en checkpoint (o inicio); quedarse sin corazones reinicia corazones
      if (this.hearts <= 0) {
        this.hearts = 3
        this.hud.setHearts(this.hearts)
      }
      const spawn = this.checkpoint ?? this.level.playerSpawn
      this.player.spawnAt(spawn.x, spawn.y)
      this.player.invulnTimer = 1.5
      this.camera.snapTo(this.player.centerX, this.player.centerY)
    }
  }

  private async goToBoss() {
    this.game.progress.checkpoint = null
    this.game.saveProgress()
    await this.game.goTo(new BossScene(this.game, this.spec, this.coinsCollected))
  }

  resize(w: number, h: number) {
    this.camera?.resize(w, h)
    this.panel?.layout(w, h)
    if (this.exitHint) this.exitHint.y = h - 28
  }
}
