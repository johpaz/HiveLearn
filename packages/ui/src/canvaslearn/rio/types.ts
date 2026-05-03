import type { StudentProfile, LessonProgram, SwarmProgress, AgentStatus, CoordinatorState } from '@hivelearn/core'
import type { MundoLogro } from '@hivelearn/core'

// ─── Tile Types ──────────────────────────────────────────────────────────────

export type TileType =
  | 'agua_profunda'
  | 'agua'
  | 'cascada'
  | 'tierra'
  | 'pasto'
  | 'piedra'
  | 'camino'
  | 'arena'
  | 'barro'
  | 'flores'
  | 'arbusto'
  | 'arbol'
  | 'tronco'
  | 'puente'
  | 'portal_zona'
  | 'desembo_roca'
  | 'montana'

export type ZoneFlowState = 'seco' | 'fluyendo' | 'completado'

export interface IsoTile {
  x: number
  y: number
  type: TileType
  elevation: number
  walkable: boolean
  zoneRef?: number
  flowState?: ZoneFlowState
  variant?: number
}

export interface IsoMap {
  width: number
  height: number
  tiles: IsoTile[][]
  spawn: { x: number; y: number }
  riverPath: { x: number; y: number }[]
  tributaries: Tributary[]
}

export interface Tributary {
  id: number
  zoneNumero: number
  name: string
  tipoPedagogico: string
  xpRecompensa: number
  estado: ZoneFlowState
  path: { x: number; y: number }[]
  branchPoint: { x: number; y: number }
  portalPos: { x: number; y: number }
  moduloUuid?: string
  agenteId?: string
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

export type AvatarDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export type AvatarAnimation = 'idle' | 'caminar' | 'correr' | 'interactuando' | 'celebrando'

export interface AvatarCustomization {
  skinColor: number
  hairColor: number
  hairStyle: number
  shirtColor: number
  pantsColor: number
  accessory: string | null
}

export interface AvatarState {
  x: number
  y: number
  direction: AvatarDirection
  animation: AvatarAnimation
  speed: number
  custom: AvatarCustomization
}

// ─── Bee Coordinator ─────────────────────────────────────────────────────────

export type BeeState = 'idle' | 'following' | 'guiding' | 'pointing' | 'celebrating' | 'talking' | 'flying_ahead'

export interface BeePosition {
  x: number
  y: number
  targetX: number
  targetY: number
  state: BeeState
  bobOffset: number
  wingFrame: number
}

export interface DialogBubble {
  id: string
  text: string
  x: number
  y: number
  createdAt: number
  duration: number
  isQuestion: boolean
}

// ─── Camera ──────────────────────────────────────────────────────────────────

export interface IsoCameraState {
  x: number
  y: number
  zoom: number
  targetX: number
  targetY: number
  targetZoom: number
  smoothing: number
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

// ─── Login State ─────────────────────────────────────────────────────────────

export type LoginPhase = 'nickname_input' | 'loading' | 'restoring_session' | 'new_profile' | 'avatar_select' | 'entering_world' | 'in_world' | 'onboarding_chat'

export interface LoginState {
  phase: LoginPhase
  nickname: string
  existingProfile: StudentProfile | null
  error: string | null
}

// ─── Onboarding Chat State ───────────────────────────────────────────────────

export type OnboardingStep = 'nombre' | 'edad' | 'tema' | 'objetivo' | 'estilo' | 'avatar' | 'completado'

export interface OnboardingChatState {
  step: OnboardingStep
  nombre: string
  edad: number | null
  tema: string
  objetivo: string
  estilo: string
  messages: { role: 'bee' | 'student'; text: string }[]
  isTyping: boolean
}

// ─── Swarm Progress in World ─────────────────────────────────────────────────

export interface SwarmProgressWorld {
  isGenerating: boolean
  currentAgentId: string | null
  currentAgentName: string | null
  completedAgents: string[]
  totalAgents: number
  percentComplete: number
  lastCompletedZone: number | null
}

// ─── Unified Store State ─────────────────────────────────────────────────────

export interface RioMundoState {
  // ─── Identity ───────────────────────────────────────────────────────────────
  alumnoId: string | null
  nickname: string | null
  perfil: StudentProfile | null
  avatar: AvatarCustomization
  instanceId: string | null

  // ─── Session ────────────────────────────────────────────────────────────────
  sessionId: string | null
  programaUuid: string | null
  programa: LessonProgram | null
  tema: string | null
  meta: string

  // ─── Login / Phase ──────────────────────────────────────────────────────────
  loginPhase: LoginPhase

  // ─── Onboarding Chat ────────────────────────────────────────────────────────
  onboarding: OnboardingChatState

  // ─── Provider Config ────────────────────────────────────────────────────────
  selectedProviderId: string | null
  selectedModelId: string | null

