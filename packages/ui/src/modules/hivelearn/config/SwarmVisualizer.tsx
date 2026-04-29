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
}

interface Model {
  id: string;
  name: string;
  provider_id: string;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border-2 bg-background shadow-2xl ${borderColor}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b bg-background ${borderColor}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${AGENT_COLORS[colorCategory] || "from-gray-500/20 to-slate-500/20"}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">{agent.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">{agent.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
              Descripción
            </label>
            <p className="text-sm text-foreground">{agent.description}</p>
          </div>

          {/* Role Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Rol:
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              agent.role === "coordinator"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
            }`}>
              {agent.role === "coordinator" ? "👑 Coordinador" : "🔧 Worker"}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              enabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
            }`}>
              {enabled ? "✓ Activo" : "✗ Inactivo"}
            </span>
          </div>

          {/* Configuration */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Provider */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                Provider
              </label>
              <select
                value={providerId}
                onChange={e => {
                  setProviderId(e.target.value);
                  setModelId("");
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-hive-amber/50"
              >
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Model */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                Modelo
              </label>
              <select
                value={modelId}
                onChange={e => setModelId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-hive-amber/50"
              >
                {availableModels.length === 0 ? (
                  <option value="">Sin modelos</option>
                ) : (
                  availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))
                )}
              </select>
            </div>

            {/* Max Iterations */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                Máx. Iteraciones
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={maxIterations}
                onChange={e => setMaxIterations(parseInt(e.target.value) || 3)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-hive-amber/50"
              />
            </div>

            {/* Enabled Toggle */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                Estado
              </label>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  enabled
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                    : "bg-gray-500/10 text-gray-400 border border-gray-500/20 hover:bg-gray-500/20"
                }`}
              >
                {enabled ? "✓ Habilitado" : "✗ Deshabilitado"}
              </button>
            </div>
          </div>

          {/* System Prompt - Editable */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full h-64 px-3 py-2 rounded-lg border border-border bg-secondary text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-hive-amber/50 resize-y"
              placeholder="Escribe el system prompt aquí..."
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {systemPrompt.length} caracteres
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 px-6 py-4 border-t bg-background">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !providerId || !modelId}
            className="px-6 py-2 rounded-lg bg-hive-amber text-primary-foreground text-sm font-medium hover:bg-hive-amber/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Guardar Cambios
              </>
            )}
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
      setProviders(providersData.providers || []);
      setModels(modelsData.models || []);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Visualización del Enjambre</h3>
          <p className="text-sm text-muted-foreground">
            {agents.length} agentes configurados
          </p>
        </div>
        <button
          onClick={loadData}
          className="p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
          title="Refrescar"
        >
          <Loader2 className="h-4 w-4" />
        </button>
      </div>

      {/* Honeycomb Layout */}
      <div className="relative">
        {/* Coordinator Center */}
        {coordinator && (
          <div className="flex justify-center mb-8">
            <button
              onClick={() => setSelectedAgent(coordinator)}
              className="group relative p-6 rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 transition-all duration-300 shadow-lg hover:shadow-amber-500/20 hover:scale-105"
            >
              <div className="absolute -top-2 -right-2 p-1.5 rounded-full bg-amber-500 text-white">
                <Brain className="h-3 w-3" />
              </div>
              <Brain className="h-12 w-12 text-amber-400 mb-3" />
              <div className="text-center">
                <div className="font-bold text-foreground text-sm">{coordinator.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{coordinator.provider_id} / {coordinator.model_id}</div>
                <div className="text-xs text-muted-foreground mt-1">Iter: {coordinator.max_iterations}</div>
              </div>
            </button>
          </div>
        )}

        {/* Workers Grid - Responsive Honeycomb-ish */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 justify-items-center">
          {workers.map(agent => {
            const colorCategory = getColorCategory(agent.id);
            const Icon = AGENT_ICONS[agent.id] || Bot;
            const borderColor = AGENT_COLORS[colorCategory]?.split(" ")[2] || "border-gray-500/50";
            const bgColor = AGENT_COLORS[colorCategory] || "from-gray-500/20 to-slate-500/20";

            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={`group relative p-4 rounded-xl border-2 ${borderColor} bg-gradient-to-br ${bgColor} hover:scale-105 transition-all duration-300 shadow-md hover:shadow-lg w-full max-w-[140px]`}
              >
                <div className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-secondary border border-border">
                  <Settings2 className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <Icon className="h-8 w-8 mb-2 mx-auto" />
                <div className="text-center">
                  <div className="font-bold text-foreground text-[10px] leading-tight line-clamp-2">
                    {agent.name.replace("Agent", "")}
                  </div>
                  <div className="text-[9px] text-muted-foreground font-mono mt-1 truncate">
                    {agent.provider_id}
                  </div>
                  {agent.enabled === 0 && (
                    <div className="text-[8px] text-amber-400 mt-0.5">⚠ Inactivo</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-border">
        <div className="text-center p-4 rounded-xl bg-secondary/50">
          <div className="text-2xl font-bold text-amber-400">{agents.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Agentes</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-secondary/50">
          <div className="text-2xl font-bold text-emerald-400">{agents.filter(a => a.enabled === 1).length}</div>
          <div className="text-xs text-muted-foreground mt-1">Activos</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-secondary/50">
          <div className="text-2xl font-bold text-blue-400">{workers.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Workers</div>
        </div>
        <div className="text-center p-4 rounded-xl bg-secondary/50">
          <div className="text-2xl font-bold text-purple-400">1</div>
          <div className="text-xs text-muted-foreground mt-1">Coordinador</div>
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
