/**
 * Player — Jugador del mundo de aprendizaje
 * 
 * Sprite animado del alumno con físicas de plataformer
 */

import { Container, Graphics, Texture, Sprite } from 'pixi.js'
import { JUGADOR_CONFIG, COLORS, lerp, clamp } from '../constants'
import type { JugadorAnimacion, JugadorDireccion } from '../types'

interface Particle extends Graphics {
  vx: number
  vy: number
  vida: number
}

export interface PlayerOptions {
  nickname: string
  avatar: string
}

/**
 * Player — Clase del jugador
 */
export class Player extends Container {
  /** Velocidad X */
  public vx: number = 0
  
  /** Velocidad Y */
  public vy: number = 0
  
  /** Está en el suelo */
  public enSuelo: boolean = true
  
  /** Saltos disponibles */
  public saltosDisponibles: number = 1
  
  /** Dirección actual */
  public direccion: JugadorDireccion = 'derecha'
  
  /** Animación actual */
  public animacion: JugadorAnimacion = 'idle'
  
  /** Es invencible */
  public invencible: boolean = false
  
  /** Power-up activo */
  public powerup?: 'velocidad' | 'salto' | 'doble_salto' | 'invencibilidad'
  
  /** Tiempo restante de power-up */
  public powerupRestante: number = 0
  
  /** Nickname del jugador */
  private nickname: string
  
  /** URL del avatar */
  private avatar: string
  
  /** Contenedor principal */
  private container: Container
  
  /** Cuerpo del jugador */
  private cuerpo: Graphics
  
  /** Ojos del jugador */
  private ojos: Graphics
  
  /** Boca del jugador */
  private boca: Graphics
  
  /** Sombra */
  private sombra: Graphics
  
  /** Partículas de estela */
  private estelaParticles: Graphics
  
  /** Timer de animación */
  private animTimer: number = 0
  
  /** Frame de animación */
  private animFrame: number = 0
  
  /** Timer de invencibilidad */
  private invencibilidadTimer: number = 0
  
  /** Visible en frame actual (para parpadeo) */
  private visibleFrame: boolean = true

  constructor(nickname: string, avatar: string) {
    super()
    this.nickname = nickname
    this.avatar = avatar
    
    // Crear contenedor principal
    this.container = new Container()
    
    // Crear sombra
    this.sombra = this.crearSombra()
    this.container.addChild(this.sombra)
    
    // Crear cuerpo
    this.cuerpo = this.crearCuerpo()
    this.container.addChild(this.cuerpo)
    
    // Crear ojos
    this.ojos = this.crearOjos()
    this.container.addChild(this.ojos)
    
    // Crear boca
    this.boca = this.crearBoca()
    this.container.addChild(this.boca)
    
    // Crear estela
    this.estelaParticles = new Graphics()
    this.addChild(this.estelaParticles)
    
    // Añadir contenedor principal
    this.addChild(this.container)
    
    // Dibujar estado inicial
    this.dibujar()
  }

  /**
   * Crear sombra del jugador
   */
  private crearSombra(): Graphics {
    const sombra = new Graphics()
    sombra.ellipse(0, JUGADOR_CONFIG.alto + 2, JUGADOR_CONFIG.ancho / 2, 4)
    sombra.fill({ color: 0x000000, alpha: 0.3 })
    return sombra
  }

  /**
   * Crear cuerpo del jugador (pixel art style)
   */
  private crearCuerpo(): Graphics {
    const cuerpo = new Graphics()
    
    // Cuerpo principal (rectángulo redondeado pixel art)
    const w = JUGADOR_CONFIG.ancho
    const h = JUGADOR_CONFIG.alto - 8 // Dejar espacio para la cabeza
    
    // Dibujar cuerpo pixel art
    cuerpo.rect(2, 8, w - 4, h)
    cuerpo.fill({ color: COLORS.acento, alpha: 0.9 })
    
    // Borde
    cuerpo.stroke({ color: COLORS.textoOscuro, width: 2, alpha: 0.8 })
    
    // Detalles (patrón pixel art)
    cuerpo.rect(4, 10, 4, 4)
    cuerpo.fill({ color: 0xffffff, alpha: 0.3 })
    
    return cuerpo
  }

  /**
   * Crear ojos del jugador
   */
  private crearOjos(): Graphics {
    const ojos = new Graphics()
    
    // Ojo izquierdo
    ojos.circle(6, 6, 3)
    ojos.fill({ color: 0xffffff })
    ojos.circle(7, 6, 1.5)
    ojos.fill({ color: 0x000000 })
    
    // Ojo derecho
    ojos.circle(18, 6, 3)
    ojos.fill({ color: 0xffffff })
    ojos.circle(19, 6, 1.5)
    ojos.fill({ color: 0x000000 })
    
    return ojos
  }

  /**
   * Crear boca del jugador
   */
  private crearBoca(): Graphics {
    const boca = new Graphics()
    
    // Boca sonriente
    boca.arc(12, 14, 4, 0.2, Math.PI - 0.2)
    boca.stroke({ color: 0x000000, width: 2 })
    
    return boca
  }

  /**
   * Dibujar jugador con estado actual
   */
  private dibujar(): void {
    // Actualizar sombra
    this.sombra.scale.x = this.enSuelo ? 1 : 0.8
    this.sombra.alpha = this.enSuelo ? 0.3 : 0.15
    this.sombra.y = JUGADOR_CONFIG.alto + 2 + (this.enSuelo ? 0 : 10)

    // Actualizar cuerpo según animación
    switch (this.animacion) {
      case 'idle':
        this.cuerpo.scale.set(1, 1 + Math.sin(this.animTimer * 3) * 0.02)
        break
      case 'caminar':
        this.cuerpo.scale.set(1 + Math.sin(this.animTimer * 8) * 0.05, 1 - Math.sin(this.animTimer * 8) * 0.03)
        this.cuerpo.rotation = Math.sin(this.animTimer * 8) * 0.05
        break
      case 'correr':
        this.cuerpo.scale.set(1 + Math.sin(this.animTimer * 12) * 0.08, 1 - Math.sin(this.animTimer * 12) * 0.05)
        this.cuerpo.rotation = Math.sin(this.animTimer * 12) * 0.1
        break
      case 'saltar':
        this.cuerpo.scale.set(0.95, 1.05)
        this.cuerpo.rotation = -0.1
        break
      case 'caer':
        this.cuerpo.scale.set(0.9, 1.1)
        this.cuerpo.rotation = 0.05
        break
      case 'aterrizar':
        this.cuerpo.scale.set(1.1, 0.9)
        break
      case 'dano':
        this.cuerpo.scale.set(0.85, 0.85)
        break
    }

    // Actualizar ojos según dirección
    if (this.direccion === 'izquierda') {
      this.ojos.x = -2
      this.boca.x = -2
    } else {
      this.ojos.x = 2
      this.boca.x = 2
    }

    // Actualizar boca según animación
    switch (this.animacion) {
      case 'saltar':
      case 'caer':
        this.boca.scale.y = 1.3
        break
      case 'aterrizar':
        this.boca.scale.y = 0.7
        break
      default:
        this.boca.scale.y = 1
    }

    // Parpadeo si es invencible
    if (this.invencible) {
      this.invencibilidadTimer += 0.016
      this.visibleFrame = Math.floor(this.invencibilidadTimer / 0.1) % 2 === 0
      this.container.visible = this.visibleFrame
    } else {
      this.container.visible = true
    }
  }

  /**
   * Mover a la izquierda
   */
  moveLeft(velocidad: number, dt: number): void {
    this.vx = -velocidad
    this.direccion = 'izquierda'
    
    if (this.enSuelo) {
      this.animacion = velocidad > JUGADOR_CONFIG.velocidad ? 'correr' : 'caminar'
    }
  }

  /**
   * Mover a la derecha
   */
  moveRight(velocidad: number, dt: number): void {
    this.vx = velocidad
    this.direccion = 'derecha'
    
    if (this.enSuelo) {
      this.animacion = velocidad > JUGADOR_CONFIG.velocidad ? 'correr' : 'caminar'
    }
  }

  /**
   * Detener movimiento horizontal
   */
  stopHorizontal(): void {
    this.vx = lerp(this.vx, 0, 0.2)
    
    if (Math.abs(this.vx) < 10 && this.enSuelo) {
      this.animacion = 'idle'
    }
  }

  /**
   * Saltar
   */
  jump(): void {
    if (this.enSuelo || (this.powerup === 'doble_salto' && this.saltosDisponibles > 0)) {
      this.vy = -(this.powerup === 'salto' ? JUGADOR_CONFIG.salto * 1.2 : JUGADOR_CONFIG.salto)
      this.enSuelo = false
      this.saltosDisponibles--
      this.animacion = 'saltar'
      
      // Crear partículas de polvo
      this.crearPolvoSalto()
    }
  }

