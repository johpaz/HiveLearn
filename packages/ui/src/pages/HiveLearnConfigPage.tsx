import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { Settings2, Brain, GitBranch, Zap, Database, Bot, Server, Hexagon, Loader2 } from "lucide-react";
import {
  ProviderSelector,
  ModelSelector,
  ConfigSummary,
  SwarmPipelinePreview,
  ConfigInsightCard,
  StatusMessage,
  ProviderManager,
  SwarmVisualizer,
} from "@/modules/hivelearn/config";
import type { ProviderOption, ModelOption, FullProvider } from "@/modules/hivelearn/config";

type ConfigTab = "swarm" | "proveedores" | "visualizar";

interface HiveLearnConfig {
  configured: boolean;
  providerId: string | null;
  modelId: string | null;
}

interface AgentResponse {
  agents: Array<{ id: string; status: string }>;
}

interface RawProvider {
  id: string;
  name: string;
  base_url?: string;
  category: string;
  enabled: number;
  active: number;
  created_at: number;
}

interface RawModel {
  id: string;
  provider_id?: string;
  providerId?: string;
  name: string;
  model_type: string;
  context_window: number;
  capabilities: string | string[];
  enabled: number;
  active: number;
}

export function HiveLearnConfigPage() {
  const [activeTab, setActiveTab] = useState<ConfigTab>("swarm");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [fullProviders, setFullProviders] = useState<FullProvider[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error" | "loading">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState(0);

  // Load data from real API. silent=true para refresh sin mostrar skeleton.
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [providersData, modelsData, configData, agentsData] = await Promise.all([
        apiClient<any>("/api/providers", { showError: false }),
        apiClient<any>("/api/models", { showError: false }),
        apiClient<HiveLearnConfig>("/api/hivelearn/config", { showError: false }),
        apiClient<AgentResponse>("/api/hivelearn/agents", { showError: false }),
      ]);

      const rawProviders: RawProvider[] = providersData.providers ?? [];
      const rawModels: RawModel[] = modelsData.models ?? [];

      // Check API keys for all external providers
      const apiKeyChecks = await Promise.allSettled(
        rawProviders
          .filter(p => !["ollama", "local-tts", "local-llama"].includes(p.id))
          .map(async p => {
            const result = await apiClient<{ hasApiKey: boolean }>(`/api/providers/${p.id}/api-key`, { showError: false });
            return { id: p.id, hasApiKey: result.hasApiKey };
          })
      );
      const apiKeyMap: Record<string, boolean> = {};
      for (const check of apiKeyChecks) {
        if (check.status === "fulfilled") {
          apiKeyMap[check.value.id] = check.value.hasApiKey;
        }
      }

      // Build ProviderOption[] for swarm tab (filtered by enabled & active)
      const allProviders: ProviderOption[] = rawProviders
        .filter(p => p.enabled === 1 && p.active === 1)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => ({
          id: p.id,
          name: p.name,
          active: p.active === 1,
          hasApiKey: apiKeyMap[p.id] ?? false,
          isLocal: p.base_url?.includes('localhost') ?? false,
        }));

      // Build FullProvider[] for provider manager tab
      const full: FullProvider[] = rawProviders
        .sort((a, b) => {
          // Active first, then alphabetical
          if (a.active !== b.active) return b.active - a.active;
          return a.name.localeCompare(b.name);
        })
        .map(p => {
          const providerModels = rawModels.filter(m => (m.provider_id ?? m.providerId) === p.id);
          const maxCtx = providerModels.length > 0 
            ? Math.max(...providerModels.map(m => m.context_window || 0))
            : undefined;
          
          return {
            id: p.id,
            name: p.name,
            base_url: p.base_url ?? null,
            category: p.category || "llm",
            enabled: p.enabled,
            active: p.active,
            created_at: p.created_at,
            modelCount: providerModels.length,
            hasApiKey: apiKeyMap[p.id] ?? false,
            isLocal: p.base_url?.includes('localhost') ?? false,
            maxContext: maxCtx,
          };
        });

      const activeModels: ModelOption[] = rawModels
        .filter(m => m.enabled === 1 && m.active === 1)
        .map(m => ({
          id: m.id,
          name: m.name,
          provider_id: m.provider_id ?? (m as any).providerId ?? "",
          context_window: m.context_window,
          capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
          active: !!(m.active ?? false),
        }));

      setProviders(allProviders);
      setFullProviders(full);
      setModels(activeModels);
      setAgentCount((agentsData.agents ?? []).length || 16);

      // Restore saved config if exists
      if (configData.configured && configData.providerId) {
        setSelectedProviderId(configData.providerId);
        setSelectedModelId(configData.modelId);
      }
    } catch {
      // Silently fail — user will see empty selectors
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    document.title = "HiveLearn | Configuración del Enjambre";
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedProviderId || !selectedModelId) return;
    setIsSaving(true);
    setSaveStatus("loading");
    setSaveError(null);
    try {
      const data = await apiClient<any>("/api/hivelearn/config", {
        method: "POST",
        body: { providerId: selectedProviderId, modelId: selectedModelId },
        showError: false,
      });
      if (data.ok || data.configured) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
        setSaveError(data.error ?? "Error al guardar");
      }
    } catch {
      setSaveStatus("error");
      setSaveError("Error de conexión");
    } finally {
      setIsSaving(false);
    }
  }, [selectedProviderId, selectedModelId]);

  const selectedProviderName = providers.find(p => p.id === selectedProviderId)?.name ?? "";
  const selectedModelName = models.find(m => m.id === selectedModelId)?.name ?? "";

  return (
    <div className="min-h-screen bg-[#0e131f] relative overflow-hidden flex flex-col pt-16 md:pt-24">
      {/* ── Background Architecture ─────────────────────────────────── */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Main Amber Glow */}
        <div 
          className="absolute top-[-30%] left-[-20%] w-[80%] h-[80%] rounded-full opacity-30 blur-[160px]"
          style={{ background: "radial-gradient(circle, hsl(var(--hive-amber)), transparent 70%)" }}
        />
        {/* Distant Cold Accent */}
        <div 
          className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full opacity-20 blur-[140px]"
          style={{ background: "radial-gradient(circle, hsl(var(--hive-blue)), transparent 70%)" }}
        />
        {/* Subtle Grid - The Architect Look */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "60px 60px" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-10 lg:px-12 flex-1 pb-20">
        {/* ── Header Section ─────────────────────────────────────────── */}
        <header className="mb-20 animate-in slide-in-from-top-12 duration-1000 ease-out">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-12">
            <div className="max-w-2xl">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-2 w-2 rounded-full bg-hive-amber shadow-[0_0_15px_hsl(var(--hive-amber))]" />
                <span className="text-[11px] font-black tracking-[0.5em] uppercase text-hive-amber/60">
                  Protocolo de Arquitectura
                </span>
              </div>
              <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 text-white leading-[0.85]">
                Configuración del{" "}
                <span className="text-hive-amber italic block mt-2">Enjambre_A2</span>
              </h1>
              <p className="text-base md:text-lg leading-relaxed font-medium text-white/30 max-w-xl italic">
                Orquestación de inteligencia colectiva. Define el núcleo de procesamiento para tus {agentCount} nodos activos.
              </p>
            </div>

            <div className="flex-shrink-0">
              <div className="inline-flex items-center gap-5 px-6 py-4 rounded-[1.25rem] bg-white/[0.02] backdrop-blur-3xl shadow-2xl">
                <div className="p-3 rounded-xl bg-hive-amber/10">
                  <Bot className="h-6 w-6 text-hive-amber" />
                </div>
                <div>
                  <span className="block text-xs font-black uppercase tracking-widest text-white/60">
                    Nodos Activos
                  </span>
                  <span className="text-xl font-black text-hive-amber tracking-tighter">
                    {agentCount} AGENTS_IO
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="h-[600px] rounded-[2.5rem] animate-pulse bg-white/[0.01] backdrop-blur-3xl" />
        ) : (
          <div className="space-y-16">
            {/* ── Tab Navigation — NO LINES ──────────────────────────── */}
            <nav className="flex gap-2 p-1.5 rounded-[1.5rem] bg-white/[0.02] w-fit backdrop-blur-3xl">
              {(["swarm", "proveedores", "visualizar"] as const).map((tab) => {
                const Icon = tab === "swarm" ? Brain : tab === "proveedores" ? Server : Hexagon;
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-8 py-3.5 rounded-[1.25rem] text-xs font-black uppercase tracking-[0.2em] transition-all duration-700 flex items-center gap-3
                      ${isActive 
                        ? "bg-white/[0.08] text-hive-amber shadow-[0_15px_30px_-10px_rgba(0,0,0,0.5)]" 
                        : "text-white/20 hover:text-white/50 hover:bg-white/[0.03]"
                      }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-hive-amber" : "opacity-30"}`} />
                    {tab === "swarm" ? "Motor del Enjambre" : tab === "proveedores" ? "Proveedores" : "Enjambre"}
                  </button>
                );
              })}
            </nav>

            {/* ── Tab Content ────────────────────────────────────────── */}
            <main className="animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
              {activeTab === "swarm" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                  {/* Left Column: Configuration */}
                  <div className="lg:col-span-8 space-y-12">
                    <section 
                      className="rounded-[2.5rem] bg-card/60 backdrop-blur-3xl p-10 md:p-14 space-y-14 shadow-[0_64px_128px_-24px_rgba(0,0,0,0.8)]"
                    >
                      {/* Provider Selection */}
                      <div className="space-y-8">
                        <div className="flex items-center gap-6">
                          <label className="text-[11px] font-black uppercase tracking-[0.4em] text-white/10 whitespace-nowrap">
                            Fuente_de_Inteligencia
                          </label>
                          <div className="h-px flex-1 bg-gradient-to-r from-white/5 to-transparent" />
                        </div>
                        <ProviderSelector
                          providers={providers}
                          selectedId={selectedProviderId}
                          onSelect={(id) => {
                            setSelectedProviderId(id);
                            setSelectedModelId(null);
                            setSaveStatus("idle");
                          }}
                        />
                      </div>

                      {/* Model Selection */}
                      {selectedProviderId && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-700">
                          <div className="flex items-center gap-6">
                            <label className="text-[11px] font-black uppercase tracking-[0.4em] text-white/10 whitespace-nowrap">
                              Núcleo_de_Procesamiento
                            </label>
                            <div className="h-px flex-1 bg-gradient-to-r from-white/5 to-transparent" />
                          </div>
                          <ModelSelector
                            models={models.filter(m => m.provider_id === selectedProviderId)}
                            selectedId={selectedModelId}
                            onSelect={(id) => { setSelectedModelId(id); setSaveStatus("idle"); }}
                          />
                        </div>
                      )}

                      {/* Action Area */}
                      <div className="pt-8 space-y-10">
                        {selectedProviderId && selectedModelId && (
                          <div className="animate-in zoom-in-98 duration-700">
                            <ConfigSummary
                              providerName={selectedProviderName}
                              modelName={selectedModelName}
                              agentCount={agentCount}
                            />
                          </div>
                        )}

                        <button
                          onClick={handleSave}
                          disabled={!selectedProviderId || !selectedModelId || isSaving}
                          className="group relative w-full py-6 rounded-[1.5rem] overflow-hidden transition-all duration-700 disabled:opacity-20 active:scale-[0.98] shadow-[0_30px_60px_-15px_rgba(245,158,11,0.25)]"
                        >
                          <div 
                            className="absolute inset-0 bg-gradient-to-br from-hive-amber via-[#f59e0b] to-[#ffb95f] transition-transform duration-700 group-hover:scale-110" 
                          />
                          <div className="relative z-10 flex items-center justify-center gap-4 text-base font-black uppercase tracking-[0.3em] text-[#2a1700]">
                            {isSaving ? (
                              <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                              <Zap className="h-6 w-6" fill="currentColor" />
                            )}
                            {isSaving ? "DESPLEGANDO_SISTEMA..." : "INICIAR_MUTACIÓN_HIVE"}
                          </div>
                        </button>

                        {saveStatus !== "idle" && (
                          <div className="pt-4">
                            <StatusMessage
                              type={saveStatus === "loading" ? "loading" : saveStatus === "success" ? "success" : "error"}
                              message={
                                saveStatus === "success"
                                  ? `Protocolo completado. El enjambre ha mutado a ${selectedModelName} con éxito.`
                                  : saveError ?? "Fallo en la sincronización de red"
                              }
                            />
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  {/* Right Column: Insights & Pipeline */}
                  <div className="lg:col-span-4 space-y-10">
                    <SwarmPipelinePreview agentCount={agentCount} />

                    <div className="grid grid-cols-1 gap-6">
                      <ConfigInsightCard
                        icon={GitBranch}
                        title="ARQUITECTURA_ENJAMBRE"
                        description="Orquestación determinística de agentes mediante grafos acíclicos de alta fidelidad."
                        theme="blue"
                      />
                      <ConfigInsightCard
                        icon={Zap}
                        title="EJECUCIÓN_ULTRA"
                        description="Procesamiento en paralelo con latencia sub-100ms para inferencia masiva."
                        theme="cyan"
                      />
                      <ConfigInsightCard
                        icon={Database}
                        title="CACHE_SEMÁNTICO"
                        description="Memoria de largo plazo integrada para la optimización de tokens y razonamiento."
                        theme="purple"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "proveedores" && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
                  <div className="rounded-[2.5rem] bg-card/60 backdrop-blur-3xl p-10 md:p-14 shadow-[0_64px_128px_-24px_rgba(0,0,0,0.8)]">
                    <ProviderManager
                      providers={fullProviders}
                      onProviderToggle={() => loadData(true)}
                    />
                  </div>
                </div>
              )}

              {activeTab === "visualizar" && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
                  <div className="rounded-[2.5rem] bg-card/60 backdrop-blur-3xl p-10 md:p-14 shadow-[0_64px_128px_-24px_rgba(0,0,0,0.8)]">
                    <SwarmVisualizer />
                  </div>
                </div>
              )}
            </main>

            {/* ── Footer Metadata ────────────────────────────────────── */}
            <footer className="pt-16 border-t border-white/[0.03] flex flex-col md:flex-row items-center justify-between gap-8">
              <p className="text-[10px] font-mono uppercase tracking-[0.5em] text-white/10 italic">
                HiveLearn_OS v0.1.0 // Intelligence_Agent_Protocol_v8
              </p>
              <div className="flex items-center gap-10">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-hive-connected animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">GATEWAY_CONNECTED</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-hive-cyan" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">QUANTUM_SYNC_OK</span>
                </div>
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
