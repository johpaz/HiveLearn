/**
 * Entidades de nivel: bloque '?', moneda de polen, enemigo avispón y NPC.
 * Cosas pequeñas con hitbox AABB y animación simple.
 */

import { Container, Sprite } from 'pixi.js'
import type { ConceptBlock } from '@hivelearn/core/lesson/levelSpec'
import type { GameTextures } from '../engine/textures'
import type { Tilemap } from '../engine/tilemap'
import { isSolid } from '../engine/tilemap'
import { TILE, type Rect, aabbOverlap } from '../engine/types'

// ─── Bloque '?' ──────────────────────────────────────────────────────────────

export class QuestionBlock {
  readonly view: Sprite
  opened = false
  /** Animación de "bump" al golpearlo */
  private bumpT = -1
  private baseY: number

  constructor(
    public readonly col: number,
    public readonly row: number,
    public readonly concept: ConceptBlock,
    private textures: GameTextures,
  ) {
    this.view = new Sprite(textures.qblock)
    this.view.x = col * TILE
    this.view.y = row * TILE
    this.view.width = TILE
    this.view.height = TILE
    this.baseY = this.view.y
  }

  get rect(): Rect {
    return { x: this.col * TILE, y: this.row * TILE, w: TILE, h: TILE }
  }

  hit() {
    if (this.opened) return
    this.opened = true
    this.view.texture = this.textures.qblockUsed
    this.bumpT = 0
  }

  markOpened() {
    this.opened = true
    this.view.texture = this.textures.qblockUsed
  }

  update(dt: number) {
    if (this.bumpT >= 0) {
      this.bumpT += dt
      const t = this.bumpT / 0.2
      this.view.y = this.baseY - Math.sin(Math.min(t, 1) * Math.PI) * 6
      if (t >= 1) this.bumpT = -1
    } else if (!this.opened) {
      // brillo sutil oscilante
      this.view.alpha = 0.85 + Math.sin(performance.now() / 300) * 0.15
    } else {
      this.view.alpha = 1
    }
  }
}

// ─── Moneda de polen ─────────────────────────────────────────────────────────

export class Coin {
  readonly view: Sprite
  collected = false
  private t = Math.random() * Math.PI * 2

  constructor(public x: number, public y: number, textures: GameTextures) {
    this.view = new Sprite(textures.coin)
    this.view.anchor.set(0.5)
    this.view.width = 10
    this.view.height = 10
    this.view.x = x
    this.view.y = y
  }

  get rect(): Rect {
    return { x: this.x - 5, y: this.y - 5, w: 10, h: 10 }
  }

  update(dt: number) {
    if (this.collected) return
    this.t += dt * 3
    this.view.y = this.y + Math.sin(this.t) * 2
    this.view.scale.x = Math.abs(Math.cos(this.t * 0.7)) * (10 / this.view.texture.width)
  }

  collect() {
    this.collected = true
    this.view.visible = false
  }
}

// ─── Enemigo avispón (patrulla) ──────────────────────────────────────────────

export class Wasp {
  readonly view: Sprite
  dead = false
  private dir = -1
  private speed: number

  constructor(public x: number, public y: number, difficulty: number, textures: GameTextures) {
    this.view = new Sprite(textures.wasp)
    this.view.anchor.set(0.5, 1)
    this.view.width = 13
    this.view.height = 13
    this.speed = 25 + difficulty * 12
    this.view.x = x
    this.view.y = y
  }

  get rect(): Rect {
    return { x: this.view.x - 6, y: this.view.y - 11, w: 12, h: 11 }
  }

  update(dt: number, map: Tilemap) {
    if (this.dead) return
    const nextX = this.view.x + this.dir * this.speed * dt
    // girar en paredes o al borde de la plataforma
    const aheadCol = Math.floor((nextX + this.dir * 7) / TILE)
    const footRow = Math.floor((this.view.y + 2) / TILE)
    const wallAhead = isSolid(map.get(aheadCol, footRow - 1))
    const floorAhead = isSolid(map.get(aheadCol, footRow)) || map.get(aheadCol, footRow) === 2
    if (wallAhead || !floorAhead) {
      this.dir = -this.dir
    } else {
      this.view.x = nextX
    }
    this.view.scale.x = this.dir * Math.abs(this.view.scale.x)
    // aleteo
    this.view.y = this.y + Math.sin(performance.now() / 120 + this.x) * 1.5
  }

  stomp() {
    this.dead = true
    this.view.scale.y *= 0.3
    this.view.alpha = 0.6
    setTimeout(() => { this.view.visible = false }, 400)
  }

  overlaps(r: Rect): boolean {
    return !this.dead && aabbOverlap(this.rect, r)
  }
}

// ─── NPC (Maya u otros) ──────────────────────────────────────────────────────

export class Npc {
  readonly view = new Container()
  private sprite: Sprite

  constructor(public x: number, public y: number, textures: GameTextures) {
    this.sprite = new Sprite(textures.maya)
    this.sprite.anchor.set(0.5, 1)
    this.view.addChild(this.sprite)
    this.view.x = x
    this.view.y = y
  }

  get rect(): Rect {
    return { x: this.x - 10, y: this.y - 16, w: 20, h: 16 }
  }

  update(_dt: number) {
    // flotar suavemente
    this.view.y = this.y + Math.sin(performance.now() / 400) * 2
  }
}
