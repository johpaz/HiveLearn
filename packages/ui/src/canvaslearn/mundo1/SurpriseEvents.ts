/**
 * SurpriseEvents - Sistema de eventos sorpresa y easter eggs
 * 
 * Eventos aleatorios que ocurren en el laboratorio para mantener el engagement
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { STATION_POSITIONS, AGENT_LABELS, PARTICLE_CONFIG } from './constants'
import type { ParticleSystem } from './ParticleSystem'
import type { SoundManager } from './SoundManager'

export type SurpriseEventType = 
  | 'party'           // Todos los robots celebran
  | 'confetti_rain'   // Lluvia de confeti
  | 'dance_off'       // Robots bailan
  | 'speed_bonus'     // Bonus de velocidad
  | 'secret_robot'    // Robot secreto aparece
  | 'konami'          // Easter egg konami code

export interface SurpriseEvent {
  type: SurpriseEventType
  name: string
  description: string
  duration: number
  cooldown: number
  chance: number // Probabilidad por minuto (0-1)
}

export const SURPRISE_EVENTS: Record<SurpriseEventType, SurpriseEvent> = {
  party: {
    type: 'party',
    name: '🎉 Fiesta del Laboratorio',
    description: '¡Todos los robots celebran!',
    duration: 5000,
    cooldown: 300000, // 5 minutos
    chance: 0.1,
  },
  confetti_rain: {
    type: 'confetti_rain',
    name: '🌈 Lluvia de Confeti',
    description: '¡Confeti por todas partes!',
    duration: 3000,
    cooldown: 120000, // 2 minutos
    chance: 0.2,
  },
  dance_off: {
    type: 'dance_off',
    name: '💃 Batalla de Baile',
    description: '¡Los robots compiten bailando!',
    duration: 8000,
    cooldown: 600000, // 10 minutos
    chance: 0.05,
  },
  speed_bonus: {
    type: 'speed_bonus',
    name: '⚡ Bonus de Velocidad',
    description: '¡XP doble por 30 segundos!',
    duration: 30000,
    cooldown: 180000, // 3 minutos
    chance: 0.15,
  },
  secret_robot: {
    type: 'secret_robot',
    name: '🤖 Robot Secreto',
    description: '¡Un robot misterioso aparece!',
    duration: 10000,
    cooldown: 900000, // 15 minutos
    chance: 0.02,
  },
  konami: {
    type: 'konami',
    name: '🎮 MODO DIOS',
    description: '¡Konami code activado!',
    duration: 60000,
    cooldown: 0,
    chance: 0, // Solo por konami code
  },
}

/**
 * Gestor de eventos sorpresa
 */
export class SurpriseEventManager {
  private particles: ParticleSystem
  private soundManager: SoundManager
  private worldContainer: Container
  private lastEventTime: Map<SurpriseEventType, number> = new Map()
  private activeEvents: Set<SurpriseEventType> = new Set()
  private konamiCode: string[] = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
  private konamiIndex = 0
  private godModeActive = false
  private autoEventTimer = 0
  private onBonusActive = false
  private onBonusMultiplier = 1

  constructor(
    particles: ParticleSystem,
    soundManager: SoundManager,
    worldContainer: Container
  ) {
    this.particles = particles
    this.soundManager = soundManager
    this.worldContainer = worldContainer
    
    // Escuchar teclado para konami code
    this.setupKonamiListener()
  }

