import { useEffect, useState, useCallback } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'

const HINTS = [
  { id: 'move', text: 'Usa WASD para caminar, Shift para correr', condition: (s: any) => s.loginPhase === 'in_world', dismissAfter: 8000 },
  { id: 'click', text: 'Haz clic en el mapa para moverte ahi', condition: (s: any) => s.loginPhase === 'in_world', dismissAfter: 10000 },
  { id: 'portal', text: 'Parate sobre un portal y presiona E para entrar', condition: (s: any) => s.loginPhase === 'in_world' && s.tributaries.some((t: any) => t.estado === 'fluyendo'), dismissAfter: 12000 },
  { id: 'bee', text: 'La abeja te guia — siguela para descubrir zonas', condition: (s: any) => s.loginPhase === 'in_world', dismissAfter: 8000 },
]

export function RioTutorialHints() {
  const loginPhase = useRioMundoStore(s => s.loginPhase)
  const tributaries = useRioMundoStore(s => s.tributaries)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [visible, setVisible] = useState<string | null>(null)

  const state = { loginPhase, tributaries }

  const getActiveHint = useCallback(() => {
    for (const hint of HINTS) {
      if (dismissed.has(hint.id)) continue
      if (hint.condition(state)) return hint
    }
    return null
  }, [loginPhase, tributaries, dismissed])

  useEffect(() => {
    const hint = getActiveHint()
    if (hint && hint.id !== visible) {
      setVisible(hint.id)
      const timer = setTimeout(() => {
        setDismissed(prev => new Set(prev).add(hint.id))
        setVisible(null)
      }, hint.dismissAfter)
      return () => clearTimeout(timer)
    }
    if (!hint) setVisible(null)
  }, [getActiveHint, visible])

  if (!visible) return null

  return (
    <div className="absolute top-20 right-4 z-30 pointer-events-none">
      <div className="bg-[#0a0e27]/85 backdrop-blur-sm border border-[#fbbf24]/30 rounded-lg px-4 py-3 max-w-xs animate-fade-in">
        <p className="text-[#fbbf24] text-sm leading-relaxed">
          {HINTS.find(h => h.id === visible)?.text}
        </p>
      </div>
    </div>
  )
}
