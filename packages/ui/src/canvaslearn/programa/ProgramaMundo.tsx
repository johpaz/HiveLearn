import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Application } from 'pixi.js'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { IsometricRenderer } from '../rio/renderer/IsometricRenderer'
import { RioCamera } from '../rio/camera/RioCamera'
import { RioPlayer } from '../rio/player/RioPlayer'
import { RioBee } from '../rio/bee/RioBee'
import { RioDialog } from '../rio/dialog/RioDialog'
import { RioEntryAnimation } from '../rio/effects/EntryAnimation'
import { RioLoadingScene } from '../rio/scenes/RioLoadingScene'
import { AudioManager } from '../rio/audio/AudioManager'
import { ISO_CONFIG } from '../rio/types'
import { loadProgramaMap, buildDefaultProgramaMap } from './world/TiledMapLoader'
import { SpiritCardSpawner } from './cards/SpiritCardSpawner'

const PROGRAMA_MAP_URL = '/canvaslearn/maps/programa.tmj'
const BEE_PROXIMITY = 2.5

export type ProgramaMode = 'welcome' | 'free' | 'capturing'

export interface ProgramaMundoRefs {
  bee: RioBee
  dialog: RioDialog
  renderer: IsometricRenderer
  cardSpawner: SpiritCardSpawner
  beeAnchor: { x: number; y: number }
  worldToScreen: (isoX: number, isoY: number) => { x: number; y: number }
}

interface ProgramaMundoProps {
  mode: ProgramaMode
  onReady?: (refs: ProgramaMundoRefs) => void
  onInteract?: () => void
  onMapError?: (msg: string) => void
}

