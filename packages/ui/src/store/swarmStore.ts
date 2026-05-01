/**
 * useSwarmStore — Store para Canvas 1: Visualización del Enjambre
 * 
 * Gestiona el estado de la generación del programa educativo:
 * - Estado del coordinador y los 16 agentes workers
 * - Progreso de generación del enjambre
 * - Animaciones de delegación
 */

import { create } from 'zustand'
import type { AgentStatus, CoordinatorState, CoordinatorStatus, SwarmProgress } from '@hivelearn/core'

interface SwarmState {
  /** Estado del coordinador */
  coordinatorState: CoordinatorState
  
  /** Estados individuales de los agentes */
  agentStatuses: Record<string, AgentStatus>
  
  /** Progreso actual del enjambre */
  swarmProgress: SwarmProgress | null
  
  /** Agentes activos actualmente */
  activeAgents: string[]
  
  /** Total de agentes en el enjambre */
  totalAgents: number
  
  /** Mensaje de estado actual */
  statusMessage: string
  
  /** Porcentaje de progreso (0-100) */
  progress: number
  
  /** Generación completada */
  generationComplete: boolean
}

interface SwarmStore extends SwarmState {
  // Acciones
  setCoordinatorStatus: (status: CoordinatorStatus, currentWorker?: string | null) => void
  setAgentStatus: (agentId: string, status: AgentStatus) => void
  setSwarmProgress: (progress: SwarmProgress) => void
  setProgress: (progress: number) => void
  setStatusMessage: (message: string) => void
  setGenerationComplete: (complete: boolean) => void
  reset: () => void
}

const initialCoordinatorState: CoordinatorState = {
  status: 'idle',
  currentWorker: null,
  activeWorkers: [],
  totalWorkers: 16,
}

const initialState: SwarmState = {
  coordinatorState: initialCoordinatorState,
  agentStatuses: {},
  swarmProgress: null,
  activeAgents: [],
  totalAgents: 16,
  statusMessage: 'Esperando...',
  progress: 0,
  generationComplete: false,
}

export const useSwarmStore = create<SwarmStore>((set) => ({
  ...initialState,

  setCoordinatorStatus: (status, currentWorker) => set((state) => {
    const activeWorkers = Object.entries(state.agentStatuses)
      .filter(([, st]) => st === 'running' || st === 'thinking' || st === 'tool_call')
      .map(([id]) => id)

    return {
      coordinatorState: {
        ...state.coordinatorState,
        status,
        currentWorker: currentWorker ?? state.coordinatorState.currentWorker,
        activeWorkers,
      },
    }
  }),

  setAgentStatus: (agentId, status) => set((state) => {
    const newAgentStatuses = { ...state.agentStatuses, [agentId]: status }
    
    const activeWorkers = Object.entries(newAgentStatuses)
      .filter(([, st]) => st === 'running' || st === 'thinking' || st === 'tool_call')
      .map(([id]) => id)

    // Actualizar progreso basado en agentes completados
    const completedCount = Object.values(newAgentStatuses).filter(s => s === 'completed').length
    const newProgress = Math.round((completedCount / state.totalAgents) * 100)

    return {
      agentStatuses: newAgentStatuses,
      activeAgents: activeWorkers,
      coordinatorState: {
        ...state.coordinatorState,
        activeWorkers,
      },
      progress: status === 'completed' ? newProgress : state.progress,
    }
  }),

  setSwarmProgress: (swarmProgress) => set({ 
    swarmProgress,
    statusMessage: swarmProgress.mensaje,
    progress: swarmProgress.porcentaje,
  }),

  setProgress: (progress) => set({ progress }),

  setStatusMessage: (statusMessage) => set({ statusMessage }),

  setGenerationComplete: (generationComplete) => set((state) => ({ 
    generationComplete,
    progress: generationComplete ? 100 : state.progress,
    coordinatorState: {
      ...state.coordinatorState,
      status: generationComplete ? 'completed' : state.coordinatorState.status,
    },
  })),

  reset: () => set(initialState),
}))
