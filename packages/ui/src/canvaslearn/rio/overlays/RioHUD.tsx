import React, { useState, useCallback } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { RIO_NIVELES } from '../types'

function AudioControl() {
  const [showControls, setShowControls] = useState(false)
  const audioSettings = useRioMundoStore(s => s.audioSettings)
  const audioManager = useRioMundoStore(s => s.audioManager)
  const setAudioSettings = useRioMundoStore(s => s.setAudioSettings)

  const handleToggleMusic = () => {
    const muted = audioManager?.toggleMusicMuted() ?? !audioSettings.musicMuted
    setAudioSettings({ musicMuted: muted })
  }

  const handleToggleSFX = () => {
    const muted = audioManager?.toggleSFXMuted() ?? !audioSettings.sfxMuted
    setAudioSettings({ sfxMuted: muted })
  }

  const handleMusicVolume = (v: number) => {
    audioManager?.setMusicVolume(v / 100)
    setAudioSettings({ musicVolume: v })
  }

  const handleSFXVolume = (v: number) => {
    audioManager?.setSFXVolume(v / 100)
    setAudioSettings({ sfxVolume: v })
  }

  return (
    <div className="relative pointer-events-auto">
      <button
        onClick={() => setShowControls(!showControls)}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        title="Audio"
      >
        <span className="text-sm">
          {audioSettings.musicMuted && audioSettings.sfxMuted ? '🔇' : audioSettings.musicMuted ? '🔈' : '🔊'}
        </span>
      </button>

      {showControls && (
        <div className="absolute top-10 right-0 w-56 bg-[#0a0e27]/95 backdrop-blur-sm border border-[#fbbf24]/20 rounded-xl p-4 shadow-xl z-50">
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">Música</span>
              <button
                onClick={handleToggleMusic}
                className="text-xs text-[#fbbf24] hover:text-[#f59e0b]"
              >
                {audioSettings.musicMuted ? '🔇' : '🔊'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={audioSettings.musicMuted ? 0 : audioSettings.musicVolume}
              onChange={(e) => handleMusicVolume(Number(e.target.value))}
              disabled={audioSettings.musicMuted}
              className="w-full h-1 accent-[#fbbf24] disabled:opacity-30"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">Efectos</span>
              <button
                onClick={handleToggleSFX}
                className="text-xs text-[#fbbf24] hover:text-[#f59e0b]"
              >
                {audioSettings.sfxMuted ? '🔇' : '🔊'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={audioSettings.sfxMuted ? 0 : audioSettings.sfxVolume}
              onChange={(e) => handleSFXVolume(Number(e.target.value))}
              disabled={audioSettings.sfxMuted}
              className="w-full h-1 accent-[#fbbf24] disabled:opacity-30"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function RioHUD() {
  const {
    nickname,
    xpTotal,
    nivelActual,
    progresoNivel,
    vidas,
    racha,
    mejorRacha,
    tributaries,
    zonaActual,
    beeState,
    dialogBubbles,
  } = useRioMundoStore()

  const nivelInfo = RIO_NIVELES.find(n => n.nivel === nivelActual) || RIO_NIVELES[0]
  const completedZones = tributaries.filter(t => t.estado === 'completado').length
  const totalZones = tributaries.length

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
        {/* Left: Level & XP */}
        <div className="bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 px-4 py-2 pointer-events-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{nivelInfo.badge}</span>
            <div>
              <div className="text-[#fbbf24] font-bold text-sm">{nivelInfo.nombre} {nivelActual}</div>
              <div className="w-32 h-2 bg-[#1a1f3a] rounded-full mt-1">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#fbbf24] to-[#f59e0b]"
                  style={{ width: `${progresoNivel}%` }}
                />
              </div>
              <div className="text-[#888] text-xs mt-0.5">{xpTotal} XP</div>
            </div>
          </div>
        </div>

        {/* Right: Lives, Streak & Audio */}
        <div className="flex items-center gap-2">
          <div className="bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 px-4 py-2 pointer-events-auto">
            <div className="flex items-center gap-4">
              <div className="flex gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <span key={i} className={`text-lg ${i < vidas ? 'opacity-100' : 'opacity-30'}`}>
                    ❤️
                  </span>
                ))}
              </div>
              {racha > 0 && (
                <div className="text-[#fbbf24] font-bold text-sm">
                  🔥 {racha}
                </div>
              )}
            </div>
          </div>
          <AudioControl />
        </div>
      </div>

      {/* Zone progress */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 px-4 py-2 pointer-events-auto">
        <div className="flex items-center gap-2">
          <span className="text-[#fbbf24] font-bold text-sm">🌍 {completedZones}/{totalZones}</span>
          <span className="text-[#888] text-xs">zonas completadas</span>
        </div>
      </div>

      {/* Mini-map placeholder */}
      <div className="absolute bottom-4 right-4 w-32 h-32 bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 pointer-events-auto">
        <div className="flex items-center justify-center h-full text-[#888] text-xs">
          🗺️ Mini-mapa
        </div>
      </div>
    </div>
  )
}