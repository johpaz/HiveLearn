/**
 * MundoWorld — Componente principal del Mundo de Aprendizaje HiveLearn
 * 
 * Mundo pixel art dinámico con scroll horizontal tipo plataformer
 * donde cada módulo es una zona del mapa interactivo.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Application, Container, Graphics, Text, TextStyle, Assets, Ticker, Sprite } from 'pixi.js'
import { useMundoStore } from '../../store/mundoStore'
import {
  TILE_SIZE,
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  COLORS,
  JUGADOR_CONFIG,
  CAMARA_CONFIG,
  ZONAS_CONFIG,
  lerp,
  clamp,
} from './constants'
import type { Zona, Jugador, Camara, Plataforma, Coleccionable } from './types'

// ─── Componentes del mundo ───────────────────────────────────────────────────

import { Player } from './player/Player'
import { WorldMap } from './world/WorldMap'
import { WorldCamera } from './world/WorldCamera'
import { ParallaxBackground } from './world/ParallaxBackground'
import { ZoneManager } from './zones/ZoneManager'
import { ParticleSystem } from './effects/ParticleSystem'
import { SoundManager, soundManager } from './effects/SoundManager'
import { SurpriseEventManager, surpriseEventManager } from './events/SurpriseEvents'
import { GamificationOverlay } from './gamification/GamificationOverlay'
import { CoordinatorCharacter } from './agents/CoordinatorCharacter'
import { PedagogicalCharacter } from './agents/PedagogicalCharacter'
import { MonitorCharacter } from './agents/MonitorCharacter'

// ─── Props del componente ────────────────────────────────────────────────────

export interface MundoWorldProps {
  /** UUID del programa */
  programaUuid: string
  
  /** ID de la sesión */
  sessionId: string
  
  /** ID del alumno */
  alumnoId: string
  
  /** Nickname del alumno */
  nickname: string
  
  /** Avatar del alumno */
  avatar: string
  
  /** Tema del programa */
  tema: string
  
  /** Callback cuando se completa el mundo */
  onComplete?: () => void
  
  /** Callback cuando el alumno interactúa con una zona */
  onZoneInteract?: (zona: Zona) => void
  
  /** Callback cuando el alumno responde */
  onAnswer?: (moduloUuid: string, respuesta: any) => void
}

/**
 * Referencia a los sistemas internos del mundo para el puente A2UI
 */
export interface MundoWorldRef {
  zoneManager: ZoneManager | null
  playerRef: React.RefObject<Player | null> | null
  particleSystem: ParticleSystem | null
  wsManager: any | null
}

// ─── Componente principal ────────────────────────────────────────────────────

/**
 * MundoWorld — Mundo de aprendizaje pixel art
 */
