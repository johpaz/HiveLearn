import { useEffect, useState } from "react";
import {
  RefreshCw, BookOpen, CheckCircle2, Clock, Zap, Star,
  Trash2, Play, Trophy, Target, TrendingUp, Award,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/api";

interface HLSession {
  session_id: string;
  alumno_id: string;
  curriculo_id: number;
  meta: string;
  nombre: string;
  rango_edad: string;
  total_nodos: number;
  nodos_completados: number;
  xp_total: number;
  nivel_alcanzado: string;
  evaluacion_puntaje: number | null;
  completada: number;
  created_at: number;
}

interface HLMetrics {
  total_xp: number;
  avg_score: number;
  completion_rate: number;
  total_sessions: number;
  completed_sessions: number;
}

const RANGO_LABEL: Record<string, string> = {
  nino: 'Niño', adolescente: 'Adolescente', adulto: 'Adulto',
};

const NIVEL_EMOJI: Record<string, string> = {
  principiante: '🌱', intermedio: '⚡', avanzado: '🔥', experto: '💎',
};

// ─── Brand Panel (left side) ─────────────────────────────────────────────────
function BrandPanel({ count, completed, inProgress }: {
  count: number;
  completed: number;
  inProgress: number;
}) {
  return (
    <div className="hidden lg:flex flex-shrink-0 w-[420px] xl:w-[520px] relative overflow-hidden bg-background border-r border-border">
      {/* Hive Hex Pattern */}
      <div className="absolute inset-0 z-0 opacity-[0.03] hive-hex-pattern" />
      <div className="absolute inset-0 bg-gradient-to-br from-hive-amber/5 via-transparent to-transparent z-0" />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col justify-between h-full p-10 xl:p-12">
        {/* Top branding */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-hive-amber/10 border border-hive-amber/20 flex items-center justify-center text-2xl shadow-sm">
              🐝
            </div>
            <div>
              <span className="text-xl font-bold text-foreground tracking-tight">HiveLearn</span>
              <p className="text-[11px] text-muted-foreground font-light">Aprendizaje adaptativo, 100% offline</p>
            </div>
          </div>

          <div className="pt-4">
            <h2 className="text-4xl xl:text-5xl font-black text-foreground leading-[1.1] tracking-tight mb-4">
              Mis{' '}
              <span className="text-hive-amber">
                Sesiones
              </span>
            </h2>
            <p className="text-muted-foreground text-sm font-light leading-relaxed max-w-sm">
              Revisa tu historial de aprendizaje, retoma sesiones pendientes y visualiza tu progreso en el conocimiento.
            </p>
          </div>
        </div>

        {/* Stats summary */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Completadas', value: completed, icon: '✅' },
              { label: 'En progreso', value: inProgress, icon: '🔄' },
            ].map(s => (
              <div key={s.label} className="bg-secondary/50 rounded-xl border border-border p-4 shadow-sm">
                <span className="text-lg">{s.icon}</span>
                <p className="text-2xl font-black text-foreground mt-1">{s.value}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          <p className="text-[11px] text-muted-foreground/50 font-light">
            {count} sesión{count !== 1 ? 'es' : ''} en total
          </p>
        </div>
      </div>
    </div>
  );
}


// ─── Stat chip ────────────────────────────────────────────────────────────────
function StatChip({
  icon: Icon, value, label, color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 transition-all duration-300 hover:bg-secondary/40 shadow-sm ${color}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 opacity-70" />
        <span className="text-[10px] uppercase tracking-widest font-bold opacity-60">{label}</span>
      </div>
      <span className="text-xl font-black">{value}</span>
    </div>
  );
}


// ─── Session card ─────────────────────────────────────────────────────────────
function SessionCard({
  session,
  onDelete,
  onResume,
}: {
  session: HLSession;
  onDelete: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const progress = session.total_nodos > 0
    ? Math.round((session.nodos_completados / session.total_nodos) * 100)
    : 0;

  const date = new Date((session.created_at || 0) * 1000).toLocaleDateString('es', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const nivelEmoji = NIVEL_EMOJI[session.nivel_alcanzado] ?? '📚';
  const isComplete = Boolean(session.completada);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await fetch(`/api/hivelearn/sessions/${session.session_id}`, { method: 'DELETE' });
      onDelete(session.session_id);
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 flex flex-col hover:-translate-y-0.5 hover:shadow-honey
      ${isComplete
        ? 'bg-hive-green/5 border-hive-green/20 hover:border-hive-green/40 shadow-sm'
        : 'bg-background border-border hover:border-hive-amber/30 shadow-sm'
      }`}>


      {/* Top accent line */}
      <div className={`h-px w-full ${isComplete
        ? 'bg-gradient-to-r from-transparent via-hive-green/50 to-transparent'
        : 'bg-gradient-to-r from-transparent via-hive-amber/40 to-transparent'}`} />


      <div className="p-5 flex flex-col flex-1 gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{nivelEmoji}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border
                ${isComplete
                  ? 'bg-hive-green/10 border-hive-green/25 text-hive-green'
                  : 'bg-hive-amber/10 border-hive-amber/25 text-hive-amber'}`}>
                {isComplete ? 'Completada' : 'En progreso'}
              </span>
            </div>
            <p className="text-foreground font-bold text-sm leading-snug line-clamp-2 transition-colors">
              {session.meta || 'Sesión sin título'}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-muted-foreground text-xs">{session.nombre}</span>
              {session.rango_edad && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase tracking-wider font-medium">
                  {RANGO_LABEL[session.rango_edad] ?? session.rango_edad}
                </span>
              )}
            </div>

          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
            <span>{session.nodos_completados} / {session.total_nodos} nodos</span>
            <span className={`font-bold ${isComplete ? 'text-hive-green' : 'text-hive-amber'}`}>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${isComplete ? 'bg-hive-green/60' : 'bg-hive-amber/60'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>


        {/* XP + score row */}
        <div className="flex items-center gap-3 text-xs">
          {session.xp_total > 0 && (
            <div className="flex items-center gap-1 text-hive-amber/80 font-semibold">
              <Zap className="h-3 w-3" />
              {session.xp_total} XP
            </div>
          )}
          {session.evaluacion_puntaje != null && (
            <div className="flex items-center gap-1 text-slate-500 font-semibold">
              <Star className="h-3 w-3" />
              {session.evaluacion_puntaje}%
            </div>
          )}
          <span className="ml-auto text-muted-foreground/40">{date}</span>
        </div>


        {/* Actions */}
        <div className="flex items-center gap-2 mt-auto pt-1 border-t border-border">
          {!isComplete && (
            <button
              onClick={() => onResume(session.session_id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-hive-amber/10 hover:bg-hive-amber/20 border border-hive-amber/20 hover:border-hive-amber/40 text-hive-amber text-xs font-bold transition-all"
            >
              <Play className="h-3.5 w-3.5" />
              Continuar
            </button>
          )}
          {isComplete && (
            <button
              onClick={() => onResume(session.session_id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-hive-green/10 hover:bg-hive-green/20 border border-hive-green/20 hover:border-hive-green/30 text-hive-green text-xs font-bold transition-all"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Revisar
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            onBlur={() => setConfirmDelete(false)}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-bold transition-all
              ${confirmDelete
                ? 'bg-hive-red/20 border-hive-red/40 text-hive-red hover:bg-hive-red/30'
                : 'bg-secondary border-border text-muted-foreground hover:text-hive-red hover:border-hive-red/30 hover:bg-hive-red/5'
              }`}
          >
            {deleting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {confirmDelete && !deleting && <span className="hidden sm:inline">¿Eliminar?</span>}
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="h-52 rounded-2xl border border-border bg-secondary/30 animate-pulse" />
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────
export function HiveLearnSessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<HLSession[]>([]);
  const [metrics, setMetrics] = useState<HLMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [sessData, metData] = await Promise.all([
        apiClient<{ sessions: any[] }>("/api/hivelearn/sessions", { showError: false }),
        apiClient<any>("/api/hivelearn/metrics", { showError: false }).catch(() => null),
      ]);
      setSessions(sessData.sessions ?? []);
      if (metData) setMetrics(metData);
    } catch {
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDelete = (id: string) => {
    setSessions(prev => prev.filter(s => s.session_id !== id));
  };

  const handleResume = (id: string) => {
    navigate(`/hivelearn?session=${id}`);
  };

  const filteredSessions = sessions.filter(s => {
    if (filter === 'active') return !s.completada;
    if (filter === 'completed') return Boolean(s.completada);
    return true;
  });

  const completed = sessions.filter(s => s.completada).length;
  const inProgress = sessions.filter(s => !s.completada).length;
  const totalXp = metrics?.total_xp ?? sessions.reduce((acc, s) => acc + (s.xp_total || 0), 0);
  const avgScore = metrics?.avg_score
    ?? (sessions.filter(s => s.evaluacion_puntaje != null).length > 0
      ? Math.round(sessions.reduce((a, s) => a + (s.evaluacion_puntaje ?? 0), 0) / sessions.filter(s => s.evaluacion_puntaje != null).length)
      : null);

  return (
    <div className="hive-page animate-in fade-in duration-700">
      <div className="hive-page-container flex gap-8">
        {/* Brand Panel (left) */}
        <BrandPanel count={sessions.length} completed={completed} inProgress={inProgress} />

        {/* Main Content (right) */}
        <div className="flex-1 relative z-10">
          {/* Stats row */}
          {!isLoading && sessions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-in slide-in-from-bottom-4 duration-700">
              <StatChip
                icon={Trophy}
                value={completed}
                label="Completadas"
                color="bg-hive-green/5 border-hive-green/20 text-hive-green"
              />
              <StatChip
                icon={Target}
                value={inProgress}
                label="En progreso"
                color="bg-hive-amber/5 border-hive-amber/20 text-hive-amber"
              />
              <StatChip
                icon={Zap}
                value={`${totalXp} XP`}
                label="XP total"
                color="bg-slate-500/5 border-slate-500/20 text-slate-600"
              />
              <StatChip
                icon={TrendingUp}
                value={avgScore != null ? `${avgScore}%` : '—'}
                label="Puntaje medio"
                color="bg-hive-green/5 border-hive-green/20 text-hive-green"
              />
            </div>

          )}

          {/* Filter tabs + New session button */}
          <div className="flex items-center justify-between mb-6">
            {!isLoading && sessions.length > 0 && (
              <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-xl border border-border shadow-sm">
                {(['all', 'active', 'completed'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all
                      ${filter === f
                        ? 'bg-hive-amber text-primary-foreground shadow-honey'
                        : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {f === 'all' ? 'Todas' : f === 'active' ? 'En progreso' : 'Completadas'}
                  </button>
                ))}
              </div>
            )}


            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/hivelearn")}
                className="px-5 py-2.5 bg-hive-amber hover:bg-hive-amber/90 text-primary-foreground font-bold rounded-xl text-sm transition-all shadow-honey flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Nueva lección
              </button>

              <button
                onClick={fetchAll}
                disabled={isLoading}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all group"
                title="Refrescar"
              >
                <RefreshCw className={`h-4 w-4 text-blue-400/70 transition-transform group-hover:rotate-180 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredSessions.length === 0 && sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border border-border rounded-3xl bg-secondary/20 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.02] hive-hex-pattern pointer-events-none" />
              <div className="text-6xl mb-4 animate-bounce relative z-10">🐝</div>
              <h3 className="text-xl font-bold text-foreground mb-2 relative z-10">Sin sesiones todavía</h3>
              <p className="text-muted-foreground mb-6 text-sm max-w-xs leading-relaxed relative z-10">
                Completa tu primera lección para ver tu historial, XP ganado y estadísticas de aprendizaje.
              </p>
              <button
                onClick={() => navigate("/hivelearn")}
                className="px-6 py-3 bg-hive-amber hover:bg-hive-amber/90 text-primary-foreground font-bold rounded-xl transition-all shadow-honey relative z-10"
              >
                Empezar a aprender
              </button>
            </div>

          ) : filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl mb-3 opacity-50">
                {filter === 'active' ? '✅' : '⏳'}
              </div>
              <p className="text-muted-foreground text-sm">
                {filter === 'active' ? '¡Has completado todas tus sesiones!' : 'Todavía no has completado ninguna sesión.'}
              </p>
            </div>

          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in slide-in-from-bottom-8 duration-700">
              {filteredSessions.map(session => (
                <SessionCard
                  key={session.session_id}
                  session={session}
                  onDelete={handleDelete}
                  onResume={handleResume}
                />
              ))}
            </div>
          )}

          {/* Bottom CTA */}
          {!isLoading && completed > 0 && (
            <div className="mt-8 text-center">
              <p className="text-[11px] text-muted-foreground/50 font-mono tracking-wider">
                🏆 {completed} lección{completed !== 1 ? 'es' : ''} completada{completed !== 1 ? 's' : ''} &nbsp;·&nbsp;
                ⚡ {totalXp} XP ganados &nbsp;·&nbsp;
                {avgScore != null ? `📊 ${avgScore}% promedio` : '🐝 Sigue aprendiendo'}
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
