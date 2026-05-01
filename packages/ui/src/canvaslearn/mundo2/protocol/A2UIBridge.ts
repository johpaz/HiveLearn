/**
 * A2UIBridge — Puente entre protocolo A2UI y acciones del mundo
 * 
 * Traduce mensajes A2UI del servidor a eventos/acciones del mundo PixiJS
 * y viceversa: acciones del jugador a mensajes A2UI para el servidor
 */

import type { 
  A2UIMessage, 
  MundoEvento,
  MundoBienvenida,
  MundoAbrirModulo,
  MundoContenido,
  MundoResultado,
  MundoNivelUp,
  MundoLogro,
  MundoCompletar,
  ServerMessage,
} from '@hivelearn/core'
import type { MundoWorldRef } from '../MundoWorld'
import { useMundoStore } from '../../../store/mundoStore'

export interface A2UIBridgeOptions {
  sessionId: string
  alumnoId: string
  mundoRef: MundoWorldRef
}

/**
 * A2UIBridge — Traduce entre A2UI y mundo
 */
export class A2UIBridge {
  private sessionId: string
  private alumnoId: string
  private mundoRef: MundoWorldRef
  private messageQueue: A2UIMessage[] = []
  private eventQueue: MundoEvento[] = []

  constructor(options: A2UIBridgeOptions) {
    this.sessionId = options.sessionId
    this.alumnoId = options.alumnoId
    this.mundoRef = options.mundoRef
  }

  // ─── Servidor → Mundo (procesar mensajes entrantes) ────────────────────────

  /**
   * Procesar mensaje del servidor
   */
  procesarMensajeServidor(message: ServerMessage): void {
    const { tipo, payload } = message

    switch (tipo) {
      case 'bienvenida':
        this.procesarBienvenida(payload.mundo_evento as MundoBienvenida)
        break
      
      case 'contenido':
        this.procesarContenido(payload.a2ui_messages || [])
        break
      
      case 'resultado':
        this.procesarResultado(payload.mundo_evento as MundoResultado)
        break
      
      case 'evento':
        this.procesarEvento(payload.mundo_evento as MundoEvento)
        break
      
      case 'error':
        this.procesarError(payload)
        break
    }
  }

  /**
   * Procesar bienvenida
   */
  private procesarBienvenida(event: MundoBienvenida): void {
    const { agregarXP, setBienvenidaMostrada } = useMundoStore.getState()
    
    // Mostrar mensaje de bienvenida del coordinador
    this.mundoRef.zoneManager?.mostrarBienvenida(
      event.datos.nickname,
      event.datos.tema
    )

    // Otorgar XP de bienvenida
    agregarXP(event.datos.nivel_previo === 'principiante' ? 50 : 25)

    // Marcar bienvenida como mostrada
    setBienvenidaMostrada(true)

    // Desbloquear primera zona
    this.mundoRef.zoneManager?.desbloquearZona(0)
  }

  /**
   * Procesar contenido A2UI
   */
  private procesarContenido(messages: A2UIMessage[]): void {
    // Los mensajes A2UI se renderizan en el overlay React
    // El mundo puede mostrar una indicación visual de que hay contenido disponible
    const zonaActual = this.mundoRef.zoneManager?.getZonaActual()
    
    if (zonaActual) {
      // Mostrar indicador visual sobre la zona
      this.mundoRef.zoneManager?.mostrarDialogo(
        zonaActual.x + zonaActual.ancho / 2,
        zonaActual.y - 120,
        '¡Nuevo contenido disponible! 📚'
      )
    }

    // Enqueue messages for A2UIRenderer
    this.messageQueue.push(...messages)
  }

