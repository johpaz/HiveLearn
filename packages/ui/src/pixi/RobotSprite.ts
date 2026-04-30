/**
 * RobotSprite - Sprite de robot procedural con expresiones faciales y animaciones
 *
 * Robot completamente generado con Graphics de PixiJS v8
 * Sin assets externos - todo procedural
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { AgentStatus } from './constants'
import { ROBOT_CONFIG, EXPRESSIONS, AGENT_LABELS, AGENT_SPEECH, AGENT_IDLE_PHRASES, INTERACTION_CONFIG, SIGNATURE_ANIMATIONS, lerp, clamp } from './constants'
import { Tween2D, Easings, Tween } from './Tween'
import { soundManager } from './SoundManager'
import { particleSystem } from './ParticleSystem'

export interface RobotSpriteOptions {
  agentId: string
  color: number
  x: number
  y: number
  stationX: number
  stationY: number
  isCoordinator?: boolean
}

/**
 * Clase RobotSprite - Representa un robot agente en el laboratorio
 */
export class RobotSprite extends Container {
  public agentId: string
  public color: number
  public stationX: number
  public stationY: number
  public isCoordinator: boolean
  
  // Componentes visuales
  private body: Graphics
  private head: Graphics
  private eyes: Graphics
  private mouth: Graphics
  private eyebrows: Graphics
  private antenna: Graphics
  private antennaTip: Graphics
  private arms: { left: Graphics; right: Graphics }
  private wheels: { left: Graphics; right: Graphics }
  private glowEffect: Graphics
  private label: Text
  private roleLabel: Text
  private xpBar: Graphics | null
  private speechBubble: Container | null

  // Estado interno
  private status: AgentStatus = 'idle'
  private currentExpression = EXPRESSIONS.idle
  private animTimer = 0
  private blinkTimer = 0
  private antennaTimer = 0
  private targetRotation = 0
  private isMoving = false
  private wheelRotation = 0
  private moveTween: Tween2D | null = null
  private moveSpeed = ROBOT_CONFIG.walkSpeed
  private isReturning = false

  // Para animaciones
  private hoverOffset = 0
  private eyeFollowTarget: { x: number; y: number } | null = null
  private armAngle = { left: 0, right: 0 }
  private tiltAngle = 0
  
  // Interactividad
  private isDragging = false
  private dragOffset = { x: 0, y: 0 }
  private isWaving = false
  private waveTimer = 0
  private idlePhraseTimer = 0
  private jumpVelocity = 0
  private isJumping = false
  private onGround = true
  private clickCallback: (() => void) | null = null
  
  // Animaciones signature
  private isPerformingSignature = false
  private signatureTween: Tween | null = null
  private signatureScale = 1
  private signatureRotation = 0
  
  constructor(options: RobotSpriteOptions) {
    super()
    this.agentId = options.agentId
    this.color = options.color
    this.stationX = options.stationX
    this.stationY = options.stationY
    this.isCoordinator = options.isCoordinator ?? false
    
    // Posición inicial
    this.x = options.x
    this.y = options.y
    
    // Crear todos los componentes
    this.createComponents()
    
    // Configurar interacción
    this.setupInteraction()
  }
  
  /**
   * Crear todos los componentes visuales del robot
   */
  private createComponents(): void {
    const config = this.isCoordinator 
      ? { ...ROBOT_CONFIG, bodyWidth: 80, bodyHeight: 90, headRadius: 35, wheelWidth: 60 }
      : ROBOT_CONFIG
    
    // 1. Glow effect (fondo brillante)
    this.glowEffect = new Graphics()
    this.addChild(this.glowEffect)
    
    // 2. Ruedas
    this.wheels = {
      left: this.createWheel(config.wheelWidth, config.wheelHeight),
      right: this.createWheel(config.wheelWidth, config.wheelHeight),
    }
    this.wheels.left.x = -config.bodyWidth / 2 - config.wheelWidth / 2 + 5
    this.wheels.left.y = config.bodyHeight / 2
    this.wheels.right.x = config.bodyWidth / 2 + config.wheelWidth / 2 - 5
    this.wheels.right.y = config.bodyHeight / 2
    this.addChild(this.wheels.left)
    this.addChild(this.wheels.right)
    
    // 3. Cuerpo
    this.body = new Graphics()
    this.addChild(this.body)
    
    // 4. Brazos
    this.arms = {
      left: this.createArm(),
      right: this.createArm(),
    }
    this.arms.left.x = -config.bodyWidth / 2
    this.arms.left.y = -config.bodyHeight / 4
    this.arms.right.x = config.bodyWidth / 2
    this.arms.right.y = -config.bodyHeight / 4
    this.addChild(this.arms.left)
    this.addChild(this.arms.right)
    
    // 5. Cabeza
    this.head = new Graphics()
    this.addChild(this.head)
    
    // 6. Ojos
    this.eyes = new Graphics()
    this.head.addChild(this.eyes)
    
    // 7. Cejas
    this.eyebrows = new Graphics()
    this.head.addChild(this.eyebrows)
    
    // 8. Boca
    this.mouth = new Graphics()
    this.head.addChild(this.mouth)
    
    // 9. Antena
    this.antenna = new Graphics()
    this.head.addChild(this.antenna)
    
    this.antennaTip = new Graphics()
    this.head.addChild(this.antennaTip)
    
    // 10. Labels
    const agentInfo = AGENT_LABELS[this.agentId] || { label: this.agentId, emoji: '🤖', role: 'Robot' }
    
    this.label = new Text({
      text: agentInfo.label,
      style: new TextStyle({
        fontSize: this.isCoordinator ? 14 : 11,
        fontFamily: 'monospace',
        fill: this.color,
        fontWeight: 'bold',
      }),
      anchor: { x: 0.5, y: 0 },
    })
    this.label.y = config.bodyHeight / 2 + config.headRadius + 8
    this.addChild(this.label)
    
    this.roleLabel = new Text({
      text: agentInfo.role,
      style: new TextStyle({
        fontSize: 8,
        fontFamily: 'monospace',
        fill: 0x666688,
      }),
      anchor: { x: 0.5, y: 0 },
    })
    this.roleLabel.y = this.label.y + 14
    this.addChild(this.roleLabel)
    
    // 11. Barra de XP (oculta inicialmente)
    this.xpBar = null
    
    // Dibujar todo por primera vez
    this.draw()
  }
  
