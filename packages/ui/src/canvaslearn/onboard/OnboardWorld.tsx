import React, { useEffect, useRef, useState } from 'react'
import { initOnboardWorld, type OnboardWorldEngine } from './onboardWorldEngine'

export interface OnboardData {
  nombre: string
  nickname: string
  edad: number
}

interface Props {
  onComplete: (data: OnboardData) => void
}

const STEPS = [
  { key: 'nombre' as const,   label: 'Tu nombre',    placeholder: 'Ej. María, Juan...', type: 'text'   },
  { key: 'nickname' as const, label: 'Tu apodo',     placeholder: 'Ej. Chispas, Turbo...', type: 'text' },
  { key: 'edad' as const,     label: 'Tu edad',      placeholder: 'Ej. 12',             type: 'number' },
]

export function OnboardWorld({ onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef    = useRef<OnboardWorldEngine | null>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const [step,      setStep]      = useState(0)
  const [values,    setValues]    = useState({ nombre: '', nickname: '', edad: '' })
  const [value,     setValue]     = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(true)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    let mounted = true
    initOnboardWorld(containerRef.current).then(engine => {
      if (!mounted) { engine.destroy(); return }
      engineRef.current = engine
      setLoading(false)
    })
    return () => {
      mounted = false
      engineRef.current?.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!loading) setTimeout(() => inputRef.current?.focus(), 120)
  }, [loading, step])

  const current = STEPS[step]

  const handleNext = () => {
    const trimmed = value.trim()
    if (!trimmed) { setError('Este campo es obligatorio'); return }

    if (current.key === 'edad') {
      const n = parseInt(trimmed, 10)
      if (isNaN(n) || n < 3 || n > 120) {
        setError('Ingresa una edad válida (3–120)')
        return
      }
    }
    setError('')

    const newValues = { ...values, [current.key]: trimmed }
    setValues(newValues)

    if (step < STEPS.length - 1) {
      engineRef.current?.celebrate()
      setTimeout(() => {
        setStep(s => s + 1)
        setValue('')
        engineRef.current?.setStep(step + 1)
      }, 420)
    } else {
      setFinishing(true)
      engineRef.current?.triggerComplete()
      setTimeout(() => {
        onComplete({
          nombre:   newValues.nombre,
          nickname: newValues.nickname,
          edad:     parseInt(newValues.edad, 10),
        })
      }, 1500)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNext()
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0e27]">
      {/* Pixi canvas — fondo decorativo */}
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center"
      />

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mx-auto" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/40">
              Inicializando mundo...
            </p>
          </div>
        </div>
      )}

      {/* Formulario overlay */}
      {!loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 pointer-events-none">
          <div
            className={`pointer-events-auto w-full max-w-xs px-4 transition-all duration-500 ${
              finishing ? 'opacity-0 translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'
            }`}
          >
            <div className="bg-[#111827]/92 border border-amber-500/30 rounded-2xl p-6 backdrop-blur-sm shadow-[0_0_48px_rgba(245,158,11,0.07)]">

              {/* Step label */}
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-400/55 mb-1.5">
                Paso {step + 1} de {STEPS.length}
              </p>
              <p className="text-sm font-bold text-white/88 mb-4">{current.label}</p>

              {/* Input */}
              <input
                ref={inputRef}
                type={current.type}
                value={value}
                onChange={e => { setValue(e.target.value); setError('') }}
                onKeyDown={handleKey}
                placeholder={current.placeholder}
                min={current.key === 'edad' ? 3 : undefined}
                max={current.key === 'edad' ? 120 : undefined}
                disabled={finishing}
                className="w-full bg-[#0a0e27]/80 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-400/60 transition-colors font-medium"
              />

              {error && (
                <p className="text-[10px] text-red-400/90 mt-2 font-semibold">{error}</p>
              )}

              {/* Botón continuar */}
              <button
                onClick={handleNext}
                disabled={!value.trim() || finishing}
                className="mt-4 w-full bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:bg-amber-900/40 disabled:text-amber-700 text-black font-black text-sm rounded-xl py-3 transition-all"
              >
                {step < STEPS.length - 1 ? 'Continuar →' : '¡Listo! Entrar al mundo →'}
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
