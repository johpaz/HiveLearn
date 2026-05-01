/**
 * ZoneManager — Gestor de zonas del mundo
 * 
 * Maneja el estado, desbloqueo y animaciones de las zonas
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { COLORS, TILE_SIZE, ZONAS_CONFIG, WORLD_HEIGHT, easeOutElastic } from '../constants'
import type { Zona } from '../types'
import type { Player } from '../player/Player'

interface Particle extends Graphics {
  vx: number
  vy: number
  vida: number
}

/**
 * ZoneManager — Gestiona las zonas del mundo
 */
export class ZoneManager extends Container {
  /** Zonas activas */
  public zonas: Zona[] = []
  
  /** Contenedor de zonas */
  private zonasContainer: Container
  
  /** Contenedor de puertas */
  private puertasContainer: Container
  
  /** Contenedor de burbujas de diálogo */
  private dialogosContainer: Container
  
  /** Zona actual */
  private zonaActual: number = 0
  
  /** Animaciones activas */
  private animaciones: Map<string, any> = new Map()

  constructor() {
    super()
    
    this.zonasContainer = new Container()
    this.puertasContainer = new Container()
    this.dialogosContainer = new Container()
    
    this.addChild(this.zonasContainer)
    this.addChild(this.puertasContainer)
    this.addChild(this.dialogosContainer)
  }

  /**
   * Generar zonas iniciales
   */
  generarZonas(tema: string): Zona[] {
    // Zona 0: Bienvenida
    const zona0: Zona = {
      numero: 0,
      estado: 'disponible',
      x: 100,
      y: WORLD_HEIGHT - 200,
      ancho: 200,
      alto: 150,
      moduloUuid: 'bienvenida',
      agenteId: 'hl-coordinator-agent',
      titulo: '¡Bienvenido!',
      tipoPedagogico: 'milestone',
      xpRecompensa: 50,
    }
    
    this.zonas = [zona0]
    this.renderizarZonas()
    
    return this.zonas
  }

  /**
   * Renderizar zonas
   */
  private renderizarZonas(): void {
    this.zonasContainer.removeChildren()
    
    this.zonas.forEach((zona) => {
      const graphics = this.crearZonaGraphics(zona)
      this.zonasContainer.addChild(graphics)
      
      // Renderizar puerta si está completada
      if (zona.estado === 'completada') {
        const puerta = this.crearPuerta(zona)
        this.puertasContainer.addChild(puerta)
      }
    })
  }

  /**
   * Crear graphics de zona
   */
  private crearZonaGraphics(zona: Zona): Graphics {
    const g = new Graphics()
    
    // Color según estado
    const colores = {
      bloqueada: { fill: COLORS.bloqueo, stroke: 0x8b0000, alpha: 0.7 },
      disponible: { fill: COLORS.desbloqueado, stroke: 0x22c55e, alpha: 0.9 },
      completada: { fill: COLORS.completado, stroke: COLORS.acento, alpha: 0.95 },
    }
    
    const color = colores[zona.estado]
    
    // Base de la zona (plataforma)
    g.roundRect(zona.x, zona.y, zona.ancho, 20, 8)
    g.fill({ color: color.fill, alpha: color.alpha })
    g.stroke({ color: color.stroke, width: 3 })
    
    // Pilar decorativo
    g.roundRect(zona.x + zona.ancho / 2 - 20, zona.y + 20, 40, zona.alto - 20, 4)
    g.fill({ color: color.fill, alpha: color.alpha * 0.7 })
    g.stroke({ color: color.stroke, width: 2, alpha: 0.5 })
    
    // Ícono
    const icono = this.obtenerIconoPedagogico(zona.tipoPedagogico || 'concept')
    const textoIcono = new Text({
      text: icono,
      style: new TextStyle({
        fontSize: 32,
      }),
      anchor: { x: 0.5, y: 0.5 },
    })
    textoIcono.x = zona.x + zona.ancho / 2
    textoIcono.y = zona.y - 30
    
    // Número de zona
    const textoNumero = new Text({
      text: `${zona.numero}`,
      style: new TextStyle({
        fontSize: 14,
        fontWeight: 'bold',
        fill: COLORS.acento,
      }),
      anchor: { x: 0.5, y: 0.5 },
    })
    textoNumero.x = zona.x + zona.ancho / 2
    textoNumero.y = zona.y + 35
    
    // Título (solo si está disponible o completada)
    if (zona.estado !== 'bloqueada') {
      const textoTitulo = new Text({
        text: zona.titulo || `Zona ${zona.numero}`,
        style: new TextStyle({
          fontSize: 12,
          fill: COLORS.textoClaro,
          fontWeight: 'bold',
        }),
        anchor: { x: 0.5, y: 0.5 },
      })
      textoTitulo.x = zona.x + zona.ancho / 2
      textoTitulo.y = zona.y - 60
      this.zonasContainer.addChild(textoTitulo)
    }
    
    // Efecto de brillo si está disponible
    if (zona.estado === 'disponible') {
      this.animarZonaDisponible(g, zona.x, zona.y, zona.ancho)
    }
    
    this.zonasContainer.addChild(g)
    this.zonasContainer.addChild(textoIcono)
    this.zonasContainer.addChild(textoNumero)
    
    return g
  }

