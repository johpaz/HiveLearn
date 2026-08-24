/**
 * CeremonyScene — "La Colmena Viva": onboarding ceremonial 100% Three.js (Fase 3).
 *
 * Reemplaza el modo welcome del hub para alumnos nuevos y para alumnos que
 * vuelven con contexto en hiveDB ("Despertar de la Colmena"):
 *
 *   awakening   → la colmena despierta; Maya entra volando con su leitmotiv
 *   greeting    → hiveDB ya decidió el saludo (session_context); ofrece retomar
 *                 sesión/generación si aplica
 *   conversation→ Maya conversa POR VOZ con el alumno (Piper TTS + PTT micrófono);
 *                 las preguntas llegan del WS de onboarding vía bridge
 *   swarm       → al completar el perfil, el enjambre reacciona a la meta:
 *                 cada abeja entra volando, suena SU leitmotiv y habla con SU
 *                 voz (WS /hivelearn-swarm-dialogue, diálogo 100% LLM)
 *   handoff     → Festiva celebra; se entrega a la generación del programa
 *
 * El render 2D de Pixi permanece oculto (modo cinemático); las burbujas de
 * diálogo son un overlay DOM sincronizado con las posiciones de los sprites 3D.
 */
import { Scene } from '../engine/scene'
import type { Game } from '../game'
import type { Scene3D } from '../engine/three/worldRenderer'
import { buildCeremonyStage, type CeremonyStage } from '../engine/three/ceremonyStage'
import { VoiceCapture } from '../engine/voice/voiceCapture'
import { text, textField, button, buildA2UI } from '../a2ui/build'
import type { A2UIMessage } from '../bridge/gameBridge'
import { resolveTheme, DEFAULT_THEME } from '../engine/theme'
import { HiveHubScene } from './hiveHubScene'
import { WorldMapScene } from './worldMapScene'

type Stage = 'awakening' | 'greeting' | 'conversation' | 'swarm' | 'handoff'

interface BubbleEl {
  div: HTMLDivElement
  agentId: string
}

interface PendingTts {
  resolve: (url: string | null) => void
  timer: number
}

const BEE_ENTRY_SIDES = ['left', 'right', 'left', 'right', 'top'] as const

export class CeremonyScene extends Scene {
  private scene3d: Scene3D | null = null
  private stage3d: CeremonyStage | null = null
  private overlay!: HTMLDivElement
  private bubbles = new Map<string, BubbleEl>()
  private banner: HTMLDivElement | null = null
  private micBtn: HTMLButtonElement | null = null
  private statusDiv: HTMLDivElement | null = null

  private stage: Stage = 'awakening'
  private capture: VoiceCapture | null = null
  private sttOk = false
  private voiceSeq = 0
  private ttsSeq = 0
  private pendingTts = new Map<string, PendingTts>()
  private awaitingAnswer: ((answer: string) => void) | null = null
  private pendingMessages: Array<{ text: string; options?: string[]; freeText?: boolean; done?: boolean }> = []
  private processingMessage = false
  private context: {
    kind: string
    saludo: string
    nombre?: string
    sessionId?: string
    tema?: string | null
    sugerencia?: { slug: string; titulo: string } | null
  } | null = null
  private profile: Record<string, string | number> | null = null
  private profileMeta = ''
  private unsubs: Array<() => void> = []
  private clickUnsub: (() => void) | null = null
  private destroyedOverlay = false

  constructor(game: Game) {
    super(game)
  }

  // ─── Ciclo de vida ──────────────────────────────────────────────────────

