import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StudentProfile, LessonProgram, NodoLesson, SwarmProgress, FeedbackOutput, AgentStatus, CoordinatorState } from '@hivelearn/core'
import { apiClient } from '@/lib/api'

// Función para obtener/generar instanceId único
export async function getInstanceId(): Promise<string> {
  const state = useLessonStore.getState()
  
  // Si ya existe en el store, validar que sigue registrado en el server
  if (state.instanceId) {
    try {
      const check = await apiClient<{ configured: boolean }>(
        `/api/hivelearn/instance?instanceId=${state.instanceId}`,
        { showError: false }
      )
      if (check.configured) return state.instanceId
    } catch {
      // ID stale o server sin esa instancia — continuar a generar uno nuevo
    }
    useLessonStore.getState().setInstanceId('')
  }
  
  try {
    // Intentar obtener del server
    const data = await apiClient<{ 
      configured: boolean
      instanceId?: string
    }>('/api/hivelearn/instance?instanceId=local', { showError: false })
    
    if (data.configured && data.instanceId) {
      useLessonStore.getState().setInstanceId(data.instanceId)
      return data.instanceId
    }
  } catch {
    // Si falla, continuamos para generar uno nuevo
  }
  
  // Generar nuevo UUID
  const newInstanceId = typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : `instance-${Date.now()}-${Math.random().toString(36).slice(2)}`
  
  // Registrar en el server
  try {
    await apiClient('/api/hivelearn/instance', {
      method: 'POST',
      body: { instanceId: newInstanceId },
      showError: false,
    })
  } catch {
    // Si falla el registro, igual usamos el ID localmente
  }
  
  // Guardar en el store
  useLessonStore.getState().setInstanceId(newInstanceId)
  return newInstanceId
}

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

interface LessonState {
  // Navegación
  screen: Screen

  // Instancia única (UUID por instalación)
  instanceId: string | null

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

  // Estado del coordinador
  coordinatorState: CoordinatorState

  // Estado de la sesión
  nodoActualId: string | null
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
  setInstanceId: (instanceId: string) => void
  setScreen: (screen: Screen) => void
  setSelectedProvider: (providerId: string) => void
  setSelectedModel: (modelId: string | null) => void
  setPerfil: (perfil: StudentProfile) => void
  setMeta: (meta: string) => void
  setProgram: (program: LessonProgram) => void
  setSwarmProgress: (progress: SwarmProgress) => void
  setAgentStatus: (agentId: string, status: AgentStatus) => void
  setCoordinatorStatus: (status: CoordinatorState['status'], currentWorker?: string | null) => void
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

  // Acciones de gamificación
  perderVida: () => void
  incrementarRacha: () => void
  resetRacha: () => void
  showXpFloat: (nodeId: string, xp: number) => void
}

const initialState = {
  screen: 'sessions' as Screen,
  instanceId: null,
  perfil: null,
  meta: '',
  program: null,
  swarmProgress: null,
  agentStatuses: {},
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

  setInstanceId: (instanceId) => set({ instanceId }),
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
  }),
}))