  /**
   * Crear puerta de zona completada
   */
  private crearPuerta(zona: Zona): Graphics {
    const g = new Graphics()
    
    const puertaX = zona.x + zona.ancho / 2 - 30
    const puertaY = zona.y - 60
    
    // Marco de la puerta
    g.roundRect(puertaX, puertaY, 60, 80, 8)
    g.fill({ color: 0x4a3520, alpha: 0.9 })
    g.stroke({ color: COLORS.acento, width: 3 })
    
    // Interior de la puerta (brillo)
    g.roundRect(puertaX + 8, puertaY + 8, 44, 64, 4)
    g.fill({ color: 0x2a3550, alpha: 0.8 })
    
    // Efecto de portal
    g.circle(puertaX + 30, puertaY + 40, 20)
    g.fill({ color: COLORS.acento, alpha: 0.3 })
    
    return g
  }

  /**
   * Animar zona disponible
   */
  private animarZonaDisponible(g: Graphics, x: number, y: number, ancho: number): void {
    const animKey = `zona-${x}-${y}`
    
    if (!this.animaciones.has(animKey)) {
      this.animaciones.set(animKey, {
        offset: Math.random() * Math.PI * 2,
      })
    }
    
    const anim = this.animaciones.get(animKey)
    const tiempo = Date.now() / 1000
    const brillo = 0.3 + Math.sin(tiempo * 2 + anim.offset) * 0.2
    
    // Anillo de brillo
    g.circle(x + ancho / 2, y + 10, 50)
    g.stroke({ color: COLORS.acento, width: 2, alpha: brillo })
  }

  /**
   * Mostrar bienvenida
   */
  mostrarBienvenida(nickname: string, tema: string): void {
    const zona0 = this.zonas[0]
    if (!zona0) return
    
    // Mostrar burbuja de diálogo del coordinador
    this.mostrarDialogo(
      zona0.x + zona0.ancho / 2,
      zona0.y - 100,
      `¡Hola ${nickname}! 👋\nBienvenido a: ${tema}`
    )
  }

  /**
   * Mostrar diálogo
   */
  mostrarDialogo(x: number, y: number, texto: string): void {
    // Limpiar diálogos anteriores
    this.dialogosContainer.removeChildren()
    
    // Crear burbuja de diálogo
    const burbuja = new Graphics()
    const ancho = 200
    const alto = 80
    
    // Fondo de burbuja
    burbuja.roundRect(x - ancho / 2, y - alto, ancho, alto, 12)
    burbuja.fill({ color: 0xffffff, alpha: 0.95 })
    burbuja.stroke({ color: COLORS.acento, width: 3 })
    
    // Triángulo de burbuja
    burbuja.moveTo(x, y)
    burbuja.lineTo(x - 10, y - 10)
    burbuja.lineTo(x + 10, y - 10)
    burbuja.closePath()
    burbuja.fill({ color: 0xffffff, alpha: 0.95 })
    
    // Texto
    const textoObj = new Text({
      text: texto,
      style: new TextStyle({
        fontSize: 14,
        fill: 0x000000,
        wordWrap: true,
        wordWrapWidth: ancho - 20,
        align: 'center',
      }),
      anchor: { x: 0.5, y: 0.5 },
    })
    textoObj.x = x
    textoObj.y = y - alto / 2
    
    this.dialogosContainer.addChild(burbuja)
    this.dialogosContainer.addChild(textoObj)
    
    // Auto-ocultar después de 5 segundos
    setTimeout(() => {
      this.dialogosContainer.removeChildren()
    }, 5000)
  }

