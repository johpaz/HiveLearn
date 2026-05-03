import React, { useState, useCallback, useEffect } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { A2UIRenderer } from '@/a2ui/A2UIRenderer'
import type { A2UIMessage } from '@/a2ui/A2UIRenderer'

interface PortalOverlayProps {
  onClose: () => void
  onAnswer: (respuesta: any) => void
}

export function PortalOverlay({ onClose, onAnswer }: PortalOverlayProps) {
  const { portal, zonaActual, tributaries } = useRioMundoStore()
  const { phase, a2uiMessages } = portal
  const [feedback, setFeedback] = useState<{
    correcto: boolean
    mensajePrincipal: string
    xpGanado: number
    razonamiento?: string
    pistaSiIncorrecto?: string
  } | null>(null)

  const currentTributary = tributaries.find(t => t.zoneNumero === zonaActual)
  const zonaTitulo = currentTributary?.name || `Zona ${zonaActual}`
  const zonaTipo = currentTributary?.tipoPedagogico || 'concept'

  const handleAction = useCallback(async (action: { name: string; context: Record<string, any> }) => {
    if (action.name === 'complete_node' || action.name === 'submit_answer') {
      onAnswer(action.context || {})
    }
  }, [onAnswer])

  if (phase === 'closed') return null

  const isEntering = phase === 'entering'
  const isOpen = phase === 'open'
  const isExiting = phase === 'exiting'

  return (
    <div className={`absolute inset-0 z-50 transition-all duration-500 ${
      isEntering ? 'opacity-0 scale-95' : isOpen ? 'opacity-100 scale-100' : isExiting ? 'opacity-0 scale-95' : 'opacity-0 scale-95'
    }`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#0a0e27]/70 backdrop-blur-sm"
        onClick={isExiting ? undefined : onClose}
      />

      {/* Content panel */}
      <div className="absolute inset-4 md:inset-8 lg:inset-16 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1a1f3a]/95 border border-[#fbbf24]/30 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getTipoEmoji(zonaTipo)}</span>
            <div>
              <h2 className="text-[#fbbf24] font-bold text-lg">{zonaTitulo}</h2>
              <p className="text-[#888] text-xs">{getTipoLabel(zonaTipo)}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-[#0a0e27] hover:bg-[#2a3550] border border-[#fbbf24]/40 rounded-lg text-[#fbbf24] text-sm font-medium transition-colors"
          >
            Volver al rio
          </button>
        </div>

        {/* A2UI Content */}
        <div className="flex-1 overflow-y-auto bg-[#0a0e27]/95 border-x border-[#fbbf24]/30 p-4">
          {a2uiMessages.length > 0 ? (
            <A2UIRenderer
              messages={a2uiMessages}
              onAction={handleAction}
              feedback={feedback}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-[#fbbf24] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[#888] text-sm">Cargando contenido...</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer with zone info */}
        <div className="px-4 py-2 bg-[#1a1f3a]/95 border border-t-0 border-[#fbbf24]/30 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[#888] text-xs">Zona {zonaActual}</span>
              {currentTributary && (
                <span className="text-[#4CAF50] text-xs">+{currentTributary.xpRecompensa} XP</span>
              )}
            </div>
            <div className="text-[#555] text-xs">Presiona ESC para salir</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getTipoEmoji(tipo: string): string {
  switch (tipo) {
    case 'concept': return '📖'
    case 'exercise': return '✏️'
    case 'quiz': return '❓'
    case 'challenge': return '🏆'
    case 'milestone': return '⭐'
    case 'evaluation': return '📝'
    default: return '🎯'
  }
}

function getTipoLabel(tipo: string): string {
  switch (tipo) {
    case 'concept': return 'Explicacion'
    case 'exercise': return 'Ejercicio'
    case 'quiz': return 'Quiz'
    case 'challenge': return 'Reto'
    case 'milestone': return 'Hito'
    case 'evaluation': return 'Evaluacion'
    default: return 'Contenido'
  }
}