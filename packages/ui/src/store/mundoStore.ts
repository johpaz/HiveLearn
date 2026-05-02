/**
 * useMundoStore — Store para Canvas 2: Mundo de Aprendizaje
 * 
 * Gestiona el estado del mundo pixel art dinámico:
 * - XP, nivel, progreso de nivel
 * - Logros desbloqueados (colección)
 * - Zonas del mundo (bloqueada/disponible/completada)
 * - Posición del jugador en el mundo
 * - Vidas, racha, tiempo de sesión
 * - Estado de gamificación (power-ups, coleccionables)
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { MundoLogro, MundoEstado, MundoConfig } from '@hivelearn/core'

// ─── Tipos específicos del store ─────────────────────────────────────────────

export interface ZonaEstado {
  numero: number
  estado: 'bloqueada' | 'disponible' | 'completada'
  modulo_uuid?: string
  agente_id?: string
  titulo?: string
  tipo_pedagogico?: string
  xp_recompensa?: number
  completada_en?: number // timestamp
}

export interface JugadorEstado {
  x: number
  y: number
  direccion: 'izquierda' | 'derecha'
  animacion: 'idle' | 'caminar' | 'saltar' | 'correr' | 'caer' | 'interactuando'
  invencible: boolean
  powerup?: 'velocidad' | 'salto' | 'doble_salto' | 'invencibilidad'
  powerupRestante?: number // ms restantes
}

export interface NivelInfo {
  nivel: number
  nombre: string
  xp_requerida: number
  badge: string
  color: number
}

export interface XpFloat {
  id: string
  x: number
  y: number
  xp: number
  key: number
}

export interface MundoState {
  /** UUID del programa actual */
  programaUuid: string | null
  
  /** ID de la sesión */
  sessionId: string | null
  
  /** ID del alumno */
  alumnoId: string | null
  
  /** Tema del programa */
  tema: string | null
  
  // ─── Progreso del jugador ──────────────────────────────────────────────────
  
  /** XP total acumulada */
  xpTotal: number
  
  /** XP de la sesión actual */
  xpSesion: number
  
  /** Nivel actual del jugador */
  nivelActual: number
  
  /** Progreso al siguiente nivel (0-100) */
  progresoNivel: number
  
  /** Logros desbloqueados */
  logros: MundoLogro['datos'][]
  
  /** Coleccionables obtenidos */
  coleccionables: string[]
  
  // ─── Estado del mundo ──────────────────────────────────────────────────────
  
  /** Zonas del mundo */
  zonas: ZonaEstado[]
  
  /** Zona actual */
  zonaActual: number
  
  /** Módulo actual */
  moduloActual: string | null
  
  /** Módulos completados */
  modulosCompletados: string[]
  
  /** Respuestas del alumno (por módulo) */
  respuestas: Record<string, {
    intento: number
    correcta: boolean
    xp_ganada: number
    timestamp: number
  }>
  
  // ─── Estado del jugador ────────────────────────────────────────────────────
  
  /** Estado físico del jugador */
  jugador: JugadorEstado
  
  /** Vidas restantes */
  vidas: number
  
  /** Racha actual (respuestas correctas consecutivas) */
  racha: number
  
  /** Mejor racha */
  mejorRacha: number
  
  /** Tiempo total de sesión (ms) */
  tiempoSesion: number
  
  /** Tiempo inicio de sesión */
  tiempoInicio: number | null
  
  // ─── Estado de la cámara ───────────────────────────────────────────────────
  
  /** Posición X de la cámara */
  camaraX: number
  
  /** Posición Y de la cámara */
  camaraY: number
  
  /** Zoom de la cámara */
  camaraZoom: number
  
  // ─── Gamificación activa ───────────────────────────────────────────────────
  
  /** XP flotante (animación) */
  xpFloat: XpFloat | null
  
  /** Notificación de nivel up activa */
  nivelUpActivo: boolean
  
  /** Notificación de logro activo */
  logroActivo: MundoLogro['datos'] | null
  
  /** Power-up activo */
  powerupActivo: 'velocidad' | 'salto' | 'doble_salto' | 'invencibilidad' | null
  
  /** Power-up restante (ms) */
  powerupRestante: number
  
  // ─── Estado de la sesión ───────────────────────────────────────────────────
  
  /** Sesión pausada */
  sesionPausada: boolean
  
  /** Mundo cargado y listo */
  mundoListo: boolean
  
  /** Bienvenida mostrada */
  bienvenidaMostrada: boolean
  
  // ─── Configuración ─────────────────────────────────────────────────────────
  
  /** Configuración del mundo */
  config: Partial<MundoConfig>
}