  /**
   * Procesar resultado de evaluación
   */
  private procesarResultado(event: MundoResultado): void {
    const { agregarXP, completarModulo, guardarRespuesta, desbloquearLogro } = useMundoStore.getState()
    
    const { calificacion, xp, feedback, razonamiento, pista, siguiente, logro_desbloqueado } = event.datos

    // Obtener nodo actual
    const zonaActual = this.mundoRef.zoneManager?.getZonaActual()
    if (!zonaActual) return

    // Determinar si es correcto
    const correcta = calificacion === 'correcto'

    // Otorgar XP
    if (xp > 0) {
      const jugadorPos = this.mundoRef.playerRef?.current || { x: 0, y: 0 }
      agregarXP(xp, jugadorPos.x, jugadorPos.y - 50)
    }

    // Guardar respuesta
    guardarRespuesta(zonaActual.moduloUuid || '', 1, correcta, xp)

    // Completar módulo si es correcto
    if (correcta) {
      completarModulo(zonaActual.moduloUuid || '', xp, correcta)
      
      // Marcar zona como completada
      this.mundoRef.zoneManager?.completarZona(zonaActual.numero)

      // Mostrar feedback visual
      this.mostrarFeedbackVisual('correcto', feedback, razonamiento)

      // Mover a siguiente zona si existe
      if (siguiente) {
        this.moverASiguienteZona(siguiente.zona_numero, siguiente.animacion_transicion)
      }
    } else {
      // Mostrar feedback para respuesta incorrecta
      this.mostrarFeedbackVisual('incorrecto', feedback, pista)
    }

    // Desbloquear logro si existe
    if (logro_desbloqueado) {
      const logro = {
        nombre: logro_desbloqueado.nombre,
        descripcion: logro_desbloqueado.descripcion,
        icono: logro_desbloqueado.icono,
        xp_bonus: logro_desbloqueado.xp_bonus,
        rareza: 'comun' as const,
      }
      desbloquearLogro(logro)
      this.mostrarLogro(logro)
    }
  }

  /**
   * Procesar evento genérico del mundo
   */
  private procesarEvento(event: MundoEvento): void {
    const { agregarXP, subirNivel, showLogro } = useMundoStore.getState()

    switch (event.tipo) {
      case 'mundo:nivel_up':
        this.procesarNivelUp(event.datos)
        break
      
      case 'mundo:logro':
        const logro = event.datos
        showLogro({
          nombre: logro.nombre,
          descripcion: logro.descripcion,
          icono: logro.icono,
          xp_bonus: logro.xp_bonus,
          rareza: logro.rareza,
        })
        agregarXP(logro.xp_bonus)
        break
      
      case 'mundo:completar':
        this.procesarCompletar(event.datos)
        break
      
      case 'mundo:actualizar_estado':
        // Sincronizar estado
        break
      
      case 'mundo:error':
        this.procesarErrorMundo(event.datos)
        break
    }
  }

  /**
   * Procesar nivel up
   */
  private procesarNivelUp(datos: MundoNivelUp['datos']): void {
    const { subirNivel, showNivelUp } = useMundoStore.getState()
    
    // Actualizar nivel en store
    subirNivel({
      nivel: datos.nivel_nuevo,
      nombre: datos.nivel_nombre,
      xp_requerida: datos.xp_actual,
      badge: datos.badge || '⭐',
      color: 0xfbbf24,
    })

    // Mostrar animación de nivel up
    showNivelUp()

    // Efectos de partículas
    const jugadorPos = this.mundoRef.playerRef?.current || { x: 0, y: 0 }
    this.mundoRef.particleSystem?.levelUpExplosion(jugadorPos.x, jugadorPos.y - 50)

    // Efectos según configuración
    if (datos.efectos === 'todos' || datos.efectos === 'confeti') {
      this.mundoRef.particleSystem?.confetti(jugadorPos.x, jugadorPos.y - 100, 100)
    }
  }

