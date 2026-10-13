import { useEffect, useRef, useState } from 'react'
import type { HiveScene } from '../scene/HiveScene'

/** Fondo WebGL. Si WebGL no está disponible deja un degradado CSS (`.hive-canvas--fallback`). */
export function HiveCanvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let scene: HiveScene | null = null
    let cancelled = false
    let observer: ResizeObserver | null = null
    const onMove = (event: PointerEvent) => scene?.setPointer((event.clientX / window.innerWidth) * 2 - 1, -((event.clientY / window.innerHeight) * 2 - 1))

    // three.js se carga aparte: la portada pinta su texto antes de que llegue el motor 3D.
    import('../scene/HiveScene').then(({ HiveScene }) => {
      if (cancelled) return
      try {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        scene = new HiveScene(canvas, { reducedMotion })
        const fit = () => scene?.resize(canvas.clientWidth, canvas.clientHeight)
        observer = new ResizeObserver(fit)
        observer.observe(canvas)
        fit()
        scene.start()
        window.addEventListener('pointermove', onMove, { passive: true })
      } catch {
        setFailed(true)
      }
    }).catch(() => setFailed(true))

    return () => {
      cancelled = true
      window.removeEventListener('pointermove', onMove)
      observer?.disconnect()
      scene?.dispose()
    }
  }, [])

  return (
    <div className={`hive-canvas ${failed ? 'hive-canvas--fallback' : ''} ${className}`} aria-hidden="true">
      {!failed && <canvas ref={canvasRef} />}
    </div>
  )
}
