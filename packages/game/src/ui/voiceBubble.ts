/**
 * VoiceBubble — burbuja de diálogo in-game siguiendo el lenguaje visual de
 * `packages/ui/src/canvas/SpeechBubbles.ts` (fondo oscuro redondeado, nombre
 * bold arriba, texto abajo, cola triangular apuntando al personaje).
 *
 * A diferencia de SpeechBubbles.ts (Canvas2D), esta versión es un Container de
 * Pixi v8 con:
 *   - Graphics (fondo redondeado + tail) — se re-dibuja al cambiar texto.
 *   - Text para nombre (bold, color del agente) y mensaje (blanco).
 *   - Spring-physics simple: escala desde 0.6 hasta 1.0 con slight overshoot
 *     cuando aparece, y fade-out cuando se vacía.
 *   - Soporte para emotion: cambia el color del borde del fondo.
 *
 * Pensada para usarse como única bubble por conversación voice: el hiveHub
 * crea un VoiceBubble para el usuario (sobre el jugador) y otro para el agente
 * (sobre el NPC) y los reutiliza.
 */

import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js'

export interface VoiceBubbleOptions {
  /** Color del nombre (típicamente el accent del agente). */
  nameColor?: number
  /** Font size del nombre. */
  nameSize?: number
  /** Font size del mensaje. */
  textSize?: number
  /** Ancho máximo del texto (wrap). */
  maxWidth?: number
  /** Color del fondo. */
  bgColor?: number
  /** Alpha del fondo. */
  bgAlpha?: number
  /** Si la burbuja se ancla abajo (default) o arriba del personaje. */
  anchor?: 'below' | 'above'
}

type Emotion = 'happy' | 'thinking' | 'alert' | 'celebrate'

const STROKE_BY_EMOTION: Record<Emotion, number> = {
  happy: 0xff8fb3,
  thinking: 0x4fc3f7,
  alert: 0xe25822,
  celebrate: 0xffd700,
}

export class VoiceBubble {
  readonly view = new Container()

  private bg = new Graphics()
  private nameText: Text
  private messageText: Text
  private portraitSprite: Sprite | null = null
  private opts: Required<VoiceBubbleOptions>
  private currentEmotion: Emotion = 'happy'
  private visible = false
  private scale = 0
  private scaleVel = 0
  private alpha = 0
  private fadeOut = false

