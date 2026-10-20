/**
 * Calidad gráfica adaptativa. Todo aquí es puro (sin three ni DOM) para poder probarlo: elegir el nivel inicial según
 * el equipo y bajarlo si el juego va lento. Nunca sube solo, para no oscilar entre niveles.
 */
export type QualityTier = 'high' | 'medium' | 'low'

export interface TierSettings {
  pixelRatio: number
  bloom: boolean
  shadows: boolean
  /** Partículas de ráfaga (miel/datos) y motas ambientales. */
  particles: number
  motes: number
  antialias: boolean
}

export const TIERS: Record<QualityTier, TierSettings> = {
  high: { pixelRatio: 2, bloom: true, shadows: true, particles: 160, motes: 90, antialias: true },
  medium: { pixelRatio: 1.5, bloom: true, shadows: false, particles: 100, motes: 40, antialias: true },
  low: { pixelRatio: 1, bloom: false, shadows: false, particles: 50, motes: 0, antialias: false },
}

export const QUALITY_KEY = 'hivelearn.quality'
const ORDER: QualityTier[] = ['high', 'medium', 'low']

export function parseTier(value: unknown): QualityTier | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null
}

export interface DeviceHints { stored?: string | null; coarsePointer: boolean; cores: number }

/** Una preferencia guardada manda; si no, móviles y equipos modestos arrancan más abajo. */
export function initialTier(hints: DeviceHints): QualityTier {
  const stored = parseTier(hints.stored)
  if (stored) return stored
  if (hints.coarsePointer) return hints.cores >= 6 ? 'medium' : 'low'
  return hints.cores >= 8 ? 'high' : hints.cores >= 4 ? 'medium' : 'low'
}

export function lowerTier(tier: QualityTier): QualityTier {
  return ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(tier) + 1)]!
}

export interface GovernorOptions {
  /** Cuadros por ventana de medición. */
  windowFrames?: number
  /** Cuadros iniciales que se ignoran (compilación de shaders, carga de modelos). */
  warmupFrames?: number
  /** Si el promedio de la ventana supera esto (ms), se baja un nivel. */
  slowMs?: number
}

export class QualityGovernor {
  private frames = 0
  private total = 0
  private seen = 0
  private readonly windowFrames: number
  private readonly warmupFrames: number
  private readonly slowMs: number

  constructor(public tier: QualityTier, options: GovernorOptions = {}) {
    this.windowFrames = options.windowFrames ?? 90
    this.warmupFrames = options.warmupFrames ?? 30
    this.slowMs = options.slowMs ?? 26
  }

  /** Registra un cuadro. Devuelve el nivel nuevo si hubo que bajarlo, o null. */
  sample(frameMs: number): QualityTier | null {
    if (this.seen++ < this.warmupFrames) return null
    this.total += Math.min(frameMs, 100)
    if (++this.frames < this.windowFrames) return null
    const average = this.total / this.frames
    this.frames = 0
    this.total = 0
    if (average <= this.slowMs || this.tier === 'low') return null
    this.tier = lowerTier(this.tier)
    return this.tier
  }

  /** Cambio manual (selector del usuario): reinicia la medición. */
  set(tier: QualityTier): void {
    this.tier = tier
    this.frames = 0
    this.total = 0
    this.seen = 0
  }
}
