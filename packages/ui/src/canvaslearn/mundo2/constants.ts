/**
 * Mundo de Aprendizaje HiveLearn — Constantes
 * 
 * Configuración del mundo pixel art dinámico con scroll horizontal
 */

// ─── Dimensiones del mundo ───────────────────────────────────────────────────

/** Tamaño de cada tile en píxeles (pixel art 32x32) */
export const TILE_SIZE = 32

/** Dimensiones del viewport (pantalla visible) */
export const VIEWPORT_WIDTH = 1280
export const VIEWPORT_HEIGHT = 720

/** Dimensiones del mundo en tiles */
export const WORLD_TILES_WIDTH = 100
export const WORLD_TILES_HEIGHT = 20

/** Dimensiones totales del mundo en píxeles */
export const WORLD_WIDTH = WORLD_TILES_WIDTH * TILE_SIZE
export const WORLD_HEIGHT = WORLD_TILES_HEIGHT * TILE_SIZE

// ─── Paleta de colores pixel art ─────────────────────────────────────────────

export const COLORS = {
  /** Fondo principal (azul oscuro profundo) */
  fondo: 0x0a0e27,
  
  /** Cielo (gradiente superior) */
  cielo: 0x1a1f3a,
  
  /** Suelo base */
  suelo: 0x2a3550,
  
  /** Suelo detalle (más claro) */
  sueloDetalle: 0x3a4560,
  
  /** Plataformas */
  plataforma: 0x4a5570,
  
  /** Plataformas borde iluminado */
  plataformaBorde: 0x5a6580,
  
  /** Zonas bloqueadas (rojo oscuro) */
  bloqueo: 0x4a1a1a,
  
  /** Zonas disponibles (verde) */
  desbloqueado: 0x1a4a2a,
  
  /** Zonas completadas (dorado) */
  completado: 0x4a4a1a,
  
  /** Color de acento principal (amarillo corporativo) */
  acento: 0xfbbf24,
  
  /** XP / oro */
  xp: 0xfbbf24,
  
  /** Éxito / correcto */
  exito: 0x22c55e,
  
  /** Error / daño */
  error: 0xef4444,
  
  /** Vida / corazón */
  vida: 0xec4899,
  
  /** Magia / power-up */
  magia: 0x8b5cf6,
  
  /** Racha / fuego */
  racha: 0xf97316,
  
  /** Texto claro */
  textoClaro: 0xffffff,
  
  /** Texto oscuro */
  textoOscuro: 0x1a1a2e,
  
  /** UI fondo semi-transparente */
  uiFondo: 0x0a0e27,
  
  /** UI borde */
  uiBorde: 0x2a3550,
}

// ─── Configuración del jugador ───────────────────────────────────────────────

export const JUGADOR_CONFIG = {
  /** Velocidad de movimiento (pixeles/segundo) */
  velocidad: 200,
  
  /** Velocidad con power-up de velocidad */
  velocidadPowerup: 320,
  
  /** Fuerza de salto */
  salto: 450,
  
  /** Gravedad */
  gravedad: 1200,
  
  /** Velocidad máxima de caída */
  velocidadCaidaMax: 600,
  
  /** Tamaño del jugador (ancho) */
  ancho: 24,
  
  /** Tamaño del jugador (alto) */
  alto: 32,
  
  /** Margen de colisión */
  margenColision: 4,
  
  /** Tiempo de invencibilidad después de daño (ms) */
  tiempoInvencibilidad: 2000,
  
  /** Duración de power-ups (ms) */
  duracionPowerup: 10000,
}

// ─── Configuración de la cámara ──────────────────────────────────────────────

export const CAMARA_CONFIG = {
  /** Suavizado del seguimiento (0-1) */
  suavizado: 0.08,
  
  /** Límite izquierdo del mundo */
  limiteIzquierdo: 0,
  
  /** Límite derecho del mundo */
  limiteDerecho: WORLD_WIDTH - VIEWPORT_WIDTH,
  
  /** Zoom mínimo */
  zoomMin: 0.8,
  
  /** Zoom máximo */
  zoomMax: 1.2,
  
  /** Zoom por defecto */
  zoomDefault: 1,
  
  /** Deadzone horizontal (porcentaje del viewport) */
  deadzoneX: 0.4,
  
  /** Deadzone vertical (porcentaje del viewport) */
  deadzoneY: 0.5,
}

