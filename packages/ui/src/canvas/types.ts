export type CharState = 'idle' | 'pending' | 'running' | 'completed' | 'failed'

export interface CharSprite {
  agentId: string
  label: string
  icon: string
  x: number
  y: number
  targetX: number
  targetY: number
  deskX: number
  deskY: number
  state: CharState
  color: string
  stateTimer: number
  animFrame: number
  shakeX: number
  tintFlash: number
  _path?: { x: number; y: number }[]
  _pathIdx?: number
}

export interface Bubble {
  agentId: string
  text: string
  alpha: number
  timer: number
  fadingIn: boolean
  fadingOut: boolean
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
  gravity: number
}

export interface DustMote {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  size: number
}

export interface FlameFrame {
  frames: number[][]
  current: number
  timer: number
}

export interface CanvasState {
  chars: CharSprite[]
  coordinator: CharSprite
  bubbles: Bubble[]
  particles: Particle[]
  dust: DustMote[]
  progress: number
  mensaje: string
  vidas: number
  racha: number
  xpTotal: number
  porcentajeNivel: number
  nivelActual: string
  swarmDone: boolean
  celebrateTimer: number
  coordinatorWalkingTo: string | null
  coordinatorReturnX: number
  coordinatorReturnY: number
  delegationEffects: Array<{
    targetX: number
    targetY: number
    progress: number
    alpha: number
    agentId: string
  }>
}
