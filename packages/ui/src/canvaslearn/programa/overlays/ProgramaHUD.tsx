import { useNavigate } from 'react-router-dom'
import { Volume2, VolumeX, Music, X } from 'lucide-react'
import { useRioMundoStore } from '@/store/rioMundoStore'

export function ProgramaHUD() {
  const navigate = useNavigate()
  const audioSettings = useRioMundoStore(s => s.audioSettings)
  const toggleMusicMuted = useRioMundoStore(s => s.toggleMusicMuted)
  const toggleSFXMuted = useRioMundoStore(s => s.toggleSFXMuted)

  const handleExit = () => {
    if (!confirm('¿Salir y volver al inicio? Tu progreso no se perderá.')) return
    navigate('/', { replace: true })
  }

  return (
    <div className="absolute top-4 left-4 z-50 pointer-events-auto flex items-center gap-2">
      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a1f3a]/85 backdrop-blur-sm border border-[#ef4444]/30 text-[#fca5a5] hover:text-white hover:bg-[#ef4444]/40 hover:border-[#ef4444] transition-all text-xs font-bold uppercase tracking-wider shadow-lg"
        title="Salir al inicio"
      >
        <X className="w-4 h-4" />
        <span className="hidden sm:inline">Salir</span>
      </button>

      <button
        onClick={toggleMusicMuted}
        className="p-2 rounded-xl bg-[#1a1f3a]/85 backdrop-blur-sm border border-[#fbbf24]/20 text-[#fbbf24]/80 hover:text-[#fbbf24] hover:bg-[#1a1f3a] transition-all shadow-lg"
        title={audioSettings.musicMuted ? 'Activar música' : 'Silenciar música'}
      >
        {audioSettings.musicMuted ? (
          <span className="relative inline-flex">
            <Music className="w-4 h-4 opacity-50" />
            <span className="absolute inset-0 flex items-center justify-center text-[#ef4444] font-black text-xs">/</span>
          </span>
        ) : (
          <Music className="w-4 h-4" />
        )}
      </button>

      <button
        onClick={toggleSFXMuted}
        className="p-2 rounded-xl bg-[#1a1f3a]/85 backdrop-blur-sm border border-[#fbbf24]/20 text-[#fbbf24]/80 hover:text-[#fbbf24] hover:bg-[#1a1f3a] transition-all shadow-lg"
        title={audioSettings.sfxMuted ? 'Activar efectos' : 'Silenciar efectos'}
      >
        {audioSettings.sfxMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
    </div>
  )
}