// ─── Configuración de zonas ──────────────────────────────────────────────────

export const ZONAS_CONFIG = {
  /** Zona de bienvenida (coordinador) */
  zonaBienvenida: 0,
  
  /** Distancia entre zonas (en tiles) */
  distanciaEntreZonas: 8,
  
  /** Ancho de cada zona (en tiles) */
  anchoZona: 6,
  
  /** Altura base del suelo (en tiles desde abajo) */
  alturaSuelo: 4,
  
  /** Altura máxima de plataformas (en tiles desde el suelo) */
  alturaMaxPlataformas: 6,
  
  /** Probabilidad de plataforma en zona (0-1) */
  probabilidadPlataforma: 0.7,
  
  /** Probabilidad de power-up (0-1) */
  probabilidadPowerup: 0.15,
  
  /** Probabilidad de sorpresa (0-1) */
  probabilidadSorpresa: 0.1,
}

// ─── Configuración de plataformas ────────────────────────────────────────────

export const PLATAFORMAS_CONFIG = {
  /** Altura mínima (tiles) */
  alturaMin: 2,
  
  /** Altura máxima (tiles) */
  alturaMax: 5,
  
  /** Ancho mínimo (tiles) */
  anchoMin: 3,
  
  /** Ancho máximo (tiles) */
  anchoMax: 8,
  
  /** Separación mínima entre plataformas (tiles) */
  separacionMin: 2,
  
  /** Grosor de la plataforma (pixeles) */
  grosor: 16,
  
  /** Radio de bordes redondeados */
  radioBorde: 4,
}

// ─── Configuración de partículas ─────────────────────────────────────────────

export const PARTICULAS_CONFIG = {
  /** Máximo de partículas activas */
  maxParticulas: 500,
  
  /** Configuración de partículas de XP */
  xp: {
    color: COLORS.xp,
    tamanioMin: 3,
    tamanioMax: 6,
    velocidadMin: 50,
    velocidadMax: 150,
    vidaMin: 0.5,
    vidaMax: 1.0,
    cantidad: 20,
  },
  
  /** Configuración de partículas de nivel up */
  nivelUp: {
    colores: [COLORS.xp, COLORS.magia, COLORS.exito],
    tamanioMin: 5,
    tamanioMax: 12,
    velocidadMin: 100,
    velocidadMax: 300,
    vidaMin: 1.0,
    vidaMax: 2.5,
    cantidad: 100,
  },
  
  /** Configuración de partículas de logro */
  logro: {
    colores: [COLORS.xp, COLORS.vida, COLORS.magia],
    tamanioMin: 4,
    tamanioMax: 10,
    velocidadMin: 80,
    velocidadMax: 250,
    vidaMin: 1.0,
    vidaMax: 2.0,
    cantidad: 50,
  },
  
  /** Configuración de estela del jugador */
  estela: {
    color: COLORS.acento,
    tamanioMin: 2,
    tamanioMax: 5,
    velocidadMin: 20,
    velocidadMax: 60,
    vidaMin: 0.3,
    vidaMax: 0.6,
    cantidad: 5,
  },
  
  /** Configuración de polvo al saltar */
  polvo: {
    color: 0x888888,
    tamanioMin: 2,
    tamanioMax: 6,
    velocidadMin: 30,
    velocidadMax: 80,
    vidaMin: 0.5,
    vidaMax: 1.0,
    cantidad: 10,
  },
  
  /** Configuración de chispas de power-up */
  chispas: {
    color: COLORS.magia,
    tamanioMin: 3,
    tamanioMax: 8,
    velocidadMin: 100,
    velocidadMax: 200,
    vidaMin: 0.5,
    vidaMax: 1.0,
    cantidad: 30,
  },

  /** Configuración de confeti */
  confeti: {
    colores: [COLORS.xp, COLORS.magia, COLORS.exito, COLORS.vida, COLORS.acento],
    tamanioMin: 5,
    tamanioMax: 10,
    velocidadMin: 50,
    velocidadMax: 150,
    vidaMin: 1.0,
    vidaMax: 2.5,
    cantidad: 100,
  },
}

// ─── Configuración de niveles (XP requerida) ─────────────────────────────────

