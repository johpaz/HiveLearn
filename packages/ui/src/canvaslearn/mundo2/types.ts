/**
 * Mundo de Aprendizaje HiveLearn — Tipos
 * 
 * Tipos TypeScript específicos para el mundo pixel art dinámico
 */

import type { Container, Graphics, Sprite, Text, ParticleContainer } from 'pixi.js'

// ─── Tipos de zonas ──────────────────────────────────────────────────────────

export type ZonaEstado = 'bloqueada' | 'disponible' | 'completada'

export interface Zona {
  numero: number
  estado: ZonaEstado
  x: number
  y: number
  ancho: number
  alto: number
  moduloUuid?: string
  agenteId?: string
  titulo?: string
  tipoPedagogico?: string
  xpRecompensa?: number
  plataforma?: Plataforma[]
  enemigos?: Enemigo[]
  coleccionables?: Coleccionable[]
  puerta?: Puerta
}

// ─── Tipos de plataformas ────────────────────────────────────────────────────

export interface Plataforma {
  id: string
  x: number
  y: number
  ancho: number
  alto: number
  tipo: 'suelo' | 'plataforma' | 'movil' | 'quebradiza'
  direccion?: 'izquierda' | 'derecha'
  velocidad?: number
  recorrido?: number
  activo?: boolean
}

// ─── Tipos de jugador ────────────────────────────────────────────────────────

export type JugadorAnimacion = 'idle' | 'caminar' | 'correr' | 'saltar' | 'caer' | 'aterrizar' | 'interactuando' | 'dano'

export type JugadorDireccion = 'izquierda' | 'derecha'

export type PowerUpType = 'velocidad' | 'salto' | 'doble_salto' | 'invencibilidad' | 'vidas'

export interface Jugador {
  // Posición y físicas
  x: number
  y: number
  vx: number
  vy: number
  direccion: JugadorDireccion
  enSuelo: boolean
  saltosDisponibles: number
  
  // Estado
  animacion: JugadorAnimacion
  invencible: boolean
  powerup?: PowerUpType
  powerupRestante?: number
  
  // Vidas y progreso
  vidas: number
  racha: number
  
  // Render
  sprite?: Container
  cuerpo?: Graphics
  ojos?: Graphics
  boca?: Graphics
  particulasEstela?: ParticleContainer
}

// ─── Tipos de cámara ─────────────────────────────────────────────────────────

export interface Camara {
  x: number
  y: number
  zoom: number
  objetivoX: number
  objetivoY: number
  siguiendoJugador: boolean
}

// ─── Tipos de partículas ─────────────────────────────────────────────────────

export interface Particula {
  x: number
  y: number
  vx: number
  vy: number
  vida: number
  vidaMax: number
  tamanio: number
  color: number
  rotacion: number
  rotacionVelocidad: number
}

export type ParticulasTipo = 'xp' | 'nivelUp' | 'logro' | 'estela' | 'polvo' | 'chispas' | 'confeti'

export interface SistemaParticulas {
  tipo: ParticulasTipo
  particulas: Particula[]
  activo: boolean
  loop?: boolean
}

// ─── Tipos de coleccionables ─────────────────────────────────────────────────

export type ColeccionableTipo = 'xp' | 'vida' | 'powerup' | 'logro' | 'moneda'

export interface Coleccionable {
  id: string
  tipo: ColeccionableTipo
  x: number
  y: number
  ancho: number
  alto: number
  valor?: number
  recogido: boolean
  sprite?: Container
  animacionOffset: number
}

// ─── Tipos de puertas/portales ───────────────────────────────────────────────

export interface Puerta {
  x: number
  y: number
  ancho: number
  alto: number
  zonaDestino: number
  bloqueada: boolean
  sprite?: Container
}

// ─── Tipos de enemigos (opcional para futuro) ────────────────────────────────

export interface Enemigo {
  id: string
  tipo: 'estatico' | 'patrol' | 'saltarin'
  x: number
  y: number
  ancho: number
  alto: number
  direccion?: 'izquierda' | 'derecha'
  recorrido?: number
  velocidad?: number
  dano: number
  sprite?: Container
}

// ─── Tipos de UI ─────────────────────────────────────────────────────────────

export interface XPBarProps {
  xpActual: number
  xpSiguienteNivel: number
  nivelActual: number
  animacion?: boolean
}

export interface MiniMapProps {
  zonas: Zona[]
  zonaActual: number
  jugadorX: number
  jugadorZona: number
}

export interface LogroPopupProps {
  nombre: string
  descripcion: string
  icono: string
  rareza: 'comun' | 'raro' | 'epico' | 'legendario'
  xpBonus: number
}

export interface FloatingText {
  id: string
  texto: string
  x: number
  y: number
  vy: number
  vida: number
  color: number
  tamanio: number
}

// ─── Tipos de eventos sorpresa ───────────────────────────────────────────────

export type SorpresaTipo = 'xp_bonus' | 'powerup_gratis' | 'vida_extra' | 'logro_secreto'

export interface Sorpresa {
  tipo: SorpresaTipo
  x: number
  y: number
  activo: boolean
  duracion?: number
  sprite?: Container
  animacionOffset: number
}

// ─── Tipos de mundo principal ────────────────────────────────────────────────

export interface MundoProps {
  programaUuid: string
  sessionId: string
  alumnoId: string
  nickname: string
  avatar: string
  tema: string
}

export interface MundoRef {
  app: Container
  world: Container
  jugador?: Jugador
  camara?: Camara
  zonas: Zona[]
  plataformas: Plataforma[]
  coleccionables: Coleccionable[]
  particulas: SistemaParticulas[]
  ui: Container
  xpBar?: Container
  miniMap?: Container
}

// ─── Tipos de agente/personaje ───────────────────────────────────────────────

export interface AgentePersonaje {
  id: string
  tipo: 'coordinador' | 'pedagogico' | 'monitor'
  x: number
  y: number
  sprite?: Container
  cuerpo?: Graphics
  ojos?: Graphics
  boca?: Graphics
  burbujaDialogo?: Container
  animacion: 'idle' | 'hablando' | 'saltando' | 'celebrando'
  color: number
  emoji: string
  nombre: string
  rol: string
}

// ─── Tipos de A2UI bridge ────────────────────────────────────────────────────

export interface A2UIBridgeState {
  conectado: boolean
  sessionId: string | null
  mensajesPendientes: any[]
  ultimoMensaje?: any
}

// ─── Tipos de guardado/carga ─────────────────────────────────────────────────

export interface MundoGuardado {
  programaUuid: string
  sessionId: string
  alumnoId: string
  xpTotal: number
  nivel: number
  zonaActual: number
  nodosCompletados: string[]
  logros: string[]
  coleccionables: string[]
  vidas: number
  mejorRacha: number
  timestamp: number
}

// ─── Eventos del mundo ───────────────────────────────────────────────────────

export interface MundoEventoCustom {
  tipo: 'jugador_movio' | 'jugador_salto' | 'jugador_aterrizo' | 
        'zona_desbloqueada' | 'zona_completada' | 'xp_ganada' | 
        'nivel_subio' | 'logro_desbloqueado' | 'powerup_activado' |
        'coleccionable_recogido' | 'sorpresa_activada'
  datos: any
}