  /**
   * Procesar completar programa
   */
  private procesarCompletar(datos: MundoCompletar['datos']): void {
    const { resumen_final, mensaje_final, proximos_pasos } = datos

    // Mostrar celebración final
    const jugadorPos = this.mundoRef.playerRef?.current || { x: 0, y: 0 }
    
    // Fuegos artificiales de partículas
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.mundoRef.particleSystem?.confetti(
          jugadorPos.x + (Math.random() - 0.5) * 200,
          jugadorPos.y - 100,
          50
        )
      }, i * 300)
    }

    // Mostrar mensaje final
    this.mundoRef.zoneManager?.mostrarDialogo(
      jugadorPos.x,
      jugadorPos.y - 150,
      `${mensaje_final}\n\nXP Total: ${resumen_final.xp_total}\nNivel: ${resumen_final.nivel_alcanzado}\nLogros: ${resumen_final.logros_obtenidos}`
    )
  }

  /**
   * Mostrar feedback visual
   */
  private mostrarFeedbackVisual(
    tipo: 'correcto' | 'incorrecto',
    mensaje: string,
    detalle?: string
  ): void {
    const jugadorPos = this.mundoRef.playerRef?.current || { x: 0, y: 0 }
    
    this.mundoRef.zoneManager?.mostrarDialogo(
      jugadorPos.x,
      jugadorPos.y - 100,
      tipo === 'correcto' ? `✅ ${mensaje}` : `💡 ${mensaje}`
    )

    // Partículas según tipo
    if (tipo === 'correcto') {
      this.mundoRef.particleSystem?.xpExplosion(jugadorPos.x, jugadorPos.y - 50, 20)
    }
  }

  /**
   * Mostrar logro
   */
  private mostrarLogro(logro: { nombre: string; descripcion: string; icono: string; xp_bonus: number }): void {
    const jugadorPos = this.mundoRef.playerRef?.current || { x: 0, y: 0 }
    
    // Partículas de logro
    this.mundoRef.particleSystem?.achievementExplosion(jugadorPos.x, jugadorPos.y - 50)
  }

  /**
   * Mover a siguiente zona
   */
  private moverASiguienteZona(zonaNumero: number, animacion: string): void {
    const player = this.mundoRef.playerRef?.current
    const zona = this.mundoRef.zoneManager?.getZona(zonaNumero)
    
    if (player && zona) {
      // Mover jugador hacia la zona
      const targetX = zona.x + zona.ancho / 2
      
      // Animación de transición
      if (animacion === 'teletransportar') {
        // Teletransportar instantáneamente
        player.x = targetX
      } else {
        // Caminar/correr hacia la zona
        const direccion = targetX > player.x ? 'derecha' : 'izquierda'
        player.direccion = direccion
        
        // El game loop se encargará del movimiento
      }
    }
  }

  /**
   * Procesar error del mundo
   */
  private procesarErrorMundo(datos: any): void {
    console.error('Error del mundo:', datos)
    
    const jugadorPos = this.mundoRef.playerRef?.current || { x: 0, y: 0 }
    
    this.mundoRef.zoneManager?.mostrarDialogo(
      jugadorPos.x,
      jugadorPos.y - 100,
      `❌ Error: ${datos.mensaje}`
    )
  }

  /**
   * Procesar error genérico
   */
  private procesarError(payload: any): void {
    console.error('Error del servidor:', payload)
  }

  // ─── Mundo → Servidor (enviar mensajes salientes) ──────────────────────────

  /**
   * Enviar respuesta del alumno
   */
  enviarRespuesta(
    moduloUuid: string,
    nodoId: string,
    respuesta: { tipo: 'multiple_choice' | 'texto' | 'codigo'; valores: string[] | string },
    intentos: number
  ): void {
    const evento: MundoEvento = {
      tipo: 'mundo:evaluar',
      datos: {
        modulo_uuid: moduloUuid,
        nodo_id: nodoId,
        respuesta,
        intentos,
        tiempo_respuesta_ms: Date.now(),
      },
    }

    this.eventQueue.push(evento)
    
    // Enviar vía WebSocket (se implementa en MundoWorld)
    if (this.mundoRef.wsManager) {
      this.mundoRef.wsManager.sendRespuesta(moduloUuid, nodoId, respuesta, intentos)
    }
  }

  /**
   * Enviar acción del jugador
   */
  enviarAccion(accion: string, contexto: Record<string, any>): void {
    const evento: MundoEvento = {
      tipo: 'mundo:actualizar_estado',
      datos: {
        accion,
        contexto,
      },
    } as any

    this.eventQueue.push(evento)
  }

  /**
   * Enviar interacción con zona
   */
  enviarInteraccionZona(zonaNumero: number, accion: 'entrar' | 'salir' | 'completar'): void {
    this.enviarAccion('interaccion_zona', {
      zona: zonaNumero,
      accion,
      timestamp: Date.now(),
    })
  }

  /**
   * Enviar interacción con coleccionable
   */
  enviarColeccionableRecogido(coleccionableId: string, tipo: string, valor: number): void {
    this.enviarAccion('coleccionable_recogido', {
      coleccionable_id: coleccionableId,
      tipo,
      valor,
      timestamp: Date.now(),
    })
  }

  // ─── Utilidades ────────────────────────────────────────────────────────────

  /**
   * Obtener cola de mensajes A2UI pendientes
   */
  getMessageQueue(): A2UIMessage[] {
    return [...this.messageQueue]
  }

  /**
   * Limpiar cola de mensajes
   */
  clearMessageQueue(): void {
    this.messageQueue = []
  }

  /**
   * Obtener cola de eventos pendientes
   */
  getEventQueue(): MundoEvento[] {
    return [...this.eventQueue]
  }

  /**
   * Limpiar cola de eventos
   */
  clearEventQueue(): void {
    this.eventQueue = []
  }

  /**
   * Destruir bridge
   */
  destroy(): void {
    this.clearMessageQueue()
    this.clearEventQueue()
  }
}

export default A2UIBridge