  constructor(opts: VoiceBubbleOptions = {}) {
    this.opts = {
      nameColor: opts.nameColor ?? 0xffd700,
      nameSize: opts.nameSize ?? 11,
      textSize: opts.textSize ?? 12,
      maxWidth: opts.maxWidth ?? 220,
      bgColor: opts.bgColor ?? 0x0a0f1e,
      bgAlpha: opts.bgAlpha ?? 0.9,
      anchor: opts.anchor ?? 'below',
    }

    const nameStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: this.opts.nameSize,
      fill: this.opts.nameColor,
      fontWeight: 'bold',
      align: 'left',
    })
    this.nameText = new Text({ text: '', style: nameStyle })
    this.nameText.anchor.set(0, 0.5)

    const msgStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: this.opts.textSize,
      fill: 0xffffff,
      wordWrap: true,
      wordWrapWidth: this.opts.maxWidth - 12,
      align: 'left',
      lineHeight: 16,
    })
    this.messageText = new Text({ text: '', style: msgStyle })
    this.messageText.anchor.set(0, 0.5)

    this.view.addChild(this.bg, this.nameText, this.messageText)
    this.view.sortableChildren = true
    this.view.visible = false
    this.view.alpha = 0
  }

  /** Muestra la burbuja con un nombre + texto dados. Anima el spring. */
  show(name: string, text: string, emotion: Emotion = 'happy'): void {
    this.currentEmotion = emotion
    this.nameText.text = name
    this.messageText.text = text
    this.fadeOut = false
    this.visible = true
    this.view.visible = true
    this.layout()
    // Iniciar spring desde escala 0.6 (overshoot hacia 1.0)
    this.scale = 0.6
    this.scaleVel = 0.05
    this.alpha = 0
    this.view.alpha = 0
  }

  /** Actualiza el texto sin reiniciar el spring (útil para streaming delta). */
  appendText(delta: string): void {
    this.messageText.text = (this.messageText.text ?? '') + delta
    this.layout()
  }

  setText(text: string): void {
    this.messageText.text = text
    this.layout()
  }

  setEmotion(emotion: Emotion): void {
    this.currentEmotion = emotion
    this.layout()
  }

  /** Fija/quita el retrato (IA) mostrado a la izquierda del nombre. */
  setPortrait(texture: Texture | null): void {
    if (this.portraitSprite) {
      this.view.removeChild(this.portraitSprite)
      this.portraitSprite.destroy()
      this.portraitSprite = null
    }
    if (texture) {
      this.portraitSprite = new Sprite(texture)
      this.portraitSprite.width = 24
      this.portraitSprite.height = 24
      this.view.addChild(this.portraitSprite)
    }
    this.layout()
  }

  hide(): void {
    this.fadeOut = true
  }

  isEmpty(): boolean {
    return !this.visible && !this.fadeOut
  }

  /** Llamar cada frame; anima spring + fade. */
  update(dt: number): void {
    if (!this.visible && !this.fadeOut) {
      this.view.visible = false
      return
    }
    // Spring hacia 1.0 (overshoot damping critical)
    const target = this.fadeOut ? 0 : 1
    const k = 18
    const damping = 9
    const force = -k * (this.scale - target) - damping * this.scaleVel
    this.scaleVel += force * dt
    this.scale += this.scaleVel * dt
    // Alpha
    const alphaTarget = this.fadeOut ? 0 : 1
    this.alpha += (alphaTarget - this.alpha) * Math.min(1, dt * 12)
    this.view.scale.set(this.scale)
    this.view.alpha = this.alpha
    if (this.fadeOut && this.alpha < 0.02) {
      this.visible = false
      this.fadeOut = false
      this.view.visible = false
    }
  }

  /** Reubica la burbuja respecto a ancla (x,y). La bubble se dibuja arriba o
   * abajo según opts.anchor; la cola apunta al personaje. */
  attachTo(x: number, y: number): void {
    this.view.x = x
    if (this.opts.anchor === 'below') {
      this.view.y = y + 8
    } else {
      // Arriba: la altura crece hacia arriba, y la cola apunta abajo
      const h = this.bg.height
      this.view.y = y - h - 8
    }
  }

  private layout(): void {
    // Padding interior
    const pad = 6
    const hasPortrait = !!this.portraitSprite
    const textPad = hasPortrait ? pad + 28 : pad
    const nameH = this.opts.nameSize + 2
    // El wrap del texto descuenta el hueco del retrato
    this.messageText.style.wordWrapWidth = this.opts.maxWidth - textPad - pad
    const msgW = this.messageText.width
    const msgH = this.messageText.height
    const totalW = Math.min(this.opts.maxWidth, Math.max(this.nameText.width, msgW) + textPad + pad)
    const contentH = Math.max(nameH + msgH, hasPortrait ? 26 : 0)
    const totalH = contentH + pad * 2

    // Retrato a la izquierda, centrado verticalmente
    if (this.portraitSprite) {
      this.portraitSprite.x = pad
      this.portraitSprite.y = pad + (contentH - 24) / 2
    }

    // Nombre en la esquina superior-izquierda (tras el retrato si lo hay)
    this.nameText.x = textPad
    this.nameText.y = pad + nameH * 0.5

    // Mensaje abajo del nombre
    this.messageText.x = textPad
    this.messageText.y = pad + nameH + msgH * 0.5

    // Fondo: redondeado con tail triangular
    this.bg.clear()
    this.bg.roundRect(0, 0, totalW, totalH, 5).fill({ color: this.opts.bgColor, alpha: this.opts.bgAlpha })
    this.bg.roundRect(0, 0, totalW, totalH, 5).stroke({ color: STROKE_BY_EMOTION[this.currentEmotion], width: 1.5, alpha: 0.85 })
    // Tail: triángulo apuntando al personaje.
    // El tail se dibuja en posición relativa al container; attachTo ya ubica
    // la bubble arriba (anchor='below'), por lo que el tail va abajo al centro.
    const tailX = totalW * 0.5
    if (this.opts.anchor === 'below') {
      this.bg.poly([tailX - 4, totalH, tailX, totalH + 6, tailX + 4, totalH]).fill({ color: this.opts.bgColor, alpha: this.opts.bgAlpha })
      this.bg.moveTo(tailX - 4, totalH).lineTo(tailX, totalH + 6).lineTo(tailX + 4, totalH).stroke({ color: STROKE_BY_EMOTION[this.currentEmotion], width: 1.5, alpha: 0.85 })
    } else {
      this.bg.poly([tailX - 4, 0, tailX, -6, tailX + 4, 0]).fill({ color: this.opts.bgColor, alpha: this.opts.bgAlpha })
      this.bg.moveTo(tailX - 4, 0).lineTo(tailX, -6).lineTo(tailX + 4, 0).stroke({ color: STROKE_BY_EMOTION[this.currentEmotion], width: 1.5, alpha: 0.85 })
    }
  }
}