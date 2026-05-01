import { useEffect, useRef, useState } from 'react'
import { useLessonStore } from '../store/lessonStore'
import { fetchWithAuth } from '../lib/fetchWithAuth'
import type { LessonProgram, NivelPrevio } from '@hivelearn/core'

// ── Model Config Popover ─────────────────────────────────────────────────────

interface ProviderRow { id: string; name: string }
interface ModelRow    { id: string; name: string; provider_id: string; context_window?: number }

function ModelConfigPopover({ onClose }: { onClose: () => void }) {
  const { selectedProviderId, selectedModelId, setSelectedProvider, setSelectedModel } = useLessonStore()

  const [providers, setProviders]     = useState<ProviderRow[]>([])
  const [models, setModels]           = useState<ModelRow[]>([])
  const [localProvider, setLocalProvider] = useState<string | null>(selectedProviderId)
  const [localModel, setLocalModel]   = useState<string | null>(selectedModelId)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
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
      } catch {}
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
    } catch {}
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
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 60)  return `hace ${mins} min`
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
        alumnoId:  data.alumno_id,
        tema:      data.meta ?? '',
        topicSlug: data.topic_slug ?? null,
        nodos,
        gamificacion: {
          xpRecompensa: data.xp_total ?? 0,
          logros: [],
          mensajeCelebracion: '¡Lección completada!',
        },
        evaluacion: { preguntas: [] },
        perfilAdaptacion: {
          duracionSesion:     20,
          nodosRecomendados:  nodos.length,
          tono:               'amigable',
        },
      }

      restoreSession(program, {
        sessionId:        data.session_id,
        xpTotal:          data.xp_total ?? 0,
        nodosCompletados: [],
        lastNodeId:       data.last_node_id ?? null,
        sessionStateJson: data.session_state_json ?? null,
        paused_at:        data.paused_at ?? null,
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
    <div className="flex-1 flex flex-col min-h-0 bg-gray-950 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🐝</span>
          <div>
            <h1 className="text-xl font-bold text-white">HiveLearn</h1>
            <p className="text-xs text-gray-500">Tus sesiones de aprendizaje</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Model config button */}
          <div className="relative">
            <button
              onClick={() => setShowModelConfig(v => !v)}
              title="Configurar modelo del enjambre"
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all
                ${showModelConfig
                  ? 'bg-gray-800 border-blue-500/50 text-blue-300'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'}`}
            >
              <span>⚙️</span>
              <span className="hidden sm:inline max-w-[120px] truncate">
                {selectedModelId ?? 'Modelo'}
              </span>
            </button>
            {showModelConfig && (
              <ModelConfigPopover onClose={() => setShowModelConfig(false)} />
            )}
          </div>

          <button
            onClick={handleNew}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.97]"
          >
            + Nueva lección
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-5xl mb-3 animate-pulse">🐝</div>
            <p className="text-gray-400 text-sm">Cargando sesiones...</p>
          </div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-6xl">📚</div>
            <h2 className="text-lg font-bold text-white">Sin sesiones aún</h2>
            <p className="text-gray-500 text-sm">Crea tu primera lección personalizada</p>
            <button
              onClick={handleNew}
              className="px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all"
            >
              + Nueva lección
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map(session => {
            const isCompleted = !!session.completada
            const isPaused = !isCompleted && !!session.paused_at
            const progress = session.total_nodos > 0
              ? Math.round((session.nodos_completados / session.total_nodos) * 100)
              : 0
            const isBusy = restoring === session.session_id || deleting === session.session_id

            return (
              <div
                key={session.session_id}
                className="rounded-2xl bg-gray-900 border border-gray-800 p-5 flex flex-col gap-4 hover:border-gray-700 transition-colors"
              >
                {/* Status badge */}
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    isCompleted
                      ? 'bg-green-500/15 text-green-400'
                      : isPaused
                      ? 'bg-yellow-500/15 text-yellow-400'
                      : 'bg-blue-500/15 text-blue-400'
                  }`}>
                    {isCompleted ? '✅ Completada' : isPaused ? '⏸ Pausada' : '🔵 En progreso'}
                  </span>
                  <span className="text-[11px] text-gray-600">{timeAgo(session.created_at)}</span>
                </div>

                {/* Topic */}
                <div>
                  <p className="text-white font-semibold text-sm leading-snug line-clamp-2">
                    {session.meta || 'Sin tema'}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">{session.nombre || session.alumno_id}</p>
                </div>

                {/* Progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{session.nodos_completados}/{session.total_nodos} nodos</span>
                    {isCompleted && session.evaluacion_puntaje != null && (
                      <span className="text-amber-400 font-bold">{session.evaluacion_puntaje}%</span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* XP */}
                <div className="flex items-center gap-1.5">
                  <span className="text-yellow-400 text-sm">⚡</span>
                  <span className="text-xs text-gray-400">{session.xp_total} XP · {session.nivel_alcanzado}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-2 border-t border-gray-800">
                  <button
                    onClick={() => handleContinue(session)}
                    disabled={isBusy}
                    className="flex-1 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {restoring === session.session_id
                      ? 'Cargando...'
                      : isCompleted ? 'Ver resultado' : 'Continuar'}
                  </button>
                  <button
                    onClick={() => handleDelete(session.session_id)}
                    disabled={isBusy}
                    className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors disabled:opacity-50"
                    title="Eliminar sesión"
                  >
                    {deleting === session.session_id ? '...' : '🗑'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