  enter() {
    const g = this.game
    g.audio.playMusic('sala_real')

    // Modo cinemático: canvas Pixi oculto, clics al canvas WebGL
    g.setCinematic(true)
    if (g.worldRenderer.isAlive) {
      const built = buildCeremonyStage(g.viewW, g.viewH)
      this.stage3d = built.stage
      this.scene3d = built.scene3d
      g.worldRenderer.setScene(this.scene3d)
      // Diorama ceremonial (GLB low-poly creado en Blender) + tema inicial
      this.stage3d.loadDiorama(`${window.location.origin}/hive/ceremony_props.glb`)
      this.applyThemeToGame(DEFAULT_THEME)
    }
    this.buildOverlay()

    // Clics sobre abejas: interacción juguetona
    this.clickUnsub = g.onCanvasClick((x, y) => this.onStageClick(x, y))

    // ── Suscripciones bridge ──
    this.unsubs.push(g.bridge.on('session:context', ({ payload }) => {
      this.context = payload
      // "La colmena se afina al alumno": tema por rango de edad + energía previa
      const t = resolveTheme(
        String(payload.rangoEdad ?? ''),
        String(payload.energiaUltima ?? ''),
      )
      this.applyThemeToGame(t)
      if (this.stage === 'greeting') void this.runGreeting()
    }))
    this.unsubs.push(g.bridge.on('onboarding:message', (msg) => {
      this.pendingMessages.push(msg)
    }))
    this.unsubs.push(g.bridge.on('onboarding:profile', ({ perfil, meta, energia }) => {
      this.profile = perfil
      this.profileMeta = meta
      // Tema definitivo: ya conocemos edad declarada + energía de hoy
      const t = resolveTheme(
        String(perfil.rangoEdad ?? perfil.edad ?? ''),
        energia,
      )
      this.applyThemeToGame(t)
    }))
    this.unsubs.push(g.bridge.on('tts:ready', ({ nodeId, url }) => {
      const pending = this.pendingTts.get(nodeId)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pendingTts.delete(nodeId)
      pending.resolve(url)
    }))
    this.unsubs.push(g.bridge.on('voice:status', ({ ok }) => { this.sttOk = ok }))
    this.unsubs.push(g.bridge.on('voice:transcript', ({ requestId, text, ok }) => {
      if (!ok || !this.awaitingAnswer) return
      if (requestId !== `ceremony-voice-${this.voiceSeq}`) return
      const answer = text.trim()
      if (answer && this.awaitingAnswer) {
        const resolve = this.awaitingAnswer
        this.awaitingAnswer = null
        resolve(answer)
      }
    }))
    this.unsubs.push(g.bridge.on('a2ui:action', ({ surfaceId, actionName, context }) => {
      const waiter = this.a2uiWaiters.get(surfaceId)
      if (!waiter) return
      this.a2uiWaiters.delete(surfaceId)
      g.bridge.emit('a2ui:dismiss', {})
      waiter({ actionName, context })
    }))
    this.unsubs.push(g.bridge.on('a2ui:closed', ({ surfaceId }) => {
      const waiter = this.a2uiWaiters.get(surfaceId)
      if (!waiter) return
      this.a2uiWaiters.delete(surfaceId)
      waiter(null)
    }))
    // Eventos del enjambre (WS /hivelearn-swarm-dialogue reenviados por React)
    this.unsubs.push(g.bridge.on('swarm:line:start', ({ agentId }) => {
      this.ensureBee(agentId)
      this.stage3d?.setSpeaking(agentId, true)
      g.audio.playLeitmotiv(agentId, { volume: 0.22 })
    }))
    this.unsubs.push(g.bridge.on('swarm:line', ({ agentId, characterName, emoji, text, fallback }) => {
      void this.speakBeeLine(agentId, characterName, emoji, text, fallback)
    }))
    this.unsubs.push(g.bridge.on('swarm:complete', () => {
      void this.finishCeremony()
    }))
    // Salida por generación/revelación (igual que TutorialScene)
    this.unsubs.push(g.bridge.on('program:generating', ({ mensaje }) => {
      if (this.stage === 'handoff') this.showStatus(`🐝 Las abejas trabajan: ${mensaje}`)
    }))
    this.unsubs.push(g.bridge.on('program:loaded', ({ reveal }) => {
      if (reveal) void g.goTo(new HiveHubScene(g, 'reveal', reveal))
      else void g.goTo(new WorldMapScene(g))
    }))

    // Micrófono PTT (si hay STT disponible; se confirma cuando React responde estado)
    this.capture = new VoiceCapture({
      onChunk: (wav) => this.submitVoiceChunk(wav),
      onError: () => { this.setMicVisible(false) },
    })
    this.capture.attachKeyboard()
    this.setMicVisible(false)

    void this.runAwakening()
  }

  exit() {
    for (const u of this.unsubs) u()
    this.unsubs = []
    this.clickUnsub?.()
    this.clickUnsub = null
    this.capture?.destroy()
    this.capture = null
    for (const p of this.pendingTts.values()) clearTimeout(p.timer)
    this.pendingTts.clear()
    this.destroyOverlay()
    this.game.setCinematic(false)
    this.scene3d?.dispose?.()
    this.scene3d = null
    this.stage3d = null
    this.game.worldRenderer.setScene(null)
    this.awaitingAnswer = null
    this.processingMessage = false
    this.pendingMessages = []
  }

