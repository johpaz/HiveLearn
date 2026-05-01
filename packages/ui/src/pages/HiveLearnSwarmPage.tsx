import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLessonStore } from "@/store/lessonStore";
import {
  RefreshCw, Settings2, Crown, Shield, Bot, Terminal,
  Wifi, WifiOff, Zap, Eye, Grid3X3, Rocket, Clock,
} from "lucide-react";
import { useHiveLearnLive, type AgentLiveStatus } from "@/hooks/useHiveLearnLive";
import { AgentConfigDialog } from "@/modules/hivelearn/AgentConfigDialog";
import { apiClient } from "@/lib/api";
import { LaboratoryWorld } from "@/canvaslearn/mundo1/LaboratoryWorld";
import type { AgentStatus } from "@/canvaslearn/mundo1/constants";

// ─── Types ───────────────────────────────────────────────────────────────────
interface HLAgent {
  id: string;
  name: string;
  description: string;
  role: "coordinator" | "worker";
  status: string;
  providerId: string;
  modelId: string;
  enabled: boolean;
  systemPrompt?: string;
  workspace?: string;
  tone?: string;
  maxIterations?: number;
}

interface AgentState {
  status: "idle" | "running" | "thinking" | "tool_call" | "completed" | "failed";
  currentTool?: string | null;
  model?: string;
  tools?: number;
}

// ─── Static metadata ──────────────────────────────────────────────────────────
const AGENT_META: Record<string, { icon: any; emoji: string; label: string; accion: string; color: string }> = {
  "hl-profile-agent":      { icon: Bot,         emoji: "👤", label: "Perfil",       accion: "Analiza edad, nivel y estilo de aprendizaje", color: "blue" },
  "hl-intent-agent":       { icon: Crown,        emoji: "🎯", label: "Intención",    accion: "Extrae el tema y define los objetivos", color: "amber" },
  "hl-structure-agent":    { icon: Terminal,     emoji: "🗺️", label: "Estructura",   accion: "Diseña el mapa de nodos del currículo", color: "indigo" },
  "hl-explanation-agent":  { icon: Bot,          emoji: "📖", label: "Explicación",  accion: "Genera teoría clara y ejemplos", color: "emerald" },
  "hl-exercise-agent":     { icon: Zap,          emoji: "✏️", label: "Ejercicios",   accion: "Crea práctica activa paso a paso", color: "orange" },
  "hl-quiz-agent":         { icon: Bot,          emoji: "❓", label: "Quiz",         accion: "Prepara preguntas de verificación", color: "pink" },
  "hl-challenge-agent":    { icon: Shield,       emoji: "⚡", label: "Reto",         accion: "Diseña desafíos integradores", color: "red" },
  "hl-code-agent":         { icon: Terminal,     emoji: "💻", label: "Código",       accion: "Genera ejemplos ejecutables", color: "cyan" },
  "hl-svg-agent":          { icon: Bot,          emoji: "📊", label: "Diagrama",     accion: "Dibuja visualizaciones SVG", color: "teal" },
  "hl-gif-agent":          { icon: Zap,          emoji: "🎞️", label: "Animación",    accion: "Crea guías animadas paso a paso", color: "violet" },
  "hl-image-agent":        { icon: Bot,          emoji: "🖼️", label: "Imagen",       accion: "Genera imágenes educativas con IA", color: "fuchsia" },
  "hl-infographic-agent":  { icon: Terminal,     emoji: "📈", label: "Infografía",   accion: "Construye resumen visual del tema", color: "lime" },
  "hl-gamification-agent": { icon: Crown,        emoji: "🏆", label: "Gamificación", accion: "Asigna XP, logros y rachas", color: "yellow" },
  "hl-evaluation-agent":   { icon: Shield,       emoji: "📝", label: "Evaluación",   accion: "Prepara examen final adaptativo", color: "rose" },
  "hl-coordinator-agent":  { icon: Crown,        emoji: "🔍", label: "Coordinador",  accion: "Revisa coherencia pedagógica", color: "purple" },
  "hl-feedback-agent":     { icon: Bot,          emoji: "🧠", label: "Feedback",     accion: "Evalúa comprensión semántica del alumno", color: "sky" },
  "hl-audio-agent":        { icon: Zap,          emoji: "🔊", label: "Audio",         accion: "Genera script de narración educativa", color: "green" },
};

