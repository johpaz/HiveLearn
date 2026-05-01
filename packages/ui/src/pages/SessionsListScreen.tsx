import { useEffect, useRef, useState } from 'react'
import { useLessonStore } from '../store/lessonStore'
import { fetchWithAuth } from '../lib/fetchWithAuth'
import type { LessonProgram } from '@hivelearn/core'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Search,
  Plus,
  Settings,
  Trash2,
  Play,
  CheckCircle2,
  PauseCircle,
  Zap,
  Clock,
  User,
  ArrowRight,
  Trophy,
  Target,
  TrendingUp,
  X
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionRow {
  session_id: string
  alumno_id: string
  curriculo_id: number
  xp_total: number
  nivel_alcanzado: string
  nodos_completados: number
  evaluacion_puntaje: number | null
  completada: number
  created_at: string
  meta: string
  total_nodos: number
  rango_edad: string
  nombre: string
  paused_at?: string | null
}

interface HLMetrics {
  total_xp: number
  avg_score: number
  total_sessions: number
  completed_sessions: number
}

interface ProviderRow { id: string; name: string }
interface ModelRow { id: string; name: string; provider_id: string; context_window?: number }

// ── Model Config Popover ─────────────────────────────────────────────────────

function ModelConfigPopover({ onClose }: { onClose: () => void }) {
  const { selectedProviderId, selectedModelId, setSelectedProvider, setSelectedModel } = useLessonStore()
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [models, setModels] = useState<ModelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [pRes, mRes] = await Promise.all([
          fetchWithAuth('/api/providers'),
          fetchWithAuth('/api/models'),
        ])
        const pData = await pRes.json()
        const mData = await mRes.json()
        setProviders((pData.providers ?? []).filter((p: any) => p.enabled || p.active))
        setModels((mData.models ?? []).filter((m: any) => m.enabled || m.active))
      } catch { }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleSave = async (providerId: string, modelId: string) => {
    setSaving(true)
    try {
      await fetchWithAuth('/api/hivelearn/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, modelId }),
      })
      setSelectedProvider(providerId)
      setSelectedModel(modelId)
      setTimeout(onClose, 500)
    } catch { }
    setSaving(false)
  }

  return (
    <div ref={ref} className="absolute top-full right-0 mt-4 w-72 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-50 p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Motor Hive</span>
        {saving && <div className="h-1 w-12 bg-amber-500 animate-pulse rounded-full" />}
      </div>
      
      <div className="space-y-4">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="w-4 h-4 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>
        ) : (
          providers.map(p => (
            <div key={p.id} className="space-y-2">
              <p className="text-[9px] font-bold text-white/30 uppercase tracking-tight ml-1">{p.name}</p>
              <div className="grid grid-cols-1 gap-1">
                {models.filter(m => m.provider_id === p.id).map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleSave(p.id, m.id)}
                    className={`text-left px-3 py-2 rounded-lg text-[11px] transition-all border ${
                      selectedModelId === m.id 
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                        : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Utils ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const iso = dateStr ? dateStr.replace(' ', 'T') : ''
  const diff = Date.now() - new Date(iso || 0).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 60) return `hace ${mins}m`
  if (hours < 24) return `hace ${hours}h`
  return `hace ${days}d`
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SessionsListScreen() {
  const { reset, setScreen, restoreSession, selectedModelId } = useLessonStore()
  const navigate = useNavigate()
  
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [metrics, setMetrics] = useState<HLMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModelConfig, setShowModelConfig] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const [sRes, mRes] = await Promise.all([
        fetchWithAuth('/api/hivelearn/sessions'),
        fetchWithAuth('/api/hivelearn/metrics').catch(() => null)
      ])
      const sData = await sRes.json()
      setSessions(Array.isArray(sData.sessions) ? sData.sessions : [])
      
      if (mRes) {
        const mData = await mRes.json()
        setMetrics(mData)
      }
    } catch { }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleNew = () => { 
    reset()
    setScreen('chat-onboarding') 
    navigate('/onboarding')
  }

  const handleContinue = async (session: SessionRow) => {
    setRestoring(session.session_id)
    try {
      const res = await fetchWithAuth(`/api/hivelearn/sessions/${session.session_id}`)
      const data = await res.json()
      const nodos = JSON.parse(data.nodos_json || '[]')
      
      const program: LessonProgram = {
        sessionId: data.session_id,
        alumnoId: data.alumno_id,
        tema: data.meta ?? '',
        topicSlug: data.topic_slug ?? null,
        nodos,
        gamificacion: { 
          logros: [], 
          mensajeCelebracion: '¡Excelente progreso!',
          xpRecompensa: 0
        },
        evaluacion: { preguntas: [] },
        perfilAdaptacion: { duracionSesion: 20, nodosRecomendados: nodos.length, tono: 'amigable' },
      }

      restoreSession(program, {
        sessionId: data.session_id,
        xpTotal: data.xp_total ?? 0,
        nodosCompletados: [],
        lastNodeId: data.last_node_id ?? null,
        sessionStateJson: data.session_state_json ?? null,
        paused_at: data.paused_at ?? null,
      })

      if (session.completada) {
        setScreen('result')
        navigate('/result')
      } else {
        navigate('/lesson')
      }
    } catch { }
    setRestoring(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar sesión?')) return
    setDeleting(id)
    try {
      await fetchWithAuth(`/api/hivelearn/sessions/${id}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.session_id !== id))
    } catch { }
    setDeleting(null)
  }

  const filteredSessions = sessions.filter(s => {
    const search = searchTerm.toLowerCase()
    return (
      (s.meta?.toLowerCase().includes(search)) ||
      (s.nombre?.toLowerCase().includes(search)) ||
      (s.session_id?.toLowerCase().includes(search)) ||
      (s.alumno_id?.toLowerCase().includes(search))
    )
  })

  return (
    <div className="hive-page">
      {/* Background Blobs */}
      <div className="hive-glow-blob hive-glow-blob--blue w-[600px] h-[600px] -top-64 -left-64 opacity-20" />
      <div className="hive-glow-blob hive-glow-blob--purple w-[500px] h-[500px] bottom-0 -right-40 opacity-10" />

      <div className="hive-page-container relative z-10 py-12">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">HiveLearn Hub</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter leading-[0.9]">
              Mis <span className="text-amber-500">Sesiones</span>
            </h1>
            <p className="text-white/40 text-sm max-w-md font-medium leading-relaxed">
              Explora y gestiona tus trayectorias de aprendizaje personalizadas impulsadas por inteligencia colectiva.
            </p>
          </div>

          <div className="flex items-center gap-4">
             <div className="relative">
                <Button 
                  variant="ghost" 
                  onClick={() => setShowModelConfig(!showModelConfig)}
                  className="h-14 px-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white transition-all gap-3"
                >
                  <Settings className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{selectedModelId ? 'Config' : 'Motor'}</span>
                </Button>
                {showModelConfig && <ModelConfigPopover onClose={() => setShowModelConfig(false)} />}
             </div>
             
             <Button onClick={handleNew} className="hive-btn--primary h-14 px-8 group">
               <Plus className="w-5 h-5 mr-2 group-hover:rotate-90 transition-transform" />
               <span className="uppercase font-black tracking-tight">Nueva Lección</span>
             </Button>
          </div>
        </div>

        {/* Metrics Bar */}
        {metrics && sessions.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {[
              { label: 'Completadas', value: metrics.completed_sessions, icon: Trophy, color: 'text-emerald-400', bg: 'border-emerald-500/10' },
              { label: 'En progreso', value: metrics.total_sessions - metrics.completed_sessions, icon: Target, color: 'text-amber-400', bg: 'border-amber-500/10' },
              { label: 'XP Acumulada', value: `${metrics.total_xp} XP`, icon: Zap, color: 'text-white', bg: 'border-white/10' },
              { label: 'Puntaje Medio', value: `${metrics.avg_score}%`, icon: TrendingUp, color: 'text-blue-400', bg: 'border-blue-500/10' },
            ].map((s, i) => (
              <div key={i} className={`bg-black/40 backdrop-blur-xl border ${s.bg} rounded-2xl p-6 flex flex-col gap-4 group hover:border-white/20 transition-all`}>
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl bg-white/5 text-white/20 group-hover:text-white transition-colors">
                    <s.icon className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/20">{s.label}</span>
                </div>
                <div className={`text-3xl font-black ${s.color} tracking-tighter`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search Bar - THE HERO SECTION OF FILTERING */}
        <div className="mb-16 relative max-w-5xl mx-auto w-full group">
          <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/10 via-white/5 to-blue-500/10 rounded-[2rem] blur-xl opacity-0 group-focus-within:opacity-100 transition duration-1000" />
          <div className="relative flex items-center gap-2 bg-black/40 backdrop-blur-3xl border border-white/5 rounded-[2rem] p-2 pr-4 transition-all duration-500 group-focus-within:border-amber-500/30">
            <div className="relative flex-1 flex items-center">
              <Search className="absolute left-6 w-6 h-6 text-white/10 group-focus-within:text-amber-500 transition-colors" />
              <Input
                placeholder="Buscar por tema, estudiante o sesión..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-16 pl-16 pr-10 border-0 bg-transparent text-xl focus:ring-0 placeholder:text-white/5 text-white font-medium"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button 
              onClick={() => fetchData()}
              className="h-14 px-8 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 font-bold uppercase tracking-widest text-[10px] transition-all active:scale-95"
            >
              Buscar
            </Button>
          </div>
        </div>

        {/* Grid Content */}
        {loading ? (
          <div className="py-24 flex flex-col items-center">
             <div className="text-7xl animate-pulse grayscale opacity-50">🐝</div>
             <p className="mt-8 text-[10px] font-black uppercase tracking-[0.4em] text-white/20 animate-pulse">Sincronizando Enjambre</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="py-32 text-center border-2 border-dashed border-white/5 rounded-[3rem]">
             <div className="text-6xl mb-6 opacity-10">📂</div>
             <h3 className="text-2xl font-black text-white/20 uppercase tracking-tighter">Sin resultados</h3>
             <p className="text-white/10 text-sm mt-2">No encontramos nada que coincida con tu búsqueda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredSessions.map(session => {
              const isCompleted = !!session.completada
              const isPaused = !isCompleted && !!session.paused_at
              const progress = session.total_nodos > 0 ? Math.round((session.nodos_completados / session.total_nodos) * 100) : 0
              const isBusy = restoring === session.session_id || deleting === session.session_id

              return (
                <div key={session.session_id} className="group relative bg-white/[0.02] border border-white/5 rounded-[2rem] p-8 flex flex-col min-h-[360px] hover:bg-white/[0.04] hover:border-white/10 transition-all">
                  
                  {/* Status & Date */}
                  <div className="flex items-center justify-between mb-8">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${
                      isCompleted ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                      isPaused ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                      'bg-blue-500/10 border-blue-500/20 text-blue-400'
                    }`}>
                      {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : isPaused ? <PauseCircle className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      {isCompleted ? 'Completada' : isPaused ? 'Pausada' : 'En Vivo'}
                    </div>
                    <div className="flex items-center gap-2 text-white/20">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold">{timeAgo(session.created_at)}</span>
                    </div>
                  </div>

                  {/* Title & Student */}
                  <div className="mb-auto space-y-3">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter leading-[1.1] group-hover:text-amber-500 transition-colors line-clamp-3">
                      {session.meta || 'Sesión sin título'}
                    </h3>
                    <div className="flex items-center gap-2 text-white/30">
                      <User className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-widest truncate">{session.nombre || 'Explorador'}</span>
                    </div>
                  </div>

                  {/* Progress Section */}
                  <div className="mt-8 space-y-4">
                    <div className="flex justify-between items-end">
                      <div className="flex flex-col">
                         <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Progreso</span>
                         <span className="text-xs font-black text-white/80">{session.nodos_completados} / {session.total_nodos}</span>
                      </div>
                      <span className="text-xl font-black text-white tracking-tighter">{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ${isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 mt-8">
                    <Button
                      onClick={() => handleContinue(session)}
                      disabled={isBusy}
                      className={`flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${
                        isCompleted ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : 
                        'bg-white/5 hover:bg-white/10 text-white border-white/10'
                      }`}
                    >
                      {restoring === session.session_id ? 'Cargando...' : isCompleted ? 'Revisar' : 'Continuar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(session.session_id)}
                      disabled={isBusy}
                      className="h-14 w-14 rounded-2xl bg-red-500/5 hover:bg-red-500/20 text-red-500/40 hover:text-red-500 transition-all border border-transparent hover:border-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Decorative Elements */}
                  <div className="absolute top-0 right-8 h-px w-16 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
