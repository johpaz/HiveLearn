/**
 * PanalScene — EL juego: "El Panal Viviente" (Three.js nativo desde cero).
 *
 * El programa personalizado del alumno ES el mundo: cada celda hexagonal del
 * panal 3D es un módulo del currículum generado por el enjambre. Vuelo libre
 * en diorama 2.5D isométrico; al acercarse a la celda disponible y pulsar [E]
 * se abre el reto:
 *
 *   1. Polen explica los conceptos del módulo HABLANDO (TTS + texto)
 *   2. El alumno puede preguntarle (chat con el agente real vía WS)
 *   3. Guardia cierra con un mini-quiz → celda dominada (miel encendida)
 *
 * Todo el progreso fluye por los eventos bridge existentes hacia hiveDB.
 */
import { Scene } from '../engine/scene'
import type { Game } from '../game'
import * as THREE from 'three'
import type { Scene3D } from '../engine/three/worldRenderer'
import { IsoCamera } from '../engine/three/worldCamera'
import { HoneycombWorld, type HoneyCell } from '../engine/three/panal/HoneycombWorld'
import { BeePlayer } from '../engine/three/panal/BeePlayer'
import { buildHiveScene3D } from '../engine/three/builders'
import type { LevelSpec } from '@hivelearn/core/lesson/levelSpec'
import { demoLevelSpec } from '../levels/generator'

export class PanalScene extends Scene {
  private iso!: IsoCamera
  private comb!: HoneycombWorld
  private bee!: BeePlayer
  private backdrop: Scene3D | null = null
  private overlay!: HTMLDivElement
  private prompt!: HTMLDivElement
  private header!: HTMLDivElement
  private challengePanel: HTMLDivElement | null = null
  private time = 0
  private unsubs: Array<() => void> = []
  private ttsWaiters = new Map<string, (url: string | null) => void>()
  private ttsSeq = 0
  private activeCell: HoneyCell | null = null
  /** Respuestas del agente (chat WS) por requestId */
  private chatWaiters = new Map<string, { text: string; done: boolean }>()

  constructor(game: Game) {
    super(game)
  }

  // ─── Ciclo de vida ──────────────────────────────────────────────────────

  enter() {
    const g = this.game
    g.setCinematic(true)
    g.audio.playMusic('sala_real')
    g.audio.setMusicTempo(g.theme.musicTempo)

    // Cámara isométrica + mundo
    this.iso = new IsoCamera(g.viewW / Math.max(g.viewH, 1))
    g.worldRenderer.setWorldCamera(this.iso.camera)

    // Fondo: pared de panal shader (hiveWall) + polen
    if (g.worldRenderer.isAlive) {
      this.backdrop = buildHiveScene3D({ variant: 'hub' })
      g.worldRenderer.setScene(this.backdrop)
    }

    // Panal desde el programa real (o demo en dev)
    this.comb = new HoneycombWorld()
    const levels: LevelSpec[] = g.world?.levels?.length ? g.world.levels : [demoLevelSpec()]
    this.comb.build(levels, g.progress.openedBlocks, g.progress.stars)
    this.fitBounds()
    this.comb.root.position.z = 0

    // Abeja del alumno
    this.bee = new BeePlayer()
    const first = this.comb.availableCell ?? this.comb.cells[0]
    this.bee.snapTo(first ? first.basePos.x : 0, (first ? first.basePos.y : 0) + 1.2)
    this.comb.root.add(this.bee.root)

    // Luces del diorama (viven en el backdrop root → se limpian con él)
    this.addWorldLights()

    this.buildOverlay()
    this.updateHeader()

    this.iso.snapTo(this.bee.x, this.bee.y, 0)

    // TTS listo → resuelve promesas de la escena
    this.unsubs.push(g.bridge.on('tts:ready', ({ nodeId, url }) => {
      const w = this.ttsWaiters.get(nodeId)
      if (!w) return
      clearTimeout((w as any).timer)
      this.ttsWaiters.delete(nodeId)
      w(url)
    }))
    // Respuestas del agente (chat WS reenviado por React)
    this.unsubs.push(g.bridge.on('agent:reply', ({ requestId, delta, reply, done }) => {
      const w = this.chatWaiters.get(requestId)
      if (!w) return
      if (delta) w.text += delta
      if (reply) w.text = reply
      w.done = !!done
    }))

    // Si el programa se recarga (p. ej. generación terminada), reconstruye
    this.unsubs.push(g.bridge.on('program:loaded', () => {
      this.rebuildComb()
    }))
  }

