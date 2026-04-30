import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLessonStore } from '../store/lessonStore'
import { wsUrl } from '../lib/wsUrl'
import { SwarmCanvas } from '../canvas/SwarmCanvas'
import type { StudentProfile } from '@hivelearn/core'

type RangoEdad = 'nino' | 'adolescente' | 'adulto'

interface ChatMessage {
  role: 'agent' | 'user'
  text: string
}

interface CapturedField {
  key: string
  value: string
  icon: string
  label: string
}

const FIELD_META: Record<string, { icon: string; label: string }> = {
  nombre:   { icon: '👤', label: 'Nombre' },
  edad:     { icon: '🎂', label: 'Edad' },
  tema:     { icon: '📚', label: 'Tema' },
  objetivo: { icon: '🎯', label: 'Objetivo' },
  estilo:   { icon: '🎨', label: 'Estilo' },
}

const FIELD_ORDER = ['nombre', 'edad', 'tema', 'objetivo', 'estilo']

const THEME = {
  nino: {
    gradientFrom: 'from-amber-50',
    gradientTo:   'to-orange-50',
    avatarColor:  '#f59e0b',
    avatarBg:     'from-amber-400 to-orange-500',
    inputPlaceholder: '¡Cuéntame aquí! 😊',
    cardBorder:   'border-amber-200',
    accentColor:  'text-amber-600',
    dotColor:     'bg-amber-500',
    sendBg:       'bg-amber-500 hover:bg-amber-600',
  },
  adolescente: {
    gradientFrom: 'from-sky-50',
    gradientTo:   'to-indigo-50',
    avatarColor:  '#0ea5e9',
    avatarBg:     'from-sky-400 to-indigo-500',
    inputPlaceholder: 'Escribe tu respuesta...',
    cardBorder:   'border-sky-200',
    accentColor:  'text-sky-600',
    dotColor:     'bg-sky-500',
    sendBg:       'bg-sky-600 hover:bg-sky-700',
  },
  adulto: {
    gradientFrom: 'from-background',
    gradientTo:   'to-secondary/30',
    avatarColor:  '#f59e0b',
    avatarBg:     'from-hive-amber to-amber-600',
    inputPlaceholder: 'Tu respuesta...',
    cardBorder:   'border-border',
    accentColor:  'text-hive-amber',
    dotColor:     'bg-hive-amber',
    sendBg:       'bg-hive-amber hover:bg-hive-amber/90',
  },
}

function HexAvatar({ theme }: { theme: typeof THEME.adulto }) {
  return (
    <div className="relative flex-shrink-0">
      <svg width="48" height="54" viewBox="0 0 48 54">
        <defs>
          <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={theme.avatarColor} stopOpacity="1" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <polygon points="24,2 46,14 46,40 24,52 2,40 2,14" fill="url(#hexGrad)" filter="url(#glow)" />
        <polygon points="24,2 46,14 46,40 24,52 2,40 2,14" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl">🐝</span>
      <span className="absolute inset-0 rounded-full animate-ping opacity-10 bg-hive-amber" />
    </div>
  )
}