  // ─── Voz: TTS por personaje + PTT de micrófono ──────────────────────────

  /** Habla una línea como Maya (espera el audio TTS y lo reproduce) */
  private async mayaSay(text: string) {
    this.stage3d?.setSpeaking('onboarding', true)
    const url = await this.requestTts(text, 'onboarding')
    if (url) await this.game.audio.playVoice(url)
    else await this.sleep(Math.min(text.length * 45, 2600))
    this.stage3d?.setSpeaking('onboarding', false)
    this.showBubble('onboarding', `Maya 🐝`, text)
  }

  /** Línea local sin WS (cierre) */
  private async mayaSayLocal(text: string) {
    await this.mayaSay(text)
  }

  /** Una abeja del enjambre habla su línea con SU voz y SU leitmotiv */
  private async speakBeeLine(agentId: string, characterName: string, emoji: string, text: string, _fallback: boolean) {
    void _fallback
    const url = await this.requestTts(text, agentId)
    const panning = this.panFor(agentId)
    if (url) await this.game.audio.playVoice(url, { pan: panning })
    else await this.sleep(Math.min(text.length * 45, 2600))
    this.stage3d?.setSpeaking(agentId, false)
    this.stage3d?.pulseAura(agentId)
    this.showBubble(agentId, `${characterName} ${emoji}`, text)
  }

  private panFor(agentId: string): number | undefined {
    const pos = this.stage3d?.getBeePos(agentId)
    if (!pos || !this.game.viewW) return undefined
    return Math.max(-0.6, Math.min(0.6, (pos.x - this.game.viewW / 2) / (this.game.viewW / 2)))
  }

  /** Pide TTS a React (cache-first en hiveDB). Resuelve null si no hay voz. */
  private requestTts(text: string, agentId: string): Promise<string | null> {
    return new Promise((resolve) => {
      const nodeId = `ceremony-${agentId}-${++this.ttsSeq}`
      const timer = setTimeout(() => {
        this.pendingTts.delete(nodeId)
        resolve(null)
      }, 9000) as unknown as number
      this.pendingTts.set(nodeId, { resolve, timer })
      this.game.bridge.emit('tts:request', { nodeId, text: text.slice(0, 800), agentId })
    })
  }

  /** Envía el chunk WAV del micrófono a STT; la respuesta entra por voice:transcript */
  private submitVoiceChunk(wav: ArrayBuffer) {
    const requestId = `ceremony-voice-${this.voiceSeq + 1}`
    this.voiceSeq++
    this.showStatus('Escuchando… 🎤')
    this.game.bridge.emit('voice:transcribe', { wav, requestId })
  }

  private setMicVisible(visible: boolean) {
    if (!this.micBtn) return
    this.micBtn.style.display = visible ? 'flex' : 'none'
  }

  // ─── Entrada del alumno: texto libre (A2UI) u opciones ──────────────────

  private a2uiWaiters = new Map<string, ((v: { actionName: string; context: Record<string, any> } | null) => void)>()

  private askFreeText(): Promise<string | null> {
    return new Promise((resolve) => {
      let settled = false
      const done = (answer: string | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.awaitingAnswer = null
        resolve(answer)
      }
      // El alumno puede responder POR VOZ manteniendo V o pulsando el micrófono
      this.awaitingAnswer = (answer) => done(answer)

      const surfaceId = 'hive-ceremony-input'
      this.a2uiWaiters.set(surfaceId, (action) => {
        if (!action) return done(null)
        if (action.actionName === 'submit_answer') {
          const v = action.context?._textValues?.answer ?? action.context?.answer ?? ''
          done(String(v).trim() || null)
        } else {
          done(null)
        }
      })

      const timer = setTimeout(() => {
        this.a2uiWaiters.delete(surfaceId)
        this.game.bridge.emit('a2ui:dismiss', {})
        done(null)
      }, 120_000) as unknown as number

      this.game.bridge.emit('a2ui:show', {
        surfaceId,
        messages: buildA2UI(surfaceId, [
          text('q', 'Responde a Maya:', 'caption'),
          textField('answer', 'Tu respuesta…', 'Escribe aquí o mantén V para hablar'),
          button('send', 'Enviar ✉️', 'submit_answer', [{ key: 'answer', value: { path: '/_textValues/answer' } }]),
        ]),
        title: 'Maya te escucha',
      })
      this.setMicVisible(this.sttOk)
    })
  }

