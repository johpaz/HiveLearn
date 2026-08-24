/**
 * quality — Detección automática del nivel de GPU y reducción progresiva.
 *
 * Estrategia:
 *   1. try/catch al crear contexto WebGL2 (fallback a WebGL1).
 *   2. Si no hay WebGL para nada → 'off' (las escenas usan su fondo estático).
 *   3. Rolling FPS: cada ~30s observa el FPS medio; si cae bajo 45 de forma
 *      sostenida, baja el tier. Si sube sobre 55 durante 60s, sube.
 *   4. `prefers-reduced-motion` al inicia → tier 'low' (no va a off).
 */

export type QualityTier = 'off' | 'low' | 'mid' | 'high'

export interface QualityState {
  tier: QualityTier
  /** Multiplier applied to particle count, sample counts, etc. */
  particleScale: number
  /** SSR (Pixi postfx bloom) enabled. */
  postfx: boolean
  /** Pixel ratio cap for three renderer. */
  pixelRatio: number
  /** Enable parallax shader layers. */
  parallax: boolean
}

const TIER_STATE: Record<QualityTier, QualityState> = {
  off:   { tier: 'off',   particleScale: 0,    postfx: false, pixelRatio: 1,    parallax: false },
  low:   { tier: 'low',   particleScale: 0.25, postfx: false, pixelRatio: 1,    parallax: false },
  mid:   { tier: 'mid',   particleScale: 0.5,  postfx: true,  pixelRatio: 1,    parallax: true  },
  high:  { tier: 'high',  particleScale: 1.0,  postfx: true,  pixelRatio: 1.5,  parallax: true  },
}

/** Detecta WebGL2 disponible (retorno false=no 3D, las escenas caen a fondo estático). */
export function detectWebGL2(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null
    return !!gl
  } catch {
    return false
  }
}

/** Detecta motion-reduce del navegador. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Crea QualityState inicial según detección + preferencias. */
export function initialQuality(): QualityState {
  if (!detectWebGL2()) return { ...TIER_STATE.off }
  if (prefersReducedMotion()) return { ...TIER_STATE.low }
  // Default a 'mid'; el scaler ajustará.
  return { ...TIER_STATE.mid }
}

/**
 * QualityScaler — observa FPS y ajusta el tier en runtime. Lo llama el
 * WorldRenderer cada N frames observados.
 */
export class QualityScaler {
  private state: QualityState
  private frames = 0
  private rollingFps = 60
  private framesSinceChange = 0
  private minFramesBeforeUpgrade = 60 * 60 // ~60s @60fps
  private minFramesBeforeDowngrade = 60 * 15 // ~15s de bajada sostenida

  constructor(initial?: QualityState) {
    this.state = initial ?? initialQuality()
  }

  get current(): QualityState { return this.state }

  /** Llamar cada frame con deltaMS del ticker. */
  observeFrame(deltaMs: number): void {
    if (this.state.tier === 'off') return
    const fps = 1000 / Math.max(1, deltaMs)
    this.rollingFps = this.rollingFps * 0.92 + fps * 0.08
    this.frames++
    this.framesSinceChange++

    if (this.frames < 60) return // warm-up

    if (this.rollingFps < 35 && this.framesSinceChange > this.minFramesBeforeDowngrade) {
      this.downgrade()
    } else if (this.rollingFps < 45 && this.state.tier === 'high' && this.framesSinceChange > this.minFramesBeforeDowngrade / 2) {
      this.setState('mid')
    } else if (this.rollingFps > 55 && this.state.tier !== 'high' && this.framesSinceChange > this.minFramesBeforeUpgrade) {
      this.upgrade()
    }
  }

  /** Añade un evento de fallo puntuale (e.g. contexto perdido). */
  reportGlError(): void {
    this.setState('off')
  }

  private upgrade(): void {
    const order: QualityTier[] = ['low', 'mid', 'high']
    const idx = order.indexOf(this.state.tier)
    if (idx < order.length - 1) this.setState(order[idx + 1]!)
  }
  private downgrade(): void {
    const order: QualityTier[] = ['low', 'mid', 'high']
    const idx = order.indexOf(this.state.tier)
    if (idx > 0) this.setState(order[idx - 1]!)
    else this.setState('off')
  }
  private setState(t: QualityTier): void {
    if (this.state.tier === t) return
    this.state = { ...TIER_STATE[t] }
    this.framesSinceChange = 0
  }
}