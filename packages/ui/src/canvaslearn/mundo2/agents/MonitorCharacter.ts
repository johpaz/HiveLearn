/**
 * MonitorCharacter — Personaje del Agente Monitor
 * 
 * Sprite pixel art del agente monitor (búho/ojo observador)
 * Vuela sobre el mundo observando todo
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { COLORS, TILE_SIZE, WORLD_WIDTH } from '../constants'

export interface MonitorCharacterOptions {
  x?: number
  y?: number
}

/**
 * MonitorCharacter — Personaje del monitor (búho observador)
 */
export class MonitorCharacter extends Container {
  /** Posición objetivo X (para patrulla) */
  private targetX: number = 0
  
  /** Posición objetivo Y (para patrulla) */
  private targetY: number = 0
  
  /** Velocidad de vuelo */
  private velocidad: number = 50
  
  /** Animación actual */
  public animacion: 'idle' | 'volando' | 'observando' | 'sorprendido' = 'volando'
  
  /** Contenedor principal */
  private container: Container
  
  /** Cuerpo del búho */
  private cuerpo: Graphics
  
  /** Alas */
  private alas: Graphics
  
  /** Ojos grandes */
  private ojos: Graphics
  
  /** Pico */
  private pico: Graphics
  
  /** Patas */
  private patas: Graphics
  
  /** Burbuja de diálogo */
  private burbujaDialogo: Container | null = null
  
  /** Timer de animación */
  private animTimer: number = 0
  
  /** Dirección del vuelo */
  private direccion: number = 1

  constructor(options?: MonitorCharacterOptions) {
    super()
    
    this.x = options?.x ?? WORLD_WIDTH / 2
    this.y = options?.y ?? 80
    
    // Objetivo inicial aleatorio
    this.targetX = this.x + (Math.random() - 0.5) * 400
    this.targetY = this.y + (Math.random() - 0.5) * 50
    
    // Crear contenedor
    this.container = new Container()
    
    // Crear partes del búho (orden de atrás hacia adelante)
    this.alas = this.crearAlas()
    this.cuerpo = this.crearCuerpo()
    this.patas = this.crearPatas()
    this.ojos = this.crearOjos()
    this.pico = this.crearPico()
    
    // Añadir al contenedor
    this.container.addChild(this.alas)
    this.container.addChild(this.cuerpo)
    this.container.addChild(this.patas)
    this.container.addChild(this.ojos)
    this.container.addChild(this.pico)
    
    // Añadir al padre
    this.addChild(this.container)
    
    // Dibujar estado inicial
    this.dibujar()
  }

  /**
   * Crear cuerpo del búho
   */
  private crearCuerpo(): Graphics {
    const cuerpo = new Graphics()
    
    // Cuerpo ovalado (búho)
    cuerpo.ellipse(0, 0, 20, 25)
    cuerpo.fill({ color: 0x8b5cf6, alpha: 0.9 })
    cuerpo.stroke({ color: 0x6d28d9, width: 2 })
    
    // Pecho (más claro)
    cuerpo.ellipse(0, 5, 14, 16)
    cuerpo.fill({ color: 0xa78bfa, alpha: 0.8 })
    
    // Patrones de plumas
    for (let i = 0; i < 5; i++) {
      const y = -10 + i * 6
      cuerpo.moveTo(-12, y)
      cuerpo.quadraticCurveTo(-8, y + 3, -12, y + 6)
      cuerpo.stroke({ color: 0x6d28d9, width: 1, alpha: 0.5 })
      
      cuerpo.moveTo(12, y)
      cuerpo.quadraticCurveTo(8, y + 3, 12, y + 6)
      cuerpo.stroke({ color: 0x6d28d9, width: 1, alpha: 0.5 })
    }
    
    return cuerpo
  }

  /**
   * Crear alas
   */
  private crearAlas(): Graphics {
    const alas = new Graphics()
    
    // Ala izquierda
    alas.moveTo(-18, -5)
    alas.quadraticCurveTo(-35, 0, -38, 15)
    alas.quadraticCurveTo(-30, 10, -22, 5)
    alas.closePath()
    alas.fill({ color: 0x7c3aed, alpha: 0.9 })
    alas.stroke({ color: 0x6d28d9, width: 2 })
    
    // Ala derecha
    alas.moveTo(18, -5)
    alas.quadraticCurveTo(35, 0, 38, 15)
    alas.quadraticCurveTo(30, 10, 22, 5)
    alas.closePath()
    alas.fill({ color: 0x7c3aed, alpha: 0.9 })
    alas.stroke({ color: 0x6d28d9, width: 2 })
    
    // Detalles de plumas en alas
    for (let i = 0; i < 3; i++) {
      const offset = i * 8
      alas.moveTo(-30 + offset, 5)
      alas.lineTo(-28 + offset, 12)
      alas.stroke({ color: 0x6d28d9, width: 1, alpha: 0.5 })
      
      alas.moveTo(30 - offset, 5)
      alas.lineTo(28 - offset, 12)
      alas.stroke({ color: 0x6d28d9, width: 1, alpha: 0.5 })
    }
    
    return alas
  }