  private askOptions(options: string[]): Promise<number> {
    return new Promise((resolve) => {
      const surfaceId = 'hive-ceremony-options'
      this.a2uiWaiters.set(surfaceId, (action) => {
        if (!action) return resolve(-1)
        const idxStr = String(action.actionName.replace('option_', ''))
        resolve(parseInt(idxStr, 10) >= 0 ? parseInt(idxStr, 10) : -1)
      })
      const content = [
        text('q', 'Elige una opción:', 'caption'),
        ...options.map((opt, i) => button(`option_${i}`, opt, `option_${i}`)),
      ]
      this.game.bridge.emit('a2ui:show', { surfaceId, messages: buildA2UI(surfaceId, content), title: 'La colmena pregunta' })
    })
  }

  private askA2UI(surfaceId: string, messages: A2UIMessage[]): Promise<{ actionName: string; context: Record<string, any> } | null> {
    return new Promise((resolve) => {
      this.a2uiWaiters.set(surfaceId, (action) => resolve(action))
      this.game.bridge.emit('a2ui:show', { surfaceId, messages, title: 'Gran Colmena' })
    })
  }

  private displayName(): string {
    const nombre = this.profile?.nombre ?? this.context?.nombre
    return typeof nombre === 'string' && nombre ? nombre : 'alumno'
  }

  // ─── Overlay DOM (burbujas sincronizadas con actores 3D) ────────────────

