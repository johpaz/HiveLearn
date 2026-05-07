import { create } from 'zustand'
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
  XpMultiplicadores,
  AudioSettings,
  WsStatus,
} from '../canvaslearn/rio/types'
import { RIO_NIVELES, DEFAULT_AVATAR, ISO_CONFIG, DEFAULT_AUDIO_SETTINGS } from '../canvaslearn/rio/types'
import type { AudioManager } from '../canvaslearn/rio/audio/AudioManager'
import { generateRioMundo } from '../canvaslearn/rio/world/RiverGenerator'

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
  totalAgents: 10,
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
  wsConnectionId: null,

  loginPhase: 'title_screen',

  onboarding: { ...initialOnboarding },

  selectedProviderId: null,
  selectedModelId: null,

  audioSettings: { ...DEFAULT_AUDIO_SETTINGS },
  wsStatus: 'disconnected' as WsStatus,
  wsLatencyMs: null,
  sendWsMessage: null,

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
  xpMultiplicadores: { racha: 1, velocidad: 1, esfuerzo: 1 },

  vidas: 3,
  racha: 0,
  mejorRacha: 0,
  hintCount: 0,

  logros: [],
  coleccionables: [],

  modulosCompletados: [],
  respuestas: {},

  beeState: 'following' as BeeState,
  beePosicion: { x: 0, y: 0 },
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
    totalWorkers: 10,
  },

  xpFloat: null,
  nivelUpActivo: false,
  logroActivo: null,
  isGenerating: false,

  // ─── Swarm Tour ──────────────────────────────────────────────────────────────
  tourActivo: false,
  tourStep: 0,
  tourAgentesVisitados: [] as string[],
  tourSkipeado: false,
  tourAgenteActual: null as string | null,
  tourAgentResults: {} as Record<string, { outputSnippet: string; zonas?: number; structureCtx?: string }>,

  loginSearchResult: null,
  ttsAudioQueue: [],

  programaError: null,

  tiempoInicioSesion: null,
  tiempoSesion: 0,

  audioManager: null as AudioManager | null,
  audioReady: false,
  beeLoaderVisible: true,
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
  setSelectedProvider: (providerId: string) => void
  setSelectedModel: (modelId: string | null) => void
  setWsConnectionId: (id: string | null) => void

  // ─── Audio & Connection ────────────────────────────────────────────────────
  setAudioSettings: (settings: Partial<AudioSettings>) => void
  toggleMusicMuted: () => void
  toggleSFXMuted: () => void
  setWsStatus: (status: WsStatus) => void
  setWsLatencyMs: (latency: number | null) => void
  setAudioManager: (am: AudioManager | null) => void
  setAudioReady: (ready: boolean) => void
  setBeeLoaderVisible: (visible: boolean) => void
  setSendWsMessage: (fn: ((msg: { tipo: string; [k: string]: any }) => void) | null) => void

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
  incrementarHint: () => void

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
  setBeePosicion: (x: number, y: number) => void
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

  // ─── Swarm Tour ────────────────────────────────────────────────────────────────
  iniciarTour: () => void
  skipTour: () => void
  setTourStep: (step: number) => void
  marcarAgenteVisitado: (agentId: string) => void
  setTourAgenteActual: (agentId: string | null) => void
  finalizarTour: () => void
  dispatchTourAgentResult: (agentId: string, outputSnippet: string, zonas?: number, structureCtx?: string) => void
  actualizarTributarios: (zonaCount: number) => void

  // ─── Login WS Result ─────────────────────────────────────────────────────────
  setLoginSearchResult: (result: { found: boolean; profile?: StudentProfile } | null) => void

  // ─── TTS ─────────────────────────────────────────────────────────────────────
  enqueueTtsAudio: (audioBase64: string) => void
  shiftTtsAudio: () => { audioBase64: string } | undefined

  // ─── Programa error ──────────────────────────────────────────────────────────
  setProgramaError: (err: { code: string; message: string; detail?: string } | null) => void

  // ─── Restore ──────────────────────────────────────────────────────────────────
  restoreSession: (data: Partial<State>) => void
  reset: () => void
  resetCompleto: () => void

  // ─── Session Exit ─────────────────────────────────────────────────────────────
  salirSesion: () => void
}

