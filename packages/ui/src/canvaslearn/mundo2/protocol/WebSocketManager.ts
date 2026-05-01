/**
 * WebSocketManager — Gestión de conexión WebSocket bidireccional
 * 
 * Maneja la comunicación en tiempo real entre el mundo y los agentes
 * usando el protocolo A2UI extendido para el mundo de aprendizaje
 */

import type { 
  ClientMessage, 
  ServerMessage, 
  MundoEvento,
  A2UIMessage,
  MundoA2UIMessage,
} from '@hivelearn/core'

export interface WebSocketManagerOptions {
  /** URL del servidor WebSocket */
  wsUrl: string
  
  /** ID de sesión */
  sessionId: string
  
  /** ID del alumno */
  alumnoId: string
  
  /** Reconectar automáticamente */
  autoReconnect?: boolean
  
  /** Intervalo de reconexión (ms) */
  reconnectInterval?: number
  
  /** Timeout de conexión (ms) */
  connectionTimeout?: number
}

export type WebSocketState = 'connecting' | 'connected' | 'disconnected' | 'error'

export type MessageHandler = (message: ServerMessage) => void

/**
 * WebSocketManager — Gestiona conexión WebSocket
 */
export class WebSocketManager {
  /** WebSocket instance */
  private ws: WebSocket | null = null
  
  /** Estado actual */
  private state: WebSocketState = 'disconnected'
  
  /** Opciones */
  private options: Required<WebSocketManagerOptions>
  
  /** Handlers de mensajes por tipo */
  private handlers: Map<string, MessageHandler[]> = new Map()
  
  /** Cola de mensajes pendientes */
  private pendingMessages: ClientMessage[] = []
  
  /** Intentos de reconexión */
  private reconnectAttempts = 0
  
  /** Máximo de intentos de reconexión */
  private maxReconnectAttempts = 5
  
  /** Timeout de conexión */
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null
  
  /** Intervalo de heartbeat */
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null
  
  /** Callback de cambio de estado */
  public onStateChange?: (state: WebSocketState) => void
  
  /** Callback de error */
  public onError?: (error: Error) => void

  constructor(options: WebSocketManagerOptions) {
    this.options = {
      wsUrl: options.wsUrl,
      sessionId: options.sessionId,
      alumnoId: options.alumnoId,
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 3000,
      connectionTimeout: options.connectionTimeout ?? 10000,
    }
  }

  /**
   * Conectar al servidor
   */
  connect(): void {
    if (this.ws && (this.state === 'connected' || this.state === 'connecting')) {
      return
    }

    this.state = 'connecting'
    this.notifyStateChange()

    try {
      this.ws = new WebSocket(this.options.wsUrl)

      // Timeout de conexión
      this.connectionTimeoutId = setTimeout(() => {
        if (this.state === 'connecting') {
          this.handleConnectionError(new Error('Connection timeout'))
        }
      }, this.options.connectionTimeout)

      this.ws.onopen = () => this.handleOpen()
      this.ws.onclose = () => this.handleClose()
      this.ws.onerror = (error) => this.handleError(error)
      this.ws.onmessage = (event) => this.handleMessage(event)

    } catch (error) {
      this.handleConnectionError(error as Error)
    }
  }

