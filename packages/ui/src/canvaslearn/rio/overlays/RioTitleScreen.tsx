import React, { useState, useEffect } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'

export function RioTitleScreen() {
  const setLoginPhase = useRioMundoStore(s => s.setLoginPhase)
  const hasSavedSession = useRioMundoStore(s => !!(s.sessionId && s.programaUuid))
  const wsStatus = useRioMundoStore(s => s.wsStatus)
  const audioSettings = useRioMundoStore(s => s.audioSettings)
  const setAudioSettings = useRioMundoStore(s => s.setAudioSettings)
  const toggleMusicMuted = useRioMundoStore(s => s.toggleMusicMuted)
  const toggleSFXMuted = useRioMundoStore(s => s.toggleSFXMuted)
  const restoreSession = useRioMundoStore(s => s.restoreSession)

  const [loading, setLoading] = useState(false)
  const [dots, setDots] = useState('')
  const [showConfig, setShowConfig] = useState(false)

  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [loading])

  const handleIngresar = () => {
    setLoading(true)
    setTimeout(() => {
      setLoginPhase('nickname_input')
    }, 800)
  }

  const handleContinuar = () => {
    setLoading(true)
    setTimeout(() => {
      setLoginPhase('restoring_session')
    }, 800)
  }

  const wsColorMap: Record<string, string> = {
    connected: 'bg-green-400',
    connecting: 'bg-yellow-400 animate-pulse',
    disconnected: 'bg-red-400',
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0e27]">
      {/* WS status dot - top right */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <span className="text-xs text-[#888]">
          {wsStatus === 'connected' ? 'Conectado' : wsStatus === 'connecting' ? 'Conectando' : 'Sin conexión'}
        </span>
        <div className={`w-3 h-3 rounded-full ${wsColorMap[wsStatus] || 'bg-red-400'}`} />
      </div>

      {/* Config button - top right */}
      <button
        onClick={() => setShowConfig(v => !v)}
        className="absolute top-12 right-4 w-10 h-10 flex items-center justify-center
          text-[#888] hover:text-[#fbbf24] transition-colors"
        title="Configuración"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </button>

      {/* Config panel */}
      {showConfig && (
        <div className="absolute top-20 right-4 w-72 bg-[#0f1a3a] border border-[#fbbf24]/30
          rounded-xl p-5 z-60 shadow-xl">
          <h3 className="text-[#fbbf24] font-semibold text-sm mb-4">Configuración</h3>

          {/* Music volume */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[#ccc]">Música</label>
              <button
                onClick={toggleMusicMuted}
                className="text-xs text-[#fbbf24] hover:underline"
              >
                {audioSettings.musicMuted ? '🔇' : '🔊'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={audioSettings.musicMuted ? 0 : audioSettings.musicVolume}
              onChange={e => setAudioSettings({ musicVolume: Number(e.target.value) })}
              disabled={audioSettings.musicMuted}
              className="w-full h-1 accent-[#fbbf24] disabled:opacity-30"
            />
          </div>

          {/* SFX volume */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[#ccc]">Efectos</label>
              <button
                onClick={toggleSFXMuted}
                className="text-xs text-[#fbbf24] hover:underline"
              >
                {audioSettings.sfxMuted ? '🔇' : '🔊'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={audioSettings.sfxMuted ? 0 : audioSettings.sfxVolume}
              onChange={e => setAudioSettings({ sfxVolume: Number(e.target.value) })}
              disabled={audioSettings.sfxMuted}
              className="w-full h-1 accent-[#fbbf24] disabled:opacity-30"
            />
          </div>

          <button
            onClick={() => setShowConfig(false)}
            className="w-full text-xs text-[#888] hover:text-[#fbbf24] transition-colors mt-2"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Hexagon logo */}
      <svg width="120" height="120" viewBox="0 0 120 120" className="mb-8 animate-pulse">
        <polygon
          points="60,5 110,30 110,90 60,115 10,90 10,30"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2"
        />
        <polygon
          points="60,15 100,35 100,85 60,105 20,85 20,35"
          fill="#fbbf24"
          fillOpacity="0.1"
          stroke="#fbbf24"
          strokeWidth="1"
        />
        <text x="60" y="55" textAnchor="middle" fill="#fbbf24" fontSize="28" fontWeight="bold">
          H
        </text>
        <text x="60" y="80" textAnchor="middle" fill="#fbbf2480" fontSize="10">
          LEARN
        </text>
      </svg>

      {/* Title */}
      <h1 className="text-4xl font-bold text-[#fbbf24] mb-2 tracking-wider">
        HiveLearn
      </h1>
      <p className="text-[#888] text-sm mb-12">
        Aprende con el enjambre
      </p>

      {/* Enter button */}
      <button
        onClick={handleIngresar}
        disabled={loading}
        className="px-8 py-3 bg-[#fbbf24]/20 border border-[#fbbf24]/50 rounded-xl
          text-[#fbbf24] font-semibold text-lg transition-all
          hover:bg-[#fbbf24]/30 hover:border-[#fbbf24] hover:scale-105
          disabled:opacity-60 disabled:cursor-wait"
      >
        {loading ? `Cargando${dots}` : 'Ingresar'}
      </button>

      {/* Continue button - only if saved session */}
      {hasSavedSession && (
        <button
          onClick={handleContinuar}
          disabled={loading}
          className="mt-3 px-8 py-2.5 bg-green-400/10 border border-green-400/40 rounded-xl
            text-green-400 font-semibold text-base transition-all
            hover:bg-green-400/20 hover:border-green-400/80 hover:scale-105
            disabled:opacity-60 disabled:cursor-wait"
        >
          {loading ? `Restaurando${dots}` : 'Continuar'}
        </button>
      )}
    </div>
  )
}
