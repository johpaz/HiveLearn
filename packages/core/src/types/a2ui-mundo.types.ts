/**
 * A2UI Protocol v0.8 — Tipos para Canvas 2: Mundo de Aprendizaje
 * 
 * Extiende el protocolo A2UI existente para soportar la comunicación
 * bidireccional entre el mundo pixel art y los agentes mediante WebSocket.
 */

// ─── Tipos base del protocolo A2UI (importados de A2UIRenderer) ──────────────

export interface BoundValue {
  literalString?: string
  path?: string
}

export interface A2UIAction {
  name: string
  context?: Array<{ key: string; value: BoundValue }>
}

export interface ComponentDef {
  id: string
  weight?: number
  component: Record<string, any>
}

export interface SurfaceUpdate {
  surfaceId: string
  components: ComponentDef[]
}

export interface DataEntry {
  key: string
  valueString?: string
  valueMap?: DataEntry[]
}

export interface DataModelUpdate {
  surfaceId: string
  contents: DataEntry[]
}

export interface BeginRendering {
  surfaceId: string
  root: string
  styles?: { font?: string; primaryColor?: string }
}

export interface A2UIMessage {
  surfaceUpdate?: SurfaceUpdate
  dataModelUpdate?: DataModelUpdate
  beginRendering?: BeginRendering
}

// ─── Tipos específicos del Mundo de Aprendizaje (Canvas 2) ───────────────────

/**
 * Evento: Bienvenida al mundo
 * Trigger: Cuando el alumno inicia la sesión por primera vez
 * El coordinador saluda al alumno por su nickname y entrega el primer módulo
 */
export interface MundoBienvenida {
  tipo: 'mundo:bienvenida'
  datos: {
    nickname: string
    avatar: string
    mensaje_agente: string
    programa_uuid: string
    tema: string
    nivel_previo: string
  }
}

/**
 * Evento: Abrir módulo
 * Trigger: Cuando se desbloquea una nueva zona del mundo
 * Animación de apertura con efecto visual
 */
export interface MundoAbrirModulo {
  tipo: 'mundo:abrir_modulo'
  datos: {
    modulo_uuid: string
    titulo: string
    agente_id: string
    zona_numero: number
    tipo_pedagogico: 'concept' | 'exercise' | 'quiz' | 'challenge' | 'milestone'
    xp_recompensa: number
    animacion?: 'apertura' | 'deslizamiento' | 'explosion'
  }
}

/**
 * Evento: Contenido del módulo
 * Trigger: Cuando el agente pedagógico entrega el contenido
 * Usa los tipos A2UI existentes para renderizar el contenido
 */
export interface MundoContenido {
  tipo: 'mundo:contenido'
  datos: {
    tipo: 'explicacion' | 'ejercicio' | 'quiz' | 'reto' | 'codigo' | 'svg' | 'gif' | 'infografia' | 'evaluacion'
    agente_id: string
    a2ui_messages: A2UIMessage[]
    tiempo_limite_ms?: number
  }
}

/**
 * Evento: Evaluar respuesta del alumno
 * Trigger: Cuando el alumno completa un ejercicio o quiz
 * El agente evaluador procesa la respuesta
 */
export interface MundoEvaluar {
  tipo: 'mundo:evaluar'
  datos: {
    modulo_uuid: string
    nodo_id: string
    respuesta: {
      tipo: 'multiple_choice' | 'texto' | 'codigo'
      valores: string[] | string
    }
    tiempo_respuesta_ms?: number
    intentos: number
  }
}

/**
 * Evento: Resultado de evaluación
 * Trigger: Después de que el agente evaluador procesa la respuesta
 * Otorga XP, feedback y avanza al siguiente módulo si corresponde
 */
export interface MundoResultado {
  tipo: 'mundo:resultado'
  datos: {
    calificacion: 'correcto' | 'incorrecto' | 'parcial'
    xp: number
    feedback: string
    razonamiento?: string
    pista?: string
    siguiente?: {
      modulo_uuid: string
      zona_numero: number
      animacion_transicion: 'caminar' | 'teletransportar' | 'correr'
    }
    logro_desbloqueado?: {
      nombre: string
      descripcion: string
      icono: string
      xp_bonus: number
    }
  }
}

/**
 * Evento: Subir de nivel
 * Trigger: Cuando el alumno acumula suficiente XP
 * Muestra animación de celebración con efectos
 */
export interface MundoNivelUp {
  tipo: 'mundo:nivel_up'
  datos: {
    nivel_nuevo: number
    nivel_nombre: string
    mensaje: string
    xp_anterior: number
    xp_actual: number
    badge?: string
    efectos: 'confeti' | 'fuegos_artificiales' | 'brillo' | 'todos'
  }
}

/**
 * Evento: Desbloquear logro
 * Trigger: Cuando el alumno completa un hito especial
 * Muestra notificación con ícono pixel art
 */
export interface MundoLogro {
  tipo: 'mundo:logro'
  datos: {
    nombre: string
    descripcion: string
    icono: string
    xp_bonus: number
    rareza: 'comun' | 'raro' | 'epico' | 'legendario'
    coleccionable_id?: string
  }
}

