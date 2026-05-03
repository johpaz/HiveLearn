import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { initSwarmWorld, type SwarmWorldEngine } from './swarmWorldEngine'
import { useHiveLearnLive } from '@/hooks/useHiveLearnLive'
import { apiClient } from '@/lib/api'
import { useMundoStore } from '@/store/mundoStore'
import { Loader2 } from 'lucide-react'

export function SwarmWorld() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef    = useRef<SwarmWorldEngine | null>(null)
  const navigate     = useNavigate()
  const location     = useLocation()
  const { setProgramaUuid } = useMundoStore()

  const [loading, setLoading] = useState(true)

  const { agentStatuses, isConnected, lastMessage } = useHiveLearnLive()

  // Dispara la generación del programa al montar, si hay perfil+meta en el estado de navegación
  useEffect(() => {
    const { perfil, meta } = (location.state as any) ?? {}
    if (!perfil || !meta) return
    const swarmId = `swarm-${Date.now()}`
    apiClient<{ ok: boolean; swarmId: string }>('/api/hivelearn/generate', {
      method: 'POST',
      body: { perfil, meta, sessionId: swarmId },
    }).catch((err) => console.error('[SwarmWorld] generate error:', err))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      try {
        const data = await apiClient<any>('/api/hivelearn/agents')
        const agentsList = data.agents || []
        if (containerRef.current) {
          const engine = await initSwarmWorld(containerRef.current)
          engineRef.current = engine
          engine.setAgents(agentsList)
          setLoading(false)
        }
      } catch (err) {
        console.error('Error initializing SwarmWorld:', err)
      }
    }
    load()
    return () => { engineRef.current?.destroy(); engineRef.current = null }
  }, [])

  useEffect(() => {
    if (!engineRef.current) return
    Object.entries(agentStatuses).forEach(([id, status]: [string, any]) => {
      engineRef.current?.updateAgent(id, status)
    })
    if (lastMessage?.type === 'swarm_completed' || lastMessage?.type === 'session:completed') {
      const programaUuid = lastMessage.swarmId || lastMessage.data?.id
      if (programaUuid) setProgramaUuid(programaUuid)
      setTimeout(() => navigate('/mundo'), 2200)
    }
  }, [agentStatuses, lastMessage, navigate, setProgramaUuid])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#04080f]">
      {/* Canvas PixiJS full viewport */}
      <div ref={containerRef} className="w-full h-full" />

      {/* HUD — connection status (top-left) */}
      <div className="absolute top-5 left-6 flex items-center gap-3 bg-black/40 border border-white/10 backdrop-blur-md px-4 py-2 rounded-2xl">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
          {isConnected ? 'Laboratorio Activo' : 'Reconectando...'}
        </span>
      </div>

      {/* Salir (top-right) — propio porque no hay LearningLayout */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-5 right-6 flex items-center gap-2 bg-black/40 border border-white/10 backdrop-blur-md px-4 py-2 rounded-2xl text-white/60 hover:text-white hover:border-white/30 transition-colors text-[11px] font-bold uppercase tracking-widest"
      >
        ✕ Salir
      </button>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 bg-[#04080f] flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            <p className="text-xs font-bold text-amber-500/50 uppercase tracking-widest">
              Activando la colmena...
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
