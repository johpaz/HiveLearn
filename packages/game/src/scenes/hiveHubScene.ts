/**
 * HiveHubScene — la Colmena Central.
 * Aquí viven los agentes del pipeline como abejas especializadas.
 * El alumno se mueve libremente, habla con cada agente (A2UI) y
 * la Reina Coordinadora gestiona el onboarding y la generación de mundos.
 */

import { Container, Graphics, Sprite, Text, Assets, type Texture } from 'pixi.js'
import { Scene } from '../engine/scene'
import { Camera } from '../engine/camera'
import { Tilemap, Tile } from '../engine/tilemap'
import { buildTilemapView } from '../engine/tilemapView'
import { TILE } from '../engine/types'
import { Player } from '../entities/player'
import { getAgent, AGENT_ORDER, type HiveAgentId, type HiveAgent } from '../entities/agents'
import type { Game } from '../game'
import type { A2UIMessage, TopicOption, ProgramReveal } from '../bridge/gameBridge'
import { WorldMapScene } from './worldMapScene'
import { TutorialScene } from './tutorialScene'
import { VoiceSession, type VoiceSessionState } from '../engine/voice/voiceSession'
import { buildHiveScene3D, buildPortalScene3D } from '../engine/three/builders'
import type { WorldRenderer } from '../engine/three/worldRenderer'
import type { Scene3D } from '../engine/three/worldRenderer'
import { VoiceBubble } from '../ui/voiceBubble'
import { text, textField, button, buildA2UI } from '../a2ui/build'

const COLS = 80
const ROWS = 24
const GROUND = ROWS - 4

interface AgentNpc {
  agent: HiveAgent
  x: number
  y: number
  sprite: Sprite
  label: Text
}

export class HiveHubScene extends Scene {
  private world = new Container()
  private camera!: Camera
  private map!: Tilemap
  private player!: Player
  private agents: AgentNpc[] = []
  private hint!: Text
  private nearbyAgent: AgentNpc | null = null
  private portalHint!: Text
  private queenSpeech!: Text
  private t = 0
  private pendingA2uiResponse: ((context: Record<string, any>) => void) | null = null
  private unsubA2ui: (() => void) | null = null
  private unsubClosed: (() => void) | null = null
  private queenIntroDone = false
  private unsubsProgram: Array<() => void> = []
  private voiceSession: VoiceSession | null = null
  private voiceSubs: Array<() => void> = []
  private userBubble!: VoiceBubble
  private agentBubble!: VoiceBubble
  private voiceHint!: Text
  private voiceActive = false
  private scene3d: Scene3D | null = null
  private portal3d: Scene3D | null = null
  private currentEmotion: string = 'happy'
  private talkHeld = false
  /** Paneo cinematográfico de entrada: del trono de la Reina hacia el jugador */
  private introT = 0
  /** Retratos IA por agente (fallback: sprite procedural del agente) */
  private portraitTextures = new Map<HiveAgentId, Texture>()
  /** Estado real de cada agente durante generación: idle/working/done/error */
  private agentStates = new Map<HiveAgentId, { state: 'idle' | 'working' | 'done' | 'error'; progress?: number; message?: string }>()
  /** Catálogo de temas para el selector (llega vía 'topics:loaded') */
  private topics: TopicOption[] = []
  private topicsRequest: Promise<TopicOption[]> | null = null
  /** Run de generación interrumpido recuperable (llega vía 'program:interrupted') */
  private interruptedRun: { sessionId: string; meta: string } | null = null

  constructor(
    game: Game,
    private mode: 'welcome' | 'between-worlds' | 'generating' | 'reveal' = 'welcome',
    private reveal: ProgramReveal | null = null,
  ) {
    super(game)
  }

