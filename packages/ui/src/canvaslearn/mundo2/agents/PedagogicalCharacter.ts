/**
 * PedagogicalCharacter — Personaje de Agente Pedagógico
 * 
 * Sprite pixel art de los agentes pedagógicos del mundo
 * Cada agente tiene un color y emoji único según su especialidad
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { COLORS, TILE_SIZE } from '../constants'

export interface PedagogicalCharacterOptions {
  x?: number
  y?: number
  agenteId?: string
  color?: number
  emoji?: string
  nombre?: string
  rol?: string
}

/**
 * PedagogicalCharacter — Personaje de agente pedagógico
 */
export class PedagogicalCharacter extends Container {
  /** ID del agente */
  public agenteId: string
  
  /** Color principal */
  public color: number
  
  /** Emoji del agente */
  public emoji: string
  
  /** Nombre del agente */
  public nombre: string
  
  /** Rol del agente */
  public rol: string
  
  /** Animación actual */
  public animacion: 'idle' | 'hablando' | 'saltando' | 'celebrando' | 'trabajando' = 'idle'
  
  /** Contenedor principal */
  private container: Container
  
  /** Cuerpo */
  private cuerpo: Graphics
  
  /** Cabeza */
  private cabeza: Graphics
  
  /** Ojos */
  private ojos: Graphics
  
  /** Boca */
  private boca: Graphics
  
  /** Accesorio según agente */
  private accesorio: Graphics | null = null
  
  /** Burbuja de diálogo */
  private burbujaDialogo: Container | null = null
  
  /** Timer de animación */
  private animTimer: number = 0
  
  /** Offset de animación (para variar entre agentes) */
  private animOffset: number = 0

  constructor(options?: PedagogicalCharacterOptions) {
    super()
    
    this.x = options?.x ?? 0
    this.y = options?.y ?? 0
    this.agenteId = options?.agenteId ?? 'hl-pedagogical-agent'
    this.color = options?.color ?? COLORS.acento
    this.emoji = options?.emoji ?? '🤖'
    this.nombre = options?.nombre ?? 'Agente'
    this.rol = options?.rol ?? 'Pedagógico'
    
    // Offset aleatorio para que no todos se animen igual
    this.animOffset = Math.random() * Math.PI * 2
    
    // Crear contenedor
    this.container = new Container()
    
    // Crear partes del cuerpo
    this.cuerpo = this.crearCuerpo()
    this.cabeza = this.crearCabeza()
    this.ojos = this.crearOjos()
    this.boca = this.crearBoca()
    this.accesorio = this.crearAccesorio()
    
    // Añadir al contenedor (orden de atrás hacia adelante)
    this.container.addChild(this.cuerpo)
    this.container.addChild(this.cabeza)
    if (this.accesorio) {
      this.container.addChild(this.accesorio)
    }
    this.container.addChild(this.ojos)
    this.container.addChild(this.boca)
    
    // Añadir al padre
    this.addChild(this.container)
    
    // Dibujar estado inicial
    this.dibujar()
  }

  /**
   * Crear cuerpo del agente
   */
  private crearCuerpo(): Graphics {
    const cuerpo = new Graphics()
    
    // Cuerpo principal (32x32 pixel art)
    const ancho = 28
    const alto = 32
    
    // Rectángulo redondeado
    cuerpo.roundRect(-ancho / 2, 0, ancho, alto, 6)
    cuerpo.fill({ color: this.color, alpha: 0.9 })
    cuerpo.stroke({ color: this.color, width: 2, alpha: 0.5 })
    
    // Detalle de pecho (patrón pixel art)
    cuerpo.rect(-8, 10, 16, 12)
    cuerpo.fill({ color: 0xffffff, alpha: 0.2 })
    
    // Brazos (simplificados)
    cuerpo.roundRect(-ancho / 2 - 4, 10, 4, 16, 2)
    cuerpo.fill({ color: this.color, alpha: 0.9 })
    cuerpo.roundRect(ancho / 2, 10, 4, 16, 2)
    cuerpo.fill({ color: this.color, alpha: 0.9 })
    
    // Piernas
    cuerpo.rect(-10, alto, 8, 10)
    cuerpo.fill({ color: this.color, alpha: 0.9 })
    cuerpo.rect(2, alto, 8, 10)
    cuerpo.fill({ color: this.color, alpha: 0.9 })
    
    return cuerpo
  }