  /**
   * Desbloquear zona
   */
  desbloquearZona(numero: number): void {
    const zona = this.zonas.find(z => z.numero === numero)
    if (zona) {
      zona.estado = 'disponible'
      this.renderizarZonas()
      
      // Animación de desbloqueo
      this.animarDesbloqueo(zona)
    }
  }

  /**
   * Completar zona
   */
  completarZona(numero: number): void {
    const zona = this.zonas.find(z => z.numero === numero)
    if (zona) {
      zona.estado = 'completada'
      this.renderizarZonas()
      
      // Desbloquear siguiente zona
      const siguienteZona = this.zonas.find(z => z.numero === numero + 1)
      if (siguienteZona) {
        this.desbloquearZona(numero + 1)
      }
    }
  }

  /**
   * Animar desbloqueo
   */
  private animarDesbloqueo(zona: Zona): void {
    // Efecto de explosión de partículas
    const particulas: Particle[] = []
    
    for (let i = 0; i < 20; i++) {
      const particula = new Graphics() as Particle
      particula.circle(0, 0, 3 + Math.random() * 3)
      particula.fill({ color: COLORS.acento, alpha: 0.8 })
      particula.x = zona.x + zona.ancho / 2
      particula.y = zona.y
      
      const angulo = (i / 20) * Math.PI * 2
      const velocidad = 50 + Math.random() * 100
      particula.vx = Math.cos(angulo) * velocidad
      particula.vy = Math.sin(angulo) * velocidad
      particula.vida = 1
      
      this.addChild(particula)
      particulas.push(particula)
    }
    
    // Animar partículas
    const startTime = Date.now()
    const animar = () => {
      const elapsed = (Date.now() - startTime) / 1000
      
      particulas.forEach((p) => {
        p.x += p.vx * elapsed
        p.y += p.vy * elapsed
        p.vy += 200 * elapsed // Gravedad
        p.vida -= elapsed * 2
        p.alpha = p.vida
        p.scale.set(p.vida)
      })
      
      if (elapsed < 0.5) {
        requestAnimationFrame(animar)
      } else {
        particulas.forEach((p) => this.removeChild(p))
      }
    }
    
    animar()
  }

  /**
   * Chequear colisión con jugador
   */
  chequearZona(player: Player): Zona | undefined {
    const playerBounds = player.getCollisionBounds()
    
    return this.zonas.find((zona) => {
      return playerBounds.x < zona.x + zona.ancho &&
             playerBounds.x + playerBounds.width > zona.x &&
             playerBounds.y < zona.y + zona.alto &&
             playerBounds.y + playerBounds.height > zona.y
    })
  }

  /**
   * Obtener ícono pedagógico
   */
  private obtenerIconoPedagogico(tipo: string): string {
    const iconos: Record<string, string> = {
      'concept': '📖',
      'exercise': '✏️',
      'quiz': '❓',
      'challenge': '⚡',
      'milestone': '🎯',
      'evaluation': '📝',
    }
    return iconos[tipo] || '📚'
  }

  /**
   * Actualizar
   */
  update(dt: number): void {
    // Actualizar animaciones
    this.animaciones.forEach((anim, key) => {
      // Las animaciones se renderizan en tiempo real
    })
  }

  /**
   * Obtener zona actual
   */
  getZonaActual(): Zona | undefined {
    return this.zonas.find(z => z.numero === this.zonaActual)
  }

  /**
   * Obtener zona por número
   */
  getZona(numero: number): Zona | undefined {
    return this.zonas.find(z => z.numero === numero)
  }

  /**
   * Set zona actual
   */
  setZonaActual(numero: number): void {
    this.zonaActual = numero
  }

  /**
   * Destruir
   */
  destroy(): void {
    this.removeChildren()
    this.zonas = []
    this.animaciones.clear()
  }
}