  enter() {
    const g = this.game
    g.app.renderer.background.color = g.themedSky(0xffe082)
    g.audio.playMusic('map')
    g.audio.setMusicTempo(g.theme.musicTempo)

    // 3D background behind Pixi
    if (g.worldRenderer.isAlive) {
      this.scene3d = buildHiveScene3D({ variant: 'hub' })
      g.worldRenderer.setScene(this.scene3d)
      this.portal3d = buildPortalScene3D()
      // fondo Pixi transparente para dejar ver la colmena 3D.
      // OJO: el clear color debe ser negro — con contexto premultiplicado,
      // un RGB ámbar con alpha 0 se compone como brillo aditivo.
      g.app.renderer.background.color = 0x000000
      g.app.renderer.background.alpha = 0
    }

    this.unsubsProgram.push(g.bridge.on('program:loaded', ({ reveal }) => {
      // Con reveal (programa recién generado) la Reina presenta el mundo antes de jugar
      if (reveal && this.mode !== 'reveal') void g.goTo(new HiveHubScene(g, 'reveal', reveal))
      else void g.goTo(new WorldMapScene(g))
    }))
    this.unsubsProgram.push(g.bridge.on('program:interrupted', ({ sessionId, meta }) => {
      this.interruptedRun = { sessionId, meta }
    }))
    this.unsubsProgram.push(g.bridge.on('program:generating', ({ porcentaje, mensaje }) => {
      this.queenSpeech.text = `🐝 ${mensaje} (${Math.round(porcentaje)}%)`
    }))
    // Agentes vivos: cada agent:state actualiza el NPC correspondiente
    this.unsubsProgram.push(g.bridge.on('agent:state', ({ agentId, state, progress, message }) => {
      const id = agentId as HiveAgentId
      if (this.agents.some(n => n.agent.id === id)) {
        this.agentStates.set(id, { state, progress, message })
      }
    }))

    this.buildMap()
    this.camera = new Camera(g.viewW, g.viewH, this.map.widthPx, this.map.heightPx)
    this.root.addChild(this.world)
    this.world.addChild(buildTilemapView(this.map, g.textures.tiles('jardin')))

    this.player = new Player(g.input, g.textures)
    this.player.spawnAt(5 * TILE, (GROUND - 2) * TILE)
    this.world.addChild(this.player.view)

    this.placeAgents()
    this.placeQueenThrone()
    this.placePortal()

    this.hint = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 13, fill: 0x1a1208, fontWeight: 'bold' },
    })
    this.hint.anchor.set(0.5, 1)
    this.root.addChild(this.hint)

    this.portalHint = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 14, fill: 0xffffff, stroke: { color: 0x1a1208, width: 3 } },
    })
    this.portalHint.anchor.set(0.5)
    this.root.addChild(this.portalHint)

    this.queenSpeech = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 12, fill: 0x1a1208, wordWrap: true, wordWrapWidth: 220, align: 'center' },
    })
    this.queenSpeech.anchor.set(0.5, 1)
    this.queenSpeech.x = 40 * TILE
    this.queenSpeech.y = (GROUND - 8) * TILE
    this.root.addChild(this.queenSpeech)

    // Burbujas cinematográficas de conversación por voz (estilo SpeechBubbles)
    this.userBubble = new VoiceBubble({
      nameColor: 0xffd700,
      maxWidth: 220,
      anchor: 'below',
    })
    this.userBubble.view.zIndex = 500
    this.root.addChild(this.userBubble.view)

    this.agentBubble = new VoiceBubble({
      nameColor: 0xfff8e1,
      maxWidth: 260,
      anchor: 'below',
    })
    this.agentBubble.view.zIndex = 501
    this.root.addChild(this.agentBubble.view)

    this.voiceHint = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 13, fill: 0x1a1208, fontWeight: 'bold' },
    })
    this.voiceHint.anchor.set(0.5, 1)
    this.root.addChild(this.voiceHint)

    this.setupVoice()
    void this.loadPortraits()

    this.camera.snapTo(this.player.centerX, this.player.centerY)

    // Entrada cinematográfica: la cámara nace en el trono y viaja al jugador
    if (this.mode === 'welcome') {
      this.camera.snapTo(40 * TILE, (GROUND - 2) * TILE)
      this.introT = 2.2
    }

    // Escuchar respuestas A2UI del overlay de React
    this.unsubA2ui = g.bridge.on('a2ui:action', ({ surfaceId, actionName, context }) => {
      if (surfaceId.startsWith('hive-') && this.pendingA2uiResponse) {
        this.pendingA2uiResponse({ actionName, context })
        this.pendingA2uiResponse = null
      }
    })
    this.unsubClosed = g.bridge.on('a2ui:closed', ({ surfaceId }) => {
      if (surfaceId.startsWith('hive-') && this.pendingA2uiResponse) {
        this.pendingA2uiResponse({ dismissed: true })
        this.pendingA2uiResponse = null
      }
    })

    // Entrada contextual según el modo
    void this.runEntrySequence()
  }

  exit() {
    this.unsubA2ui?.()
    this.unsubClosed?.()
    for (const u of this.unsubsProgram) u()
    this.unsubsProgram = []
    for (const u of this.voiceSubs) u()
    this.voiceSubs = []
    this.voiceSession?.destroy()
    this.voiceSession = null
    // 3D
    this.scene3d?.dispose?.()
    this.portal3d?.dispose?.()
    this.scene3d = null; this.portal3d = null
    this.game.worldRenderer.setScene(null)
    this.game.app.renderer.background.alpha = 1
  }

  /** Carga perezosa de retratos IA: /api/hivelearn/agents/:id/portrait.
   *  Si el endpoint no puede generarlos, cada agente conserva su sprite. */
  private async loadPortraits() {
    await Promise.all(AGENT_ORDER.map(async (id) => {
      try {
        // fetch primero: si no hay retrato (404) evitamos ruido en Pixi Assets
        const res = await fetch(`/api/hivelearn/agents/${id}/portrait`)
        if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return
        const url = URL.createObjectURL(await res.blob())
        const tex = await Assets.load<Texture>(url)
        if (tex) this.portraitTextures.set(id, tex)
      } catch { /* sin retrato IA: el sprite procedural ya es el fallback */ }
    }))
  }

  private setupVoice() {
    const g = this.game
    this.voiceSession = new VoiceSession(g.bridge, g.audio, {
      onState: (s) => this.onVoiceState(s),
      onUserTranscript: (text) => {
        const name = g.progress ? 'Tú' : 'Tú'
        this.userBubble.show(name, `🗣️ ${text}`, 'happy')
        this.agentBubble.hide()
      },
      onAgentDelta: (delta) => {
        const agentId = this.voiceSession?.getCurrentAgent()
        const agentName = agentId ? getAgent(agentId).name : 'Agente'
        if (this.agentBubble.isEmpty()) {
          this.agentBubble.setPortrait(agentId ? (this.portraitTextures.get(agentId) ?? null) : null)
          this.agentBubble.show(agentName, '', 'happy')
        }
        this.agentBubble.appendText(delta)
      },
      onAgentReply: (text, emotion) => {
        const agentId = this.voiceSession?.getCurrentAgent()
        const agentName = agentId ? getAgent(agentId).name : 'Agente'
        this.currentEmotion = emotion
        this.agentBubble.setPortrait(agentId ? (this.portraitTextures.get(agentId) ?? null) : null)
        this.agentBubble.show(agentName, text, emotion as any)
      },
      onError: (err) => {
        this.agentBubble.show('Sistema', `⚠️ ${err}`, 'alert')
      },
    })
    this.voiceSubs.push(g.bridge.on('voice:status', (p) => {
      if (!p.ok) this.voiceHint.text = '⚠️ Voz no disponible — usa [E] para hablar por texto'
    }))
  }

  private onVoiceState(state: VoiceSessionState) {
    const indicator: Partial<Record<VoiceSessionState, string>> = {
      listening: '🎙️ escuchando…',
      transcribing: '✍️ transcribiendo…',
      thinking: '🤔 pensando…',
      speaking: '🔊 hablando…',
      error: '⚠️ error',
    }
    this.voiceHint.text = indicator[state] ?? ''
    this.voiceActive = state !== 'idle' && state !== 'error'
  }

  private updateBubbles(dt: number) {
    // Anima ambas burbujas siempre (spring + fade)
    this.userBubble.update(dt)
    this.agentBubble.update(dt)

    if (!this.nearbyAgent) {
      if (!this.voiceActive) {
        this.userBubble.hide()
        this.agentBubble.hide()
      }
      return
    }
    const a = this.nearbyAgent
    // Posiciona: usuario sobre jugador, agente sobre su sprite
    this.userBubble.attachTo(this.player.centerX - 60, this.player.body.y - 28)
    this.agentBubble.attachTo(a.x - 60, a.y - 52)
    this.voiceHint.x = a.x
    this.voiceHint.y = a.y - 64 - 18
  }

  private buildMap() {
    this.map = new Tilemap(COLS, ROWS)
    // suelo de panal en toda la extensión
    for (let c = 0; c < COLS; c++) {
      for (let r = GROUND; r < ROWS; r++) this.map.set(c, r, Tile.Ground)
    }
    // plataformas decorativas
    this.map.fillRow(GROUND - 3, 10, 18, Tile.Platform)
    this.map.fillRow(GROUND - 5, 55, 66, Tile.Platform)
    this.map.fillRow(GROUND - 4, 34, 46, Tile.Platform)
    // flores
    for (const c of [8, 20, 32, 48, 60, 72]) this.map.set(c, GROUND - 1, Tile.Decor)
  }

  private placeAgents() {
    const g = this.game
    const positions: Record<HiveAgentId, { x: number; y: number }> = {
      coordinator: { x: 40 * TILE, y: (GROUND - 2) * TILE },
      content: { x: 28 * TILE, y: (GROUND - 6) * TILE },
      practice: { x: 34 * TILE, y: (GROUND - 6) * TILE },
      assessment: { x: 46 * TILE, y: (GROUND - 6) * TILE },
      image: { x: 52 * TILE, y: (GROUND - 6) * TILE },
      infographic: { x: 14 * TILE, y: (GROUND - 4) * TILE },
      audio: { x: 61 * TILE, y: (GROUND - 4) * TILE },
      gamification: { x: 66 * TILE, y: (GROUND - 2) * TILE },
    }

    for (const id of AGENT_ORDER) {
      const agent = getAgent(id)
      const pos = positions[id]
      const sprite = new Sprite(agent.sprite)
      sprite.anchor.set(0.5, 1)
      sprite.width = 32
      sprite.height = 32
      sprite.x = pos.x
      sprite.y = pos.y
      this.world.addChild(sprite)

      const label = new Text({
        text: `${agent.emoji} ${agent.name}`,
        style: { fontFamily: 'monospace', fontSize: 10, fill: 0x1a1208, fontWeight: 'bold', stroke: { color: 0xffffff, width: 2 } },
      })
      label.anchor.set(0.5, 1)
      label.x = pos.x
      label.y = pos.y - 34
      this.world.addChild(label)

      this.agents.push({ agent, x: pos.x, y: pos.y, sprite, label })
    }
  }

  private placeQueenThrone() {
    const x = 40 * TILE
    const y = (GROUND + 1) * TILE
    const throne = new Graphics()
    throne.rect(x - 40, y - 70, 80, 70).fill(0x9c27b0)
    throne.rect(x - 35, y - 65, 70, 60).fill(0x7b1fa2)
    throne.poly([x - 45, y - 70, x, y - 110, x + 45, y - 70]).fill(0xe1bee7)
    this.world.addChild(throne)
  }

  private placePortal() {
    const x = 74 * TILE
    const y = (GROUND - 2) * TILE
    const portal = new Graphics()
    portal.ellipse(x, y, 28, 44).fill(0xffb300)
    portal.ellipse(x, y, 20, 34).fill(0xffe082)
    this.world.addChild(portal)
  }

  private async runEntrySequence() {
    if (this.mode === 'welcome' && !this.queenIntroDone) {
      this.queenIntroDone = true
      // Pedir a React el catálogo de temas (y de paso program:interrupted si aplica)
      await this.requestTopics()

      // 1) Nombre (+ opción de retomar una generación interrumpida)
      const answer = await this.talkToAgent('coordinator', this.queenWelcomeMessages())
      if (answer?.actionName === 'resume_generation' && answer.context?.sessionId) {
        // GamePlayScreen reanuda el run; la escena cambiará sola al generarse
        this.game.bridge.emit('generation:resume', { sessionId: String(answer.context.sessionId) })
        this.queenSpeech.text = '🐝 Retomando la construcción de tu mundo…'
        return
      }
      if (answer?.actionName !== 'submit_name') return

      // 2) Selector de tema: el jugador decide qué quiere aprender
      const topicAnswer = await this.talkToAgent('coordinator', this.topicSelectMessages(this.topics))
      const topic = topicAnswer?.actionName === 'select_topic'
        ? String(topicAnswer.context?.topic ?? '').trim()
        : topicAnswer?.actionName === 'custom_topic'
          ? String(topicAnswer.context?._textValues?.customTopic ?? topicAnswer.context?.customTopic ?? '').trim()
          : ''
      if (!topic) return
      this.game.bridge.emit('topic:selected', { topic })
      // 3) Tutorial conversacional; GamePlayScreen abre el WS de onboarding
      //    con nombre + tema ya elegidos.
      void this.game.goTo(new TutorialScene(this.game))
    } else if (this.mode === 'between-worlds') {
      await this.talkToAgent('coordinator', this.queenBetweenWorldsMessages())
    } else if (this.mode === 'generating') {
      this.queenSpeech.text = '🐝 Las abejas están construyendo tu mundo…'
    } else if (this.mode === 'reveal') {
      const answer = await this.talkToAgent('coordinator', this.programRevealMessages())
      if (answer?.actionName === 'start_playing' || answer?.dismissed) {
        void this.game.goTo(new WorldMapScene(this.game))
      }
    }
  }

  /** Pide el catálogo de temas a React y espera 'topics:loaded' (con fallback a texto libre) */
  private requestTopics(): Promise<TopicOption[]> {
    if (this.topicsRequest) return this.topicsRequest
    const g = this.game
    this.topicsRequest = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsub()
        resolve(this.topics)
      }, 3000)
      const unsub = g.bridge.on('topics:loaded', ({ topics }) => {
        clearTimeout(timeout)
        this.topics = topics
        unsub()
        resolve(topics)
      })
      g.bridge.emit('topics:request', {})
    })
    return this.topicsRequest
  }

  private queenWelcomeMessages(): A2UIMessage[] {
    const content: any[] = [
      text('title', '¡Bienvenido a la Gran Colmena! 🐝', 'h2'),
      text('body', 'Soy la Reina Miel, la coordinadora del enjambre. Aquí cada abeja tiene un talento especial para construir tu camino de aprendizaje.'),
    ]
    if (this.interruptedRun) {
      content.push(
        text('interrupted', `⚠️ Las abejas estaban construyendo "${this.interruptedRun.meta}" y el trabajo se interrumpió. Puedes retomarlo donde quedó.`, 'caption'),
        button('resume', 'Retomar construcción anterior 🔁', 'resume_generation', [
          { key: 'sessionId', value: { literalString: this.interruptedRun.sessionId } },
        ], 'secondary'),
      )
    }
    content.push(
      text('ask', '¿Cómo te llamas? Escríbemelo y prepararé una aventura a tu medida.'),
      textField('name', 'Tu nombre', 'Ej: Juan'),
      button('next', 'Continuar ✨', 'submit_name', [{ key: 'name', value: { path: '/_textValues/name' } }]),
    )
    return buildA2UI('hive-welcome', content)
  }

  private topicSelectMessages(topics: TopicOption[]): A2UIMessage[] {
    const content: any[] = [
      text('title', '¿Qué quieres aprender? 🍯', 'h2'),
      text('body', 'Elige un tema y el enjambre construirá tu aventura completa: mundos, retos, jefes y logros hechos a tu medida.'),
    ]
    for (const t of topics.slice(0, 8)) {
      content.push(button(`topic-${t.slug}`, t.titulo, 'select_topic', [
        { key: 'topic', value: { literalString: t.titulo } },
      ], 'secondary'))
    }
    content.push(
      text('or', '— o escribe tu propio tema —', 'caption'),
      textField('customTopic', 'Tu tema', 'Ej: Fotografía, Historia del arte, Ajedrez…'),
      button('custom', 'Elegir mi tema ✨', 'custom_topic', [
        { key: 'customTopic', value: { path: '/_textValues/customTopic' } },
      ]),
    )
    return buildA2UI('hive-topic-select', content)
  }

  private programRevealMessages(): A2UIMessage[] {
    const r = this.reveal
    if (!r) {
      return buildA2UI('hive-program-reveal', [
        text('title', '¡Tu mundo está listo! 🍯', 'h2'),
        button('go', '¡A jugar! 🎮', 'start_playing'),
      ])
    }
    const content: any[] = [
      text('title', `¡Tu mundo de ${r.tema} está listo! 🍯`, 'h2'),
      text('body', `El enjambre construyó ${r.nodos.length} niveles con ${r.xpTotal} XP en juego${r.logros.length > 0 ? ` y ${r.logros.length} logros por desbloquear` : ''}.`),
    ]
    const lista = r.nodos.slice(0, 8).map((n, i) => `${i + 1}. ${n.titulo} — ${n.xpRecompensa} XP`).join('\n')
    content.push(text('nodes', `🗺️ Tu camino:\n${lista}${r.nodos.length > 8 ? `\n…y ${r.nodos.length - 8} niveles más` : ''}`))
    if (r.logros.length > 0) {
      content.push(text('logros', `🏆 Logros: ${r.logros.slice(0, 6).join(' · ')}`, 'caption'))
    }
    content.push(button('go', '¡A jugar! 🎮', 'start_playing'))
    return buildA2UI('hive-program-reveal', content)
  }

  private queenBetweenWorldsMessages(): A2UIMessage[] {
    return buildA2UI('hive-next-world', [
      text('title', '¡Una colmena lista! 🍯', 'h2'),
      text('body', 'Has completado un mundo. Las abejas están listas para construir el siguiente paso de tu aprendizaje.'),
      button('generate', 'Generar siguiente mundo 🐝', 'generate_next_world'),
      button('replay', 'Repetir mundo anterior 🔁', 'replay_world', [], 'secondary'),
    ])
  }

  private agentPresentationMessages(npc: AgentNpc): A2UIMessage[] {
    const a = npc.agent
    return buildA2UI(`hive-agent-${a.id}`, [
      text('title', `${a.emoji} ${a.name} — ${a.title}`, 'h2'),
      text('body', a.description),
      text('role', `Rol en el enjambre: ${a.title}`, 'caption'),
      button('close', 'Gracias ✓', 'close_dialog'),
    ])
  }

  private async talkToAgent(agentId: HiveAgentId, messages: A2UIMessage[]): Promise<Record<string, any> | null> {
    const npc = this.agents.find(a => a.agent.id === agentId)
    if (!npc) return null
    const g = this.game
    g.audio.play('blip')
    g.bridge.emit('a2ui:show', {
      surfaceId: messages[0]?.surfaceUpdate?.surfaceId ?? 'hive-dialog',
      messages,
      agentId,
      title: npc.agent.title,
    })
    return new Promise((resolve) => {
      this.pendingA2uiResponse = resolve
    })
  }

  update(dt: number) {
    const g = this.game
    this.t += dt

    if (this.pendingA2uiResponse) {
      // pausa mientras se responde A2UI
      this.animateAgents(dt)
      return
    }

    const res = this.player.update(dt, this.map)
    if ((res as { jumped?: boolean }).jumped) g.audio.play('jump')

    // no caer
    if (this.player.body.y > this.map.heightPx + 60) {
      this.player.spawnAt(5 * TILE, (GROUND - 2) * TILE)
    }

    this.animateAgents(dt)
    this.checkNearbyAgent(dt)
    this.checkPortal()

    if (this.introT > 0) {
      // paneo trono → jugador con ease-out
      this.introT = Math.max(0, this.introT - dt)
      const k = 1 - this.introT / 2.2
      const ease = 1 - Math.pow(1 - k, 3)
      const tx = 40 * TILE + (this.player.centerX - 40 * TILE) * ease
      const ty = (GROUND - 2) * TILE + (this.player.centerY - (GROUND - 2) * TILE) * ease
      this.camera.follow(tx, ty, 0, dt * 4)
    } else {
      this.camera.follow(this.player.centerX, this.player.centerY, this.player.body.vx, dt)
    }
    this.camera.apply(this.world)
    this.game.worldRenderer.setCameraFocus(this.player.centerX, this.player.centerY)
  }

  private animateAgents(dt: number) {
    for (const npc of this.agents) {
      const state = this.agentStates.get(npc.agent.id)?.state ?? 'idle'
      // Animación base: flotación suave
      npc.sprite.y = npc.y + Math.sin(this.t * 2 + npc.x) * 2
      // Estado visual por agente
      switch (state) {
        case 'working':
          // Trabajando: partículas amarillas alrededor + pulso
          npc.sprite.tint = 0xffd700
          npc.sprite.alpha = 0.6 + 0.4 * Math.abs(Math.sin(this.t * 4))
          break
        case 'done':
          // Completado: celebración con pulso verde
          npc.sprite.tint = 0x66bb6a
          npc.sprite.alpha = 0.7 + 0.3 * Math.abs(Math.sin(this.t * 6))
          // Celebración: burbuja espontánea corta
          if (!this.voiceActive && Math.random() < 0.005) {
            this.agentBubble.show(npc.agent.name, '¡Listo! 🎉', 'celebrate')
          }
          break
        case 'error':
          // Fallo: rojo pulsante
          npc.sprite.tint = 0xe25822
          npc.sprite.alpha = 0.5 + 0.5 * Math.abs(Math.sin(this.t * 8))
          break
        default:
          npc.sprite.tint = 0xffffff
          npc.sprite.alpha = 1
      }
    }
  }

  private checkNearbyAgent(dt: number) {
    const px = this.player.centerX
    const py = this.player.centerY
    let closest: AgentNpc | null = null
    let best = Infinity
    for (const npc of this.agents) {
      const dx = px - npc.x
      const dy = py - (npc.y - 16)
      const d = Math.hypot(dx, dy)
      if (d < 40 && d < best) {
        best = d
        closest = npc
      }
    }
    this.nearbyAgent = closest

    if (closest) {
      this.hint.text = `[E] texto  ·  [V] voz  →  ${closest.agent.name}`
      this.hint.x = closest.x
      this.hint.y = closest.y - 52
      // Inicia o mantiene viva la conversación por voz con este agente
      if (this.voiceSession && this.voiceSession.getCurrentAgent() !== closest.agent.id) {
        this.voiceSession.startConversation(closest.agent.id, 'ptt')
      } else if (this.voiceSession && !this.voiceSession.getCurrentAgent()) {
        this.voiceSession.startConversation(closest.agent.id, 'ptt')
      }
      // Botón 🎤 táctil mapeado a 'talk' — push-to-talk. Bloqueado si no puede hablar.
      if (this.voiceSession) {
        const talk = this.game.input.isHeld('talk')
        const canSpeak = this.voiceSession.canSpeak()
        if (!canSpeak && !this.voiceActive) {
          this.voiceHint.text = '⏳ ocupado… espera a que termine'
        } else if (talk && !this.talkHeld) {
          this.voiceSession.micPressDown()
          this.talkHeld = true
        } else if (!talk && this.talkHeld) {
          this.voiceSession.micPressUp()
          this.talkHeld = false
        }
      }
      if (this.game.input.isPressed('interact')) {
        void this.talkToAgent(closest.agent.id, this.agentPresentationMessages(closest))
      }
    } else {
      this.hint.text = ''
      // si nadie está cerca y no hay conversación activa, cancela
      if (this.voiceSession && !this.voiceActive && this.voiceSession.getCurrentAgent()) {
        this.voiceSession.cancel()
      }
      this.talkHeld = false
    }
    this.updateBubbles(dt)
  }

  private checkPortal() {
    const px = this.player.centerX
    const py = this.player.centerY
    const portalX = 74 * TILE
    const portalY = (GROUND - 2) * TILE
    const near = Math.hypot(px - portalX, py - portalY) < 50

    if (near && this.game.world) {
      this.portalHint.text = '[E] Entrar al mapa de mundos'
      this.portalHint.x = portalX
      this.portalHint.y = portalY - 60
      if (this.game.input.isPressed('interact')) {
        void this.game.goTo(new WorldMapScene(this.game))
      }
    } else {
      this.portalHint.text = ''
    }
  }

  resize(w: number, h: number) {
    this.camera?.resize(w, h)
  }
}

// ─── Helpers A2UI v0.8 ───────────────────────────────────────────────────────
