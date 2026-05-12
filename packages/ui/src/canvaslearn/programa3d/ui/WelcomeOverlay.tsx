import { useState, useEffect } from 'react'

interface WelcomeOverlayProps {
  onStart: () => void
  onContinue?: () => void
}

export function WelcomeOverlay({ onStart, onContinue }: WelcomeOverlayProps) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className={`absolute inset-0 z-40 flex flex-col items-center justify-center transition-opacity duration-1000 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(10,14,39,0.6) 75%, rgba(10,14,39,0.92) 100%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center px-4 pointer-events-auto">
        <p className="text-[#fbbf24]/80 text-xs uppercase tracking-[0.4em] mb-3 font-bold">
          La Colmena del Saber
        </p>

        <h1
          className="text-7xl md:text-9xl font-black text-center tracking-tight mb-4"
          style={{
            background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 6px 18px rgba(245, 158, 11, 0.5))',
          }}
        >
          HiveLearn
        </h1>

        <p className="text-[#fbbf24]/90 text-sm md:text-base text-center mb-12 max-w-md">
          Aprende con tu enjambre de agentes IA en un mundo creado para ti
        </p>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onStart}
            className="group relative px-12 py-4 bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] rounded-2xl text-[#0a0e27] font-black text-lg uppercase tracking-widest transition-all hover:scale-105 hover:shadow-[0_0_50px_rgba(245,158,11,0.6)] active:scale-95"
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">🎮</span>
              Iniciar Aventura
            </span>
            <span className="absolute inset-0 rounded-2xl bg-[#fbbf24] animate-ping opacity-20 pointer-events-none" />
          </button>

          {onContinue && (
            <button
              onClick={onContinue}
              className="px-8 py-3 bg-green-400/10 border-2 border-green-400/40 rounded-xl text-green-400 font-semibold text-sm transition-all hover:bg-green-400/20 hover:border-green-400 hover:scale-105"
            >
              📖 Continuar Aventura
            </button>
          )}
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-2 opacity-60">
          <Badge>🥟 Bun</Badge>
          <Badge>💎 Gemma</Badge>
          <Badge>🧊 Three.js</Badge>
          <Badge>🌎 Latam</Badge>
        </div>
      </div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 text-[10px] uppercase tracking-wider text-white/70">
      {children}
    </span>
  )
}