  /**
   * Configurar listener para konami code
   */
  private setupKonamiListener(): void {
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase()
      
      if (key === this.konamiCode[this.konamiIndex]) {
        this.konamiIndex++
        
        if (this.konamiIndex === this.konamiCode.length) {
          this.triggerKonami()
          this.konamiIndex = 0
        }
      } else {
        this.konamiIndex = 0
      }
    })
  }

  /**
   * Actualizar eventos (llamar en cada frame)
   */
  update(delta: number): void {
    const dt = delta / 1000
    this.autoEventTimer += dt

    // Intentar trigger evento automático cada minuto
    if (this.autoEventTimer >= 60) {
      this.autoEventTimer = 0
      this.tryRandomEvent()
    }

    // Actualizar estado de speed bonus
    const speedBonus = this.lastEventTime.get('speed_bonus')
    if (speedBonus && Date.now() - speedBonus > SURPRISE_EVENTS.speed_bonus.duration) {
      this.onBonusActive = false
      this.onBonusMultiplier = 1
    }
  }

  /**
   * Intentar trigger evento aleatorio
   */
  private tryRandomEvent(): void {
    const now = Date.now()
    const possibleEvents: SurpriseEventType[] = []

    for (const [type, config] of Object.entries(SURPRISE_EVENTS)) {
      const eventType = type as SurpriseEventType
      if (eventType === 'konami') continue // Konami es manual

      const lastTime = this.lastEventTime.get(eventType) || 0
      const canTrigger = now - lastTime > config.cooldown
      const shouldTrigger = Math.random() < config.chance

      if (canTrigger && shouldTrigger) {
        possibleEvents.push(eventType)
      }
    }

    if (possibleEvents.length > 0) {
      const randomEvent = possibleEvents[Math.floor(Math.random() * possibleEvents.length)]
      this.triggerEvent(randomEvent)
    }
  }

  /**
   * Trigger evento por tipo
   */
  triggerEvent(type: SurpriseEventType): void {
    if (this.activeEvents.has(type)) return

    const config = SURPRISE_EVENTS[type]
    this.activeEvents.add(type)
    this.lastEventTime.set(type, Date.now())

    console.log(`🎉 Evento sorpresa: ${config.name}`)

    switch (type) {
      case 'party':
        this.startParty()
        break
      case 'confetti_rain':
        this.startConfettiRain()
        break
      case 'dance_off':
        this.startDanceOff()
        break
      case 'speed_bonus':
        this.startSpeedBonus()
        break
      case 'secret_robot':
        this.startSecretRobot()
        break
      case 'konami':
        this.startGodMode()
        break
    }

    // Limpiar evento después de la duración
    setTimeout(() => {
      this.activeEvents.delete(type)
    }, config.duration)
  }

  /**
   * Trigger konami code
   */
  triggerKonami(): void {
    console.log('🎮 KONAMI CODE ACTIVADO!')
    this.triggerEvent('konami')
  }

  /**
   * Evento: Fiesta del Laboratorio
   */
  private startParty(): void {
    this.soundManager.play('robotComplete')
    
    // Confeti desde cada robot
    for (const station of STATION_POSITIONS) {
      setTimeout(() => {
        this.particles.emitConfetti(station.x, station.y, 30)
      }, Math.random() * 2000)
    }

    // Mostrar texto
    this.showFloatingText('¡FIESTA! 🎉', this.worldContainer.x + this.worldContainer.width / 2, this.worldContainer.y + this.worldContainer.height / 2)
  }

  /**
   * Evento: Lluvia de Confeti
   */
  private startConfettiRain(): void {
    this.soundManager.play('robotComplete')
    
    // Confeti desde arriba
    const interval = setInterval(() => {
      const x = Math.random() * this.worldContainer.width
      this.particles.emitConfetti(x, 50, 5)
    }, 100)

    setTimeout(() => clearInterval(interval), 3000)
  }

  /**
   * Evento: Batalla de Baile
   */
  private startDanceOff(): void {
    this.soundManager.play('robotComplete')
    
    // Los robots "bailan" (vibran)
    for (const station of STATION_POSITIONS) {
      const robotElement = document.querySelector(`[data-agent-id="${station.agentId}"]`)
      if (robotElement) {
        robotElement.classList.add('dancing')
        setTimeout(() => {
          robotElement.classList.remove('dancing')
        }, 8000)
      }
    }

    this.showFloatingText('💃 BATALLA DE BAILE! 💃', this.worldContainer.x + this.worldContainer.width / 2, this.worldContainer.y + 200)
  }

  /**
   * Evento: Bonus de Velocidad
   */
  private startSpeedBonus(): void {
    this.soundManager.play('levelUp')
    this.onBonusActive = true
    this.onBonusMultiplier = 2
    
    this.showFloatingText('⚡ XP DOBLE! ⚡', this.worldContainer.x + this.worldContainer.width / 2, this.worldContainer.y + 100)
  }

  /**
   * Evento: Robot Secreto
   */
  private startSecretRobot(): void {
    this.soundManager.play('delegateFire')
    
    // Crear robot secreto temporal
    const secretRobot = new Graphics()
    secretRobot.circle(0, 0, 30)
    secretRobot.fill({ color: 0xff00ff, alpha: 0.8 })
    secretRobot.stroke({ color: 0xffffff, width: 3 })
    
    const text = new Text({
      text: '👽',
      style: new TextStyle({ fontSize: 24 }),
      anchor: 0.5,
    })
    
    secretRobot.addChild(text)
    secretRobot.x = this.worldContainer.width / 2
    secretRobot.y = this.worldContainer.height / 2
    secretRobot.alpha = 0
    
    this.worldContainer.addChild(secretRobot)
    
    // Fade in
    const fadeIn = () => {
      if (secretRobot.alpha < 1) {
        secretRobot.alpha += 0.05
        requestAnimationFrame(fadeIn)
      }
    }
    fadeIn()
    
    // Mover aleatoriamente
    const moveInterval = setInterval(() => {
      secretRobot.x = Math.random() * this.worldContainer.width
      secretRobot.y = Math.random() * this.worldContainer.height
    }, 1000)
    
    // Desaparecer después de 10 segundos
    setTimeout(() => {
      clearInterval(moveInterval)
      const fadeOut = () => {
        if (secretRobot.alpha > 0) {
          secretRobot.alpha -= 0.05
          requestAnimationFrame(fadeOut)
        } else {
          this.worldContainer.removeChild(secretRobot)
          secretRobot.destroy()
        }
      }
      fadeOut()
    }, 10000)
  }

  /**
   * Evento: God Mode (Konami)
   */
  private startGodMode(): void {
    this.godModeActive = true
    this.onBonusMultiplier = 5
    
    // Efectos visuales
    this.worldContainer.filters = this.worldContainer.filters || []
    
    // Mostrar texto
    this.showFloatingText('🎮 MODO DIOS ACTIVADO! 🎮', this.worldContainer.x + this.worldContainer.width / 2, this.worldContainer.y + 100)
    
    // Duración 60 segundos
    setTimeout(() => {
      this.godModeActive = false
      this.onBonusMultiplier = 1
      this.worldContainer.filters = []
    }, 60000)
  }

  /**
   * Mostrar texto flotante
   */
  private showFloatingText(text: string, x: number, y: number): void {
    const container = new Container()
    
    const bg = new Graphics()
    bg.roundRect(-150, -30, 300, 60, 12)
    bg.fill({ color: 0x000000, alpha: 0.8 })
    bg.stroke({ color: 0xfbbf24, width: 3 })
    
    const label = new Text({
      text,
      style: new TextStyle({
        fontSize: 20,
        fontFamily: 'monospace',
        fill: 0xfbbf24,
        fontWeight: 'bold',
      }),
      anchor: 0.5,
    })
    
    container.addChild(bg)
    container.addChild(label)
    container.x = x
    container.y = y
    container.alpha = 0
    container.scale.set(0.5)
    
    this.worldContainer.addChild(container)
    
    // Animación
    let progress = 0
    const animate = () => {
      progress += 0.02
      if (progress < 1) {
        container.alpha = Math.sin(progress * Math.PI)
        container.scale.set(0.5 + Math.sin(progress * Math.PI) * 0.5)
        container.y = y - progress * 50
        requestAnimationFrame(animate)
      } else {
        this.worldContainer.removeChild(container)
        container.destroy()
      }
    }
    animate()
  }

  /**
   * Obtener multiplicador XP actual
   */
  getXPBonusMultiplier(): number {
    return this.onBonusMultiplier
  }

  /**
   * Verificar si god mode está activo
   */
  isGodModeActive(): boolean {
    return this.godModeActive
  }

  /**
   * Obtener eventos activos
   */
  getActiveEvents(): SurpriseEventType[] {
    return Array.from(this.activeEvents)
  }
}

// Singleton exportado
export const surpriseEventManager = (
  particles: ParticleSystem,
  soundManager: SoundManager,
  worldContainer: Container
) => new SurpriseEventManager(particles, soundManager, worldContainer)