  /**
   * Crear cabeza del agente
   */
  private crearCabeza(): Graphics {
    const cabeza = new Graphics()
    
    // Cabeza redonda
    cabeza.circle(0, -8, 18)
    cabeza.fill({ color: this.color, alpha: 0.9 })
    cabeza.stroke({ color: this.color, width: 2, alpha: 0.5 })
    
    // Antena (detalle característico)
    cabeza.moveTo(0, -26)
    cabeza.lineTo(0, -32)
    cabeza.stroke({ color: this.color, width: 3 })
    
    // Punta de antena (brillante)
    cabeza.circle(0, -32, 4)
    cabeza.fill({ color: 0xfbbf24, alpha: 0.8 })
    
    return cabeza
  }

  /**
   * Crear ojos del agente
   */
  private crearOjos(): Graphics {
    const ojos = new Graphics()
    
    // Ojo izquierdo
    ojos.ellipse(-6, -10, 5, 6)
    ojos.fill({ color: 0xffffff })
    ojos.circle(-5, -10, 2.5)
    ojos.fill({ color: 0x1a1a2e })
    ojos.circle(-4, -11, 1)
    ojos.fill({ color: 0xffffff })
    
    // Ojo derecho
    ojos.ellipse(6, -10, 5, 6)
    ojos.fill({ color: 0xffffff })
    ojos.circle(7, -10, 2.5)
    ojos.fill({ color: 0x1a1a2e })
    ojos.circle(8, -11, 1)
    ojos.fill({ color: 0xffffff })
    
    return ojos
  }

  /**
   * Crear boca del agente
   */
  private crearBoca(): Graphics {
    const boca = new Graphics()
    
    // Boca sonriente pequeña
    boca.arc(0, 0, 4, 0.2, Math.PI - 0.2)
    boca.stroke({ color: 0x1a1a2e, width: 1.5 })
    
    return boca
  }

  /**
   * Crear accesorio según agente
   */
  private crearAccesorio(): Graphics | null {
    const accesorio = new Graphics()
    
    // Accesorios específicos por tipo de agente
    if (this.agenteId.includes('svg') || this.agenteId.includes('diagram')) {
      // Lápiz/dibujo
      accesorio.rect(12, 20, 4, 12)
      accesorio.fill({ color: 0xf59e0b })
      accesorio.moveTo(12, 20)
      accesorio.lineTo(14, 18)
      accesorio.lineTo(16, 20)
      accesorio.closePath()
      accesorio.fill({ color: 0xef4444 })
    } else if (this.agenteId.includes('code') || this.agenteId.includes('program')) {
      // Laptop
      accesorio.roundRect(-12, 18, 24, 16, 2)
      accesorio.fill({ color: 0x64748b })
      accesorio.rect(-10, 20, 20, 12)
      accesorio.fill({ color: 0x1e293b })
    } else if (this.agenteId.includes('quiz') || this.agenteId.includes('question')) {
      // Signo de pregunta
      accesorio.moveTo(0, 10)
      accesorio.lineTo(0, 20)
      accesorio.stroke({ color: 0xfbbf24, width: 3 })
      accesorio.arc(0, 10, 6, Math.PI, 0)
      accesorio.stroke({ color: 0xfbbf24, width: 3 })
      accesorio.circle(0, 24, 2)
      accesorio.fill({ color: 0xfbbf24 })
    } else if (this.agenteId.includes('gamification') || this.agenteId.includes('xp')) {
      // Estrella
      this.dibujarEstrella(accesorio, 0, 20, 8, 0xfbbf24)
    } else if (this.agenteId.includes('audio') || this.agenteId.includes('sound')) {
      // Nota musical
      accesorio.moveTo(-4, 16)
      accesorio.lineTo(-4, 28)
      accesorio.stroke({ color: 0xfbbf24, width: 3 })
      accesorio.ellipse(-4, 28, 4, 3)
      accesorio.fill({ color: 0xfbbf24 })
      accesorio.moveTo(4, 14)
      accesorio.lineTo(4, 26)
      accesorio.stroke({ color: 0xfbbf24, width: 3 })
      accesorio.ellipse(4, 26, 4, 3)
      accesorio.fill({ color: 0xfbbf24 })
    } else {
      // Accesorio genérico (engranaje)
      this.dibujarEngranaje(accesorio, 0, 20, 6, 0x64748b)
      return accesorio
    }
    
    return accesorio
  }

