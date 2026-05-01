/**
 * CoordinatorCharacter — Personaje del Coordinador
 * 
 * Sprite pixel art del coordinador del enjambre (hl-coordinator-agent)
 * Más grande que los demás agentes, con animaciones especiales
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { COLORS, TILE_SIZE } from '../constants'

export interface CoordinatorCharacterOptions {
  x?: number
  y?: number
  nickname?: string
}

/**
 * CoordinatorCharacter — Personaje del coordinador
 */
export class CoordinatorCharacter extends Container {
  /** Animación actual */
  public animacion: 'idle' | 'hablando' | 'saltando' | 'celebrando' = 'idle'
  
  /** Contenedor principal */
  private container: Container
  
  /** Cuerpo del coordinador */
  private cuerpo: Graphics
  
  /** Cabeza */
  private cabeza: Graphics
  
  /** Ojos */
  private ojos: Graphics
  
  /** Boca */
  private boca: Graphics
  
  /** Capa (detalle del coordinador) */
  private capa: Graphics
  
  /** Burbuja de diálogo */
  private burbujaDialogo: Container | null = null
  
  /** Timer de animación */
  private animTimer: number = 0
  
  /** Nickname del alumno (para personalizar saludo) */
  private nickname: string = ''

  constructor(options?: CoordinatorCharacterOptions) {
    super()
    
    this.x = options?.x ?? 0
    this.y = options?.y ?? 0
    this.nickname = options?.nickname ?? ''
    
    // Crear contenedor
    this.container = new Container()
    
    // Crear partes del cuerpo (orden de atrás hacia adelante)
    this.capa = this.crearCapa()
    this.cuerpo = this.crearCuerpo()
    this.cabeza = this.crearCabeza()
    this.ojos = this.crearOjos()
    this.boca = this.crearBoca()
    
    // Añadir al contenedor
    this.container.addChild(this.capa)
    this.container.addChild(this.cuerpo)
    this.container.addChild(this.cabeza)
    this.container.addChild(this.ojos)
    this.container.addChild(this.boca)
    
    // Añadir al padre
    this.addChild(this.container)
    
    // Dibujar estado inicial
    this.dibujar()
  }

  /**
   * Crear capa del coordinador
   */
  private crearCapa(): Graphics {
    const capa = new Graphics()
    
    // Capa ondeante (detrás del cuerpo)
    capa.moveTo(-30, 20)
    capa.lineTo(-45, 60)
    capa.lineTo(-40, 100)
    capa.lineTo(-25, 80)
    capa.closePath()
    capa.fill({ color: 0xfbbf24, alpha: 0.8 })
    capa.stroke({ color: 0xf59e0b, width: 2 })
    
    capa.moveTo(30, 20)
    capa.lineTo(45, 60)
    capa.lineTo(40, 100)
    capa.lineTo(25, 80)
    capa.closePath()
    capa.fill({ color: 0xfbbf24, alpha: 0.8 })
    capa.stroke({ color: 0xf59e0b, width: 2 })
    
    return capa
  }

  /**
   * Crear cuerpo del coordinador
   */
  private crearCuerpo(): Graphics {
    const cuerpo = new Graphics()
    
    // Cuerpo principal (más grande que agentes normales)
    const ancho = 50
    const alto = 60
    
    // Rectángulo redondeado pixel art
    cuerpo.roundRect(-ancho / 2, 0, ancho, alto, 8)
    cuerpo.fill({ color: 0x3b82f6, alpha: 0.9 })
    cuerpo.stroke({ color: 0x1e40af, width: 3 })
    
    // Detalle de corbata (símbolo de coordinador)
    cuerpo.moveTo(0, 15)
    cuerpo.lineTo(-8, 35)
    cuerpo.lineTo(0, 30)
    cuerpo.lineTo(8, 35)
    cuerpo.closePath()
    cuerpo.fill({ color: 0xef4444, alpha: 0.9 })
    
    // Botones
    cuerpo.circle(-10, 40, 3)
    cuerpo.fill({ color: 0xfbbf24 })
    cuerpo.circle(10, 40, 3)
    cuerpo.fill({ color: 0xfbbf24 })
    cuerpo.circle(-10, 50, 3)
    cuerpo.fill({ color: 0xfbbf24 })
    cuerpo.circle(10, 50, 3)
    cuerpo.fill({ color: 0xfbbf24 })
    
    return cuerpo
  }

