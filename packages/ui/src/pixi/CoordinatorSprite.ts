/**
 * CoordinatorSprite - Sprite especial para el agente coordinador
 * Más grande y con efectos visuales distintivos
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { AgentStatus } from './constants'

export interface CoordinatorSpriteOptions {
  x: number
  y: number
  deskX: number
  deskY: number
}

/**
 * Clase CoordinatorSprite - Representa el coordinador del enjambre
 */
export class CoordinatorSprite extends Container {
  public deskX: number
  public deskY: number
  
  private body: Graphics
  private crownRing: Graphics
  private glowEffect: Graphics
  private labelText: Text
  private status: AgentStatus = 'idle'
  private targetX: number
  private targetY: number
  private isWalking: boolean = false
  private walkSpeed: number = 120 // más lento que los agentes
  private animTimer: number = 0
  private animFrame: number = 0

  constructor(options: CoordinatorSpriteOptions) {
    super()
    this.deskX = options.deskX
    this.deskY = options.deskY
    this.targetX = options.x
    this.targetY = options.y

    // Crear componentes visuales
    this.glowEffect = new Graphics()
    this.crownRing = new Graphics()
    this.body = new Graphics()
    this.labelText = new Text({
      text: 'Coordinador',
      style: new TextStyle({
        fontSize: 12,
        fontFamily: 'monospace',
        fill: 0xfbbf24,
        fontWeight: 'bold',
      }),
      anchor: { x: 0.5, y: 0 },
    })

    // Añadir al contenedor
    this.addChild(this.glowEffect)
    this.addChild(this.crownRing)
    this.addChild(this.body)
    this.addChild(this.labelText)

    // Posicionar
    this.x = options.x
    this.y = options.y
    this.labelText.y = 40

    // Dibujar estado inicial
    this.draw()
  }

  /**
   * Dibujar el coordinador con efectos especiales
   */
  private draw(): void {
    const color = 0xfbbf24 // dorado
    const size = 28 // más grande que los agentes normales

    // Glow effect (aura dorada)
    this.glowEffect.clear()
    if (this.status === 'running' || this.status === 'thinking') {
      // Aura animada
      this.glowEffect.circle(0, 0, size + 15)
      this.glowEffect.fill({ color, alpha: 0.15 })
      
      // Anillos concéntricos
      for (let i = 0; i < 3; i++) {
        const radius = size + 8 + i * 5
        const alpha = 0.3 - i * 0.1
        this.glowEffect.circle(0, 0, radius)
        this.glowEffect.stroke({ color, width: 2, alpha })
      }
    }

    // Crown ring (anillo de corona)
    this.crownRing.clear()
    this.crownRing.moveTo(0, -size - 10)
    this.crownRing.lineTo(-8, -size - 2)
    this.crownRing.lineTo(-5, -size - 2)
    this.crownRing.lineTo(0, -size - 8)
    this.crownRing.lineTo(5, -size - 2)
    this.crownRing.lineTo(8, -size - 2)
    this.crownRing.lineTo(0, -size - 10)
    this.crownRing.fill({ color, alpha: 0.6 })
    this.crownRing.stroke({ color: 0xffffff, width: 1, alpha: 0.8 })

    // Cuerpo del coordinador (círculo con borde dorado)
    this.body.clear()
    
    // Color según estado
    let fillColor = color
    let strokeColor = color
    let strokeAlpha = 0.9

    switch (this.status) {
      case 'running':
      case 'thinking':
      case 'tool_call':
        fillColor = color
        strokeAlpha = 1
        break
      case 'completed':
        fillColor = 0x22c55e
        strokeColor = 0x22c55e
        break
      case 'failed':
        fillColor = 0xef4444
        strokeColor = 0xef4444
        break
      default:
        fillColor = color
        strokeAlpha = 0.6
    }

    // Dibujar círculo principal
    this.body.circle(0, 0, size)
    this.body.fill({ color: fillColor, alpha: 0.85 })
    this.body.stroke({ color: strokeColor, width: 3, alpha: strokeAlpha })

    // Detalle interno (patrón de red)
    this.body.circle(0, 0, size * 0.6)
    this.body.stroke({ color: 0xffffff, width: 1, alpha: 0.3 })
    
    // Líneas de conexión (simulando red neuronal)
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      const innerR = size * 0.3
      const outerR = size * 0.7
      this.body.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR)
      this.body.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR)
    }
    this.body.stroke({ color: 0xffffff, width: 1, alpha: 0.2 })

    // Posicionar label
    this.labelText.x = 0
  }

  /**
   * Actualizar estado del coordinador
   */
  setStatus(newStatus: AgentStatus): void {
    this.status = newStatus
    this.draw()
  }

  /**
   * Caminar hacia un agente objetivo
   */
  walkToAgent(agentX: number, agentY: number): void {
    this.targetX = agentX
    this.targetY = agentY - 30 // un poco arriba del agente
    this.isWalking = true
  }

  /**
   * Volver a la posición central
   */
  returnToCenter(): void {
    this.targetX = this.deskX
    this.targetY = this.deskY
    this.isWalking = true
  }

  /**
   * Actualizar animación (llamar en cada frame)
   */
  update(delta: number): void {
    const dt = delta / 1000

    // Animación de idle (flotación suave)
    if (!this.isWalking && this.status === 'idle') {
      this.animTimer += dt
      this.y += Math.sin(this.animTimer) * 0.3
      this.scale.set(1 + Math.sin(this.animTimer * 0.5) * 0.02)
    }

    // Animación de thinking (rotación sutil)
    if (this.status === 'thinking') {
      this.animFrame += dt * 3
      this.rotation = Math.sin(this.animFrame) * 0.05
    }

    // Animación de running (vibración energética)
    if (this.status === 'running' || this.status === 'tool_call') {
      this.animTimer += dt * 15
      this.x += Math.sin(this.animTimer) * 0.3
      this.y += Math.cos(this.animTimer * 1.5) * 0.3
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
        
        // Inclinación hacia adelante al caminar
        this.rotation = dx > 0 ? 0.05 : -0.05
      }
    } else {
      // Enderezar
      this.rotation = 0
    }

    // Actualizar glow animation
    if (this.status === 'running' || this.status === 'thinking') {
      this.animFrame += dt * 2
      const pulse = 1 + Math.sin(this.animFrame * 3) * 0.1
      this.glowEffect.scale.set(pulse)
    }
  }

  /**
   * Obtener estado actual
   */
  getStatus(): AgentStatus {
    return this.status
  }

  /**
   * Verificar si está caminando
   */
  isWalkingToAgent(): boolean {
    return this.isWalking
  }
}