  /**
   * Crear ojos grandes (característico del búho)
   */
  private crearOjos(): Graphics {
    const ojos = new Graphics()
    
    // Ojo izquierdo (grande)
    ojos.circle(-10, -8, 12)
    ojos.fill({ color: 0xffffff })
    ojos.circle(-10, -8, 8)
    ojos.fill({ color: 0xfbbf24 })
    ojos.circle(-10, -8, 4)
    ojos.fill({ color: 0x000000 })
    ojos.circle(-8, -10, 2)
    ojos.fill({ color: 0xffffff })
    
    // Ojo derecho (grande)
    ojos.circle(10, -8, 12)
    ojos.fill({ color: 0xffffff })
    ojos.circle(10, -8, 8)
    ojos.fill({ color: 0xfbbf24 })
    ojos.circle(10, -8, 4)
    ojos.fill({ color: 0x000000 })
    ojos.circle(12, -10, 2)
    ojos.fill({ color: 0xffffff })
    
    // Cejas (expresión de concentración)
    ojos.moveTo(-16, -18)
    ojos.lineTo(-4, -15)
    ojos.stroke({ color: 0x6d28d9, width: 3 })
    
    ojos.moveTo(16, -18)
    ojos.lineTo(4, -15)
    ojos.stroke({ color: 0x6d28d9, width: 3 })
    
    return ojos
  }

  /**
   * Crear pico
   */
  private crearPico(): Graphics {
    const pico = new Graphics()
    
    // Pico triangular
    pico.moveTo(-6, 2)
    pico.lineTo(0, 12)
    pico.lineTo(6, 2)
    pico.closePath()
    pico.fill({ color: 0xf97316, alpha: 0.9 })
    pico.stroke({ color: 0xea580c, width: 1 })
    
    // Línea de separación del pico
    pico.moveTo(0, 2)
    pico.lineTo(0, 10)
    pico.stroke({ color: 0xea580c, width: 1, alpha: 0.5 })
    
    return pico
  }

  /**
   * Crear patas
   */
  private crearPatas(): Graphics {
    const patas = new Graphics()
    
    // Pata izquierda
    patas.moveTo(-8, 22)
    patas.lineTo(-8, 32)
    patas.stroke({ color: 0xf97316, width: 3 })
    
    // Dedos izquierda
    patas.moveTo(-8, 32)
    patas.lineTo(-14, 34)
    patas.stroke({ color: 0xf97316, width: 2 })
    patas.moveTo(-8, 32)
    patas.lineTo(-8, 36)
    patas.stroke({ color: 0xf97316, width: 2 })
    patas.moveTo(-8, 32)
    patas.lineTo(-2, 34)
    patas.stroke({ color: 0xf97316, width: 2 })
    
    // Pata derecha
    patas.moveTo(8, 22)
    patas.lineTo(8, 32)
    patas.stroke({ color: 0xf97316, width: 3 })
    
    // Dedos derecha
    patas.moveTo(8, 32)
    patas.lineTo(14, 34)
    patas.stroke({ color: 0xf97316, width: 2 })
    patas.moveTo(8, 32)
    patas.lineTo(8, 36)
    patas.stroke({ color: 0xf97316, width: 2 })
    patas.moveTo(8, 32)
    patas.lineTo(2, 34)
    patas.stroke({ color: 0xf97316, width: 2 })
    
    return patas
  }

