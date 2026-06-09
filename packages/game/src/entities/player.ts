/**
 * Player — la abeja del alumno. Movimiento con aceleración, salto con
 * coyote-time y jump-buffer (se siente "Mario"), squash & stretch,
 * animación idle/run/jump e invulnerabilidad parpadeante tras daño.
 */

import { Container, Sprite } from 'pixi.js'
import type { Input } from '../engine/input'
import type { Tilemap } from '../engine/tilemap'
import { stepBody, type Body, type PhysicsResult } from '../engine/physics'
import type { GameTextures } from '../engine/textures'
import { lerp } from '../engine/types'

const ACCEL = 900
const DECEL = 1100
const MAX_SPEED = 140
const JUMP_VELOCITY = -340
const COYOTE = 0.09
const JUMP_BUFFER = 0.12
const HURT_INVULN = 1.4

export class Player {
  readonly view = new Container()
  readonly body: Body = { x: 0, y: 0, w: 11, h: 12, vx: 0, vy: 0, onGround: false }

  private sprite: Sprite
  private coyoteTimer = 0
  private bufferTimer = 0
  private runAnimT = 0
  private squash = { x: 1, y: 1 }
  invulnTimer = 0
  facing = 1

  constructor(private input: Input, private textures: GameTextures) {
    this.sprite = new Sprite(textures.bee.idle)
    this.sprite.anchor.set(0.5, 1)
    this.view.addChild(this.sprite)
  }

  spawnAt(x: number, y: number) {
    this.body.x = x
    this.body.y = y
    this.body.vx = 0
    this.body.vy = 0
    this.syncView()
  }

  /** Devuelve el resultado de física para que la escena reaccione */
  update(dt: number, map: Tilemap, frozen = false): PhysicsResult {
    const axis = frozen ? 0 : this.input.axisX

    // aceleración horizontal
    if (axis !== 0) {
      this.body.vx += axis * ACCEL * dt
      if (Math.abs(this.body.vx) > MAX_SPEED) this.body.vx = Math.sign(this.body.vx) * MAX_SPEED
      this.facing = axis
    } else {
      const dec = DECEL * dt
      if (Math.abs(this.body.vx) <= dec) this.body.vx = 0
      else this.body.vx -= Math.sign(this.body.vx) * dec
    }

    // coyote + buffer de salto
    this.coyoteTimer = this.body.onGround ? COYOTE : Math.max(0, this.coyoteTimer - dt)
    this.bufferTimer = (!frozen && this.input.isPressed('jump')) ? JUMP_BUFFER : Math.max(0, this.bufferTimer - dt)

    let jumped = false
    if (this.bufferTimer > 0 && this.coyoteTimer > 0) {
      this.body.vy = JUMP_VELOCITY
      this.coyoteTimer = 0
      this.bufferTimer = 0
      jumped = true
      this.squash = { x: 0.7, y: 1.3 }
    }
    // salto variable: soltar antes corta el impulso
    if (!frozen && !this.input.isHeld('jump') && this.body.vy < JUMP_VELOCITY * 0.4) {
      this.body.vy = JUMP_VELOCITY * 0.4
    }

    // bajar de plataformas one-way: abajo + saltar
    if (!frozen && this.input.isHeld('down') && this.input.isPressed('jump') && this.body.onGround) {
      this.body.dropThrough = true
      this.body.y += 2
    }

    const res = stepBody(this.body, map, dt)
    if (res.landed) this.squash = { x: 1.25, y: 0.75 }
    if (jumped) (res as PhysicsResult & { jumped?: boolean }).jumped = true

    if (this.invulnTimer > 0) this.invulnTimer -= dt

    this.animate(dt)
    this.syncView()
    return res
  }

  private animate(dt: number) {
    const t = this.textures.bee
    if (!this.body.onGround) {
      this.sprite.texture = t.jump
    } else if (Math.abs(this.body.vx) > 10) {
      this.runAnimT += dt * (Math.abs(this.body.vx) / MAX_SPEED)
      this.sprite.texture = Math.floor(this.runAnimT * 10) % 2 === 0 ? t.run1 : t.run2
    } else {
      this.sprite.texture = t.idle
    }

    // recuperación del squash & stretch
    this.squash.x = lerp(this.squash.x, 1, 1 - Math.pow(0.0001, dt))
    this.squash.y = lerp(this.squash.y, 1, 1 - Math.pow(0.0001, dt))

    // parpadeo de invulnerabilidad
    this.sprite.alpha = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 12) % 2 === 0 ? 0.3 : 1
  }

  private syncView() {
    this.view.x = this.body.x + this.body.w / 2
    this.view.y = this.body.y + this.body.h
    this.sprite.scale.set(this.facing * Math.abs(this.squash.x), this.squash.y)
  }

  hurt(): boolean {
    if (this.invulnTimer > 0) return false
    this.invulnTimer = HURT_INVULN
    this.body.vy = -200
    this.body.vx = -this.facing * 120
    return true
  }

  bounce() {
    this.body.vy = JUMP_VELOCITY * 0.7
  }

  get centerX() { return this.body.x + this.body.w / 2 }
  get centerY() { return this.body.y + this.body.h / 2 }
}
