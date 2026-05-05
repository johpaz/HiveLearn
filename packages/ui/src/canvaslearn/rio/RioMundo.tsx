import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Application, Container } from 'pixi.js'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { IsometricRenderer } from './renderer/IsometricRenderer'
import { generateRioMundo, activateTributary } from './world/RiverGenerator'
import { RioCamera } from './camera/RioCamera'
import { RioPlayer } from './player/RioPlayer'
import { RioBee } from './bee/RioBee'
import { RioSwarmBees } from './bee/RioSwarmBees'
import { RioDialog } from './dialog/RioDialog'
import { RioWaterSystem } from './effects/WaterSystem'
import { RioEntryAnimation } from './effects/EntryAnimation'
import { RioHUD } from './overlays/RioHUD'
import { RioTutorialHints } from './overlays/RioTutorialHints'
import { RioLogin } from './overlays/RioLogin'
import { RioWelcomeOverlay } from './overlays/RioWelcomeOverlay'
import { RioLoadingScene } from './scenes/RioLoadingScene'
import { RioOnboardingChat } from './onboarding/RioOnboardingChat'
import { RioOnboardingController } from './onboarding/RioOnboardingController'
import { RioSwarmTourController } from './onboarding/RioSwarmTourController'
import { RioA2UIBridge } from './protocol/RioA2UIBridge'
import { PortalOverlay } from './portal/PortalOverlay'
import { useTTSSpeak } from '@/hooks/useTTSSpeak'
import { AudioManager } from './audio/AudioManager'
import { BeeLoader } from '@/components/ui/bee-loader'
import type { IsoMap, LoginPhase } from './types'
import { ISO_CONFIG } from './types'

function PortalProximityIndicator() {
  const jugador = useRioMundoStore(s => s.jugador)
  const mapa = useRioMundoStore(s => s.mapa)
  const portal = useRioMundoStore(s => s.portal)
  const loginPhase = useRioMundoStore(s => s.loginPhase)

  if (loginPhase !== 'in_world' || portal.phase !== 'closed' || !mapa) return null

  const tileX = Math.round(jugador.x)
  const tileY = Math.round(jugador.y)
  const tile = mapa.tiles[tileY]?.[tileX]

  if (!tile || tile.type !== 'portal_zona' || tile.flowState !== 'fluyendo') return null

  const tributary = useRioMundoStore.getState().tributaries.find(t => t.zoneNumero === (tile.zoneRef || 0))

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="bg-[#0a0e27]/90 backdrop-blur-sm border border-[#fbbf24]/50 rounded-xl px-5 py-3 flex items-center gap-3 animate-pulse">
        <span className="text-2xl">{tributary ? getTipoEmoji(tributary.tipoPedagogico) : '🌀'}</span>
        <div>
          <div className="text-[#fbbf24] font-bold text-sm">Presiona E para entrar</div>
          {tributary && <div className="text-[#888] text-xs">{tributary.name}</div>}
        </div>
      </div>
    </div>
  )
}

function getTipoEmoji(tipo: string): string {
  switch (tipo) {
    case 'concept': return '📖'
    case 'exercise': return '✏️'
    case 'quiz': return '❓'
    case 'challenge': return '🏆'
    case 'milestone': return '⭐'
    case 'evaluation': return '📝'
    default: return '🎯'
  }
}

