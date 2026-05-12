import { useNavigate } from 'react-router-dom'
import { Volume2, VolumeX, Music, X } from 'lucide-react'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { usePrograma3DStore } from '../state/programa3dStore'

export function HudOverlay() {
  const navigate = useNavigate()
  const audioSettings = useRioMundoStore(s => s.audioSettings)
  const toggleMusicMuted = useRioMundoStore(s => s.toggleMusicMuted)
  const toggleSFXMuted = useRioMundoStore(s => s.toggleSFXMuted)
  const hint = usePrograma3DStore(s => s.hint)

  const handleExit = () => {
    if (!confirm('¿Salir y volver al inicio?')) return
    navigate('/', { replace: true })
  }

  return (
    <>
      {/* Top-left HUD */}
      <div className="absolute top-4 left-4 z-50 pointer-events-auto flex items-center gap-2">
        <button
          onClick={handleExit}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a1f3a]/85 backdrop-blur-sm border border-[#ef4444]/30 text-[#fca5a5] hover:text-white hover:bg-[#ef4444]/40 hover:border-[#ef4444] transition-all text-xs font-bold uppercase tracking-wider shadow-lg"
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">Salir</span>
        </button>

        <button
          onClick={toggleMusicMuted}
          className="p-2 rounded-xl bg-[#1a1f3a]/85 backdrop-blur-sm border border-[#fbbf24]/20 text-[#fbbf24]/80 hover:text-[#fbbf24] hover:bg-[#1a1f3a] transition-all shadow-lg"
        >
          {audioSettings.musicMuted ? <Music className="w-4 h-4 opacity-40" /> : <Music className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleSFXMuted}
          className="p-2 rounded-xl bg-[#1a1f3a]/85 backdrop-blur-sm border border-[#fbbf24]/20 text-[#fbbf24]/80 hover:text-[#fbbf24] hover:bg-[#1a1f3a] transition-all shadow-lg"
        >
          {audioSettings.sfxMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Hint dinámico */}
      {hint && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-32 z-30 pointer-events-none animate-bounce">
          <div className="bg-[#fbbf24] text-[#0a0e27] px-4 py-2 rounded-full font-black text-sm shadow-2xl shadow-[#fbbf24]/50 flex items-center gap-2">
            <kbd className="px-2 py-0.5 bg-[#0a0e27] text-[#fbbf24] rounded font-mono text-xs">E</kbd>
            <span>{hint}</span>
          </div>
        </div>
      )}

      {/* Controles inferiores (info) */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-30 pointer-events-none">
        <div className="bg-[#0a0e27]/85 backdrop-blur-sm border border-[#fbbf24]/30 rounded-xl px-4 py-2 text-[#fbbf24]/90 text-xs font-semibold flex items-center gap-2 shadow-lg">
          <kbd className="px-1.5 py-0.5 bg-[#1a1f3a] rounded font-mono">WASD</kbd>
          <span>moverse</span>
          <span className="text-[#fbbf24]/40">·</span>
          <kbd className="px-1.5 py-0.5 bg-[#1a1f3a] rounded font-mono">Shift</kbd>
          <span>correr</span>
          <span className="text-[#fbbf24]/40">·</span>
          <kbd className="px-1.5 py-0.5 bg-[#1a1f3a] rounded font-mono">Click</kbd>
          <span>ir al lugar</span>
        </div>
      </div>
    </>
  )
}
