import React, { useState, useEffect, useCallback } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'

interface RioWelcomeOverlayProps {
  onStart: () => void
  onContinue?: () => void
  onConfig?: () => void
}

// ─── Floating Pollen Particles ──────────────────────────────────────────────

function PollenParticles() {
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: 2 + Math.random() * 4,
    delay: Math.random() * 5,
    duration: 4 + Math.random() * 6,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-[#fbbf24]"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            opacity: 0.3 + Math.random() * 0.4,
            animation: `pollen-float ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Animated Character Emoji ───────────────────────────────────────────────

function AnimatedEmoji({ emoji, delay = 0, size = 'text-6xl' }: { emoji: string; delay?: number; size?: string }) {
  return (
    <div
      className={`${size} select-none`}
      style={{
        animation: `character-bounce 3s ease-in-out ${delay}s infinite`,
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
      }}
    >
      {emoji}
    </div>
  )
}

// ─── Tech Badge ─────────────────────────────────────────────────────────────

function TechBadge({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-sm border border-white/10">
      <span className="text-sm">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
        {label}
      </span>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function RioWelcomeOverlay({ onStart, onContinue, onConfig }: RioWelcomeOverlayProps) {
  const hasSavedSession = useRioMundoStore(s => !!(s.sessionId && s.programaUuid))
  const wsStatus = useRioMundoStore(s => s.wsStatus)
  const audioSettings = useRioMundoStore(s => s.audioSettings)
  const toggleMusicMuted = useRioMundoStore(s => s.toggleMusicMuted)
  const toggleSFXMuted = useRioMundoStore(s => s.toggleSFXMuted)

  const [showConfig, setShowConfig] = useState(false)
  const [isEntering, setIsEntering] = useState(false)

  // Animate entrance
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  const handleStart = useCallback(() => {
    // Iniciar música de bienvenida al primer click del usuario
    useRioMundoStore.getState().audioManager?.playMusic('titleMusic')
    setIsEntering(true)
    setTimeout(() => onStart(), 800)
  }, [onStart])

  const handleContinue = useCallback(() => {
    // Iniciar música de bienvenida al primer click del usuario
    useRioMundoStore.getState().audioManager?.playMusic('titleMusic')
    setIsEntering(true)
    setTimeout(() => onContinue?.(), 800)
  }, [onContinue])

  const wsColorMap: Record<string, string> = {
    connected: 'bg-green-400',
    connecting: 'bg-yellow-400 animate-pulse',
    disconnected: 'bg-red-400',
  }

  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center transition-all duration-1000 ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${isEntering ? 'opacity-0 scale-105' : ''}`}
    >
      {/* Dark overlay with gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e27]/70 via-[#0a0e27]/50 to-[#0a0e27]/80" />

      {/* Pollen particles */}
      <PollenParticles />

      {/* WS Status - top right */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <span className="text-xs text-[#888]">
          {wsStatus === 'connected' ? 'Conectado' : wsStatus === 'connecting' ? 'Conectando' : 'Sin conexión'}
        </span>
        <div className={`w-3 h-3 rounded-full ${wsColorMap[wsStatus] || 'bg-red-400'}`} />
      </div>

      {/* Config button */}
      <button
        onClick={() => setShowConfig(v => !v)}
        className="absolute top-12 right-4 w-10 h-10 flex items-center justify-center text-[#888] hover:text-[#fbbf24] transition-colors z-10"
        title="Configuración"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </button>

      {/* Config panel */}
      {showConfig && (
        <div className="absolute top-20 right-4 w-72 bg-[#0f1a3a]/95 border border-[#fbbf24]/30 rounded-xl p-5 z-60 shadow-2xl backdrop-blur-sm">
          <h3 className="text-[#fbbf24] font-semibold text-sm mb-4">Configuración</h3>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[#ccc]">Música</label>
              <button onClick={toggleMusicMuted} className="text-xs text-[#fbbf24] hover:underline">
                {audioSettings.musicMuted ? '🔇' : '🔊'}
              </button>
            </div>
            <input
              type="range" min="0" max="100"
              value={audioSettings.musicMuted ? 0 : audioSettings.musicVolume}
              onChange={e => useRioMundoStore.getState().setAudioSettings({ musicVolume: Number(e.target.value) })}
              disabled={audioSettings.musicMuted}
              className="w-full h-1 accent-[#fbbf24] disabled:opacity-30"
            />
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[#ccc]">Efectos</label>
              <button onClick={toggleSFXMuted} className="text-xs text-[#fbbf24] hover:underline">
                {audioSettings.sfxMuted ? '🔇' : '🔊'}
              </button>
            </div>
            <input
              type="range" min="0" max="100"
              value={audioSettings.sfxMuted ? 0 : audioSettings.sfxVolume}
              onChange={e => useRioMundoStore.getState().setAudioSettings({ sfxVolume: Number(e.target.value) })}
              disabled={audioSettings.sfxMuted}
              className="w-full h-1 accent-[#fbbf24] disabled:opacity-30"
            />
          </div>
          <button onClick={() => setShowConfig(false)} className="w-full text-xs text-[#888] hover:text-[#fbbf24] transition-colors mt-2">
            Cerrar
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center max-w-4xl w-full px-4">
        
        {/* Character team row */}
        <div className="flex items-end justify-center gap-4 md:gap-8 mb-6">
          <AnimatedEmoji emoji="👦" delay={0} size="text-5xl md:text-6xl" />
          <AnimatedEmoji emoji="🧑‍🏫" delay={0.5} size="text-5xl md:text-6xl" />
          <AnimatedEmoji emoji="🐝" delay={1} size="text-7xl md:text-8xl" />
          <AnimatedEmoji emoji="👧" delay={1.5} size="text-5xl md:text-6xl" />
          <AnimatedEmoji emoji="🧭" delay={2} size="text-5xl md:text-6xl" />
        </div>

        {/* Hexagon glow behind title */}
        <div className="relative mb-2">
          <div className="absolute inset-0 flex items-center justify-center">
            <svg width="200" height="200" viewBox="0 0 200 200" className="animate-spin-slow opacity-20">
              <polygon
                points="100,10 180,55 180,145 100,190 20,145 20,55"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="1"
              />
            </svg>
          </div>

          {/* Title */}
          <h1
            className="relative text-6xl md:text-8xl lg:text-9xl font-black text-center tracking-tight"
            style={{
              background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 4px 12px rgba(245, 158, 11, 0.4))',
              textShadow: 'none',
            }}
          >
            HiveLearn
          </h1>
        </div>

        {/* Subtitle */}
        <p
          className="text-lg md:text-xl text-center mb-2 font-medium tracking-wide"
          style={{ color: '#fbbf24', textShadow: '0 2px 8px rgba(245, 158, 11, 0.3)' }}
        >
          La Colmena del Conocimiento
        </p>
        <p className="text-sm md:text-base text-[#888] text-center mb-10 max-w-lg">
          Explora el Río del Saber, aprende con tu enjambre de agentes IA y descubre mundos de conocimiento inspirados en Latinoamérica
        </p>

        {/* CTA Button */}
        <button
          onClick={handleStart}
          disabled={isEntering}
          className="group relative px-10 py-4 bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] rounded-2xl text-[#0a0e27] font-black text-lg md:text-xl uppercase tracking-widest transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(245,158,11,0.4)] active:scale-95 disabled:opacity-60 disabled:cursor-wait"
        >
          <span className="relative z-10 flex items-center gap-3">
            <span className="text-2xl">🚀</span>
            Iniciar Aventura
          </span>
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-2xl bg-[#fbbf24] animate-ping opacity-20" />
        </button>

        {/* Continue button */}
        {hasSavedSession && (
          <button
            onClick={handleContinue}
            disabled={isEntering}
            className="mt-4 px-8 py-3 bg-green-400/10 border border-green-400/40 rounded-xl text-green-400 font-semibold text-base transition-all hover:bg-green-400/20 hover:border-green-400/80 hover:scale-105 disabled:opacity-60"
          >
            {isEntering ? 'Cargando...' : '📖 Continuar Aventura'}
          </button>
        )}

        {/* Tech badges */}
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <TechBadge icon="🥟" label="Bun Runtime" color="#FBF0E4" />
          <TechBadge icon="💎" label="Gemma 4" color="#60A5FA" />
          <TechBadge icon="✨" label="PixiJS" color="#E879F9" />
          <TechBadge icon="🌎" label="Latam Edu" color="#4ADE80" />
        </div>

        {/* Version / Footer */}
        <p className="mt-6 text-[10px] text-[#555] uppercase tracking-widest">
          Potenciado por Inteligencia Artificial Local
        </p>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pollen-float {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.3;
          }
          25% {
            transform: translateY(-20px) translateX(10px);
            opacity: 0.6;
          }
          50% {
            transform: translateY(-10px) translateX(-5px);
            opacity: 0.4;
          }
          75% {
            transform: translateY(-30px) translateX(15px);
            opacity: 0.7;
          }
        }
        @keyframes character-bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-12px);
          }
        }
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 20s linear infinite;
        }
      `}</style>
    </div>
  )
}
