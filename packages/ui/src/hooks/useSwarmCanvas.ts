import { useRef, useCallback, useEffect } from 'react'
import { useLessonStore } from '../store/lessonStore'
import { wsUrl } from '../lib/wsUrl'
import type { StudentProfile, AgentStatus, LessonProgram } from '@hivelearn/core'

interface SwarmEvent {
  type: string
  agentId?: string
  agentName?: string
  etapa?: string
  agenteActivo?: string
  porcentaje?: number
  mensaje?: string
  error?: string
  sessionId?: string
  curriculoId?: number
  message?: string
  [key: string]: unknown
}

function extractProgram(msg: SwarmEvent): LessonProgram {
  const { type: _t, error: _e, message: _m, curriculoId: _c, ...rest } = msg
  return rest as unknown as LessonProgram
}

export function useSwarmCanvas() {
  const {
    setProgram, setSwarmProgress, setScreen,
    setSessionId, setCurriculoId, setIsGenerating,
    setCoordinatorStatus,
    setAgentStatus,
    ingestSwarmEvent, resetSwarmVisualization,
  } = useLessonStore()

  const wsRef = useRef<WebSocket | null>(null)
  const onEventRef = useRef<((event: SwarmEvent) => void) | null>(null)

  const connect = useCallback(() => {
    const sessionId = `hl:${crypto.randomUUID()}`
    const url = wsUrl(`/hivelearn-events?sessionId=${sessionId}`)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      // connected — wait for generate call
    }

    ws.onmessage = (e) => {
      let msg: SwarmEvent
      try { msg = JSON.parse(e.data as string) } catch { return }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
        return
      }

      if (msg.type === 'hl:connected') return

      if (msg.type === 'progress') {
        setSwarmProgress({
          etapa: msg.etapa ?? '',
          agenteActivo: msg.agenteActivo ?? '',
          porcentaje: msg.porcentaje ?? 0,
          mensaje: msg.mensaje ?? '',
        })
      }

      if (msg.type === 'swarm_timeline' && msg.payload) {
        ingestSwarmEvent(msg.payload as any)
      }

      if (msg.type === 'agent_started' && msg.agentId) {
        setAgentStatus(msg.agentId, 'running' as AgentStatus)
      }

      if (msg.type === 'agent_completed' && msg.agentId) {
        setAgentStatus(msg.agentId, 'completed' as AgentStatus)
      }

      if (msg.type === 'agent_failed' && msg.agentId) {
        setAgentStatus(msg.agentId, 'failed' as AgentStatus)
      }

      if (msg.type === 'complete') {
        setProgram(extractProgram(msg))
        if (msg.sessionId) setSessionId(msg.sessionId)
        if (msg.curriculoId) setCurriculoId(msg.curriculoId)
        setIsGenerating(false)
      }

      if (msg.type === 'error') {
        setIsGenerating(false)
        setCoordinatorStatus('error', null)
        const lastProgress = useLessonStore.getState().swarmProgress?.porcentaje ?? 0
        setSwarmProgress({
          etapa: 'error',
          agenteActivo: 'Sistema',
          porcentaje: lastProgress,
          mensaje: `Error: ${msg.error ?? msg.message ?? 'Error desconocido'}`,
        })
      }

      if (msg.type === 'swarm_completed') {
        // swarm finished — canvas will do celebration then transition
      }

      onEventRef.current?.(msg)
    }

    ws.onclose = () => {
      wsRef.current = null
    }

    ws.onerror = () => {
      wsRef.current = null
    }
  }, [setProgram, setSwarmProgress, setScreen, setSessionId, setCurriculoId, setIsGenerating, setCoordinatorStatus, setAgentStatus, ingestSwarmEvent])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close(1000)
      wsRef.current = null
    }
  }, [connect])

  const generateLesson = useCallback((profile: StudentProfile, goal: string) => {
    setScreen('loading')
    setIsGenerating(true)
    resetSwarmVisualization()
    setSwarmProgress({
      etapa: 'init',
      agenteActivo: 'HiveLearnCoordinator',
      porcentaje: 2,
      mensaje: 'Iniciando el enjambre de agentes...',
    })

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'generate',
        perfil: profile,
        meta: goal,
      }))
    } else {
      const ws = wsRef.current
      if (ws) {
        ws.addEventListener('open', () => {
          ws.send(JSON.stringify({
            type: 'generate',
            perfil: profile,
            meta: goal,
          }))
        }, { once: true })
      }
    }
  }, [setScreen, setIsGenerating, setSwarmProgress, resetSwarmVisualization])

  return {
    generateLesson,
    onEventRef,
  }
}
