/**
 * LaboratoryWorld - Mundo de laboratorio robótico HiveLearn
 * 
 * Renderiza un laboratorio futurista con:
 * - 17 robots agentes con expresiones faciales
 * - 1 robot coordinador central
 * - Sistema de partículas avanzado
 * - Sonidos sintetizados
 * - Interactividad completa (hover, click, drag)
 * - Gamificación visible (XP, niveles, logros)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { RobotSprite } from './RobotSprite'
import { ParticleSystem } from './ParticleSystem'
import { soundManager } from './SoundManager'
import { gamificationManager, XPBar, XPPopup } from './GamificationOverlay'
import { surpriseEventManager } from './SurpriseEvents'
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  COLORS,
  STATION_POSITIONS,
  COORDINATOR_POSITION,
  AGENT_COLORS,
  AGENT_LABELS,
  ROBOT_CONFIG,
  type AgentStatus,
  lerp,
  clamp,
} from './constants'

export interface LaboratoryWorldProps {
  /** Estado de los agentes */
  agentStatuses?: Record<string, AgentStatus>
  /** Agente actualmente activo */
  currentAgentId?: string | null
  /** Progreso del swarm (0-100) */
  progress?: number
  /** Mensaje de estado */
  mensaje?: string
  /** Callback cuando se completa la generación */
  onComplete?: () => void
  /** Sonido activado */
  soundEnabled?: boolean
  /** Volumen (0-1) */
  volume?: number
}

/**
 * Componente LaboratoryWorld
 */
