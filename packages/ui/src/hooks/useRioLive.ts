import { useEffect, useRef, useState, useCallback } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { RioA2UIBridge } from '@/canvaslearn/rio/protocol/RioA2UIBridge'
import type { ServerMessage } from '@hivelearn/core'

const PING_INTERVAL_MS = 25_000
const BASE_RECONNECT_MS = 1_500
const MAX_RECONNECT_MS = 30_000

export interface RioLiveState {
  isConnected: boolean
  isGenerating: boolean
  currentAgentId: string | null
  currentAgentName: string | null
  error: string | null
  a2uiMessages: any[]
  sendRespuesta: (moduloUuid: string, nodoId: string, respuesta: any, intentos: number) => void
  sendWsMessage: (msg: { tipo: string; [k: string]: any }) => void
}

function getWsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

export function useRioLive(): RioLiveState {

  const [isConnected, setIsConnected] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null)
  const [currentAgentName, setCurrentAgentName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [a2uiMessages, setA2uiMessages] = useState<any[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const eventsWsRef = useRef<WebSocket | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const eventsPingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(BASE_RECONNECT_MS)
  const unmountedRef = useRef(false)
  const pingSentAtRef = useRef<number | null>(null)

  // ─── Get bridge from store (set by RioMundoPage) ────────────────────────────
  const getBridge = useCallback(() => {
    const state = useRioMundoStore.getState()
    return (state as any)._rioBridge as import('@/canvaslearn/rio/protocol/RioA2UIBridge').RioA2UIBridge | null
  }, [])

  // ─── Program WebSocket (hivelearn-program) ─────────────────────────────────

  const connectProgramWs = useCallback(() => {
    if (unmountedRef.current) return

    try {
      const url = getWsUrl('/hivelearn-program')
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[WS] /hivelearn-program connected')
        if (unmountedRef.current) { ws.close(); return }
        setIsConnected(true)
        useRioMundoStore.getState().setWsStatus('connected')
        setError(null)
        reconnectDelayRef.current = BASE_RECONNECT_MS

        // Ping interval
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingSentAtRef.current = Date.now()
            ws.send(JSON.stringify({ tipo: 'heartbeat', timestamp: new Date().toISOString() }))
          }
        }, PING_INTERVAL_MS)
      }

      ws.onmessage = (e) => {
        if (unmountedRef.current) return
        try {
          const message = JSON.parse(e.data as string) as any

          // Handle pong to measure latency
          if (message.tipo === 'pong' || message.type === 'pong') {
            if (pingSentAtRef.current) {
              const latency = Date.now() - pingSentAtRef.current
              useRioMundoStore.getState().setWsLatencyMs(latency)
              pingSentAtRef.current = null
            }
            return
          }

          // Handle store-updating message types
          switch (message.tipo) {
            case 'buscar_nickname_result': {
              const store = useRioMundoStore.getState()
              if (message.payload?.ok && message.payload?.found && message.payload?.profile) {
                const profile = message.payload.profile
                store.setPerfil(profile)
                store.setAlumnoId(profile.alumnoId)
                store.setNickname(profile.nickname)
                // Poblar onboarding con datos del perfil para saludo personalizado
                if (profile.nombre) {
                  store.updateOnboarding({ nombre: profile.nombre })
                }
                if (profile.edad != null) {
                  store.updateOnboarding({ edad: profile.edad })
                }
              }
              store.setLoginSearchResult({
                found: !!message.payload?.found,
                profile: message.payload?.profile,
              })
              return
            }
            case 'crear_alumno_result': {
              const store = useRioMundoStore.getState()
              if (message.payload?.ok && message.payload?.perfil) {
                store.setPerfil(message.payload.perfil)
                store.setAlumnoId(message.payload.perfil.alumnoId)
              }
              return
            }
            case 'crear_sesion_result': {
              const store = useRioMundoStore.getState()
              if (message.payload?.ok && message.payload?.sessionId) {
                store.setSessionId(message.payload.sessionId)
              }
              return
            }
            case 'generacion_iniciada': {
              if (message.payload?.ok) {
                useRioMundoStore.getState().setIsGenerating(true)
                setIsGenerating(true)
              }
              return
            }
            case 'programa_recibido': {
              const store = useRioMundoStore.getState()
              if (message.payload?.ok && message.payload?.programa_uuid) {
                store.setProgramaUuid(message.payload.programa_uuid)
                if (message.payload?.tema) store.setTema(message.payload.tema)
                if (message.payload?.objetivo) store.setMeta(message.payload.objetivo)
                if (message.payload?.xp_total !== undefined) {
                  // agregarXP espera un delta, calculamos la diferencia
                  const delta = message.payload.xp_total - store.xpTotal
                  if (delta > 0) store.agregarXP(delta)
                }
              }
              return
            }
            case 'reanudar_sesion_result': {
              const store = useRioMundoStore.getState()
              if (message.payload?.ok && message.payload?.sessionId) {
                store.setSessionId(message.payload.sessionId)
                store.setProgramaUuid(message.payload.programa_uuid || message.payload.sessionId)
                if (message.payload?.tema) store.setTema(message.payload.tema)
                if (message.payload?.objetivo) store.setMeta(message.payload.objetivo)
                if (message.payload?.xp_total !== undefined && message.payload.xp_total > store.xpTotal) {
                  store.agregarXP(message.payload.xp_total - store.xpTotal)
                }
                store.setLoginPhase('in_world')
              }
              return
            }
            case 'tts:audio': {
              if (message.payload?.audioBase64) {
                useRioMundoStore.getState().enqueueTtsAudio(message.payload.audioBase64)
              }
              return
            }
            case 'tts:error': {
              console.warn('[WS] TTS error:', message.payload?.error)
              return
            }
            case 'connected': {
              if (message.connectionId) {
                useRioMundoStore.getState().setWsConnectionId(message.connectionId)
              }
              return
            }
          }

          // Dispatch to A2UI bridge for mundo/evento/contenido messages
          const bridge = getBridge()
          if (bridge) {
            bridge.procesarMensajeServidor(message as ServerMessage)
          }
        } catch {
          // Malformed JSON — ignore
        }
      }

      ws.onclose = () => {
        if (unmountedRef.current) return
        setIsConnected(false)
        useRioMundoStore.getState().setWsStatus('disconnected')
        if (pingTimerRef.current) clearInterval(pingTimerRef.current)
        pingTimerRef.current = null

        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_MS)
          connectProgramWs()
        }, reconnectDelayRef.current)
      }

      ws.onerror = () => {
        // Silenciar — onclose maneja reconnexión
      }
    } catch {
      // Silenciar — onclose maneja reconnexión
    }
  }, [getBridge])

  // ─── Events WebSocket (hivelearn-events) ───────────────────────────────────

  const connectEventsWs = useCallback(() => {
    if (unmountedRef.current) return

    try {
      const url = getWsUrl('/hivelearn-events')
      const ws = new WebSocket(url)
      eventsWsRef.current = ws

      ws.onopen = () => {
        if (unmountedRef.current) { ws.close(); return }
        useRioMundoStore.getState().setWsStatus('connected')

        eventsPingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL_MS)
      }

      ws.onmessage = (e) => {
        if (unmountedRef.current) return
        try {
          const msg = JSON.parse(e.data as string) as { type: string; [k: string]: unknown }

          switch (msg.type) {
            case 'swarm_started': {
              useRioMundoStore.getState().setIsGenerating(true)
              setIsGenerating(true)
              setCurrentAgentId(null)
              break
            }
            case 'swarm_completed': {
              useRioMundoStore.getState().setIsGenerating(false)
              setIsGenerating(false)
              setCurrentAgentId(null)
              const bridge = getBridge()
              if (bridge) {
                bridge.onSwarmCompleted()
              }
              break
            }
            case 'agent_started': {
              const id = msg.agentId as string
              const name = msg.agentName as string || id
              setCurrentAgentId(id)
              setCurrentAgentName(name)
              useRioMundoStore.getState().setAgentStatus(id, 'running')
              const bridge = getBridge()
              if (bridge) {
                bridge.onAgentStarted(id, name)
              }
              break
            }
            case 'agent_completed': {
              const id = msg.agentId as string
              const name = msg.agentName as string || id
              const zoneNumero = msg.zoneNumero as number | null
              useRioMundoStore.getState().setAgentStatus(id, 'completed')
              const bridge = getBridge()
              if (bridge) {
                bridge.onAgentCompleted(id, name, zoneNumero)
              }
              // Update progress
              const state = useRioMundoStore.getState()
              const completed = Object.values(state.agentStatuses).filter(s => s === 'completed').length + 1
              useRioMundoStore.getState().setSwarmProgress({
                etapa: 'progreso',
                porcentaje: Math.round((completed / state.swarmProgress.totalAgents) * 100),
                agenteActivo: id,
                mensaje: name,
              } as any)
              break
            }
            case 'agent_failed': {
              const id = msg.agentId as string
              useRioMundoStore.getState().setAgentStatus(id, 'failed')
              break
            }
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }))
              break
            case 'pong':
              break
          }
        } catch {
          // Ignore malformed
        }
      }

      ws.onclose = () => {
        if (unmountedRef.current) return
        useRioMundoStore.getState().setWsStatus('disconnected')
        if (eventsPingTimerRef.current) clearInterval(eventsPingTimerRef.current)
        eventsPingTimerRef.current = null

        eventsReconnectTimerRef.current = setTimeout(() => {
          connectEventsWs()
        }, BASE_RECONNECT_MS)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      // Ignore
    }
  }, [getBridge])

  // ─── Send raw message via WS ─────────────────────────────────────────────────

  const sendWsMessage = useCallback((msg: { tipo: string; [k: string]: any }) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Not connected, cannot send:', msg.tipo)
      return
    }
    const state = useRioMundoStore.getState()
    wsRef.current.send(JSON.stringify({
      ...msg,
      connectionId: state.wsConnectionId,
      timestamp: new Date().toISOString(),
    }))
  }, [])

  // ─── Send response via WS ────────────────────────────────────────────────────

  const sendRespuesta = useCallback((moduloUuid: string, nodoId: string, respuesta: any, intentos: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    const state = useRioMundoStore.getState()
    const sessionId = state.sessionId
    const alumnoId = state.alumnoId
    const connectionId = state.wsConnectionId
    if (!sessionId || !alumnoId) return

    wsRef.current.send(JSON.stringify({
      tipo: 'accion',
      connectionId,
      session_id: sessionId,
      alumno_id: alumnoId,
      payload: {
        mundo_evento: {
          tipo: 'mundo:evaluar',
          datos: {
            modulo_uuid: moduloUuid,
            nodo_id: nodoId,
            respuesta,
            intentos,
            tiempo_respuesta_ms: Date.now(),
          },
        },
      },
      timestamp: new Date().toISOString(),
    }))
  }, [])

  // ─── Register sendWsMessage in store ─────────────────────────────────────────

  useEffect(() => {
    useRioMundoStore.getState().setSendWsMessage(sendWsMessage)
  }, [sendWsMessage])

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    unmountedRef.current = false

    // SIEMPRE conectar al WS del programa desde el inicio
    connectProgramWs()
    connectEventsWs()

    return () => {
      unmountedRef.current = true
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      if (eventsPingTimerRef.current) clearInterval(eventsPingTimerRef.current)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (eventsReconnectTimerRef.current) clearTimeout(eventsReconnectTimerRef.current)
      wsRef.current?.close()
      eventsWsRef.current?.close()
    }
  }, [connectProgramWs, connectEventsWs])

  return {
    isConnected,
    isGenerating,
    currentAgentId,
    currentAgentName,
    error,
    a2uiMessages,
    sendRespuesta,
    sendWsMessage,
  }
}
