import React, { useState, useCallback } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { DEFAULT_AVATAR } from '../types'

const AVATAR_COLORS = {
  skin: [0xFFCC99, 0xE8B88A, 0xC68642, 0x8D5524, 0x6B3E26],
  hair: [0x4A3728, 0x1A1A1A, 0x8B4513, 0xD4A574, 0xB8860B, 0xCD5C5C],
  shirt: [0x3B82F6, 0x10B981, 0xEF4444, 0x8B5CF6, 0xF59E0B, 0xEC4899],
  pants: [0x1E3A5F, 0x2D3748, 0x4A3728, 0x1A1A2E, 0x374151],
}

export function RioLogin() {
  const {
    loginPhase,
    nickname,
    perfil,
    avatar,
    setNickname,
    setLoginPhase,
    setPerfil,
    setAvatar,
    setAlumnoId,
  } = useRioMundoStore()

  const [inputNickname, setInputNickname] = useState(nickname || '')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'nickname' | 'avatar'>(loginPhase === 'avatar_select' ? 'avatar' : 'nickname')

  const handleNicknameSubmit = useCallback(async () => {
    if (!inputNickname.trim()) {
      setError('Escribe tu apodo para empezar')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/hivelearn/student-by-nickname?nickname=${encodeURIComponent(inputNickname.trim())}`)
      const data = await res.json()

      if (data.found && data.profile) {
        // Existing student — restore session
        setPerfil(data.profile)
        setAlumnoId(data.profile.alumnoId)
        setNickname(data.profile.nickname)
        setLoginPhase('restoring_session')
      } else {
        // New student — create profile
        setNickname(inputNickname.trim())
        setLoginPhase('new_profile')
        setStep('avatar')
      }
    } catch (err) {
      // Offline mode — create local profile
      setNickname(inputNickname.trim())
      setLoginPhase('new_profile')
      setStep('avatar')
    } finally {
      setIsLoading(false)
    }
  }, [inputNickname])

  const handleAvatarConfirm = useCallback(() => {
    setLoginPhase('entering_world')
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && step === 'nickname') {
      handleNicknameSubmit()
    }
  }, [step, handleNicknameSubmit])

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e27]/90 backdrop-blur-sm z-50">
      <div className="max-w-md w-full mx-4">
        {step === 'nickname' && (
          <div className="bg-[#1a1f3a] rounded-2xl border border-[#fbbf24]/30 p-8 shadow-2xl">
            {/* Bee icon */}
            <div className="text-center mb-6">
              <div className="text-5xl mb-2 animate-bounce">🐝</div>
              <h2 className="text-[#fbbf24] font-bold text-xl">Bienvenido al Rio</h2>
              <p className="text-[#888] text-sm mt-2">
                Escribe tu apodo para empezar a aprender
              </p>
            </div>

            <input
              type="text"
              value={inputNickname}
              onChange={(e) => {
                setInputNickname(e.target.value)
                setError(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Tu apodo..."
              autoFocus
              className="w-full px-4 py-3 bg-[#0a0e27] border border-[#fbbf24]/40 rounded-xl text-white text-center text-lg placeholder-[#555] focus:outline-none focus:border-[#fbbf24] transition-colors"
              disabled={isLoading}
            />

            {error && (
              <p className="text-[#ef4444] text-sm text-center mt-2">{error}</p>
            )}

            <button
              onClick={handleNicknameSubmit}
              disabled={isLoading || !inputNickname.trim()}
              className="w-full mt-4 px-6 py-3 bg-[#fbbf24] hover:bg-[#f59e0b] disabled:bg-[#555] disabled:cursor-not-allowed text-[#0a0e27] font-bold rounded-xl transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#0a0e27] border-t-transparent rounded-full animate-spin" />
                  Buscando...
                </span>
              ) : (
                'Entrar al rio'
              )}
            </button>

            <p className="text-[#555] text-xs text-center mt-4">
              Si ya tienes una sesion, se cargara tu progreso
            </p>
          </div>
        )}

        {step === 'avatar' && (
          <div className="bg-[#1a1f3a] rounded-2xl border border-[#fbbf24]/30 p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="text-5xl mb-2">🎨</div>
              <h2 className="text-[#fbbf24] font-bold text-xl">Personaliza tu avatar</h2>
              <p className="text-[#888] text-sm mt-2">
                Elige como quieres verse en el mundo
              </p>
            </div>

            {/* Avatar preview */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-32 bg-[#0a0e27] rounded-xl border border-[#fbbf24]/20 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl" style={{ filter: `hue-rotate(${avatar.shirtColor}deg)` }}>
                    🧑
                  </div>
                  <div className="text-[#fbbf24] text-xs mt-1">{nickname}</div>
                </div>
              </div>
            </div>

            {/* Skin color */}
            <div className="mb-4">
              <label className="text-[#888] text-xs block mb-2">Color de piel</label>
              <div className="flex gap-2 justify-center">
                {AVATAR_COLORS.skin.map((color, i) => (
                  <button
                    key={i}
                    onClick={() => setAvatar({ skinColor: color })}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      avatar.skinColor === color ? 'border-[#fbbf24] scale-110' : 'border-transparent hover:border-[#555]'
                    }`}
                    style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                  />
                ))}
              </div>
            </div>

            {/* Hair color */}
            <div className="mb-4">
              <label className="text-[#888] text-xs block mb-2">Color de cabello</label>
              <div className="flex gap-2 justify-center">
                {AVATAR_COLORS.hair.map((color, i) => (
                  <button
                    key={i}
                    onClick={() => setAvatar({ hairColor: color })}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      avatar.hairColor === color ? 'border-[#fbbf24] scale-110' : 'border-transparent hover:border-[#555]'
                    }`}
                    style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                  />
                ))}
              </div>
            </div>

            {/* Shirt color */}
            <div className="mb-4">
              <label className="text-[#888] text-xs block mb-2">Color de ropa</label>
              <div className="flex gap-2 justify-center">
                {AVATAR_COLORS.shirt.map((color, i) => (
                  <button
                    key={i}
                    onClick={() => setAvatar({ shirtColor: color })}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      avatar.shirtColor === color ? 'border-[#fbbf24] scale-110' : 'border-transparent hover:border-[#555]'
                    }`}
                    style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handleAvatarConfirm}
              className="w-full px-6 py-3 bg-[#fbbf24] hover:bg-[#f59e0b] text-[#0a0e27] font-bold rounded-xl transition-colors"
            >
              Comenzar aventura
            </button>
          </div>
        )}
      </div>
    </div>
  )
}