const WORKER_IDS = Object.keys(AGENT_META).filter(id => id !== "hl-coordinator-agent");

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; glow: string; iconBg: string; badgeBorder: string }> = {
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", glow: "shadow-[0_0_20px_rgba(59,130,246,0.25)]", iconBg: "bg-blue-500/15", badgeBorder: "border-blue-500/20" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", glow: "shadow-[0_0_20px_rgba(245,158,11,0.25)]", iconBg: "bg-amber-500/15", badgeBorder: "border-amber-500/20" },
  indigo: { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400", glow: "shadow-[0_0_20px_rgba(99,102,241,0.25)]", iconBg: "bg-indigo-500/15", badgeBorder: "border-indigo-500/20" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", glow: "shadow-[0_0_20px_rgba(16,185,129,0.25)]", iconBg: "bg-emerald-500/15", badgeBorder: "border-emerald-500/20" },
  orange: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", glow: "shadow-[0_0_20px_rgba(249,115,22,0.25)]", iconBg: "bg-orange-500/15", badgeBorder: "border-orange-500/20" },
  pink: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-400", glow: "shadow-[0_0_20px_rgba(236,72,153,0.25)]", iconBg: "bg-pink-500/15", badgeBorder: "border-pink-500/20" },
  red: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", glow: "shadow-[0_0_20px_rgba(239,68,68,0.25)]", iconBg: "bg-red-500/15", badgeBorder: "border-red-500/20" },
  cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400", glow: "shadow-[0_0_20px_rgba(6,182,212,0.25)]", iconBg: "bg-cyan-500/15", badgeBorder: "border-cyan-500/20" },
  teal: { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-400", glow: "shadow-[0_0_20px_rgba(20,184,166,0.25)]", iconBg: "bg-teal-500/15", badgeBorder: "border-teal-500/20" },
  violet: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-400", glow: "shadow-[0_0_20px_rgba(139,92,246,0.25)]", iconBg: "bg-violet-500/15", badgeBorder: "border-violet-500/20" },
  fuchsia: { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/30", text: "text-fuchsia-400", glow: "shadow-[0_0_20px_rgba(217,70,239,0.25)]", iconBg: "bg-fuchsia-500/15", badgeBorder: "border-fuchsia-500/20" },
  lime: { bg: "bg-lime-500/10", border: "border-lime-500/30", text: "text-lime-400", glow: "shadow-[0_0_20px_rgba(132,204,22,0.25)]", iconBg: "bg-lime-500/15", badgeBorder: "border-lime-500/20" },
  yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", glow: "shadow-[0_0_20px_rgba(234,179,8,0.25)]", iconBg: "bg-yellow-500/15", badgeBorder: "border-yellow-500/20" },
  rose: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400", glow: "shadow-[0_0_20px_rgba(244,63,94,0.25)]", iconBg: "bg-rose-500/15", badgeBorder: "border-rose-500/20" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", glow: "shadow-[0_0_20px_rgba(168,85,247,0.25)]", iconBg: "bg-purple-500/15", badgeBorder: "border-purple-500/20" },
  sky: { bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-400", glow: "shadow-[0_0_20px_rgba(14,165,233,0.25)]", iconBg: "bg-sky-500/15", badgeBorder: "border-sky-500/20" },
  green: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400", glow: "shadow-[0_0_20px_rgba(34,197,94,0.25)]", iconBg: "bg-green-500/15", badgeBorder: "border-green-500/20" },
};

const STATUS_COLORS: Record<AgentState["status"], string> = {
  idle: "bg-emerald-500",
  running: "bg-green-500",
  thinking: "bg-purple-500",
  tool_call: "bg-cyan-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

const STATUS_LABELS: Record<AgentState["status"], string> = {
  idle: "Disponible",
  running: "Ejecutando",
  thinking: "Pensando",
  tool_call: "Usando Herramienta",
  completed: "Completado",
  failed: "Error",
};

// ─── Live Badge ───────────────────────────────────────────────────────────────
function LiveBadge({ isConnected }: { isConnected: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest
      ${isConnected
        ? "bg-hive-green/10 border-hive-green/20 text-hive-green"
        : "bg-secondary border-border text-muted-foreground"}`}>
      {isConnected
        ? <><Wifi className="h-3 w-3 animate-pulse" /> Live</>
        : <><WifiOff className="h-3 w-3" /> Offline</>}
    </div>

  );
}

// ─── Worker Card (Canvas style) ──────────────────────────────────────────────
function WorkerGraphNode({
  agentId, dbAgent, agentState, onConfigSuccess,
}: {
  agentId: string;
  dbAgent?: HLAgent;
  agentState: AgentState;
  onConfigSuccess: () => void;
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const meta = AGENT_META[agentId];
  if (!meta) return null;

  const colors = COLOR_MAP[meta.color] ?? COLOR_MAP.blue;

  const IconComponent = meta.icon ?? Bot;

  const { status, currentTool } = agentState;
  const isThinking = status === "thinking";
  const isToolCall = status === "tool_call";
  const isActive = isThinking || isToolCall || status === "running";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isDisabled = dbAgent && !dbAgent.enabled;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`relative group w-full rounded-xl p-5 flex flex-col gap-4 transition-all duration-300 cursor-pointer
        bg-black/40 backdrop-blur-md
        ${isThinking
          ? `border ${colors.border} ${colors.glow}`
          : isCompleted
          ? "border border-hive-green/30"
          : isFailed
          ? "border border-hive-red/30"
          : "border border-white/[0.08] hover:border-amber-500/30 hover:translate-y-[-2px]"}
        ${isDisabled ? "opacity-50 grayscale" : ""}
      `}
      onClick={() => setConfigOpen(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setConfigOpen(true); }}
    >

      {/* Top accent line when active */}
      {isActive && (
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-${meta.color}-500/60 to-transparent animate-pulse`} />
      )}

      {/* Header: Icon + Badge */}
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-xl ${colors.iconBg} border ${colors.badgeBorder} bg-secondary/50`}>
          <IconComponent className={`h-6 w-6 ${colors.text} ${isActive ? "animate-pulse" : ""}`} />
        </div>
        <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase border ${colors.bg} ${colors.text} ${colors.badgeBorder}`}>
          {meta.label}
        </span>
      </div>


      {/* Content: Name + Description */}
      <div className="flex-1 space-y-2">
        <div>
          <h3 className="font-bold text-foreground text-base leading-tight mb-1.5">{meta.label}</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{meta.accion}</p>
        </div>


        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {isThinking ? (
            <div className="flex gap-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${colors.text} animate-bounce`} />
              <span className={`w-1.5 h-1.5 rounded-full ${colors.text} animate-bounce [animation-delay:-0.15s]`} />
              <span className={`w-1.5 h-1.5 rounded-full ${colors.text} animate-bounce [animation-delay:-0.3s]`} />
            </div>
          ) : (
            <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[status] ?? "bg-slate-300"}`} />
          )}
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>


        {/* Provider / Model badge */}
        {dbAgent?.providerId && (
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground/40">
            <span className={`${colors.text} opacity-60`}>{dbAgent.providerId}</span>
            <span className="text-muted-foreground/20">·</span>
            <span className="truncate text-muted-foreground/50">{dbAgent.modelId}</span>
          </div>
        )}

      </div>

      {/* Tool chip */}
      {(isToolCall || isThinking) && currentTool && (
        <div className={`flex items-center gap-2 ${colors.bg} border ${colors.badgeBorder} rounded-lg px-2.5 py-1.5 bg-secondary/50`}>
          <Terminal className={`h-3.5 w-3.5 ${colors.text} shrink-0`} />
          <span className="text-[10px] font-mono text-muted-foreground truncate">{currentTool}</span>
        </div>
      )}


      {/* Configure button */}
      <button
        onClick={(e) => { e.stopPropagation(); setConfigOpen(true); }}
        className="absolute top-3 right-3 p-1.5 rounded-lg transition-all text-muted-foreground/30 hover:text-hive-amber hover:bg-secondary"
        title="Configurar agente"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>


      {/* Config Dialog — div detiene propagación para que la card no intercepte clicks del dialog */}
      <div onClick={e => e.stopPropagation()}>
        <AgentConfigDialog
          agentId={dbAgent?.id ?? agentId}
          agentName={meta.label}
          agentDescription={meta.accion}
          agentData={{
            id: dbAgent?.id ?? agentId,
            name: dbAgent?.name ?? meta.label,
            description: dbAgent?.description ?? meta.accion,
            provider_id: dbAgent?.providerId ?? "",
            model_id: dbAgent?.modelId ?? "",
            system_prompt: dbAgent?.systemPrompt ?? "",
            workspace: dbAgent?.workspace ?? "",
            tone: dbAgent?.tone ?? "",
            role: dbAgent?.role ?? "worker",
            enabled: dbAgent?.enabled ?? true,
            max_iterations: dbAgent?.maxIterations ?? 3,
          }}
          open={configOpen}
          onOpenChange={setConfigOpen}
          onSuccess={onConfigSuccess}
        />
      </div>
    </div>
  );
}

// ─── Coordinator Card (prominent) ─────────────────────────────────────────────
function CoordinatorCard({
  coordinator, agentState, isConnected, isGenerating, onConfigSuccess,
}: {
  coordinator?: HLAgent;
  agentState: AgentState;
  isConnected: boolean;
  isGenerating: boolean;
  onConfigSuccess: () => void;
}) {
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-black/40 backdrop-blur-md p-6 lg:p-8">
      {/* Top amber gradient accent line — Stitch signature */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600" />
      {/* Left amber accent bar */}
      <div className="absolute top-0 left-0 w-px h-full bg-gradient-to-b from-amber-500/60 to-amber-500/10" />
      {/* Ambient glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-[80px] pointer-events-none" />


      <div className="relative z-10 flex flex-col lg:flex-row lg:items-start gap-6">
        {/* Left: icon + info */}
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="p-4 rounded-2xl bg-hive-purple/10 border border-hive-purple/20 shadow-sm flex-shrink-0">
            <Crown className="h-8 w-8 text-hive-purple" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="font-bold text-foreground text-xl lg:text-2xl">
                {coordinator?.name ?? "HiveLearn Coordinator"}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-hive-purple/10 text-hive-purple border border-hive-purple/20">
                Coordinador
              </span>
              <StatusPill status={agentState.status} />
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed mb-3">
              {coordinator?.description ?? "Coordina el enjambre educativo completo. Recibe el perfil del alumno y su meta, delega tareas a 15 agentes workers, ensambla el LessonProgram y lo renderiza vía A2UI."}
            </p>


            {/* Tool chip if active */}
            {(agentState.status === "thinking" || agentState.status === "tool_call") && agentState.currentTool && (
              <div className="inline-flex items-center gap-1.5 bg-hive-purple/5 border border-hive-purple/10 rounded-md px-3 py-1.5">
                <Terminal className="h-3.5 w-3.5 text-hive-purple/70 shrink-0" />
                <span className="text-[10px] font-mono text-hive-purple/80 truncate">⚙ {agentState.currentTool}</span>
              </div>
            )}

          </div>
        </div>

        {/* Right: config info */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <LiveBadge isConnected={isConnected} />
            {isGenerating && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-hive-purple/10 border border-hive-purple/20 text-hive-purple text-[10px] font-bold uppercase tracking-widest animate-pulse">
                <Zap className="h-3 w-3" /> Generando...
              </span>
            )}

          </div>
          {coordinator?.providerId && (
            <div className="text-[10px] text-muted-foreground/50 text-right">
              <div className="font-mono">{coordinator.providerId}</div>
              <div className="font-mono text-hive-purple/60">{coordinator.modelId}</div>
            </div>
          )}

          {coordinator && (
            <button
              onClick={() => setConfigOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80 text-xs transition-all shadow-sm"
            >
              <Settings2 className="h-3 w-3" /> Configurar
            </button>
          )}

        </div>
      </div>

      {/* Coordinator Config Dialog */}
      <div onClick={e => e.stopPropagation()}>
        <AgentConfigDialog
          agentId={coordinator?.id ?? "hl-coordinator-agent"}
          agentName={coordinator?.name ?? "HiveLearn Coordinator"}
          agentDescription={coordinator?.description ?? "Coordina el enjambre educativo completo"}
          agentData={{
            id: coordinator?.id ?? "hl-coordinator-agent",
            name: coordinator?.name ?? "HiveLearn Coordinator",
            description: coordinator?.description ?? "Coordina el enjambre educativo completo",
            provider_id: coordinator?.providerId ?? "",
            model_id: coordinator?.modelId ?? "",
            system_prompt: coordinator?.systemPrompt ?? "",
            workspace: coordinator?.workspace ?? "",
            tone: coordinator?.tone ?? "",
            role: coordinator?.role ?? "coordinator",
            enabled: coordinator?.enabled ?? true,
            max_iterations: coordinator?.maxIterations ?? 10,
          }}
          open={configOpen}
          onOpenChange={setConfigOpen}
          onSuccess={onConfigSuccess}
        />
      </div>
    </div>
  );
}

// ─── Status Pill (compact) ───────────────────────────────────────────────────
function StatusPill({ status }: { status: AgentState["status"] }) {
  const colorMap: Record<AgentState["status"], string> = {
    idle: "bg-secondary text-muted-foreground/60 border-border",
    running: "bg-hive-amber/10 text-hive-amber border-hive-amber/30",
    thinking: "bg-hive-purple/10 text-hive-purple border-hive-purple/30",
    tool_call: "bg-hive-blue/10 text-hive-blue border-hive-blue/30",
    completed: "bg-hive-green/10 text-hive-green border-hive-green/20",
    failed: "bg-hive-red/10 text-hive-red border-hive-red/20",
  };
  const dotColor = STATUS_COLORS[status] ?? "bg-slate-300";


  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${colorMap[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${status === "running" || status === "thinking" ? "animate-pulse" : ""}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function HiveLearnSwarmPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { program, setProgram, perfil: storedPerfil, meta: storedMeta } = useLessonStore();

  // Navigation state from ChatOnboardingScreen
  const navState = location.state as { perfil?: any; meta?: string } | null;
  const perfil = navState?.perfil ?? storedPerfil;
  const meta   = navState?.meta   ?? storedMeta;

  const [dbAgents, setDbAgents] = useState<HLAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [viewMode, setViewMode] = useState<'world' | 'grid'>('world');
  const [isMuted, setIsMuted] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [generationTriggered, setGenerationTriggered] = useState(false);

  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { isConnected, isGenerating: liveGenerating, agentStatuses, currentAgentId } = useHiveLearnLive();
  const isGenerating = liveGenerating || generationTriggered;

  // Convert agentStatuses to AgentStatus type for PixiSwarmWorld
  const pixiAgentStatuses: Record<string, AgentStatus> = {}
  for (const [agentId, status] of Object.entries(agentStatuses)) {
    if (status === 'running') pixiAgentStatuses[agentId] = 'running'
    else if (status === 'completed') pixiAgentStatuses[agentId] = 'completed'
    else if (status === 'failed') pixiAgentStatuses[agentId] = 'failed'
    else pixiAgentStatuses[agentId] = 'idle'
  }

  // Calculate progress based on completed agents
  const totalAgents = Object.keys(AGENT_META).length
  const completedAgents = Object.values(agentStatuses).filter(s => s === 'completed').length
  const progress = isGenerating ? (completedAgents / totalAgents) * 100 : 0

  const fetchAgents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient<any[]>("/api/hivelearn/agents", { showError: false });
      setDbAgents(Array.isArray(data) ? data : []);
    } catch {
      setError("No se pudo cargar el enjambre HiveLearn.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAgents(); }, []);

  // Trigger generation if we arrived here from onboarding with perfil+meta
  useEffect(() => {
    if (!perfil || !meta || generationTriggered || program) return;
    setGenerationTriggered(true);

    const trigger = async () => {
      try {
        const { getInstanceId } = await import('@/store/lessonStore');
        const instanceId = await getInstanceId();
        const db = await fetch('/api/hivelearn/config').then(r => r.json()).catch(() => ({}));
        const providerId = db.providerId ?? 'ollama';
        const modelId    = db.modelId    ?? 'gemma2:9b';

        // POST triggers SSE stream; we don't consume it here — useHiveLearnLive handles WS events
        fetch('/api/hivelearn/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ perfil, meta, providerId, modelId }),
        }).then(async res => {
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) return;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              try {
                const msg = JSON.parse(line.slice(6));
                if (msg.type === 'complete') {
                  setProgram(msg.payload);
                  setGenerationTriggered(false);
                }
              } catch {}
            }
          }
        }).catch(e => {
          console.error('[SwarmPage] generation error', e);
          setGenerationTriggered(false);
        });
      } catch (e) {
        console.error('[SwarmPage] trigger error', e);
        setGenerationTriggered(false);
      }
    };
    trigger();
  }, [perfil, meta, generationTriggered, program, setProgram]);

  // Derive agent states
  useEffect(() => {
    const newStates: Record<string, AgentState> = {};
    for (const agentId of Object.keys(AGENT_META)) {
      const isCurrent = currentAgentId === agentId;
      let status: AgentState["status"] = "idle";
      let currentTool: string | null = null;

      if (isCurrent && isGenerating) {
        status = Math.random() > 0.5 ? "thinking" : "tool_call";
        currentTool = status === "tool_call" ? "delegar_a_enjambre" : null;
      } else if (agentStatuses[agentId] === "completed") {
        status = "completed";
      } else if (agentStatuses[agentId] === "failed") {
        status = "failed";
      }

      const dbAgent = dbAgents.find(a => a.id === agentId);
      newStates[agentId] = {
        status,
        currentTool,
        model: dbAgent?.modelId,
        tools: Math.floor(Math.random() * 5) + 1,
      };
    }
    setAgentStates(newStates);
  }, [agentStatuses, currentAgentId, dbAgents, isGenerating]);

  const agentMap = new Map(dbAgents.map(a => [a.id, a]));
  const coordinator = dbAgents.find(a => a.role === "coordinator");

  const [coordinatorConfigOpen, setCoordinatorConfigOpen] = useState(false);

  const handleConfigSuccess = () => {
    fetchAgents();
    setCoordinatorConfigOpen(false);
  };

  const activeCount = Object.values(agentStates).filter(s =>
    s.status === "running" || s.status === "thinking" || s.status === "tool_call"
  ).length;

  const completedCount = Object.values(agentStates).filter(s => s.status === "completed").length;

  // ─── Transición automática al Mundo de Aprendizaje ─────────────────────────
  
  // Detectar cuando todos los agentes están completados
  const allAgentsCompleted = completedCount >= 16 && !isGenerating;

  useEffect(() => {
    if (allAgentsCompleted && !showTransition) {
      // Iniciar transición
      setShowTransition(true);
      
      // Countdown de 15 segundos
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      // Navegar después de 15 segundos
      transitionTimerRef.current = setTimeout(() => {
        navigate('/mundo');
      }, 15000);
    }
    
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [allAgentsCompleted, showTransition, navigate]);

  const handleIrAlMundo = () => {
    // Navegar inmediatamente al mundo
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    navigate('/mundo');
  };

  return (
    <>
      {/* ── Ambient Glow Blobs (Obsidian Observatory) ── */}
      <div className="ambient-blob-amber w-[500px] h-[500px] top-0 left-0 -translate-x-1/2 -translate-y-1/3 -z-10" />
      <div className="ambient-blob-blue w-[400px] h-[400px] top-0 right-0 translate-x-1/3 -translate-y-1/3 -z-10" />

      <div className="relative z-10 space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-black tracking-[0.3em] text-amber-500 uppercase">Internal Protocol</span>
            <div className="h-px flex-1 bg-gradient-to-r from-amber-500/30 to-transparent" />
          </div>
          <h2 className="text-4xl lg:text-6xl font-black tracking-tighter leading-none uppercase">
            Enjambre
            <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent"> Educativo</span>
          </h2>
          <p className="text-muted-foreground font-light text-sm mt-2">Enjambre de {dbAgents.length || 17} agentes educativos especializados</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <LiveBadge isConnected={isConnected} />
          
          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
            <button
              onClick={() => setViewMode('world')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                viewMode === 'world'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Vista Mundo PixiJS"
            >
              <Eye className="h-3.5 w-3.5" />
              Mundo
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                viewMode === 'grid'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Vista Grid"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              Grid
            </button>
          </div>
          
          <button
            className="p-2 rounded-xl glass-card hover:border-amber-500/30 transition-all group shadow-sm"
            onClick={fetchAgents}
            disabled={isLoading}
            title="Refrescar"
          >
            <RefreshCw className={`h-4 w-4 text-amber-400/70 transition-transform duration-500 group-hover:rotate-180 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

      </div>

      {/* ── PixiJS Laboratory World View ── */}
      {viewMode === 'world' && (
        <div className="relative rounded-2xl border border-border/50 overflow-hidden glass-card w-full">
          <LaboratoryWorld
            agentStatuses={pixiAgentStatuses}
            currentAgentId={currentAgentId}
            progress={progress}
            mensaje={isGenerating ? 'Generando lección...' : 'Listo'}
            soundEnabled={!isMuted}
            volume={0.3}
          />
          
          {/* Botón Comenzar Aventura (solo cuando generación completa) */}
          {allAgentsCompleted && !showTransition && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <button
                onClick={handleIrAlMundo}
                className="group relative px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl font-black text-lg shadow-2xl hover:shadow-amber-500/50 transition-all hover:scale-105 animate-pulse"
              >
                <span className="flex items-center gap-3 text-white">
                  <Rocket className="h-6 w-6 group-hover:rotate-12 transition-transform" />
                  🚀 COMENZAR AVENTURA
                  <Rocket className="h-6 w-6 group-hover:-rotate-12 transition-transform" />
                </span>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
              </button>
            </div>
          )}
          
          {/* Overlay de Transición */}
          {showTransition && countdown > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/80 to-amber-900/80 backdrop-blur-md">
              <div className="text-center space-y-6">
                <div className="text-6xl mb-4 animate-bounce">🚀</div>
                <h3 className="text-3xl font-black text-white">
                  ¡Programa Listo!
                </h3>
                <p className="text-xl text-amber-200">
                  Tu aventura de aprendizaje comienza en...
                </p>
                <div className="text-7xl font-black text-amber-400 animate-pulse">
                  {countdown}
                </div>
                <p className="text-sm text-white/70">
                  O haz click para ir ahora
                </p>
                <button
                  onClick={handleIrAlMundo}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all hover:scale-105"
                >
                  Ir Ahora →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Coordinator & Workers Grid View ── */}
      {viewMode === 'grid' && (
        <div className="space-y-6">
          {/* ── Coordinator (prominent, first) ── */}
          <CoordinatorCard
            coordinator={coordinator}
            agentState={agentStates["hl-coordinator-agent"] ?? { status: "idle" }}
            isConnected={isConnected}
            isGenerating={isGenerating}
            onConfigSuccess={handleConfigSuccess}
          />

      {/* ── Workers ── */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest">
              15 Agentes Workers
            </span>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              {activeCount} activos
            </span>
            <span className="flex items-center gap-1.5 text-hive-green">
              <span className="w-2 h-2 rounded-full bg-hive-green" />
              {completedCount} completados
            </span>
          </div>
        </div>


        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {WORKER_IDS.map(id => (
            <WorkerGraphNode
              key={id}
              agentId={id}
              dbAgent={agentMap.get(id)}
              agentState={agentStates[id] ?? { status: "idle" }}
              onConfigSuccess={handleConfigSuccess}
            />
          ))}
        </div>
      </div>

      {/* ── Empty state if no agents ── */}
      {dbAgents.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center glass-card relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.02] hive-hex-pattern pointer-events-none" />
          <div className="text-5xl mb-4 relative z-10">🔍</div>
          <h3 className="text-lg font-black tracking-tight text-foreground mb-2 relative z-10 uppercase">Sin agentes configurados</h3>
          <p className="text-muted-foreground mb-6 text-sm max-w-xs relative z-10">
            Configura un modelo para el coordinador para activar el enjambre.
          </p>
          <button
            onClick={() => setCoordinatorConfigOpen(true)}
            className="px-5 py-2.5 font-bold rounded-xl text-sm transition-all flex items-center gap-2 shadow-sm relative z-10 glow-amber"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ffc174)', color: '#2a1700' }}
          >
            <Settings2 className="h-4 w-4" />
            Configurar coordinador
          </button>
        </div>
      )}


      {/* Coordinator Config Dialog (empty state — rendered even without DB agent) */}
      <AgentConfigDialog
        agentId={coordinator?.id ?? "hl-coordinator-agent"}
        agentName={coordinator?.name ?? "HiveLearn Coordinator"}
        agentDescription={coordinator?.description ?? "Coordina el enjambre educativo completo"}
        agentData={{
          id: coordinator?.id ?? "hl-coordinator-agent",
          name: coordinator?.name ?? "HiveLearn Coordinator",
          description: coordinator?.description ?? "Coordina el enjambre educativo completo",
          provider_id: coordinator?.providerId ?? "",
          model_id: coordinator?.modelId ?? "",
          system_prompt: coordinator?.systemPrompt ?? "",
          workspace: coordinator?.workspace ?? "",
          tone: coordinator?.tone ?? "",
          role: coordinator?.role ?? "coordinator",
          enabled: coordinator?.enabled ?? true,
          max_iterations: coordinator?.maxIterations ?? 10,
        }}
        open={coordinatorConfigOpen}
        onOpenChange={setCoordinatorConfigOpen}
        onSuccess={handleConfigSuccess}
      />
        </div>
      )}
      </div>
    </>
  );
}