export interface MundoStore extends MundoState {
  // ─── Acciones ──────────────────────────────────────────────────────────────
  
  // Inicialización
  inicializarMundo: (programaUuid: string, sessionId: string, alumnoId: string, tema: string) => void
  setProgramaUuid: (uuid: string) => void
  cargarDesdeGuardado: (estado: Partial<MundoState>) => void
  
  // XP y nivel
  agregarXP: (xp: number, x?: number, y?: number) => void
  subirNivel: (nuevoNivel: NivelInfo) => void
  calcularProgresoNivel: () => void
  
  // Logros
  desbloquearLogro: (logro: MundoLogro['datos']) => void
  obtenerColeccionable: (id: string) => void
  
  // Zonas
  desbloquearZona: (zonaNumero: number, datos: Partial<ZonaEstado>) => void
  completarZona: (zonaNumero: number) => void
  setZonaActual: (zonaNumero: number) => void
  
  // Módulo
  setModuloActual: (moduloId: string | null) => void
  completarModulo: (moduloUuid: string, xpGanada: number, correcta: boolean) => void
  guardarRespuesta: (moduloUuid: string, intento: number, correcta: boolean, xpGanada: number) => void
  
  // Jugador
  setJugadorPosicion: (x: number, y: number) => void
  setJugadorDireccion: (direccion: 'izquierda' | 'derecha') => void
  setJugadorAnimacion: (animacion: JugadorEstado['animacion']) => void
  setJugadorPowerup: (powerup: JugadorEstado['powerup'], duracion?: number) => void
  perderVida: () => void
  incrementarRacha: () => void
  resetRacha: () => void
  
  // Cámara
  setCamaraPosicion: (x: number, y: number) => void
  setCamaraZoom: (zoom: number) => void
  
  // Gamificación
  showXpFloat: (xp: number, x: number, y: number) => void
  hideXpFloat: () => void
  showNivelUp: () => void
  hideNivelUp: () => void
  showLogro: (logro: MundoLogro['datos']) => void
  hideLogro: () => void
  
  // Sesión
  pausarSesion: () => void
  reanudarSesion: () => void
  setMundoListo: (listo: boolean) => void
  setBienvenidaMostrada: (mostrada: boolean) => void
  
  // Tiempo
  actualizarTiempoSesion: () => void
  
  // Reset
  reset: () => void
  resetCompleto: () => void
}

// ─── Configuración de niveles ────────────────────────────────────────────────

const NIVELES: NivelInfo[] = [
  { nivel: 1, nombre: 'Novato', xp_requerida: 100, badge: '⭐', color: 0x888888 },
  { nivel: 2, nombre: 'Aprendiz', xp_requerida: 250, badge: '⭐⭐', color: 0x3b82f6 },
  { nivel: 3, nombre: 'Explorador', xp_requerida: 500, badge: '⭐⭐⭐', color: 0x10b981 },
  { nivel: 4, nombre: 'Practicante', xp_requerida: 800, badge: '🌟', color: 0xf59e0b },
  { nivel: 5, nombre: 'Experto', xp_requerida: 1200, badge: '💎', color: 0x8b5cf6 },
  { nivel: 6, nombre: 'Maestro', xp_requerida: 1700, badge: '👑', color: 0xec4899 },
  { nivel: 7, nombre: 'Leyenda', xp_requerida: 2300, badge: '🏆', color: 0xfbbf24 },
  { nivel: 8, nombre: 'Héroe', xp_requerida: 3000, badge: '🦸', color: 0xef4444 },
  { nivel: 9, nombre: 'Campeón', xp_requerida: 3800, badge: '🎖️', color: 0x22c55e },
  { nivel: 10, nombre: 'Inmortal', xp_requerida: 5000, badge: '👼', color: 0xffffff },
]

