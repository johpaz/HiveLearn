/**
 * AgentSprite - Sprite animado para agentes del enjambre
 * Usa Graphics de PixiJS v8 para crear sprites vectoriales animados
 */
import { Container, Graphics, Text, TextStyle, Assets } from 'pixi.js'
import type { AgentStatus } from './constants'

export interface AgentSpriteOptions {
  agentId: string
  label: string
  emoji: string
  color: number
  x: number
  y: number
  deskX: number
  deskY: number
}

/**
 * Clase AgentSprite - Representa un agente educativo en el mundo PixiJS
 */
export class AgentSprite extends Container {
  public agentId: string
  public label: string
  public emoji: string
  public baseColor: number
  public deskX: number
  public deskY: number
  
  private body: Graphics
  private glowRing: Graphics
  private labelText: Text
  private emojiText: Text
  private statusBubble: Container | null
  private status: AgentStatus = 'idle'
  private animFrame: number = 0
  private animTimer: number = 0
  private targetX: number
  private targetY: number
  private isWalking: boolean = false
  private walkSpeed: number = 150 // pixeles por segundo

  constructor(options: AgentSpriteOptions) {
    super()
    this.agentId = options.agentId
    this.label = options.label
    this.emoji = options.emoji
    this.baseColor = options.color
    this.deskX = options.deskX
    this.deskY = options.deskY
    this.targetX = options.x
    this.targetY = options.y

    // Crear componentes visuales
    this.glowRing = new Graphics()
    this.body = new Graphics()
    this.emojiText = new Text({
      text: options.emoji,
      style: new TextStyle({
        fontSize: 24,
      }),
      anchor: 0.5,
    })
    this.labelText = new Text({
      text: options.label,
      style: new TextStyle({
        fontSize: 10,
        fontFamily: 'monospace',
        fill: 0xffffff,
        fontWeight: 'bold',
      }),
      anchor: { x: 0.5, y: 0 },
    })

    // Añadir al contenedor
    this.addChild(this.glowRing)
    this.addChild(this.body)
    this.addChild(this.emojiText)
    this.addChild(this.labelText)

    // Posicionar
    this.x = options.x
    this.y = options.y
    this.labelText.y = 30

    // Dibujar estado inicial
    this.draw()
  }

  /**
   * Dibujar el agente con su estado actual
   */
  private draw(): void {
    const color = this.baseColor
    const size = 20

    // Glow ring (anillo exterior brillante)
    this.glowRing.clear()
    if (this.status === 'running' || this.status === 'thinking' || this.status === 'tool_call') {
      this.glowRing.circle(0, 0, size + 8)
      this.glowRing.fill({ color, alpha: 0.2 })
      this.glowRing.stroke({ color, width: 2, alpha: 0.5 })
    }

    // Cuerpo del agente (hexágono)
    this.body.clear()
    this.body.moveTo(size * Math.cos(0), size * Math.sin(0))
    for (let i = 1; i <= 6; i++) {
      this.body.lineTo(
        size * Math.cos((i * 2 * Math.PI) / 6),
        size * Math.sin((i * 2 * Math.PI) / 6)
      )
    }
    
    // Color según estado
    let fillColor = color
    let strokeColor = color
    let strokeAlpha = 0.8

    switch (this.status) {
      case 'running':
      case 'thinking':
      case 'tool_call':
        fillColor = color
        strokeAlpha = 1
        break
      case 'completed':
        fillColor = 0x22c55e // verde
        strokeColor = 0x22c55e
        break
      case 'failed':
        fillColor = 0xef4444 // rojo
        strokeColor = 0xef4444
        break
      default:
        fillColor = color
        strokeAlpha = 0.5
    }

    this.body.fill({ color: fillColor, alpha: 0.8 })
    this.body.stroke({ color: strokeColor, width: 2, alpha: strokeAlpha })

    // Posicionar emoji y label
    this.emojiText.x = 0
    this.emojiText.y = 0
    this.labelText.x = 0
  }

  /**
   * Actualizar estado del agente
   */
  setStatus(newStatus: AgentStatus): void {
    const prevStatus = this.status
    this.status = newStatus
    
    // Crear burbuja de estado si cambia a running o completed
    if ((newStatus === 'running' || newStatus === 'completed') && prevStatus !== newStatus) {
      this.createStatusBubble()
    }

    this.draw()
  }

