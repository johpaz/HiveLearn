/**
 * HeroMiniWorld.tsx — Componente React del mini-mundo PixiJS en el Hero
 *
 * Renderiza un canvas PixiJS con 3 islas flotantes representando
 * Bun, Gemma 4 y PixiJS. Reemplaza al SwarmVisual anterior.
 */

import React, { useEffect, useRef, useState } from 'react'
import { initHeroMiniWorld, type HeroMiniWorldEngine } from './heroMiniWorldEngine'

export function HeroMiniWorld() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<HeroMiniWorldEngine | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current) return

    let mounted = true

    const init = async () => {
      try {
        const engine = await initHeroMiniWorld(containerRef.current!)
        if (mounted) {
          engineRef.current = engine
          setIsLoading(false)
        } else {
          engine.destroy()
        }
      } catch (err) {
        console.error('Error initializing HeroMiniWorld:', err)
        if (mounted) setIsLoading(false)
      }
    }

    init()

    return () => {
      mounted = false
      if (engineRef.current) {
        engineRef.current.destroy()
        engineRef.current = null
      }
    }
  }, [])

  return (
    <div className="relative w-full h-[400px] lg:h-[600px] flex items-center justify-center">
      {/* Contenedor del mini-mundo */}
      <div
        className="relative flex items-center justify-center"
        style={{
          height: '85%',
          aspectRatio: '1.1547',
        }}
      >
        {/* Canvas container */}
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center"
        />

        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-3 border-hive-amber/30 border-t-hive-amber rounded-full animate-spin mx-auto" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                Cargando mundo...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
