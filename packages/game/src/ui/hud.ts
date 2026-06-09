/**
 * HUD del nivel: corazones (vidas), contador de polen (XP), bloques '?'
 * abiertos vs. totales y números de XP flotantes.
 */

import { Container, Sprite, Text, Texture } from 'pixi.js'
import type { GameTextures } from '../engine/textures'

const STYLE = { fontFamily: 'monospace', fontSize: 16, fill: 0xffffff, fontWeight: 'bold' as const, stroke: { color: 0x1a1a24, width: 3 } }

export class Hud {
  readonly view = new Container()
  private hearts: Sprite[] = []
  private heartTex: Texture
  private coinText: Text
  private blocksText: Text
  private floats: Array<{ t: Text; life: number }> = []

  constructor(textures: GameTextures, maxHearts = 3) {
    this.heartTex = textures.heart
    for (let i = 0; i < maxHearts; i++) {
      const h = new Sprite(this.heartTex)
      h.width = 24
      h.height = 24
      h.x = 12 + i * 28
      h.y = 10
      this.view.addChild(h)
      this.hearts.push(h)
    }

    const coin = new Sprite(textures.coin)
    coin.width = 20
    coin.height = 20
    coin.x = 12
    coin.y = 42
    this.view.addChild(coin)

    this.coinText = new Text({ text: '0', style: STYLE })
    this.coinText.x = 38
    this.coinText.y = 42
    this.view.addChild(this.coinText)

    this.blocksText = new Text({ text: '', style: STYLE })
    this.blocksText.x = 12
    this.blocksText.y = 68
    this.view.addChild(this.blocksText)
  }

  setHearts(n: number) {
    this.hearts.forEach((h, i) => { h.alpha = i < n ? 1 : 0.25 })
  }

  setCoins(n: number) {
    this.coinText.text = String(n)
  }

  setBlocks(opened: number, total: number) {
    this.blocksText.text = total > 0 ? `❓ ${opened}/${total}` : ''
  }

  /** Número de XP flotante en coordenadas de pantalla */
  floatXp(x: number, y: number, xp: number) {
    const t = new Text({ text: `+${xp} XP`, style: { ...STYLE, fill: 0xffe066 } })
    t.anchor.set(0.5)
    t.x = x
    t.y = y
    this.view.addChild(t)
    this.floats.push({ t, life: 0 })
  }

  update(dt: number) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]
      f.life += dt
      f.t.y -= 30 * dt
      f.t.alpha = 1 - f.life / 1.2
      if (f.life >= 1.2) {
        this.view.removeChild(f.t)
        f.t.destroy()
        this.floats.splice(i, 1)
      }
    }
  }
}
