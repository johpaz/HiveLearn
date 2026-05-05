import React, { useState, useCallback, useEffect } from 'react'
import { useRioMundoStore } from '@/store/rioMundoStore'
import type { StudentProfile } from '@hivelearn/core'

// ─── Color Palettes ─────────────────────────────────────────────────────────

const PALETTES = {
  skin: [
    { name: 'Clara', value: '#FFDFC4' },
    { name: 'Media', value: '#E8B88A' },
    { name: 'Morena', value: '#C68642' },
    { name: 'Oscura', value: '#8D5524' },
    { name: 'Profunda', value: '#4A2511' },
  ],
  hair: [
    { name: 'Negro', value: '#1A1A1A' },
    { name: 'Castaño', value: '#4A3728' },
    { name: 'Rubio', value: '#D4A574' },
    { name: 'Pelirrojo', value: '#CD5C5C' },
    { name: 'Gris', value: '#808080' },
    { name: 'Verde', value: '#228B22' },
  ],
  shirt: [
    { name: 'Azul', value: '#3B82F6' },
    { name: 'Verde', value: '#10B981' },
    { name: 'Rojo', value: '#EF4444' },
    { name: 'Morado', value: '#8B5CF6' },
    { name: 'Amarillo', value: '#F59E0B' },
    { name: 'Rosa', value: '#EC4899' },
  ],
  pants: [
    { name: 'Azul', value: '#1E3A5F' },
    { name: 'Gris', value: '#374151' },
    { name: 'Marrón', value: '#4A3728' },
    { name: 'Negro', value: '#1A1A2E' },
    { name: 'Verde', value: '#14532D' },
  ],
}

// ─── Avatar Preview (CSS Chibi) ────────────────────────────────────────────

