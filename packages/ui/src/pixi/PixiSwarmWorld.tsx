/**
 * PixiSwarmWorld - Componente principal del mundo de aprendizaje HiveLearn
 * Visualiza la interacción entre el coordinador y los 17 agentes educativos
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { AgentSprite } from './AgentSprite'
import { CoordinatorSprite } from './CoordinatorSprite'
import { DelegationParticles, ConnectionLines } from './DelegationParticles'
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  COLORS,
  AGENT_CONFIG,
  DESK_POSITIONS,
  COORDINATOR_POSITION,
  AGENT_COLORS,
  AGENT_LABELS,
  type AgentStatus,
} from './constants'

export interface PixiSwarmWorldProps {
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
}

/**
 * Componente PixiSwarmWorld
 * 
 * Renderiza un mundo interactivo con:
 * - 16 agentes workers distribuidos en el espacio
 * - 1 coordinador central
 * - Efectos de partículas para delegación
 * - Líneas de conexión entre agentes
 * - UI superpuesta con progreso y estado
 */
export function PixiSwarmWorld({
  agentStatuses = {},
  currentAgentId = null,
  progress = 0,
  mensaje = '',
  onComplete,
}: PixiSwarmWorldProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const agentsRef = useRef<Map<string, AgentSprite>>(new Map())
  const coordinatorRef = useRef<CoordinatorSprite | null>(null)
  const particlesRef = useRef<DelegationParticles | null>(null)
  const connectionsRef = useRef<ConnectionLines | null>(null)
  const uiRef = useRef<Container | null>(null)
  const progressTextRef = useRef<Text | null>(null)
  const statusTextRef = useRef<Text | null>(null)
  const prevAgentStatusRef = useRef<Record<string, AgentStatus>>({})

  const [isReady, setIsReady] = useState(false)

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

      // Dibujar fondo y escritorios
      drawBackground()

      // Crear agentes
      createAgents()

      // Crear coordinador
      createCoordinator()

      // Crear sistema de partículas
      const particles = new DelegationParticles()
      particlesRef.current = particles
      world.addChild(particles)

      // Crear líneas de conexión
      const connections = new ConnectionLines()
      connectionsRef.current = connections
      world.addChild(connections)

      // Crear UI
      createUI()

      // Iniciar game loop
      app.ticker.add((delta) => gameLoop(delta))
    }

    const drawBackground = () => {
      if (!worldRef.current) return

      const bg = new Graphics()
      
      // Floor
      bg.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      bg.fill({ color: COLORS.floor })

      // Grid pattern sutil
      for (let x = 0; x < WORLD_WIDTH; x += 100) {
        bg.moveTo(x, 0)
        bg.lineTo(x, WORLD_HEIGHT)
      }
      for (let y = 0; y < WORLD_HEIGHT; y += 100) {
        bg.moveTo(0, y)
        bg.lineTo(WORLD_WIDTH, y)
      }
      bg.stroke({ color: 0x1a1a2e, width: 1, alpha: 0.3 })

      // Bordes
      bg.rect(0, 0, WORLD_WIDTH, 4)
      bg.rect(0, WORLD_HEIGHT - 4, WORLD_WIDTH, 4)
      bg.rect(0, 0, 4, WORLD_HEIGHT)
      bg.rect(WORLD_WIDTH - 4, 0, 4, WORLD_HEIGHT)
      bg.fill({ color: COLORS.wall })

      // Escritorios de agentes
      for (const desk of DESK_POSITIONS) {
        bg.roundRect(desk.x - 50, desk.y - 30, 100, 60, 8)
        bg.fill({ color: COLORS.desk, alpha: 0.5 })
        bg.stroke({ color: COLORS.deskBorder, width: 2, alpha: 0.8 })
        
        // Label del escritorio
        const label = AGENT_LABELS[desk.agentId]
        if (label) {
          const deskLabel = new Text({
            text: label.label,
            style: new TextStyle({
              fontSize: 9,
              fontFamily: 'monospace',
              fill: 0x666680,
            }),
            anchor: 0.5,
          })
          deskLabel.x = desk.x
          deskLabel.y = desk.y + 40
          worldRef.current?.addChild(deskLabel)
        }
      }

      // Escritorio del coordinador
      bg.roundRect(
        COORDINATOR_POSITION.deskX - 70,
        COORDINATOR_POSITION.deskY - 40,
        140, 80, 12
      )
      bg.fill({ color: COLORS.coordinator, alpha: 0.1 })
      bg.stroke({ color: COLORS.coordinator, width: 3, alpha: 0.5 })

      worldRef.current.addChildAt(bg, 0)
    }

    const createAgents = () => {
      if (!worldRef.current) return

      for (const desk of DESK_POSITIONS) {
        const agent = new AgentSprite({
          agentId: desk.agentId,
          label: AGENT_LABELS[desk.agentId]?.label || desk.agentId,
          emoji: AGENT_LABELS[desk.agentId]?.emoji || '🤖',
          color: AGENT_COLORS[desk.agentId] || 0x888888,
          x: desk.x,
          y: desk.y,
          deskX: desk.x,
          deskY: desk.y,
        })

        agentsRef.current.set(desk.agentId, agent)
        worldRef.current.addChild(agent)
      }
    }

    const createCoordinator = () => {
      if (!worldRef.current) return

      const coordinator = new CoordinatorSprite({
        x: COORDINATOR_POSITION.x,
        y: COORDINATOR_POSITION.y,
        deskX: COORDINATOR_POSITION.deskX,
        deskY: COORDINATOR_POSITION.deskY,
      })

      coordinatorRef.current = coordinator
      worldRef.current.addChild(coordinator)
    }

    const createUI = () => {
      if (!worldRef.current) return

      const ui = new Container()
      uiRef.current = ui

      // Barra de progreso de fondo
      const progressBg = new Graphics()
      progressBg.roundRect(20, WORLD_HEIGHT - 50, WORLD_WIDTH - 40, 20, 10)
      progressBg.fill({ color: 0x1a1a2e, alpha: 0.8 })
      progressBg.stroke({ color: 0x2a2a3f, width: 2 })
      ui.addChild(progressBg)

      // Barra de progreso
      const progressBar = new Graphics()
      progressBar.roundRect(25, WORLD_HEIGHT - 45, (WORLD_WIDTH - 50) * (progress / 100), 10, 5)
      progressBar.fill({ color: 0xfbbf24, alpha: 0.8 })
      ui.addChild(progressBar)

      // Texto de progreso
      const progressText = new Text({
        text: `${Math.round(progress)}%`,
        style: new TextStyle({
          fontSize: 12,
          fontFamily: 'monospace',
          fill: 0xfbbf24,
          fontWeight: 'bold',
        }),
        anchor: { x: 0.5, y: 0.5 },
      })
      progressText.x = WORLD_WIDTH / 2
      progressText.y = WORLD_HEIGHT - 40
      progressTextRef.current = progressText
      ui.addChild(progressText)

      // Texto de estado
      const statusText = new Text({
        text: mensaje || 'Esperando...',
        style: new TextStyle({
          fontSize: 14,
          fontFamily: 'monospace',
          fill: 0xffffff,
          fontWeight: 'bold',
        }),
        anchor: { x: 0.5, y: 0.5 },
      })
      statusText.x = WORLD_WIDTH / 2
      statusText.y = WORLD_HEIGHT - 70
      statusTextRef.current = statusText
      ui.addChild(statusText)

      // Título
      const title = new Text({
        text: '🐝 HIVELEARN SWARM',
        style: new TextStyle({
          fontSize: 18,
          fontFamily: 'monospace',
          fill: 0xfbbf24,
          fontWeight: 'black',
        }),
        anchor: { x: 0.5, y: 0.5 },
      })
      title.x = WORLD_WIDTH / 2
      title.y = 30
      ui.addChild(title)

      worldRef.current.addChild(ui)
    }

    const gameLoop = (delta: number) => {
      const msDelta = delta * (1000 / 60) // convertir a ms

      // Actualizar agentes
      for (const agent of agentsRef.current.values()) {
        agent.update(msDelta)
      }

      // Actualizar coordinador
      if (coordinatorRef.current) {
        coordinatorRef.current.update(msDelta)
      }

      // Actualizar partículas
      if (particlesRef.current) {
        particlesRef.current.update(msDelta)
      }

      // Actualizar conexiones
      if (connectionsRef.current) {
        connectionsRef.current.update(msDelta)
      }
    }

    // Cleanup
    return () => {
      mounted = false
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
    }
  }, [])

  // Actualizar estados de agentes
  useEffect(() => {
    if (!isReady || !coordinatorRef.current) return

    // Actualizar cada agente
    for (const [agentId, status] of Object.entries(agentStatuses)) {
      const agent = agentsRef.current.get(agentId)
      const prevStatus = prevAgentStatusRef.current[agentId]

      if (agent && status !== prevStatus) {
        agent.setStatus(status)

        // Si el agente está running y hay coordinador, crear efecto de delegación
        if (status === 'running' && coordinatorRef.current) {
          const coord = coordinatorRef.current
          const agentPos = agent.getPosition()

          // Coordinador camina hacia el agente
          coord.walkToAgent(agentPos.x, agentPos.y)

          // Crear partículas de delegación
          if (particlesRef.current) {
            setTimeout(() => {
              particlesRef.current?.spawnDelegation(
                coord.x,
                coord.y,
                agentPos.x,
                agentPos.y
              )
            }, 500)
          }
        }

        // Si el agente completó, crear partículas de celebración
        if (status === 'completed' && prevStatus === 'running') {
          const agentPos = agent.getPosition()
          if (particlesRef.current) {
            particlesRef.current.spawnCompletion(agentPos.x, agentPos.y)
          }

          // Coordinador vuelve al centro
          coordinatorRef.current?.returnToCenter()
        }

        // Si el agente falló, crear partículas de error
        if (status === 'failed') {
          const agentPos = agent.getPosition()
          if (particlesRef.current) {
            particlesRef.current.spawnFail(agentPos.x, agentPos.y)
          }

          // Coordinador vuelve al centro
          coordinatorRef.current?.returnToCenter()
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
        (c) => c instanceof Graphics && c !== uiRef.current?.children[0]
      ) as Graphics
      
      if (progressBar) {
        progressBar.clear()
        progressBar.roundRect(
          25,
          WORLD_HEIGHT - 45,
          (WORLD_WIDTH - 50) * (progress / 100),
          10,
          5
        )
        progressBar.fill({ color: 0xfbbf24, alpha: 0.8 })
      }
    }

    // Callback cuando se completa
    if (progress >= 100 && onComplete) {
      onComplete()
    }
  }, [progress, mensaje, onComplete])

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
            Cargando mundo PixiJS...
          </div>
        </div>
      )}
    </div>
  )
}

export default PixiSwarmWorld