export const NIVELES_CONFIG = [
  { nivel: 1, nombre: 'Novato', xp: 100, badge: '⭐', color: 0x888888 },
  { nivel: 2, nombre: 'Aprendiz', xp: 250, badge: '⭐⭐', color: 0x3b82f6 },
  { nivel: 3, nombre: 'Explorador', xp: 500, badge: '⭐⭐⭐', color: 0x10b981 },
  { nivel: 4, nombre: 'Practicante', xp: 800, badge: '🌟', color: 0xf59e0b },
  { nivel: 5, nombre: 'Experto', xp: 1200, badge: '💎', color: 0x8b5cf6 },
  { nivel: 6, nombre: 'Maestro', xp: 1700, badge: '👑', color: 0xec4899 },
  { nivel: 7, nombre: 'Leyenda', xp: 2300, badge: '🏆', color: 0xfbbf24 },
  { nivel: 8, nombre: 'Héroe', xp: 3000, badge: '🦸', color: 0xef4444 },
  { nivel: 9, nombre: 'Campeón', xp: 3800, badge: '🎖️', color: 0x22c55e },
  { nivel: 10, nombre: 'Inmortal', xp: 5000, badge: '👼', color: 0xffffff },
]

// ─── Animaciones ─────────────────────────────────────────────────────────────

export const ANIMACIONES_CONFIG = {
  /** FPS para animaciones de sprites */
  fps: 12,
  
  /** Duración de transición de fade in/out (ms) */
  fadeDuracion: 300,
  
  /** Escala de rebote al aterrizar */
  reboteEscala: 0.1,
  
  /** Duración de animación de nivel up (ms) */
  nivelUpDuracion: 2000,
  
  /** Duración de popup de logro (ms) */
  logroDuracion: 3000,
  
  /** Intervalo de parpadeo de invencibilidad (ms) */
  parpadeoInvencibilidad: 100,
  
  /** Velocidad de animación de caminar (frames/segundo) */
  caminarFPS: 8,
  
  /** Velocidad de animación de correr (frames/segundo) */
  correrFPS: 12,
}

// ─── Sonidos ─────────────────────────────────────────────────────────────────

export const SONIDOS_CONFIG = {
  /** Volumen general (0-1) */
  volumenGeneral: 0.5,
  
  /** Habilitar sonidos */
  habilitado: true,
  
  /** Frecuencia de sonido de salto (Hz) */
  salto: { freq: 400, freqEnd: 600, duracion: 0.15, tipo: 'sine' },
  
  /** Frecuencia de sonido de XP (Hz) */
  xp: { freq: 800, freqEnd: 1200, duracion: 0.1, tipo: 'sine' },
  
  /** Frecuencia de sonido de nivel up (Hz) */
  nivelUp: { notas: [523, 659, 784, 1047], duracion: 0.8, tipo: 'sine' },
  
  /** Frecuencia de sonido de logro (Hz) */
  logro: { notas: [523, 659, 784], duracion: 0.6, tipo: 'sine' },
  
  /** Frecuencia de sonido de daño (Hz) */
  dano: { freqStart: 300, freqEnd: 100, duracion: 0.4, tipo: 'sawtooth' },
  
  /** Frecuencia de sonido de power-up (Hz) */
  powerup: { freqStart: 400, freqEnd: 1000, duracion: 0.5, tipo: 'square' },
  
  /** Frecuencia de sonido de aterrizaje (Hz) */
  aterrizaje: { freq: 200, duracion: 0.05, tipo: 'triangle' },
  
  /** Frecuencia de sonido de moneda/oro (Hz) */
  moneda: { freq: 1200, freqEnd: 1600, duracion: 0.08, tipo: 'sine' },
} as const

// ─── Utilidades matemáticas ──────────────────────────────────────────────────

/**
 * Interpolación lineal
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * Math.max(0, Math.min(1, t))
}

/**
 * Clamp de valor entre mínimo y máximo
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Número aleatorio entre min y max
 */
export function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

/**
 * Entero aleatorio entre min y max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Easing ease-out-cubic para animaciones suaves
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Easing ease-in-out-cubic
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Easing elástico para efectos de rebote
 */
export function easeOutElastic(t: number): number {
  const c4 = (2 * Math.PI) / 3
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

/**
 * Distancia entre dos puntos
 */
export function distancia(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
}

/**
 * Chequear si punto está dentro de rectángulo
 */
export function puntoEnRectangulo(
  px: number, py: number,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh
}

/**
 * Chequear colisión entre dos rectángulos
 */
export function rectangulosColisionan(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number
): boolean {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2
}
