import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { ProgramaWorld, type ProgramaMode } from '@/canvaslearn/programa3d/ProgramaWorld'
import { ProgressHUD } from '@/canvaslearn/programa3d/ui/ProgressHUD'
import { HudOverlay } from '@/canvaslearn/programa3d/ui/HudOverlay'
import { WelcomeOverlay } from '@/canvaslearn/programa3d/ui/WelcomeOverlay'
import { ProgramaConversation, type Phase } from '@/canvaslearn/programa3d/conversation/ProgramaConversation'
import { RioA2UIBridge, type RioBridgeRef } from '@/canvaslearn/rio/protocol/RioA2UIBridge'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import { useTTSSpeak } from '@/hooks/useTTSSpeak'
import { AudioManager } from '@/canvaslearn/rio/audio/AudioManager'

type Stage = 'welcome' | 'world'

export function ProgramaMundoPage() {
  const navigate = useNavigate()
  const conversationRef = useRef(new ProgramaConversation())
  const bridgeRef = useRef<RioA2UIBridge | null>(null)
  const rioBridgeObj = useRef<RioBridgeRef>({ renderer: null, dialog: null })
  const generationStartedRef = useRef(false)
  const alumnoCreatedRef = useRef(false)
  const pendingNicknameRef = useRef<string | null>(null)
  const audioManagerRef = useRef<AudioManager | null>(null)

  const [stage, setStage] = useState<Stage>('welcome')
  const [phase, setPhase] = useState<Phase>('idle')
  const [showWelcome, setShowWelcome] = useState(true)
  const [lookupPending, setLookupPending] = useState(false)
  const { speak: beeSpeak } = useTTSSpeak()

  const alumnoId = useRioMundoStore(s => s.alumnoId)
  const sessionId = useRioMundoStore(s => s.sessionId)
  const programaUuid = useRioMundoStore(s => s.programaUuid)
  const wsStatus = useRioMundoStore(s => s.wsStatus)
  const isGenerating = useRioMundoStore(s => s.isGenerating)
  const programaError = useRioMundoStore(s => s.programaError)
  const loginSearchResult = useRioMundoStore(s => s.loginSearchResult)
  const setSessionId = useRioMundoStore(s => s.setSessionId)
  const setLoginPhase = useRioMundoStore(s => s.setLoginPhase)
  const setProgramaError = useRioMundoStore(s => s.setProgramaError)
  const setAlumnoId = useRioMundoStore(s => s.setAlumnoId)
  const setNickname = useRioMundoStore(s => s.setNickname)
  const setPerfil = useRioMundoStore(s => s.setPerfil)
  const hasSavedSession = useRioMundoStore(s => !!(s.sessionId && s.programaUuid))

  useEffect(() => {
    if (audioManagerRef.current) return

    const store = useRioMundoStore.getState()
    const audioManager = new AudioManager()
    audioManagerRef.current = audioManager
    store.setAudioManager(audioManager)

    audioManager.init({
      musicVolume: store.audioSettings.musicVolume / 100,
      sfxVolume: store.audioSettings.sfxVolume / 100,
      musicMuted: store.audioSettings.musicMuted,
      sfxMuted: store.audioSettings.sfxMuted,
    }).then(async () => {
      await audioManager.preloadAssets({
        hubMusic: '/canvaslearn/art/music/hub_theme.ogg',
        worldPeaceful: '/canvaslearn/art/music/world_peaceful.ogg',
        sfx_applause: '/canvaslearn/art/sfx/applause.ogg',
      })
    })

    return () => {
      audioManager.destroy()
      if (audioManagerRef.current === audioManager) {
        audioManagerRef.current = null
      }
      if (useRioMundoStore.getState().audioManager === audioManager) {
        useRioMundoStore.getState().setAudioManager(null)
      }
    }
  }, [])

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

  // ─── Programa listo (sesión restaurada) → /rio ──────────────────────────────

  useEffect(() => {
    if (!programaUuid) return
    setLoginPhase('entering_world')
    navigate('/rio', { replace: true })
  }, [programaUuid, navigate, setLoginPhase])

  // ─── Crear alumno cuando tenemos nombre+edad y no existe alumnoId ──────────

  const ensureAlumno = useCallback(() => {
    if (alumnoCreatedRef.current) return
    const store = useRioMundoStore.getState()
    if (store.alumnoId) {
      if (!store.sessionId) setSessionId(crypto.randomUUID())
      alumnoCreatedRef.current = true
      return
    }
    const o = store.onboarding
    if (!o.nombre || o.edad == null) return

    const newAlumnoId = crypto.randomUUID()
    const newSessionId = crypto.randomUUID()
    const nick = store.nickname || o.nombre

    setAlumnoId(newAlumnoId)
    setNickname(nick)
    setSessionId(newSessionId)
    setPerfil({
      alumnoId: newAlumnoId,
      nombre: o.nombre,
      nickname: nick,
      avatar: '',
      edad: o.edad,
      estado: 'activo',
      sesionesTotal: 0,
      xpAcumulado: 0,
    })

    const sendWs = store.sendWsMessage
    if (sendWs) {
      sendWs({ tipo: 'crear_alumno', alumnoId: newAlumnoId, nombre: o.nombre, nickname: nick, edad: o.edad })
    }
    alumnoCreatedRef.current = true
  }, [setAlumnoId, setNickname, setSessionId, setPerfil])

  // ─── Phase change → ensureAlumno cuando aplica ──────────────────────────────

  const handlePhaseChange = useCallback((newPhase: Phase) => {
    setPhase(newPhase)
    if (newPhase === 'tema' || newPhase === 'avatar' || newPhase === 'objetivo' || newPhase === 'estilo') {
      ensureAlumno()
    }
  }, [ensureAlumno])

  // ─── Onboarding completo → iniciar_programa ─────────────────────────────────

  const handleConversationComplete = useCallback((data: any) => {
    const store = useRioMundoStore.getState()
    const sendWs = store.sendWsMessage
    if (!sendWs) {
      setProgramaError({ code: 'ws_no_disponible', message: 'No hay conexión con el servidor.' })
      return
    }
    if (!store.sessionId || !store.alumnoId) {
      setProgramaError({ code: 'sesion_invalida', message: 'No se pudo crear la sesión.' })
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

  // ─── Configurar conversation controller ──────────────────────────────────────

  useEffect(() => {
    conversationRef.current.setSpeakFunction(beeSpeak)
    conversationRef.current.setOnPhaseChange(handlePhaseChange)
    conversationRef.current.setOnComplete(handleConversationComplete)
  }, [beeSpeak, handlePhaseChange, handleConversationComplete])

  // ─── Pergamino submit ────────────────────────────────────────────────────────

  const handlePergaminoSubmit = useCallback((value: string) => {
    const trimmed = (value ?? '').trim()
    const currentPhase = conversationRef.current.getPhase()

    if (currentPhase === 'nickname') {
      if (trimmed.length < 2) {
        conversationRef.current.submitText(trimmed)
        return
      }
      const sendWs = useRioMundoStore.getState().sendWsMessage
      if (!sendWs) {
        conversationRef.current.submitText(trimmed)
        return
      }
      pendingNicknameRef.current = trimmed
      setLookupPending(true)
      sendWs({ tipo: 'buscar_nickname', nickname: trimmed })
      return
    }

    conversationRef.current.submitText(trimmed)
  }, [])

  // ─── Reaccionar a buscar_nickname response ──────────────────────────────────

  useEffect(() => {
    if (!lookupPending) return
    if (!loginSearchResult) return

    const found = !!(loginSearchResult.found && loginSearchResult.profile)
    setLookupPending(false)
    useRioMundoStore.getState().setLoginSearchResult(null)
    const pending = pendingNicknameRef.current
    pendingNicknameRef.current = null

    if (found) {
      const profile = loginSearchResult.profile!
      useRioMundoStore.getState().updateOnboarding({
        nombre: profile.nombre,
        edad: profile.edad ?? 18,
      })
      conversationRef.current.start()
    } else if (pending) {
      useRioMundoStore.getState().setNickname(pending)
      conversationRef.current.submitText(pending)
    }
  }, [lookupPending, loginSearchResult])

  // ─── Card select ─────────────────────────────────────────────────────────────

  const handleSelectCard = useCallback((id: string, value: string) => {
    conversationRef.current.submitChoice(id, value)
  }, [])

  // ─── Welcome handlers ────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    setShowWelcome(false)
    setStage('world')
    audioManagerRef.current?.playMusic('worldPeaceful').catch(() => {})
    // Pequeña pausa cinemática antes de la primera pregunta
    setTimeout(() => conversationRef.current.start(), 700)
  }, [])

  const handleContinue = useCallback(() => {
    setShowWelcome(false)
    const state = useRioMundoStore.getState()
    if (state.sendWsMessage && state.perfil?.alumnoId) {
      state.sendWsMessage({ tipo: 'reanudar_sesion', alumnoId: state.perfil.alumnoId })
    }
  }, [])

  const handleRetry = useCallback(() => {
    setProgramaError(null)
    const store = useRioMundoStore.getState()
    handleConversationComplete({
      nombre: store.onboarding.nombre || '',
      edad: store.onboarding.edad ?? 18,
      tema: store.onboarding.tema || '',
      objetivo: store.onboarding.objetivo || '',
      estilo: store.onboarding.estilo || '',
    })
  }, [handleConversationComplete, setProgramaError])

  // ─── Determinar mode + pergamino config ────────────────────────────────────

  let mode: ProgramaMode = 'free'
  if (stage === 'welcome') mode = 'welcome'
  else if (phase === 'nickname' || phase === 'edad') mode = 'capturing'
  else if (isGenerating || programaError) mode = 'capturing'

  const pergaminoVisible = (phase === 'nickname' || phase === 'edad') && !isGenerating && !programaError && stage === 'world'
  const pergaminoQuestion = phase === 'nickname'
    ? '¿Cómo te llamarán por aquí?'
    : phase === 'edad'
      ? '¿Cuántos años tienes?'
      : ''
  const pergaminoPlaceholder = phase === 'edad' ? 'Tu edad' : 'Tu nombre…'

  const wsConnecting = wsStatus !== 'connected'

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0e27]">
      <ProgramaWorld
        mode={mode}
        phase={phase}
        pergamino={{
          visible: pergaminoVisible,
          question: pergaminoQuestion,
          placeholder: pergaminoPlaceholder,
          type: phase === 'edad' ? 'number' : 'text',
          loading: lookupPending,
          onSubmit: handlePergaminoSubmit,
        }}
        onSelectCard={handleSelectCard}
      />

      {/* HUD persistente cuando estamos en mundo */}
      {stage === 'world' && <HudOverlay />}

      {/* Connection indicator */}
      <div className="absolute top-4 right-4 z-50 pointer-events-none">
        <ConnectionIndicator />
      </div>

      {/* Welcome overlay */}
      {showWelcome && (
        <WelcomeOverlay
          onStart={handleStart}
          onContinue={hasSavedSession ? handleContinue : undefined}
        />
      )}

      {/* Connecting overlay */}
      {wsConnecting && stage === 'world' && !programaError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a0e27]/70 backdrop-blur-sm pointer-events-none">
          <div className="bg-[#1a1f3a]/95 border border-[#fbbf24]/30 rounded-2xl px-6 py-5 text-center">
            <div className="text-3xl mb-2 animate-bounce">🐝</div>
            <p className="text-[#fbbf24] font-bold text-sm">Conectando…</p>
          </div>
        </div>
      )}

      {/* Progress HUD durante generación */}
      <ProgressHUD />

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
                onClick={() => { setProgramaError(null); conversationRef.current.start() }}
                className="px-4 py-2 rounded-xl bg-[#1a1f3a] border border-[#fbbf24]/30 text-[#fbbf24] text-sm font-bold hover:bg-[#252a4a] transition-colors"
              >
                Volver
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