export function ChatOnboardingScreen() {
  const navigate = useNavigate()
  const {
    setScreen, setPerfil, setMeta,
    setOnboardingSessionId, completeOnboarding,
    setSessionId, setCurriculoId, setProgram, setIsGenerating,
    setSwarmProgress, setAgentStatus,
    selectedProviderId, selectedModelId,
  } = useLessonStore()

  const [messages, setMessages]             = useState<ChatMessage[]>([])
  const [inputValue, setInputValue]         = useState('')
  const [isWaiting, setIsWaiting]           = useState(false)
  const [isComplete, setIsComplete]         = useState(false)
  const [rangoEdad, setRangoEdad]           = useState<RangoEdad>('adulto')
  const [capturedFields, setCapturedFields] = useState<Record<string, string>>({})
  const [activatingSwarm, setActivatingSwarm] = useState(false)
  const [isLoadingProgress, setIsLoadingProgress] = useState(true)

  const sessionId   = useRef(`onboard-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const wsRef       = useRef<WebSocket | null>(null)
  const chatEndRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const theme = THEME[rangoEdad]

  // Cargar progreso guardado al montar el componente
  useEffect(() => {
    const loadSavedProgress = async () => {
      try {
        const savedSessionId = localStorage.getItem('hivelearn-onboarding-session')
        const savedFields = localStorage.getItem('hivelearn-onboarding-fields')
        const savedMessages = localStorage.getItem('hivelearn-onboarding-messages')

        if (savedSessionId && savedFields) {
          sessionId.current = savedSessionId
          const fields = JSON.parse(savedFields)
          setCapturedFields(fields)

          if (fields.edad) {
            const age = parseInt(fields.edad, 10)
            setRangoEdad(age <= 12 ? 'nino' : age <= 17 ? 'adolescente' : 'adulto')
          }

          if (savedMessages) {
            const messages = JSON.parse(savedMessages)
            setMessages(messages)
          }

          setOnboardingSessionId(sessionId.current)
          setIsLoadingProgress(false)
          return
        }
      } catch (err) {
        console.error('Error loading saved progress:', err)
      }
      setIsLoadingProgress(false)
    }

    loadSavedProgress()
  }, [])

  useEffect(() => {
    if (isLoadingProgress) return

    setOnboardingSessionId(sessionId.current)
    localStorage.setItem('hivelearn-onboarding-session', sessionId.current)

    const url = wsUrl(`/hivelearn-onboarding?sessionId=${sessionId.current}&providerId=${encodeURIComponent(selectedProviderId ?? '')}&modelId=${encodeURIComponent(selectedModelId ?? '')}`)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setIsWaiting(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)

        if (msg.type === 'connected') {
          ws.send(JSON.stringify({ type: 'init' }))
          return
        }

        if (msg.type === 'agent_message' && msg.text) {
          setMessages(prev => {
            const newMessages: ChatMessage[] = [...prev, { role: 'agent', text: msg.text }]
            localStorage.setItem('hivelearn-onboarding-messages', JSON.stringify(newMessages))
            return newMessages
          })
          setIsWaiting(false)
          return
        }

        if (msg.type === 'field_saved' && msg.fieldKey) {
          setCapturedFields(prev => {
            const newFields = { ...prev, [msg.fieldKey]: msg.fieldValue }
            localStorage.setItem('hivelearn-onboarding-fields', JSON.stringify(newFields))
            return newFields
          })
          if (msg.fieldKey === 'edad') {
            const age = parseInt(msg.fieldValue, 10)
            setRangoEdad(age <= 12 ? 'nino' : age <= 17 ? 'adolescente' : 'adulto')
          }
          return
        }

        if (msg.type === 'complete') {
          setIsComplete(true)
          setActivatingSwarm(true)
          const perfil = msg.perfil as StudentProfile
          const meta   = msg.meta as string
          completeOnboarding()
          setPerfil(perfil)
          setMeta(meta)
          setIsGenerating(true)
          return
        }

        if (msg.type === 'generation_progress') {
          setSwarmProgress(msg as any)
          return
        }

        if (msg.type === 'agent_started') {
          setAgentStatus(msg.agentId as string, 'running')
          return
        }

        if (msg.type === 'agent_completed') {
          setAgentStatus(msg.agentId as string, 'completed')
          return
        }

        if (msg.type === 'agent_failed') {
          setAgentStatus(msg.agentId as string, 'failed')
          return
        }

        if (msg.type === 'generation_complete') {
          localStorage.removeItem('hivelearn-onboarding-session')
          localStorage.removeItem('hivelearn-onboarding-fields')
          localStorage.removeItem('hivelearn-onboarding-messages')
          
          setProgram(msg as any)
          setSessionId(msg.sessionId as string)
          setCurriculoId(msg.curriculoId as number)
          setIsGenerating(false)
          setSwarmProgress({ etapa: 'complete', agenteActivo: '', porcentaje: 100, mensaje: '¡Lección lista!' })
          setScreen('lesson')
          setTimeout(() => navigate('/lesson'), 1800)
          return
        }

        if (msg.type === 'generation_error') {
          setActivatingSwarm(false)
          setIsComplete(false)
          setIsGenerating(false)
          setMessages(prev => [...prev, { role: 'agent', text: `Error generando la lección: ${(msg as any).message ?? 'Error desconocido'}` } as ChatMessage])
          setIsWaiting(false)
          return
        }

        if (msg.type === 'error') {
          setMessages(prev => [...prev, { role: 'agent', text: 'Error de conexión. Intenta de nuevo.' } as ChatMessage])
          setIsWaiting(false)
        }
      } catch {
        // ignore
      }
    }

    ws.onerror = () => {
      setMessages(prev => [...prev, { role: 'agent', text: 'Error de conexión con el servidor.' } as ChatMessage])
      setIsWaiting(false)
    }

    ws.onclose = () => {
      if (!isComplete) {
        setIsWaiting(false)
      }
    }

    return () => {
      ws.close()
    }
  }, [isLoadingProgress, isComplete, selectedProviderId, selectedModelId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const autoResizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text || isWaiting || isComplete) return
    setMessages(prev => {
      const newMessages: ChatMessage[] = [...prev, { role: 'user', text }]
      localStorage.setItem('hivelearn-onboarding-messages', JSON.stringify(newMessages))
      return newMessages
    })
    setInputValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setIsWaiting(true)
    wsRef.current?.send(JSON.stringify({ type: 'user_message', content: text }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const orderedFields: CapturedField[] = FIELD_ORDER.map(key => ({
    key,
    value: capturedFields[key] ?? '',
    icon:  FIELD_META[key]?.icon  ?? '•',
    label: FIELD_META[key]?.label ?? key,
  }))

  const filledCount = orderedFields.filter(f => f.value).length

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden relative">
      {/* ── Background decoration ── */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] hive-hex-pattern" />

      {/* ── LoadingScreen overlay ── */}
      {activatingSwarm && (
        <div className="absolute inset-0 z-50">
          <SwarmCanvas />
        </div>
      )}

      {/* ══ Chat ══════════════════════════════════ */}
      <div className={`flex flex-col w-full md:w-[60%] h-full border-r border-border bg-gradient-to-b ${theme.gradientFrom} ${theme.gradientTo}`}>

        {/* Header */}
        <div className="flex items-center gap-4 px-4 md:px-6 py-4 border-b border-border bg-background/60 backdrop-blur-md">
          <HexAvatar theme={theme} />
          <div className="flex-1 min-w-0">
            <p className={`font-black text-sm uppercase tracking-wider ${theme.accentColor}`}>Hive Coordinator</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest hidden sm:block">A2UI · Multi-Agent Swarm</p>
          </div>
          <div className="flex items-center gap-3">
            {!isLoadingProgress && capturedFields.nombre && (
              <button
                onClick={() => {
                  if (window.confirm('¿Comenzar de nuevo?')) {
                    localStorage.removeItem('hivelearn-onboarding-session')
                    localStorage.removeItem('hivelearn-onboarding-fields')
                    localStorage.removeItem('hivelearn-onboarding-messages')
                    sessionId.current = `onboard-${Date.now()}-${Math.random().toString(36).slice(2)}`
                    setCapturedFields({})
                    setMessages([])
                    setRangoEdad('adulto')
                    setOnboardingSessionId(sessionId.current)
                  }
                }}
                className="text-[10px] font-bold uppercase tracking-widest text-hive-red hover:opacity-70 transition-opacity"
              >
                Reiniciar
              </button>
            )}
            <button
              onClick={() => navigate('/sessions')}
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Mis sesiones
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6">
          {!isLoadingProgress && capturedFields.nombre && messages.length <= 1 && (
            <div className="bg-hive-amber/10 border border-hive-amber/20 rounded-2xl px-5 py-4 mb-4 shadow-sm animate-in fade-in slide-in-from-top-2">
              <p className="text-xs text-hive-amber font-bold leading-relaxed">
                🔄 Se ha reanudado tu progreso anterior. {filledCount}/5 campos completados.
              </p>
            </div>
          )}
          
          {messages.length === 0 && !isWaiting && (
            <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
              <span className="text-5xl animate-pulse">🐝</span>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Inicializando enjambre...</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={`${msg.role}-${i}`} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'justify-start'}`}>
              {msg.role === 'agent' && (
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0 bg-gradient-to-br shadow-sm ${theme.avatarBg}`}>
                  🐝
                </div>
              )}
              <div
                className={`max-w-[85%] md:max-w-[80%] text-sm leading-relaxed px-4 py-3 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-1
                  ${msg.role === 'agent'
                    ? 'bg-background text-foreground rounded-2xl rounded-tl-none border border-border font-medium'
                    : 'bg-hive-amber text-primary-foreground rounded-2xl rounded-tr-none font-bold'
                  }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {isWaiting && (
            <div className="flex items-start gap-3 justify-start">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0 bg-gradient-to-br shadow-sm ${theme.avatarBg}`}>
                🐝
              </div>
              <div className="bg-background rounded-2xl rounded-tl-none border border-border px-4 py-3 shadow-sm">
                <span className="flex gap-1.5 items-center h-5">
                  {[0, 150, 300].map((delay, i) => (
                    <span key={`delay-${delay}`} className={`w-1.5 h-1.5 ${theme.dotColor} rounded-full animate-bounce`} style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 md:px-6 py-4 border-t border-border bg-background/60 backdrop-blur-md">
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); autoResizeTextarea() }}
              onKeyDown={handleKeyDown}
              disabled={isWaiting || isComplete}
              placeholder={isComplete ? 'Generando tu programa...' : theme.inputPlaceholder}
              className="flex-1 bg-secondary/50 border border-border rounded-2xl px-5 py-3.5 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-hive-amber transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-hidden leading-relaxed min-h-[50px] max-h-[150px] font-medium"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isWaiting || isComplete}
              className={`w-12 h-12 ${theme.sendBg} disabled:bg-slate-200 disabled:cursor-not-allowed rounded-2xl flex items-center justify-center transition-all flex-shrink-0 shadow-sm active:scale-90`}
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ══ Sidebar ════════════════════════════ */}
      <div className="hidden md:flex flex-col w-[40%] h-full bg-background overflow-hidden border-l border-border relative">
        <div className="absolute inset-0 opacity-[0.01] hive-hex-pattern pointer-events-none" />
        
        <div className="px-8 py-6 border-b border-border relative z-10">
          <p className="text-[10px] font-black text-hive-purple uppercase tracking-[0.2em] mb-2">Construcción en tiempo real</p>
          <h3 className="text-lg font-black text-foreground tracking-tight">Tu programa de aprendizaje</h3>
          <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden border border-border p-0.5">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r from-hive-amber to-hive-purple shadow-[0_0_8px_rgba(245,158,11,0.2)]"
              style={{ width: `${(filledCount / 5) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">{filledCount}/5 completado</span>
            <span className="text-[9px] font-bold text-hive-amber uppercase">{Math.round((filledCount/5)*100)}%</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4 relative z-10">
          {filledCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="text-6xl opacity-20 grayscale animate-pulse">🍯</div>
              <p className="text-muted-foreground text-sm font-medium max-w-[200px]">Responde a las preguntas para que el enjambre empiece a trabajar.</p>
            </div>
          ) : (
            orderedFields.map((field, idx) => (
              <div
                key={field.key}
                className="transition-all duration-700 animate-in fade-in slide-in-from-right-4"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className={`bg-secondary/20 border rounded-2xl px-5 py-4 flex items-center gap-4 transition-all shadow-sm ${field.value ? 'border-hive-amber/30 bg-hive-amber/5' : 'border-dashed border-border opacity-40'}`}>
                  <span className="text-2xl grayscale-[0.5]">{field.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-black">{field.label}</p>
                    <p className={`text-sm mt-0.5 truncate font-bold ${field.value ? 'text-foreground' : 'text-muted-foreground/30'}`}>
                      {field.value || 'Esperando...'}
                    </p>
                  </div>
                  {field.value && <span className="ml-auto text-hive-amber font-black text-lg">✓</span>}
                </div>
              </div>
            ))
          )}

          {isComplete && (
            <div className="mt-6 bg-hive-purple/5 border border-hive-purple/20 rounded-2xl px-6 py-6 animate-pulse shadow-sm">
              <div className="flex justify-center gap-1.5 mb-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={`bar-${i}`} className="w-1 h-8 bg-hive-purple/40 rounded-full" />
                ))}
              </div>
              <p className="text-[10px] text-hive-purple font-black uppercase tracking-[0.2em] text-center">Enjambre Hive Activado</p>
              <p className="text-xs text-muted-foreground mt-2 text-center font-medium">17 agentes orquestando tu lección...</p>
            </div>
          )}
        </div>

        <div className="px-8 py-5 border-t border-border bg-secondary/10 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-hive-green animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
            <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Hive Neural Network · <span className="text-hive-purple">Stable</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}