export function MundoWorld({
  programaUuid,
  sessionId,
  alumnoId,
  nickname,
  avatar,
  tema,
  onComplete,
  onZoneInteract,
  onAnswer,
}: MundoWorldProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const playerRef = useRef<Player | null>(null)
  const cameraRef = useRef<WorldCamera | null>(null)
  const backgroundRef = useRef<ParallaxBackground | null>(null)
  const zoneManagerRef = useRef<ZoneManager | null>(null)
  const particleSystemRef = useRef<ParticleSystem | null>(null)
  const soundManagerRef = useRef<SoundManager | null>(null)
  const surpriseManagerRef = useRef<SurpriseEventManager | null>(null)
  const coordinatorRef = useRef<CoordinatorCharacter | null>(null)
  const monitorRef = useRef<MonitorCharacter | null>(null)
  const uiRef = useRef<Container | null>(null)
  
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  // Stores
  const { 
    inicializarMundo, 
    setMundoListo,
    setBienvenidaMostrada,
    bienvenidaMostrada,
    zonaActual,
    jugador,
    xpTotal,
    nivelActual,
    progresoNivel,
    vidas,
    racha,
    logros,
    zonas,
    agregarXP,
    setJugadorPosicion,
    setJugadorAnimacion,
    setJugadorDireccion,
    desbloquearZona,
    completarZona,
    setZonaActual,
  } = useMundoStore()
  


  // ─── Inicialización ────────────────────────────────────────────────────────

  const handleResize = useCallback(() => {
    if (appRef.current) {
      // Resize logic if needed
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    let mounted = true

    const initApp = async () => {
      try {
        setIsLoading(true)
        
        // Crear aplicación PixiJS v8
        const app = new Application()
        await app.init({
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          background: COLORS.fondo,
          antialias: false, // Pixel art no necesita antialiasing
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          eventMode: 'static',
          eventFeatures: {
            click: true,
            move: true,
            wheel: true,
            globalMove: true,
          },
        })

        if (!mounted) {
          app.destroy(true)
          return
        }

        // Añadir canvas al contenedor
        containerRef.current.appendChild(app.canvas as HTMLCanvasElement)
        appRef.current = app

        // Inicializar mundo
        await initWorld(app as any)
        
        setIsReady(true)
        setIsLoading(false)
        setMundoListo(true)
        
        // Inicializar store del mundo
        inicializarMundo(programaUuid, sessionId, alumnoId, tema)

        // Iniciar game loop
        app.ticker.add((ticker) => gameLoop(ticker as any))

        // Mostrar bienvenida
        setTimeout(() => {
          showBienvenida()
        }, 1000)

      } catch (error) {
        console.error('Error initializing PixiJS:', error)
        setIsLoading(false)
      }
    }

    const initWorld = async (app: any) => {
      if (!app) return

      // Crear contenedor principal del mundo
      const world = new Container()
      worldRef.current = world
      app.stage.addChild(world)

      // Crear fondo parallax
      const background = new ParallaxBackground()
      backgroundRef.current = background
      world.addChild(background)

      // Crear sistema de partículas
      const particles = new ParticleSystem()
      particleSystemRef.current = particles
      world.addChild(particles)

      // Crear sistema de sonido
      const sound = new SoundManager()
      soundManagerRef.current = sound

      // Crear manager de eventos sorpresa
      const surprise = new SurpriseEventManager({
        probabilidad: 0.5,
        minInterval: 30,
        maxInterval: 90,
      })
      surpriseManagerRef.current = surprise
      world.addChild(surprise)

      // Crear manager de zonas
      const zoneManager = new ZoneManager()
      zoneManagerRef.current = zoneManager

      // Generar zonas iniciales
      const zonasGeneradas = zoneManager.generarZonas(tema)
      world.addChild(zoneManager)
      
      // Actualizar store con zonas
      zonasGeneradas.forEach((zona, index) => {
        if (index === 0) {
          desbloquearZona(0, {
            modulo_uuid: zona.moduloUuid,
            agente_id: zona.agenteId,
            titulo: zona.titulo,
            tipo_pedagogico: zona.tipoPedagogico,
            xp_recompensa: zona.xpRecompensa,
          })
        }
      })

      // Crear jugador
      const player = new Player(nickname, avatar)
      playerRef.current = player
      world.addChild(player)

      // Posicionar jugador en zona 0
      const zona0 = zonasGeneradas[0]
      if (zona0) {
        player.x = zona0.x + 50
        player.y = zona0.y - JUGADOR_CONFIG.alto
      }

      // Crear coordinador (zona 0)
      const coordinator = new CoordinatorCharacter({
        x: zona0 ? zona0.x + 100 : 150,
        y: zona0 ? zona0.y - 80 : 320,
        nickname,
      })
      coordinatorRef.current = coordinator
      world.addChild(coordinator)

      // Crear monitor (vuela sobre el mundo)
      const monitor = new MonitorCharacter({
        x: WORLD_WIDTH / 2,
        y: 80,
      })
      monitorRef.current = monitor
      world.addChild(monitor)

      // Crear cámara
      const camera = new WorldCamera(app.stage, player)
      cameraRef.current = camera

      // Crear UI overlay
      createUI()

      // Manejar resize
      const handleResize = () => {
        resizeCanvas()
      }
      window.addEventListener('resize', handleResize)
      resizeCanvas()

      // Manejar input de teclado
      setupKeyboardInput()
    }

    const createUI = () => {
      if (!worldRef.current) return

      const ui = new Container()
      uiRef.current = ui
      ui.zIndex = 1000
      appRef.current?.stage.addChild(ui)

      // El UI se renderiza con React overlay (GamificationOverlay)
    }

    const resizeCanvas = () => {
      if (!appRef.current || !containerRef.current) return
      
      const container = containerRef.current
      const app = appRef.current
      const aspectRatio = VIEWPORT_WIDTH / VIEWPORT_HEIGHT
      
      let newWidth = container.clientWidth
      let newHeight = newWidth / aspectRatio
      
      if (newHeight > container.clientHeight) {
        newHeight = container.clientHeight
        newWidth = newHeight * aspectRatio
      }
      
      app.canvas.style.width = `${newWidth}px`
      app.canvas.style.height = `${newHeight}px`
    }

    const setupKeyboardInput = () => {
      const player = playerRef.current
      if (!player) return

      const keys = {
        left: false,
        right: false,
        up: false,
        down: false,
        shift: false,
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        switch (e.code) {
          case 'ArrowLeft':
          case 'KeyA':
            keys.left = true
            break
          case 'ArrowRight':
          case 'KeyD':
            keys.right = true
            break
          case 'ArrowUp':
          case 'Space':
          case 'KeyW':
            keys.up = true
            e.preventDefault()
            break
          case 'ArrowDown':
          case 'KeyS':
            keys.down = true
            break
          case 'ShiftLeft':
          case 'ShiftRight':
            keys.shift = true
            break
        }
      }

      const handleKeyUp = (e: KeyboardEvent) => {
        switch (e.code) {
          case 'ArrowLeft':
          case 'KeyA':
            keys.left = false
            break
          case 'ArrowRight':
          case 'KeyD':
            keys.right = false
            break
          case 'ArrowUp':
          case 'Space':
          case 'KeyW':
            keys.up = false
            break
          case 'ArrowDown':
          case 'KeyS':
            keys.down = false
            break
          case 'ShiftLeft':
          case 'ShiftRight':
            keys.shift = false
            break
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)

      // Game loop input handler
      const processInput = (delta: number) => {
        if (!player || !playerRef.current) return

        const dt = (delta / 60) * 0.016 // Normalizar a 60fps
        const velocidad = keys.shift ? JUGADOR_CONFIG.velocidadPowerup : JUGADOR_CONFIG.velocidad

        // Movimiento horizontal
        if (keys.left) {
          player.moveLeft(velocidad, dt)
          setJugadorDireccion('izquierda')
        } else if (keys.right) {
          player.moveRight(velocidad, dt)
          setJugadorDireccion('derecha')
        } else {
          player.stopHorizontal()
        }

        // Salto
        if (keys.up && player.enSuelo) {
          player.jump()
          setJugadorAnimacion('saltar')
        }

        // Actualizar jugador
        player.update(dt)

        // Actualizar posición en store
        setJugadorPosicion(player.x, player.y)

        // Actualizar cámara
        const camera = cameraRef.current
        if (camera) {
          camera.update(dt)
        }

        // Chequear colisiones con zonas
        const zoneManager = zoneManagerRef.current
        if (zoneManager) {
          const zonaActual = zoneManager.chequearZona(player)
          if (zonaActual) {
            setZonaActual(zonaActual.numero)
          }
        }
      }

      // Guardar referencia para usar en game loop
      ;(window as any).__mundoInputHandler = processInput
    }

    const gameLoop = (ticker: any) => {
      const delta = typeof ticker === 'number' ? ticker : (ticker.deltaTime || 1)
      const dt = delta / 60

      // Procesar input
      const inputHandler = (window as any).__mundoInputHandler
      if (inputHandler) {
        inputHandler(delta)
      }

      // Actualizar jugador
      const player = playerRef.current
      if (player) {
        player.update(dt)
      }

      // Actualizar cámara
      const camera = cameraRef.current
      if (camera) {
        camera.update(dt)
      }

      // Actualizar fondo parallax
      const background = backgroundRef.current
      if (background) {
        background.update(cameraRef.current?.x || 0)
      }

      // Actualizar sistema de partículas
      const particles = particleSystemRef.current
      if (particles) {
        particles.update(dt)
      }

      // Actualizar eventos sorpresa
      const surprise = surpriseManagerRef.current
      if (surprise) {
        surprise.update(dt)
        
        // Chequear colisión con sorpresas
        const playerBounds = player?.getCollisionBounds()
        if (playerBounds) {
          const sorpresaIndex = surprise.chequearColision(
            playerBounds.x,
            playerBounds.y,
            playerBounds.width,
            playerBounds.height
          )
          if (sorpresaIndex >= 0) {
            surprise.recogerSorpresa(sorpresaIndex)
            // Sonido de moneda y XP bonus
            soundManagerRef.current?.coin()
            agregarXP(25, playerBounds.x, playerBounds.y - 50)
          }
        }
      }

      // Actualizar coordinador
      const coordinator = coordinatorRef.current
      if (coordinator) {
        coordinator.update(dt)
      }

      // Actualizar monitor
      const monitor = monitorRef.current
      if (monitor) {
        monitor.update(dt)
        
        // Monitor observa al jugador ocasionalmente
        if (player && Math.random() < 0.005) {
          monitor.observarJugador(player.x)
        }
      }

      // Actualizar zone manager
      const zoneManager = zoneManagerRef.current
      if (zoneManager) {
        zoneManager.update(dt)
      }

      // Actualizar UI
      updateUI()
    }

    const updateUI = () => {
      // El UI se actualiza via React (GamificationOverlay)
    }

    const showBienvenida = () => {
      if (bienvenidaMostrada) return

      // Mostrar mensaje de bienvenida del coordinador
      const coordinator = coordinatorRef.current
      const player = playerRef.current

      if (coordinator && player) {
        coordinator.saludar(nickname, tema)
        setBienvenidaMostrada(true)
        
        // Sonido de bienvenida
        setTimeout(() => {
          soundManagerRef.current?.levelUp()
        }, 500)
      }
    }

    // Cleanup
    return () => {
      mounted = false
      window.removeEventListener('resize', handleResize)

      const inputHandler = (window as any).__mundoInputHandler
      if (inputHandler) {
        delete (window as any).__mundoInputHandler
      }

      // Destruir sound manager
      if (soundManagerRef.current) {
        soundManagerRef.current.destroy()
        soundManagerRef.current = null
      }

      // Destruir surprise manager
      if (surpriseManagerRef.current) {
        surpriseManagerRef.current.destroy()
        surpriseManagerRef.current = null
      }

      // Destruir coordinador
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy()
        coordinatorRef.current = null
      }

      // Destruir monitor
      if (monitorRef.current) {
        monitorRef.current.destroy()
        monitorRef.current = null
      }

      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
    }
  }, [programaUuid, sessionId, alumnoId, nickname, avatar, tema])

  // ─── Render ────────────────────────────────────────────────────────────────


  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Contenedor del canvas PixiJS */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{
          background: `#${COLORS.fondo.toString(16).padStart(6, '0')}`,
        }}
      />

      {/* Overlay de UI React */}
      {isReady && (
        <GamificationOverlay
          xpTotal={xpTotal}
          nivelActual={nivelActual}
          progresoNivel={progresoNivel}
          vidas={vidas}
          racha={racha}
          logros={logros}
          zonaActual={zonaActual}
          nickname={nickname}
          tema={tema}
        />
      )}

      {/* Loading screen */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e27]">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-[#fbbf24] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-[#fbbf24] font-bold text-lg animate-pulse">
              Cargando mundo...
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default MundoWorld
