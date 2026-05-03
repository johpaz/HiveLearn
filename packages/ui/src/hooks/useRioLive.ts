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
  startGeneration: (perfil: any, meta: string) => Promise<void>
  sendRespuesta: (moduloUuid: string, nodoId: string, respuesta: any, intentos: number) => void
}

function getWsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = import.meta.env.DEV
    ? `${window.location.hostname}:8787`
    : window.location.host
  return `${protocol}//${host}${path}`
}

export function useRioLive(
  sessionId: string | null,
  alumnoId: string | null,
): RioLiveState {
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

  // ─── Get bridge from store (set by RioMundoPage) ────────────────────────────
  const getBridge = useCallback(() => {
    const state = useRioMundoStore.getState()
    return (state as any)._rioBridge as import('@/canvaslearn/rio/protocol/RioA2UIBridge').RioA2UIBridge | null
  }, [])

  // ─── Program WebSocket (hivelearn-program) ─────────────────────────────────

  const connectProgramWs = useCallback(() => {
    if (!sessionId || !alumnoId || unmountedRef.current) return

    try {
      const url = getWsUrl(`/ws/hivelearn-program?sessionId=${sessionId}`)
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (unmountedRef.current) { ws.close(); return }
        setIsConnected(true)
        setError(null)
        reconnectDelayRef.current = BASE_RECONNECT_MS

        // Start session
        ws.send(JSON.stringify({
          tipo: 'iniciar_sesion',
          session_id: sessionId,
          alumno_id: alumnoId,
          payload: {},
          timestamp: new Date().toISOString(),
        }))

        // Ping interval
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ tipo: 'heartbeat', timestamp: new Date().toISOString() }))
          }
        }, PING_INTERVAL_MS)
      }

      ws.onmessage = (e) => {
        if (unmountedRef.current) return
        try {
          const message: ServerMessage = JSON.parse(e.data as string)

          // Dispatch to A2UI bridge
          const bridge = getBridge()
          if (bridge) {
            bridge.procesarMensajeServidor(message)
          }
        } catch {
          // Malformed JSON — ignore
        }
      }

      ws.onclose = () => {
        if (unmountedRef.current) return
        setIsConnected(false)
        if (pingTimerRef.current) clearInterval(pingTimerRef.current)
        pingTimerRef.current = null

        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_MS)
          connectProgramWs()
        }, reconnectDelayRef.current)
      }

      ws.onerror = () => {
        setError('Error de conexion')
        ws.close()
      }
    } catch {
      setError('No se pudo conectar')
    }
  }, [sessionId, alumnoId, getBridge])

  // ─── Events WebSocket (hivelearn-events) ───────────────────────────────────

  const connectEventsWs = useCallback(() => {
    if (unmountedRef.current) return

    try {
      const url = getWsUrl('/hivelearn-events?sessionId=hl-rio')
      const ws = new WebSocket(url)
      eventsWsRef.current = ws

      ws.onopen = () => {
        if (unmountedRef.current) { ws.close(); return }

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

  // ─── Start program generation ────────────────────────────────────────────────

  const startGeneration = useCallback(async (perfil: any, meta: string) => {
    if (!sessionId || !alumnoId) return

    try {
      const res = await fetch('/api/hivelearn/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil,
          meta,
          sessionId,
          alumnoId,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        useRioMundoStore.getState().setIsGenerating(true)
        setIsGenerating(true)
      }
    } catch (err) {
      setError('Error al iniciar la generacion')
    }
  }, [sessionId, alumnoId])

  // ─── Send response via WS ────────────────────────────────────────────────────

  const sendRespuesta = useCallback((moduloUuid: string, nodoId: string, respuesta: any, intentos: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    wsRef.current.send(JSON.stringify({
      tipo: 'accion',
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
  }, [sessionId, alumnoId])

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    unmountedRef.current = false

    if (sessionId && alumnoId) {
      connectProgramWs()
    }
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
  }, [sessionId, alumnoId, connectProgramWs, connectEventsWs])

  return {
    isConnected,
    isGenerating,
    currentAgentId,
    currentAgentName,
    error,
    a2uiMessages,
    startGeneration,
    sendRespuesta,
  }
}