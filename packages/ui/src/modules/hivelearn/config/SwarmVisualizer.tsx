import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import {
  Bot,
  Brain,
  Settings2,
  User,
  FileText,
  Lightbulb,
  Target,
  ClipboardList,
  Code2,
  Image,
  Film,
  BarChart3,
  Camera,
  Trophy,
  MessageSquare,
  Headphones,
  Sparkles,
  X,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  role: "coordinator" | "worker";
  provider_id: string;
  model_id: string;
  max_iterations: number;
  tools_json: string;
  workspace: string | null;
  tone: string | null;
  enabled: number;
  updated_at: string;
}

interface Provider {
  id: string;
  name: string;
  enabled: number;
  active: number;
}

interface Model {
  id: string;
  name: string;
  provider_id: string;
  enabled: number;
  active: number;
}

interface AgentConfig {
  provider_id: string;
  model_id: string;
  max_iterations: number;
  enabled: number;
  system_prompt: string;
}

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "hl-profile-agent": User,
  "hl-intent-agent": Target,
  "hl-structure-agent": ClipboardList,
  "hl-explanation-agent": Lightbulb,
  "hl-exercise-agent": FileText,
  "hl-quiz-agent": ClipboardList,
  "hl-challenge-agent": Trophy,
  "hl-code-agent": Code2,
  "hl-svg-agent": Image,
  "hl-gif-agent": Film,
  "hl-infographic-agent": BarChart3,
  "hl-image-agent": Camera,
  "hl-gamification-agent": Sparkles,
  "hl-evaluation-agent": ClipboardList,
  "hl-feedback-agent": MessageSquare,
  "hl-audio-agent": Headphones,
  "hl-onboarding-agent": User,
};

const AGENT_COLORS: Record<string, string> = {
  coordinator: "from-amber-500/20 to-orange-500/20 border-amber-500/50",
  profile: "from-blue-500/20 to-cyan-500/20 border-blue-500/50",
  intent: "from-purple-500/20 to-pink-500/20 border-purple-500/50",
  structure: "from-green-500/20 to-emerald-500/20 border-green-500/50",
  explanation: "from-yellow-500/20 to-amber-500/20 border-yellow-500/50",
  exercise: "from-indigo-500/20 to-blue-500/20 border-indigo-500/50",
  quiz: "from-rose-500/20 to-red-500/20 border-rose-500/50",
  challenge: "from-orange-500/20 to-amber-500/20 border-orange-500/50",
  code: "from-slate-500/20 to-gray-500/20 border-slate-500/50",
  svg: "from-teal-500/20 to-cyan-500/20 border-teal-500/50",
  gif: "from-fuchsia-500/20 to-purple-500/20 border-fuchsia-500/50",
  infographic: "from-lime-500/20 to-green-500/20 border-lime-500/50",
  image: "from-violet-500/20 to-purple-500/20 border-violet-500/50",
  gamification: "from-pink-500/20 to-rose-500/20 border-pink-500/50",
  evaluation: "from-red-500/20 to-orange-500/20 border-red-500/50",
  feedback: "from-emerald-500/20 to-teal-500/20 border-emerald-500/50",
  audio: "from-cyan-500/20 to-blue-500/20 border-cyan-500/50",
  onboarding: "from-blue-500/20 to-indigo-500/20 border-blue-500/50",
};

function getColorCategory(agentId: string): string {
  if (agentId === "hl-coordinator-agent") return "coordinator";
  const match = agentId.match(/hl-(\w+)-agent/);
  return match ? match[1] : "default";
}

interface AgentModalProps {
  agent: Agent;
  providers: Provider[];
  models: Model[];
  onClose: () => void;
  onSave: (config: AgentConfig) => Promise<void>;
}

