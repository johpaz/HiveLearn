import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { RIO_NIVELES } from '../types'

const MINIMAP_COLORS: Record<string, string> = {
  pasto: '#3a5f3a', tierra: '#8b6f47', agua: '#3b6e8f', agua_profunda: '#1e3a5f',
  montana: '#666', piedra: '#888', camino: '#c4a878', arena: '#d4be7a',
  arbol: '#2d4a2d', arbusto: '#4a6a3a', flores: '#d4a8b8',
  portal_zona: '#fbbf24', puente: '#a08060', desembo_roca: '#9c8060', cascada: '#5a8db5', barro: '#6b4a2a', tronco: '#5a3e1f',
}

function Minimap() {
  const mapa = useRioMundoStore(s => s.mapa)
  const jugadorX = useRioMundoStore(s => s.jugador.x)
  const jugadorY = useRioMundoStore(s => s.jugador.y)
  const tributaries = useRioMundoStore(s => s.tributaries)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapa || !mapa.tiles?.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const cols = mapa.tiles[0].length
    const rows = mapa.tiles.length
    const cellW = canvas.width / cols
    const cellH = canvas.height / rows
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = MINIMAP_COLORS[mapa.tiles[y][x].type] || '#000'
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH))
      }
    }
    // Portales
    for (const t of tributaries) {
      if (!t.portalPos) continue
      ctx.fillStyle = t.estado === 'fluyendo' ? '#fbbf24' : t.estado === 'completado' ? '#4ade80' : '#888'
      ctx.beginPath()
      ctx.arc((t.portalPos.x + 0.5) * cellW, (t.portalPos.y + 0.5) * cellH, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    // Jugador
    ctx.fillStyle = '#ff3366'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc((jugadorX + 0.5) * cellW, (jugadorY + 0.5) * cellH, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }, [mapa, jugadorX, jugadorY, tributaries])

  return <canvas ref={canvasRef} width={120} height={120} className="block" />
}

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
  const navigate = useNavigate()
  const {
    nickname,
    xpTotal,
    nivelActual,
    progresoNivel,
    vidas,
    racha,
    tributaries,
    salirSesion,
  } = useRioMundoStore()

  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const handleSalir = useCallback(() => {
    salirSesion()
    navigate('/')
  }, [salirSesion, navigate])

  const nivelInfo = RIO_NIVELES.find(n => n.nivel === nivelActual) || RIO_NIVELES[0]
  const completedZones = tributaries.filter(t => t.estado === 'completado').length
  const totalZones = tributaries.length

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Exit confirmation dialog */}
      {showExitConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto">
          <div className="bg-[#0a0e27] border border-[#fbbf24]/40 rounded-2xl p-6 w-72 shadow-2xl">
            <p className="text-white font-bold text-center mb-1">¿Salir del juego?</p>
            <p className="text-[#888] text-sm text-center mb-5">Tu progreso se guarda automáticamente.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalir}
                className="flex-1 py-2 rounded-xl bg-red-500/80 text-white text-sm font-semibold hover:bg-red-500 transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

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

        {/* Right: Lives, Streak, Audio & Exit */}
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
          <button
            onClick={() => setShowExitConfirm(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/20 hover:border-red-500/40 transition-colors pointer-events-auto"
            title="Salir del juego"
          >
            <span className="text-sm">🚪</span>
          </button>
        </div>
      </div>

      {/* Zone progress */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 px-4 py-2 pointer-events-auto">
        <div className="flex items-center gap-2">
          <span className="text-[#fbbf24] font-bold text-sm">🌍 {completedZones}/{totalZones}</span>
          <span className="text-[#888] text-xs">zonas completadas</span>
        </div>
      </div>

      {/* Mini-map */}
      <div className="absolute bottom-4 right-4 w-32 h-32 bg-[#0a0e27]/80 backdrop-blur-sm rounded-xl border border-[#fbbf24]/30 pointer-events-auto p-1 flex items-center justify-center">
        <Minimap />
      </div>
    </div>
  )
}