  /**
   * Crear una rueda
   */
  private createWheel(width: number, height: number): Graphics {
    const wheel = new Graphics()
    
    // Dibujar rueda con detalles
    wheel.roundRect(-width / 2, -height / 2, width, height, 3)
    wheel.fill({ color: 0x3a4050 })
    wheel.stroke({ color: 0x5a6070, width: 2 })
    
    // Rayos de la rueda
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2
      const innerR = height / 4
      const outerR = height / 2 - 2
      wheel.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR)
      wheel.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR)
    }
    wheel.stroke({ color: 0x7a8090, width: 1 })
    
    return wheel
  }
  
  /**
   * Crear un brazo
   */
  private createArm(): Graphics {
    const arm = new Graphics()
    
    // Brazo superior
    arm.roundRect(-ROBOT_CONFIG.armWidth / 2, 0, ROBOT_CONFIG.armWidth, ROBOT_CONFIG.armLength, 4)
    arm.fill({ color: this.color })
    arm.stroke({ color: 0xffffff, width: 1, alpha: 0.3 })
    
    // Mano/pinza
    arm.circle(0, ROBOT_CONFIG.armLength, 6)
    arm.fill({ color: 0x5a6070 })
    
    return arm
  }
  
  /**
   * Dibujar todo el robot
   */
  private draw(): void {
    const config = this.isCoordinator
      ? { ...ROBOT_CONFIG, bodyWidth: 80, bodyHeight: 90, headRadius: 35 }
      : ROBOT_CONFIG
    
    // Glow effect
    this.glowEffect.clear()
    if (this.status === 'running' || this.status === 'thinking' || this.status === 'tool_call') {
      this.glowEffect.circle(0, 0, config.bodyWidth)
      this.glowEffect.fill({ color: this.color, alpha: 0.15 })
      this.glowEffect.stroke({ color: this.color, width: 3, alpha: 0.5 })
    }
    
    // Cuerpo
    this.body.clear()
    this.body.roundRect(
      -config.bodyWidth / 2,
      -config.bodyHeight / 2,
      config.bodyWidth,
      config.bodyHeight,
      8
    )
    this.body.fill({ color: this.color, alpha: 0.85 })
    this.body.stroke({ color: 0xffffff, width: 2, alpha: 0.4 })
    
    // Panel frontal del cuerpo
    this.body.roundRect(
      -config.bodyWidth / 2 + 5,
      -config.bodyHeight / 2 + 10,
      config.bodyWidth - 10,
      config.bodyHeight - 20,
      4
    )
    this.body.stroke({ color: 0x000000, width: 1, alpha: 0.2 })
    
    // Detalles del coordinador
    if (this.isCoordinator) {
      // Panel especial en el pecho
      this.body.circle(0, 0, 20)
      this.body.stroke({ color: 0xfbbf24, width: 2, alpha: 0.6 })
      
      // Líneas de circuito
      for (let i = -2; i <= 2; i++) {
        this.body.moveTo(i * 10, -30)
        this.body.lineTo(i * 10, 30)
      }
      this.body.stroke({ color: 0xffffff, width: 1, alpha: 0.15 })
    }
    
    // Cabeza
    this.head.clear()
    this.head.circle(0, 0, config.headRadius)
    this.head.fill({ color: this.color, alpha: 0.9 })
    this.head.stroke({ color: 0xffffff, width: 2, alpha: 0.5 })
    this.head.y = -config.bodyHeight / 2 - config.headRadius + 5
    
    // Cara (fondo más claro)
    this.head.ellipse(0, 3, config.headRadius - 5, config.headRadius - 8)
    this.head.fill({ color: 0xffffff, alpha: 0.1 })
    
    // Antena
    this.antenna.clear()
    this.antenna.moveTo(0, -config.headRadius + 5)
    this.antenna.lineTo(0, -config.headRadius - config.antennaLength + 5)
    this.antenna.stroke({ color: 0xffffff, width: 2 })
    
    // Punta de antena
    this.antennaTip.clear()
    this.antennaTip.circle(0, -config.headRadius - config.antennaLength + 5, config.antennaRadius)
    this.antennaTip.fill({ color: this.status === 'running' || this.status === 'thinking' ? 0xffffff : this.color })
    this.antennaTip.alpha = this.status === 'running' || this.status === 'thinking' ? 1 : 0.7
    
    // Expresión facial actual
    this.drawExpression()
    
    // Actualizar posición del label
    this.label.y = config.bodyHeight / 2 + config.headRadius + 8
    this.roleLabel.y = this.label.y + 14
  }
  
  /**
   * Dibujar expresión facial
   */
  private drawExpression(): void {
    const config = this.isCoordinator
      ? { ...ROBOT_CONFIG, headRadius: 35 }
      : ROBOT_CONFIG
    
    const eyeOffsetX = 8
    const eyeOffsetY = 0
    const eyeSpacing = 10
    
    // Ojos
    this.eyes.clear()
    this.eyebrows.clear()
    this.mouth.clear()
    
    const expr = this.currentExpression
    
    // Dibujar ojos según expresión
    this.drawEyes(eyeOffsetX, eyeOffsetY, eyeSpacing, expr.eyes)
    
    // Dibujar cejas
    this.drawEyebrows(eyeOffsetX, eyeOffsetY, eyeSpacing, expr.eyebrows)
    
    // Dibujar boca
    this.drawMouth(0, config.headRadius / 2, expr.mouth)
  }
  
  /**
   * Dibujar ojos
   */
  private drawEyes(offsetX: number, offsetY: number, spacing: number, type: string): void {
    const eyeRadius = ROBOT_CONFIG.eyeRadius
    
    switch (type) {
      case 'normal':
        // Ojos normales (puntos)
        this.eyes.circle(-spacing, offsetY, eyeRadius)
        this.eyes.circle(spacing, offsetY, eyeRadius)
        this.eyes.fill({ color: 0xffffff })
        break
        
      case 'focused':
        // Ojos concentrados (círculos más grandes)
        this.eyes.circle(-spacing, offsetY, eyeRadius + 2)
        this.eyes.circle(spacing, offsetY, eyeRadius + 2)
        this.eyes.fill({ color: 0xffffff })
        this.eyes.circle(-spacing, offsetY, eyeRadius - 1)
        this.eyes.circle(spacing, offsetY, eyeRadius - 1)
        this.eyes.fill({ color: 0x000000 })
        break
        
      case 'up':
        // Ojos mirando arriba
        this.eyes.arc(-spacing, offsetY - 2, eyeRadius, 0, Math.PI * 2)
        this.eyes.arc(spacing, offsetY - 2, eyeRadius, 0, Math.PI * 2)
        this.eyes.stroke({ color: 0xffffff, width: 2 })
        break
        
      case 'happy':
        // Ojos felices (curvas)
        this.eyes.arc(-spacing, offsetY, eyeRadius, Math.PI, Math.PI * 2)
        this.eyes.arc(spacing, offsetY, eyeRadius, Math.PI, Math.PI * 2)
        this.eyes.stroke({ color: 0xffffff, width: 3 })
        break
        
      case 'sad':
        // Ojos tristes (curvas invertidas)
        this.eyes.arc(-spacing, offsetY + 3, eyeRadius, 0, Math.PI)
        this.eyes.arc(spacing, offsetY + 3, eyeRadius, 0, Math.PI)
        this.eyes.stroke({ color: 0xffffff, width: 2 })
        break
        
      case 'wide':
        // Ojos sorprendidos (grandes)
        this.eyes.circle(-spacing, offsetY, eyeRadius + 3)
        this.eyes.circle(spacing, offsetY, eyeRadius + 3)
        this.eyes.fill({ color: 0xffffff })
        this.eyes.circle(-spacing, offsetY, eyeRadius)
        this.eyes.circle(spacing, offsetY, eyeRadius)
        this.eyes.fill({ color: 0x000000 })
        break
        
      case 'x':
        // Ojos X (falló)
        this.drawXEye(-spacing, offsetY, eyeRadius + 2)
        this.drawXEye(spacing, offsetY, eyeRadius + 2)
        break
    }
  }
  
  /**
   * Dibujar ojo en X
   */
  private drawXEye(x: number, y: number, size: number): void {
    this.eyes.moveTo(x - size, y - size)
    this.eyes.lineTo(x + size, y + size)
    this.eyes.moveTo(x + size, y - size)
    this.eyes.lineTo(x - size, y + size)
    this.eyes.stroke({ color: 0xffffff, width: 2 })
  }
  
  /**
   * Dibujar cejas
   */
  private drawEyebrows(offsetX: number, offsetY: number, spacing: number, type: string): void {
    const browY = offsetY - 8
    const browLength = 8
    
    switch (type) {
      case 'neutral':
        this.eyebrows.moveTo(-spacing - browLength / 2, browY)
        this.eyebrows.lineTo(-spacing + browLength / 2, browY)
        this.eyebrows.moveTo(spacing - browLength / 2, browY)
        this.eyebrows.lineTo(spacing + browLength / 2, browY)
        this.eyebrows.stroke({ color: 0xffffff, width: 2, alpha: 0.5 })
        break
        
      case 'down':
        // Cejas hacia abajo (enojado/concentrado)
        this.eyebrows.moveTo(-spacing - browLength / 2, browY - 2)
        this.eyebrows.lineTo(-spacing + browLength / 2, browY + 2)
        this.eyebrows.moveTo(spacing - browLength / 2, browY + 2)
        this.eyebrows.lineTo(spacing + browLength / 2, browY - 2)
        this.eyebrows.stroke({ color: 0xffffff, width: 2, alpha: 0.7 })
        break
        
      case 'up':
        // Cejas arqueadas (pensando)
        this.eyebrows.arc(-spacing, browY + 3, browLength / 2, Math.PI, Math.PI * 2)
        this.eyebrows.arc(spacing, browY + 3, browLength / 2, Math.PI, Math.PI * 2)
        this.eyebrows.stroke({ color: 0xffffff, width: 2, alpha: 0.6 })
        break
        
      case 'down-inner':
        // Cejas hacia adentro abajo (triste)
        this.eyebrows.moveTo(-spacing - browLength / 2, browY)
        this.eyebrows.lineTo(-spacing + browLength / 2, browY + 4)
        this.eyebrows.moveTo(spacing - browLength / 2, browY + 4)
        this.eyebrows.lineTo(spacing + browLength / 2, browY)
        this.eyebrows.stroke({ color: 0xffffff, width: 2, alpha: 0.6 })
        break
        
      case 'up-high':
        // Cejas muy arriba (sorprendido)
        this.eyebrows.arc(-spacing, browY - 3, browLength / 2, 0, Math.PI)
        this.eyebrows.arc(spacing, browY - 3, browLength / 2, 0, Math.PI)
        this.eyebrows.stroke({ color: 0xffffff, width: 2, alpha: 0.7 })
        break
    }
  }
  
  /**
   * Dibujar boca
   */
  private drawMouth(x: number, y: number, type: string): void {
    const mouthWidth = 10
    
    switch (type) {
      case 'neutral':
        // Línea recta
        this.mouth.moveTo(x - mouthWidth / 2, y)
        this.mouth.lineTo(x + mouthWidth / 2, y)
        this.mouth.stroke({ color: 0xffffff, width: 2, alpha: 0.6 })
        break
        
      case 'smile':
        // Sonrisa
        this.mouth.arc(x, y + 5, mouthWidth / 2, 0, Math.PI)
        this.mouth.stroke({ color: 0xffffff, width: 2, alpha: 0.8 })
        break
        
      case 'frown':
        // Triste
        this.mouth.arc(x, y - 5, mouthWidth / 2, Math.PI, Math.PI * 2)
        this.mouth.stroke({ color: 0xffffff, width: 2, alpha: 0.6 })
        break
        
      case 'small-o':
        // O pequeño (pensando)
        this.mouth.circle(x, y, 3)
        this.mouth.stroke({ color: 0xffffff, width: 1, alpha: 0.5 })
        break
        
      case 'o':
        // O grande (sorprendido)
        this.mouth.ellipse(x, y, 5, 7)
        this.mouth.stroke({ color: 0xffffff, width: 2, alpha: 0.7 })
        break
        
      case 'concentrated':
        // Línea tensa
        this.mouth.moveTo(x - mouthWidth / 2, y)
        this.mouth.lineTo(x + mouthWidth / 2, y)
        this.mouth.stroke({ color: 0xffffff, width: 3, alpha: 0.5 })
        break
        
      case 'wave':
        // Línea ondulada (falló)
        this.mouth.moveTo(x - mouthWidth / 2, y)
        for (let i = 0; i < 4; i++) {
          const wx = x - mouthWidth / 2 + (i / 4) * mouthWidth
          const wy = y + Math.sin(i * Math.PI) * 3
          this.mouth.lineTo(wx, wy)
        }
        this.mouth.stroke({ color: 0xffffff, width: 2, alpha: 0.5 })
        break
    }
  }
  
  /**
   * Actualizar estado del robot
   */
  setStatus(newStatus: AgentStatus): void {
    const prevStatus = this.status
    this.status = newStatus
    
    // Actualizar expresión según estado
    switch (newStatus) {
      case 'idle':
        this.currentExpression = EXPRESSIONS.idle
        break
      case 'running':
      case 'tool_call':
        this.currentExpression = EXPRESSIONS.running
        break
      case 'thinking':
        this.currentExpression = EXPRESSIONS.thinking
        break
      case 'completed':
        this.currentExpression = EXPRESSIONS.happy
        break
      case 'failed':
        this.currentExpression = EXPRESSIONS.failed
        break
    }
    
    // Si completó, mostrar burbuja de celebración
    if (newStatus === 'completed' && prevStatus !== 'completed') {
      this.showSpeechBubble('completed')
    }
    
    // Si falló, mostrar burbuja triste
    if (newStatus === 'failed' && prevStatus !== 'failed') {
      this.showSpeechBubble('failed')
    }
    
    this.draw()
  }
  
  /**
   * Mostrar burbuja de diálogo
   */
  showSpeechBubble(type: 'running' | 'completed' | 'failed' | 'thinking'): void {
    // Eliminar burbuja anterior
    if (this.speechBubble) {
      this.removeChild(this.speechBubble)
    }
    
    const speeches = (AGENT_SPEECH as any)[this.agentId]?.[type] || ['Trabajando...']
    const text = speeches[Math.floor(Math.random() * speeches.length)]
    
    this.speechBubble = new Container()
    
    // Fondo de burbuja
    const bubbleBg = new Graphics()
    const padding = 8
    const bubbleBgGraphics = new Graphics()
    
    // Crear texto temporal para medir
    const tempText = new Text({
      text,
      style: new TextStyle({
        fontSize: 10,
        fontFamily: 'monospace',
        fill: 0x000000,
      }),
    })
    const textMetrics = tempText.width
    tempText.destroy()
    
    const bubbleWidth = Math.min(150, textMetrics + padding * 2)
    const bubbleHeight = 24
    
    bubbleBgGraphics.roundRect(-bubbleWidth / 2, -bubbleHeight - 10, bubbleWidth, bubbleHeight, 6)
    bubbleBgGraphics.fill({ color: 0xffffff, alpha: 0.95 })
    bubbleBgGraphics.stroke({ color: this.color, width: 2 })
    
    // Triángulo de la burbuja
    bubbleBgGraphics.moveTo(-5, -10)
    bubbleBgGraphics.lineTo(5, -10)
    bubbleBgGraphics.lineTo(0, 0)
    bubbleBgGraphics.fill({ color: 0xffffff, alpha: 0.95 })
    bubbleBgGraphics.stroke({ color: this.color, width: 2 })
    
    // Texto
    const bubbleText = new Text({
      text,
      style: new TextStyle({
        fontSize: 10,
        fontFamily: 'monospace',
        fill: 0x000000,
        wordWrap: true,
        wordWrapWidth: bubbleWidth - padding * 2,
      }),
      anchor: { x: 0.5, y: 0.5 },
    })
    
    this.speechBubble.addChild(bubbleBgGraphics)
    this.speechBubble.addChild(bubbleText)
    this.speechBubble.y = -ROBOT_CONFIG.bodyHeight / 2 - ROBOT_CONFIG.headRadius - 20
    this.speechBubble.alpha = 0
    
    this.addChild(this.speechBubble)
    
    // Animación fade in
    const fadeIn = () => {
      if (this.speechBubble && this.speechBubble.alpha < 1) {
        this.speechBubble.alpha += 0.15
        requestAnimationFrame(fadeIn)
      }
    }
    fadeIn()
    
    // Auto-eliminar después de 2.5 segundos
    setTimeout(() => {
      if (this.speechBubble && this.parent) {
        const fadeOut = () => {
          if (this.speechBubble && this.speechBubble.alpha > 0) {
            this.speechBubble.alpha -= 0.15
            requestAnimationFrame(fadeOut)
          } else if (this.speechBubble && this.parent) {
            this.parent.removeChild(this.speechBubble)
            this.speechBubble = null
          }
        }
        fadeOut()
      }
    }, 2500)
  }
  
  /**
   * Configurar interacción (hover, click, drag, wave)
   */
  private setupInteraction(): void {
    this.eventMode = 'static'
    this.cursor = 'pointer'

    // Hover - escala, sonido y saludo
    this.on('pointerenter', () => {
      if (!this.isDragging && !this.isPerformingSignature) {
        this.scale.set(ROBOT_CONFIG.scale.hover)
        this.wave() // Saludar
      }
      this.showSpeechBubble('greet')
      soundManager.play('hover')
    })

    this.on('pointerleave', () => {
      if (!this.isDragging) {
        this.scale.set(ROBOT_CONFIG.scale.idle)
      }
    })

    // Click - salto y celebración
    this.on('pointerdown', (event) => {
      this.isDragging = true
      const localPos = event.getLocalPosition(this.parent)
      this.dragOffset = {
        x: this.x - localPos.x,
        y: this.y - localPos.y,
      }
      
      // Sonido click
      soundManager.play('click')
      
      // Salto pequeño
      this.jump()
    })

    // Drag - seguir cursor
    this.on('pointermove', (event) => {
      if (this.isDragging) {
        const localPos = event.getLocalPosition(this.parent)
        const targetX = localPos.x + this.dragOffset.x
        const targetY = localPos.y + this.dragOffset.y
        
        // Movimiento suave con lerp
        this.x = lerp(this.x, targetX, INTERACTION_CONFIG.dragSpeed)
        this.y = lerp(this.y, targetY, INTERACTION_CONFIG.dragSpeed)
        
        // Inclinación hacia el movimiento
        this.rotation = (targetX - this.x) * 0.01
      }
    })

    // Soltar - retorno elástico a estación
    this.on('pointerup', () => {
      this.isDragging = false
      this.scale.set(ROBOT_CONFIG.scale.idle)
      this.rotation = 0
      
      // Retorno suave a la estación
      this.returnToStation()
    })

    this.on('pointerupoutside', () => {
      this.isDragging = false
      this.scale.set(ROBOT_CONFIG.scale.idle)
      this.rotation = 0
      this.returnToStation()
    })

    // Doble click - celebración especial
    this.on('dblclick', () => {
      this.celebrateSpecial()
      soundManager.play('robotComplete')
    })

    // Right click - mostrar info
    this.on('rightclick', () => {
      this.showInfo()
    })
  }
  
  /**
   * Actualizar animación (llamar en cada frame)
   */
  update(delta: number): void {
    const dt = delta / 1000 // convertir a segundos
    this.animTimer += dt

    // Física de salto
    if (this.isJumping) {
      this.y += this.jumpVelocity * dt
      this.jumpVelocity -= 400 * dt // Gravedad
      
      if (this.y >= this.stationY + this.hoverOffset) {
        this.y = this.stationY + this.hoverOffset
        this.isJumping = false
        this.onGround = true
        this.jumpVelocity = 0
      }
    }

    // Actualizar tween de movimiento
    if (this.moveTween) {
      this.moveTween.update(delta * 1000) // Tween usa ms
      const pos = this.moveTween.getPosition()
      this.x = pos.x
      this.y = pos.y

      // Inclinación hacia adelante al mover
      const dx = pos.x - this.x
      this.tiltAngle = clamp(dx * 0.001, -0.15, 0.15)
      this.rotation = this.tiltAngle

      // Ruedas girando
      this.wheelRotation += ROBOT_CONFIG.wheelRotationSpeed * dt
      this.wheels.left.rotation = this.wheelRotation
      this.wheels.right.rotation = -this.wheelRotation

      // Brazos ligeramente levantados al mover
      this.arms.left.rotation = -0.2
      this.arms.right.rotation = 0.2

      if (this.moveTween.isComplete) {
        this.moveTween = null
        this.isMoving = false
        this.rotation = 0
        this.arms.left.rotation = 0
        this.arms.right.rotation = 0
      }
    }

    // Flotación idle (solo si no está saltando, arrastrando o performing signature)
    if (!this.isMoving && !this.isJumping && !this.isDragging && !this.isPerformingSignature && this.status === 'idle') {
      this.hoverOffset = Math.sin(this.animTimer * ROBOT_CONFIG.hoverFrequency) * ROBOT_CONFIG.hoverAmplitude
      this.y = this.stationY + this.hoverOffset
      this.rotation = 0
    }

    // Frases idle aleatorias (solo si no está ocupado)
    if (!this.isMoving && !this.isJumping && !this.isDragging && !this.isPerformingSignature && this.status === 'idle') {
      this.idlePhraseTimer += dt
      const idleInterval = INTERACTION_CONFIG.idlePhraseInterval
      const idleIntervalRandom = idleInterval[0] + Math.random() * (idleInterval[1] - idleInterval[0])
      
      if (this.idlePhraseTimer > idleIntervalRandom) {
        this.showIdlePhrase()
        this.idlePhraseTimer = 0
      }
    }

    // Parpadeo de ojos
    this.blinkTimer += dt
    const blinkInterval = ROBOT_CONFIG.blinkInterval
    const blinkIntervalRandom = blinkInterval[0] + Math.random() * (blinkInterval[1] - blinkInterval[0])

    if (this.blinkTimer > blinkIntervalRandom) {
      this.blink()
      this.blinkTimer = 0
    }

    // Parpadeo de antena
    this.antennaTimer += dt
    if (this.antennaTimer > ROBOT_CONFIG.antennaBlinkInterval[0] + Math.random()) {
      this.antennaTip.alpha = this.antennaTip.alpha > 0.5 ? 0.3 : 1
      this.antennaTimer = 0
    }

    // Rotación de ruedas si se mueve manualmente (sin tween)
    if (this.isMoving && !this.moveTween) {
      this.wheelRotation += ROBOT_CONFIG.wheelRotationSpeed * dt
      this.wheels.left.rotation = this.wheelRotation
      this.wheels.right.rotation = -this.wheelRotation

      // Inclinar cuerpo hacia adelante
      this.body.rotation = Math.sin(this.animTimer * 10) * 0.02
    } else if (!this.moveTween) {
      this.body.rotation = 0
    }

    // Actualizar expresión de ojos si sigue algo
    if (this.eyeFollowTarget) {
      this.followEyes(this.eyeFollowTarget.x, this.eyeFollowTarget.y)
    }

    // Animación de celebración
    if (this.status === 'completed') {
      this.celebrateAnimation(dt)
    }

    // Redibujar antena si está activa
    if (this.status === 'running' || this.status === 'thinking') {
      this.antennaTip.fill({ color: 0xffffff })
    }
  }
  
  /**
   * Parpadeo de ojos
   */
  private blink(): void {
    // Cerrar ojos (escalar Y a 0)
    this.eyes.scale.y = 0.1
    
    setTimeout(() => {
      this.eyes.scale.y = 1
    }, ROBOT_CONFIG.blinkDuration * 1000)
  }
  
  /**
   * Seguir objeto con los ojos
   */
  followEyes(targetX: number, targetY: number): void {
    const headY = -ROBOT_CONFIG.bodyHeight / 2 - ROBOT_CONFIG.headRadius + 5
    const dx = targetX - this.x
    const dy = targetY - (this.y + headY)
    const angle = Math.atan2(dy, dx)
    const maxOffset = 3
    
    const eyeOffsetX = Math.cos(angle) * Math.min(Math.abs(dx) * 0.02, maxOffset)
    const eyeOffsetY = Math.sin(angle) * Math.min(Math.abs(dy) * 0.02, maxOffset)
    
    this.eyes.x = eyeOffsetX
    this.eyes.y = eyeOffsetY
  }
  
  /**
   * Animación de celebración
   */
  private celebrateAnimation(dt: number): void {
    // Saltar arriba y abajo
    const celebrateSpeed = 8
    this.y = this.stationY + Math.sin(this.animTimer * celebrateSpeed) * 5
    
    // Brazos arriba
    this.arms.left.rotation = -Math.PI / 4
    this.arms.right.rotation = Math.PI / 4
  }
  
  /**
   * Iniciar movimiento hacia posición con tween
   */
  moveTo(x: number, y: number, duration?: number): void {
    const distance = Math.sqrt(Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2))
    const tweenDuration = duration ?? (distance / this.moveSpeed) * 1000 // ms
    
    this.moveTween = new Tween2D({
      from: { x: this.x, y: this.y },
      to: { x, y },
      duration: tweenDuration,
      easing: Easings.easeOutQuint,
      onStart: () => {
        this.isMoving = true
      },
      onUpdate: (newX, newY) => {
        this.x = newX
        this.y = newY
      },
      onComplete: () => {
        this.isMoving = false
        this.rotation = 0
      },
    })
  }

  /**
   * Mover a estación y volver (para delegación)
   */
  moveToAndReturn(x: number, y: number, returnDelay?: number): void {
    const distance = Math.sqrt(Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2))
    const tweenDuration = (distance / this.moveSpeed) * 1000 // ms
    
    this.isReturning = false
    this.moveTo(x, y, tweenDuration)
    
    // Programar retorno
    setTimeout(() => {
      this.returnToStation(tweenDuration)
    }, tweenDuration + (returnDelay ?? 500))
  }

  /**
   * Volver a la estación
   */
  returnToStation(duration?: number): void {
    if (this.isReturning) return
    
    this.isReturning = true
    this.moveTo(this.stationX, this.stationY, duration)
  }

  /**
   * Saltar (al hacer click)
   */
  jump(): void {
    if (!this.onGround) return
    
    this.isJumping = true
    this.onGround = false
    this.jumpVelocity = INTERACTION_CONFIG.jumpForce
  }

  /**
   * Saludar con la mano
   */
  wave(): void {
    if (this.isWaving) return
    
    this.isWaving = true
    this.waveTimer = INTERACTION_CONFIG.waveDuration
    
    // Animación de brazo
    const waveAnimation = () => {
      if (this.waveTimer > 0) {
        this.waveTimer -= 1/60 // Asumiendo 60fps
        this.arms.right.rotation = Math.sin(Date.now() * 0.02) * 0.5 - 0.5
        requestAnimationFrame(waveAnimation)
      } else {
        this.isWaving = false
        this.arms.right.rotation = 0
      }
    }
    
    waveAnimation()
  }

  /**
   * Celebración especial (doble click) - Usa animación signature
   */
  celebrateSpecial(): void {
    const signature = SIGNATURE_ANIMATIONS[this.agentId]
    
    if (signature) {
      this.performSignatureAnimation(signature)
    } else {
      // Animación por defecto para agentes sin signature
      this.performDefaultCelebration()
    }
  }

  /**
   * Realizar animación signature del agente
   */
  private performSignatureAnimation(signature: {
    name: string
    description: string
    duration: number
    scale?: number
    rotation?: number
    shake?: boolean
    spin?: boolean
    bounce?: boolean
    glow?: boolean
  }): void {
    if (this.isPerformingSignature) return
    
    this.isPerformingSignature = true
    
    // Mostrar nombre de la animación
    this.showSpeechBubble('celebrate')
    
    // Sonido único según tipo
    soundManager.play('robotComplete')
    
    // Aplicar efectos según configuración
    const startTime = Date.now()
    const duration = signature.duration * 1000
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = elapsed / duration
      
      if (progress >= 1) {
        // Restaurar valores originales
        this.scale.set(1)
        this.rotation = 0
        this.isPerformingSignature = false
        return
      }
      
      // Escala
      if (signature.scale) {
        const targetScale = 1 + (signature.scale - 1) * Math.sin(progress * Math.PI)
        this.scale.set(targetScale)
      }
      
      // Rotación
      if (signature.spin) {
        this.rotation = progress * Math.PI * 2
      } else if (signature.rotation) {
        this.rotation = Math.sin(progress * Math.PI) * signature.rotation
      }
      
      // Shake
      if (signature.shake) {
        this.x += (Math.random() - 0.5) * 4
        this.y += (Math.random() - 0.5) * 4
      }
      
      // Bounce
      if (signature.bounce) {
        this.y += Math.sin(progress * Math.PI * 4) * 5
      }
      
      // Glow (cambiar alpha de antena)
      if (signature.glow) {
        this.antennaTip.alpha = 0.5 + Math.sin(progress * Math.PI * 8) * 0.5
      }
      
      requestAnimationFrame(animate)
    }
    
    animate()
  }

  /**
   * Celebración por defecto para agentes sin signature
   */
  private performDefaultCelebration(): void {
    // Rotación 360 grados
    let rotation = 0
    const rotate = () => {
      if (rotation < 360) {
        rotation += 15
        this.rotation = (rotation * Math.PI) / 180
        this.scale.set(1 + Math.sin((rotation / 360) * Math.PI) * 0.2)
        requestAnimationFrame(rotate)
      } else {
        this.rotation = 0
        this.scale.set(1)
        this.isPerformingSignature = false
      }
    }
    rotate()
    
    // Mostrar burbuja de celebración
    this.showSpeechBubble('celebrate')
  }

  /**
   * Mostrar información del robot
   */
  showInfo(): void {
    const agentInfo = AGENT_LABELS[this.agentId]
    const gamificationData = (window as any).gamificationManager?.getRobotData(this.agentId)
    
    const info = [
      `🤖 ${agentInfo?.nickname || this.agentId}`,
      `📋 Rol: ${agentInfo?.role || 'Robot'}`,
      `⭐ Nivel: ${gamificationData?.level || 1}`,
      `💫 XP: ${gamificationData?.xp || 0}`,
      `✅ Tareas: ${gamificationData?.tasksCompleted || 0}`,
    ].join('\n')
    
    alert(info) // Por ahora usamos alert, después será un tooltip
  }

  /**
   * Mostrar frase idle aleatoria
   */
  showIdlePhrase(): void {
    const phrases = AGENT_IDLE_PHRASES[this.agentId] || ['...']
    const phrase = phrases[Math.floor(Math.random() * phrases.length)]
    
    // Crear burbuja pequeña
    if (this.speechBubble) {
      this.removeChild(this.speechBubble)
    }

    this.speechBubble = new Container()
    
    const bubbleBg = new Graphics()
    const padding = 6
    const tempText = new Text({
      text: phrase,
      style: new TextStyle({ fontSize: 9, fontFamily: 'monospace', fill: 0x000000 }),
    })
    const textMetrics = tempText.width
    tempText.destroy()
    
    const bubbleWidth = Math.min(120, textMetrics + padding * 2)
    const bubbleHeight = 20
    
    bubbleBg.roundRect(-bubbleWidth / 2, -bubbleHeight - 8, bubbleWidth, bubbleHeight, 4)
    bubbleBg.fill({ color: 0xffffff, alpha: 0.9 })
    bubbleBg.stroke({ color: this.color, width: 1, alpha: 0.5 })
    
    const bubbleText = new Text({
      text: phrase,
      style: new TextStyle({ fontSize: 9, fontFamily: 'monospace', fill: 0x000000 }),
      anchor: 0.5,
    })
    
    this.speechBubble.addChild(bubbleBg)
    this.speechBubble.addChild(bubbleText)
    this.speechBubble.y = -ROBOT_CONFIG.bodyHeight / 2 - ROBOT_CONFIG.headRadius - 15
    this.speechBubble.alpha = 0
    this.speechBubble.y += 10
    
    this.addChild(this.speechBubble)
    
    // Fade in
    const fadeIn = () => {
      if (this.speechBubble && this.speechBubble.alpha < 1) {
        this.speechBubble.alpha += 0.1
        this.speechBubble.y -= 0.5
        requestAnimationFrame(fadeIn)
      }
    }
    fadeIn()
    
    // Auto-eliminar
    setTimeout(() => {
      if (this.speechBubble && this.parent) {
        const fadeOut = () => {
          if (this.speechBubble && this.speechBubble.alpha > 0) {
            this.speechBubble.alpha -= 0.15
            requestAnimationFrame(fadeOut)
          } else if (this.speechBubble && this.parent) {
            this.parent.removeChild(this.speechBubble)
            this.speechBubble = null
          }
        }
        fadeOut()
      }
    }, 3000)
  }

  /**
   * Detener movimiento
   */
  stopMoving(): void {
    this.isMoving = false
    this.wheelRotation = 0
    if (this.moveTween) {
      this.moveTween.stop()
      this.moveTween = null
    }
  }

  /**
   * Verificar si está moviéndose
   */
  getIsMoving(): boolean {
    return this.isMoving || (this.moveTween && !this.moveTween.isComplete)
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
  
  /**
   * Mostrar barra de XP
   */
  showXPBar(currentXP: number, maxXP: number, level: number): void {
    if (!this.xpBar) {
      this.xpBar = new Graphics()
      this.addChild(this.xpBar)
    }
    
    this.xpBar.clear()
    
    // Fondo
    this.xpBar.roundRect(-30, -ROBOT_CONFIG.bodyHeight / 2 - 15, 60, 8, 4)
    this.xpBar.fill({ color: 0x1a1a2e, alpha: 0.8 })
    this.xpBar.stroke({ color: 0x3a3a5e, width: 1 })
    
    // Barra de progreso
    const progress = currentXP / maxXP
    this.xpBar.roundRect(-28, -ROBOT_CONFIG.bodyHeight / 2 - 13, 56 * progress, 4, 2)
    this.xpBar.fill({ color: this.color, alpha: 0.9 })
    
    // Nivel
    if (this.label) {
      this.label.text = `Lv.${level} ${AGENT_LABELS[this.agentId]?.label || ''}`
    }
  }
  
  /**
   * Ocultar barra de XP
   */
  hideXPBar(): void {
    if (this.xpBar) {
      this.xpBar.visible = false
    }
  }
  
  /**
   * Destruir el robot
   */
  destroy(): void {
    this.removeAllChildren()
    super.destroy()
  }
}