function obtenerNivel(xp: number): NivelInfo {
  for (let i = NIVELES.length - 1; i >= 0; i--) {
    if (xp >= NIVELES[i].xp_requerida) {
      return NIVELES[i]
    }
  }
  return NIVELES[0]
}

function calcularProgresoNivel(xp: number, nivelActual: number): number {
  const nivelInfo = NIVELES.find(n => n.nivel === nivelActual)
  const siguienteNivel = NIVELES.find(n => n.nivel === nivelActual + 1)
  
  if (!nivelInfo || !siguienteNivel) return 100
  
  const xpEnNivel = xp - nivelInfo.xp_requerida
  const xpParaSiguiente = siguienteNivel.xp_requerida - nivelInfo.xp_requerida
  
  return Math.min(100, Math.round((xpEnNivel / xpParaSiguiente) * 100))
}

// ─── Estado inicial ──────────────────────────────────────────────────────────

const initialJugadorEstado: JugadorEstado = {
  x: 100,
  y: 400,
  direccion: 'derecha',
  animacion: 'idle',
  invencible: false,
  powerup: undefined,
  powerupRestante: undefined,
}

const initialConfig: Partial<MundoConfig> = {
  tilesAncho: 100,
  tilesAlto: 20,
  zonaInicio: 0,
  zonaFinal: 10,
  colores: {
    fondo: 0x0a0e27,
    suelo: 0x1a1f3a,
    plataforma: 0x2a3550,
    bloqueo: 0x4a1a1a,
    desbloqueado: 0x1a4a2a,
    completado: 0x4a4a1a,
    acento: 0xfbbf24,
  },
  jugador: {
    velocidad: 200,
    salto: 400,
    gravedad: 1200,
  },
  camara: {
    suavizado: 0.08,
    limiteIzquierdo: 0,
    limiteDerecho: 3000,
  },
}

const initialState: MundoState = {
  programaUuid: null,
  sessionId: null,
  alumnoId: null,
  tema: null,
  
  xpTotal: 0,
  xpSesion: 0,
  nivelActual: 1,
  progresoNivel: 0,
  logros: [],
  coleccionables: [],
  
  zonas: [],
  zonaActual: 0,
  moduloActual: null,
  modulosCompletados: [],
  respuestas: {},
  
  jugador: initialJugadorEstado,
  vidas: 3,
  racha: 0,
  mejorRacha: 0,
  tiempoSesion: 0,
  tiempoInicio: null,
  
  camaraX: 0,
  camaraY: 0,
  camaraZoom: 1,
  
  xpFloat: null,
  nivelUpActivo: false,
  logroActivo: null,
  powerupActivo: null,
  powerupRestante: 0,
  
  sesionPausada: false,
  mundoListo: false,
  bienvenidaMostrada: false,
  
  config: initialConfig,
}

let xpFloatKey = 0

// ─── Store ───────────────────────────────────────────────────────────────────

