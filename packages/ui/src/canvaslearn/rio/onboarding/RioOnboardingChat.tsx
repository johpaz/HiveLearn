import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { RioOnboardingController } from '../onboarding/RioOnboardingController'

interface RioOnboardingChatProps {
  controller: RioOnboardingController
  onComplete: (data: Record<string, string | number>) => void
}

export function RioOnboardingChat({ controller, onComplete }: RioOnboardingChatProps) {
  const { onboarding, setBeeState } = useRioMundoStore()
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Focus input when component mounts or step changes
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [onboarding.step])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [onboarding.messages])

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim() || isProcessing) return

    setIsProcessing(true)
    setError(null)

    const result = await controller.handleResponse(inputValue.trim())

    if (!result.valid) {
      setError(result.error || 'Error')
      setIsProcessing(false)
      return
    }

    setInputValue('')

    if (result.completed) {
      const data = controller.getCollectedData()
      setTimeout(() => onComplete(data), 3000)
    }

    setIsProcessing(false)
  }, [inputValue, isProcessing, controller, onComplete])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const currentQuestion = controller.getCurrentQuestion()

  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
      {/* Chat history */}
      <div className="max-w-lg mx-auto mb-4 px-4 max-h-40 overflow-y-auto pointer-events-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {onboarding.messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-2 ${msg.role === 'bee' ? 'text-left' : 'text-right'}`}
          >
            <div className={`inline-block px-4 py-2 rounded-2xl text-sm max-w-[80%] ${
              msg.role === 'bee'
                ? 'bg-[#fbbf24]/90 text-[#1a1a2e] rounded-bl-sm'
                : 'bg-[#1a1f3a]/90 text-white rounded-br-sm border border-[#fbbf24]/30'
            }`}>
              {msg.role === 'bee' && <span className="mr-1">🐝</span>}
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {currentQuestion && !controller.isComplete() && (
        <div className="max-w-lg mx-auto px-4 pb-6 pointer-events-auto">
          <div className="bg-[#1a1f3a]/95 backdrop-blur-sm rounded-2xl border border-[#fbbf24]/30 p-4">
            {error && (
              <p className="text-[#ef4444] text-xs mb-2">{error}</p>
            )}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type={currentQuestion.type === 'number' ? 'number' : 'text'}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setError(null)
                }}
                onKeyDown={handleKeyDown}
                placeholder={currentQuestion.placeholder}
                disabled={isProcessing}
                className="flex-1 px-4 py-3 bg-[#0a0e27] border border-[#fbbf24]/20 rounded-xl text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#fbbf24] transition-colors"
                autoComplete="off"
              />
              <button
                onClick={handleSubmit}
                disabled={!inputValue.trim() || isProcessing}
                className="px-4 py-3 bg-[#fbbf24] hover:bg-[#f59e0b] disabled:bg-[#333] disabled:cursor-not-allowed text-[#0a0e27] font-bold rounded-xl text-sm transition-colors"
              >
                {isProcessing ? '...' : 'Enviar'}
              </button>
            </div>

            {/* Progress dots */}
            <div className="flex gap-1.5 justify-center mt-3">
              {['nombre', 'edad', 'tema', 'objetivo', 'estilo'].map((step, idx) => (
                <div
                  key={step}
                  className={`w-2 h-2 rounded-full transition-all ${
                    onboarding.step === step
                      ? 'bg-[#fbbf24] scale-125'
                      : ['nombre', 'edad', 'tema', 'objetivo', 'estilo'].indexOf(onboarding.step) > idx
                      ? 'bg-[#4CAF50]'
                      : 'bg-[#333]'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}