/**
 * Caja de diálogo RPG: texto letra a letra con blip de sonido, retrato del
 * NPC, opciones seleccionables y entrada de texto libre (para el onboarding).
 */

import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import type { AudioManager } from '../engine/audio'
import type { Input } from '../engine/input'

const BOX_HEIGHT = 150
const PAD = 16
const CHAR_DELAY = 0.025

const TEXT_STYLE = {
  fontFamily: 'monospace', fontSize: 16, fill: 0xffffff,
  wordWrap: true, wordWrapWidth: 600, lineHeight: 22,
}

export interface DialogResult {
  /** Índice de la opción elegida, o -1 si era solo texto */
  optionIndex: number
  /** Texto libre escrito por el alumno (si freeText) */
  freeText?: string
}

export class DialogBox {
  readonly view = new Container()
  private box = new Graphics()
  private portrait: Sprite
  private nameText: Text
  private bodyText: Text
  private hintText: Text
  private optionTexts: Text[] = []

  private fullText = ''
  private shown = 0
  private charTimer = 0
  private typing = false
  private options: string[] = []
  private selected = 0
  private resolver: ((r: DialogResult) => void) | null = null
  private htmlInput: HTMLInputElement | null = null
  private viewW = 800
  private viewH = 600

  constructor(
    private audio: AudioManager,
    private input: Input,
    portraitTex: Texture,
    speakerName: string,
  ) {
    this.view.visible = false
    this.view.addChild(this.box)

    this.portrait = new Sprite(portraitTex)
    this.portrait.width = 64
    this.portrait.height = 64
    this.view.addChild(this.portrait)

    this.nameText = new Text({ text: speakerName, style: { ...TEXT_STYLE, fill: 0xffd700, fontSize: 14 } })
    this.bodyText = new Text({ text: '', style: TEXT_STYLE })
    this.hintText = new Text({ text: '▼ [E] continuar', style: { ...TEXT_STYLE, fontSize: 12, fill: 0x8ecae6 } })
    this.view.addChild(this.nameText, this.bodyText, this.hintText)
  }

  get isOpen() { return this.view.visible }

  /** Muestra un diálogo y resuelve cuando el alumno continúa/elige/escribe */
  say(text: string, opts: { options?: string[]; freeText?: boolean } = {}): Promise<DialogResult> {
    this.fullText = text
    this.shown = 0
    this.charTimer = 0
    this.typing = true
    this.options = opts.options ?? []
    this.selected = 0
    this.view.visible = true
    this.bodyText.text = ''
    this.layout(this.viewW, this.viewH)

    if (opts.freeText) this.mountHtmlInput()

    return new Promise((resolve) => {
      this.resolver = resolve
    })
  }

