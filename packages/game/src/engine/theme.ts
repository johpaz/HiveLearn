/**
 * theme — "Panal de Cuentos": tokens de estilo adaptativos (Fase estilo HD-2D).
 *
 * hiveDB es la fuente de verdad: el perfil del alumno (rango_edad + energia)
 * gobierna paleta, escala de personajes, densidad de FX, tempo musical y mood
 * de los shaders. Un alumno de 8 años con energía alta ve la colmena saturada
 * y festiva; un adulto cansado, la "colmena nocturna" sobria y cálida.
 *
 * Consumidores:
 *  - CeremonyStage  → tinte de auras/fondo, escala de actores, partículas
 *  - AudioManager   → tempo de la música (tempoScale)
 *  - WorldRenderer  → uniforms.uMood (0..1) para hiveWall/honeyFlow/skyCycle
 */

export type AgeBand = 'nino' | 'adolescente' | 'adulto'
export type Energy = 'baja' | 'media' | 'alta'

export interface HiveTheme {
  /** Nombre legible (para logs/debug) */
  id: string
  // ── Paleta (hex numérico Three) ──
  /** Color primario de luz/acentos (miel) */
  primary: number
  /** Color secundario (dorado de celebración) */
  secondary: number
  /** Fondo profundo (marrón colmena / noche) */
  background: number
  /** Tinte global del diorama GLB */
  dioramaTint: number

  // ── Escala y movimiento ──
  /** Multiplicador de tamaño de personajes */
  characterScale: number
  /** Multiplicador de amplitud de hover/bounce */
  motionAmp: number

  // ── FX ──
  /** Densidad de partículas de polen (0..1) */
  particleDensity: number
  /** Intensidad de aura al hablar/pulsos */
  auraIntensity: number

  // ── Música y shaders ──
  /** tempoScale del AudioManager (>1 = más rápido) */
  musicTempo: number
  /** uMood de los shaders: 0=oscuro/sereno .. 1=brillante/festivo */
  shaderMood: number

  // ── Presentación ──
  /** Mostrar confeti extra en celebraciones */
  celebrationFx: boolean
  /**
   * Corrección de luminosidad de cielos/fondos de nivel:
   * >0 aclara (hacia blanco), <0 oscurece (hacia negro).
   */
  skyShade: number
}