  /**
   * Dibujar búho con estado actual
   */
  private dibujar(): void {
    const tiempo = this.animTimer
    
    // Animaciones según estado
    switch (this.animacion) {
      case 'idle':
        // Flotación suave
        this.container.y = this.y + Math.sin(tiempo * 2) * 3
        
        // Alas ligeramente abiertas
        this.alas.rotation = Math.sin(tiempo * 1.5) * 0.1
        break
        
      case 'volando':
        // Aleteo
        const aleteo = Math.sin(tiempo * 8) * 0.4
        this.alas.rotation = aleteo
        
        // Inclinación según dirección
        this.container.rotation = this.direccion * 0.1
        
        // Flotación
        this.container.y = this.y + Math.sin(tiempo * 3) * 5
        break
        
      case 'observando':
        // Ojos más abiertos (ya lo están por defecto)
        this.ojos.scale.set(1.1)
        
        // Alas quietas
        this.alas.rotation = 0.2
        
        // Rotación suave
        this.container.rotation = Math.sin(tiempo * 0.5) * 0.05
        break
        
      case 'sorprendido':
        // Ojos muy abiertos
        this.ojos.scale.set(1.3)
        
        // Alas extendidas
        this.alas.rotation = 0.5
        
        // Sacudida
        this.container.x = this.x + Math.sin(tiempo * 20) * 2
        break
    }
  }

  /**
   * Mostrar burbuja de diálogo
   */
  mostrarDialogo(texto: string, duracion?: number): void {
    // Eliminar burbuja anterior
    if (this.burbujaDialogo) {
      this.removeChild(this.burbujaDialogo)
    }
    
    // Crear burbuja
    const burbuja = new Container()
    this.burbujaDialogo = burbuja
    
    // Fondo de burbuja
    const bg = new Graphics()
    const ancho = 120
    const alto = 45
    
    bg.roundRect(-ancho / 2, -50, ancho, alto, 10)
    bg.fill({ color: 0xffffff, alpha: 0.95 })
    bg.stroke({ color: COLORS.magia, width: 2 })
    
    // Triángulo de burbuja
    bg.moveTo(-10, -50)
    bg.lineTo(0, -38)
    bg.lineTo(10, -50)
    bg.closePath()
    bg.fill({ color: 0xffffff, alpha: 0.95 })
    
    // Texto
    const textoObj = new Text({
      text: texto,
      style: new TextStyle({
        fontSize: 10,
        fill: 0x000000,
        wordWrap: true,
        wordWrapWidth: ancho - 16,
        align: 'center',
      }),
      anchor: { x: 0.5, y: 0.5 },
    })
    textoObj.y = -27
    
    burbuja.addChild(bg)
    burbuja.addChild(textoObj)
    this.addChild(burbuja)
    
    // Auto-ocultar
    if (duracion) {
      setTimeout(() => {
        if (this.burbujaDialogo) {
          this.removeChild(this.burbujaDialogo)
          this.burbujaDialogo = null
        }
      }, duracion)
    }
  }

  /**
   * Observar jugador
   */
  observarJugador(jugadorX: number): void {
    this.animacion = 'observando'
    
    // Girar hacia el jugador
    if (jugadorX > this.x) {
      this.direccion = 1
      this.container.scale.x = 1
    } else {
      this.direccion = -1
      this.container.scale.x = -1
    }
    
    // Mensaje aleatorio de observación
    const mensajes = [
      '👀 Observando...',
      '¡Bien hecho!',
      '🦉 Te veo...',
      'Sigue así...',
    ]
    
    if (Math.random() < 0.3) {
      const mensaje = mensajes[Math.floor(Math.random() * mensajes.length)]
      this.mostrarDialogo(mensaje, 2000)
    }
    
    // Volver a volar después de observar
    setTimeout(() => {
      this.animacion = 'volando'
    }, 2500)
  }

  /**
   * Actualizar posición y animación
   */
  update(dt: number): void {
    this.animTimer += dt
    
    // Mover hacia objetivo
    const dx = this.targetX - this.x
    const dy = this.targetY - this.y
    const distancia = Math.sqrt(dx * dx + dy * dy)
    
    if (distancia > 10) {
      this.x += (dx / distancia) * this.velocidad * dt
      this.y += (dy / distancia) * this.velocidad * dt * 0.5
      
      // Dirección del movimiento
      this.direccion = dx > 0 ? 1 : -1
      this.container.scale.x = this.direccion
      
      this.animacion = 'volando'
    } else {
      // Nuevo objetivo aleatorio
      this.targetX = this.x + (Math.random() - 0.5) * 600
      this.targetY = Math.max(50, Math.min(150, this.y + (Math.random() - 0.5) * 100))
      
      // A veces se queda observando
      if (Math.random() < 0.3) {
        this.animacion = 'observando'
      }
    }
    
    // Dibujar
    this.dibujar()
  }

  /**
   * Set animación
   */
  setAnimacion(animacion: MonitorCharacter['animacion']): void {
    this.animacion = animacion
  }

  /**
   * Destruir
   */
  destroy(): void {
    if (this.burbujaDialogo) {
      this.removeChild(this.burbujaDialogo)
    }
    this.removeChildren()
  }
}

export default MonitorCharacter
