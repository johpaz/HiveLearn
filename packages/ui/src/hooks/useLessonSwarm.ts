import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLessonStore } from '../store/lessonStore'
import type { StudentProfile } from '@hivelearn/core'
import { fetchWithAuth } from '../lib/fetchWithAuth'

/**
 * Hook que conecta HiveLearnSwarm con el store via SSE streaming.
 * El progreso por agente llega en tiempo real desde el agent-bus del backend.
 */
export function useLessonSwarm() {
  const navigate = useNavigate()
  const {
    setProgram, setSwarmProgress, setScreen,
    setSessionId, setCurriculoId, setIsGenerating,
    setCoordinatorStatus,
    setAgentStatus,
    ingestSwarmEvent,
    resetSwarmVisualization,
  } = useLessonStore()

  const generateLesson = useCallback(async (profile: StudentProfile, goal: string) => {
    try {
      setScreen('loading')
      setIsGenerating(true)
      resetSwarmVisualization()
      setSwarmProgress({
        etapa: 'tier0',
        agenteActivo: 'ProfileAgent',
        porcentaje: 2,
        mensaje: 'Iniciando el enjambre de agentes...',
      })

      const response = await fetchWithAuth('/api/hivelearn/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil: profile,
          meta: goal,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Error del servidor: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Split on double newline (SSE event separator)
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const eventText of parts) {
          if (!eventText.trim()) continue

          let dataStr = ''

          for (const line of eventText.split('\n')) {
            if (line.startsWith('data: ')) dataStr = line.slice(6).trim()
          }

          if (!dataStr) continue

          let data: any
          try { data = JSON.parse(dataStr) } catch { continue }

          switch (data.type) {
            case 'progress':
              setSwarmProgress(data.payload)
              break
            case 'swarm_timeline':
              ingestSwarmEvent(data.payload)
              break
            case 'event':
              if (data.payload) ingestSwarmEvent(data.payload)
              break
            case 'complete':
              setProgram(data.payload)
              setSessionId(data.payload.sessionId)
              setCurriculoId(data.payload.curriculoId)
              setIsGenerating(false)
              setScreen('lesson')
              navigate('/program')
              break
            case 'error':
              throw new Error(data.payload?.message ?? 'Error desconocido del swarm')
          }
        }
      }
    } catch (err) {
      setIsGenerating(false)
      setCoordinatorStatus('error', null)
      const lastProgress = useLessonStore.getState().swarmProgress?.porcentaje ?? 0
      setSwarmProgress({
        etapa: 'error',
        agenteActivo: 'Sistema',
        porcentaje: lastProgress,
        mensaje: `Error: ${(err as Error).message}`,
      })
    }
  }, [
    navigate,
    setProgram, setSwarmProgress, setScreen,
    setSessionId, setCurriculoId, setIsGenerating,
    setCoordinatorStatus,
    setAgentStatus,
    ingestSwarmEvent,
    resetSwarmVisualization,
  ])

  return { generateLesson }
}
