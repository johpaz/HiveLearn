import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StudentProfile, LessonProgram, SwarmProgress, AgentStatus, CoordinatorState } from '@hivelearn/core'
import type { MundoLogro } from '@hivelearn/core'
import type {
  AvatarCustomization,
  AvatarDirection,
  AvatarAnimation,
  AvatarState,
  BeeState,
  DialogBubble,
  IsoCameraState,
  IsoMap,
  Tributary,
  LoginPhase,
  OnboardingStep,
  OnboardingChatState,
  SwarmProgressWorld,
  PortalState,
  PortalPhase,
  RioMundoState as State,
} from '../canvaslearn/rio/types'
import { RIO_NIVELES, DEFAULT_AVATAR, ISO_CONFIG } from '../canvaslearn/rio/types'

// ─── Level helpers ───────────────────────────────────────────────────────────

function obtenerNivel(xp: number) {
  for (let i = RIO_NIVELES.length - 1; i >= 0; i--) {
    if (xp >= RIO_NIVELES[i].xp_requerida) return RIO_NIVELES[i]
  }
  return RIO_NIVELES[0]
}

function calcularProgresoNivel(xp: number, nivelActual: number): number {
  const nivelInfo = RIO_NIVELES.find(n => n.nivel === nivelActual)
  const siguienteNivel = RIO_NIVELES.find(n => n.nivel === nivelActual + 1)
  if (!nivelInfo || !siguienteNivel) return 100
  const xpEnNivel = xp - nivelInfo.xp_requerida
  const xpParaSiguiente = siguienteNivel.xp_requerida - nivelInfo.xp_requerida
  return Math.min(100, Math.round((xpEnNivel / xpParaSiguiente) * 100))
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialJugador: AvatarState = {
  x: ISO_CONFIG.SPAWN_X,
  y: ISO_CONFIG.SPAWN_Y,
  direction: 'n',
  animation: 'idle',
  speed: ISO_CONFIG.PLAYER_SPEED,
  custom: { ...DEFAULT_AVATAR },
}

const initialCamara: IsoCameraState = {
  x: 0,
  y: 0,
  zoom: 1,
  targetX: 0,
  targetY: 0,
  targetZoom: 1,
  smoothing: ISO_CONFIG.CAMERA_SMOOTHING,
  bounds: { minX: -2000, minY: -1000, maxX: 2000, maxY: 1000 },
}

const initialOnboarding: OnboardingChatState = {
  step: 'nombre',
  nombre: '',
  edad: null,
  tema: '',
  objetivo: '',
  estilo: '',
  messages: [],
  isTyping: false,
}

const initialSwarmProgress: SwarmProgressWorld = {
  isGenerating: false,
  currentAgentId: null,
  currentAgentName: null,
  completedAgents: [],
  totalAgents: 15,
  percentComplete: 0,
  lastCompletedZone: null,
}

const initialState: State = {
  alumnoId: null,
  nickname: null,
  perfil: null,
  avatar: { ...DEFAULT_AVATAR },
  instanceId: null,

  sessionId: null,
  programaUuid: null,
  programa: null,
  tema: null,
  meta: '',

  loginPhase: 'nickname_input',

  onboarding: { ...initialOnboarding },

  selectedProviderId: null,
  selectedModelId: null,

  mundoListo: false,
  bienvenidaMostrada: false,
  sesionPausada: false,

  mapa: null,
  tributaries: [],
  zonaActual: 0,

  jugador: { ...initialJugador },
  camara: { ...initialCamara },

  xpTotal: 0,
  xpSesion: 0,
  nivelActual: 1,
  progresoNivel: 0,

  vidas: 3,
  racha: 0,
  mejorRacha: 0,

  logros: [],
  coleccionables: [],

  modulosCompletados: [],
  respuestas: {},

  beeState: 'following' as BeeState,
  dialogBubbles: [],

  portal: {
    phase: 'closed' as PortalPhase,
    zonaNumero: null,
    moduloUuid: null,
    zoomTarget: 1,
    a2uiMessages: [],
  },

  swarmProgress: { ...initialSwarmProgress },
  agentStatuses: {},
  coordinatorState: {
    status: 'idle' as CoordinatorState['status'],
    currentWorker: null,
    activeWorkers: [],
    totalWorkers: 15,
  },

  xpFloat: null,
  nivelUpActivo: false,
  logroActivo: null,
  isGenerating: false,

  tiempoInicioSesion: null,
  tiempoSesion: 0,
}

// ─── Store interface ──────────────────────────────────────────────────────────

export interface RioMundoStore extends State {
  // ─── Identity ───────────────────────────────────────────────────────────────
  setAlumnoId: (id: string) => void
  setNickname: (nickname: string) => void
  setPerfil: (perfil: StudentProfile) => void
  setAvatar: (custom: Partial<AvatarCustomization>) => void
  setInstanceId: (id: string) => void
  setLoginPhase: (phase: LoginPhase) => void

  // ─── Session ─────────────────────────────────────────────────────────────────
  setSessionId: (id: string) => void
  setProgramaUuid: (uuid: string) => void
  setPrograma: (program: LessonProgram) => void
  setMeta: (meta: string) => void
  setTema: (tema: string) => void
  setProvider: (providerId: string, modelId: string | null) => void

  // ─── Onboarding ──────────────────────────────────────────────────────────────
  setOnboardingStep: (step: OnboardingStep) => void
  addOnboardingMessage: (role: 'bee' | 'student', text: string) => void
  setOnboardingTyping: (isTyping: boolean) => void
  updateOnboarding: (data: Partial<OnboardingChatState>) => void
  completeOnboarding: () => void

  // ─── World ────────────────────────────────────────────────────────────────────
  setMundoListo: (listo: boolean) => void
  setBienvenidaMostrada: (mostrada: boolean) => void
  setMapa: (mapa: IsoMap) => void
  pausarSesion: () => void
  reanudarSesion: () => void

  // ─── Tributaries (zones) ─────────────────────────────────────────────────────
  setTributaryEstado: (zoneNumero: number, estado: Tributary['estado']) => void
  desbloquearZona: (zoneNumero: number, datos: Partial<Tributary>) => void
  completarZona: (zoneNumero: number) => void
  setZonaActual: (zonaNumero: number) => void

  // ─── Player ───────────────────────────────────────────────────────────────────
  setJugadorPosicion: (x: number, y: number) => void
  setJugadorDireccion: (direction: AvatarDirection) => void
  setJugadorAnimacion: (animation: AvatarAnimation) => void
  setJugadorVelocidad: (speed: number) => void

  // ─── Camera ──────────────────────────────────────────────────────────────────
  setCamaraTarget: (x: number, y: number) => void
  setCamaraZoom: (zoom: number) => void

  // ─── XP & Level ──────────────────────────────────────────────────────────────
  agregarXP: (xp: number, isoX?: number, isoY?: number) => void
  showXpFloat: (xp: number, isoX: number, isoY: number) => void
  hideXpFloat: () => void
  showNivelUp: () => void
  hideNivelUp: () => void

  // ─── Lives & Streak ───────────────────────────────────────────────────────────
  perderVida: () => void
  incrementarRacha: () => void
  resetRacha: () => void

  // ─── Achievements ─────────────────────────────────────────────────────────────
  desbloquearLogro: (logro: MundoLogro['datos']) => void
  obtenerColeccionable: (id: string) => void
  showLogro: (logro: MundoLogro['datos']) => void
  hideLogro: () => void

  // ─── Modules ──────────────────────────────────────────────────────────────────
  completarModulo: (moduloUuid: string, xpGanada: number, correcta: boolean) => void
  guardarRespuesta: (moduloUuid: string, intento: number, correcta: boolean, xpGanada: number) => void
  setModuloActual: (moduloId: string | null) => void

  // ─── Bee ──────────────────────────────────────────────────────────────────────
  setBeeState: (state: BeeState) => void
  addDialogBubble: (bubble: DialogBubble) => void
  removeDialogBubble: (id: string) => void
  clearDialogBubbles: () => void

  // ─── Portal ────────────────────────────────────────────────────────────────────
  openPortal: (zonaNumero: number, moduloUuid: string, zoomTarget?: number) => void
  setPortalMessages: (messages: any[]) => void
  closePortal: () => void
  setPortalPhase: (phase: PortalPhase) => void

  // ─── Swarm ─────────────────────────────────────────────────────────────────────
  setSwarmProgress: (progress: SwarmProgress) => void
  setAgentStatus: (agentId: string, status: AgentStatus) => void
  setCoordinatorStatus: (status: CoordinatorState['status'], currentWorker?: string | null) => void
  setIsGenerating: (isGenerating: boolean) => void

  // ─── Restore ──────────────────────────────────────────────────────────────────
  restoreSession: (data: Partial<State>) => void
  reset: () => void
  resetCompleto: () => void
}

let xpFloatKey = 0

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRioMundoStore = create<RioMundoStore>()(persist((set, get) => ({
  ...initialState,

  // ─── Identity ────────────────────────────────────────────────────────────────

  setAlumnoId: (alumnoId) => set({ alumnoId }),
  setNickname: (nickname) => set({ nickname }),
  setPerfil: (perfil) => set({ perfil }),
  setAvatar: (custom) => set((s) => ({
    avatar: { ...s.avatar, ...custom },
    jugador: { ...s.jugador, custom: { ...s.jugador.custom, ...custom } },
  })),
  setInstanceId: (instanceId) => set({ instanceId }),
  setLoginPhase: (loginPhase) => set({ loginPhase }),

  // ─── Session ──────────────────────────────────────────────────────────────────

  setSessionId: (sessionId) => set({ sessionId }),
  setProgramaUuid: (programaUuid) => set({ programaUuid }),
  setPrograma: (programa) => set({
    programa,
    tiempoInicioSesion: Date.now(),
  }),
  setMeta: (meta) => set({ meta }),
  setTema: (tema) => set({ tema }),
  setProvider: (selectedProviderId, selectedModelId) => set({ selectedProviderId, selectedModelId }),

  // ─── Onboarding ───────────────────────────────────────────────────────────────

  setOnboardingStep: (step) => set((s) => ({ onboarding: { ...s.onboarding, step } })),
  addOnboardingMessage: (role, text) => set((s) => ({
    onboarding: { ...s.onboarding, messages: [...s.onboarding.messages, { role, text }] },
  })),
  setOnboardingTyping: (isTyping) => set((s) => ({
    onboarding: { ...s.onboarding, isTyping },
  })),
  updateOnboarding: (data) => set((s) => ({
    onboarding: { ...s.onboarding, ...data },
  })),
  completeOnboarding: () => set({ loginPhase: 'entering_world' }),

  // ─── World ─────────────────────────────────────────────────────────────────────

  setMundoListo: (mundoListo) => set({ mundoListo }),
  setBienvenidaMostrada: (bienvenidaMostrada) => set({ bienvenidaMostrada }),
  setMapa: (mapa) => set({ mapa, tributaries: mapa.tributaries }),
  pausarSesion: () => set({ sesionPausada: true }),
  reanudarSesion: () => set({ sesionPausada: false }),

  // ─── Tributaries (zones) ──────────────────────────────────────────────────────

  setTributaryEstado: (zoneNumero, estado) => set((s) => ({
    tributaries: s.tributaries.map(t =>
      t.zoneNumero === zoneNumero ? { ...t, estado } : t
    ),
  })),
  desbloquearZona: (zoneNumero, datos) => set((s) => {
    const existing = s.tributaries.find(t => t.zoneNumero === zoneNumero)
    if (existing) {
      return {
        tributaries: s.tributaries.map(t =>
          t.zoneNumero === zoneNumero ? { ...t, ...datos, estado: 'fluyendo' as const } : t
        ),
      }
    }
    return {
      tributaries: [...s.tributaries, { id: zoneNumero, zoneNumero, name: '', tipoPedagogico: '', xpRecompensa: 0, estado: 'fluyendo' as const, path: [], branchPoint: { x: 0, y: 0 }, portalPos: { x: 0, y: 0 }, ...datos }],
    }
  }),
  completarZona: (zoneNumero) => set((s) => ({
    tributaries: s.tributaries.map(t =>
      t.zoneNumero === zoneNumero ? { ...t, estado: 'completado' as const } : t
    ),
  })),
  setZonaActual: (zonaActual) => set({ zonaActual }),

  // ─── Player ────────────────────────────────────────────────────────────────────

  setJugadorPosicion: (x, y) => set((s) => ({
    jugador: { ...s.jugador, x, y },
  })),
  setJugadorDireccion: (direction) => set((s) => ({
    jugador: { ...s.jugador, direction },
  })),
  setJugadorAnimacion: (animation) => set((s) => ({
    jugador: { ...s.jugador, animation, speed: animation === 'correr' ? ISO_CONFIG.PLAYER_RUN_SPEED : ISO_CONFIG.PLAYER_SPEED },
  })),
  setJugadorVelocidad: (speed) => set((s) => ({
    jugador: { ...s.jugador, speed },
  })),

  // ─── Camera ────────────────────────────────────────────────────────────────────

  setCamaraTarget: (x, y) => set((s) => ({
    camara: { ...s.camara, targetX: x, targetY: y },
  })),
  setCamaraZoom: (zoom) => set((s) => ({
    camara: { ...s.camara, targetZoom: Math.max(ISO_CONFIG.CAMERA_MIN_ZOOM, Math.min(ISO_CONFIG.CAMERA_MAX_ZOOM, zoom)) },
  })),

  // ─── XP & Level ────────────────────────────────────────────────────────────────

  agregarXP: (xp, isoX, isoY) => set((s) => {
    const nuevoXP = s.xpTotal + xp
    const nuevoNivel = obtenerNivel(nuevoXP)
    const subioDeNivel = nuevoNivel.nivel > s.nivelActual
    const newState: Partial<State> = {
      xpTotal: nuevoXP,
      xpSesion: s.xpSesion + xp,
      nivelActual: nuevoNivel.nivel,
      progresoNivel: calcularProgresoNivel(nuevoXP, nuevoNivel.nivel),
      nivelUpActivo: subioDeNivel ? true : s.nivelUpActivo,
    }
    return newState
  }),

  showXpFloat: (xp, isoX, isoY) => {
    const key = ++xpFloatKey
    set({ xpFloat: { id: `xp-${key}`, isoX, isoY, xp, key } })
    setTimeout(() => {
      if (get().xpFloat?.key === key) set({ xpFloat: null })
    }, 1400)
  },

  hideXpFloat: () => set({ xpFloat: null }),
  showNivelUp: () => set({ nivelUpActivo: true }),
  hideNivelUp: () => set({ nivelUpActivo: false }),

  // ─── Lives & Streak ───────────────────────────────────────────────────────────

  perderVida: () => set((s) => ({
    vidas: Math.max(0, s.vidas - 1),
    racha: 0,
  })),
  incrementarRacha: () => set((s) => ({
    racha: s.racha + 1,
    mejorRacha: Math.max(s.mejorRacha, s.racha + 1),
  })),
  resetRacha: () => set({ racha: 0 }),

  // ─── Achievements ─────────────────────────────────────────────────────────────

  desbloquearLogro: (logro) => set((s) => {
    const yaDesbloqueado = s.logros.some(l => l.nombre === logro.nombre)
    if (yaDesbloqueado) return s
    return {
      logros: [...s.logros, logro],
      logroActivo: logro,
      xpTotal: s.xpTotal + logro.xp_bonus,
    }
  }),
  obtenerColeccionable: (id) => set((s) => ({
    coleccionables: [...s.coleccionables, id],
  })),
  showLogro: (logro) => set({ logroActivo: logro }),
  hideLogro: () => set({ logroActivo: null }),

  // ─── Modules ──────────────────────────────────────────────────────────────────

  completarModulo: (moduloUuid, xpGanada, correcta) => set((s) => {
    const rachaIncrementada = correcta ? s.racha + 1 : 0
    return {
      modulosCompletados: [...s.modulosCompletados, moduloUuid],
      racha: rachaIncrementada,
      mejorRacha: Math.max(s.mejorRacha, rachaIncrementada),
    }
  }),
  guardarRespuesta: (moduloUuid, intento, correcta, xpGanada) => set((s) => ({
    respuestas: {
      ...s.respuestas,
      [moduloUuid]: { intento, correcta, xp_ganada: xpGanada, timestamp: Date.now() },
    },
  })),
  setModuloActual: () => {},

  // ─── Bee ───────────────────────────────────────────────────────────────────────

  setBeeState: (beeState) => set({ beeState }),
  addDialogBubble: (bubble) => set((s) => ({
    dialogBubbles: [...s.dialogBubbles, bubble],
  })),
  removeDialogBubble: (id) => set((s) => ({
    dialogBubbles: s.dialogBubbles.filter(b => b.id !== id),
  })),
  clearDialogBubbles: () => set({ dialogBubbles: [] }),

  // ─── Portal ────────────────────────────────────────────────────────────────────

  openPortal: (zonaNumero, moduloUuid, zoomTarget = 2) => set((s) => ({
    portal: {
      ...s.portal,
      phase: 'entering',
      zonaNumero,
      moduloUuid,
      zoomTarget,
    },
  })),

  setPortalMessages: (messages) => set((s) => ({
    portal: { ...s.portal, a2uiMessages: messages },
  })),

  closePortal: () => set((s) => ({
    portal: {
      ...s.portal,
      phase: 'exiting',
    },
  })),

  setPortalPhase: (phase) => set((s) => ({
    portal: { ...s.portal, phase },
  })),

  // ─── Swarm ─────────────────────────────────────────────────────────────────────

  setSwarmProgress: (progress) => set((s) => ({
    swarmProgress: {
      ...s.swarmProgress,
      isGenerating: progress.etapa !== 'completado',
      percentComplete: progress.porcentaje ?? s.swarmProgress.percentComplete,
      currentAgentId: progress.agenteActivo ?? s.swarmProgress.currentAgentId,
      currentAgentName: progress.mensaje ?? s.swarmProgress.currentAgentName,
    },
    isGenerating: progress.etapa !== 'completado',
  })),
  setAgentStatus: (agentId, status) => set((s) => ({
    agentStatuses: { ...s.agentStatuses, [agentId]: status },
  })),
  setCoordinatorStatus: (status, currentWorker) => set((s) => ({
    coordinatorState: {
      ...s.coordinatorState,
      status,
      currentWorker: currentWorker ?? s.coordinatorState.currentWorker,
    },
  })),
  setIsGenerating: (isGenerating) => set({ isGenerating }),

  // ─── Restore ──────────────────────────────────────────────────────────────────

  restoreSession: (data) => set((s) => ({
    ...s,
    ...data,
    tiempoInicioSesion: Date.now(),
    sesionPausada: false,
  })),

  reset: () => set((s) => ({
    ...initialState,
    selectedProviderId: s.selectedProviderId,
    selectedModelId: s.selectedModelId,
    instanceId: s.instanceId,
  })),

  resetCompleto: () => set(initialState),

}), {
  name: 'hivelearn-rio-v1',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    alumnoId: state.alumnoId,
    nickname: state.nickname,
    perfil: state.perfil,
    avatar: state.avatar,
    instanceId: state.instanceId,
    sessionId: state.sessionId,
    programaUuid: state.programaUuid,
    programa: state.programa,
    tema: state.tema,
    meta: state.meta,
    xpTotal: state.xpTotal,
    nivelActual: state.nivelActual,
    vidas: state.vidas,
    racha: state.racha,
    mejorRacha: state.mejorRacha,
    logros: state.logros,
    coleccionables: state.coleccionables,
    modulosCompletados: state.modulosCompletados,
    tributaries: state.tributaries,
    zonaActual: state.zonaActual,
    portal: state.portal,
    selectedProviderId: state.selectedProviderId,
    selectedModelId: state.selectedModelId,
    onboarding: {
      ...state.onboarding,
      isTyping: false,
    },
  }),
}))