export function RioMundo() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const rendererRef = useRef<IsometricRenderer | null>(null)
  const cameraRef = useRef<RioCamera | null>(null)
  const playerRef = useRef<RioPlayer | null>(null)
  const beeRef = useRef<RioBee | null>(null)
  const swarmBeesRef = useRef<RioSwarmBees | null>(null)
  const dialogRef = useRef<RioDialog | null>(null)
  const waterRef = useRef<RioWaterSystem | null>(null)
  const entryAnimRef = useRef<RioEntryAnimation | null>(null)
  const onboardingRef = useRef(new RioOnboardingController())
  const tourRef = useRef(new RioSwarmTourController())
  const mapRef = useRef<IsoMap | null>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const loadingSceneRef = useRef<RioLoadingScene | null>(null)
  const audioManagerRef = useRef<AudioManager | null>(null)
  const mouseTargetRef = useRef<{ x: number; y: number } | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [showLogin, setShowLogin] = useState(false)
  const [showLoading, setShowLoading] = useState(false)
  const [showTourSkip, setShowTourSkip] = useState(false)
  const { speak: beeSpeak } = useTTSSpeak()

  const {
    loginPhase,
    mundoListo,
    jugador,
    mapa,
    setMapa,
    setMundoListo,
    setJugadorPosicion,
    setJugadorDireccion,
    setJugadorAnimacion,
    setCamaraTarget,
    setLoginPhase,
    beeState,
    onboarding,
  } = useRioMundoStore()

  // ─── Initialize PixiJS ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || appRef.current) return

    const app = new Application()
    app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0a0e27,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (!containerRef.current) return
      containerRef.current.appendChild(app.canvas as HTMLCanvasElement)

      appRef.current = app

      const store = useRioMundoStore.getState()

      const audioManager = new AudioManager()
      audioManagerRef.current = audioManager
      store.setAudioManager(audioManager)

      const initialSettings = {
        musicVolume: store.audioSettings.musicVolume / 100,
        sfxVolume: store.audioSettings.sfxVolume / 100,
        musicMuted: store.audioSettings.musicMuted,
        sfxMuted: store.audioSettings.sfxMuted,
      }


      audioManager.init(initialSettings).then(async () => {
        await audioManager.preloadAssets({
          titleMusic: '/canvaslearn/art/music/title_theme.ogg',
          hubMusic: '/canvaslearn/art/music/hub_theme.ogg',
          worldAdventure: '/canvaslearn/art/music/world_adventure.ogg',
          worldPeaceful: '/canvaslearn/art/music/world_peaceful.ogg',
          worldTension: '/canvaslearn/art/music/world_tension.ogg',
          victoryTheme: '/canvaslearn/art/music/victory_theme.ogg',
          gameOverTheme: '/canvaslearn/art/music/game_over_theme.ogg',
          sfx_ambient_water: '/canvaslearn/art/sfx/ambient_water.ogg',
          sfx_ambient_forest: '/canvaslearn/art/sfx/ambient_forest.ogg',
          sfx_applause: '/canvaslearn/art/sfx/applause.ogg',
        })
        const settings = store.audioSettings
        audioManager.setMusicVolume(settings.musicVolume / 100)
        audioManager.setSFXVolume(settings.sfxVolume / 100)
        if (settings.musicMuted && !audioManager.getSettings().musicMuted) audioManager.toggleMusicMuted()
        if (settings.sfxMuted && !audioManager.getSettings().sfxMuted) audioManager.toggleSFXMuted()
        // Audio listo — ocultar loader
        store.setAudioReady(true)
        store.setBeeLoaderVisible(false)
      })

      setIsReady(true)
    })

    return () => {
      loadingSceneRef.current?.destroy()
      audioManagerRef.current?.destroy()
      audioManagerRef.current = null
      swarmBeesRef.current?.destroy()
      entryAnimRef.current?.destroy()
      waterRef.current?.destroy()
      dialogRef.current?.destroy()
      beeRef.current?.destroy()
      playerRef.current?.destroy()
      cameraRef.current?.destroy()
      rendererRef.current?.destroy()
      appRef.current?.destroy(true)
      appRef.current = null
    }
  }, [])

  // ─── Keyboard input ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())
      if (e.key === 'Shift') {
        useRioMundoStore.getState().setJugadorAnimacion('correr')
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
      if (e.key === 'Shift') {
        useRioMundoStore.getState().setJugadorAnimacion('caminar')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // ─── Initialize world (deferred until after login) ──────────────────────────

  const initWorld = useCallback(() => {
    const app = appRef.current
    if (!app || rendererRef.current) return

    const loadingScene = new RioLoadingScene(app)
    loadingSceneRef.current = loadingScene
    setShowLoading(true)

    loadingScene.setProgress(0.1)

    setTimeout(() => {
      if (!appRef.current) return

      const renderer = new IsometricRenderer(app)
      rendererRef.current = renderer
      loadingScene.setProgress(0.3)

      const world = generateRioMundo(5, 42)
      mapRef.current = world
      renderer.setMap(world)
      setMapa(world)
      loadingScene.setProgress(0.5)

      const spawnScreen = renderer.isoToScreen(world.spawn.x, world.spawn.y)
      const camera = new RioCamera(app, {
        x: spawnScreen.x,
        y: spawnScreen.y,
        zoom: 1,
        smoothing: ISO_CONFIG.CAMERA_SMOOTHING,
        bounds: { minX: -3000, minY: -2000, maxX: 3000, maxY: 2000 },
      })
      cameraRef.current = camera

      const worldContainer = camera.getContainer()
      worldContainer.addChild(renderer.getMapContainer())
      worldContainer.addChild(renderer.getEntityContainer())
      worldContainer.addChild(renderer.getOverlayContainer())

      loadingScene.setProgress(0.7)

      const player = new RioPlayer(app, renderer, camera)
      playerRef.current = player

      const bee = new RioBee(app, renderer, camera)
      beeRef.current = bee

      const dialog = new RioDialog(app, renderer)
      dialogRef.current = dialog

      const water = new RioWaterSystem(app, renderer)
      water.setMap(world)
      waterRef.current = water

      const swarmBees = new RioSwarmBees(app, renderer, camera)
      swarmBees.initialize(world.tributaries)
      swarmBeesRef.current = swarmBees

      // Wire existing agent statuses from store
      const existingStatuses = useRioMundoStore.getState().agentStatuses
      for (const [agentId, status] of Object.entries(existingStatuses)) {
        swarmBees.updateAgentStatus(agentId, status)
      }

      useRioMundoStore.getState().setJugadorPosicion(world.spawn.x, world.spawn.y)

      loadingScene.setProgress(1.0)

      loadingScene.setOnComplete(() => {
        loadingScene.destroy()
        loadingSceneRef.current = null
        setShowLoading(false)
      })
    }, 100)
  }, [setMapa])

  // ─── Mouse click-to-move ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady) return

    const handleClick = (e: MouseEvent) => {
      const state = useRioMundoStore.getState()
      if (state.loginPhase !== 'in_world' && state.loginPhase !== 'entering_world' && state.loginPhase !== 'swarm_tour') return
      if (!rendererRef.current || !cameraRef.current) return

      const canvasRect = appRef.current?.canvas?.getBoundingClientRect()
      if (!canvasRect) return

      const screenX = e.clientX - canvasRect.left
      const screenY = e.clientY - canvasRect.top

      const camera = cameraRef.current
      const worldPos = camera.screenToWorld(screenX, screenY)

      if (rendererRef.current) {
        const isoPos = rendererRef.current.screenToIso(worldPos.x, worldPos.y)
        if (mapRef.current) {
          const tileX = Math.round(isoPos.x)
          const tileY = Math.round(isoPos.y)
          const tile = mapRef.current.tiles[tileY]?.[tileX]
          if (tile && tile.walkable) {
            mouseTargetRef.current = { x: tileX, y: tileY }
          }
        }
      }
    }

    const canvas = appRef.current?.canvas
    if (canvas) {
      canvas.addEventListener('click', handleClick)
    }

    return () => {
      if (canvas) {
        canvas.removeEventListener('click', handleClick)
      }
    }
  }, [isReady])

  // ─── Game loop ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!appRef.current || !isReady) return

    const app = appRef.current!

    const gameLoop = (ticker: any) => {
      const dt = ticker.deltaTime / 60
      const time = ticker.lastTime
      const state = useRioMundoStore.getState()
      const keys = keysRef.current

      // Only move in world states
      if (state.loginPhase !== 'in_world' && state.loginPhase !== 'onboarding_chat' && state.loginPhase !== 'entering_world' && state.loginPhase !== 'swarm_tour') {
        // Still update water animation
        if (waterRef.current) waterRef.current.update(dt, time)
        return
      }

      // Update player movement
      if (playerRef.current && mapRef.current) {
        let dx = 0
        let dy = 0

        if (state.loginPhase === 'in_world' || state.loginPhase === 'entering_world' || state.loginPhase === 'swarm_tour') {
          if (keys.has('w') || keys.has('arrowup')) dy -= 1
          if (keys.has('s') || keys.has('arrowdown')) dy += 1
          if (keys.has('a') || keys.has('arrowleft')) dx -= 1
          if (keys.has('d') || keys.has('arrowright')) dx += 1

          const mouseTarget = mouseTargetRef.current
          if (mouseTarget && dx === 0 && dy === 0) {
            const diffX = mouseTarget.x - state.jugador.x
            const diffY = mouseTarget.y - state.jugador.y
            const dist = Math.sqrt(diffX * diffX + diffY * diffY)
            if (dist > 0.15) {
              dx = diffX / dist
              dy = diffY / dist
            } else {
              mouseTargetRef.current = null
            }
          } else if (dx !== 0 || dy !== 0) {
            mouseTargetRef.current = null
          }
        }

        if (dx !== 0 || dy !== 0) {
          const speed = state.jugador.animation === 'correr' ? ISO_CONFIG.PLAYER_RUN_SPEED : ISO_CONFIG.PLAYER_SPEED
          const newX = state.jugador.x + dx * speed * dt
          const newY = state.jugador.y + dy * speed * dt

          if (Math.abs(dx) > Math.abs(dy)) {
            useRioMundoStore.getState().setJugadorDireccion(dx > 0 ? 'e' : 'w')
          } else if (dy !== 0) {
            if (dx === 0) {
              useRioMundoStore.getState().setJugadorDireccion(dy > 0 ? 's' : 'n')
            } else if (dx > 0) {
              useRioMundoStore.getState().setJugadorDireccion(dy > 0 ? 'se' : 'ne')
            } else {
              useRioMundoStore.getState().setJugadorDireccion(dy > 0 ? 'sw' : 'nw')
            }
          }

          useRioMundoStore.getState().setJugadorPosicion(newX, newY)
          useRioMundoStore.getState().setJugadorAnimacion(state.jugador.animation === 'correr' ? 'correr' : 'caminar')
        } else {
          if (state.jugador.animation === 'caminar' || state.jugador.animation === 'correr') {
            useRioMundoStore.getState().setJugadorAnimacion('idle')
          }
        }
      }

      // Update camera
      if (cameraRef.current && rendererRef.current) {
        const screenPos = rendererRef.current.isoToScreen(state.jugador.x, state.jugador.y)
        useRioMundoStore.getState().setCamaraTarget(screenPos.x, screenPos.y)
        cameraRef.current.setZoom(state.camara.targetZoom)
        cameraRef.current.update(dt)
      }

      // Update player sprite
      if (playerRef.current) {
        playerRef.current.update(state.jugador, dt)
      }

      // Update bee
      if (beeRef.current) {
        beeRef.current.update(state.jugador, state.beeState, dt, time)
        // Guardar posición de la abeja en el store para que las burbujas de diálogo se posicionen sobre ella
        const beePos = beeRef.current.getPosition()
        useRioMundoStore.getState().setBeePosicion(beePos.x, beePos.y)
      }

      // Update water
      if (waterRef.current) {
        waterRef.current.update(dt, time)
      }

      // Update swarm bees
      if (swarmBeesRef.current) {
        swarmBeesRef.current.update(time)
      }

      // Update entry animation
      if (entryAnimRef.current) {
        entryAnimRef.current.update(time)
      }

      // Update dialog bubbles
      if (dialogRef.current) {
        dialogRef.current.update(dt)
      }

      // Map changes from store
      if (mapRef.current && state.mapa && state.mapa !== mapRef.current) {
        mapRef.current = state.mapa
        if (rendererRef.current && waterRef.current) {
          rendererRef.current.setMap(state.mapa)
          waterRef.current.setMap(state.mapa)
        }
      }
    }

    app.ticker.add(gameLoop)
    return () => {
      if (app && app.ticker) {
        app.ticker.remove(gameLoop)
      }
    }
  }, [isReady])

  // ─── Handle resize ───────────────────────────────────────────────────────────

  useEffect(() => {
    const handleResize = () => {
      if (appRef.current) {
        appRef.current.renderer.resize(window.innerWidth, window.innerHeight)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ─── Handle login phase transitions ──────────────────────────────────────────

  useEffect(() => {
    // Auto-hide login when entering world or beyond
    if (loginPhase === 'entering_world' || loginPhase === 'onboarding_chat' || loginPhase === 'in_world' || loginPhase === 'swarm_tour') {
      setShowLogin(false)
    }
  }, [loginPhase])

  useEffect(() => {
    if (loginPhase === 'entering_world' && isReady) {
      if (!rendererRef.current) {
        initWorld()
      }

      const waitForWorld = () => {
        if (rendererRef.current && playerRef.current) {
          // Start entry animation
          const spawn = mapRef.current?.spawn || { x: 20, y: 37 }
          const entryAnim = new RioEntryAnimation(
            appRef.current!,
            rendererRef.current,
            cameraRef.current!,
            spawn.x,
            spawn.y,
          )
          entryAnimRef.current = entryAnim
          entryAnim.start(waterRef.current || undefined, playerRef.current || undefined, beeRef.current || undefined)

          entryAnim.setOnComplete(() => {
            entryAnim.destroy()
            entryAnimRef.current = null
          })

          setTimeout(() => {
            const store = useRioMundoStore.getState()
            const o = store.onboarding
            const hasNombre = o.nombre?.trim() || store.perfil?.nombre || store.nickname?.trim()
            const hasEdad = o.edad != null || store.perfil?.edad != null
            const hasTema = o.tema?.trim()
            const hasObjetivo = o.objetivo?.trim()
            const hasEstilo = o.estilo?.trim()
            const allComplete = hasNombre && hasEdad && hasTema && hasObjetivo && hasEstilo

            if (allComplete) {
              // Onboarding ya completo — saltar directo al mundo
              handleOnboardingComplete({
                nombre: o.nombre || store.perfil?.nombre || '',
                edad: o.edad ?? store.perfil?.edad ?? 18,
                tema: o.tema || '',
                objetivo: o.objetivo || '',
                estilo: o.estilo || '',
              })
            } else {
              useRioMundoStore.getState().setLoginPhase('onboarding_chat')
              setShowOnboarding(true)
              onboardingRef.current.setDialogRef(dialogRef.current)
              onboardingRef.current.setSpeakFunction(beeSpeak)
              onboardingRef.current.start()
            }
          }, 1500)
        } else {
          setTimeout(waitForWorld, 100)
        }
      }
      waitForWorld()
    }
  }, [loginPhase, isReady, initWorld])

  // ─── Music transitions by login phase ───────────────────────────────────────

  useEffect(() => {
    const am = useRioMundoStore.getState().audioManager
    if (!am) return

    switch (loginPhase) {
      case 'entering_world':
        am.crossfadeMusic('worldAdventure', 2000)
        break
      case 'onboarding_chat':
        am.crossfadeMusic('worldPeaceful', 1500)
        break
      case 'swarm_tour':
        am.crossfadeMusic('worldAdventure', 1500)
        break
      case 'in_world':
        // Solo cambiar si no está ya sonando worldPeaceful o worldTension
        const current = am.getCurrentMusicKey?.() || ''
        if (current !== 'worldPeaceful' && current !== 'worldTension') {
          am.crossfadeMusic('worldPeaceful', 1500)
        }
        break
    }
  }, [loginPhase])

  // ─── Handle onboarding complete ──────────────────────────────────────────────

  const handleOnboardingComplete = useCallback(async (data: Record<string, string | number>) => {
    setShowOnboarding(false)
    useRioMundoStore.getState().setMundoListo(true)

    // Activate first tributary
    const currentMap = useRioMundoStore.getState().mapa
    if (currentMap) {
      const newMap = activateTributary(currentMap, 1)
      useRioMundoStore.getState().setMapa(newMap)
      if (rendererRef.current) {
        const trib = newMap.tributaries.find(t => t.zoneNumero === 1)
        if (trib) {
          for (const point of trib.path) {
            const tile = newMap.tiles[point.y]?.[point.x]
            if (tile) rendererRef.current.updateTile(tile)
          }
        }
      }
    }

    // Create student profile on server via WS (solo si es alumno nuevo)
    const state = useRioMundoStore.getState()
    const sendWs = state.sendWsMessage
    if (sendWs && !state.alumnoId) {
      sendWs({
        tipo: 'crear_alumno',
        nombre: data.nombre || data.nickname || 'Estudiante',
        nickname: data.nombre || data.nickname || 'Estudiante',
        edad: data.edad || 18,
      })
    }

    // Iniciar Swarm Tour en lugar de ir directo a in_world
    if (beeRef.current && dialogRef.current && swarmBeesRef.current) {
      tourRef.current.setRefs(beeRef.current, dialogRef.current, swarmBeesRef.current)
      tourRef.current.setSpeakFunction(beeSpeak)
      setShowTourSkip(true)
      tourRef.current.start()
    } else {
      // Fallback si no hay refs: ir directo a in_world
      useRioMundoStore.getState().setLoginPhase('in_world')
    }
  }, [beeSpeak])

  // ─── Portal interaction ─────────────────────────────────────────────────────

  const portal = useRioMundoStore(s => s.portal)

  // Check if player is on a portal tile
  const checkPortalProximity = useCallback(() => {
    if (!mapRef.current) return null
    const state = useRioMundoStore.getState()
    const { x, y } = state.jugador
    const tileX = Math.round(x)
    const tileY = Math.round(y)
    const tile = mapRef.current.tiles[tileY]?.[tileX]
    if (tile && tile.type === 'portal_zona' && tile.flowState === 'fluyendo') {
      return tile.zoneRef || null
    }
    return null
  }, [])

  // Handle Enter/E key press for portal interaction
  useEffect(() => {
    if (!isReady) return

    const handleInteract = (e: KeyboardEvent) => {
      const state = useRioMundoStore.getState()
      if (state.portal.phase !== 'closed') {
        // If portal is open and user presses Escape, close it
        if (e.key === 'Escape' && state.portal.phase === 'open') {
          e.preventDefault()
          const store = useRioMundoStore.getState()
          store.setPortalPhase('exiting')
          store.setCamaraZoom(1)
          // After exit animation
          setTimeout(() => {
            store.setPortalPhase('closed')
            store.setJugadorAnimacion('idle')
          }, 500)
        }
        return
      }

      if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
        const portalZone = checkPortalProximity()
        if (portalZone !== null) {
          e.preventDefault()
          const store = useRioMundoStore.getState()
          const tributary = store.tributaries.find(t => t.zoneNumero === portalZone)
          if (tributary && tributary.estado === 'fluyendo') {
            // Open portal — zoom in and show A2UI
            store.openPortal(portalZone, tributary.moduloUuid || '', 2.0)
            store.setJugadorAnimacion('interactuando')
            store.setBeeState('talking')

            if (dialogRef.current) {
              dialogRef.current.showBeeMessage(`Entrando a ${tributary.name || `Zona ${portalZone}`}...`, 2000)
            }
            if (beeSpeak) {
              beeSpeak(`Entrando a zona ${portalZone}`)
            }

            // Transition to open after zoom animation
            setTimeout(() => {
              store.setPortalPhase('open')

              // Set zone as current
              store.setZonaActual(portalZone)

              // Request A2UI content for this zone
              const bridge = (useRioMundoStore.getState() as any)._rioBridge as import('./protocol/RioA2UIBridge').RioA2UIBridge | null
              if (bridge) {
                bridge.enviarInteraccionZona(portalZone, 'entrar')
              }
            }, 600)
          }
        }
      }
    }

    window.addEventListener('keydown', handleInteract)
    return () => window.removeEventListener('keydown', handleInteract)
  }, [isReady, checkPortalProximity, beeSpeak])

  // Handle portal answer
  const handlePortalAnswer = useCallback((respuesta: any) => {
    const store = useRioMundoStore.getState()
    const { sessionId, alumnoId, programaUuid, zonaActual } = store

    // Send answer via A2UI bridge
    const bridge = (useRioMundoStore.getState() as any)._rioBridge as import('./protocol/RioA2UIBridge').RioA2UIBridge | null
    if (bridge && programaUuid) {
      bridge.enviarRespuesta(
        programaUuid,
        `zona-${zonaActual}`,
        respuesta,
        1,
      )
    }
  }, [])

  // Handle portal close
  const handlePortalClose = useCallback(() => {
    const store = useRioMundoStore.getState()
    store.setPortalPhase('exiting')
    store.setCamaraZoom(1)
    store.setBeeState('following')

    setTimeout(() => {
      store.setPortalPhase('closed')
      store.setJugadorAnimacion('idle')
    }, 500)
  }, [])

  // ─── Camera zoom for portal ──────────────────────────────────────────────────

  // ─── Sync agentStatuses → swarm bees ────────────────────────────────────────

  const agentStatuses = useRioMundoStore(s => s.agentStatuses)

  useEffect(() => {
    if (!swarmBeesRef.current) return
    for (const [agentId, status] of Object.entries(agentStatuses)) {
      swarmBeesRef.current.updateAgentStatus(agentId, status)
    }
  }, [agentStatuses])

  useEffect(() => {
    if (!isReady) return
    const store = useRioMundoStore.getState()
    const am = store.audioManager

    if (store.portal.phase === 'entering' || store.portal.phase === 'open') {
      // Zoom in to portal location
      store.setCamaraZoom(store.portal.zoomTarget)
      store.setBeeState('talking')
      // Tension music for portal
      am?.crossfadeMusic('worldTension', 1000)
    } else if (store.portal.phase === 'exiting' || store.portal.phase === 'closed') {
      store.setCamaraZoom(1)
      store.setBeeState('following')
      // Back to peaceful
      am?.crossfadeMusic('worldPeaceful', 1500)
    }
  }, [portal.phase, isReady])

  return (
    <div className="relative w-full h-screen overflow-hidden" ref={containerRef}>
      {/* BeeLoader — bloquea hasta que audio esté listo */}
      {useRioMundoStore(s => s.beeLoaderVisible) && <BeeLoader />}

      {/* HUD overlay */}
      {mundoListo && loginPhase === 'in_world' && <RioHUD />}

      {/* Tutorial hints for first-time interactions */}
      {loginPhase === 'in_world' && <RioTutorialHints />}

      {/* Portal proximity indicator */}
      <PortalProximityIndicator />

      {/* Portal overlay */}
      {(portal.phase === 'entering' || portal.phase === 'open') && (
        <PortalOverlay
          onClose={handlePortalClose}
          onAnswer={handlePortalAnswer}
        />
      )}

      {/* Welcome overlay - pantalla de bienvenida estilo juego */}
      {showWelcome && (
        <RioWelcomeOverlay
          onStart={() => {
            setShowWelcome(false)
            setShowLogin(true)
            useRioMundoStore.getState().setLoginPhase('nickname_input')
          }}
          onContinue={() => {
            setShowWelcome(false)
            useRioMundoStore.getState().setLoginPhase('restoring_session')
          }}
        />
      )}

      {/* Login overlay */}
      {showLogin && (loginPhase === 'nickname_input' || loginPhase === 'avatar_select' || loginPhase === 'loading' || loginPhase === 'restoring_session') && (
        <RioLogin />
      )}

      {/* Onboarding chat overlay */}
      {showOnboarding && loginPhase === 'onboarding_chat' && (
        <RioOnboardingChat
          controller={onboardingRef.current}
          onComplete={handleOnboardingComplete}
        />
      )}

      {/* Swarm Tour Skip Button */}
      {showTourSkip && (
        <div className="absolute top-4 left-4 z-50 pointer-events-auto">
          <button
            onClick={() => {
              tourRef.current.skip()
              setShowTourSkip(false)
            }}
            className="px-4 py-2 bg-[#1a1f3a]/80 backdrop-blur-sm border border-[#fbbf24]/30 text-[#fbbf24] hover:bg-[#1a1f3a] rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
          >
            Saltar Tour
          </button>
        </div>
      )}
    </div>
  )
}