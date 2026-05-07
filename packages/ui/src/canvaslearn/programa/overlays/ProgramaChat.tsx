import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ProgramaConversation } from '../conversation/ProgramaConversation'
import { useRioMundoStore } from '@/store/rioMundoStore'

interface ProgramaChatProps {
  conversation: ProgramaConversation
  visible: boolean
}

export function ProgramaChat({ conversation, visible }: ProgramaChatProps) {
  const [, forceUpdate] = useState(0)
  const [textValue, setTextValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messages = useRioMundoStore(s => s.onboarding.messages)

  // Suscribir al controller para repintar cuando cambia el paso/error
  useEffect(() => {
    conversation.setOnStepChange(() => {
      forceUpdate(n => n + 1)
      setTextValue('')
    })
  }, [conversation])

  // Focus al input cuando entra modo texto
  const inputType = conversation.getEffectiveInputType()
  useEffect(() => {
    if (visible && (inputType === 'text' || inputType === 'number')) {
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [visible, inputType, conversation.getCurrentStep()?.id])

  const step = conversation.getCurrentStep()
  const error = conversation.getError()
  const showingOther = conversation.isShowingOtherInput()

  const handleSubmitText = useCallback(async () => {
    if (!textValue.trim() || submitting) return
    setSubmitting(true)
    await conversation.submit(textValue.trim())
    setSubmitting(false)
  }, [textValue, submitting, conversation])

  const handleChoice = useCallback(async (value: string) => {
    if (submitting) return
    if (value === '__other__') {
      conversation.chooseOther()
      return
    }
    setSubmitting(true)
    await conversation.submit(value)
    setSubmitting(false)
  }, [submitting, conversation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmitText()
    } else if (e.key === 'Escape' && showingOther) {
      conversation.cancelOther()
    }
  }, [handleSubmitText, showingOther, conversation])

  if (!visible || !step) return null

  const beeMsg = messages.length > 0 ? messages[messages.length - 1] : null
  const beeQuestion = beeMsg?.role === 'bee' ? beeMsg.text : step.beeText

  return (
    <div className="absolute inset-x-0 bottom-0 pb-6 px-4 pointer-events-none z-40 flex justify-center">
      <div className="w-full max-w-3xl pointer-events-auto">
        {/* Bee question banner (sutil, recordatorio si la burbuja Pixi expira) */}
        <div className="mb-3 flex items-center gap-2 justify-center">
          <div className="bg-[#fbbf24]/95 text-[#0a0e27] px-4 py-2 rounded-2xl rounded-bl-sm shadow-lg max-w-xl">
            <span className="mr-2">🐝</span>
            <span className="font-semibold text-sm">{beeQuestion}</span>
          </div>
        </div>

        {error && (
          <div className="mb-2 mx-auto max-w-md text-center">
            <span className="inline-block px-3 py-1 rounded-lg bg-[#ef4444]/15 border border-[#ef4444]/40 text-[#fca5a5] text-xs font-bold">
              ⚠️ {error}
            </span>
          </div>
        )}

        {/* Choices (botones grandes estilo juego) */}
        {step.inputType === 'choice' && !showingOther && step.options && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {step.options.map(opt => (
              <button
                key={opt.id}
                onClick={() => handleChoice(opt.value)}
                disabled={submitting}
                className="group relative flex items-center gap-2 px-4 py-3 rounded-xl bg-[#1a1f3a]/95 border-2 border-[#fbbf24]/30 hover:border-[#fbbf24] hover:bg-[#252a4a] text-white text-sm font-bold transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg backdrop-blur-sm"
              >
                {opt.icon && <span className="text-xl">{opt.icon}</span>}
                <span className="flex-1 text-left">{opt.label}</span>
                <span className="text-[#fbbf24] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </button>
            ))}
          </div>
        )}

        {/* Text/number input */}
        {(step.inputType === 'text' || step.inputType === 'number' || showingOther) && (
          <div className="bg-[#0a0e27]/95 backdrop-blur-md rounded-2xl border-2 border-[#fbbf24]/40 p-3 shadow-2xl">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type={step.inputType === 'number' && !showingOther ? 'number' : 'text'}
                value={textValue}
                onChange={e => setTextValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={showingOther ? 'Escribe tu respuesta…' : (step.placeholder || 'Tu respuesta')}
                disabled={submitting}
                className="flex-1 px-4 py-3 bg-[#1a1f3a] border border-[#fbbf24]/30 rounded-xl text-white text-sm placeholder-[#666] focus:outline-none focus:border-[#fbbf24] transition-colors"
                autoComplete="off"
              />
              <button
                onClick={handleSubmitText}
                disabled={!textValue.trim() || submitting}
                className="px-5 py-3 bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] hover:from-[#f59e0b] hover:to-[#d97706] disabled:from-[#333] disabled:to-[#333] disabled:cursor-not-allowed text-[#0a0e27] font-black rounded-xl text-sm transition-all hover:scale-105 active:scale-95"
              >
                {submitting ? '…' : 'Enviar'}
              </button>
            </div>
            {showingOther && (
              <button
                onClick={() => conversation.cancelOther()}
                className="mt-2 w-full text-[#888] hover:text-[#fbbf24] text-xs transition-colors"
              >
                ← Volver a las opciones
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
