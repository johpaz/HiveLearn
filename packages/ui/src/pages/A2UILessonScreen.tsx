import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLessonStore } from '../store/lessonStore'
import { A2UIRenderer, A2UIFeedbackBanner } from '../a2ui/A2UIRenderer'
import { GamificationHUD } from './GamificationHUD'
import { wsUrl } from '../lib/wsUrl'

type WsStatus = 'connecting' | 'connected' | 'error' | 'done'

interface EvalFeedback {
  correcto: boolean
  xpGanado: number
  mensaje: string
  pista?: string
}

interface LogroMsg {
  titulo: string
  emoji: string
  descripcion: string
}

interface CompletionSummary {
  xpTotal: number
  mensaje: string
  nodosCompletados: number
  totalNodos: number
  logros: LogroMsg[]
  finalFeedback?: EvalFeedback | null
}

export function A2UILessonScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    sessionId: storeSessionId, program, xpTotal,
    setScreen, setSessionId, showXpFloat, incrementarRacha, resetRacha, perderVida,
    desbloquearLogro,
  } = useLessonStore()

  // Permite reanudar desde URL: /lesson?session=<id>
  const sessionId = searchParams.get('session') ?? storeSessionId

  useEffect(() => {
    const urlSession = searchParams.get('session')
    if (urlSession && urlSession !== storeSessionId) {
      setSessionId(urlSession)
    }
  }, [searchParams, storeSessionId, setSessionId])

  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')
  const [a2uiMessages, setA2uiMessages] = useState<any[]>([])
  const [currentNodoId, setCurrentNodoId] = useState<string | null>(null)
  const [xpDisponible, setXpDisponible] = useState(0)
  const [evalFeedback, setEvalFeedback] = useState<EvalFeedback | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: number; logro: LogroMsg }>>([])
  const [xpBurst, setXpBurst] = useState<{ amount: number; total: number } | null>(null)
  const [isPausing, setIsPausing] = useState(false)
  const [interactionStatus, setInteractionStatus] = useState<string | null>(null)
  const [awaitingServer, setAwaitingServer] = useState(false)
  const [pendingActionName, setPendingActionName] = useState<string | null>(null)
  const [completionSummary, setCompletionSummary] = useState<CompletionSummary | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const toastIdRef = useRef(0)

  const addToast = useCallback((logro: LogroMsg) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, logro }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setWsStatus('error')
      return
    }

    const ws = new WebSocket(wsUrl(`/hivelearn-lesson?sessionId=${encodeURIComponent(sessionId)}`))
    wsRef.current = ws

    ws.onopen = () => {
      setWsStatus('connected')
      ws.send(JSON.stringify({ type: 'init' }))
    }

    ws.onerror = () => setWsStatus('error')

    ws.onclose = (e) => {
      if (e.code !== 1000 && wsStatus !== 'done') setWsStatus('error')
    }

    ws.onmessage = (e) => {
      let msg: Record<string, any>
      try { msg = JSON.parse(e.data) } catch { return }

      if (msg.type === 'a2ui') {
        setA2uiMessages(msg.messages ?? [])
        setCurrentNodoId(msg.nodoId ?? null)
        setXpDisponible(msg.xpDisponible ?? 0)
        setEvalFeedback(null)
        setAwaitingServer(false)
        setPendingActionName(null)
        setInteractionStatus(null)
        return
      }

      if (msg.type === 'evaluation') {
        setEvalFeedback({
          correcto: Boolean(msg.correcto),
          xpGanado: msg.xpGanado ?? 0,
          mensaje: msg.mensaje ?? '',
          pista: msg.pista,
        })
        if (msg.correcto) incrementarRacha()
        else { perderVida(); resetRacha() }
        setAwaitingServer(false)
        setPendingActionName(null)
        setInteractionStatus(msg.correcto ? '¡Correcto! Preparando el siguiente paso...' : 'Revisa la pista e inténtalo otra vez.')
        return
      }

      if (msg.type === 'xp_award') {
        showXpFloat(currentNodoId ?? 'node', msg.amount ?? 0)
        setXpBurst({ amount: msg.amount ?? 0, total: msg.total ?? xpTotal })
        setInteractionStatus(`¡Ganaste +${msg.amount ?? 0} XP! Total actual: ${msg.total ?? xpTotal} XP.`)
        setTimeout(() => setXpBurst(null), 1800)
        return
      }

      if (msg.type === 'logro') {
        desbloquearLogro(msg.logro?.id ?? String(Date.now()))
        addToast(msg.logro)
        return
      }

      if (msg.type === 'lesson_complete') {
        setWsStatus('done')
        setAwaitingServer(false)
        setPendingActionName(null)
        setInteractionStatus('Lección completada. Preparando tu cierre final...')
        setCompletionSummary({
          xpTotal: msg.xpTotal ?? xpTotal,
          mensaje: msg.mensaje ?? '¡Lección completada!',
          nodosCompletados: msg.nodosCompletados ?? nodos.length,
          totalNodos: msg.totalNodos ?? nodos.length,
          logros: Array.isArray(msg.logros) ? msg.logros : [],
          finalFeedback: msg.feedbackFinal ? {
            correcto: Boolean(msg.feedbackFinal.correcto),
            xpGanado: Number(msg.feedbackFinal.xpGanado ?? 0),
            mensaje: msg.feedbackFinal.mensajePrincipal ?? '¡Gran trabajo!',
            pista: msg.feedbackFinal.pistaSiIncorrecto,
          } : null,
        })
        useLessonStore.setState({
          xpTotal: msg.xpTotal ?? xpTotal,
          logrosDesbloqueados: (msg.logros ?? []).map((l: any) => l.id).filter(Boolean),
        })
        return
      }

      if (msg.type === 'error') {
        setWsStatus('error')
        setAwaitingServer(false)
        setPendingActionName(null)
        setInteractionStatus(null)
        return
      }
    }

    return () => {
      ws.close(1000)
      wsRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const sendAction = useCallback(async (action: { name: string; context: Record<string, any> }) => {
    // play_audio is handled locally — never sent to coordinator
    if (action.name === 'play_audio') {
      const text: string =
        action.context['narration_text'] ??
        action.context['texto'] ??
        action.context['concepto'] ?? ''
      if (!text) return
      try {
        const res = await fetch('/api/tts-local/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(20_000),
        })
        if (res.ok) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const player = new Audio(url)
          player.onended = () => URL.revokeObjectURL(url)
          player.onerror = () => URL.revokeObjectURL(url)
          await player.play()
          return
        }
      } catch { /* fallthrough */ }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utter = new SpeechSynthesisUtterance(text)
        utter.lang = 'es-ES'
        window.speechSynthesis.speak(utter)
      }
      return
    }

    setAwaitingServer(true)
    setPendingActionName(action.name)
    setInteractionStatus(
      action.name === 'check_answer'
        ? 'Evaluando tu respuesta...'
        : action.name === 'complete_node'
          ? 'Avanzando al siguiente paso...'
          : 'Procesando tu acción...',
    )

    wsRef.current?.send(JSON.stringify({ type: 'action', ...action }))
  }, [])

  const handlePause = async () => {
    if (!sessionId || isPausing) return
    setIsPausing(true)
    wsRef.current?.close(1000)
    navigate('/sessions')
  }

  // ── Connecting state ────────────────────────────────────────────────────────
  if (wsStatus === 'connecting') {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-muted-foreground">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-hive-amber border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm">Conectando con el coordinador...</p>
        </div>
      </div>

    )
  }

  if (wsStatus === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-destructive">
        <div className="text-center space-y-4">
          <p className="text-lg font-semibold">Error de conexión</p>
          <p className="text-sm text-muted-foreground">No se pudo conectar con el servidor de lección.</p>
          <button
            onClick={() => navigate('/sessions')}
            className="px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-xl text-sm text-foreground border border-border transition-colors"
          >
            Volver
          </button>
        </div>
      </div>

    )
  }

  const nodos = program?.nodos ?? []
  const currentNodeIndex = currentNodoId ? nodos.findIndex((n) => n.id === currentNodoId) : -1
  const currentStep = currentNodeIndex >= 0 ? currentNodeIndex + 1 : 0

  const openResults = () => {
    setScreen('result')
    navigate('/result')
  }

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground hive-hex-pattern overflow-hidden relative">

      {/* GamificationHUD */}
      <GamificationHUD tema={program?.tema ?? ''} />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          {currentNodoId && !completionSummary && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 shadow-sm">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60">Progreso de la misión</p>
                <p className="text-sm font-semibold text-foreground">
                  Paso {currentStep || 1} de {nodos.length} {xpDisponible > 0 ? `· Recompensa: +${xpDisponible} XP` : ''}
                </p>
              </div>
              <div className="rounded-full border border-hive-amber/20 bg-hive-amber/10 px-3 py-1 text-xs font-bold text-hive-amber">
                {xpTotal} XP
              </div>
            </div>
          )}

          {/* A2UI rendered by coordinator */}
          {a2uiMessages.length > 0 ? (
            <div className="bg-card rounded-2xl border border-border shadow-honey overflow-hidden">

              <A2UIRenderer
                messages={a2uiMessages}
                onAction={sendAction}
                isLoading={awaitingServer}
                pendingActionName={pendingActionName}
                feedback={evalFeedback?.correcto ? {
                  correcto: true,
                  mensajePrincipal: evalFeedback.mensaje,
                  xpGanado: evalFeedback.xpGanado,
                  pistaSiIncorrecto: undefined,
                } : null}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-24 text-gray-500">
              <div className="text-center space-y-3">
                <div className="w-6 h-6 border-2 border-hive-amber border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm">El coordinador está preparando tu lección...</p>
              </div>

            </div>
          )}

          {interactionStatus && (
            <div className="mt-3 rounded-xl px-4 py-3 border border-hive-amber/20 bg-hive-amber/5 text-hive-amber text-sm">
              {interactionStatus}
            </div>
          )}

          {/* Eval feedback banner */}
          {evalFeedback && (
            <div className={`mt-4 rounded-xl px-5 py-4 border ${
              evalFeedback.correcto
                ? 'bg-hive-green/10 border-hive-green/30 text-hive-green'
                : 'bg-hive-amber/10 border-hive-amber/30 text-hive-amber'
            }`}>

              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{evalFeedback.correcto ? '✅' : '💡'}</span>
                <div>
                  <p className="font-semibold text-sm">{evalFeedback.mensaje}</p>
                  {!evalFeedback.correcto && evalFeedback.pista && (
                    <p className="text-xs mt-1 opacity-70 italic">Pista: {evalFeedback.pista}</p>
                  )}
                  {evalFeedback.correcto && evalFeedback.xpGanado > 0 && (
                    <p className="text-xs mt-1 opacity-70">+{evalFeedback.xpGanado} XP ganados</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="h-16" />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="px-6 py-3 bg-secondary/50 backdrop-blur-sm border-t border-border flex items-center gap-4">

        {nodos.length > 0 ? (
          <div className="flex-1 flex items-center gap-1.5">
            {nodos.map((n) => (
              <div
                key={n.id}
                title={n.titulo}
                className={`h-2 rounded-full flex-1 transition-colors ${
                  n.id === currentNodoId ? 'bg-hive-amber' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <button
          onClick={handlePause}
          disabled={isPausing}
          className="text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-background px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {isPausing ? 'Pausando...' : '⏸ Pausar'}
        </button>
      </div>

      {/* XP burst overlay */}
      {xpBurst && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="animate-bounce bg-hive-amber text-primary-foreground font-extrabold text-3xl rounded-2xl px-8 py-4 shadow-honey">
            +{xpBurst.amount} XP ⭐
          </div>
        </div>

      )}

      {/* Achievement toasts */}
      <div className="absolute top-20 right-4 space-y-2 pointer-events-none z-50">
        {toasts.map(({ id, logro }) => (
          <div
            key={id}
            className="bg-accent border border-hive-amber/30 text-foreground rounded-xl px-4 py-3 shadow-honey flex items-center gap-3 animate-fade-in"
          >

            <span className="text-2xl">{logro.emoji}</span>
            <div>
              <p className="font-bold text-sm">{logro.titulo}</p>
              <p className="text-xs opacity-80">{logro.descripcion}</p>
            </div>
          </div>
        ))}
      </div>

      {completionSummary && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/72 backdrop-blur-md px-6">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-hive-amber/30 bg-card shadow-honey">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.16),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.16),_transparent_38%)]" />
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500" />

            <div className="relative px-8 py-8 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-hive-amber/30 bg-hive-amber/10 text-4xl shadow-[0_0_40px_rgba(245,158,11,0.18)]">
                🏆
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-hive-amber/80">Curso completado</p>
              <h2 className="mt-2 text-3xl font-black text-foreground">¡Misión cumplida!</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{completionSummary.mensaje}</p>

              {completionSummary.finalFeedback && (
                <div className="mt-6 text-left">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                    Retroalimentación final
                  </p>
                  <A2UIFeedbackBanner feedback={{
                    correcto: completionSummary.finalFeedback.correcto,
                    mensajePrincipal: completionSummary.finalFeedback.mensaje,
                    xpGanado: completionSummary.finalFeedback.xpGanado,
                    pistaSiIncorrecto: completionSummary.finalFeedback.pista,
                  }} />
                </div>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-hive-amber/20 bg-hive-amber/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-hive-amber/70">XP total</p>
                  <p className="mt-1 text-2xl font-black text-hive-amber">{completionSummary.xpTotal}</p>
                </div>
                <div className="rounded-2xl border border-hive-green/20 bg-hive-green/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-hive-green/70">Nodos superados</p>
                  <p className="mt-1 text-2xl font-black text-hive-green">
                    {completionSummary.nodosCompletados}/{completionSummary.totalNodos}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-sky-300/80">Logros</p>
                  <p className="mt-1 text-2xl font-black text-sky-300">{completionSummary.logros.length}</p>
                </div>
              </div>

              {completionSummary.logros.length > 0 && (
                <div className="mt-6 rounded-2xl border border-border/70 bg-secondary/30 p-4 text-left">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                    Recompensas desbloqueadas
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {completionSummary.logros.map((logro, idx) => (
                      <div key={`${logro.titulo}-${idx}`} className="rounded-xl border border-hive-amber/20 bg-background/40 px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{logro.emoji || '✨'}</span>
                          <div>
                            <p className="text-sm font-bold text-foreground">{logro.titulo}</p>
                            <p className="text-xs text-muted-foreground">{logro.descripcion}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={openResults}
                  className="w-full rounded-2xl bg-hive-amber px-6 py-3 text-sm font-bold text-primary-foreground shadow-honey transition-transform hover:scale-[1.01] sm:w-auto"
                >
                  Ver resultados y continuar
                </button>
                <button
                  onClick={() => navigate('/sessions')}
                  className="w-full rounded-2xl border border-border bg-secondary/50 px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary sm:w-auto"
                >
                  Volver a sesiones
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