  private mountHtmlInput() {
    const canvas = document.querySelector('canvas')
    const parent = canvas?.parentElement
    if (!parent) return
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.placeholder = 'Escribe tu respuesta y presiona Enter…'
    inp.style.cssText = [
      'position:absolute', 'left:50%', 'transform:translateX(-50%)',
      `bottom:${BOX_HEIGHT + 20}px`, 'width:min(70%,500px)', 'padding:10px 14px',
      'font-family:monospace', 'font-size:16px', 'color:#fff',
      'background:#1a1a24', 'border:3px solid #ffb300', 'border-radius:8px',
      'outline:none', 'z-index:10',
    ].join(';')
    parent.style.position = 'relative'
    parent.appendChild(inp)
    this.htmlInput = inp
    this.input.enabled = false
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter' && inp.value.trim()) {
        const value = inp.value.trim()
        this.unmountHtmlInput()
        this.close({ optionIndex: -1, freeText: value })
      }
    })
    setTimeout(() => inp.focus(), 50)
  }

  private unmountHtmlInput() {
    if (this.htmlInput) {
      this.htmlInput.remove()
      this.htmlInput = null
    }
    this.input.enabled = true
  }

  private close(result: DialogResult) {
    this.view.visible = false
    const r = this.resolver
    this.resolver = null
    r?.(result)
  }

  update(dt: number) {
    if (!this.view.visible) return

    // tipeo letra a letra con blip
    if (this.typing) {
      this.charTimer += dt
      while (this.charTimer >= CHAR_DELAY && this.shown < this.fullText.length) {
        this.charTimer -= CHAR_DELAY
        this.shown++
        const ch = this.fullText[this.shown - 1]
        if (ch !== ' ' && this.shown % 2 === 0) this.audio.play('blip')
      }
      this.bodyText.text = this.fullText.slice(0, this.shown)
      if (this.shown >= this.fullText.length) {
        this.typing = false
        this.renderOptions()
      }
      // saltar el tipeo
      if (this.input.isPressed('interact') || this.input.isPressed('jump')) {
        this.shown = this.fullText.length
        this.bodyText.text = this.fullText
        this.typing = false
        this.renderOptions()
      }
      return
    }

    if (this.htmlInput) return // esperando texto libre

    // navegación de opciones
    if (this.options.length > 0) {
      if (this.input.isPressed('down')) {
        this.selected = (this.selected + 1) % this.options.length
        this.audio.play('blip')
        this.highlight()
      }
      if (this.input.isPressed('up')) {
        this.selected = (this.selected - 1 + this.options.length) % this.options.length
        this.audio.play('blip')
        this.highlight()
      }
      if (this.input.isPressed('interact') || this.input.isPressed('jump')) {
        this.audio.play('correct')
        const idx = this.selected
        this.clearOptions()
        this.close({ optionIndex: idx })
      }
    } else if (this.input.isPressed('interact') || this.input.isPressed('jump')) {
      this.close({ optionIndex: -1 })
    }
  }

  private renderOptions() {
    this.clearOptions()
    this.options.forEach((opt, i) => {
      const t = new Text({ text: `  ${opt}`, style: { ...TEXT_STYLE, fontSize: 15 } })
      this.view.addChild(t)
      this.optionTexts.push(t)
      // también clickeable/táctil
      t.eventMode = 'static'
      t.cursor = 'pointer'
      t.on('pointerdown', () => {
        this.selected = i
        this.audio.play('correct')
        this.clearOptions()
        this.close({ optionIndex: i })
      })
    })
    this.highlight()
    this.layout(this.viewW, this.viewH)
    this.hintText.text = this.options.length > 0 ? '▲▼ elegir · [E] confirmar' : '▼ [E] continuar'
  }

  private highlight() {
    this.optionTexts.forEach((t, i) => {
      t.text = `${i === this.selected ? '▶' : ' '} ${this.options[i]}`
      t.style.fill = i === this.selected ? 0xffd700 : 0xffffff
    })
  }

  private clearOptions() {
    for (const t of this.optionTexts) {
      this.view.removeChild(t)
      t.destroy()
    }
    this.optionTexts = []
  }

  layout(w: number, h: number) {
    this.viewW = w
    this.viewH = h
    const extraH = this.optionTexts.length * 24
    const boxH = BOX_HEIGHT + extraH
    const y = h - boxH - 12

    this.box.clear()
    this.box.roundRect(12, y, w - 24, boxH, 10).fill({ color: 0x1a1a24, alpha: 0.92 })
    this.box.roundRect(12, y, w - 24, boxH, 10).stroke({ color: 0xffb300, width: 3 })

    this.portrait.x = 28
    this.portrait.y = y + (boxH - 64) / 2 - extraH / 2
    this.nameText.x = 110
    this.nameText.y = y + 12
    this.bodyText.x = 110
    this.bodyText.y = y + 36
    this.bodyText.style.wordWrapWidth = w - 160
    this.hintText.x = w - 200
    this.hintText.y = y + boxH - 24

    this.optionTexts.forEach((t, i) => {
      t.x = 110
      t.y = y + boxH - extraH - 24 + i * 24
    })
  }
}