  private buildOverlay() {
    this.overlay = document.createElement('div')
    Object.assign(this.overlay.style, {
      position: 'absolute', inset: '0', zIndex: '5',
      pointerEvents: 'none', fontFamily: 'monospace',
    } as CSSStyleDeclaration)

    this.banner = document.createElement('div')
    Object.assign(this.banner.style, {
      position: 'absolute', left: '50%', top: '18%', transform: 'translateX(-50%)',
      color: '#ffd700', fontSize: '30px', fontWeight: 'bold',
      textShadow: '0 3px 0 #3a2503, 0 0 24px rgba(255,179,0,.55)',
      transition: 'opacity .5s', opacity: '0', whiteSpace: 'nowrap',
    } as CSSStyleDeclaration)
    this.overlay.appendChild(this.banner)

    this.statusDiv = document.createElement('div')
    Object.assign(this.statusDiv.style, {
      position: 'absolute', left: '50%', top: '12px', transform: 'translateX(-50%)',
      color: '#ffe082', fontSize: '15px', textShadow: '0 2px 0 #1a1208',
      opacity: '0', transition: 'opacity .4s', whiteSpace: 'nowrap',
    } as CSSStyleDeclaration)
    this.overlay.appendChild(this.statusDiv)

    this.micBtn = document.createElement('button')
    this.micBtn.textContent = '🎤'
    Object.assign(this.micBtn.style, {
      position: 'absolute', right: '22px', bottom: '22px', width: '58px', height: '58px',
      borderRadius: '50%', border: '2px solid rgba(255,255,255,.5)', background: 'rgba(26,18,8,.55)',
      color: '#fff', fontSize: '24px', cursor: 'pointer', pointerEvents: 'auto', display: 'none',
    } as CSSStyleDeclaration)
    this.micBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.capture?.pressDown()
      if (this.micBtn) this.micBtn.style.background = '#ffb300'
    })
    this.micBtn.addEventListener('pointerup', () => { this.capture?.pressUp(); if (this.micBtn) this.micBtn.style.background = 'rgba(26,18,8,.55)' })
    this.overlay.appendChild(this.micBtn)

    const container = this.game.worldRenderer.domCanvas?.parentElement
    if (container) container.appendChild(this.overlay)
    this.destroyedOverlay = false
  }

  private destroyOverlay() {
    if (this.destroyedOverlay) return
    this.destroyedOverlay = true
    this.overlay?.parentElement?.removeChild(this.overlay)
  }

  private showBanner(text: string) {
    if (!this.banner) return
    this.banner.textContent = text
    this.banner.style.opacity = '1'
  }

  private hideBanner() {
    if (this.banner) this.banner.style.opacity = '0'
  }

  showStatus(text: string) {
    if (!this.statusDiv) return
    this.statusDiv.textContent = text
    this.statusDiv.style.opacity = '1'
    setTimeout(() => { if (this.statusDiv) this.statusDiv.style.opacity = '0' }, 6000)
  }

  private ensureBee(agentId: string) {
    if (!this.stage3d) return
    if (this.stage3d.getBeePos(agentId)) return
    const w = this.game.viewW
    const idx = this.stage3d.beeViews.length
    const entry = BEE_ENTRY_SIDES[idx % BEE_ENTRY_SIDES.length]!
    const isQueenOrGuide = agentId === 'onboarding' || agentId.includes('coordinator')
    const cols = Math.min(this.stage3d.beeViews.length + 1, 5)
    const spacing = Math.min(150, w / (cols + 1))
    const targetX = w / 2 + (idx - (Math.min(idx, 4)) / 2) * spacing * (idx % 2 === 0 ? 1 : -1)
    this.stage3d.spawnBee(agentId, {
      entry,
      x: targetX,
      y: this.game.viewH * (isQueenOrGuide ? 0.38 : 0.62),
      scalePx: isQueenOrGuide ? 84 : 60,
      entryMs: 1500,
    })
  }

  private showBubble(agentId: string, label: string, text: string) {
    const existing = this.bubbles.get(agentId)
    if (existing) existing.div.remove()

    const div = document.createElement('div')
    Object.assign(div.style, {
      position: 'absolute', maxWidth: '380px', padding: '10px 14px',
      background: 'rgba(26,18,8,.88)', border: '2px solid #ffb300', borderRadius: '12px',
      color: '#fff8e1', fontSize: '14px', lineHeight: '1.35',
      boxShadow: '0 6px 18px rgba(0,0,0,.45)', transform: 'translate(-50%, -110%)',
      transition: 'opacity .25s', opacity: '0',
    } as CSSStyleDeclaration)
    const nameSpan = document.createElement('div')
    nameSpan.textContent = label
    nameSpan.style.color = '#ffd700'
    nameSpan.style.fontWeight = 'bold'
    nameSpan.style.marginBottom = '3px'
    const body = document.createElement('div')
    body.textContent = text
    div.appendChild(nameSpan)
    div.appendChild(body)
    this.overlay.appendChild(div)

    requestAnimationFrame(() => { div.style.opacity = '1' })
    this.bubbles.set(agentId, { div, agentId })
    clearTimeout((this as any)[`bubbleTimer_${agentId}`])
    ;(this as any)[`bubbleTimer_${agentId}`] = setTimeout(() => {
      div.style.opacity = '0'
      setTimeout(() => div.remove(), 300)
      if (this.bubbles.get(agentId)?.div === div) this.bubbles.delete(agentId)
    }, 6500)
  }

  private hideAllBubbles() {
    for (const b of this.bubbles.values()) b.div.remove()
    this.bubbles.clear()
  }

  private syncBubbles() {
    for (const { div, agentId } of this.bubbles.values()) {
      const pos = this.stage3d?.getBeePos(agentId)
      if (!pos) continue
      div.style.left = `${pos.x}px`
      div.style.top = `${Math.max(pos.y - 40, 70)}px`
    }
  }

  /** Clic sobre una abeja: aura + blip (interacción juguetona) */
  private onStageClick(x: number, y: number) {
    const stage = this.stage3d
    if (!stage) return
    for (const bee of stage.beeViews) {
      const pos = stage.getBeePos(bee.agentId)
      if (!pos) continue
      if (Math.hypot(pos.x - x, pos.y - y) < 52) {
        stage.pulseAura(bee.agentId)
        this.game.audio.playLeitmotiv(bee.agentId, { volume: 0.18 })
        this.game.audio.play('blip')
      }
    }
  }

  resize(w: number, h: number) {
    this.stage3d?.resize(w, h)
  }

  update(dt: number) {
    // Mood de shaders (uMood) tiende suavemente al objetivo del tema
    const uniforms = this.game.worldRenderer.uniforms
    if (uniforms) {
      const target = this.stage3d?.shaderMood ?? DEFAULT_THEME.shaderMood
      uniforms.uMood.value += (target - uniforms.uMood.value) * Math.min(dt * 2, 1)
    }
    this.syncBubbles()
  }

  /** Aplica tema al escenario + música + mood objetivo */
  private applyThemeToGame(theme: ReturnType<typeof resolveTheme>) {
    this.stage3d?.applyTheme(theme)
    this.game.audio.setMusicTempo(theme.musicTempo)
  }

  // ─── Fases de la ceremonia ──────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  /** Fase 0 — la colmena despierta */
  private async runAwakening() {
    const g = this.game
    const w = g.viewW
    const h = g.viewH

    this.showBanner('🐝 La Colmena despierta…')
    g.audio.playStinger('ceremonia')
    await this.sleep(700)

    // Maya entra desde el portal superior al centro del escenario
    this.ensureBee('onboarding')
    this.stage3d?.flyTo('onboarding', w / 2, h * 0.4, 1600)
    await this.sleep(1700)
    this.hideBanner()

    // React abre el WS de onboarding y pide temas (detecta generaciones interrumpidas)
    g.bridge.emit('ceremony:start', {})
    g.bridge.emit('topics:request', {})

    this.stage = 'greeting'
  }

  /** Fase 1 — saludo decidido por hiveDB */
  private async runGreeting() {
    const ctx = this.context
    if (!ctx || !this.stage3d) return
    const g = this.game

    if (ctx.kind === 'retomar' || ctx.kind === 'generacion_interrumpida') {
      await this.mayaSay(ctx.saludo)
      const choice = await this.askA2UI('hive-ceremony-resume',
        buildA2UI('hive-ceremony-resume', [
          text('title', `¿Retomamos donde quedaste, ${this.displayName()}?`, 'h2'),
          button('resume', 'Retomar mi programa 🔁', 'resume_generation', [
            { key: 'sessionId', value: { literalString: String(ctx.sessionId ?? '') } },
          ]),
          button('new', 'Empezar algo nuevo ✨', 'new_program'),
        ]))
      if (choice?.actionName === 'resume_generation' && ctx.sessionId) {
        this.stage = 'handoff'
        this.showStatus('Recuperando tu colmena…')
        g.bridge.emit('generation:resume', { sessionId: ctx.sessionId })
        return
      }
      // Empezar de nuevo: continúa la conversación normal
      this.stage = 'conversation'
      void this.pumpMessages()
      return
    }

    await this.mayaSay(ctx.saludo)
    this.stage = 'conversation'
    void this.pumpMessages()
  }

  /** Fase 2 — conversación hablada con Maya (mensajes del WS de onboarding) */
  private async pumpMessages() {
    if (this.processingMessage) return
    this.processingMessage = true
    try {
      while (true) {
        const msg = this.pendingMessages.shift()
        if (!msg) break

        if (msg.done) {
          await this.mayaSay(msg.text || '¡Listo! El enjambre ya conoce tu meta. 🍯')
          // Espera el perfil que React envía al completar el onboarding
          await this.waitForProfile(15_000)
          if (this.profile) {
            this.stage = 'swarm'
            this.showStatus('El enjambre reacciona a tu meta…')
          } else {
            // Fallback: sin ceremonia de enjambre (WS caído), seguir a generar
            this.stage = 'handoff'
            this.game.bridge.emit('ceremony:finish', {})
          }
          continue
        }

        await this.mayaSay(msg.text)

        if (msg.freeText) {
          const answer = await this.askFreeText()
          if (answer !== null) this.game.bridge.emit('onboarding:answer', { answer })
        } else if (msg.options && msg.options.length > 0) {
          const idx = await this.askOptions(msg.options)
          if (idx >= 0) this.game.bridge.emit('onboarding:answer', { answer: msg.options[idx]! })
        }
      }
    } finally {
      this.processingMessage = false
    }
  }

  private waitForProfile(timeoutMs: number): Promise<void> {
    if (this.profile) return Promise.resolve()
    return new Promise((resolve) => {
      const unsub = this.game.bridge.on('onboarding:profile', () => {
        clearTimeout(timer)
        unsub()
        resolve()
      })
      const timer = setTimeout(() => {
        unsub()
        resolve()
      }, timeoutMs)
    })
  }

  /** Fase 3 — cierre: Festiva celebra y entrega a la generación */
  private async finishCeremony() {
    if (this.stage !== 'swarm') return
    this.stage = 'handoff'
    for (const bee of this.stage3d?.beeViews ?? []) this.stage3d?.pulseAura(bee.agentId)
    this.game.audio.playStinger('graduacion')
    this.hideAllBubbles()
    await this.mayaSayLocal('¡A trabajar, colmena! 🍯 Tu programa está en buenas alas.')
    this.game.bridge.emit('ceremony:finish', {})
    this.showStatus('Las abejas construyen tu mundo…')
  }
}