let xpFloatKey = 0

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRioMundoStore = create<RioMundoStore>()((set, get) => ({
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
  setSelectedProvider: (selectedProviderId) => set({ selectedProviderId }),
  setSelectedModel: (selectedModelId) => set({ selectedModelId }),
  setWsConnectionId: (wsConnectionId) => set({ wsConnectionId }),

  // ─── Audio & Connection ──────────────────────────────────────────────────────

  setAudioSettings: (settings) => set((s) => ({
    audioSettings: { ...s.audioSettings, ...settings },
  })),
  toggleMusicMuted: () => set((s) => ({
    audioSettings: { ...s.audioSettings, musicMuted: !s.audioSettings.musicMuted },
  })),
  toggleSFXMuted: () => set((s) => ({
    audioSettings: { ...s.audioSettings, sfxMuted: !s.audioSettings.sfxMuted },
  })),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setWsLatencyMs: (wsLatencyMs) => set({ wsLatencyMs }),
  setAudioManager: (audioManager) => set({ audioManager }),
  setAudioReady: (audioReady) => set({ audioReady }),
  setBeeLoaderVisible: (beeLoaderVisible) => set({ beeLoaderVisible }),
  setSendWsMessage: (sendWsMessage) => set({ sendWsMessage }),

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
  completeOnboarding: () => set((s) =>
    s.loginPhase === 'onboarding_chat' ? { loginPhase: 'entering_world' } : {}
  ),

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
    const { racha, velocidad, esfuerzo } = s.xpMultiplicadores
    const xpFinal = Math.round(xp * racha * velocidad * esfuerzo)
    const nuevoXP = s.xpTotal + xpFinal
    const nuevoNivel = obtenerNivel(nuevoXP)
    const subioDeNivel = nuevoNivel.nivel > s.nivelActual
    const newState: Partial<State> = {
      xpTotal: nuevoXP,
      xpSesion: s.xpSesion + xpFinal,
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
  incrementarHint: () => set((s) => ({ hintCount: s.hintCount + 1 })),

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
  setBeePosicion: (x, y) => set({ beePosicion: { x, y } }),
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

  // ─── Swarm Tour ────────────────────────────────────────────────────────────────

  iniciarTour: () => set({
    tourActivo: true,
    tourStep: 0,
    tourAgentesVisitados: [],
    tourSkipeado: false,
    tourAgenteActual: null,
    loginPhase: 'swarm_tour',
  }),
  skipTour: () => set({
    tourSkipeado: true,
    tourActivo: false,
    loginPhase: 'in_world',
  }),
  setTourStep: (tourStep) => set({ tourStep }),
  marcarAgenteVisitado: (agentId) => set((s) => ({
    tourAgentesVisitados: [...s.tourAgentesVisitados, agentId],
  })),
  setTourAgenteActual: (tourAgenteActual) => set({ tourAgenteActual }),
  finalizarTour: () => set({
    tourActivo: false,
    tourStep: 0,
    tourAgenteActual: null,
    loginPhase: 'in_world',
  }),
  dispatchTourAgentResult: (agentId, outputSnippet, zonas, structureCtx) => set((s) => ({
    tourAgentResults: {
      ...s.tourAgentResults,
      [agentId]: { outputSnippet, zonas, structureCtx },
    },
  })),
  actualizarTributarios: (zonaCount) => {
    const newMapa = generateRioMundo(zonaCount)
    set({ mapa: newMapa, tributaries: newMapa.tributaries })
  },

  // ─── Login WS Result ─────────────────────────────────────────────────────────

  setLoginSearchResult: (loginSearchResult) => set({ loginSearchResult }),

  // ─── TTS ─────────────────────────────────────────────────────────────────────

  enqueueTtsAudio: (audioBase64) => set((s) => ({
    ttsAudioQueue: [...s.ttsAudioQueue, { audioBase64 }],
  })),
  shiftTtsAudio: () => {
    const item = get().ttsAudioQueue[0]
    if (item) {
      set((s) => ({ ttsAudioQueue: s.ttsAudioQueue.slice(1) }))
    }
    return item
  },

  // ─── Programa error ──────────────────────────────────────────────────────────

  setProgramaError: (programaError) => set({ programaError }),

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

  salirSesion: () => {
    const state = get()
    // Notificar al servidor para pausar la sesión en BD
    if (state.sendWsMessage && state.sessionId) {
      state.sendWsMessage({
        tipo: 'salir_sesion',
        sessionId: state.sessionId,
        alumnoId: state.alumnoId,
      })
    }
    // Limpiar estado local (mantiene provider/modelo/instanceId)
    set((s) => ({
      ...initialState,
      selectedProviderId: s.selectedProviderId,
      selectedModelId: s.selectedModelId,
      instanceId: s.instanceId,
      audioManager: s.audioManager,
      audioSettings: s.audioSettings,
    }))
  },

}))