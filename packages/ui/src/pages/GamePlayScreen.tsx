/**
 * GamePlayScreen — monta el juego PixiJS (@hivelearn/game) y lo conecta a la
 * app vía GameBridge:
 *
 *  - Programa en el store → lessonToLevelSpecs → 'program:loaded'
 *  - Sin programa → onboarding por el WS existente (/hivelearn-onboarding),
 *    Maya (NPC) hace las preguntas dentro del juego
 *  - Onboarding completo → POST /api/hivelearn/generate (SSE) y progreso
 *    jugable mientras el enjambre trabaja
 *  - TTS de conceptos → /api/tts-local/speak (Piper) con ducking de música
 *  - XP de conceptos → completarNodo() (la gamificación existente)
 *
 * El juego nunca toca red ni store directamente: todo pasa por el bridge.
 */

import { useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Game, GameBridge, BootScene, emptyProgress, type GameProgress } from '@hivelearn/game'
// Importar desde el submódulo puro: el índice de core arrastra el backend
// (gateway, llm-local) al bundle del navegador
import { lessonToLevelSpecs } from '@hivelearn/core/lesson/levelSpec'
import type { StudentProfile } from '@hivelearn/core/types'
import { useLessonStore } from '../store/lessonStore'
import { wsUrl } from '../lib/wsUrl'
import { fetchWithAuth } from '../lib/fetchWithAuth'

const PROGRESS_KEY = (sessionId: string) => `hivelearn-game-progress:${sessionId}`

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

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const bridge = new GameBridge()
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
        openOnboarding()
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

    bridge.on('tts:request', async ({ nodeId, text }) => {
      try {
        const res = await fetch('/api/tts-local/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, 800) }),
          signal: AbortSignal.timeout(20_000),
        })
        if (!res.ok || disposed) return
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        objectUrls.push(url)
        bridge.emit('tts:ready', { nodeId, url })
      } catch { /* Piper no disponible: el panel funciona sin voz */ }
    })

    bridge.on('game:exit', () => {
      navigate('/sessions')
    })

    // ── Onboarding: WS existente, Maya pregunta dentro del juego ────────────

    function openOnboarding() {
      // 'game:ready' se emite en Boot y de nuevo en Tutorial: un solo WS
      if (ws) return
      const stored = localStorage.getItem('hivelearn-onboarding-session')
      const sessionId = stored ?? `onboarding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem('hivelearn-onboarding-session', sessionId)

      ws = new WebSocket(wsUrl(`/hivelearn-onboarding?sessionId=${sessionId}`))

      ws.onmessage = (event) => {
        let msg: { type: string; [k: string]: unknown }
        try { msg = JSON.parse(event.data as string) } catch { return }

        switch (msg.type) {
          case 'connected':
            ws?.send(JSON.stringify({ type: 'init' }))
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
            store.setMeta(meta)
            localStorage.removeItem('hivelearn-onboarding-session')
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

    bridge.on('onboarding:answer', ({ answer }) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'user_message', text: answer, content: answer }))
      }
    })

    // ── Generación del programa (SSE como useLessonSwarm, sin navegar) ──────

    async function generateProgram(perfil: StudentProfile, meta: string) {
      const store = useLessonStore.getState()
      store.setIsGenerating(true)
      try {
        const response = await fetchWithAuth('/api/hivelearn/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ perfil, meta }),
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
              bridge.emit('program:loaded', {
                world,
                progress: loadProgress(data.payload.sessionId) ?? emptyProgress(),
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

    // ── Arranque ─────────────────────────────────────────────────────────────

    void game.init(container).then(() => {
      if (disposed) return
      return game.goTo(new BootScene(game))
    })

    return () => {
      disposed = true
      ws?.close()
      for (const url of objectUrls) URL.revokeObjectURL(url)
      bridge.clear()
      game.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devLevel, routeSessionId])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-[#1a1a2e]"
      style={{ touchAction: 'none' }}
    />
  )
}