  /**
   * Crear cabeza del coordinador
   */
  private crearCabeza(): Graphics {
    const cabeza = new Graphics()
    
    // Cabeza redondeada
    cabeza.circle(0, -10, 28)
    cabeza.fill({ color: 0xfbbf24, alpha: 0.9 })
    cabeza.stroke({ color: 0xf59e0b, width: 3 })
    
    // Auricular/micrófono (detalle de coordinador)
    cabeza.moveTo(-25, 0)
    cabeza.lineTo(-30, 10)
    cabeza.stroke({ color: 0x64748b, width: 4 })
    
    cabeza.moveTo(25, 0)
    cabeza.lineTo(30, 10)
    cabeza.stroke({ color: 0x64748b, width: 4 })
    
    // Micrófono
    cabeza.circle(-32, 15, 5)
    cabeza.fill({ color: 0x64748b })
    
    return cabeza
  }

  /**
   * Crear ojos del coordinador
   */
  private crearOjos(): Graphics {
    const ojos = new Graphics()
    
    // Ojo izquierdo
    ojos.ellipse(-10, -12, 6, 8)
    ojos.fill({ color: 0xffffff })
    ojos.circle(-9, -12, 3)
    ojos.fill({ color: 0x1e40af })
    ojos.circle(-8, -13, 1.5)
    ojos.fill({ color: 0xffffff })
    
    // Ojo derecho
    ojos.ellipse(10, -12, 6, 8)
    ojos.fill({ color: 0xffffff })
    ojos.circle(11, -12, 3)
    ojos.fill({ color: 0x1e40af })
    ojos.circle(12, -13, 1.5)
    ojos.fill({ color: 0xffffff })
    
    // Cejas (expresivas)
    ojos.moveTo(-15, -20)
    ojos.lineTo(-5, -18)
    ojos.stroke({ color: 0xf59e0b, width: 3 })
    
    ojos.moveTo(15, -20)
    ojos.lineTo(5, -18)
    ojos.stroke({ color: 0xf59e0b, width: 3 })
    
    return ojos
  }

  /**
   * Crear boca del coordinador
   */
  private crearBoca(): Graphics {
    const boca = new Graphics()
    
    // Boca sonriente
    boca.arc(0, 5, 8, 0.2, Math.PI - 0.2)
    boca.stroke({ color: 0x1e40af, width: 2 })
    
    return boca
  }

  /**
   * Dibujar coordinador con estado actual
   */
  private dibujar(): void {
    // Animaciones según estado
    switch (this.animacion) {
      case 'idle':
        // Respiración suave
        const breathe = Math.sin(this.animTimer * 2) * 0.02
        this.container.scale.set(1 + breathe, 1 - breathe * 0.5)
        
        // Capa ondeante
        this.capa.rotation = Math.sin(this.animTimer * 1.5) * 0.05
        break
        
      case 'hablando':
        // Boca se abre y cierra
        this.boca.scale.y = 1 + Math.sin(this.animTimer * 8) * 0.5
        
        // Cuerpo se mueve ligeramente
        this.container.scale.set(1 + Math.sin(this.animTimer * 4) * 0.03, 1 - Math.sin(this.animTimer * 4) * 0.02)
        break
        
      case 'saltando':
        // Estirar al saltar
        this.container.scale.set(0.9, 1.1)
        this.container.y = this.y - 20
        break
        
      case 'celebrando':
        // Brazos arriba (simulado con escala)
        this.container.scale.set(1.1, 1.1)
        this.container.rotation = Math.sin(this.animTimer * 6) * 0.1
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
    const ancho = 180
    const alto = 60
    
    bg.roundRect(-ancho / 2, -80, ancho, alto, 12)
    bg.fill({ color: 0xffffff, alpha: 0.95 })
    bg.stroke({ color: COLORS.acento, width: 3 })
    
    // Triángulo de burbuja
    bg.moveTo(-10, -80)
    bg.lineTo(0, -65)
    bg.lineTo(10, -80)
    bg.closePath()
    bg.fill({ color: 0xffffff, alpha: 0.95 })
    
    // Texto
    const textoObj = new Text({
      text: texto,
      style: new TextStyle({
        fontSize: 12,
        fill: 0x000000,
        wordWrap: true,
        wordWrapWidth: ancho - 20,
        align: 'center',
        fontWeight: 'bold',
      }),
      anchor: { x: 0.5, y: 0.5 },
    })
    textoObj.y = -50
    
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
   * Saludar al alumno
   */
  saludar(nickname: string, tema: string): void {
    this.nickname = nickname
    
    const mensajes = [
      `¡Hola ${nickname}! 👋`,
      `¡Bienvenido a: ${tema}!`,
      `¡Vamos a aprender!`,
    ]
    
    const mensaje = mensajes[Math.floor(Math.random() * mensajes.length)]
    this.mostrarDialogo(mensaje, 3000)
    
    // Volver a idle después de saludar
    setTimeout(() => {
      this.animacion = 'idle'
    }, 2000)
  }

  /**
   * Actualizar animación
   */
  update(dt: number): void {
    this.animTimer += dt
    this.dibujar()
  }

  /**
   * Set animación
   */
  setAnimacion(animacion: CoordinatorCharacter['animacion']): void {
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

export default CoordinatorCharacter
