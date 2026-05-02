import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { initSwarmWorld, type SwarmWorldEngine } from './swarmWorldEngine'
import { useHiveLearnLive } from '@/hooks/useHiveLearnLive'
import { apiClient } from '@/lib/api'
import { useMundoStore } from '@/store/mundoStore'
import { Loader2 } from 'lucide-react'

export function SwarmWorld() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<SwarmWorldEngine | null>(null)
  const navigate = useNavigate()
  const { setProgramaUuid } = useMundoStore()
  
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<any[]>([])

  // Hook de telemetría en vivo
  const { agentStatuses, isConnected, lastMessage } = useHiveLearnLive()

  // 1. Cargar agentes iniciales e inicializar motor
  useEffect(() => {
    async function load() {
      try {
        const data = await apiClient<any>("/api/hivelearn/agents")
        const agentsList = data.agents || []
        setAgents(agentsList)

        if (containerRef.current) {
          const engine = await initSwarmWorld(containerRef.current)
          engineRef.current = engine
          engine.setAgents(agentsList)
          setLoading(false)
        }
      } catch (err) {
        console.error("Error initializing SwarmWorld:", err)
      }
    }
    load()

    return () => {
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [])

  // 2. Reaccionar a cambios de estado en vivo
  useEffect(() => {
    if (!engineRef.current) return

    // Actualizar cada agente en el motor
    Object.entries(agentStatuses).forEach(([id, status]: [string, any]) => {
      engineRef.current?.updateAgent(id, status)
    })

    // Detectar si el enjambre ha terminado
    if (lastMessage?.type === 'swarm_completed' || lastMessage?.type === 'session:completed') {
      const programaUuid = lastMessage.swarmId || lastMessage.data?.id
      if (programaUuid) {
        setProgramaUuid(programaUuid)
        // Pequeña pausa para efecto dramático antes de saltar al mundo 2
        setTimeout(() => {
          navigate('/mundo')
        }, 2000)
      }
    }
  }, [agentStatuses, lastMessage, navigate, setProgramaUuid])

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0e27] flex items-center justify-center">
      {/* Pixi Canvas — full screen */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Overlay UI */}
      <div className="absolute top-8 left-8 flex flex-col gap-2">
        <div className="flex items-center gap-3 bg-black/40 border border-white/10 backdrop-blur-md px-4 py-2 rounded-2xl">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
            {isConnected ? 'Laboratorio Conectado' : 'Reconectando Enlace...'}
          </span>
        </div>
      </div>

      {/* Título Central */}
      <div className="absolute top-12 text-center pointer-events-none">
        <h1 className="text-2xl font-black text-white tracking-tighter uppercase italic">
          Hive<span className="text-amber-500">Learn</span> Lab
        </h1>
        <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.3em]">
          Generando programa de formación adaptativo
        </p>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[#0a0e27] flex items-center justify-center z-50">
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