function AgentModal({ agent, providers, models, onClose, onSave }: AgentModalProps) {
  const [providerId, setProviderId] = useState(agent.provider_id);
  const [modelId, setModelId] = useState(agent.model_id);
  const [maxIterations, setMaxIterations] = useState(agent.max_iterations);
  const [enabled, setEnabled] = useState(agent.enabled === 1);
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || "");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const availableModels = models.filter(m => m.provider_id === providerId);
  const colorCategory = getColorCategory(agent.id);
  const borderColor = AGENT_COLORS[colorCategory]?.split(" ")[2] || "border-gray-500/50";

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        provider_id: providerId,
        model_id: modelId,
        max_iterations: maxIterations,
        enabled: enabled ? 1 : 0,
        system_prompt: systemPrompt,
      });
    } finally {
      setSaving(false);
    }
  };

  const Icon = agent.id === "hl-coordinator-agent" ? Brain : (AGENT_ICONS[agent.id] || Bot);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-500">
      {/* Heavy Glass Backdrop */}
      <div className="absolute inset-0 bg-[#0e131f]/90 backdrop-blur-2xl" onClick={onClose} />

      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-[2.5rem] bg-card/40 shadow-[0_64px_128px_-24px_rgba(0,0,0,0.8)] border border-white/[0.05]"
        onClick={e => e.stopPropagation()}
      >
        {/* Editorial Header */}
        <div className="relative z-10 px-10 py-8 border-b border-white/[0.03] bg-white/[0.02] backdrop-blur-3xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className={`p-4 rounded-2xl bg-gradient-to-br ${AGENT_COLORS[colorCategory] || "from-white/5 to-white/1"} border border-white/[0.05]`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-hive-amber shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Configuración_Nodo_IA</span>
                </div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">{agent.name}</h3>
                <p className="text-[10px] font-mono text-white/30 tracking-widest mt-1.5">{agent.id.toUpperCase()}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-3 rounded-xl hover:bg-white/5 text-white/20 hover:text-white transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-10 space-y-10 overflow-y-auto max-h-[calc(90vh-200px)] custom-scrollbar">
          {/* Metadata Row */}
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/10">Descripción_Funcional</span>
              <p className="text-sm text-white/40 leading-relaxed italic">{agent.description}</p>
            </div>
            <div className="flex flex-wrap gap-3 items-start justify-end">
              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-3xl
                ${agent.role === "coordinator" ? "bg-hive-amber/10 text-hive-amber" : "bg-hive-blue/10 text-hive-blue"}`}>
                {agent.role === "coordinator" ? "COORDINADOR_IO" : "TRABAJADOR_UNIT"}
              </span>
              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-3xl
                ${enabled ? "bg-hive-connected/10 text-hive-connected" : "bg-white/5 text-white/20"}`}>
                {enabled ? "ESTADO_ACTIVO" : "ESTADO_LATENTE"}
              </span>
            </div>
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-white/[0.03]">
            {/* Provider */}
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/10">Terminal_de_Procesamiento</label>
              <select
                value={providerId}
                onChange={e => {
                  setProviderId(e.target.value);
                  setModelId("");
                }}
                className="w-full h-14 px-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-white text-xs font-black uppercase tracking-widest focus:bg-white/[0.05] transition-all outline-none"
              >
                {providers.map(p => (
                  <option key={p.id} value={p.id} className="bg-[#0e131f]">{p.name}</option>
                ))}
              </select>
            </div>

            {/* Model */}
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/10">Núcleo_Lógico</label>
              <select
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                className="w-full h-14 px-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-white text-xs font-black uppercase tracking-widest focus:bg-white/[0.05] transition-all outline-none"
              >
                {availableModels.length === 0 ? (
                  <option value="">SIN_MODELOS_DETECTADOS</option>
                ) : (
                  availableModels.map(m => (
                    <option key={m.id} value={m.id} className="bg-[#0e131f]">{m.name.toUpperCase()}</option>
                  ))
                )}
              </select>
            </div>

            {/* Max Iterations */}
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/10">Límite_de_Recursión</label>
              <input
                type="number"
                min="1"
                max="10"
                value={maxIterations}
                onChange={e => setMaxIterations(parseInt(e.target.value) || 3)}
                className="w-full h-14 px-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-white text-xs font-mono tracking-widest focus:bg-white/[0.05] transition-all outline-none"
              />
            </div>

            {/* Enabled Toggle */}
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/10">Conmutación_Estado</label>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`w-full h-14 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 active:scale-95
                  ${enabled ? "bg-hive-amber text-[#2a1700]" : "bg-white/[0.02] text-white/20 border border-white/[0.05]"}`}
              >
                {enabled ? "DESACTIVAR_NODO" : "ACTIVAR_NODO"}
              </button>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-4 pt-10 border-t border-white/[0.03]">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/10">Protocolo_de_Instrucción_Base</label>
              <span className="text-[10px] font-mono text-white/20 uppercase tracking-tighter">{systemPrompt.length} BYTES_BUFFER</span>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full h-64 p-6 rounded-3xl bg-white/[0.01] border border-white/[0.05] text-xs font-mono text-white/60 leading-relaxed focus:bg-white/[0.02] transition-all outline-none resize-none"
              placeholder="Inyectar secuencia de comandos..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-10 py-8 border-t border-white/[0.03] bg-white/[0.02] flex items-center justify-end gap-6">
          <button
            onClick={onClose}
            className="text-[11px] font-black uppercase tracking-widest text-white/20 hover:text-white/40 transition-colors"
          >
            Abortar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !providerId || !modelId}
            className="relative px-10 h-14 rounded-2xl overflow-hidden group/save active:scale-95 transition-all duration-500 disabled:opacity-20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-hive-amber to-[#ffb95f] opacity-90 group-hover/save:opacity-100 transition-all duration-700" />
            <div className="relative z-10 flex items-center justify-center gap-3 text-[#2a1700] text-xs font-black uppercase tracking-widest">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Comprometer_Cambios
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}


interface SwarmVisualizerProps {
  onAgentsChange?: (count: number) => void;
}

export function SwarmVisualizer({ onAgentsChange }: SwarmVisualizerProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsData, providersData, modelsData] = await Promise.all([
        apiClient<{ agents: Agent[] }>("/api/hivelearn/agents", { showError: false }),
        apiClient<{ providers: Provider[] }>("/api/providers", { showError: false }),
        apiClient<{ models: Model[] }>("/api/models", { showError: false }),
      ]);
      setAgents(agentsData.agents || []);
      setProviders((providersData.providers || []).filter(p => p.enabled === 1 && p.active === 1));
      setModels((modelsData.models || []).filter(m => m.enabled === 1 && m.active === 1));
      onAgentsChange?.(agentsData.agents?.length || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [onAgentsChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveAgent = async (config: AgentConfig) => {
    if (!selectedAgent) return;
    try {
      await apiClient(`/api/hivelearn/agents/${selectedAgent.id}`, {
        method: "PUT",
        body: config,
        showError: false,
      });
      setSelectedAgent(null);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const coordinator = agents.find(a => a.id === "hl-coordinator-agent");
  const workers = agents.filter(a => a.id !== "hl-coordinator-agent");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-hive-amber" />
          <p className="text-muted-foreground">Cargando enjambre...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-1000">
      {/* Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="flex items-center gap-8">
          <div className="relative">
            <div className="absolute inset-0 bg-hive-amber/20 blur-2xl rounded-full opacity-50" />
            <div className="relative p-5 rounded-[1.25rem] bg-hive-amber/10 border border-white/[0.05] backdrop-blur-3xl">
              <Bot className="h-8 w-8 text-hive-amber" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-4 mb-2">
              <div className="h-1.5 w-1.5 rounded-full bg-hive-amber" />
              <span className="text-[11px] font-black tracking-[0.5em] uppercase text-hive-amber/60">
                Arquitectura_del_Enjambre
              </span>
            </div>
            <h3 className="text-4xl font-black tracking-tighter text-white uppercase">
              Visualización de <span className="text-hive-amber">Agentes</span>
            </h3>
            <p className="text-sm font-medium text-white/20 mt-3 italic">
              Mapa operacional de la red de agentes y sus interconexiones.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-4 px-8 py-4 rounded-[1.25rem] bg-white/[0.02] backdrop-blur-3xl text-white/20 hover:text-white/50 transition-all border border-white/[0.02] hover:border-white/[0.05]"
        >
          <span className="text-[10px] font-black uppercase tracking-widest">Sincronizar Red</span>
          <Loader2 className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Honeycomb Layout — Redesigned for Obsidian Architect */}
      <div className="relative min-h-[600px] p-10 rounded-[3rem] bg-white/[0.01] backdrop-blur-3xl border border-white/[0.02] overflow-hidden">
        {/* Background Grid Accent */}
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        {/* Coordinator Center */}
        {coordinator && (
          <div className="flex justify-center mb-16 relative z-10">
            <button
              onClick={() => setSelectedAgent(coordinator)}
              className="group relative p-10 rounded-[2.5rem] bg-card/40 backdrop-blur-3xl transition-all duration-700 active:scale-95 shadow-[0_64px_128px_-24px_rgba(0,0,0,0.8)]"
              style={{ border: "1px solid rgba(245, 158, 11, 0.15)" }}
            >
              <div className="absolute -top-3 -right-3 p-2 rounded-full bg-hive-amber text-[#2a1700] shadow-[0_0_20px_rgba(245,158,11,0.5)]">
                <Brain className="h-4 w-4" />
              </div>

              {/* Internal Glow */}
              <div className="absolute inset-0 rounded-[2.5rem] bg-hive-amber/[0.03] pointer-events-none group-hover:bg-hive-amber/[0.06] transition-colors" />

              <Brain className="h-20 w-20 text-hive-amber mb-6 mx-auto group-hover:scale-110 transition-transform duration-700" />

              <div className="text-center space-y-2">
                <div className="text-2xl font-black text-white uppercase tracking-tight">{coordinator.name}</div>
                <div className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em]">COORD_CORE_V1.0</div>
                <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-hive-amber/10 text-hive-amber text-[10px] font-black uppercase tracking-widest mt-4">
                  {coordinator.model_id.toUpperCase()}
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Workers Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 relative z-10">
          {workers.map((agent, i) => {
            const colorCategory = getColorCategory(agent.id);
            const Icon = AGENT_ICONS[agent.id] || Bot;
            const catStyles = AGENT_COLORS[colorCategory] || "from-white/5 to-white/1";

            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className="group relative p-6 rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl transition-all duration-700 hover:bg-white/[0.05] hover:-translate-y-2 active:scale-95 border border-white/[0.03]"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="absolute top-4 right-4 text-white/10 group-hover:text-white/30 transition-colors">
                  <Settings2 className="h-3.5 w-3.5" />
                </div>

                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${catStyles} flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform duration-700 border border-white/[0.05]`}>
                  <Icon className="h-7 w-7 text-white" />
                </div>

                <div className="text-center space-y-1">
                  <div className="text-xs font-black text-white uppercase tracking-tight line-clamp-1 group-hover:text-hive-amber transition-colors">
                    {agent.name.replace("Agent", "").toUpperCase()}
                  </div>
                  <div className="text-[9px] font-mono text-white/10 uppercase tracking-tighter truncate">
                    {agent.model_id.toUpperCase()}
                  </div>
                  {agent.enabled === 0 && (
                    <div className="text-[8px] font-black text-hive-red/40 uppercase tracking-widest mt-2">DORMANT</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Network Stats — Editorial */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-8 pt-12 border-t border-white/[0.03]">
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/10">Agentes_Registrados</span>
          <div className="text-4xl font-black text-white">{agents.length}</div>
        </div>
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/10">Capacidad_Activa</span>
          <div className="text-4xl font-black text-hive-connected">{agents.filter(a => a.enabled === 1).length}</div>
        </div>
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/10">Terminales_Worker</span>
          <div className="text-4xl font-black text-hive-blue">{workers.length}</div>
        </div>
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/10">Núcleo_Central</span>
          <div className="text-4xl font-black text-hive-amber">01</div>
        </div>
      </div>

      {/* Modal */}
      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
          providers={providers}
          models={models}
          onClose={() => setSelectedAgent(null)}
          onSave={handleSaveAgent}
        />
      )}
    </div>
  );
}