export function ProgramaMundo({ mode, onReady, onInteract, onMapError }: ProgramaMundoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const rendererRef = useRef<IsometricRenderer | null>(null)
  const cameraRef = useRef<RioCamera | null>(null)
  const playerRef = useRef<RioPlayer | null>(null)
  const beeRef = useRef<RioBee | null>(null)
  const dialogRef = useRef<RioDialog | null>(null)
  const entryAnimRef = useRef<RioEntryAnimation | null>(null)
  const loadingSceneRef = useRef<RioLoadingScene | null>(null)
  const audioManagerRef = useRef<AudioManager | null>(null)
  const cardSpawnerRef = useRef<SpiritCardSpawner | null>(null)
  const mapDataRef = useRef<ReturnType<typeof buildDefaultProgramaMap> | null>(null)
  const beeAnchorRef = useRef<{ x: number; y: number }>({ x: 8, y: 7 })
  const keysRef = useRef<Set<string>>(new Set())
  const mouseTargetRef = useRef<{ x: number; y: number } | null>(null)
  const clickHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const interactRef = useRef(onInteract)
  const modeRef = useRef<ProgramaMode>(mode)
  const cinemaCameraTimeRef = useRef(0)
  const [isReady, setIsReady] = useState(false)
  const [showLoading, setShowLoading] = useState(true)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => { interactRef.current = onInteract }, [onInteract])
  useEffect(() => { modeRef.current = mode }, [mode])

  const setJugadorPosicion = useRioMundoStore(s => s.setJugadorPosicion)
  const setJugadorDireccion = useRioMundoStore(s => s.setJugadorDireccion)
  const setJugadorAnimacion = useRioMundoStore(s => s.setJugadorAnimacion)
  const setBeePosicion = useRioMundoStore(s => s.setBeePosicion)
  const setCamaraTarget = useRioMundoStore(s => s.setCamaraTarget)

  // ─── worldToScreen helper ────────────────────────────────────────────────────

  const worldToScreen = useCallback((isoX: number, isoY: number): { x: number; y: number } => {
    const renderer = rendererRef.current
    const camera = cameraRef.current
    const app = appRef.current
    if (!renderer || !camera || !app) return { x: 0, y: 0 }
    const w = renderer.isoToScreen(isoX, isoY)
    const cam = camera.getPosition()
    const zoom = camera.getZoom()
    const cx = app.screen.width / 2
    const cy = app.screen.height / 2
    return {
      x: cx + (w.x - cam.x) * zoom,
      y: cy + (w.y - cam.y) * zoom,
    }
  }, [])

  // ─── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || appRef.current) return
    let cancelled = false

    const app = new Application()
    app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      background: 0x0a0e27,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      powerPreference: 'high-performance',
    }).then(async () => {
      if (cancelled || !containerRef.current) return
      const canvas = app.canvas as HTMLCanvasElement
      canvas.style.display = 'block'
      canvas.style.position = 'absolute'
      canvas.style.top = '0'
      canvas.style.left = '0'
      containerRef.current.appendChild(canvas)
      appRef.current = app

      const loadingScene = new RioLoadingScene(app)
      loadingSceneRef.current = loadingScene
      loadingScene.setProgress(0.05)

      const store = useRioMundoStore.getState()
      let audioManager = store.audioManager
      if (!audioManager) {
        audioManager = new AudioManager()
        store.setAudioManager(audioManager)
      }
      audioManagerRef.current = audioManager

      const initialSettings = {
        musicVolume: store.audioSettings.musicVolume / 100,
        sfxVolume: store.audioSettings.sfxVolume / 100,
        musicMuted: store.audioSettings.musicMuted,
        sfxMuted: store.audioSettings.sfxMuted,
      }
      audioManager.init(initialSettings).then(async () => {
        try {
          await audioManager!.preloadAssets({
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
        } catch {}
        store.setAudioReady(true)
      })

      loadingScene.setProgress(0.2)

      let mapData: ReturnType<typeof buildDefaultProgramaMap>
      try {
        mapData = await loadProgramaMap(PROGRAMA_MAP_URL)
      } catch (err) {
        console.warn('[ProgramaMundo] TMJ load failed:', (err as Error).message)
        onMapError?.((err as Error).message)
        mapData = buildDefaultProgramaMap()
      }
      mapDataRef.current = mapData
      beeAnchorRef.current = mapData.beeAnchor
      loadingScene.setProgress(0.4)

      const renderer = new IsometricRenderer(app)
      rendererRef.current = renderer
      renderer.setMap(mapData.map)
      loadingScene.setProgress(0.6)

      // Cámara inicial: en welcome arranca centrada en bee con zoom amplio para barrido cinemático
      const initialFocus = modeRef.current === 'welcome' ? mapData.beeAnchor : mapData.map.spawn
      const focusScreen = renderer.isoToScreen(initialFocus.x, initialFocus.y)
      const camera = new RioCamera(app, {
        x: focusScreen.x,
        y: focusScreen.y,
        zoom: modeRef.current === 'welcome' ? 1.4 : 1.6,
        smoothing: ISO_CONFIG.CAMERA_SMOOTHING,
        bounds: { minX: -2000, minY: -1500, maxX: 2000, maxY: 1500 },
      })
      cameraRef.current = camera

      const worldContainer = camera.getContainer()
      worldContainer.addChild(renderer.getMapContainer())
      worldContainer.addChild(renderer.getEntityContainer())
      worldContainer.addChild(renderer.getOverlayContainer())
      loadingScene.setProgress(0.75)

      const player = new RioPlayer(app, renderer, camera)
      playerRef.current = player
      setJugadorPosicion(mapData.map.spawn.x, mapData.map.spawn.y)

      const bee = new RioBee(app, renderer, camera)
      beeRef.current = bee
      bee.flyTo(mapData.beeAnchor.x, mapData.beeAnchor.y)
      setBeePosicion(mapData.beeAnchor.x, mapData.beeAnchor.y)
      useRioMundoStore.getState().setBeeState(modeRef.current === 'welcome' ? 'celebrating' : 'idle')

      const dialog = new RioDialog(app, renderer)
      dialogRef.current = dialog

      const cardSpawner = new SpiritCardSpawner(app, renderer)
      cardSpawnerRef.current = cardSpawner

      loadingScene.setProgress(0.9)

      // Entry animation solo si NO es welcome (welcome tiene su propio barrido)
      if (modeRef.current !== 'welcome') {
        const entryAnim = new RioEntryAnimation(app, renderer, camera, mapData.map.spawn.x, mapData.map.spawn.y)
        entryAnimRef.current = entryAnim
        entryAnim.start(undefined, player, bee)
        entryAnim.setOnComplete(() => {
          entryAnim.destroy()
          entryAnimRef.current = null
        })
      } else {
        // En welcome, ocultar al jugador (lo ponemos lejos del foco)
        player.update(useRioMundoStore.getState().jugador, 0)
      }

      loadingScene.setProgress(1)
      loadingScene.setOnComplete(() => {
        loadingScene.destroy()
        loadingSceneRef.current = null
        setShowLoading(false)
        audioManager?.crossfadeMusic(modeRef.current === 'welcome' ? 'titleMusic' : 'worldPeaceful', 1800).catch(() => {})
        setIsReady(true)
        onReady?.({
          bee,
          dialog,
          renderer,
          cardSpawner,
          beeAnchor: mapData.beeAnchor,
          worldToScreen,
        })
      })
    })

    return () => {
      cancelled = true
      cardSpawnerRef.current?.destroy()
      loadingSceneRef.current?.destroy()
      entryAnimRef.current?.destroy()
      dialogRef.current?.destroy()
      beeRef.current?.destroy()
      playerRef.current?.destroy()
      cameraRef.current?.destroy()
      rendererRef.current?.destroy()
      appRef.current?.destroy(true)
      appRef.current = null
      rendererRef.current = null
      cameraRef.current = null
      playerRef.current = null
      beeRef.current = null
      dialogRef.current = null
      cardSpawnerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Keyboard ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const m = modeRef.current
      if (m === 'capturing' || m === 'welcome') return
      keysRef.current.add(e.key.toLowerCase())
      if (e.key === 'Shift') setJugadorAnimacion('correr')
      if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
        // Prioridad: card cercana > bee
        const spawner = cardSpawnerRef.current
        if (spawner?.hasCards() && spawner.selectNearest()) return
        const state = useRioMundoStore.getState()
        const anchor = beeAnchorRef.current
        const dist = Math.hypot(state.jugador.x - anchor.x, state.jugador.y - anchor.y)
        if (dist <= BEE_PROXIMITY) {
          interactRef.current?.()
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
      if (e.key === 'Shift') setJugadorAnimacion('caminar')
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [setJugadorAnimacion])

  // ─── Click-to-move ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady) return
    const handleClick = (e: MouseEvent) => {
      const m = modeRef.current
      if (m === 'capturing' || m === 'welcome') return
      const renderer = rendererRef.current
      const camera = cameraRef.current
      const map = mapDataRef.current?.map
      const canvas = appRef.current?.canvas
      if (!renderer || !camera || !map || !canvas) return

      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const wp = camera.screenToWorld(sx, sy)
      const iso = renderer.screenToIso(wp.x, wp.y)
      const tx = Math.round(iso.x)
      const ty = Math.round(iso.y)
      const tile = map.tiles[ty]?.[tx]
      if (tile && tile.walkable) {
        mouseTargetRef.current = { x: tx, y: ty }
      }
    }
    const canvas = appRef.current?.canvas
    if (!canvas) return
    if (clickHandlerRef.current) canvas.removeEventListener('click', clickHandlerRef.current)
    clickHandlerRef.current = handleClick
    canvas.addEventListener('click', handleClick)
    return () => {
      canvas.removeEventListener('click', handleClick)
      if (clickHandlerRef.current === handleClick) clickHandlerRef.current = null
    }
  }, [isReady])

  // ─── Resize ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onResize = () => {
      appRef.current?.renderer.resize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ─── Game loop ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !appRef.current) return
    const app = appRef.current

    const loop = (ticker: any) => {
      const dt = ticker.deltaTime / 60
      const time = ticker.lastTime
      const state = useRioMundoStore.getState()
      const map = mapDataRef.current?.map
      const m = modeRef.current

      // Player movement (sólo en modo free)
      if (playerRef.current && map && m === 'free') {
        const keys = keysRef.current
        let dx = 0, dy = 0
        if (keys.has('w') || keys.has('arrowup')) dy -= 1
        if (keys.has('s') || keys.has('arrowdown')) dy += 1
        if (keys.has('a') || keys.has('arrowleft')) dx -= 1
        if (keys.has('d') || keys.has('arrowright')) dx += 1

        const target = mouseTargetRef.current
        if (target && dx === 0 && dy === 0) {
          const diffX = target.x - state.jugador.x
          const diffY = target.y - state.jugador.y
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

        if (dx !== 0 || dy !== 0) {
          const speed = state.jugador.animation === 'correr'
            ? ISO_CONFIG.PLAYER_RUN_SPEED
            : ISO_CONFIG.PLAYER_SPEED
          const candidateX = state.jugador.x + dx * speed * dt
          const candidateY = state.jugador.y + dy * speed * dt

          const isWalkable = (x: number, y: number) => {
            const tx = Math.round(x), ty = Math.round(y)
            return !!map.tiles[ty]?.[tx]?.walkable
          }

          let newX = state.jugador.x, newY = state.jugador.y, blocked = false
          if (isWalkable(candidateX, candidateY)) { newX = candidateX; newY = candidateY }
          else if (isWalkable(candidateX, state.jugador.y)) newX = candidateX
          else if (isWalkable(state.jugador.x, candidateY)) newY = candidateY
          else { blocked = true; mouseTargetRef.current = null }

          if (Math.abs(dx) > Math.abs(dy)) {
            setJugadorDireccion(dx > 0 ? 'e' : 'w')
          } else if (dy !== 0) {
            if (dx === 0) setJugadorDireccion(dy > 0 ? 's' : 'n')
            else if (dx > 0) setJugadorDireccion(dy > 0 ? 'se' : 'ne')
            else setJugadorDireccion(dy > 0 ? 'sw' : 'nw')
          }

          if (blocked) {
            if (state.jugador.animation !== 'idle') setJugadorAnimacion('idle')
          } else {
            setJugadorPosicion(newX, newY)
            setJugadorAnimacion(state.jugador.animation === 'correr' ? 'correr' : 'caminar')
          }
        } else if (state.jugador.animation === 'caminar' || state.jugador.animation === 'correr') {
          setJugadorAnimacion('idle')
        }
      } else if ((m === 'capturing' || m === 'welcome') && state.jugador.animation !== 'idle') {
        setJugadorAnimacion('idle')
      }

      // Camera
      if (cameraRef.current && rendererRef.current) {
        const camera = cameraRef.current
        if (m === 'welcome') {
          // Barrido suave alrededor de la bee
          cinemaCameraTimeRef.current += dt
          const t = cinemaCameraTimeRef.current
          const anchor = beeAnchorRef.current
          const offsetX = Math.sin(t * 0.25) * 1.5
          const offsetY = Math.cos(t * 0.18) * 0.8
          const beeScreen = rendererRef.current.isoToScreen(anchor.x + offsetX, anchor.y + offsetY)
          camera.setTarget(beeScreen.x, beeScreen.y - 30)
          camera.setZoom(1.4)
        } else {
          const screenPos = rendererRef.current.isoToScreen(state.jugador.x, state.jugador.y)
          camera.setTarget(screenPos.x, screenPos.y)
          camera.setZoom(state.camara.targetZoom || 1.6)
          setCamaraTarget(screenPos.x, screenPos.y)
        }
        camera.update(dt)
      }

      // Hide player in welcome mode
      if (playerRef.current) {
        playerRef.current.update(state.jugador, dt)
        // override visibility via container ya está dibujado; mejor manipular alpha
      }

      if (beeRef.current) {
        const bs = m === 'welcome' ? 'celebrating' : state.beeState
        beeRef.current.update(state.jugador, bs, dt, time)
        const beePos = beeRef.current.getPosition()
        if (beePos.x !== 0 || beePos.y !== 0) {
          setBeePosicion(beePos.x, beePos.y)
        }
      }

      entryAnimRef.current?.update(time)
      dialogRef.current?.update(dt)

      // Card spawner
      cardSpawnerRef.current?.update(state.jugador.x, state.jugador.y, time)

      // Hint dinámico
      if (m === 'free') {
        const spawner = cardSpawnerRef.current
        if (spawner?.hasCards() && spawner.hasNearest()) {
          const label = spawner.getNearestLabel()
          setHint(label ? `Elegir · ${label}` : null)
        } else {
          const anchor = beeAnchorRef.current
          const dist = Math.hypot(state.jugador.x - anchor.x, state.jugador.y - anchor.y)
          setHint(dist <= BEE_PROXIMITY ? 'Hablar con Abeja' : null)
        }
      } else {
        setHint(null)
      }
    }

    app.ticker.add(loop)
    return () => { app.ticker.remove(loop) }
  }, [isReady, setJugadorAnimacion, setJugadorDireccion, setJugadorPosicion, setBeePosicion, setCamaraTarget])

  // ─── Visibilidad del jugador según modo (alpha) ──────────────────────────────

  useEffect(() => {
    const player = playerRef.current as any
    if (!player) return
    // RioPlayer tiene container interno; lo manipulamos via alpha si está disponible
    const ctn = player['container']
    if (ctn) {
      ctn.alpha = mode === 'welcome' ? 0 : 1
    }
  }, [mode])

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden" />

      {/* Indicador "Presiona E" */}
      {isReady && !showLoading && hint && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-32 z-30 pointer-events-none animate-bounce">
          <div className="bg-[#fbbf24] text-[#0a0e27] px-4 py-2 rounded-full font-black text-sm shadow-2xl shadow-[#fbbf24]/50 flex items-center gap-2">
            <kbd className="px-2 py-0.5 bg-[#0a0e27] text-[#fbbf24] rounded font-mono text-xs">E</kbd>
            <span>{hint}</span>
          </div>
        </div>
      )}

      {/* Hint controles (solo modo free, sin nada más interesante) */}
      {isReady && !showLoading && mode === 'free' && !hint && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-30 pointer-events-none">
          <div className="bg-[#0a0e27]/85 backdrop-blur-sm border border-[#fbbf24]/30 rounded-xl px-4 py-2 text-[#fbbf24]/90 text-xs font-semibold flex items-center gap-2 shadow-lg">
            <kbd className="px-1.5 py-0.5 bg-[#1a1f3a] rounded font-mono">WASD</kbd>
            <span>moverse</span>
            <span className="text-[#fbbf24]/40">·</span>
            <kbd className="px-1.5 py-0.5 bg-[#1a1f3a] rounded font-mono">Shift</kbd>
            <span>correr</span>
          </div>
        </div>
      )}
    </>
  )
}