export function LaboratoryWorld({
  agentStatuses = {},
  currentAgentId = null,
  progress = 0,
  mensaje = '',
  onComplete,
  soundEnabled = true,
  volume = 0.3,
}: LaboratoryWorldProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const robotsRef = useRef<Map<string, RobotSprite>>(new Map())
  const coordinatorRef = useRef<RobotSprite | null>(null)
  const particlesRef = useRef<ParticleSystem | null>(null)
  const uiRef = useRef<Container | null>(null)
  const progressTextRef = useRef<Text | null>(null)
  const statusTextRef = useRef<Text | null>(null)
  const muteButtonRef = useRef<Text | null>(null)
  const surpriseManagerRef = useRef<ReturnType<typeof surpriseEventManager> | null>(null)
  const prevAgentStatusRef = useRef<Record<string, AgentStatus>>({})

  const [isReady, setIsReady] = useState(false)
  const [isMuted, setIsMuted] = useState(!soundEnabled)

  // Inicializar aplicación PixiJS
  useEffect(() => {
    if (!containerRef.current) return

    let mounted = true

    const initApp = async () => {
      try {
        // Crear aplicación PixiJS v8
        const app = new Application()
        await app.init({
          width: WORLD_WIDTH,
          height: WORLD_HEIGHT,
          background: COLORS.background,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          eventMode: 'static',
          eventFeatures: {
            click: true,
            move: true,
            wheel: false,
            globalMove: true,
          },
        })

        if (!mounted) {
          app.destroy(true)
          return
        }

        // Añadir canvas al contenedor
        if (containerRef.current) {
          containerRef.current.appendChild(app.canvas as HTMLCanvasElement)
        }

        appRef.current = app
        setIsReady(true)

        // Inicializar mundo
        initWorld()

        // Inicializar sonido
        soundManager.init()
        soundManager.setVolume(volume)

      } catch (error) {
        console.error('Error initializing PixiJS:', error)
      }
    }

    const initWorld = () => {
      if (!appRef.current) return

      const app = appRef.current

      // Crear contenedor principal del mundo
      const world = new Container()
      worldRef.current = world
      app.stage.addChild(world)

      // Inicializar gamificación para todos los agentes
      for (const station of STATION_POSITIONS) {
        gamificationManager.initRobot(station.agentId)
      }
      gamificationManager.initRobot('hl-coordinator-agent')

      // Hacer gamificationManager disponible globalmente para los robots
      ;(window as any).gamificationManager = gamificationManager

      // Dibujar fondo y laboratorio
      drawLaboratory()

      // Crear robots
      createRobots()

      // Crear coordinador
      createCoordinator()

      // Añadir barras de XP sobre los robots
      addXPBars()

      // Crear sistema de partículas
      const particles = new ParticleSystem(2000)
      particlesRef.current = particles
      world.addChild(particles.getContainer())
      world.addChild(particles.getGraphics())

      // Añadir notificaciones de gamificación
      const achievementNotif = gamificationManager.getAchievementNotification()
      if (achievementNotif) {
        achievementNotif.x = WORLD_WIDTH / 2
        achievementNotif.y = 100
        world.addChild(achievementNotif)
      }

      // Inicializar manager de eventos sorpresa
      surpriseManagerRef.current = surpriseEventManager(particles, soundManager, world)

      // Crear UI
      createUI()

      // Iniciar game loop
      app.ticker.add((delta) => gameLoop(delta))
    }

    const drawLaboratory = () => {
      if (!worldRef.current) return

      const bg = new Graphics()

      // Floor con gradient
      const floorGradient = bg.context.createLinearGradient(0, 0, 0, WORLD_HEIGHT)
      floorGradient.addColorStop(0, '#0f1428')
      floorGradient.addColorStop(1, '#1a1f3a')
      bg.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      bg.fill(floorGradient)

      // Grid pattern estilo TRON
      bg.setStrokeStyle({ width: 1, color: COLORS.floorGrid, alpha: 0.3 })
      for (let x = 0; x < WORLD_WIDTH; x += 100) {
        bg.moveTo(x, 0)
        bg.lineTo(x, WORLD_HEIGHT)
      }
      for (let y = 0; y < WORLD_HEIGHT; y += 100) {
        bg.moveTo(0, y)
        bg.lineTo(WORLD_WIDTH, y)
      }
      bg.stroke()

      // Bordes brillantes
      bg.setStrokeStyle({ width: 4, color: COLORS.wallAccent, alpha: 0.5 })
      bg.rect(0, 0, WORLD_WIDTH, 4)
      bg.rect(0, WORLD_HEIGHT - 4, WORLD_WIDTH, 4)
      bg.rect(0, 0, 4, WORLD_HEIGHT)
      bg.rect(WORLD_WIDTH - 4, 0, 4, WORLD_HEIGHT)
      bg.fill({ color: COLORS.wall })

      // Plataformas para robots
      for (const station of STATION_POSITIONS) {
        // Base de la plataforma
        bg.roundRect(station.x - 60, station.y + 30, 120, 40, 8)
        bg.fill({ color: COLORS.platform, alpha: 0.6 })
        bg.stroke({ color: COLORS.platformGlow, width: 2, alpha: 0.8 })

        // Líneas de circuito decorativas
        bg.setStrokeStyle({ width: 1, color: COLORS.hologram, alpha: 0.2 })
        for (let i = -40; i <= 40; i += 20) {
          bg.moveTo(station.x + i, station.y + 35)
          bg.lineTo(station.x + i, station.y + 65)
        }
        bg.stroke()
      }

      // Plataforma del coordinador (más grande y elevada)
      const coordRadius = COORDINATOR_POSITION.platformRadius
      bg.circle(COORDINATOR_POSITION.x, COORDINATOR_POSITION.y + 20, coordRadius)
      bg.fill({ color: COLORS.platform, alpha: 0.8 })
      bg.stroke({ color: COLORS.coordinator, width: 3, alpha: 0.6 })

      // Anillos concéntricos decorativos
      for (let i = 1; i <= 3; i++) {
        bg.circle(COORDINATOR_POSITION.x, COORDINATOR_POSITION.y + 20, coordRadius - i * 15)
        bg.stroke({ color: COLORS.coordinator, width: 1, alpha: 0.2 })
      }

      // Cintas transportadoras entre filas
      drawConveyorBelts(bg, 180, 800)
      drawConveyorBelts(bg, 320, 800)
      drawConveyorBelts(bg, 460, 800)

      worldRef.current.addChildAt(bg, 0)
    }

    const drawConveyorBelts = (bg: Graphics, y: number, width: number) => {
      // Cinta transportadora
      bg.roundRect(100, y, width - 200, 20, 4)
      bg.fill({ color: COLORS.conveyor, alpha: 0.5 })
      bg.stroke({ color: COLORS.conveyorLine, width: 1, alpha: 0.4 })

      // Líneas móviles (animadas en el game loop)
      bg.setStrokeStyle({ width: 2, color: COLORS.hologram, alpha: 0.3 })
      for (let x = 120; x < width - 120; x += 40) {
        bg.moveTo(x, y + 5)
        bg.lineTo(x + 20, y + 5)
      }
      bg.stroke()
    }

    const createRobots = () => {
      if (!worldRef.current) return

      for (const station of STATION_POSITIONS) {
        const robot = new RobotSprite({
          agentId: station.agentId,
          color: AGENT_COLORS[station.agentId] || 0x888888,
          x: station.x,
          y: station.y,
          stationX: station.x,
          stationY: station.y,
          isCoordinator: false,
        })

        robotsRef.current.set(station.agentId, robot)
        worldRef.current.addChild(robot)
      }
    }

    const createCoordinator = () => {
      if (!worldRef.current) return

      const coordinator = new RobotSprite({
        agentId: 'hl-coordinator-agent',
        color: AGENT_COLORS['hl-coordinator-agent'],
        x: COORDINATOR_POSITION.x,
        y: COORDINATOR_POSITION.y,
        stationX: COORDINATOR_POSITION.x,
        stationY: COORDINATOR_POSITION.y,
        isCoordinator: true,
      })

      coordinatorRef.current = coordinator
      worldRef.current.addChild(coordinator)
    }

    const addXPBars = () => {
      if (!worldRef.current) return

      // Añadir barras de XP sobre cada robot
      for (const [agentId, robot] of robotsRef.current.entries()) {
        const xpBar = gamificationManager.getXPBar(agentId)
        if (xpBar) {
          xpBar.x = robot.x
          xpBar.y = robot.y - ROBOT_CONFIG.bodyHeight / 2 - 30
          worldRef.current?.addChild(xpBar)
        }
      }

      // Barra del coordinador
      const coordXPBar = gamificationManager.getXPBar('hl-coordinator-agent')
      if (coordXPBar && coordinatorRef.current) {
        coordXPBar.x = coordinatorRef.current.x
        coordXPBar.y = coordinatorRef.current.y - 50
        worldRef.current.addChild(coordXPBar)
      }
    }

    const createUI = () => {
      if (!worldRef.current) return

      const ui = new Container()
      uiRef.current = ui

      // Panel de estado (esquina superior izquierda)
      const statusPanel = new Graphics()
      statusPanel.roundRect(20, 20, 250, 80, 12)
      statusPanel.fill({ color: 0x0a0e1a, alpha: 0.9 })
      statusPanel.stroke({ color: COLORS.hologram, width: 2, alpha: 0.5 })
      ui.addChild(statusPanel)

      // Título
      const title = new Text({
        text: '🤖 HIVELEARN LAB',
        style: new TextStyle({
          fontSize: 16,
          fontFamily: 'monospace',
          fill: COLORS.hologram,
          fontWeight: 'bold',
        }),
        anchor: { x: 0, y: 0 },
      })
      title.x = 35
      title.y = 30
      ui.addChild(title)

      // Barra de progreso
      const progressBg = new Graphics()
      progressBg.roundRect(20, WORLD_HEIGHT - 70, WORLD_WIDTH - 340, 30, 8)
      progressBg.fill({ color: 0x1a1a2e, alpha: 0.9 })
      progressBg.stroke({ color: 0x3a3a5e, width: 2 })
      ui.addChild(progressBg)

      // Barra de progreso fill
      const progressBar = new Graphics()
      progressBar.roundRect(25, WORLD_HEIGHT - 65, (WORLD_WIDTH - 350) * (progress / 100), 20, 5)
      progressBar.fill({ color: 0xfbbf24, alpha: 0.9 })
      ui.addChild(progressBar)

      // Texto de progreso
      const progressText = new Text({
        text: `${Math.round(progress)}%`,
        style: new TextStyle({
          fontSize: 14,
          fontFamily: 'monospace',
          fill: 0xfbbf24,
          fontWeight: 'bold',
        }),
        anchor: { x: 0.5, y: 0.5 },
      })
      progressText.x = WORLD_WIDTH - 150
      progressText.y = WORLD_HEIGHT - 55
      progressTextRef.current = progressText
      ui.addChild(progressText)

      // Texto de estado
      const statusText = new Text({
        text: mensaje || 'Esperando...',
        style: new TextStyle({
          fontSize: 12,
          fontFamily: 'monospace',
          fill: 0xffffff,
        }),
        anchor: { x: 0, y: 0.5 },
      })
      statusText.x = 35
      statusText.y = 55
      statusTextRef.current = statusText
      ui.addChild(statusText)

      // Botón de mute
      const muteButton = new Text({
        text: isMuted ? '🔇' : '🔊',
        style: new TextStyle({
          fontSize: 20,
          fontFamily: 'monospace',
          fill: 0xffffff,
        }),
        anchor: 0.5,
        eventMode: 'static',
        cursor: 'pointer',
      })
      muteButton.x = WORLD_WIDTH - 50
      muteButton.y = WORLD_HEIGHT - 55
      muteButtonRef.current = muteButton
      
      muteButton.on('click', () => {
        const newMuted = !isMuted
        setIsMuted(newMuted)
        soundManager.setMuted(newMuted)
        muteButton.text = newMuted ? '🔇' : '🔊'
      })
      
      muteButton.on('pointerenter', () => {
        muteButton.scale.set(1.2)
      })
      
      muteButton.on('pointerleave', () => {
        muteButton.scale.set(1)
      })
      
      ui.addChild(muteButton)

      // Leyenda de estados
      const legendY = WORLD_HEIGHT - 35
      const legendX = 200
      
      const legendText = new Text({
        text: 'Estado: 🟢 Idle  🟡 Working  🎉 Complete  ❌ Fail',
        style: new TextStyle({
          fontSize: 10,
          fontFamily: 'monospace',
          fill: 0x8888aa,
        }),
        anchor: { x: 0, y: 0.5 },
      })
      legendText.x = legendX
      legendText.y = legendY
      ui.addChild(legendText)

      worldRef.current.addChild(ui)
    }

    const gameLoop = (delta: number) => {
      const msDelta = delta * (1000 / 60) // convertir a ms

      // Actualizar robots
      for (const robot of robotsRef.current.values()) {
        robot.update(msDelta)
      }

      // Actualizar coordinador
      if (coordinatorRef.current) {
        coordinatorRef.current.update(msDelta)
      }

      // Actualizar partículas
      if (particlesRef.current) {
        particlesRef.current.update(msDelta)
      }

      // Actualizar gamificación
      gamificationManager.update(msDelta)

      // Actualizar eventos sorpresa
      if (surpriseManagerRef.current) {
        surpriseManagerRef.current.update(msDelta)
      }

      // Actualizar posición de barras de XP para que sigan a los robots
      for (const [agentId, robot] of robotsRef.current.entries()) {
        const xpBar = gamificationManager.getXPBar(agentId)
        if (xpBar) {
          xpBar.x = robot.x
          xpBar.y = robot.y - ROBOT_CONFIG.bodyHeight / 2 - 30
        }
      }

      // Actualizar posición de notificaciones
      const achievementNotif = gamificationManager.getAchievementNotification()
      if (achievementNotif) {
        achievementNotif.x = WORLD_WIDTH / 2
        achievementNotif.y = 100
      }

      // Animar cintas transportadoras
      animateConveyors(msDelta)
    }

    const animateConveyors = (msDelta: number) => {
      // La animación de cintas se haría con un offset en el dibujo
      // Por simplicidad, lo omitimos por ahora
    }

    // Cleanup
    return () => {
      mounted = false
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
      soundManager.destroy()
    }
  }, [])

  // Actualizar estados de robots
  useEffect(() => {
    if (!isReady || !coordinatorRef.current) return

    // Actualizar cada robot
    for (const [agentId, status] of Object.entries(agentStatuses)) {
      const robot = robotsRef.current.get(agentId)
      const prevStatus = prevAgentStatusRef.current[agentId]

      if (robot && status !== prevStatus) {
        robot.setStatus(status)

        // Si el robot está running y hay coordinador, crear efecto de delegación
        if (status === 'running' && coordinatorRef.current) {
          const coord = coordinatorRef.current
          const robotPos = robot.getPosition()

          // Crear partículas de delegación
          if (particlesRef.current) {
            particlesRef.current.emitEnergy(
              coord.x,
              coord.y,
              robotPos.x,
              robotPos.y,
              30
            )

            // Sonido de delegación
            soundManager.play('delegateFire')
          }
        }

        // Si el robot completó, crear partículas de celebración y dar XP
        if (status === 'completed' && prevStatus === 'running') {
          const robotPos = robot.getPosition()
          if (particlesRef.current) {
            particlesRef.current.emitConfetti(robotPos.x, robotPos.y, 50)
            soundManager.play('robotComplete')
          }

          // Calcular XP con bonus de eventos sorpresa
          const xpMultiplier = surpriseManagerRef.current?.getXPBonusMultiplier() || 1
          const baseXP = 50
          const bonusXP = baseXP * xpMultiplier

          // Dar XP al robot
          const xpPopup = gamificationManager.addXP(agentId, bonusXP)
          if (xpPopup && worldRef.current) {
            xpPopup.x = robotPos.x
            xpPopup.y = robotPos.y - 30
            worldRef.current.addChild(xpPopup)
          }

          // Incrementar racha
          gamificationManager.incrementStreak(agentId)

          // Verificar logros
          const robotData = gamificationManager.getRobotData(agentId)
          if (robotData && robotData.tasksCompleted >= 1) {
            gamificationManager.unlockAchievement(agentId, 'first-task')
          }
          if (robotData && robotData.tasksCompleted >= 100) {
            gamificationManager.unlockAchievement(agentId, 'veteran')
          }
        }

        // Si el robot falló, crear partículas de error y quitar XP
        if (status === 'failed' && prevStatus !== 'failed') {
          const robotPos = robot.getPosition()
          if (particlesRef.current) {
            particlesRef.current.emitSteam(robotPos.x, robotPos.y, 20)
            soundManager.play('robotFail')
          }

          // Quitar XP por fallo
          gamificationManager.removeXP(agentId, 10)

          // Resetear racha
          gamificationManager.incrementStreak(agentId) // Esto resetea la racha internamente
        }
      }

      prevAgentStatusRef.current[agentId] = status
    }
  }, [agentStatuses, isReady])

  // Actualizar UI
  useEffect(() => {
    if (progressTextRef.current) {
      progressTextRef.current.text = `${Math.round(progress)}%`
    }
    if (statusTextRef.current) {
      statusTextRef.current.text = mensaje || 'Esperando...'
    }

    // Actualizar barra de progreso visual
    if (uiRef.current && progressTextRef.current) {
      const progressBar = uiRef.current.children.find(
        (child) => child instanceof Graphics && child !== uiRef.current?.children[0]
      ) as Graphics
      
      if (progressBar) {
        progressBar.clear()
        progressBar.roundRect(
          25,
          WORLD_HEIGHT - 65,
          (WORLD_WIDTH - 350) * (progress / 100),
          20,
          5
        )
        progressBar.fill({ color: 0xfbbf24, alpha: 0.9 })
      }
    }

    // Callback cuando se completa
    if (progress >= 100 && onComplete) {
      onComplete()
    }
  }, [progress, mensaje, onComplete])

  // Actualizar sonido
  useEffect(() => {
    soundManager.setMuted(isMuted)
    soundManager.setVolume(volume)
  }, [isMuted, volume])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-background"
      style={{
        aspectRatio: `${WORLD_WIDTH} / ${WORLD_HEIGHT}`,
        maxWidth: WORLD_WIDTH,
        maxHeight: WORLD_HEIGHT,
      }}
    >
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">
            Cargando laboratorio robótico...
          </div>
        </div>
      )}
    </div>
  )
}

export default LaboratoryWorld
