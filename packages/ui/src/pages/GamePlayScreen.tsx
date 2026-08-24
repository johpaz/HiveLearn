/**
 * GamePlayScreen — monta el juego PixiJS (@hivelearn/game) y lo conecta a la
 * app vía GameBridge:
 *
 *  - Programa en el store → lessonToLevelSpecs → 'program:loaded'
 *  - Sin programa → HiveHubScene (Colmena Central). La Reina Miel captura
 *    el nombre por A2UI; luego TutorialScene continúa el onboarding por WS.
 *  - Onboarding completo → POST /api/hivelearn/generate (SSE). Durante la
 *    generación, HiveHubScene muestra a las abejas trabajando.
 *  - Entre mundos → HiveHubScene ofrece generar la siguiente colmena.
 *  - TTS de conceptos → /api/tts-local/speak (Piper) con ducking de música
 *  - XP de conceptos → completarNodo() (la gamificación existente)
 *
 * El juego nunca toca red ni store directamente: todo pasa por el bridge.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Game, GameBridge, TitleScene, emptyProgress, type GameProgress, type A2UIMessage } from '@hivelearn/game'
// Importar desde el submódulo puro: el índice de core arrastra el backend
// (gateway, llm-local) al bundle del navegador
import { lessonToLevelSpecs } from '@hivelearn/core/lesson/levelSpec'
import type { StudentProfile } from '@hivelearn/core/types'
import { useLessonStore } from '../store/lessonStore'
import { wsUrl } from '../lib/wsUrl'
import { fetchWithAuth } from '../lib/fetchWithAuth'
import { A2UIRenderer } from '../a2ui/A2UIRenderer'

const PROGRESS_KEY = (sessionId: string) => `hivelearn-game-progress:${sessionId}`

interface ServiceStatus {
  stt: boolean
  tts: boolean
  llm: boolean
  checking: boolean
  detail?: string
}

function loadProgress(sessionId: string): GameProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY(sessionId))
    return raw ? (JSON.parse(raw) as GameProgress) : null
  } catch {
    return null
  }
}

export function GamePlayScreen() {
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { sessionId: routeSessionId } = useParams()
  const devLevel = searchParams.get('devLevel') === '1'

  const [a2uiOverlay, setA2uiOverlay] = useState<{
    surfaceId: string
    messages: A2UIMessage[]
    agentId?: string
    title?: string
  } | null>(null)
  const [a2uiPendingAction, setA2uiPendingAction] = useState<string | null>(null)
  const [prefillName, setPrefillName] = useState<string | null>(null)
  const prefillNameRef = useRef<string | null>(null)
  /** Tema elegido en el selector de la Colmena (antes de abrir el onboarding WS) */
  const selectedTopicRef = useRef<string | null>(null)
  const [services, setServices] = useState<ServiceStatus>({ stt: false, tts: false, llm: false, checking: true })

  const bridgeRef = useRef<GameBridge | null>(null)
  const openOnboardingRef = useRef<(initialName?: string) => void>(() => {})
  const generateProgramRef = useRef<(perfil?: StudentProfile, meta?: string, resumeSessionId?: string) => Promise<void>>(async () => {})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const bridge = new GameBridge()
    bridgeRef.current = bridge
    const game = new Game(bridge, { devLevel })
    let ws: WebSocket | null = null
    let disposed = false
    const objectUrls: string[] = []

    // ── Juego → App ──────────────────────────────────────────────────────────

    bridge.on('game:ready', () => {
      const { program, sessionId } = useLessonStore.getState()
      if (program && (!routeSessionId || program.sessionId === routeSessionId)) {
        const world = lessonToLevelSpecs(program)
        bridge.emit('program:loaded', {
          world,
          progress: loadProgress(sessionId ?? program.sessionId) ?? emptyProgress(),
        })
      } else if (routeSessionId) {
        void restoreFromBackend(routeSessionId)
      } else if (!devLevel) {
        bridge.emit('program:none', {})
        // El juego va a HiveHubScene; la Reina inicia el onboarding vía A2UI.
      }
    })

    /** Reanudar una sesión guardada: /play/:sessionId */
    async function restoreFromBackend(sessionId: string) {
      try {
        const res = await fetch(`/api/hivelearn/sessions/${sessionId}/restore`)
        if (!res.ok) throw new Error(`No se pudo restaurar la sesión (${res.status})`)
        const data = await res.json()
        const nodos = JSON.parse(data.nodos_json || '[]')
        const program = {
          sessionId: data.session_id,
          alumnoId: data.alumno_id,
          tema: data.meta ?? '',
          topicSlug: data.topic_slug ?? null,
          rangoEdad: data.rango_edad,
          nodos,
          gamificacion: { xpRecompensa: data.xp_total ?? 0, logros: [], mensajeCelebracion: '¡Continuemos!' },
          evaluacion: { preguntas: data.evaluacion_json ? JSON.parse(data.evaluacion_json).preguntas ?? [] : [] },
          perfilAdaptacion: {
            rangoEdad: data.rango_edad,
            duracionSesion: 30,
            nodosRecomendados: nodos.length,
            estilo: 'balanceado',
            nivelPrevio: 'principiante',
            tono: 'amigable',
          },
        }
        const store = useLessonStore.getState()
        store.restoreSession(program as never, {
          sessionId: data.session_id,
          xpTotal: data.xp_total ?? 0,
          nodosCompletados: [],
          lastNodeId: data.last_node_id ?? null,
          sessionStateJson: data.session_state_json ?? null,
          paused_at: data.paused_at ?? null,
        })
        bridge.emit('profile:theme', { rangoEdad: data.rango_edad })
        bridge.emit('program:loaded', {
          world: lessonToLevelSpecs(program as never),
          progress: loadProgress(data.session_id) ?? emptyProgress(),
        })
      } catch (err) {
        console.error('[GamePlayScreen] restore falló:', err)
        // sin sesión válida: arrancar onboarding dentro del juego
        bridge.emit('program:none', {})
        openOnboarding()
      }
    }

    bridge.on('progress:save', ({ progress }) => {
      const { sessionId, program } = useLessonStore.getState()
      const key = sessionId ?? program?.sessionId ?? 'local'
      try {
        localStorage.setItem(PROGRESS_KEY(key), JSON.stringify(progress))
      } catch { /* storage lleno: el progreso vive en memoria */ }
    })

    bridge.on('concept:completed', ({ nodeId, xp, correct }) => {
      const store = useLessonStore.getState()
      if (!store.nodosCompletados.includes(nodeId)) {
        store.completarNodo(nodeId, xp)
      }
      if (correct) store.incrementarRacha()
      else store.resetRacha()
    })

    bridge.on('level:completed', ({ stars, correctas, total }) => {
      const store = useLessonStore.getState()
      store.setPuntajeEvaluacion(total > 0 ? Math.round((correctas / total) * 100) : 0)
      if (stars === 3) store.desbloquearLogro('nivel-perfecto')
    })

    bridge.on('tts:request', async ({ nodeId, text, agentId }) => {
      try {
        const res = await fetch('/api/tts-local/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, 800), agentId }),
          signal: AbortSignal.timeout(20_000),
        })
        if (!res.ok || disposed) return
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        objectUrls.push(url)
        bridge.emit('tts:ready', { nodeId, url })
      } catch { /* Piper no disponible: el panel funciona sin voz */ }
    })

    // ── Voz: comprobar disponibilidad de STT al arranque ─────────────────────
    void (async () => {
      try {
        const res = await fetch('/api/stt/estado', { signal: AbortSignal.timeout(2000) })
        const data = await res.json() as { ok?: boolean; detail?: string }
        bridge.emit('voice:status', { ok: !!data.ok, detail: data.detail })
      } catch {
        bridge.emit('voice:status', { ok: false, detail: 'sin conexión' })
      }
    })()

    // ── Identidad sonora: leitmotivs por personaje desde hiveDB ─────────────
    void (async () => {
      try {
        const res = await fetch('/api/tts-local/voices', { signal: AbortSignal.timeout(3000) })
        if (!res.ok) return
        const data = await res.json() as { voices?: Array<{ agentId: string; leitmotiv?: { notas: number[]; bpm: number } }> }
        if (data.voices?.length) game.audio.loadAgentVoices(data.voices)
      } catch { /* el juego usa los leitmotivs offline por defecto */ }
    })()

    // ── Voz: transcripción STT (WAV binario) ────────────────────────────────
    bridge.on('voice:transcribe', async ({ wav, requestId }) => {
      try {
        const res = await fetch('/api/stt-local/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: wav,
          signal: AbortSignal.timeout(30_000),
        })
        if (disposed) return
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          bridge.emit('voice:transcript', { requestId, text: '', ok: false, error: errData.error })
          return
        }
        const data = await res.json() as { text: string }
        bridge.emit('voice:transcript', { requestId, text: data.text ?? '', ok: true })
      } catch (e) {
        if (disposed) return
        bridge.emit('voice:transcript', { requestId, text: '', ok: false, error: (e as Error).message })
      }
    })

    // ── Voz: WS de conversación por agente ─────────────────────────────────
    const agentChatWs = new Map<string, WebSocket>()

    function getAgentChatWs(agentId: string, sessionId: string): WebSocket {
      const key = `${sessionId}:${agentId}`
      const existing = agentChatWs.get(key)
      if (existing && existing.readyState !== WebSocket.CLOSED && existing.readyState !== WebSocket.CLOSING) {
        return existing
      }
      const sid = encodeURIComponent(sessionId)
      const aid = encodeURIComponent(agentId)
      const sock = new WebSocket(wsUrl(`/hivelearn-agent-chat?sessionId=${sid}&agentId=${aid}`))
      sock.onmessage = (event) => {
        let msg: { type?: string; text?: string; reply?: string; emotion?: string; message?: string }
        try { msg = JSON.parse(event.data as string) } catch { return }
        if (msg.type === 'thinking') {
          bridge.emit('agent:chat:state', { agentId, state: 'thinking' })
        } else if (msg.type === 'delta') {
          bridge.emit('agent:reply', { requestId: lastRequestIds.get(agentId) ?? '', agentId, delta: msg.text ?? '', done: false })
        } else if (msg.type === 'done') {
          bridge.emit('agent:reply', { requestId: lastRequestIds.get(agentId) ?? '', agentId, reply: msg.reply ?? '', emotion: msg.emotion ?? 'happy', done: true })
          bridge.emit('agent:chat:state', { agentId, state: 'speaking' })
        } else if (msg.type === 'error') {
          bridge.emit('agent:reply', { requestId: lastRequestIds.get(agentId) ?? '', agentId, reply: '', done: true })
          bridge.emit('agent:chat:state', { agentId, state: 'error', message: msg.message ?? '' })
        }
      }
      sock.onclose = () => { agentChatWs.delete(key) }
      agentChatWs.set(key, sock)
      return sock
    }

    const lastRequestIds = new Map<string, string>()

    bridge.on('agent:chat', ({ agentId, text, requestId }) => {
      const store = useLessonStore.getState()
      const sessionId = (store.sessionId ?? store.program?.sessionId ?? 'local') || 'local'
      lastRequestIds.set(agentId, requestId)
      const sock = getAgentChatWs(agentId, sessionId)
      const send = () => sock.send(JSON.stringify({ type: 'user', text }))
      if (sock.readyState === WebSocket.OPEN) send()
      else sock.addEventListener('open', send, { once: true })
    })

    bridge.on('voice:agent:open', ({ agentId }) => {
      const store = useLessonStore.getState()
      const sessionId = (store.sessionId ?? store.program?.sessionId ?? 'local') || 'local'
      // Pre-conecta el WS para que la primera interacción no espíe lag de apertura
      getAgentChatWs(agentId, sessionId)
    })

    // ── Estado en vivo del enjambre → NPCs del hub muestran su estado ────────
    const eventsWs = new WebSocket(wsUrl('/hivelearn-events'))
    eventsWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type?: string
          agentId?: string
          state?: string
          progress?: number
          message?: string
          payload?: { agentId?: string; state?: string; progress?: number; message?: string }
        }
        // El emisor usa 'hl:agent-state' con payload; también acepta payload directo
        const p = msg.payload ?? msg
        if (!p.agentId || !p.state) return
        // Solo los 8 agentes del juego; ignorar otros (orchestrator, tools, etc.)
        const validGameAgents = ['coordinator', 'content', 'practice', 'assessment', 'image', 'infographic', 'audio', 'gamification']
        if (!validGameAgents.includes(p.agentId)) return
        bridge.emit('agent:state', {
          agentId: p.agentId,
          state: p.state as 'idle' | 'working' | 'done' | 'error',
          progress: p.progress,
          message: p.message,
        })
      } catch { /* ignore malformed */ }
    }
    eventsWs.onerror = () => { /* silencioso: el hub cae a su estado estático */ }

    bridge.on('game:exit', () => {
      navigate('/sessions')
    })

    // ── A2UI Overlay para diálogos de agentes dentro del juego ──────────────

    bridge.on('a2ui:show', ({ surfaceId, messages, agentId, title }) => {
      setA2uiOverlay({ surfaceId, messages, agentId, title })
    })

    bridge.on('a2ui:dismiss', ({ surfaceId }) => {
      setA2uiOverlay((prev) => (prev && (!surfaceId || prev.surfaceId === surfaceId) ? null : prev))
      if (surfaceId) bridge.emit('a2ui:closed', { surfaceId })
    })

    bridge.on('tutorial:ready', () => {
      openOnboardingRef.current?.(prefillNameRef.current ?? undefined)
    })

    // ── Catálogo de temas + generaciones interrumpidas (a petición del juego) ──

    let topicsCache: Promise<Array<{ slug: string; titulo: string; descripcion: string | null }>> | null = null
    const fetchTopics = () => {
      topicsCache ??= fetch('/api/hivelearn/topics')
        .then(r => (r.ok ? r.json() : { topics: [] }))
        .then(d => (Array.isArray(d?.topics) ? d.topics : []))
        .catch(() => [])
      return topicsCache
    }
    let interruptedChecked = false

    bridge.on('topics:request', () => {
      void (async () => {
        const topics = await fetchTopics()
        if (!disposed) bridge.emit('topics:loaded', { topics })
        // Una sola vez por montaje: avisar si hay una generación retomable
        if (interruptedChecked) return
        interruptedChecked = true
        try {
          const res = await fetch('/api/hivelearn/generation-runs?status=interrupted')
          const data = res.ok ? await res.json() : { runs: [] }
          const latest = (data.runs ?? [])[0]
          if (!disposed && latest?.sessionId) {
            bridge.emit('program:interrupted', { sessionId: latest.sessionId, meta: latest.meta ?? '' })
          }
        } catch { /* sin runs retomables: bienvenida normal */ }
      })()
    })

    bridge.on('topic:selected', ({ topic }) => {
      selectedTopicRef.current = topic
    })

    bridge.on('generation:resume', ({ sessionId }) => {
      void generateProgramRef.current?.(undefined, undefined, sessionId)
    })

    // ── Onboarding: WS existente, Maya pregunta dentro del juego ────────────

    // Estado de la ceremonia "La Colmena Viva" (onboarding Three.js)
    let ceremonyActive = false
    let pendingProfile: { perfil: StudentProfile; meta: string; energia: 'baja' | 'media' | 'alta'; tiempoDisponible: number } | null = null

    bridge.on('ceremony:start', () => {
      ceremonyActive = true
      openOnboarding()
    })

    bridge.on('ceremony:finish', () => {
      ceremonyActive = false
      if (pendingProfile) {
        const p = pendingProfile
        pendingProfile = null
        void generateProgram(p.perfil, p.meta)
      }
    })

    // ── Ceremonia del enjambre: diálogo 100% LLM vía /hivelearn-swarm-dialogue ──
    let swarmWs: WebSocket | null = null
    function openSwarmDialogue(perfil: Record<string, string | number>, meta: string, energia: 'baja' | 'media' | 'alta', tiempoDisponible: number) {
      try {
        const sessionId = localStorage.getItem('hivelearn-onboarding-session') ?? `swarm-${Date.now()}`
        swarmWs?.close()
        swarmWs = new WebSocket(wsUrl(`/hivelearn-swarm-dialogue?sessionId=${sessionId}`))
        swarmWs.onopen = () => {
          swarmWs?.send(JSON.stringify({
            type: 'start',
            perfil,
            tema: selectedTopicRef.current ?? String(meta).split('—')[0]?.trim() ?? '',
            objetivo: meta,
            energia,
            tiempoDisponible,
          }))
        }
        swarmWs.onmessage = (event) => {
          let msg: { type: string; [k: string]: unknown }
          try { msg = JSON.parse(event.data as string) } catch { return }
          switch (msg.type) {
            case 'bee_line_start':
              bridge.emit('swarm:line:start', { agentId: String(msg.agentId) })
              break
            case 'bee_line_delta':
              bridge.emit('swarm:line:delta', { agentId: String(msg.agentId), delta: String(msg.delta) })
              break
            case 'bee_line':
              bridge.emit('swarm:line', {
                agentId: String(msg.agentId),
                characterName: String(msg.characterName),
                emoji: String(msg.emoji),
                text: String(msg.text),
                fallback: !!msg.fallback,
                duracionMs: Number(msg.duracionMs) || 0,
              })
              break
            case 'ceremony_complete':
              bridge.emit('swarm:complete', { lines: Array.isArray(msg.lines) ? msg.lines.length : 0 })
              break
          }
        }
      } catch { /* sin ceremonia de enjambre: el flujo sigue a generar */ }
    }

    function openOnboarding(initialName?: string) {
      // 'game:ready' se emite en Boot y de nuevo en Tutorial: un solo WS
      if (ws) return
      const stored = localStorage.getItem('hivelearn-onboarding-session')
      const sessionId = stored ?? `onboarding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem('hivelearn-onboarding-session', sessionId)

      ws = new WebSocket(wsUrl(`/hivelearn-onboarding?sessionId=${sessionId}`))

      const sendInit = () => {
        // Tema elegido en el selector del juego: el servidor lo persiste de
        // forma determinista y el agente no vuelve a preguntarlo.
        const tema = selectedTopicRef.current
        ws?.send(JSON.stringify(tema ? { type: 'init', prefill: { tema } } : { type: 'init' }))
      }

      ws.onopen = () => {
        sendInit()
        if (initialName) {
          setTimeout(() => {
            ws?.send(JSON.stringify({ type: 'user_message', text: initialName, content: initialName }))
          }, 100)
        }
      }

      ws.onmessage = (event) => {
        let msg: { type: string; [k: string]: unknown }
        try { msg = JSON.parse(event.data as string) } catch { return }

        switch (msg.type) {
          case 'connected':
            sendInit()
            break
          case 'session_context':
            // "Despertar de la Colmena": hiveDB decidió el saludo de apertura
            bridge.emit('session:context', { payload: msg.payload as never })
            break
          case 'agent_message':
            if (typeof msg.text === 'string') {
              bridge.emit('onboarding:message', { text: msg.text, freeText: true })
            }
            break
          case 'complete': {
            const perfil = msg.perfil as StudentProfile
            const meta = msg.meta as string
            const store = useLessonStore.getState()
            store.completeOnboarding()
            store.setPerfil(perfil)
            localStorage.removeItem('hivelearn-onboarding-session')
            bridge.emit('profile:theme', {
              rangoEdad: perfil.rangoEdad,
              edad: perfil.edad,
              energia: (msg.energia as string | undefined),
            })

            if (ceremonyActive) {
              // La ceremonia ejecuta el diálogo del enjambre antes de generar;
              // 'ceremony:finish' disparará generateProgram con estos datos.
              pendingProfile = {
                perfil,
                meta,
                energia: (msg.energia as 'baja' | 'media' | 'alta') ?? 'media',
                tiempoDisponible: Number(msg.tiempoDisponible) || 30,
              }
              bridge.emit('onboarding:message', {
                text: '¡Listo! El enjambre ya conoce tu meta. 🍯',
                done: true,
              })
              openSwarmDialogue(perfil as unknown as Record<string, string | number>, meta, pendingProfile.energia, pendingProfile.tiempoDisponible)
              break
            }

            bridge.emit('onboarding:message', {
              text: '¡Listo! Las abejas ya están construyendo tu mundo. 🍯',
              done: true,
            })
            void generateProgram(perfil, meta)
            break
          }
          case 'error':
            bridge.emit('onboarding:message', {
              text: 'Uy, perdí la conexión con la colmena. ¿Me lo repites?',
              freeText: true,
            })
            break
        }
      }

      ws.onerror = () => {
        bridge.emit('onboarding:message', {
          text: 'No pude conectar con la colmena. Revisa que el servidor esté activo y vuelve a intentar. 🐝',
          freeText: true,
        })
      }
    }
    openOnboardingRef.current = openOnboarding

    bridge.on('onboarding:answer', ({ answer }) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'user_message', text: answer, content: answer }))
      }
    })

    // ── Generación del programa (SSE como useLessonSwarm, sin navegar) ──────

    async function generateProgram(perfil?: StudentProfile, meta?: string, resumeSessionId?: string) {
      const store = useLessonStore.getState()
      store.setIsGenerating(true)
      try {
        const body = resumeSessionId ? { resumeSessionId } : { perfil, meta }
        const response = await fetchWithAuth('/api/hivelearn/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok || !response.body) throw new Error(`Error del servidor: ${response.status}`)

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done || disposed) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''

          for (const eventText of parts) {
            let dataStr = ''
            for (const line of eventText.split('\n')) {
              if (line.startsWith('data: ')) dataStr = line.slice(6).trim()
            }
            if (!dataStr) continue
            let data: { type: string; payload?: any }
            try { data = JSON.parse(dataStr) } catch { continue }

            if (data.type === 'progress' && data.payload) {
              store.setSwarmProgress(data.payload)
              bridge.emit('program:generating', {
                porcentaje: data.payload.porcentaje ?? 0,
                mensaje: data.payload.mensaje ?? 'Generando…',
              })
            } else if (data.type === 'complete' && data.payload) {
              const s = useLessonStore.getState()
              s.setProgram(data.payload)
              s.setSessionId(data.payload.sessionId)
              if (data.payload.curriculoId) s.setCurriculoId(data.payload.curriculoId)
              s.setIsGenerating(false)
              const world = lessonToLevelSpecs(data.payload)
              // Datos para la pantalla de revelación de la Reina (mundo recién generado)
              const p = data.payload
              const nodos = Array.isArray(p.nodos) ? p.nodos : []
              const logros = Array.isArray(p.gamificacion?.logros) ? p.gamificacion.logros : []
              bridge.emit('program:loaded', {
                world,
                progress: loadProgress(data.payload.sessionId) ?? emptyProgress(),
                reveal: {
                  tema: String(p.tema ?? meta ?? ''),
                  nodos: nodos.map((n: { id: string; titulo?: string; xpRecompensa?: number }) => ({
                    id: String(n.id),
                    titulo: String(n.titulo ?? n.id),
                    xpRecompensa: Number(n.xpRecompensa ?? 0),
                  })),
                  logros: logros.map((l: string | { emoji?: string; nombre?: string; titulo?: string }) =>
                    typeof l === 'string' ? l : `${l.emoji ?? '🏆'} ${l.nombre ?? l.titulo ?? ''}`.trim()),
                  xpTotal: Number(p.gamificacion?.xpRecompensa ?? 0),
                },
              })
            } else if (data.type === 'error') {
              throw new Error(data.payload?.message ?? 'Error desconocido del enjambre')
            }
          }
        }
      } catch (err) {
        useLessonStore.getState().setIsGenerating(false)
        bridge.emit('onboarding:message', {
          text: `Las abejas tuvieron un problema: ${(err as Error).message}\n¿Quieres contarme otra vez qué te gustaría aprender?`,
          freeText: true,
        })
      }
    }
    generateProgramRef.current = generateProgram

    // ── Arranque ─────────────────────────────────────────────────────────────

    void game.init(container).then(() => {
      if (disposed) return
      return game.goTo(new TitleScene(game))
    })

    return () => {
      disposed = true
      ws?.close()
      try { eventsWs.close() } catch {}
      for (const [, sock] of agentChatWs) { try { sock.close() } catch {} }
      for (const url of objectUrls) URL.revokeObjectURL(url)
      bridge.clear()
      game.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devLevel, routeSessionId])

  // ── Sondeo de servicios (STT / TTS / LLM) cada 30s ────────────────────────
  useEffect(() => {
    let disposed = false
    async function pollServices() {
      try {
        const [sttRes, ttsRes, llmRes] = await Promise.allSettled([
          fetch('/api/stt/estado', { signal: AbortSignal.timeout(2000) }).then(r => r.json()),
          fetch('/api/tts-local/status', { signal: AbortSignal.timeout(2000) }).then(r => r.json()),
          fetch('/api/llm/status', { signal: AbortSignal.timeout(3000) }).then(r => r.json()),
        ])
        if (disposed) return
        const sttOk = sttRes.status === 'fulfilled' && !!(sttRes.value as { ok?: boolean })?.ok
        const ttsOk = ttsRes.status === 'fulfilled' && ((ttsRes.value as { ok?: boolean; voices?: unknown[] })?.ok ?? (ttsRes.value as { voices?: unknown[] })?.voices !== undefined)
        const llmOk = llmRes.status === 'fulfilled' && !!(llmRes.value as { ok?: boolean; serverRunning?: boolean })?.serverRunning
        setServices({
          stt: sttOk,
          tts: ttsOk,
          llm: llmOk,
          checking: false,
          detail: !sttOk && !llmOk ? 'El modo voz requiere llama-server :8083 (STT) y llama-server :8081 (LLM) activos. El juego funciona solo con texto.'
            : !sttOk ? 'STT no disponible — usa [E] para hablar por texto.'
            : !llmOk ? 'LLM no disponible — usa [E] para hablar por texto.'
            : undefined,
        })
      } catch {
        if (!disposed) setServices({ stt: false, tts: false, llm: false, checking: false, detail: 'No pude comprobar los servicios de voz.' })
      }
    }
    void pollServices()
    const interval = setInterval(pollServices, 30_000)
    return () => { disposed = true; clearInterval(interval) }
  }, [])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-[#1a1a2e]"
      style={{ touchAction: 'none' }}
    >
      {/* Indicador de estado de servicios (STT / TTS / LLM) */}
      {!services.checking && (services.stt && services.tts && services.llm ? null : (
        <div className="pointer-events-none absolute top-2 right-2 z-40 flex items-center gap-2 rounded-lg bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
          <div className="flex gap-1.5">
            <span title="Speech-to-Text" className={`inline-flex h-2 w-2 rounded-full ${services.stt ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span title="Text-to-Speech" className={`inline-flex h-2 w-2 rounded-full ${services.tts ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span title="LLM" className={`inline-flex h-2 w-2 rounded-full ${services.llm ? 'bg-emerald-400' : 'bg-red-400'}`} />
          </div>
          <span className="max-w-xs leading-tight">
            {services.detail ?? 'Modo texto disponible; la voz necesita servidores locales.'}
          </span>
        </div>
      ))}
      {a2uiOverlay && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border-4 border-amber-400 bg-[#1a1a2e] p-4 shadow-2xl">
            {a2uiOverlay.title && (
              <div className="mb-3 flex items-center gap-2 text-amber-400">
                <span className="text-lg font-bold">{a2uiOverlay.title}</span>
              </div>
            )}
            <A2UIRenderer
              messages={a2uiOverlay.messages}
              onAction={async ({ name, context }) => {
                setA2uiPendingAction(name)
                const bridge = bridgeRef.current
                bridge?.emit('a2ui:action', {
                  surfaceId: a2uiOverlay.surfaceId,
                  actionName: name,
                  context: context ?? {},
                  agentId: a2uiOverlay.agentId,
                })
                // Cerrar automáticamente diálogos de agentes tras una acción de cierre
                if (name === 'close_dialog') {
                  setA2uiOverlay(null)
                  bridge?.emit('a2ui:closed', { surfaceId: a2uiOverlay.surfaceId })
                }
                // La Reina inicia el onboarding conversacional con el nombre capturado
                if (a2uiOverlay.surfaceId === 'hive-welcome' && name === 'submit_name') {
                  const nameValue = context?.name || context?._textValues?.name || ''
                  setA2uiOverlay(null)
                  setPrefillName(String(nameValue))
                  prefillNameRef.current = String(nameValue)
                  // El WS se abrirá cuando TutorialScene emita 'tutorial:ready'
                }
                // Retomar una generación interrumpida (la escena emite generation:resume)
                if (a2uiOverlay.surfaceId === 'hive-welcome' && name === 'resume_generation') {
                  setA2uiOverlay(null)
                }
                // Selector de tema (la escena emite topic:selected y navega al tutorial)
                if (a2uiOverlay.surfaceId === 'hive-topic-select' && (name === 'select_topic' || name === 'custom_topic')) {
                  setA2uiOverlay(null)
                }
                // Revelación del programa generado (la escena navega al mapa de mundos)
                if (a2uiOverlay.surfaceId === 'hive-program-reveal' && name === 'start_playing') {
                  setA2uiOverlay(null)
                }
                // Entre mundos: generar siguiente mundo
                if (a2uiOverlay.surfaceId === 'hive-next-world' && name === 'generate_next_world') {
                  setA2uiOverlay(null)
                  const { perfil, meta } = useLessonStore.getState()
                  if (perfil && meta) void generateProgramRef.current?.(perfil, meta)
                }
                // Entre mundos: repetir mundo actual
                if (a2uiOverlay.surfaceId === 'hive-next-world' && name === 'replay_world') {
                  setA2uiOverlay(null)
                  const { program } = useLessonStore.getState()
                  if (program) {
                    bridge?.emit('program:loaded', {
                      world: lessonToLevelSpecs(program),
                      progress: loadProgress(program.sessionId) ?? emptyProgress(),
                    })
                  }
                }
                setA2uiPendingAction(null)
              }}
              pendingActionName={a2uiPendingAction ?? undefined}
            />
          </div>
        </div>
      )}
    </div>
  )
}
