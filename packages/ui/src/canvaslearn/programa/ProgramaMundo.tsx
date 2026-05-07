import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Application } from 'pixi.js'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { IsometricRenderer } from '../rio/renderer/IsometricRenderer'
import { RioCamera } from '../rio/camera/RioCamera'
import { RioPlayer } from '../rio/player/RioPlayer'
import { RioBee } from '../rio/bee/RioBee'
import { RioDialog } from '../rio/dialog/RioDialog'
import { ISO_CONFIG, type IsoMap } from '../rio/types'
import { loadTiledMap, buildDefaultProgramaMap } from './world/TiledMapLoader'

const PROGRAMA_MAP_URL = '/canvaslearn/maps/programa.tmj'
const BEE_ANCHOR = { x: 8, y: 7 }
const PROXIMITY_RADIUS = 2.2

interface ProgramaMundoProps {
  onReady?: (refs: {
    bee: RioBee
    dialog: RioDialog
    renderer: IsometricRenderer
  }) => void
  onMapError?: (msg: string) => void
}

export function ProgramaMundo({ onReady, onMapError }: ProgramaMundoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const rendererRef = useRef<IsometricRenderer | null>(null)
  const cameraRef = useRef<RioCamera | null>(null)
  const playerRef = useRef<RioPlayer | null>(null)
  const beeRef = useRef<RioBee | null>(null)
  const dialogRef = useRef<RioDialog | null>(null)
  const mapRef = useRef<IsoMap | null>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const [isReady, setIsReady] = useState(false)
  const onReadyRef = useRef(onReady)
  const onMapErrorRef = useRef(onMapError)

  useEffect(() => { onReadyRef.current = onReady }, [onReady])
  useEffect(() => { onMapErrorRef.current = onMapError }, [onMapError])

  const setJugadorPosicion = useRioMundoStore(s => s.setJugadorPosicion)
  const setJugadorDireccion = useRioMundoStore(s => s.setJugadorDireccion)
  const setJugadorAnimacion = useRioMundoStore(s => s.setJugadorAnimacion)
  const setBeePosicion = useRioMundoStore(s => s.setBeePosicion)

  // ─── Init Pixi ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || appRef.current) return

    const app = new Application()
    let cancelled = false

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

      // Load map (TMJ → fallback to default)
      let mapa: IsoMap
      try {
        mapa = await loadTiledMap(PROGRAMA_MAP_URL)
      } catch (err) {
        console.warn('[ProgramaMundo] TMJ load failed, using default map:', (err as Error).message)
        onMapErrorRef.current?.((err as Error).message)
        mapa = buildDefaultProgramaMap()
      }
      mapRef.current = mapa

      // Renderer
      const renderer = new IsometricRenderer(app)
      rendererRef.current = renderer
      renderer.setMap(mapa)

      // Camera (zoom íntimo 1.6)
      const spawnScreen = renderer.isoToScreen(mapa.spawn.x, mapa.spawn.y)
      const camera = new RioCamera(app, {
        x: spawnScreen.x,
        y: spawnScreen.y,
        zoom: 1.6,
        smoothing: ISO_CONFIG.CAMERA_SMOOTHING,
        bounds: { minX: -2000, minY: -1500, maxX: 2000, maxY: 1500 },
      })
      cameraRef.current = camera

      const worldContainer = camera.getContainer()
      worldContainer.addChild(renderer.getMapContainer())
      worldContainer.addChild(renderer.getEntityContainer())
      worldContainer.addChild(renderer.getOverlayContainer())

      // Player at spawn
      const player = new RioPlayer(app, renderer, camera)
      playerRef.current = player
      setJugadorPosicion(mapa.spawn.x, mapa.spawn.y)

      // Bee anchored above the path
      const bee = new RioBee(app, renderer, camera)
      beeRef.current = bee
      // Force bee initial position via flyTo so she appears immediately at her anchor
      bee.flyTo(BEE_ANCHOR.x, BEE_ANCHOR.y)
      setBeePosicion(BEE_ANCHOR.x, BEE_ANCHOR.y)

      // Dialog
      const dialog = new RioDialog(app, renderer)
      dialogRef.current = dialog

      setIsReady(true)
      onReadyRef.current?.({ bee, dialog, renderer })
    })

    return () => {
      cancelled = true
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
    }
  }, [setJugadorPosicion, setBeePosicion])

  // ─── Keyboard ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())
      if (e.key === 'Shift') setJugadorAnimacion('correr')
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
      const map = mapRef.current

      // Player movement (WASD/arrows)
      if (playerRef.current && map) {
        const keys = keysRef.current
        let dx = 0, dy = 0
        if (keys.has('w') || keys.has('arrowup')) dy -= 1
        if (keys.has('s') || keys.has('arrowdown')) dy += 1
        if (keys.has('a') || keys.has('arrowleft')) dx -= 1
        if (keys.has('d') || keys.has('arrowright')) dx += 1

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
          if (isWalkable(candidateX, candidateY)) {
            newX = candidateX; newY = candidateY
          } else if (isWalkable(candidateX, state.jugador.y)) {
            newX = candidateX
          } else if (isWalkable(state.jugador.x, candidateY)) {
            newY = candidateY
          } else {
            blocked = true
          }

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
      }

      // Camera follow player
      if (cameraRef.current && rendererRef.current) {
        const screenPos = rendererRef.current.isoToScreen(state.jugador.x, state.jugador.y)
        cameraRef.current.setTarget(screenPos.x, screenPos.y)
        cameraRef.current.setZoom(state.camara.targetZoom || 1.6)
        cameraRef.current.update(dt)
      }

      // Player render
      playerRef.current?.update(state.jugador, dt)

      // Bee render
      if (beeRef.current) {
        beeRef.current.update(state.jugador, state.beeState, dt, time)
        const beePos = beeRef.current.getPosition()
        if (beePos.x !== 0 || beePos.y !== 0) {
          setBeePosicion(beePos.x, beePos.y)
        }
      }

      // Dialog bubbles
      dialogRef.current?.update(dt)
    }

    app.ticker.add(loop)
    return () => { app.ticker.remove(loop) }
  }, [isReady, setJugadorAnimacion, setJugadorDireccion, setJugadorPosicion, setBeePosicion])

  return <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden" />
}
