import { useEffect, useRef, useState } from 'react'
import { useLessonStore } from '../store/lessonStore'
import { fetchWithAuth } from '../lib/fetchWithAuth'
import type { LessonProgram } from '@hivelearn/core'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
  BookOpen,
  ArrowRight
} from 'lucide-react'

// ── Model Config Popover ─────────────────────────────────────────────────────

interface ProviderRow { id: string; name: string }
interface ModelRow { id: string; name: string; provider_id: string; context_window?: number }

function ModelConfigPopover({ onClose }: { onClose: () => void }) {
  const { selectedProviderId, selectedModelId, setSelectedProvider, setSelectedModel } = useLessonStore()

  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [models, setModels] = useState<ModelRow[]>([])
  const [localProvider, setLocalProvider] = useState<string | null>(selectedProviderId)
  const [localModel, setLocalModel] = useState<string | null>(selectedModelId)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
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

  const availableModels = models.filter(m => m.provider_id === localProvider)

  const handleSave = async () => {
    if (!localProvider || !localModel) return
    setSaving(true)
    try {
      await fetchWithAuth('/api/hivelearn/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: localProvider, modelId: localModel }),
      })
      setSelectedProvider(localProvider)
      setSelectedModel(localModel)
      setSaved(true)
      setTimeout(onClose, 900)
    } catch { }
    setSaving(false)
  }

  const currentModelName = models.find(m => m.id === selectedModelId)?.name ?? selectedModelId ?? 'Sin configurar'
  const currentProviderName = providers.find(p => p.id === selectedProviderId)?.name ?? ''

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-gray-800">
        <p className="text-sm font-bold text-white">Motor del enjambre</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Modelo actual: <span className="text-blue-400 font-medium">{currentProviderName} / {currentModelName}</span>
        </p>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="text-center py-4 text-gray-500 text-sm">Cargando...</div>
        ) : (
          <>
            {/* Provider */}
            <div>
              <label htmlFor="provider-select" className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2">Proveedor</label>
              <div id="provider-select" className="space-y-1.5 max-h-32 overflow-y-auto">
                {providers.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setLocalProvider(p.id); setLocalModel(null) }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium border transition-all
                      ${localProvider === p.id
                        ? 'bg-blue-600/20 border-blue-600/50 text-blue-300'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-blue-500/30'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            {localProvider && (
              <div>
                <label htmlFor="model-select" className="block text-[10px] text-gray-500 uppercase tracking-widest mb-2">Modelo</label>
                {availableModels.length === 0 ? (
                  <p className="text-xs text-gray-600 px-1">No hay modelos activos para este proveedor</p>
                ) : (
                  <div id="model-select" className="space-y-1.5 max-h-40 overflow-y-auto">
                    {availableModels.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setLocalModel(m.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs border transition-all
                          ${localModel === m.id
                            ? 'bg-blue-600/20 border-blue-600/50 text-blue-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-blue-500/30'}`}
                      >
                        <span className="font-medium">{m.name}</span>
                        {m.context_window && (
                          <span className="ml-2 text-gray-600">{(m.context_window / 1000).toFixed(0)}K ctx</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={!localProvider || !localModel || saving || saved}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500"
            >
              {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Aplicar al enjambre'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

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
  last_node_id?: string | null
}

function timeAgo(dateStr: string): string {
  const iso = dateStr ? dateStr.replace(' ', 'T') : ''
  const diff = Date.now() - new Date(iso || 0).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 60) return `hace ${mins} min`
  if (hours < 24) return `hace ${hours} h`
  return `hace ${days} día${days !== 1 ? 's' : ''}`
}

export function SessionsListScreen() {
  const { reset, setScreen, restoreSession, sessionId: currentSessionId, program: currentProgram, selectedProviderId, selectedModelId } = useLessonStore()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showModelConfig, setShowModelConfig] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  console.log("yo")
  const fetchSessions = async () => {
    try {
      const res = await fetchWithAuth('/api/hivelearn/sessions')
      const data = await res.json()
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSessions() }, [])

  const filteredSessions = sessions.filter(s => {
    const search = searchTerm.toLowerCase()
    return (
      (s.meta?.toLowerCase().includes(search)) ||
      (s.nombre?.toLowerCase().includes(search)) ||
      (s.alumno_id?.toLowerCase().includes(search)) ||
      (s.session_id?.toLowerCase().includes(search))
    )
  })

  const handleNew = () => {
    reset()
    setScreen('chat-onboarding')
  }

  const handleContinue = async (session: SessionRow) => {
    setRestoring(session.session_id)
    try {
      // Si la sesión está en memoria (localStorage match), reutilizar
      if (currentSessionId === session.session_id && currentProgram) {
        setScreen(session.completada ? 'result' : 'lesson')
        return
      }

      // Cargar desde BD usando el endpoint /restore que incluye last_node_id y session_state_json
      const res = await fetchWithAuth(`/api/hivelearn/sessions/${session.session_id}/restore`)
      if (!res.ok) throw new Error('Session not found')
      const data = await res.json()

      const nodos = JSON.parse(data.nodos_json || '[]')
      const program: LessonProgram = {
        sessionId: data.session_id,
        alumnoId: data.alumno_id,
        tema: data.meta ?? '',
        topicSlug: data.topic_slug ?? null,
        nodos,
        gamificacion: {
          xpRecompensa: data.xp_total ?? 0,
          logros: [],
          mensajeCelebracion: '¡Lección completada!',
        },
        evaluacion: { preguntas: [] },
        perfilAdaptacion: {
          duracionSesion: 20,
          nodosRecomendados: nodos.length,
          tono: 'amigable',
        },
      }

      restoreSession(program, {
        sessionId: data.session_id,
        xpTotal: data.xp_total ?? 0,
        nodosCompletados: [],
        lastNodeId: data.last_node_id ?? null,
        sessionStateJson: data.session_state_json ?? null,
        paused_at: data.paused_at ?? null,
      })

      // restoreSession hace setScreen('lesson'); si completada vamos a result
      if (data.completada) setScreen('result')
    } catch (err) {
      console.error('[SessionsListScreen] handleContinue error:', err)
    } finally {
      setRestoring(null)
    }
  }

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('¿Eliminar esta sesión? No se puede deshacer.')) return
    setDeleting(sessionId)
    try {
      await fetchWithAuth(`/api/hivelearn/sessions/${sessionId}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    } catch {
      // silently fail
    } finally {
      setDeleting(null)
    }
  }


  return (
    <div className="hive-page overflow-y-auto">
      {/* Background Blobs */}
      <div className="hive-glow-blob hive-glow-blob--blue w-[500px] h-[500px] -top-40 -left-40 opacity-20" />
      <div className="hive-glow-blob hive-glow-blob--purple w-[400px] h-[400px] top-1/2 -right-20 opacity-10" />

      <div className="hive-page-container relative z-10">
        {/* Header */}
        <div className="hive-page-header">
          <div className="flex flex-col">
            <div className="hive-page-header__eyebrow">
              <div className="hive-page-header__dot" />
              <span className="hive-page-header__label">HiveLearn Platform</span>
            </div>
            <h1 className="hive-title-page uppercase">
              Tus <span className="hive-title-page__accent">Sesiones</span>
            </h1>
            <p className="hive-subtitle">
              Gestiona y continúa tus trayectorias de aprendizaje personalizadas impulsadas por el enjambre.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Model config button */}
            <div className="relative">
              <Button
                variant="ghost"
                onClick={() => setShowModelConfig(v => !v)}
                className={`hive-btn--ghost gap-2 rounded-xl h-12 px-5 border-white/5 transition-all ${showModelConfig ? 'bg-white/10 text-white' : 'text-white/60'
                  }`}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest">
                  {selectedModelId ?? 'Configurar Motor'}
                </span>
              </Button>
              {showModelConfig && (
                <ModelConfigPopover onClose={() => setShowModelConfig(false)} />
              )}
            </div>

            <Button
              onClick={handleNew}
              className="hive-btn--primary"
            >
              <Plus className="w-5 h-5 mr-1" />
              <span className="uppercase tracking-tight">Nueva lección</span>
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mb-12 relative group max-w-4xl mx-auto w-full">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-amber-500 transition-colors" />
            <Input
              placeholder="Buscar por tema, estudiante o ID de sesión..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="hive-input w-full h-16 pl-14 pr-6 rounded-2xl text-lg md:text-xl border-white/10 bg-black/40 backdrop-blur-xl focus:border-amber-500/50 transition-all placeholder:text-white/10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
              >
                <span className="text-xs font-bold uppercase tracking-widest">Limpiar</span>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="relative">
              <div className="text-7xl animate-pulse">🐝</div>
              <div className="absolute inset-0 bg-amber-500/20 blur-3xl animate-pulse-slow" />
            </div>
            <p className="mt-8 hive-label--field animate-pulse">Sincronizando con el enjambre...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="hive-empty-state max-w-2xl mx-auto p-12 text-center">
            <div className="text-6xl mb-6 opacity-20">📚</div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-3">
              {searchTerm ? 'Sin coincidencias' : 'El vacío del conocimiento'}
            </h2>
            <p className="text-white/40 text-sm max-w-xs mx-auto leading-relaxed mb-8">
              {searchTerm
                ? `No encontramos resultados para "${searchTerm}". Prueba con términos más generales.`
                : 'Aún no has iniciado ninguna sesión. El enjambre está listo para comenzar tu primera lección.'}
            </p>
            {!searchTerm && (
              <Button
                onClick={handleNew}
                className="hive-btn--primary px-8"
              >
                Iniciar Primera Sesión
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredSessions.map(session => {
              const isCompleted = !!session.completada
              const isPaused = !isCompleted && !!session.paused_at
              const progress = session.total_nodos > 0
                ? Math.round((session.nodos_completados / session.total_nodos) * 100)
                : 0
              const isBusy = restoring === session.session_id || deleting === session.session_id

              return (
                <div
                  key={session.session_id}
                  className="group hive-card hive-card--active flex flex-col min-h-[340px]"
                >
                  <div className="hive-card-body flex flex-col flex-1 gap-6">
                    {/* Header: Status & XP */}
                    <div className="flex items-center justify-between">
                      <div className={`hive-tag ${isCompleted ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' :
                        isPaused ? 'border-amber-500/20 text-amber-400 bg-amber-500/5' :
                          'hive-tag--provider'
                        }`}>
                        {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : isPaused ? <PauseCircle className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        <span>{isCompleted ? 'Completada' : isPaused ? 'Pausada' : 'Activa'}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-[11px] font-black text-white">{session.xp_total} XP</span>
                      </div>
                    </div>

                    {/* Topic & Student */}
                    <div className="space-y-3">
                      <h3 className="text-xl font-black text-white uppercase tracking-tight leading-[1.1] group-hover:text-amber-400 transition-colors line-clamp-3">
                        {session.meta || 'Lección Exploratoria'}
                      </h3>
                      <div className="flex items-center gap-2 text-white/30">
                        <User className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest truncate">
                          {session.nombre || 'ID: ' + session.alumno_id.slice(0, 8)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Info */}
                    <div className="mt-auto space-y-3">
                      <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                          <span className="hive-label text-[9px]">Progreso del Nodo</span>
                          <span className="text-xs font-black text-white/80">{session.nodos_completados} / {session.total_nodos}</span>
                        </div>
                        {isCompleted && session.evaluacion_puntaje != null && (
                          <div className="flex flex-col items-end">
                            <span className="hive-label text-[9px]">Puntaje Final</span>
                            <span className="text-lg font-black text-amber-400">{session.evaluacion_puntaje}%</span>
                          </div>
                        )}
                      </div>

                      <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-1000 ${isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-amber-300'
                            }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/[0.05]">
                      <div className="flex items-center gap-2 text-white/20">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">{timeAgo(session.created_at)}</span>
                      </div>
                      <div className="hive-mono">{session.nivel_alcanzado}</div>
                    </div>

                    {/* Actions Overlay / Bottom */}
                    <div className="flex gap-3 mt-2">
                      <Button
                        onClick={() => handleContinue(session)}
                        disabled={isBusy}
                        className={`flex-1 h-12 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${isCompleted
                          ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/5 hover:bg-white/10 text-white border border-white/10 group-hover:border-amber-500/30'
                          }`}
                      >
                        {restoring === session.session_id ? (
                          <span className="animate-pulse">Sincronizando...</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            {isCompleted ? 'Revisar Resultados' : 'Retomar Lección'}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(session.session_id)}
                        disabled={isBusy}
                        className="h-12 w-12 rounded-xl bg-red-500/5 hover:bg-red-500/20 text-red-500/30 hover:text-red-500 transition-all border border-transparent hover:border-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Bottom Strip */}
                  <div className="hive-strip--bottom" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