  /**
   * Desconectar
   */
  disconnect(): void {
    this.stopHeartbeat()
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId)
      this.connectionTimeoutId = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.state = 'disconnected'
    this.notifyStateChange()
  }

  /**
   * Enviar mensaje
   */
  send(message: ClientMessage): void {
    if (this.state !== 'connected' || !this.ws) {
      // Encolar mensaje para enviar después
      this.pendingMessages.push(message)
      return
    }

    try {
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('Error sending message:', error)
      this.pendingMessages.push(message)
    }
  }

  /**
   * Enviar evento del mundo
   */
  sendMundoEvento(event: MundoEvento): void {
    const message: ClientMessage = {
      tipo: 'accion',
      session_id: this.options.sessionId,
      alumno_id: this.options.alumnoId,
      payload: {
        mundo_evento: event,
      },
      timestamp: new Date().toISOString(),
    }
    this.send(message)
  }

  /**
   * Enviar respuesta a ejercicio/quiz
   */
  sendRespuesta(
    moduloUuid: string,
    nodoId: string,
    respuesta: { tipo: string; valores: string[] | string },
    intentos: number
  ): void {
    const evento: MundoEvento = {
      tipo: 'mundo:evaluar',
      datos: {
        modulo_uuid: moduloUuid,
        nodo_id: nodoId,
        respuesta: respuesta as any,
        intentos,
      },
    }
    this.sendMundoEvento(evento)
  }

  /**
   * Suscribirse a tipo de mensaje
   */
  on(tipo: string, handler: MessageHandler): void {
    if (!this.handlers.has(tipo)) {
      this.handlers.set(tipo, [])
    }
    this.handlers.get(tipo)!.push(handler)
  }

  /**
   * Desuscribirse de tipo de mensaje
   */
  off(tipo: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(tipo)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /**
   * Limpiar todos los handlers
   */
  offAll(): void {
    this.handlers.clear()
  }

  /**
   * Manejar apertura de conexión
   */
  private handleOpen(): void {
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId)
      this.connectionTimeoutId = null
    }

    this.state = 'connected'
    this.reconnectAttempts = 0
    this.notifyStateChange()

    // Enviar mensaje de inicio de sesión
    this.sendInicioSesion()

    // Enviar mensajes pendientes
    this.flushPendingMessages()

    // Iniciar heartbeat
    this.startHeartbeat()
  }

  /**
   * Enviar mensaje de inicio de sesión
   */
  private sendInicioSesion(): void {
    const message: ClientMessage = {
      tipo: 'iniciar_sesion',
      session_id: this.options.sessionId,
      alumno_id: this.options.alumnoId,
      payload: {},
      timestamp: new Date().toISOString(),
    }
    this.send(message)
  }

  /**
   * Enviar mensajes pendientes
   */
  private flushPendingMessages(): void {
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift()!
      this.send(message)
    }
  }

  /**
   * Manejar cierre de conexión
   */
  private handleClose(): void {
    this.state = 'disconnected'
    this.notifyStateChange()
    this.stopHeartbeat()

    // Reconectar si está habilitado
    if (this.options.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect()
    }
  }

  /**
   * Manejar error
   */
  private handleError(error: Event): void {
    console.error('WebSocket error:', error)
    this.onError?.(new Error('WebSocket connection error'))
  }

  /**
   * Manejar error de conexión
   */
  private handleConnectionError(error: Error): void {
    console.error('Connection error:', error)
    this.state = 'error'
    this.notifyStateChange()
    this.onError?.(error)

    // Reconectar si está habilitado
    if (this.options.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect()
    }
  }

  /**
   * Manejar mensaje recibido
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: ServerMessage = JSON.parse(event.data)
      this.dispatchMessage(message)
    } catch (error) {
      console.error('Error parsing message:', error)
    }
  }

  /**
   * Despachar mensaje a handlers
   */
  private dispatchMessage(message: ServerMessage): void {
    // Handlers específicos por tipo
    const handlers = this.handlers.get(message.tipo)
    if (handlers) {
      handlers.forEach(handler => handler(message))
    }

    // Handlers generales (wildcard)
    const generalHandlers = this.handlers.get('*')
    if (generalHandlers) {
      generalHandlers.forEach(handler => handler(message))
    }

    // Procesar evento del mundo si existe
    if (message.payload.mundo_evento) {
      this.procesarMundoEvento(message.payload.mundo_evento)
    }

    // Procesar mensajes A2UI si existen
    if (message.payload.a2ui_messages) {
      this.procesarA2UIMessages(message.payload.a2ui_messages)
    }
  }

  /**
   * Procesar evento del mundo
   */
  private procesarMundoEvento(event: MundoEvento): void {
    // Los eventos del mundo se procesan en el MundoWorld component
    const handlers = this.handlers.get('mundo:*')
    if (handlers) {
      handlers.forEach(handler => handler({
        tipo: 'evento',
        session_id: this.options.sessionId,
        agente_id: 'system',
        payload: { mundo_evento: event },
        timestamp: new Date().toISOString(),
      }))
    }
  }

  /**
   * Procesar mensajes A2UI
   */
  private procesarA2UIMessages(messages: A2UIMessage[]): void {
    const handlers = this.handlers.get('a2ui:*')
    if (handlers) {
      handlers.forEach(handler => handler({
        tipo: 'contenido',
        session_id: this.options.sessionId,
        agente_id: 'system',
        payload: { a2ui_messages: messages },
        timestamp: new Date().toISOString(),
      }))
    }
  }

  /**
   * Notificar cambio de estado
   */
  private notifyStateChange(): void {
    this.onStateChange?.(this.state)
  }

  /**
   * Iniciar heartbeat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    
    this.heartbeatIntervalId = setInterval(() => {
      if (this.state === 'connected' && this.ws) {
        try {
          this.ws.send(JSON.stringify({
            tipo: 'heartbeat',
            timestamp: new Date().toISOString(),
          }))
        } catch (error) {
          console.error('Heartbeat error:', error)
        }
      }
    }, 30000) // 30 segundos
  }

  /**
   * Detener heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
      this.heartbeatIntervalId = null
    }
  }

  /**
   * Agendar reconexión
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++
    
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000
    )
    
    setTimeout(() => {
      if (this.state === 'disconnected' || this.state === 'error') {
        this.connect()
      }
    }, delay)
  }

  /**
   * Obtener estado actual
   */
  getState(): WebSocketState {
    return this.state
  }

  /**
   * Obtener WebSocket instance
   */
  getWebSocket(): WebSocket | null {
    return this.ws
  }
}

export default WebSocketManager