const THEMES: Record<AgeBand, Record<Energy, HiveTheme>> = {
  nino: {
    alta: {
      id: 'nino-alta',
      primary: 0xffb300, secondary: 0xffd700, background: 0x2a1f0d, dioramaTint: 0xffffff,
      characterScale: 1.25, motionAmp: 1.4,
      particleDensity: 1.0, auraIntensity: 1.3,
      musicTempo: 1.15, shaderMood: 1.0,
      celebrationFx: true,
      skyShade: 0.10,
    },
    media: {
      id: 'nino-media',
      primary: 0xffb300, secondary: 0xffd700, background: 0x241a0b, dioramaTint: 0xfff3d6,
      characterScale: 1.25, motionAmp: 1.2,
      particleDensity: 0.85, auraIntensity: 1.2,
      musicTempo: 1.05, shaderMood: 0.9,
      celebrationFx: true,
      skyShade: 0.00,
    },
    baja: {
      id: 'nino-baja',
      primary: 0xffc94d, secondary: 0xffe082, background: 0x1e150a, dioramaTint: 0xffe9c4,
      characterScale: 1.25, motionAmp: 1.0,
      particleDensity: 0.6, auraIntensity: 1.0,
      musicTempo: 0.95, shaderMood: 0.65,
      celebrationFx: false,
      skyShade: -0.15,
    },
  },
  adolescente: {
    alta: {
      id: 'adolescente-alta',
      primary: 0xffb300, secondary: 0xffca28, background: 0x201708, dioramaTint: 0xfff0cc,
      characterScale: 1.0, motionAmp: 1.1,
      particleDensity: 0.7, auraIntensity: 1.1,
      musicTempo: 1.1, shaderMood: 0.85,
      celebrationFx: false,
      skyShade: 0.05,
    },
    media: {
      id: 'adolescente-media',
      primary: 0xffb300, secondary: 0xffca28, background: 0x1a1208, dioramaTint: 0xf5e6c8,
      characterScale: 1.0, motionAmp: 1.0,
      particleDensity: 0.55, auraIntensity: 1.0,
      musicTempo: 1.0, shaderMood: 0.7,
      celebrationFx: false,
      skyShade: 0.00,
    },
    baja: {
      id: 'adolescente-baja',
      primary: 0xe6a23c, secondary: 0xffd54f, background: 0x14100a, dioramaTint: 0xe8d9be,
      characterScale: 1.0, motionAmp: 0.85,
      particleDensity: 0.35, auraIntensity: 0.85,
      musicTempo: 0.92, shaderMood: 0.45,
      celebrationFx: false,
      skyShade: -0.20,
    },
  },
  adulto: {
    alta: {
      id: 'adulto-alta',
      primary: 0xffb300, secondary: 0xffc107, background: 0x181006, dioramaTint: 0xf0e0c0,
      characterScale: 0.95, motionAmp: 0.95,
      particleDensity: 0.5, auraIntensity: 1.0,
      musicTempo: 1.05, shaderMood: 0.7,
      celebrationFx: false,
      skyShade: -0.05,
    },
    media: {
      id: 'adulto-media',
      primary: 0xd69e2e, secondary: 0xffc107, background: 0x120c05, dioramaTint: 0xe3d3b3,
      characterScale: 0.95, motionAmp: 0.9,
      particleDensity: 0.4, auraIntensity: 0.9,
      musicTempo: 0.97, shaderMood: 0.55,
      celebrationFx: false,
      skyShade: -0.15,
    },
    baja: {
      id: 'adulto-baja',
      primary: 0xc4912e, secondary: 0xd9a441, background: 0x0d0904, dioramaTint: 0xd6c6a6,
      characterScale: 0.95, motionAmp: 0.75,
      particleDensity: 0.25, auraIntensity: 0.75,
      musicTempo: 0.88, shaderMood: 0.3,
      celebrationFx: false,
      skyShade: -0.30,
    },
  },
}

/** Tema por defecto: adolescente con energía media (equilibrado) */
export const DEFAULT_THEME: HiveTheme = THEMES.adolescente.media

/** Resuelve el tema desde el perfil almacenado en hiveDB */
export function resolveTheme(rangoEdad?: string | null, energia?: string | null): HiveTheme {
  const band: AgeBand =
    rangoEdad === 'nino' || rangoEdad === 'niño' ? 'nino'
      : rangoEdad === 'adolescente' ? 'adolescente'
        : rangoEdad === 'adulto' ? 'adulto'
          : guessBandFromAge(rangoEdad)
  const energy: Energy =
    energia === 'alta' ? 'alta' : energia === 'baja' ? 'baja' : 'media'
  return THEMES[band][energy]
}

/** Permite pasar edad numérica directa ("10") además del rango */
function guessBandFromAge(raw?: string | null): AgeBand {
  const n = parseInt(String(raw ?? ''), 10)
  if (Number.isFinite(n) && n > 0) return n <= 12 ? 'nino' : n <= 17 ? 'adolescente' : 'adulto'
  return 'adolescente'
}

/** Mezcla un hex hacia blanco (k>0) o negro (k<0). k ∈ [-1,1] */
export function shadeHex(hex: number, k: number): number {
  const clamped = Math.max(-1, Math.min(1, k))
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff
  const t = clamped > 0 ? 255 : 0
  const a = Math.abs(clamped)
  const mix = (c: number) => Math.round(c + (t - c) * a)
  return (mix(r) << 16) | (mix(g) << 8) | mix(b)
}
