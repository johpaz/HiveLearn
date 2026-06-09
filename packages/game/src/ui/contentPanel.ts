/**
 * Panel de contenido pixel-art: se abre al golpear un bloque '?'.
 * Muestra el concepto (con TTS opcional), y al cerrar lanza la micro-eval
 * si el concepto la trae. El juego queda pausado mientras está abierto.
 */

import { Container, Graphics, Text } from 'pixi.js'
import type { ConceptBlock } from '@hivelearn/core/lesson/levelSpec'
import type { AudioManager } from '../engine/audio'
import type { Input } from '../engine/input'

const TITLE_STYLE = { fontFamily: 'monospace', fontSize: 20, fill: 0xffd700, fontWeight: 'bold' as const }
const BODY_STYLE = { fontFamily: 'monospace', fontSize: 15, fill: 0xffffff, wordWrap: true, lineHeight: 22 }
const HINT_STYLE = { fontFamily: 'monospace', fontSize: 12, fill: 0x8ecae6 }

export interface ConceptResult {
  /** true si superó la micro-eval (o no había) */
  correct: boolean
}

type Phase = 'reading' | 'quiz' | 'closed'

export class ContentPanel {
  readonly view = new Container()
  private bg = new Graphics()
  private title = new Text({ text: '', style: TITLE_STYLE })
  private body = new Text({ text: '', style: BODY_STYLE })
  private hint = new Text({ text: '', style: HINT_STYLE })
  private optionTexts: Text[] = []

  private phase: Phase = 'closed'
  private concept: ConceptBlock | null = null
  private selected = 0
  private attempts = 0
  private resolver: ((r: ConceptResult) => void) | null = null
  private viewW = 800
  private viewH = 600
  private ttsUrl: string | null = null

  constructor(private audio: AudioManager, private input: Input) {
    this.view.visible = false
    this.view.addChild(this.bg, this.title, this.body, this.hint)
  }

  get isOpen() { return this.phase !== 'closed' }

  /** Permite a la escena inyectar la URL de TTS cuando llegue por el bridge */
  setTtsUrl(url: string) {
    this.ttsUrl = url
  }

  open(concept: ConceptBlock): Promise<ConceptResult> {
    this.concept = concept
    this.phase = 'reading'
    this.selected = 0
    this.attempts = 0
    this.ttsUrl = null
    this.view.visible = true
    this.title.text = `📖 ${concept.titulo}`
    this.body.text = concept.contenido
    this.hint.text = '[E] continuar · [↑] escuchar de nuevo'
    this.layout(this.viewW, this.viewH)
    this.audio.play('block')
    return new Promise((resolve) => {
      this.resolver = resolve
    })
  }

  /** Reproduce el TTS si la capa React lo proveyó */
  private playTts() {
    if (this.ttsUrl) void this.audio.playVoice(this.ttsUrl)
  }

  update(_dt: number) {
    if (this.phase === 'closed') return

    if (this.phase === 'reading') {
      if (this.input.isPressed('up')) this.playTts()
      if (this.input.isPressed('interact') || this.input.isPressed('jump')) {
        if (this.concept?.microEval) {
          this.startQuiz()
        } else {
          this.close(true)
        }
      }
      return
    }

    // quiz
    const me = this.concept?.microEval
    if (!me) return
    if (this.input.isPressed('down')) {
      this.selected = (this.selected + 1) % me.opciones.length
      this.audio.play('blip')
      this.highlight()
    }
    if (this.input.isPressed('up')) {
      this.selected = (this.selected - 1 + me.opciones.length) % me.opciones.length
      this.audio.play('blip')
      this.highlight()
    }
    if (this.input.isPressed('interact') || this.input.isPressed('jump')) {
      this.answer(this.selected)
    }
  }

  private startQuiz() {
    const me = this.concept!.microEval!
    this.phase = 'quiz'
    this.selected = 0
    this.title.text = '🐝 ¡Demuestra lo que aprendiste!'
    this.body.text = me.pregunta
    this.hint.text = '▲▼ elegir · [E] responder'
    this.audio.stopVoice()
    this.renderOptions(me.opciones)
    this.layout(this.viewW, this.viewH)
  }

  private answer(idx: number) {
    const me = this.concept!.microEval!
    if (idx === me.indiceCorrecto) {
      this.audio.play('correct')
      this.clearOptions()
      this.close(this.attempts === 0)
    } else {
      this.attempts++
      this.audio.play('wrong')
      this.body.text = `${me.pregunta}\n\n💡 ${me.pista ?? 'Inténtalo de nuevo, ¡tú puedes!'}`
      this.layout(this.viewW, this.viewH)
    }
  }

  private renderOptions(options: string[]) {
    this.clearOptions()
    options.forEach((opt, i) => {
      const t = new Text({ text: opt, style: { ...BODY_STYLE, wordWrap: false } })
      t.eventMode = 'static'
      t.cursor = 'pointer'
      t.on('pointerdown', () => this.answer(i))
      this.view.addChild(t)
      this.optionTexts.push(t)
    })
    this.highlight()
  }

  private highlight() {
    const me = this.concept?.microEval
    if (!me) return
    this.optionTexts.forEach((t, i) => {
      t.text = `${i === this.selected ? '▶' : ' '} ${me.opciones[i]}`
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

  private close(correct: boolean) {
    this.phase = 'closed'
    this.view.visible = false
    this.audio.stopVoice()
    this.clearOptions()
    const r = this.resolver
    this.resolver = null
    r?.({ correct })
  }

  layout(w: number, h: number) {
    this.viewW = w
    this.viewH = h
    const pw = Math.min(w - 48, 700)
    const px = (w - pw) / 2
    const optH = this.optionTexts.length * 28
    this.body.style.wordWrapWidth = pw - 60

    // medir el alto del cuerpo ya con wrap aplicado
    const bodyH = this.body.height
    const ph = Math.min(h - 48, 130 + bodyH + optH + 50)
    const py = (h - ph) / 2

    this.bg.clear()
    this.bg.roundRect(px, py, pw, ph, 12).fill({ color: 0x1a1a24, alpha: 0.95 })
    this.bg.roundRect(px, py, pw, ph, 12).stroke({ color: 0xffb300, width: 4 })
    // esquinas hexagonales decorativas
    this.bg.circle(px + 16, py + 16, 5).fill(0xffd700)
    this.bg.circle(px + pw - 16, py + 16, 5).fill(0xffd700)

    this.title.x = px + 30
    this.title.y = py + 20
    this.body.x = px + 30
    this.body.y = py + 60
    this.optionTexts.forEach((t, i) => {
      t.x = px + 40
      t.y = py + 70 + bodyH + i * 28
    })
    this.hint.x = px + 30
    this.hint.y = py + ph - 28
  }
}