function AvatarPreview({ skin, hair, shirt, pants }: { skin: string; hair: string; shirt: string; pants: string }) {
  return (
    <div className="relative w-28 h-36 mx-auto">
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-3 bg-black/20 rounded-full blur-sm" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-14 h-12 rounded-xl" style={{ backgroundColor: shirt }}>
        <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl opacity-20" style={{ backgroundColor: 'white' }} />
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-1">
        <div className="w-4 h-5 rounded-b-lg" style={{ backgroundColor: pants }} />
        <div className="w-4 h-5 rounded-b-lg" style={{ backgroundColor: pants }} />
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-16 h-3 flex justify-between">
        <div className="w-3 h-8 rounded-full -rotate-12" style={{ backgroundColor: skin }} />
        <div className="w-3 h-8 rounded-full rotate-12" style={{ backgroundColor: skin }} />
      </div>
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-14 h-14 rounded-2xl" style={{ backgroundColor: skin }}>
        <div className="absolute -top-2 -left-1 -right-1 h-7 rounded-t-2xl" style={{ backgroundColor: hair }} />
        <div className="absolute -top-1 left-1.5 w-3.5 h-5 rounded-full" style={{ backgroundColor: hair }} />
        <div className="absolute -top-1 right-1.5 w-3.5 h-5 rounded-full" style={{ backgroundColor: hair }} />
        <div className="absolute top-5 left-2.5 w-3 h-3.5 bg-white rounded-full">
          <div className="absolute top-0.5 right-0.5 w-1.5 h-2 bg-[#1a1a2e] rounded-full" />
        </div>
        <div className="absolute top-5 right-2.5 w-3 h-3.5 bg-white rounded-full">
          <div className="absolute top-0.5 right-0.5 w-1.5 h-2 bg-[#1a1a2e] rounded-full" />
        </div>
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-2.5 h-1.5 bg-[#d97706] rounded-b-full" />
        <div className="absolute top-8 left-1 w-2 h-1 bg-red-400/30 rounded-full" />
        <div className="absolute top-8 right-1 w-2 h-1 bg-red-400/30 rounded-full" />
      </div>
    </div>
  )
}

// ─── Color Swatch ───────────────────────────────────────────────────────────

function ColorSwatch({ color, selected, onClick, label }: { color: string; selected: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-9 h-9 rounded-full border-2 transition-all hover:scale-110 ${
        selected ? 'border-[#fbbf24] scale-110 shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 'border-transparent hover:border-white/30'
      }`}
      style={{ backgroundColor: color }}
      title={label}
    >
      {selected && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 8L7 12L13 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

type LoginStep = 'nickname' | 'existing_welcome' | 'new_profile' | 'creating'

interface ExistingProfile {
  alumnoId: string
  nombre: string
  nickname: string
  avatar: string
  edad: number
  estado: string
  sesionesTotal: number
  xpAcumulado: number
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function RioLogin() {
  const {
    nickname,
    avatar,
    setNickname,
    setLoginPhase,
    setAvatar,
    setAlumnoId,
    setPerfil,
    setSessionId,
    setTema,
    setMeta,
    updateOnboarding,
  } = useRioMundoStore()

  // Crossfade a hub_theme cuando se monta el login
  useEffect(() => {
    const am = useRioMundoStore.getState().audioManager
    if (am) {
      am.crossfadeMusic('hubMusic', 1500)
    }
  }, [])

  const [step, setStep] = useState<LoginStep>('nickname')
  const [inputNickname, setInputNickname] = useState('')
  const [existingProfile, setExistingProfile] = useState<ExistingProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // New profile form
  const [newNombre, setNewNombre] = useState('')
  const [newEdad, setNewEdad] = useState('')
  const [newAvatar, setNewAvatar] = useState({
    skin: PALETTES.skin[2].value,
    hair: PALETTES.hair[1].value,
    shirt: PALETTES.shirt[0].value,
    pants: PALETTES.pants[0].value,
  })

  // Session creation
  const [temaInput, setTemaInput] = useState('')
  const [objetivoInput, setObjetivoInput] = useState('')

  // Check if we should skip to existing (from store restore)
  useEffect(() => {
    const store = useRioMundoStore.getState()
    if (store.nickname && store.perfil?.alumnoId) {
      setInputNickname(store.nickname)
      setExistingProfile(store.perfil as ExistingProfile)
      // Alumno existente restaurado: saltar directo al mundo
      updateOnboarding({
        nombre: store.perfil.nombre,
        edad: store.perfil.edad,
      })
      setLoginPhase('entering_world')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Step 1: Nickname lookup ─────────────────────────────────────────────

  const sendWsMessage = useRioMundoStore.getState().sendWsMessage

  const loginSearchResult = useRioMundoStore(s => s.loginSearchResult)

  // Watch WS search results
  useEffect(() => {
    if (!loginSearchResult) return

    if (loginSearchResult.found && loginSearchResult.profile) {
      const profile = loginSearchResult.profile as ExistingProfile
      setExistingProfile(profile)
      setNickname(profile.nickname)
      setAlumnoId(profile.alumnoId)
      setPerfil(profile as StudentProfile)
      // Alumno existente: saltar directo al mundo, el onboarding bee manejará tema/objetivo si falta
      updateOnboarding({
        nombre: profile.nombre,
        edad: profile.edad,
      })
      setLoginPhase('entering_world')
    } else {
      setNickname(inputNickname.trim())
      setNewNombre(inputNickname.trim())
      setStep('new_profile')
    }
    setIsLoading(false)
    // Reset so this effect doesn't fire again
    useRioMundoStore.getState().setLoginSearchResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginSearchResult])

  const handleNicknameSubmit = useCallback(async () => {
    if (!inputNickname.trim()) {
      setError('Escribe tu apodo para empezar')
      return
    }
    if (inputNickname.trim().length < 2) {
      setError('El apodo debe tener al menos 2 caracteres')
      return
    }

    setIsLoading(true)
    setError(null)

    const sendWs = useRioMundoStore.getState().sendWsMessage
    if (sendWs) {
      sendWs({
        tipo: 'buscar_nickname',
        nickname: inputNickname.trim(),
      })
    } else {
      // Offline — treat as new student
      setNickname(inputNickname.trim())
      setNewNombre(inputNickname.trim())
      setStep('new_profile')
      setIsLoading(false)
    }
  }, [inputNickname, setNickname])

  // ─── Step 2A: Existing student — Welcome back ────────────────────────────

  const handleExistingCreateSession = useCallback(async () => {
    if (!temaInput.trim()) {
      setError('¿Qué quieres aprender?')
      return
    }

    setIsLoading(true)
    setError(null)

    const alumnoId = existingProfile!.alumnoId
    const sessionId = crypto.randomUUID()
    const objetivo = objetivoInput.trim() || `Aprender ${temaInput.trim()}`

    // Create session on server via WS (fire and forget)
    const sendWs = useRioMundoStore.getState().sendWsMessage
    if (sendWs) {
      sendWs({
        tipo: 'crear_sesion',
        alumnoId,
        sessionId,
        tema: temaInput.trim(),
        objetivo,
      })
    }

    // Update store
    setSessionId(sessionId)
    setTema(temaInput.trim())
    setMeta(objetivo)
    updateOnboarding({
      nombre: existingProfile!.nombre,
      edad: existingProfile!.edad,
      tema: temaInput.trim(),
      objetivo,
      estilo: 'visual',
    })

    setIsLoading(false)
    setLoginPhase('entering_world')
  }, [existingProfile, temaInput, objetivoInput, setSessionId, setTema, setMeta, updateOnboarding, setLoginPhase])

  // ─── Step 2B: New student — Create profile ───────────────────────────────

  const handleNewProfileSubmit = useCallback(async () => {
    if (!newNombre.trim()) {
      setError('Escribe tu nombre')
      return
    }
    if (!newEdad.trim() || isNaN(Number(newEdad)) || Number(newEdad) < 3 || Number(newEdad) > 120) {
      setError('Escribe una edad válida (3-120)')
      return
    }
    if (!inputNickname.trim()) {
      setError('El apodo es requerido')
      return
    }

    setIsLoading(true)
    setError(null)

    const alumnoId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const edad = Number(newEdad)

    // Create student profile on server via WS (fire and forget)
    const sendWs = useRioMundoStore.getState().sendWsMessage
    if (sendWs) {
      sendWs({
        tipo: 'crear_alumno',
        nombre: newNombre.trim(),
        nickname: inputNickname.trim(),
        edad,
      })
    }

    // Update store
    setAlumnoId(alumnoId)
    setNickname(inputNickname.trim())
    setPerfil({
      alumnoId,
      nombre: newNombre.trim(),
      nickname: inputNickname.trim(),
      avatar: '',
      edad,
      estado: 'activo',
      sesionesTotal: 0,
      xpAcumulado: 0,
    })
    setAvatar({
      skinColor: parseInt(newAvatar.skin.replace('#', ''), 16),
      hairColor: parseInt(newAvatar.hair.replace('#', ''), 16),
      shirtColor: parseInt(newAvatar.shirt.replace('#', ''), 16),
      pantsColor: parseInt(newAvatar.pants.replace('#', ''), 16),
    })

    // Session will be created after onboarding or directly
    setSessionId(sessionId)

    // For new users, we still need tema/objetivo. Let's ask in a simple way
    // or skip to entering_world where onboarding_chat handles it
    setIsLoading(false)
    setLoginPhase('entering_world')
  }, [newNombre, newEdad, inputNickname, newAvatar, setAlumnoId, setNickname, setPerfil, setAvatar, setSessionId, setLoginPhase])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') action()
  }, [])

  // ─── Render helpers ──────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e27]/80 backdrop-blur-md z-50 transition-opacity duration-500">
      <div className="max-w-md w-full mx-4">

        {/* ═══ STEP 1: Nickname Input ═══ */}
        {step === 'nickname' && (
          <div className="bg-[#0f1a3a]/90 rounded-3xl border border-[#fbbf24]/20 p-8 shadow-2xl backdrop-blur-sm">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3 animate-bounce">🐝</div>
              <h2 className="text-[#fbbf24] font-black text-2xl tracking-tight">
                ¿Cómo te llaman?
              </h2>
              <p className="text-[#888] text-sm mt-2">
                Tu apodo te identifica en el Río del Saber
              </p>
            </div>

            <div className="relative mb-4">
              <input
                type="text"
                value={inputNickname}
                onChange={(e) => { setInputNickname(e.target.value); setError(null) }}
                onKeyDown={(e) => handleKeyDown(e, handleNicknameSubmit)}
                placeholder="Tu apodo..."
                autoFocus
                maxLength={20}
                className="w-full px-5 py-4 bg-[#0a0e27] border-2 border-[#fbbf24]/30 rounded-2xl text-white text-center text-lg placeholder-[#555] focus:outline-none focus:border-[#fbbf24] focus:shadow-[0_0_20px_rgba(245,158,11,0.2)] transition-all"
                disabled={isLoading}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#555] text-xs">
                {inputNickname.length}/20
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[#ef4444] text-sm text-center justify-center mb-4 animate-pulse">
                <span>⚠️</span>{error}
              </div>
            )}

            <button
              onClick={handleNicknameSubmit}
              disabled={isLoading || !inputNickname.trim()}
              className="w-full py-4 bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] hover:from-[#f59e0b] hover:to-[#d97706] disabled:from-[#333] disabled:to-[#333] disabled:cursor-not-allowed text-[#0a0e27] font-black text-lg rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-[#0a0e27] border-t-transparent rounded-full animate-spin" />
                  Buscando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">Continuar →</span>
              )}
            </button>
          </div>
        )}

        {/* ═══ STEP 2A: Existing Student — Welcome Back ═══ */}
        {step === 'existing_welcome' && existingProfile && (
          <div className="bg-[#0f1a3a]/90 rounded-3xl border border-[#fbbf24]/20 p-8 shadow-2xl backdrop-blur-sm">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">👋</div>
              <h2 className="text-[#fbbf24] font-black text-2xl tracking-tight">
                ¡Hola de vuelta, {existingProfile.nombre}!
              </h2>
              <p className="text-[#888] text-sm mt-2">
                Explorador del Río • {existingProfile.edad} años • {existingProfile.xpAcumulado} XP
              </p>
            </div>

            <div className="bg-[#0a0e27]/50 rounded-2xl p-4 mb-6 border border-white/5 text-center">
              <div className="text-6xl mb-2">🧑‍🎓</div>
              <div className="text-[#fbbf24] font-bold">{existingProfile.nickname}</div>
              <div className="text-[#888] text-xs mt-1">{existingProfile.sesionesTotal} sesiones completadas</div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[#888] text-xs font-bold uppercase tracking-wider block mb-2">
                  ¿Qué quieres aprender hoy?
                </label>
                <input
                  type="text"
                  value={temaInput}
                  onChange={(e) => { setTemaInput(e.target.value); setError(null) }}
                  onKeyDown={(e) => handleKeyDown(e, handleExistingCreateSession)}
                  placeholder="Ej: Programación, Matemáticas, Historia..."
                  autoFocus
                  className="w-full px-4 py-3 bg-[#0a0e27] border-2 border-[#fbbf24]/30 rounded-xl text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#fbbf24] transition-all"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="text-[#888] text-xs font-bold uppercase tracking-wider block mb-2">
                  ¿Cuál es tu objetivo? (opcional)
                </label>
                <input
                  type="text"
                  value={objetivoInput}
                  onChange={(e) => setObjetivoInput(e.target.value)}
                  placeholder="Ej: Quiero aprender Python desde cero..."
                  className="w-full px-4 py-3 bg-[#0a0e27] border-2 border-[#fbbf24]/20 rounded-xl text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#fbbf24]/50 transition-all"
                  disabled={isLoading}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[#ef4444] text-sm text-center justify-center mb-4 animate-pulse">
                <span>⚠️</span>{error}
              </div>
            )}

            <button
              onClick={handleExistingCreateSession}
              disabled={isLoading || !temaInput.trim()}
              className="w-full py-4 bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] hover:from-[#f59e0b] hover:to-[#d97706] disabled:from-[#333] disabled:to-[#333] disabled:cursor-not-allowed text-[#0a0e27] font-black text-lg rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-[#0a0e27] border-t-transparent rounded-full animate-spin" />
                  Creando sesión...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  🚀 Crear Sesión
                </span>
              )}
            </button>

            <button
              onClick={() => { setStep('nickname'); setInputNickname(''); setExistingProfile(null) }}
              className="w-full mt-3 py-2 text-[#888] text-sm hover:text-[#fbbf24] transition-colors"
            >
              ← No soy yo, cambiar apodo
            </button>
          </div>
        )}

        {/* ═══ STEP 2B: New Student — Create Profile ═══ */}
        {step === 'new_profile' && (
          <div className="bg-[#0f1a3a]/90 rounded-3xl border border-[#fbbf24]/20 p-8 shadow-2xl backdrop-blur-sm max-h-[85vh] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🌟</div>
              <h2 className="text-[#fbbf24] font-black text-xl">
                ¡Bienvenido, nuevo explorador!
              </h2>
              <p className="text-[#888] text-xs mt-1">
                Cuéntanos un poco sobre ti
              </p>
            </div>

            {/* Avatar Preview */}
            <div className="bg-[#0a0e27]/50 rounded-2xl p-3 mb-4 border border-white/5">
              <AvatarPreview skin={newAvatar.skin} hair={newAvatar.hair} shirt={newAvatar.shirt} pants={newAvatar.pants} />
            </div>

            {/* Name */}
            <div className="mb-3">
              <label className="text-[#888] text-xs font-bold uppercase tracking-wider block mb-1.5">
                Tu nombre completo
              </label>
              <input
                type="text"
                value={newNombre}
                onChange={(e) => { setNewNombre(e.target.value); setError(null) }}
                placeholder="Ej: Juan Pérez"
                className="w-full px-4 py-2.5 bg-[#0a0e27] border-2 border-[#fbbf24]/20 rounded-xl text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#fbbf24]/50 transition-all"
                disabled={isLoading}
              />
            </div>

            {/* Edad */}
            <div className="mb-3">
              <label className="text-[#888] text-xs font-bold uppercase tracking-wider block mb-1.5">
                Tu edad
              </label>
              <input
                type="number"
                value={newEdad}
                onChange={(e) => { setNewEdad(e.target.value); setError(null) }}
                placeholder="Ej: 25"
                min={3}
                max={120}
                className="w-full px-4 py-2.5 bg-[#0a0e27] border-2 border-[#fbbf24]/20 rounded-xl text-white text-sm placeholder-[#555] focus:outline-none focus:border-[#fbbf24]/50 transition-all"
                disabled={isLoading}
              />
            </div>

            {/* Nickname (already set, show as read-only) */}
            <div className="mb-4">
              <label className="text-[#888] text-xs font-bold uppercase tracking-wider block mb-1.5">
                Tu apodo en el Río
              </label>
              <div className="w-full px-4 py-2.5 bg-[#0a0e27]/50 border border-[#fbbf24]/20 rounded-xl text-[#fbbf24] text-sm font-bold">
                {inputNickname}
              </div>
            </div>

            {/* Color Pickers */}
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-[#888] text-[10px] font-bold uppercase tracking-wider block mb-1.5">Piel</label>
                <div className="flex gap-2 flex-wrap">
                  {PALETTES.skin.map((c) => (
                    <ColorSwatch key={c.value} color={c.value} label={c.name} selected={newAvatar.skin === c.value} onClick={() => setNewAvatar({ ...newAvatar, skin: c.value })} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[#888] text-[10px] font-bold uppercase tracking-wider block mb-1.5">Cabello</label>
                <div className="flex gap-2 flex-wrap">
                  {PALETTES.hair.map((c) => (
                    <ColorSwatch key={c.value} color={c.value} label={c.name} selected={newAvatar.hair === c.value} onClick={() => setNewAvatar({ ...newAvatar, hair: c.value })} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[#888] text-[10px] font-bold uppercase tracking-wider block mb-1.5">Ropa</label>
                <div className="flex gap-2 flex-wrap">
                  {PALETTES.shirt.map((c) => (
                    <ColorSwatch key={c.value} color={c.value} label={c.name} selected={newAvatar.shirt === c.value} onClick={() => setNewAvatar({ ...newAvatar, shirt: c.value })} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[#888] text-[10px] font-bold uppercase tracking-wider block mb-1.5">Pantalón</label>
                <div className="flex gap-2 flex-wrap">
                  {PALETTES.pants.map((c) => (
                    <ColorSwatch key={c.value} color={c.value} label={c.name} selected={newAvatar.pants === c.value} onClick={() => setNewAvatar({ ...newAvatar, pants: c.value })} />
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-[#ef4444] text-sm text-center justify-center mb-4 animate-pulse">
                <span>⚠️</span>{error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('nickname'); setNewNombre(''); setNewEdad('') }}
                className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 font-semibold rounded-xl transition-all text-sm"
              >
                ← Volver
              </button>
              <button
                onClick={handleNewProfileSubmit}
                disabled={isLoading}
                className="flex-[2] py-3 bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] hover:from-[#f59e0b] hover:to-[#d97706] text-[#0a0e27] font-black rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg text-sm"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#0a0e27] border-t-transparent rounded-full animate-spin" />
                    Creando...
                  </span>
                ) : (
                  '🚀 ¡Comenzar Aventura!'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