  // ─── World State ─────────────────────────────────────────────────────────────
  mundoListo: boolean
  bienvenidaMostrada: boolean
  sesionPausada: boolean

  // ─── Map ─────────────────────────────────────────────────────────────────────
  mapa: IsoMap | null
  tributaries: Tributary[]
  zonaActual: number

  // ─── Player ──────────────────────────────────────────────────────────────────
  jugador: AvatarState

  // ─── Camera ──────────────────────────────────────────────────────────────────
  camara: IsoCameraState

  // ─── XP & Level ──────────────────────────────────────────────────────────────
  xpTotal: number
  xpSesion: number
  nivelActual: number
  progresoNivel: number

  // ─── Lives & Streak ──────────────────────────────────────────────────────────
  vidas: number
  racha: number
  mejorRacha: number

  // ─── Achievements ────────────────────────────────────────────────────────────
  logros: MundoLogro['datos'][]
  coleccionables: string[]

  // ─── Progress ────────────────────────────────────────────────────────────────
  modulosCompletados: string[]
  respuestas: Record<string, { intento: number; correcta: boolean; xp_ganada: number; timestamp: number }>

  // ─── Bee ─────────────────────────────────────────────────────────────────────
  beeState: BeeState
  dialogBubbles: DialogBubble[]

  // ─── Portal Interaction ──────────────────────────────────────────────────────
  portal: PortalState

  // ─── Swarm Generation ────────────────────────────────────────────────────────
  swarmProgress: SwarmProgressWorld
  agentStatuses: Record<string, AgentStatus>
  coordinatorState: CoordinatorState

  // ─── UI Feedback ──────────────────────────────────────────────────────────────
  xpFloat: { id: string; isoX: number; isoY: number; xp: number; key: number } | null
  nivelUpActivo: boolean
  logroActivo: MundoLogro['datos'] | null
  isGenerating: boolean

  // ─── Time ────────────────────────────────────────────────────────────────────
  tiempoInicioSesion: number | null
  tiempoSesion: number
}

// ─── Portal Interaction State ──────────────────────────────────────────────────

export type PortalPhase = 'closed' | 'entering' | 'open' | 'exiting'

export interface PortalState {
  phase: PortalPhase
  zonaNumero: number | null
  moduloUuid: string | null
  zoomTarget: number
  a2uiMessages: any[]
}

// ─── Level Configuration ─────────────────────────────────────────────────────

export const RIO_NIVELES = [
  { nivel: 1, nombre: 'Semilla', xp_requerida: 100, badge: '🌱', color: 0x8B7355 },
  { nivel: 2, nombre: 'Brote', xp_requerida: 250, badge: '🌿', color: 0x4CAF50 },
  { nivel: 3, nombre: 'Arroyo', xp_requerida: 500, badge: '💧', color: 0x42A5F5 },
  { nivel: 4, nombre: 'Rio', xp_requerida: 800, badge: '🌊', color: 0x1E88E5 },
  { nivel: 5, nombre: 'Afluente', xp_requerida: 1200, badge: '🐟', color: 0xFFA726 },
  { nivel: 6, nombre: 'Cascada', xp_requerida: 1700, badge: '⛰️', color: 0x7E57C2 },
  { nivel: 7, nombre: 'Valle', xp_requerida: 2300, badge: '🏔️', color: 0xEC407A },
  { nivel: 8, nombre: 'Selva', xp_requerida: 3000, badge: '🌳', color: 0x2E7D32 },
  { nivel: 9, nombre: 'Oceano', xp_requerida: 3800, badge: '🌊', color: 0x0D47A1 },
  { nivel: 10, nombre: 'Inmortal', xp_requerida: 5000, badge: '✨', color: 0xFFD700 },
] as const

export const DEFAULT_AVATAR: AvatarCustomization = {
  skinColor: 0xFFCC99,
  hairColor: 0x4A3728,
  hairStyle: 0,
  shirtColor: 0x3B82F6,
  pantsColor: 0x1E3A5F,
  accessory: null,
}

export const ISO_CONFIG = {
  TILE_WIDTH: 64,
  TILE_HEIGHT: 32,
  MAP_WIDTH: 40,
  MAP_HEIGHT: 40,
  RIVER_WIDTH_MIN: 2,
  RIVER_WIDTH_MAX: 4,
  TRIBUTARY_LENGTH_MIN: 5,
  TRIBUTARY_LENGTH_MAX: 12,
  SPAWN_X: 20,
  SPAWN_Y: 35,
  PLAYER_SPEED: 150,
  PLAYER_RUN_SPEED: 250,
  BEE_FOLLOW_DISTANCE: 3,
  CAMERA_SMOOTHING: 0.08,
  CAMERA_MIN_ZOOM: 0.5,
  CAMERA_MAX_ZOOM: 2.0,
} as const