  exit() {
    for (const u of this.unsubs) u()
    this.unsubs = []
    this.game.setCinematic(false)
    this.game.worldRenderer.setWorldCamera(null)
    this.backdrop?.dispose?.()
    this.backdrop = null
    this.game.worldRenderer.setScene(null)
    this.comb?.dispose()
    this.bee?.dispose()
    this.destroyOverlay()
  }

  resize(w: number, h: number) {
    this.iso?.resize(w / Math.max(h, 1))
  }

  // ─── Loop principal ─────────────────────────────────────────────────────

  update(dt: number) {
    const g = this.game
    this.time += dt

    // vuelo libre (pausado si el panel de reto está abierto)
    if (!this.challengePanel) {
      const axisX = (g.input.isHeld('right') ? 1 : 0) - (g.input.isHeld('left') ? 1 : 0)
      const axisY = (g.input.isHeld('up') ? 1 : 0) - (g.input.isHeld('down') ? 1 : 0)
      this.bee.update(dt, axisX, axisY)
    }

    this.comb.update(dt, this.time)
    this.iso.follow(this.bee.x, this.bee.y, 0, dt)

    // celda cercana disponible → prompt + [E] abre
    const near = this.comb.cellAt(this.bee.pos, 1.15)
    const target = near && near.state === 'available' ? near : null
    if (target) {
      this.showPrompt(target)
      if (!this.challengePanel && g.input.isPressed('interact')) {
        void this.openCell(target)
      }
    } else {
      this.hidePrompt()
    }
  }

  // ─── Construcción del mundo ─────────────────────────────────────────────

  private fitBounds() {
    let minX = 99, maxX = -99, minY = 99, maxY = -99
    for (const c of this.comb.cells) {
      minX = Math.min(minX, c.basePos.x); maxX = Math.max(maxX, c.basePos.x)
      minY = Math.min(minY, c.basePos.y); maxY = Math.max(maxY, c.basePos.y)
    }
    const m = 1.5
    this.bee.bounds = { minX: minX - m, maxX: maxX + m, minY: minY - m, maxY: maxY + m }
  }

  private addWorldLights() {
    const root = this.backdrop?.root
    if (!root) return
    const ambient = new THREE.AmbientLight(0xffe0a0, 1.2)
    const key = new THREE.DirectionalLight(0xffc94d, 2.4)
    key.position.set(6, 8, 10)
    const rim = new THREE.DirectionalLight(0xff8f00, 1.1)
    rim.position.set(-8, -4, -6)
    root.add(ambient, key, rim)
  }

  private rebuildComb() {
    const g = this.game
    if (!g.world?.levels?.length) return
    this.comb.dispose()
    this.comb = new HoneycombWorld()
    this.comb.build(g.world.levels, g.progress.openedBlocks, g.progress.stars)
    this.fitBounds()
  }

  // ─── Reto de celda: Polen explica → preguntas → Guardia quiz ────────────