  /**
   * Dibujar estrella
   */
  private dibujarEstrella(g: Graphics, x: number, y: number, radio: number, color: number): void {
    const puntas = 5
    const radioInterior = radio * 0.5
    
    g.moveTo(x, y - radio)
    
    for (let i = 0; i < puntas * 2; i++) {
      const r = i % 2 === 0 ? radio : radioInterior
      const angulo = (i * Math.PI) / puntas - Math.PI / 2
      const px = x + Math.cos(angulo) * r
      const py = y + Math.sin(angulo) * r
      g.lineTo(px, py)
    }
    
    g.closePath()
    g.fill({ color, alpha: 0.9 })
  }

  /**
   * Dibujar engranaje
   */
  private dibujarEngranaje(g: Graphics, x: number, y: number, radio: number, color: number): void {
    const dientes = 8
    
    for (let i = 0; i < dientes; i++) {
      const angulo = (i * Math.PI * 2) / dientes
      const px = x + Math.cos(angulo) * radio
      const py = y + Math.sin(angulo) * radio
      
      if (i === 0) {
        g.moveTo(px, py)
      } else {
        g.lineTo(px, py)
      }
      
      // Diente
      const anguloExterno = angulo + Math.PI / dientes
      const px2 = x + Math.cos(anguloExterno) * (radio * 1.3)
      const py2 = y + Math.sin(anguloExterno) * (radio * 1.3)
      g.lineTo(px2, py2)
    }
    
    g.closePath()
    g.fill({ color, alpha: 0.6 })
    g.stroke({ color, width: 2 })
    
    // Centro
    g.circle(x, y, radio * 0.5)
    g.fill({ color: 0x1e293b })
  }

  /**
   * Dibujar agente con estado actual
   */
  private dibujar(): void {
    const tiempo = this.animTimer + this.animOffset
    
    // Animaciones según estado
    switch (this.animacion) {
      case 'idle':
        // Respiración suave
        const breathe = Math.sin(tiempo * 2) * 0.02
        this.container.scale.set(1 + breathe, 1 - breathe * 0.5)
        
        // Antena parpadeante
        if (this.accesorio) {
          this.accesorio.scale.y = 1 + Math.sin(tiempo * 4) * 0.05
        }
        break
        
      case 'hablando':
        // Boca se abre y cierra rápido
        this.boca.scale.y = 1 + Math.sin(tiempo * 10) * 0.6
        
        // Cuerpo se mueve
        this.container.scale.set(1 + Math.sin(tiempo * 5) * 0.03, 1 - Math.sin(tiempo * 5) * 0.02)
        break
        
      case 'saltando':
        // Estirar al saltar
        this.container.scale.set(0.9, 1.15)
        this.container.y = this.y - 15
        break
        
      case 'celebrando':
        // Salto de alegría
        this.container.scale.set(1.1, 1.1)
        this.container.rotation = Math.sin(tiempo * 6) * 0.15
        this.container.y = this.y + Math.sin(tiempo * 8) * 5
        break
        
      case 'trabajando':
        // Movimiento de escritura/trabajo
        this.container.rotation = Math.sin(tiempo * 8) * 0.05
        this.container.x = this.x + Math.sin(tiempo * 8) * 2
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
    const ancho = 140
    const alto = 50
    
    bg.roundRect(-ancho / 2, -60, ancho, alto, 10)
    bg.fill({ color: 0xffffff, alpha: 0.95 })
    bg.stroke({ color: this.color, width: 2 })
    
    // Triángulo de burbuja
    bg.moveTo(-10, -60)
    bg.lineTo(0, -48)
    bg.lineTo(10, -60)
    bg.closePath()
    bg.fill({ color: 0xffffff, alpha: 0.95 })
    
    // Texto
    const textoObj = new Text({
      text: texto,
      style: new TextStyle({
        fontSize: 11,
        fill: 0x000000,
        wordWrap: true,
        wordWrapWidth: ancho - 16,
        align: 'center',
        fontWeight: 'bold',
      }),
      anchor: { x: 0.5, y: 0.5 },
    })
    textoObj.y = -35
    
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
   * Saludar
   */
  saludar(): void {
    this.animacion = 'celebrando'
    
    const saludos = [
      `¡Hola! Soy ${this.nombre} 👋`,
      `¡Vamos a aprender!`,
      `¡${this.rol} listo para ayudar!`,
    ]
    
    const saludo = saludos[Math.floor(Math.random() * saludos.length)]
    this.mostrarDialogo(saludo, 2500)
    
    // Volver a idle
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
  setAnimacion(animacion: PedagogicalCharacter['animacion']): void {
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

export default PedagogicalCharacter
