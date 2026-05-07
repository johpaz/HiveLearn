import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { ProgramaMundo, type ProgramaMundoRefs, type ProgramaMode } from '@/canvaslearn/programa/ProgramaMundo'
import { ProgramaProgressHUD } from '@/canvaslearn/programa/overlays/ProgramaProgressHUD'
import { ProgramaHUD } from '@/canvaslearn/programa/overlays/ProgramaHUD'
import { PergaminoInput } from '@/canvaslearn/programa/overlays/PergaminoInput'
import { ProgramaConversation, type Phase } from '@/canvaslearn/programa/conversation/ProgramaConversation'
import { RioA2UIBridge, type RioBridgeRef } from '@/canvaslearn/rio/protocol/RioA2UIBridge'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'
import { useTTSSpeak } from '@/hooks/useTTSSpeak'

type PageStage = 'welcome' | 'world'

export function ProgramaMundoPage() {
  const navigate = useNavigate()
  const conversationRef = useRef(new ProgramaConversation())
  const bridgeRef = useRef<RioA2UIBridge | null>(null)
  const rioBridgeObj = useRef<RioBridgeRef>({ renderer: null, dialog: null })
  const worldRefs = useRef<ProgramaMundoRefs | null>(null)
  const generationStartedRef = useRef(false)
  const alumnoCreatedRef = useRef(false)
  const cardsSpawnedForPhaseRef = useRef<Phase | null>(null)
  const pendingNicknameRef = useRef<string | null>(null)

  const [stage, setStage] = useState<PageStage>('welcome')
  const [phase, setPhase] = useState<Phase>('idle')
  const [worldReady, setWorldReady] = useState(false)
  const [pergaminoAnchor, setPergaminoAnchor] = useState<{ x: number; y: number } | null>(null)
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

  // ─── A2UI bridge (cuando hay sessionId+alumnoId) ────────────────────────────

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

  // ─── programa listo (sesión restaurada) → /rio ──────────────────────────────

  useEffect(() => {
    if (!programaUuid) return
    setLoginPhase('entering_world')
    navigate('/rio', { replace: true })
  }, [programaUuid, navigate, setLoginPhase])

  // ─── Crear alumno cuando tenemos nickname+edad+avatar y aún no se creó ──────

  const ensureAlumno = useCallback(() => {
    if (alumnoCreatedRef.current) return
    const store = useRioMundoStore.getState()
    if (store.alumnoId) {
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
      sendWs({ tipo: 'crear_alumno', nombre: o.nombre, nickname: nick, edad: o.edad })
    }
    alumnoCreatedRef.current = true
  }, [setAlumnoId, setNickname, setSessionId, setPerfil])

  // ─── Phase change → spawn cards si aplica + transiciones ────────────────────

  const handlePhaseChange = useCallback((newPhase: Phase) => {
    setPhase(newPhase)

    const refs = worldRefs.current
    if (!refs) return

    // Avatar es la última fase que requiere haber registrado al alumno; antes de tema lo creamos
    if (newPhase === 'tema' || newPhase === 'avatar' || newPhase === 'objetivo' || newPhase === 'estilo') {
      ensureAlumno()
    }

    // Spawn cards si la phase usa cards
    const cards = conversationRef.current.getCardsForCurrentPhase()
    if (cards && cardsSpawnedForPhaseRef.current !== newPhase) {
      refs.cardSpawner.spawn(cards, refs.beeAnchor.x, refs.beeAnchor.y)
      cardsSpawnedForPhaseRef.current = newPhase
    }
    if (!cards && cardsSpawnedForPhaseRef.current !== null) {
      refs.cardSpawner.clear()
      cardsSpawnedForPhaseRef.current = null
    }
  }, [ensureAlumno])

  // ─── Setup conversation ──────────────────────────────────────────────────────

  const handleConversationComplete = useCallback((data: { nombre?: string; edad?: number; tema?: string; objetivo?: string; estilo?: string }) => {
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

  useEffect(() => {
    conversationRef.current.setSpeakFunction(beeSpeak)
    conversationRef.current.setOnPhaseChange(handlePhaseChange)
    conversationRef.current.setOnComplete(handleConversationComplete)
  }, [beeSpeak, handlePhaseChange, handleConversationComplete])

  // ─── World ready ─────────────────────────────────────────────────────────────

  const handleWorldReady = useCallback((refs: ProgramaMundoRefs) => {
    worldRefs.current = refs
    rioBridgeObj.current.renderer = refs.renderer
    rioBridgeObj.current.dialog = refs.dialog
    conversationRef.current.setRefs(refs.dialog)

    // Wire card select → conversation
    refs.cardSpawner.setOnSelect((id, value) => {
      const result = conversationRef.current.submitChoice(id, value)
      if (!result.ok && result.error) {
        console.warn('[ProgramaMundoPage] choice error:', result.error)
      }
    })

    setWorldReady(true)
  }, [])

  // ─── Iniciar conversación cuando entramos al stage 'world' ──────────────────

  useEffect(() => {
    if (stage !== 'world') return
    if (!worldReady) return
    // Pequeña pausa cinemática antes del primer prompt
    const t = setTimeout(() => {
      conversationRef.current.start()
    }, 500)
    return () => clearTimeout(t)
  }, [stage, worldReady])

  // ─── Reposicionar pergamino cuando cambia phase a captura ───────────────────

  useEffect(() => {
    if (!worldRefs.current) return
    if (phase === 'nickname' || phase === 'edad') {
      const refs = worldRefs.current
      const screen = refs.worldToScreen(refs.beeAnchor.x, refs.beeAnchor.y)
      setPergaminoAnchor({ x: screen.x, y: screen.y - 60 })
    } else {
      setPergaminoAnchor(null)
    }
  }, [phase])

  // ─── Tick para reposicionar pergamino con la cámara ─────────────────────────

  useEffect(() => {
    if (phase !== 'nickname' && phase !== 'edad') return
    let raf = 0
    const update = () => {
      const refs = worldRefs.current
      if (refs) {
        const screen = refs.worldToScreen(refs.beeAnchor.x, refs.beeAnchor.y)
        setPergaminoAnchor({ x: screen.x, y: screen.y - 60 })
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // ─── Pergamino submit ────────────────────────────────────────────────────────

  const handlePergaminoSubmit = useCallback((value: string) => {
    const result = conversationRef.current.submitText(value)
    if (!result.ok && result.error) {
      // Mostramos error inline en el pergamino — pero ya el componente lo gestiona
      console.warn('[ProgramaMundoPage] pergamino error:', result.error)
    }
  }, [])

  // ─── Welcome buttons handlers ───────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    const am = useRioMundoStore.getState().audioManager
    if (am) {
      try { await am.ensureCtx() } catch {}
      try { am.playMusic('worldPeaceful') } catch {}
    }
    setStage('world')
  }, [])

  const handleContinue = useCallback(async () => {
    const am = useRioMundoStore.getState().audioManager
    if (am) {
      try { await am.ensureCtx() } catch {}
    }
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

  // ─── Determinar modo del mundo ──────────────────────────────────────────────

  let worldMode: ProgramaMode = 'free'
  if (stage === 'welcome') worldMode = 'welcome'
  else if (phase === 'nickname' || phase === 'edad') worldMode = 'capturing'
  else if (isGenerating || programaError) worldMode = 'capturing'

  const wsConnecting = wsStatus !== 'connected'

  // ─── Pergamino props segun fase ─────────────────────────────────────────────

  const pergaminoVisible = (phase === 'nickname' || phase === 'edad') && !isGenerating && !programaError
  const pergaminoQuestion =
    phase === 'nickname' ? '¿Cómo te llamarán por aquí?'
    : phase === 'edad' ? '¿Cuántos años tienes?'
    : ''
  const pergaminoPlaceholder = phase === 'edad' ? 'Tu edad' : 'Tu nombre…'

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0e27]">
      {/* Pixi mundo siempre montado (incluso en welcome para mostrar el fondo) */}
      <ProgramaMundo
        mode={worldMode}
        onReady={handleWorldReady}
        onMapError={(msg) => console.warn('[ProgramaMundoPage]', msg)}
      />

      {/* HUD persistente (excepto en welcome) */}
      {stage === 'world' && <ProgramaHUD />}

      {/* Connection indicator */}
      <div className="absolute top-4 right-4 z-50 pointer-events-none">
        <ConnectionIndicator />
      </div>

      {/* Welcome cinema overlay */}
      {stage === 'welcome' && <WelcomeCinema onStart={handleStart} onContinue={hasSavedSession ? handleContinue : undefined} />}

      {/* Connecting overlay */}
      {wsConnecting && stage === 'world' && !programaError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0a0e27]/70 backdrop-blur-sm pointer-events-none">
          <div className="bg-[#1a1f3a]/95 border border-[#fbbf24]/30 rounded-2xl px-6 py-5 text-center">
            <div className="text-3xl mb-2 animate-bounce">🐝</div>
            <p className="text-[#fbbf24] font-bold text-sm">Conectando…</p>
            <p className="text-[#888] text-xs mt-1">Esperando al servidor</p>
          </div>
        </div>
      )}

      {/* Pergamino input para nickname / edad */}
      {pergaminoVisible && (
        <PergaminoInput
          visible={pergaminoVisible}
          question={pergaminoQuestion}
          placeholder={pergaminoPlaceholder}
          type={phase === 'edad' ? 'number' : 'text'}
          onSubmit={handlePergaminoSubmit}
          anchorScreenX={pergaminoAnchor?.x ?? null}
          anchorScreenY={pergaminoAnchor?.y ?? null}
        />
      )}

      {/* Progress HUD */}
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
                onClick={() => { setProgramaError(null); conversationRef.current.start() }}
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

// ─── Welcome Cinema (botones de portada sobre fondo Pixi) ────────────────────

function WelcomeCinema({ onStart, onContinue }: { onStart: () => void; onContinue?: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center transition-opacity duration-1000 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Vignette para realzar el título */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(10,14,39,0.65) 70%, rgba(10,14,39,0.92) 100%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center px-4">
        {/* Eslogan superior */}
        <p className="text-[#fbbf24]/70 text-xs uppercase tracking-[0.4em] mb-3 font-bold">La Colmena del Saber</p>

        {/* Título */}
        <h1
          className="relative text-7xl md:text-9xl font-black text-center tracking-tight mb-4"
          style={{
            background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 6px 18px rgba(245, 158, 11, 0.5))',
          }}
        >
          HiveLearn
        </h1>

        <p className="text-[#fbbf24]/80 text-sm md:text-base text-center mb-12 max-w-md">
          Aprende con tu enjambre de agentes IA en un mundo creado para ti
        </p>

        {/* Botones */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onStart}
            className="group relative px-12 py-4 bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] rounded-2xl text-[#0a0e27] font-black text-lg uppercase tracking-widest transition-all hover:scale-105 hover:shadow-[0_0_50px_rgba(245,158,11,0.6)] active:scale-95"
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">🎮</span>
              Iniciar Aventura
            </span>
            <span className="absolute inset-0 rounded-2xl bg-[#fbbf24] animate-ping opacity-20 pointer-events-none" />
          </button>

          {onContinue && (
            <button
              onClick={onContinue}
              className="px-8 py-3 bg-green-400/10 border-2 border-green-400/40 rounded-xl text-green-400 font-semibold text-sm transition-all hover:bg-green-400/20 hover:border-green-400 hover:scale-105"
            >
              📖 Continuar Aventura
            </button>
          )}
        </div>

        {/* Tech badges */}
        <div className="mt-12 flex flex-wrap justify-center gap-2 opacity-60">
          <span className="px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 text-[10px] uppercase tracking-wider text-white/70">🥟 Bun</span>
          <span className="px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 text-[10px] uppercase tracking-wider text-white/70">💎 Gemma</span>
          <span className="px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 text-[10px] uppercase tracking-wider text-white/70">✨ PixiJS</span>
          <span className="px-3 py-1 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 text-[10px] uppercase tracking-wider text-white/70">🌎 Latam</span>
        </div>
      </div>
    </div>
  )
}

export default ProgramaMundoPage