  /**
   * Crear partículas de polvo al saltar
   */
  private crearPolvoSalto(): void {
    // Implementación simple de partículas
    for (let i = 0; i < 5; i++) {
      const particula = new Graphics() as Particle
      particula.circle(0, 0, 2 + Math.random() * 2)
      particula.fill({ color: 0x888888, alpha: 0.5 })
      particula.x = this.x + (Math.random() - 0.5) * 10
      particula.y = this.y + JUGADOR_CONFIG.alto
      particula.vy = -20 - Math.random() * 30
      particula.vx = (Math.random() - 0.5) * 40
      particula.vida = 0.5
      
      this.estelaParticles.addChild(particula)
    }
  }

  /**
   * Aplicar gravedad
   */
  aplicarGravedad(dt: number): void {
    const gravedad = this.powerup === 'salto' ? JUGADOR_CONFIG.gravedad * 0.8 : JUGADOR_CONFIG.gravedad
    this.vy += gravedad * dt
    this.vy = clamp(this.vy, -JUGADOR_CONFIG.salto * 2, JUGADOR_CONFIG.velocidadCaidaMax)
  }

  /**
   * Actualizar físicas
   */
  update(dt: number): void {
    // Actualizar timer de animación
    this.animTimer += dt
    
    // Aplicar gravedad
    this.aplicarGravedad(dt)
    
    // Actualizar posición
    this.x += this.vx * dt
    this.y += this.vy * dt
    
    // Límites del mundo
    this.x = clamp(this.x, 0, 3000 - JUGADOR_CONFIG.ancho)
    
    // Suelo base (y = 400)
    const sueloY = 400 - JUGADOR_CONFIG.alto
    if (this.y >= sueloY) {
      this.y = sueloY
      this.vy = 0
      this.enSuelo = true
      this.saltosDisponibles = this.powerup === 'doble_salto' ? 2 : 1
      
      if (this.animacion === 'saltar' || this.animacion === 'caer') {
        this.animacion = 'aterrizar'
        setTimeout(() => {
          if (this.animacion === 'aterrizar') {
            this.animacion = 'idle'
          }
        }, 200)
      }
    } else {
      this.animacion = this.vy < 0 ? 'saltar' : 'caer'
    }
    
    // Actualizar power-up
    if (this.powerup && this.powerupRestante !== undefined) {
      this.powerupRestante -= dt * 1000
      if (this.powerupRestante <= 0) {
        this.powerup = undefined
        this.powerupRestante = 0
      }
    }
    
    // Actualizar invencibilidad
    if (this.invencible) {
      this.invencibilidadTimer += dt
      if (this.invencibilidadTimer > JUGADOR_CONFIG.tiempoInvencibilidad / 1000) {
        this.invencible = false
        this.invencibilidadTimer = 0
      }
    }
    
    // Actualizar partículas de estela
    this.actualizarEstela(dt)
    
    // Dibujar
    this.dibujar()
  }

  /**
   * Actualizar partículas de estela
   */
  private actualizarEstela(dt: number): void {
    if (Math.abs(this.vx) > JUGADOR_CONFIG.velocidad * 0.5 && this.enSuelo) {
      // Crear partícula de estela
      const particula = new Graphics()
      particula.circle(0, 0, 2 + Math.random() * 2)
      particula.fill({ color: COLORS.acento, alpha: 0.3 })
      particula.x = this.x + (this.direccion === 'izquierda' ? 10 : -10)
      particula.y = this.y + JUGADOR_CONFIG.alto / 2
      
      this.estelaParticles.addChild(particula)
      
      // Animar y remover
      setTimeout(() => {
        particula.alpha -= 0.05
        particula.scale.set(particula.scale.x * 0.9)
        if (particula.alpha <= 0) {
          this.estelaParticles.removeChild(particula)
        }
      }, 50)
    }
  }

  /**
   * Recibir daño
   */
  recibirDano(): void {
    if (this.invencible) return
    
    this.animacion = 'dano'
    this.invencible = true
    this.invencibilidadTimer = 0
    
    // Sonido de daño (implementar con SoundManager)
  }

  /**
   * Obtener bounding box para colisiones
   */
  getCollisionBounds(): { x: number; y: number; width: number; height: number } {
    const margen = JUGADOR_CONFIG.margenColision
    return {
      x: this.x + margen,
      y: this.y + margen,
      width: JUGADOR_CONFIG.ancho - margen * 2,
      height: JUGADOR_CONFIG.alto - margen * 2,
    }
  }

  /**
   * Destruir jugador
   */
  destroy(): void {
    this.removeChildren()
  }
}