/**
 * Evento: Completar programa
 * Trigger: Cuando el alumno termina todas las zonas del mundo
 * Muestra resumen final y celebración
 */
export interface MundoCompletar {
  tipo: 'mundo:completar'
  datos: {
    programa_uuid: string
    resumen_final: {
      xp_total: number
      nivel_alcanzado: string
      logros_obtenidos: number
      tiempo_total_ms: number
      precision: number
    }
    mensaje_final: string
    proximos_pasos?: string[]
  }
}

/**
 * Evento: Actualizar estado del jugador
 * Trigger: Periódicamente para sincronizar estado
 */
export interface MundoActualizarEstado {
  tipo: 'mundo:actualizar_estado'
  datos: {
    xp_actual: number
    nivel_actual: number
    zona_actual: number
    vidas: number
    racha: number
    nodos_completados: string[]
    logros: string[]
  }
}

/**
 * Evento: Error en el mundo
 * Trigger: Cuando ocurre un error en la comunicación o procesamiento
 */
export interface MundoError {
  tipo: 'mundo:error'
  datos: {
    codigo: 'timeout' | 'validacion' | 'servidor' | 'red' | 'desconocido'
    mensaje: string
    recuperable: boolean
    accion_sugerida?: 'reintentar' | 'saltar' | 'terminar'
  }
}

// ─── Unión de todos los tipos de eventos del mundo ───────────────────────────

export type MundoEvento =
  | MundoBienvenida
  | MundoAbrirModulo
  | MundoContenido
  | MundoEvaluar
  | MundoResultado
  | MundoNivelUp
  | MundoLogro
  | MundoCompletar
  | MundoActualizarEstado
  | MundoError

// ─── Tipos para mensajes A2UI extendidos con eventos del mundo ───────────────

export interface MundoA2UIMessage extends A2UIMessage {
  mundoEvento?: MundoEvento
}

// ─── Protocolo WebSocket para comunicación bidireccional ─────────────────────

/**
 * Mensaje del cliente (alumno/mundo) al servidor (agentes)
 */
export interface ClientMessage {
  tipo: 'iniciar_sesion' | 'responder' | 'accion' | 'pausar' | 'reanudar' | 'error'
  session_id: string
  alumno_id: string
  payload: {
    mundo_evento?: MundoEvento
    a2ui_action?: A2UIAction
    [key: string]: any
  }
  timestamp: string
}

/**
 * Mensaje del servidor (agentes) al cliente (alumno/mundo)
 */
export interface ServerMessage {
  tipo: 'bienvenida' | 'contenido' | 'resultado' | 'evento' | 'error'
  session_id: string
  agente_id: string
  payload: {
    mundo_evento?: MundoEvento
    a2ui_messages?: A2UIMessage[]
    [key: string]: any
  }
  timestamp: string
  correlation_id?: string
}

// ─── Configuración del mundo ─────────────────────────────────────────────────

export interface MundoConfig {
  /** Dimensiones del mundo en tiles (1 tile = 32px) */
  tilesAncho: number
  tilesAlto: number
  
  /** Zona inicial (bienvenida) */
  zonaInicio: number
  
  /** Zona final (evaluación) */
  zonaFinal: number
  
  /** Colores de la paleta pixel art */
  colores: {
    fondo: number
    suelo: number
    plataforma: number
    bloqueo: number
    desbloqueado: number
    completado: number
    acento: number
  }
  
  /** Configuración del jugador */
  jugador: {
    velocidad: number
    salto: number
    gravedad: number
  }
  
  /** Configuración de la cámara */
  camara: {
    suavizado: number
    limiteIzquierdo: number
    limiteDerecho: number
  }
}

// ─── Estado del mundo ────────────────────────────────────────────────────────

export interface MundoEstado {
  /** UUID del programa actual */
  programaUuid: string
  
  /** Zona actual del jugador (0 = bienvenida, N = final) */
  zonaActual: number
  
  /** Módulo actual dentro de la zona */
  moduloActual: string | null
  
  /** XP total acumulado */
  xpTotal: number
  
  /** Nivel actual del jugador */
  nivel: number
  
  /** Logros desbloqueados */
  logros: MundoLogro['datos'][]
  
  /** Nodos completados */
  nodosCompletados: string[]
  
  /** Estado de cada zona */
  zonas: {
    numero: number
    estado: 'bloqueada' | 'disponible' | 'completada'
    modulo_uuid?: string
    agente_id?: string
  }[]
  
  /** Posición del jugador en el mundo */
  jugadorPosicion: {
    x: number
    y: number
    direccion: 'izquierda' | 'derecha'
    animacion: 'idle' | 'caminar' | 'saltar' | 'correr'
  }
  
  /** Estado de la cámara */
  camaraPosicion: {
    x: number
    y: number
  }
  
  /** Vidas restantes */
  vidas: number
  
  /** Racha actual */
  racha: number
}
