/**
 * usePixiApp - Hook para gestionar el ciclo de vida de PixiJS Application
 * Sigue las mejores prácticas de PixiJS v8 para React
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { Application, Assets } from 'pixi.js'
import type { ApplicationOptions } from 'pixi.js'

export interface UsePixiAppOptions extends Partial<ApplicationOptions> {
  width?: number
  height?: number
  backgroundColor?: number
  antialias?: boolean
  resolution?: number
  autoStart?: boolean
}

export interface UsePixiAppReturn {
  app: Application | null
  canvas: HTMLCanvasElement | null
  isReady: boolean
  error: Error | null
}

/**
 * Hook personalizado para crear y gestionar una aplicación PixiJS
 * 
 * @param options - Configuración de la aplicación PixiJS
 * @returns Objeto con la aplicación, canvas, estado y errores
 */
export function usePixiApp(options: UsePixiAppOptions = {}): UsePixiAppReturn {
  const appRef = useRef<Application | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const {
    width = 800,
    height = 600,
    backgroundColor = 0x000000,
    antialias = true,
    resolution = window.devicePixelRatio || 1,
    autoStart = true,
    ...pixiOptions
  } = options

  // Cleanup function para destruir la aplicación
  const cleanup = useCallback(() => {
    if (appRef.current) {
      appRef.current.destroy(true)
      appRef.current = null
      canvasRef.current = null
      setIsReady(false)
    }
  }, [])

  // Crear la aplicación PixiJS
  useEffect(() => {
    let mounted = true

    const initApp = async () => {
      try {
        // Crear nueva aplicación PixiJS
        const app = new Application()

        // Inicializar con configuración
        await app.init({
          width,
          height,
          background: backgroundColor,
          antialias,
          resolution,
          autoStart,
          eventMode: 'static', // Habilitar eventos por defecto
          eventFeatures: {
            click: true,
            move: true,
            wheel: true,
            globalMove: true,
          },
          ...pixiOptions,
        })

        if (!mounted) {
          app.destroy(true)
          return
        }

        // Guardar referencias
        appRef.current = app
        canvasRef.current = app.canvas as HTMLCanvasElement

        // Marcar como lista
        setIsReady(true)

        // Añadir el canvas al DOM si existe un contenedor
        const container = document.getElementById('pixi-container')
        if (container && canvasRef.current) {
          container.appendChild(canvasRef.current)
        }

      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to initialize PixiJS'))
        }
      }
    }

    initApp()

    return () => {
      mounted = false
      cleanup()
    }
  }, [
    width,
    height,
    backgroundColor,
    antialias,
    resolution,
    autoStart,
    cleanup,
    pixiOptions,
  ])

  // Exponer método para obtener la aplicación
  const getApp = useCallback(() => appRef.current, [])

  // Exponer método para obtener el stage
  const getStage = useCallback(() => appRef.current?.stage, [])

  // Exponer método para obtener el renderer
  const getRenderer = useCallback(() => appRef.current?.renderer, [])

  // Añadir métodos utilitarios al objeto de retorno si es necesario
  useEffect(() => {
    if (appRef.current) {
      // Añadir métodos al objeto app para acceso externo
      ;(appRef.current as any).getStage = getStage
      ;(appRef.current as any).getRenderer = getRenderer
    }
  }, [getStage, getRenderer])

  return {
    app: appRef.current,
    canvas: canvasRef.current,
    isReady,
    error,
  }
}

/**
 * Hook para cargar assets de PixiJS
 * 
 * @param assets - Lista de assets para cargar
 * @returns Estado de carga y assets cargados
 */
export function usePixiAssets(assets: Array<{ alias: string; src: string }>) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true

    const loadAssets = async () => {
      try {
        // Configurar carga de assets
        Assets.onProgress?.add((p) => {
          if (mounted) setProgress(p)
        })

        // Cargar todos los assets
        await Assets.load(assets.map(a => a.src))

        if (mounted) {
          setIsLoaded(true)
          setProgress(1)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to load assets'))
        }
      }
    }

    if (assets.length > 0) {
      loadAssets()
    } else {
      setIsLoaded(true)
    }

    return () => {
      mounted = false
    }
  }, [assets])

  return { isLoaded, progress, error }
}