  private async openCell(cell: HoneyCell) {
    const g = this.game
    this.activeCell = cell
    this.comb.markActive(cell)
    this.hidePrompt()

    const concepts = cell.level.concepts ?? []
    const panel = this.showChallengePanel(cell.level.titulo, concepts.length)

    // 1) Polen explica cada concepto hablando
    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i]!
      this.setPanelStatus(panel, `Polen explica (${i + 1}/${concepts.length}): ${c.titulo}`)
      const spoken = await this.speak('content', ` ${c.contenido}`.slice(0, 780))
      this.addPanelConcept(panel, c.titulo, spoken ? '' : c.contenido, c.xp)
      if (!spoken) await this.sleep(1200)
      // registra apertura del concepto
      const list = g.progress.openedBlocks[cell.level.lessonId] ?? []
      if (!list.includes(c.nodeId)) list.push(c.nodeId)
      g.progress.openedBlocks[cell.level.lessonId] = list
      g.progress.xpTotal += c.xp
      g.saveProgress()
      g.bridge.emit('concept:completed', {
        lessonId: cell.level.lessonId, nodeId: c.nodeId, xp: c.xp, correct: true,
      })
    }

    // 2) Guardia: mini-quiz (hasta 3 preguntas del jefe del módulo)
    const questions = (cell.level.boss?.preguntas ?? []).slice(0, 3)
    if (questions.length > 0) {
      this.setPanelStatus(panel, '🛡️ Guardia custodia la salida del módulo…')
      const passed = await this.runQuiz(panel, questions)
      if (!passed) {
        this.setPanelStatus(panel, 'Guardia: "Aún no, abeja. Vuelve a intentarlo cuando estés lista."')
        this.comb.markActive(null)
        this.activeCell = null
        return
      }
    }

    // 3) ¡Módulo dominado!
    const stars = questions.length > 0 ? 3 : 2
    g.progress.stars[cell.level.lessonId] = Math.max(g.progress.stars[cell.level.lessonId] ?? 0, stars)
    g.saveProgress()
    g.bridge.emit('level:completed', {
      lessonId: cell.level.lessonId, stars, xp: 0, correctas: questions.length, total: questions.length,
    })
    g.audio.playStinger('graduacion')
    this.setPanelStatus(panel, '🍯 ¡Módulo dominado! La celda brilla con miel.')
    this.comb.markActive(null)
    this.activeCell = null
    await this.sleep(2200)
    this.closeChallengePanel(panel)
    this.updateHeader()
  }

  // ─── Voz: TTS + chat con el agente real ─────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }

  /** Habla con la voz de una abeja (cache-first en hiveDB). Resuelve true si hubo audio. */
  private async speak(agentId: string, text: string): Promise<boolean> {
    const nodeId = `panal-${agentId}-${++this.ttsSeq}`
    const url = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => { this.ttsWaiters.delete(nodeId); resolve(null) }, 9000) as unknown as number
      this.ttsWaiters.set(nodeId, resolve as (u: string | null) => void)
      ;(this.ttsWaiters.get(nodeId) as any).timer = timer
      this.game.bridge.emit('tts:request', { nodeId, text: text.slice(0, 780), agentId })
    })
    if (!url) return false
    await this.game.audio.playVoice(url)
    return true
  }

  /** Pregunta al agente real (WS agent-chat) — v1: respuesta completa */
  private async askAgent(agentId: string, question: string): Promise<string | null> {
    const requestId = `panal-chat-${Date.now()}`
    this.chatWaiters.set(requestId, { text: '', done: false })
    this.game.bridge.emit('agent:chat', { agentId, text: question, requestId })
    const start = Date.now()
    while (Date.now() - start < 30_000) {
      const w = this.chatWaiters.get(requestId)
      if (w?.done && w.text.trim()) return w.text.trim()
      if (!w) break
      await this.sleep(200)
    }
    this.chatWaiters.delete(requestId)
    return null
  }

  // ─── Overlay DOM ────────────────────────────────────────────────────────

  private buildOverlay() {
    this.overlay = document.createElement('div')
    Object.assign(this.overlay.style, {
      position: 'absolute', inset: '0', zIndex: '6',
      pointerEvents: 'none', fontFamily: 'monospace',
    } as CSSStyleDeclaration)

    this.header = document.createElement('div')
    Object.assign(this.header.style, {
      position: 'absolute', left: '14px', top: '12px', padding: '8px 14px',
      background: 'rgba(26,18,8,.85)', border: '2px solid #ffb300', borderRadius: '12px',
      color: '#ffd700', fontSize: '14px', fontWeight: 'bold',
    } as CSSStyleDeclaration)
    this.overlay.appendChild(this.header)

    this.prompt = document.createElement('div')
    Object.assign(this.prompt.style, {
      position: 'absolute', left: '50%', bottom: '12%', transform: 'translateX(-50%)',
      padding: '10px 18px', background: 'rgba(26,18,8,.88)', border: '2px solid #ffb300',
      borderRadius: '12px', color: '#fff8e1', fontSize: '15px', display: 'none',
      textShadow: '0 2px 0 #1a1208',
    } as CSSStyleDeclaration)
    this.overlay.appendChild(this.prompt)

    const container = this.game.worldRenderer.domCanvas?.parentElement
    if (container) container.appendChild(this.overlay)
  }

  private destroyOverlay() {
    this.overlay?.parentElement?.removeChild(this.overlay)
    this.overlay = null as unknown as HTMLDivElement
  }

  private updateHeader() {
    if (!this.header) return
    const mastered = this.comb.cells.filter(c => c.state === 'mastered').length
    this.header.textContent = `🍯 ${this.game.world?.nombre ?? 'Mi Panal'} · ${mastered}/${this.comb.cells.length} módulos · ⭐ ${this.game.progress.xpTotal} XP`
  }

  private showPrompt(cell: HoneyCell) {
    if (!this.prompt) return
    this.prompt.textContent = `[E] Abrir módulo: ${cell.level.titulo} 🐝`
    this.prompt.style.display = 'block'
  }

  private hidePrompt() {
    if (this.prompt) this.prompt.style.display = 'none'
  }

  private showChallengePanel(titulo: string, totalConcepts: number): HTMLDivElement {
    const panel = document.createElement('div')
    Object.assign(panel.style, {
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
      width: 'min(620px, 92vw)', maxHeight: '84vh', overflowY: 'auto',
      background: 'rgba(26,18,8,.94)', border: '3px solid #ffb300', borderRadius: '18px',
      padding: '18px 22px', color: '#fff8e1', fontSize: '14px', lineHeight: '1.5',
      pointerEvents: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.55)',
    } as CSSStyleDeclaration)

    const h = document.createElement('div')
    h.textContent = `⬡ ${titulo}`
    Object.assign(h.style, { color: '#ffd700', fontSize: '18px', fontWeight: 'bold', marginBottom: '4px' } as CSSStyleDeclaration)
    panel.appendChild(h)

    const sub = document.createElement('div')
    sub.textContent = `${totalConcepts} conceptos · Polen 🌸 explica · Guardia 🛡️ cierra`
    Object.assign(sub.style, { color: '#d7ccc8', fontSize: '12px', marginBottom: '12px' } as CSSStyleDeclaration)
    panel.appendChild(sub)

    const status = document.createElement('div')
    Object.assign(status.style, {
      padding: '8px 12px', background: 'rgba(255,179,0,.12)', borderRadius: '10px',
      color: '#ffe082', marginBottom: '10px',
    } as CSSStyleDeclaration)
    panel.appendChild(status)
    ;(panel as any)._status = status

    this.overlay.appendChild(panel)
    this.challengePanel = panel
    return panel
  }

  private setPanelStatus(panel: HTMLDivElement, text: string) {
    const s = (panel as any)._status as HTMLDivElement | undefined
    if (s) s.textContent = text
  }

  private addPanelConcept(panel: HTMLDivElement, titulo: string, contenido: string, xp: number) {
    const box = document.createElement('div')
    Object.assign(box.style, {
      padding: '10px 12px', background: 'rgba(255,255,255,.05)', borderRadius: '10px',
      marginBottom: '8px', borderLeft: '3px solid #ffb300',
    } as CSSStyleDeclaration)
    const t = document.createElement('div')
    t.textContent = `🌸 ${titulo} (+${xp} XP)`
    Object.assign(t.style, { color: '#ffd54f', fontWeight: 'bold', marginBottom: '4px' } as CSSStyleDeclaration)
    box.appendChild(t)
    if (contenido.trim()) {
      const body = document.createElement('div')
      body.textContent = contenido
      body.style.whiteSpace = 'pre-wrap'
      box.appendChild(body)
    }
    panel.appendChild(box)
    panel.scrollTop = panel.scrollHeight
  }

  /** Quiz de Guardia: botones grandes; fallar repite la pregunta. true = todas correctas */
  private runQuiz(
    panel: HTMLDivElement,
    questions: Array<{ pregunta: string; opciones: string[]; indiceCorrecto: number }>,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let qi = 0
      const ask = () => {
        const q = questions[qi]!
        this.setPanelStatus(panel, `🛡️ Guardia (${qi + 1}/${questions.length}): ${q.pregunta}`)

        const wrap = document.createElement('div')
        Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '8px' } as CSSStyleDeclaration)
        q.opciones.forEach((op, idx) => {
          const btn = document.createElement('button')
          btn.textContent = op
          Object.assign(btn.style, {
            padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
            background: 'rgba(255,179,0,.14)', color: '#fff8e1',
            border: '2px solid #ffb300', borderRadius: '12px', fontSize: '14px', fontFamily: 'monospace',
          } as CSSStyleDeclaration)
          btn.onmouseenter = () => { btn.style.background = 'rgba(255,179,0,.3)' }
          btn.onmouseleave = () => { btn.style.background = 'rgba(255,179,0,.14)' }
          btn.onclick = () => {
            if (idx === q.indiceCorrecto) {
              this.game.audio.play('correct')
              wrap.remove()
              qi++
              if (qi >= questions.length) { resolve(true); return }
              ask()
            } else {
              this.game.audio.play('wrong')
              this.iso.shake(0.12, 0.25)
              this.setPanelStatus(panel, 'Guardia niega con la cabeza… inténtalo de nuevo.')
            }
          }
          wrap.appendChild(btn)
        })
        panel.appendChild(wrap)
        panel.scrollTop = panel.scrollHeight
      }
      ask()
    })
  }

  private closeChallengePanel(panel: HTMLDivElement) {
    panel.remove()
    if (this.challengePanel === panel) this.challengePanel = null
  }
}