  /**
   * Crear burbuja de texto de estado
   */
  private createStatusBubble(): void {
    // Eliminar burbuja anterior
    if (this.statusBubble) {
      this.removeChild(this.statusBubble)
    }

    const speechTexts: Record<string, string> = {
      'hl-profile-agent': '👤 Perfil...',
      'hl-intent-agent': '🎯 Objetivo...',
      'hl-structure-agent': '🗺️ Estructura...',
      'hl-explanation-agent': '📖 Explicación...',
      'hl-exercise-agent': '✏️ Ejercicio...',
      'hl-quiz-agent': '❓ Quiz...',
      'hl-challenge-agent': '⚡ Reto...',
      'hl-code-agent': '💻 Código...',
      'hl-svg-agent': '📊 Diagrama...',
      'hl-gif-agent': '🎞️ Animación...',
      'hl-infographic-agent': '📈 Infografía...',
      'hl-image-agent': '🖼️ Imagen...',
      'hl-gamification-agent': '🏆 XP...',
      'hl-evaluation-agent': '📝 Evaluación...',
      'hl-feedback-agent': '🧠 Feedback...',
      'hl-audio-agent': '🔊 Audio...',
      'hl-coordinator-agent': '🔍 Coordinando...',
    }

    const text = speechTexts[this.agentId] || 'Trabajando...'

    this.statusBubble = new Container()
    
    // Fondo de la burbuja
    const bubbleBg = new Graphics()
    bubbleBg.roundRect(-60, -50, 120, 30, 8)
    bubbleBg.fill({ color: 0xffffff, alpha: 0.95 })
    bubbleBg.stroke({ color: this.baseColor, width: 2 })
    
    // Texto
    const bubbleText = new Text({
      text,
      style: new TextStyle({
        fontSize: 11,
        fontFamily: 'monospace',
        fill: 0x000000,
      }),
      anchor: 0.5,
    })

    this.statusBubble.addChild(bubbleBg)
    this.statusBubble.addChild(bubbleText)
    this.statusBubble.y = -60
    this.statusBubble.alpha = 0

    this.addChild(this.statusBubble)

    // Animación de fade in
    const fadeIn = () => {
      if (this.statusBubble && this.statusBubble.alpha < 1) {
        this.statusBubble.alpha += 0.1
        requestAnimationFrame(fadeIn)
      }
    }
    fadeIn()

    // Auto-eliminar después de 2 segundos
    setTimeout(() => {
      if (this.statusBubble && this.parent) {
        const fadeOut = () => {
          if (this.statusBubble && this.statusBubble.alpha > 0) {
            this.statusBubble.alpha -= 0.1
            requestAnimationFrame(fadeOut)
          } else if (this.statusBubble && this.parent) {
            this.parent.removeChild(this.statusBubble)
            this.statusBubble = null
          }
        }
        fadeOut()
      }
    }, 2000)
  }

  /**
   * Caminar hacia una posición objetivo
   */
  walkTo(x: number, y: number): void {
    this.targetX = x
    this.targetY = y
    this.isWalking = true
  }

  /**
   * Volver al escritorio
   */
  returnToDesk(): void {
    this.targetX = this.deskX
    this.targetY = this.deskY
    this.isWalking = true
  }

  /**
   * Actualizar animación (llamar en cada frame)
   */
  update(delta: number): void {
    const dt = delta / 1000 // convertir a segundos

    // Animación de idle (respiración)
    if (!this.isWalking && this.status === 'idle') {
      this.animTimer += dt
      this.scale.set(1 + Math.sin(this.animTimer * 2) * 0.02)
    }

    // Animación de running (vibración)
    if (this.status === 'running' || this.status === 'thinking') {
      this.animTimer += dt * 10
      this.x += Math.sin(this.animTimer) * 0.5
      this.y += Math.cos(this.animTimer) * 0.5
    }

    // Movimiento hacia objetivo
    if (this.isWalking) {
      const dx = this.targetX - this.x
      const dy = this.targetY - this.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 2) {
        this.isWalking = false
        this.x = this.targetX
        this.y = this.targetY
      } else {
        const moveX = (dx / distance) * this.walkSpeed * dt
        const moveY = (dy / distance) * this.walkSpeed * dt
        this.x += moveX
        this.y += moveY
      }
    }

    // Actualizar glow ring animation
    if (this.status === 'running' || this.status === 'thinking') {
      this.animFrame += dt * 5
      this.glowRing.scale.set(1 + Math.sin(this.animFrame) * 0.1)
    }
  }

  /**
   * Obtener estado actual
   */
  getStatus(): AgentStatus {
    return this.status
  }

  /**
   * Obtener posición actual
   */
  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y }
  }
}
