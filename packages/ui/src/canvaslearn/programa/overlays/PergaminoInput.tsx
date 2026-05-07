import React, { useCallback, useEffect, useRef, useState } from 'react'

interface PergaminoInputProps {
  visible: boolean
  question: string
  placeholder: string
  type?: 'text' | 'number'
  initialValue?: string
  maxLength?: number
  validate?: (value: string) => string | null
  onSubmit: (value: string) => void
  /** Coords sobre canvas (px) donde anclar el pergamino. Si null, fixed bottom-center. */
  anchorScreenX?: number | null
  anchorScreenY?: number | null
}

export function PergaminoInput({
  visible,
  question,
  placeholder,
  type = 'text',
  initialValue = '',
  maxLength = 30,
  validate,
  onSubmit,
  anchorScreenX,
  anchorScreenY,
}: PergaminoInputProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible) {
      setValue(initialValue)
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [visible, initialValue, question])

  const handleSubmit = useCallback(() => {
    const v = value.trim()
    if (validate) {
      const err = validate(v)
      if (err) {
        setError(err)
        return
      }
    } else if (!v) {
      setError('Necesito una respuesta')
      return
    }
    setError(null)
    onSubmit(v)
  }, [value, validate, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  if (!visible) return null

  const positioned = anchorScreenX != null && anchorScreenY != null
  const style: React.CSSProperties = positioned
    ? {
        position: 'absolute',
        left: anchorScreenX,
        top: anchorScreenY,
        transform: 'translate(-50%, -100%)',
      }
    : {
        position: 'absolute',
        left: '50%',
        bottom: '12vh',
        transform: 'translateX(-50%)',
      }

  return (
    <div
      style={style}
      className="z-40 pointer-events-auto animate-[pergaminoIn_400ms_ease-out_forwards]"
    >
      {/* Pergamino */}
      <div
        className="relative px-6 py-5 rounded-2xl shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%)',
          border: '3px solid #b45309',
          boxShadow: '0 0 30px rgba(251, 191, 36, 0.4), inset 0 0 20px rgba(180, 83, 9, 0.15)',
          minWidth: 320,
          maxWidth: 420,
        }}
      >
        {/* Esquinas decorativas */}
        <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-[#b45309]" />
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#b45309]" />
        <div className="absolute -bottom-2 -left-2 w-5 h-5 rounded-full bg-[#b45309]" />
        <div className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-[#b45309]" />

        {/* Pregunta */}
        <p
          className="text-[#7c2d12] text-center font-bold mb-3 leading-snug"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 16 }}
        >
          {question}
        </p>

        {/* Input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type={type}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null) }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={maxLength}
            className="flex-1 px-4 py-2.5 bg-white/80 border-2 border-[#b45309]/40 rounded-lg text-[#7c2d12] text-center text-base font-semibold placeholder-[#a16207]/60 focus:outline-none focus:border-[#b45309] focus:bg-white transition-all"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            autoComplete="off"
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="px-5 py-2.5 bg-[#b45309] hover:bg-[#92400e] disabled:bg-[#a16207]/40 disabled:cursor-not-allowed text-[#fef3c7] font-black rounded-lg transition-all hover:scale-105 active:scale-95 text-sm shadow-md"
          >
            ✓
          </button>
        </div>

        {error && (
          <p className="mt-2 text-center text-[#9a1c1c] text-xs font-bold">{error}</p>
        )}

        {/* Pointer (triángulo apuntando abajo si está anclado a algo arriba) */}
        {positioned && (
          <div
            className="absolute left-1/2 -translate-x-1/2 -bottom-3"
            style={{
              width: 0,
              height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: '12px solid #b45309',
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes pergaminoIn {
          0% { opacity: 0; transform: ${positioned ? 'translate(-50%, -90%) scale(0.7)' : 'translate(-50%, 30px) scale(0.7)'}; }
          100% { opacity: 1; transform: ${positioned ? 'translate(-50%, -100%) scale(1)' : 'translateX(-50%) scale(1)'}; }
        }
      `}</style>
    </div>
  )
}