export const useMundoStore = create<MundoStore>()(persist((set, get) => ({
  ...initialState,

  // ─── Inicialización ────────────────────────────────────────────────────────
  
  inicializarMundo: (programaUuid, sessionId, alumnoId, tema) => set({
    programaUuid,
    sessionId,
    alumnoId,
    tema,
    xpTotal: 0,
    xpSesion: 0,
    nivelActual: 1,
    progresoNivel: 0,
    logros: [],
    coleccionables: [],
    zonas: [],
    zonaActual: 0,
    moduloActual: null,
    modulosCompletados: [],
    respuestas: {},
    jugador: { ...initialJugadorEstado },
    vidas: 3,
    racha: 0,
    mejorRacha: 0,
    tiempoSesion: 0,
    tiempoInicio: Date.now(),
    camaraX: 0,
    camaraY: 0,
    camaraZoom: 1,
    sesionPausada: false,
    mundoListo: false,
    bienvenidaMostrada: false,
  }),
  
  setProgramaUuid: (programaUuid) => set({ programaUuid }),

  cargarDesdeGuardado: (estado) => set((state) => ({
    ...state,
    ...estado,
    tiempoInicio: Date.now(),
    sesionPausada: false,
  })),

  // ─── XP y nivel ────────────────────────────────────────────────────────────
  
  agregarXP: (xp, x, y) => set((state) => {
    const nuevoXP = state.xpTotal + xp
    const nivelAnterior = state.nivelActual
    const nuevoNivel = obtenerNivel(nuevoXP)
    const subioDeNivel = nuevoNivel.nivel > nivelAnterior
    
    // Mostrar XP flotante si se proporcionaron coordenadas
    if (x !== undefined && y !== undefined) {
      const key = ++xpFloatKey
      set({ xpFloat: { id: `xp-${key}`, x, y, xp, key } })
      setTimeout(() => {
        if (get().xpFloat?.key === key) set({ xpFloat: null })
      }, 1400)
    }
    
    return {
      xpTotal: nuevoXP,
      xpSesion: state.xpSesion + xp,
      nivelActual: nuevoNivel.nivel,
      progresoNivel: calcularProgresoNivel(nuevoXP, nuevoNivel.nivel),
      nivelUpActivo: subioDeNivel ? true : state.nivelUpActivo,
    }
  }),

  subirNivel: (nuevoNivel) => set({
    nivelActual: nuevoNivel.nivel,
    nivelUpActivo: true,
  }),

  calcularProgresoNivel: () => set((state) => ({
    progresoNivel: calcularProgresoNivel(state.xpTotal, state.nivelActual),
  })),

  // ─── Logros ────────────────────────────────────────────────────────────────
  
  desbloquearLogro: (logro) => set((state) => {
    const yaDesbloqueado = state.logros.some(l => l.nombre === logro.nombre)
    if (yaDesbloqueado) return state
    
    return {
      logros: [...state.logros, logro],
      logroActivo: logro,
      xpTotal: state.xpTotal + logro.xp_bonus,
    }
  }),

  obtenerColeccionable: (id) => set((state) => ({
    coleccionables: [...state.coleccionables, id],
  })),

  // ─── Zonas ─────────────────────────────────────────────────────────────────
  
  desbloquearZona: (zonaNumero, datos) => set((state) => {
    const zonaExistente = state.zonas.find(z => z.numero === zonaNumero)
    
    if (zonaExistente) {
      return {
        zonas: state.zonas.map(z => 
          z.numero === zonaNumero 
            ? { ...z, ...datos, estado: 'disponible' as const }
            : z
        ),
      }
    }
    
    return {
      zonas: [...state.zonas, {
        numero: zonaNumero,
        estado: 'disponible',
        ...datos,
      }],
    }
  }),

  completarZona: (zonaNumero) => set((state) => ({
    zonas: state.zonas.map(z => 
      z.numero === zonaNumero 
        ? { ...z, estado: 'completada' as const, completada_en: Date.now() }
        : z
    ),
  })),

  setZonaActual: (zonaNumero) => set({ zonaActual: zonaNumero }),

  // ─── Módulo ────────────────────────────────────────────────────────────────
  
  setModuloActual: (moduloId) => set({ moduloActual: moduloId }),

  completarModulo: (moduloUuid, xpGanada, correcta) => set((state) => {
    const rachaIncrementada = correcta ? state.racha + 1 : 0
    const nuevaMejorRacha = Math.max(state.mejorRacha, rachaIncrementada)
    
    return {
      modulosCompletados: [...state.modulosCompletados, moduloUuid],
      racha: rachaIncrementada,
      mejorRacha: nuevaMejorRacha,
    }
  }),

  guardarRespuesta: (moduloUuid, intento, correcta, xpGanada) => set((state) => ({
    respuestas: {
      ...state.respuestas,
      [moduloUuid]: {
        intento,
        correcta,
        xp_ganada: xpGanada,
        timestamp: Date.now(),
      },
    },
  })),

  // ─── Jugador ───────────────────────────────────────────────────────────────
  
  setJugadorPosicion: (x, y) => set((state) => ({
    jugador: { ...state.jugador, x, y },
  })),

  setJugadorDireccion: (direccion) => set((state) => ({
    jugador: { ...state.jugador, direccion },
  })),

  setJugadorAnimacion: (animacion) => set((state) => ({
    jugador: { ...state.jugador, animacion },
  })),

  setJugadorPowerup: (powerup, duracion) => set((state) => ({
    jugador: { 
      ...state.jugador, 
      powerup,
      powerupRestante: duracion,
    },
    powerupActivo: powerup,
    powerupRestante: duracion ?? 0,
  })),

  perderVida: () => set((state) => ({
    vidas: Math.max(0, state.vidas - 1),
    racha: 0,
    jugador: {
      ...state.jugador,
      invencible: true,
    },
  })),

  incrementarRacha: () => set((state) => ({
    racha: state.racha + 1,
    mejorRacha: Math.max(state.mejorRacha, state.racha + 1),
  })),

  resetRacha: () => set({ racha: 0 }),

  // ─── Cámara ────────────────────────────────────────────────────────────────
  
  setCamaraPosicion: (x, y) => set({ camaraX: x, camaraY: y }),

  setCamaraZoom: (zoom) => set({ camaraZoom: zoom }),

  // ─── Gamificación ──────────────────────────────────────────────────────────
  
  showXpFloat: (xp, x, y) => {
    const key = ++xpFloatKey
    set({ xpFloat: { id: `xp-${key}`, x, y, xp, key } })
    setTimeout(() => {
      if (get().xpFloat?.key === key) set({ xpFloat: null })
    }, 1400)
  },

  hideXpFloat: () => set({ xpFloat: null }),

  showNivelUp: () => set({ nivelUpActivo: true }),

  hideNivelUp: () => set({ nivelUpActivo: false }),

  showLogro: (logro) => set({ logroActivo: logro }),

  hideLogro: () => set({ logroActivo: null }),

  // ─── Sesión ────────────────────────────────────────────────────────────────
  
  pausarSesion: () => set({ sesionPausada: true }),

  reanudarSesion: () => set({ sesionPausada: false }),

  setMundoListo: (listo) => set({ mundoListo: listo }),

  setBienvenidaMostrada: (mostrada) => set({ bienvenidaMostrada: mostrada }),

  // ─── Tiempo ────────────────────────────────────────────────────────────────
  
  actualizarTiempoSesion: () => set((state) => ({
    tiempoSesion: state.tiempoInicio ? Date.now() - state.tiempoInicio : 0,
  })),

  // ─── Reset ─────────────────────────────────────────────────────────────────
  
  reset: () => set({
    programaUuid: null,
    sessionId: null,
    alumnoId: null,
    tema: null,
    xpTotal: 0,
    xpSesion: 0,
    nivelActual: 1,
    progresoNivel: 0,
    logros: [],
    coleccionables: [],
    zonas: [],
    zonaActual: 0,
    moduloActual: null,
    modulosCompletados: [],
    respuestas: {},
    jugador: { ...initialJugadorEstado },
    vidas: 3,
    racha: 0,
    mejorRacha: 0,
    tiempoSesion: 0,
    tiempoInicio: null,
    camaraX: 0,
    camaraY: 0,
    camaraZoom: 1,
    xpFloat: null,
    nivelUpActivo: false,
    logroActivo: null,
    powerupActivo: null,
    powerupRestante: 0,
    sesionPausada: false,
    mundoListo: false,
    bienvenidaMostrada: false,
  }),

  resetCompleto: () => set(initialState),
}), {
  name: 'hivelearn-mundo-v1',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    programaUuid: state.programaUuid,
    sessionId: state.sessionId,
    alumnoId: state.alumnoId,
    tema: state.tema,
    xpTotal: state.xpTotal,
    xpSesion: state.xpSesion,
    nivelActual: state.nivelActual,
    logros: state.logros,
    coleccionables: state.coleccionables,
    zonas: state.zonas,
    zonaActual: state.zonaActual,
    modulosCompletados: state.modulosCompletados,
    respuestas: state.respuestas,
    vidas: state.vidas,
    mejorRacha: state.mejorRacha,
    config: state.config,
  }),
}))
