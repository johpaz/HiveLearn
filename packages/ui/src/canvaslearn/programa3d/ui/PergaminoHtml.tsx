import { Html } from '@react-three/drei'
import { useRef, useState, useEffect, useCallback } from 'react'
import { BEE_ANCHOR_POS } from '../state/programa3dStore'

interface PergaminoHtmlProps {
  visible: boolean
  question: string
  placeholder: string
  type?: 'text' | 'number'
  onSubmit: (value: string) => void
  loading?: boolean
}

export function PergaminoHtml({ visible, question, placeholder, type = 'text', onSubmit, loading }: PergaminoHtmlProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible) {
      setValue('')
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [visible, question])

  const handleSubmit = useCallback(() => {
    const v = value.trim()
    if (!v) {
      setError('Necesito una respuesta')
      return
    }
    if (type === 'number') {
      const n = parseInt(v, 10)
      if (isNaN(n) || n < 5 || n > 120) {
        setError('Edad entre 5 y 120')
        return
      }
    } else if (v.length < 2) {
      setError('Al menos 2 letras')
      return
    }
    setError(null)
    onSubmit(v)
  }, [value, type, onSubmit])

  if (!visible) return null

  return (
    <Html
      position={[BEE_ANCHOR_POS.x, BEE_ANCHOR_POS.y + 1.4, BEE_ANCHOR_POS.z]}
      center
      distanceFactor={6}
      occlude={false}
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="px-5 py-4 rounded-2xl shadow-2xl select-none animate-[pergaminoIn_350ms_ease-out_forwards]"
        style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%)',
          border: '3px solid #b45309',
          boxShadow: '0 0 30px rgba(251, 191, 36, 0.4), inset 0 0 20px rgba(180, 83, 9, 0.15)',
          minWidth: 320,
        }}
      >
        <div className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-[#b45309]" />
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-[#b45309]" />
        <div className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-[#b45309]" />
        <div className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-[#b45309]" />

        <p
          className="text-[#7c2d12] text-center font-bold mb-3"
          style={{ fontFamily: 'Georgia, serif', fontSize: 15 }}
        >
          {question}
        </p>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type={type}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
            placeholder={placeholder}
            disabled={loading}
            className="flex-1 px-3 py-2 bg-white/80 border-2 border-[#b45309]/40 rounded-lg text-[#7c2d12] text-center font-semibold placeholder-[#a16207]/60 focus:outline-none focus:border-[#b45309] focus:bg-white"
            style={{ fontFamily: 'Georgia, serif', fontSize: 14, width: 200 }}
            autoComplete="off"
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || loading}
            className="px-4 py-2 bg-[#b45309] hover:bg-[#92400e] disabled:bg-[#a16207]/40 disabled:cursor-not-allowed text-[#fef3c7] font-black rounded-lg text-sm shadow-md"
          >
            {loading ? '…' : '✓'}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-center text-[#9a1c1c] text-xs font-bold">{error}</p>
        )}

        <style>{`
          @keyframes pergaminoIn {
            0% { opacity: 0; transform: scale(0.7); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </Html>
  )
}
