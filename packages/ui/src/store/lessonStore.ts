import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StudentProfile, LessonProgram, NodoLesson, SwarmProgress, FeedbackOutput, AgentStatus, CoordinatorState, SwarmTimelineEvent } from '@hivelearn/core'

export type Screen =
  | 'landing'
  | 'dashboard'
  | 'provider-select'
  | 'sessions'
  | 'chat-onboarding'
  | 'loading'
  | 'lesson'
  | 'evaluation'
  | 'result'
  | 'how-to-use'
  | 'config'

export interface XpFloat {
  nodeId: string
  xp: number
  key: number
}

interface AgentRuntimeState {
  status: AgentStatus
  label: string | null
  summary: string | null
  updatedAt: number | null
}

interface LessonState {
  // Navegación
  screen: Screen

  // Provider y modelo seleccionados
  selectedProviderId: string | null
  selectedModelId: string | null

  // Sesión
  sessionId: string | null
  curriculoId: number | null
  isGenerating: boolean
  sessionRestored: boolean

  // Datos del alumno
  perfil: StudentProfile | null
  meta: string

  // Programa generado
  program: LessonProgram | null

  // Progreso del enjambre
  swarmProgress: SwarmProgress | null
  agentStatuses: Record<string, AgentStatus>
  agentRuntime: Record<string, AgentRuntimeState>
  swarmTimeline: SwarmTimelineEvent[]

  // Estado del coordinador
  coordinatorState: CoordinatorState

  // Estado de la sesión
  nodoActualId: string | null
  selectedNodeId: string | null   // nodo seleccionado en el grafo (panel lateral)
  xpTotal: number
  logrosDesbloqueados: string[]
  nodosCompletados: string[]
  tiempoInicioSesion: number | null

  // Gamificación activa
  vidas: number
  racha: number
  xpFloat: XpFloat | null

  // Evaluación
  respuestasEvaluacion: Record<number, string | number>
  puntajeEvaluacion: number | null

  // Feedback del nodo actual
  lastFeedback: FeedbackOutput | null

  // Onboarding chat
  onboardingSessionId: string | null
  onboardingCompleted: boolean

  // Restauración desde BD
  sessionPausedAt: string | null

  // Acciones base
  setScreen: (screen: Screen) => void
  setSelectedProvider: (providerId: string) => void
  setSelectedModel: (modelId: string | null) => void
  setPerfil: (perfil: StudentProfile) => void
  setMeta: (meta: string) => void
  setProgram: (program: LessonProgram) => void
  setSwarmProgress: (progress: SwarmProgress) => void
  setAgentStatus: (agentId: string, status: AgentStatus) => void
  setCoordinatorStatus: (status: CoordinatorState['status'], currentWorker?: string | null) => void
  ingestSwarmEvent: (event: SwarmTimelineEvent) => void
  resetSwarmVisualization: () => void
  setSessionId: (sessionId: string) => void
  setCurriculoId: (curriculoId: number) => void
  setIsGenerating: (isGenerating: boolean) => void
  completarNodo: (nodoId: string, xpGanado: number) => void
  desbloquearLogro: (logroId: string) => void
  setNodoActual: (nodoId: string) => void
  setLastFeedback: (feedback: FeedbackOutput | null) => void
  responderEvaluacion: (idx: number, respuesta: string | number) => void
  setPuntajeEvaluacion: (puntaje: number) => void
  restoreSession: (program: LessonProgram, sessionData: {
    sessionId: string
    xpTotal: number
    nodosCompletados?: string[]
    lastNodeId?: string | null
    sessionStateJson?: string | null
    paused_at?: string | null
  }) => void
  setOnboardingSessionId: (id: string) => void
  completeOnboarding: () => void
  reset: () => void

  // Acciones de panel lateral
  selectNode: (nodeId: string) => void
  deselectNode: () => void

  // Acciones de gamificación
  perderVida: () => void
  incrementarRacha: () => void
  resetRacha: () => void
  showXpFloat: (nodeId: string, xp: number) => void
}

const initialState = {
  screen: 'sessions' as Screen,
  perfil: null,
  meta: '',
  program: null,
  swarmProgress: null,
  agentStatuses: {},
  agentRuntime: {},
  swarmTimeline: [],
  coordinatorState: {
    status: 'idle' as CoordinatorState['status'],
    currentWorker: null,
    activeWorkers: [],
    totalWorkers: 15,
  },
  selectedProviderId: null,
  selectedModelId: null,
  sessionId: null,
  curriculoId: null,
  isGenerating: false,
  sessionRestored: false,
  nodoActualId: null,
  selectedNodeId: null,
  xpTotal: 0,
  logrosDesbloqueados: [],
  nodosCompletados: [],
  tiempoInicioSesion: null,
  vidas: 3,
  racha: 0,
  xpFloat: null,
  respuestasEvaluacion: {},
  puntajeEvaluacion: null,
  lastFeedback: null,
  onboardingSessionId: null,
  onboardingCompleted: false,
  sessionPausedAt: null,
}

