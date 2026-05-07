import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { ProgramaMundo } from '@/canvaslearn/programa/ProgramaMundo'
import { ProgramaProgressHUD } from '@/canvaslearn/programa/overlays/ProgramaProgressHUD'
import { RioOnboardingChat } from '@/canvaslearn/rio/onboarding/RioOnboardingChat'
import { RioOnboardingController } from '@/canvaslearn/rio/onboarding/RioOnboardingController'
import { RioWelcomeOverlay } from '@/canvaslearn/rio/overlays/RioWelcomeOverlay'
import { RioLogin } from '@/canvaslearn/rio/overlays/RioLogin'
import { RioA2UIBridge, type RioBridgeRef } from '@/canvaslearn/rio/protocol/RioA2UIBridge'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import { useTTSSpeak } from '@/hooks/useTTSSpeak'

const LOGIN_PHASES = new Set([
  'nickname_input',
  'avatar_select',
  'loading',
  'restoring_session',
  'new_profile',
])

export function ProgramaMundoPage() {
  const navigate = useNavigate()
  const onboardingRef = useRef(new RioOnboardingController())
  const bridgeRef = useRef<RioA2UIBridge | null>(null)
  const rioBridgeObj = useRef<RioBridgeRef>({ renderer: null, dialog: null })
  const generationStartedRef = useRef(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [worldReady, setWorldReady] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const { speak: beeSpeak } = useTTSSpeak()

  const alumnoId = useRioMundoStore(s => s.alumnoId)
  const sessionId = useRioMundoStore(s => s.sessionId)
  const programaUuid = useRioMundoStore(s => s.programaUuid)
  const perfil = useRioMundoStore(s => s.perfil)
  const wsStatus = useRioMundoStore(s => s.wsStatus)
  const isGenerating = useRioMundoStore(s => s.isGenerating)
  const programaError = useRioMundoStore(s => s.programaError)
  const loginPhase = useRioMundoStore(s => s.loginPhase)
  const setSessionId = useRioMundoStore(s => s.setSessionId)
  const setLoginPhase = useRioMundoStore(s => s.setLoginPhase)
  const setProgramaError = useRioMundoStore(s => s.setProgramaError)

  // ─── Reanudar sesión cuando se elige "Continuar" ─────────────────────────────

  useEffect(() => {
    if (loginPhase !== 'restoring_session') return
    if (!perfil) return
    const state = useRioMundoStore.getState()
    if (state.programaUuid) {
      setLoginPhase('entering_world')
      return
    }
    if (state.sendWsMessage && perfil.alumnoId) {
      state.sendWsMessage({
        tipo: 'reanudar_sesion',
        alumnoId: perfil.alumnoId,
      })
    }
  }, [loginPhase, perfil, setLoginPhase])

  // ─── Crear sessionId cuando entramos al mundo ────────────────────────────────

  useEffect(() => {
    if (loginPhase === 'entering_world' && alumnoId && !sessionId) {
      setSessionId(crypto.randomUUID())
    }
  }, [loginPhase, alumnoId, sessionId, setSessionId])

  // ─── A2UI bridge ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !alumnoId) return
    const bridge = new RioA2UIBridge({ sessionId, alumnoId, rioRef: rioBridgeObj.current })
    bridgeRef.current = bridge
    ;(useRioMundoStore.getState() as any)._rioBridge = bridge
    return () => {
      bridge.destroy()
      bridgeRef.current = null
      ;(useRioMundoStore.getState() as any)._rioBridge = null
    }
  }, [sessionId, alumnoId])

  // ─── Si ya hay programa generado (sesión restaurada) → ir directo a /rio ────

  useEffect(() => {
    if (programaUuid && !generationStartedRef.current) {
      setLoginPhase('entering_world')
      navigate('/rio', { replace: true })
    }
  }, [programaUuid, navigate, setLoginPhase])

  // ─── Cuando programaUuid llega DURANTE generación → navegar a /rio ──────────

  useEffect(() => {
    if (!programaUuid) return
    if (!generationStartedRef.current) return
    setLoginPhase('entering_world')
    navigate('/rio', { replace: true })
  }, [programaUuid, navigate, setLoginPhase])

  // ─── Inicializar fase si está vacía ──────────────────────────────────────────

  useEffect(() => {
    if (loginPhase === 'in_world' || loginPhase === 'swarm_tour') {
      // Resetear a flujo de bienvenida si llegamos sin programa
      if (!programaUuid) setLoginPhase('title_screen')
    }
  }, [loginPhase, programaUuid, setLoginPhase])

  // ─── Handlers de la escena Pixi ──────────────────────────────────────────────

  const handleWorldReady = useCallback((refs: { bee: any; dialog: any; renderer: any }) => {
    rioBridgeObj.current.renderer = refs.renderer
    rioBridgeObj.current.dialog = refs.dialog

    onboardingRef.current.setDialogRef(refs.dialog)
    onboardingRef.current.setSpeakFunction(beeSpeak)
    setWorldReady(true)

    // Si onboarding ya está completo (ej: alumno reanudando), saltarlo
    const o = useRioMundoStore.getState().onboarding
    const allComplete = !!(o.nombre && o.tema && o.objetivo && o.estilo)
    if (allComplete) {
      // Disparar iniciar_programa directamente
      handleOnboardingComplete({
        nombre: o.nombre,
        edad: o.edad ?? perfil?.edad ?? 18,
        tema: o.tema,
        objetivo: o.objetivo,
        estilo: o.estilo,
      })
    } else {
      setShowOnboarding(true)
      onboardingRef.current.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beeSpeak, perfil])

  // ─── Onboarding completo → disparar iniciar_programa ────────────────────────

  const handleOnboardingComplete = useCallback((data: Record<string, string | number>) => {
    setShowOnboarding(false)

    const store = useRioMundoStore.getState()
    const sendWs = store.sendWsMessage
    if (!sendWs) {
      setProgramaError({
        code: 'ws_no_disponible',
        message: 'No hay conexión con el servidor. Intenta de nuevo en unos segundos.',
      })
      return
    }
    if (!store.sessionId || !store.alumnoId) {
      setProgramaError({
        code: 'sesion_invalida',
        message: 'No se pudo crear la sesión. Recarga la página.',
      })
      return
    }

    const tema = String(data.tema || store.onboarding.tema || 'Aprendizaje general')
    const objetivo = String(data.objetivo || store.onboarding.objetivo || 'Aprender algo nuevo')
    const estilo = String(data.estilo || store.onboarding.estilo || 'visual')
    const nombre = String(data.nombre || store.onboarding.nombre || store.perfil?.nombre || store.nickname || 'Estudiante')
    const edad = Number(data.edad ?? store.onboarding.edad ?? store.perfil?.edad ?? 18)
    const meta = `Tema: ${tema}. Objetivo: ${objetivo}. Estilo: ${estilo}.`

    const perfilPayload = {
      alumnoId: store.alumnoId,
      nombre,
      nickname: store.nickname || nombre,
      avatar: store.perfil?.avatar || '',
      edad,
      estado: 'activo' as const,
      sesionesTotal: store.perfil?.sesionesTotal ?? 0,
      xpAcumulado: store.perfil?.xpAcumulado ?? 0,
    }

    store.setTema(tema)
    store.setMeta(meta)
    store.setIsGenerating(true)
    setProgramaError(null)

    generationStartedRef.current = true

    sendWs({
      tipo: 'iniciar_programa',
      session_id: store.sessionId,
      alumno_id: store.alumnoId,
      perfil: perfilPayload,
      meta,
    })
  }, [setProgramaError])

  const handleRetry = useCallback(() => {
    setProgramaError(null)
    const store = useRioMundoStore.getState()
    handleOnboardingComplete({
      nombre: store.onboarding.nombre || store.perfil?.nombre || '',
      edad: store.onboarding.edad ?? store.perfil?.edad ?? 18,
      tema: store.onboarding.tema || '',
      objetivo: store.onboarding.objetivo || '',
      estilo: store.onboarding.estilo || '',
    })
  }, [handleOnboardingComplete, setProgramaError])

  const handleMapError = useCallback((msg: string) => {
    console.warn('[ProgramaMundoPage] Map fallback used:', msg)
  }, [])

  // ─── UI ─────────────────────────────────────────────────────────────────────

  const isInLoginFlow = LOGIN_PHASES.has(loginPhase)
  const isInWorldPhase = loginPhase === 'entering_world' || loginPhase === 'onboarding_chat'
  const wsConnecting = wsStatus !== 'connected'

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0e27]">
      {/* Pixi scene only after avatar/login flow */}
      {isInWorldPhase && (
        <ProgramaMundo onReady={handleWorldReady} onMapError={handleMapError} />
      )}

      {/* Connection indicator */}
      <div className="absolute top-4 right-4 z-50 pointer-events-none">
        <ConnectionIndicator />
      </div>

      {/* Welcome overlay (title_screen) */}
      {showWelcome && (loginPhase === 'title_screen' || (!isInLoginFlow && !isInWorldPhase && !programaUuid)) && (
        <RioWelcomeOverlay
          onStart={() => {
            setShowWelcome(false)
            setLoginPhase('nickname_input')
          }}
          onContinue={() => {
            setShowWelcome(false)
            setLoginPhase('restoring_session')
          }}
        />
      )}

      {/* Login overlay (nickname → avatar) */}
      {isInLoginFlow && <RioLogin />}

      {/* Connecting overlay durante generación si WS cae */}
      {wsConnecting && isInWorldPhase && !programaError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a0e27]/70 backdrop-blur-sm">
          <div className="bg-[#1a1f3a]/95 border border-[#fbbf24]/30 rounded-2xl px-6 py-5 text-center">
            <div className="text-3xl mb-2 animate-bounce">🐝</div>
            <p className="text-[#fbbf24] font-bold text-sm">Conectando…</p>
            <p className="text-[#888] text-xs mt-1">Esperando al servidor</p>
          </div>
        </div>
      )}

      {/* Onboarding chat overlay (5 preguntas) */}
      {showOnboarding && worldReady && isInWorldPhase && !isGenerating && !programaError && (
        <RioOnboardingChat
          controller={onboardingRef.current}
          onComplete={handleOnboardingComplete}
        />
      )}

      {/* Progress HUD mientras swarm corre */}
      <ProgramaProgressHUD />

      {/* Error modal */}
      {programaError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0e27]/80 backdrop-blur-sm">
          <div className="bg-[#1a1f3a] border border-[#ef4444]/40 rounded-2xl px-6 py-5 max-w-md mx-4">
            <h3 className="text-[#ef4444] font-bold text-lg mb-2">Error generando el programa</h3>
            <p className="text-white/90 text-sm mb-1">{programaError.message}</p>
            {programaError.detail && (
              <pre className="mt-3 text-xs text-[#888] bg-[#0a0e27] rounded-lg p-3 max-h-32 overflow-auto whitespace-pre-wrap">
                {programaError.detail}
              </pre>
            )}
            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setProgramaError(null)
                  setShowOnboarding(true)
                }}
                className="px-4 py-2 rounded-xl bg-[#1a1f3a] border border-[#fbbf24]/30 text-[#fbbf24] text-sm font-bold hover:bg-[#252a4a] transition-colors"
              >
                Volver al chat
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 rounded-xl bg-[#fbbf24] text-[#0a0e27] text-sm font-bold hover:bg-[#f59e0b] transition-colors"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProgramaMundoPage
