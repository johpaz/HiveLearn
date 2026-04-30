import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLessonStore } from '../store/lessonStore'
import { A2UIRenderer } from '../a2ui/A2UIRenderer'
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
        return
      }

      if (msg.type === 'xp_award') {
        showXpFloat(currentNodoId ?? 'node', msg.amount ?? 0)
        setXpBurst({ amount: msg.amount ?? 0, total: msg.total ?? xpTotal })
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
        useLessonStore.setState({
          xpTotal: msg.xpTotal ?? xpTotal,
          logrosDesbloqueados: (msg.logros ?? []).map((l: any) => l.id).filter(Boolean),
          screen: 'result',
        })
        navigate('/result')
        return
      }

      if (msg.type === 'error') {
        setWsStatus('error')
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

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground hive-hex-pattern overflow-hidden relative">

      {/* GamificationHUD */}
      <GamificationHUD tema={program?.tema ?? ''} />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">

          {/* A2UI rendered by coordinator */}
          {a2uiMessages.length > 0 ? (
            <div className="bg-card rounded-2xl border border-border shadow-honey overflow-hidden">

              <A2UIRenderer
                messages={a2uiMessages}
                onAction={sendAction}
                feedback={evalFeedback ? {
                  correcto: evalFeedback.correcto,
                  mensajePrincipal: evalFeedback.mensaje,
                  xpGanado: evalFeedback.xpGanado,
                  pistaSiIncorrecto: evalFeedback.pista,
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
    </div>
  )
}