let xpFloatKey = 0

export const useLessonStore = create<LessonState>()(persist((set, get) => ({
  ...initialState,

  setScreen: (screen) => set({ screen }),
  setSelectedProvider: (selectedProviderId) => set({ selectedProviderId }),
  setSelectedModel: (selectedModelId) => set({ selectedModelId }),
  setPerfil: (perfil) => set({ perfil }),
  setMeta: (meta) => set({ meta }),
  setProgram: (program) => set({
    program,
    tiempoInicioSesion: Date.now(),
    nodoActualId: program.nodos[0]?.id ?? null,
  }),
  setSwarmProgress: (swarmProgress) => set({ swarmProgress }),
  setAgentStatus: (agentId, status) => set((s) => ({
    agentStatuses: { ...s.agentStatuses, [agentId]: status },
    agentRuntime: {
      ...s.agentRuntime,
      [agentId]: {
        status,
        label: s.agentRuntime[agentId]?.label ?? null,
        summary: s.agentRuntime[agentId]?.summary ?? null,
        updatedAt: Date.now(),
      },
    },
    coordinatorState: {
      ...s.coordinatorState,
      activeWorkers: Object.entries({ ...s.agentStatuses, [agentId]: status })
        .filter(([, st]) => st === 'running' || st === 'thinking' || st === 'tool_call')
        .map(([id]) => id),
    },
  })),
  setCoordinatorStatus: (status, currentWorker) => set((s) => ({
    coordinatorState: {
      ...s.coordinatorState,
      status,
      currentWorker: currentWorker ?? s.coordinatorState.currentWorker,
    },
  })),
  ingestSwarmEvent: (event) => set((s) => {
    const nextTimeline = [...s.swarmTimeline, event].slice(-200)
    const nextAgentStatuses = { ...s.agentStatuses }
    const nextAgentRuntime = { ...s.agentRuntime }
    const nextCoordinator = { ...s.coordinatorState }

    if (event.agentId) {
      const agentStatus = event.status as AgentStatus
      if (['idle', 'pending', 'running', 'thinking', 'tool_call', 'completed', 'failed'].includes(agentStatus)) {
        nextAgentStatuses[event.agentId] = agentStatus
        nextAgentRuntime[event.agentId] = {
          status: agentStatus,
          label: event.label ?? null,
          summary: event.summary ?? null,
          updatedAt: event.timestamp,
        }
      }
    }

    if (event.kind === 'worker_dispatched' && event.agentId) {
      nextCoordinator.currentWorker = event.agentId
      nextCoordinator.status = 'delegating'
    } else if (event.kind === 'worker_result_received') {
      nextCoordinator.status = 'assembling'
      nextCoordinator.currentWorker = event.agentId ?? null
    } else if (event.kind === 'program_review_started') {
      nextCoordinator.status = 'rendering'
      nextCoordinator.currentWorker = null
    } else if (event.kind === 'program_review_completed' || event.kind === 'swarm_completed') {
      nextCoordinator.status = event.status === 'failed' ? 'error' : 'completed'
      nextCoordinator.currentWorker = null
    } else if (event.kind === 'node_repair_started') {
      nextCoordinator.status = 'assembling'
      nextCoordinator.currentWorker = null
    } else if (event.kind === 'coordinator_phase_changed') {
      nextCoordinator.status = event.status as CoordinatorState['status']
      nextCoordinator.currentWorker = event.agentId ?? nextCoordinator.currentWorker
    } else if (event.kind === 'swarm_started') {
      nextCoordinator.status = 'delegating'
      nextCoordinator.currentWorker = null
    } else if (event.kind === 'swarm_progress' && event.phase === 'init') {
      nextCoordinator.status = 'analyzing'
    }

    nextCoordinator.activeWorkers = Object.entries(nextAgentStatuses)
      .filter(([, st]) => st === 'running' || st === 'thinking' || st === 'tool_call')
      .map(([id]) => id)

    return {
      swarmTimeline: nextTimeline,
      agentStatuses: nextAgentStatuses,
      agentRuntime: nextAgentRuntime,
      coordinatorState: nextCoordinator,
    }
  }),
  resetSwarmVisualization: () => set({
    swarmTimeline: [],
    agentStatuses: {},
    agentRuntime: {},
    coordinatorState: {
      status: 'idle',
      currentWorker: null,
      activeWorkers: [],
      totalWorkers: initialState.coordinatorState.totalWorkers,
    },
  }),
  setSessionId: (sessionId) => set({ sessionId }),
  setCurriculoId: (curriculoId) => set({ curriculoId }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  completarNodo: (nodoId, xpGanado) => set((s) => {
    const nodos = s.program?.nodos ?? []
    const idx = nodos.findIndex((n: NodoLesson) => n.id === nodoId)
    const nextId = idx >= 0 && idx < nodos.length - 1 ? nodos[idx + 1].id : null
    return {
      nodosCompletados: [...s.nodosCompletados, nodoId],
      xpTotal: s.xpTotal + xpGanado,
      nodoActualId: nextId ?? s.nodoActualId,
      program: s.program ? {
        ...s.program,
        nodos: s.program.nodos.map((n: NodoLesson, i: number) => {
          if (n.id === nodoId) return { ...n, estado: 'completado' as const }
          if (i === idx + 1) return { ...n, estado: 'disponible' as const }
          return n
        }),
      } : null,
    }
  }),
  desbloquearLogro: (logroId) => set((s) => ({
    logrosDesbloqueados: s.logrosDesbloqueados.includes(logroId)
      ? s.logrosDesbloqueados
      : [...s.logrosDesbloqueados, logroId],
  })),
  setNodoActual: (nodoId) => set({ nodoActualId: nodoId }),
  setLastFeedback: (lastFeedback) => set({ lastFeedback }),
  responderEvaluacion: (idx, respuesta) => set((s) => ({
    respuestasEvaluacion: { ...s.respuestasEvaluacion, [idx]: respuesta },
  })),
  setPuntajeEvaluacion: (puntajeEvaluacion) => set({ puntajeEvaluacion }),
  restoreSession: (program, sessionData) => {
    let parsedState: Partial<typeof initialState> = {}
    if (sessionData.sessionStateJson) {
      try { parsedState = JSON.parse(sessionData.sessionStateJson) } catch { }
    }
    set({
      program,
      sessionId: sessionData.sessionId,
      xpTotal: parsedState.xpTotal ?? sessionData.xpTotal,
      nodosCompletados: parsedState.nodosCompletados ?? sessionData.nodosCompletados ?? [],
      vidas: parsedState.vidas ?? 3,
      racha: parsedState.racha ?? 0,
      logrosDesbloqueados: parsedState.logrosDesbloqueados ?? [],
      tiempoInicioSesion: Date.now(),
      nodoActualId: sessionData.lastNodeId ?? program.nodos[0]?.id ?? null,
      sessionRestored: true,
      sessionPausedAt: sessionData.paused_at ?? null,
      screen: 'lesson',
    })
  },
  setOnboardingSessionId: (onboardingSessionId) => set({ onboardingSessionId }),
  completeOnboarding: () => set({ onboardingCompleted: true }),
  reset: () => set((s) => ({
    ...initialState,
    selectedProviderId: s.selectedProviderId,
    selectedModelId: s.selectedModelId,
  })),

  // Panel lateral
  selectNode: (nodeId) => set({ selectedNodeId: nodeId, lastFeedback: null }),
  deselectNode: () => set({ selectedNodeId: null, lastFeedback: null }),

  // Gamificación
  perderVida: () => set((s) => ({ vidas: Math.max(0, s.vidas - 1) })),
  incrementarRacha: () => set((s) => ({ racha: s.racha + 1 })),
  resetRacha: () => set({ racha: 0 }),
  showXpFloat: (nodeId, xp) => {
    const key = ++xpFloatKey
    set({ xpFloat: { nodeId, xp, key } })
    setTimeout(() => {
      if (get().xpFloat?.key === key) set({ xpFloat: null })
    }, 1400)
  },
}), {
  name: 'hivelearn-session-v1',
  storage: createJSONStorage(() => localStorage),
  // Solo persistir los campos necesarios para restaurar la sesión
  partialize: (state) => ({
    screen: (state.screen === 'lesson' || state.screen === 'loading') ? 'sessions' : state.screen,
    program: state.program,
    sessionId: state.sessionId,
    curriculoId: state.curriculoId,
    perfil: state.perfil,
    meta: state.meta,
    xpTotal: state.xpTotal,
    nodosCompletados: state.nodosCompletados,
    nodoActualId: state.nodoActualId,
    selectedProviderId: state.selectedProviderId,
    selectedModelId: state.selectedModelId,
    vidas: state.vidas,
    racha: state.racha,
    logrosDesbloqueados: state.logrosDesbloqueados,
    swarmProgress: state.swarmProgress,
    agentStatuses: state.agentStatuses,
    agentRuntime: state.agentRuntime,
    swarmTimeline: state.swarmTimeline,
  }),
}))
