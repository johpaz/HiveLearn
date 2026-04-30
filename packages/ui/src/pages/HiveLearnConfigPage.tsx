import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { Settings2, Brain, GitBranch, Zap, Database, Bot, KeyRound, Cloud, Hexagon } from "lucide-react";
import {
  ProviderSelector,
  ModelSelector,
  ConfigSummary,
  SwarmPipelinePreview,
  ConfigInsightCard,
  StatusMessage,
  ApiKeyManager,
  OllamaImporter,
  SwarmVisualizer,
} from "@/modules/hivelearn/config";
import type { ProviderOption, ModelOption } from "@/modules/hivelearn/config";

type ConfigTab = "swarm" | "api-keys" | "import" | "visualizar";

interface HiveLearnConfig {
  configured: boolean;
  providerId: string | null;
  modelId: string | null;
}

interface AgentResponse {
  agents: Array<{ id: string; status: string }>;
}

interface Provider {
  id: string;
  name: string;
  base_url?: string;
  category: string;
  enabled: number;
  active: number;
}

export function HiveLearnConfigPage() {
  const [activeTab, setActiveTab] = useState<ConfigTab>("swarm");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error" | "loading">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState(0);

  // Load data from real API
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [providersData, modelsData, configData, agentsData] = await Promise.all([
          apiClient<any>("/api/providers", { showError: false }),
          apiClient<any>("/api/models", { showError: false }),
          apiClient<HiveLearnConfig>("/api/hivelearn/config", { showError: false }),
          apiClient<AgentResponse>("/api/hivelearn/agents", { showError: false }),
        ]);

        const allProviders: ProviderOption[] = (providersData.providers ?? [])
          .sort((a: Provider, b: Provider) => a.name.localeCompare(b.name))
          .map((p: Provider) => ({
            id: p.id,
            name: p.name,
            active: p.active === 1,
            hasApiKey: false,
            isLocal: p.base_url?.includes('localhost') ?? false,
          }));

        const activeModels: ModelOption[] = (modelsData.models ?? [])
          .filter((m: any) => m.enabled || m.active)
          .map((m: any) => ({
            id: m.id,
            name: m.name,
            provider_id: m.provider_id ?? m.providerId ?? "",
            context_window: m.context_window,
            capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
            active: m.active ?? false,
          }));

        setProviders(allProviders);
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
        setIsLoading(false);
      }
    };
    load();
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
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col pt-16 md:pt-20">
      {/* Light Ambient Mesh */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-hive-amber/10 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-slate-200/50 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 flex-1 pb-12">
        {/* Header Section */}
        <div className="mb-12 animate-in slide-in-from-left-8 duration-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-2 w-2 rounded-full animate-pulse bg-hive-amber"
                  style={{
                    boxShadow: "0 0 10px var(--hive-amber)",
                  }}
                />
                <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-hive-amber">
                  HIVELEARN
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-foreground" style={{ letterSpacing: "-0.02em" }}>
                Configuración del{" "}
                <span className="text-hive-amber italic">
                  Enjambre
                </span>
              </h1>
              <p className="text-sm max-w-lg leading-relaxed font-light text-muted-foreground">
                Selecciona el proveedor y modelo que usarán los {agentCount || 16} agentes educativos.
                Esta configuración se aplica a todo el enjambre.
              </p>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-secondary/50 backdrop-blur-sm shadow-sm">
              <Bot className="h-4 w-4 text-hive-amber" />
              <span className="text-sm font-semibold">{agentCount || 16} agentes activos</span>
            </div>
          </div>
        </div>


        {isLoading ? (
          <div className="h-64 rounded-2xl animate-pulse border" style={{ background: "hsl(var(--hive-surface))", borderColor: "hsl(0 0% 100% / 0.05)" }} />
        ) : (
          <div className="space-y-8">
            {/* Tabs de Navegación */}
            <div className="flex gap-2 border-b border-border pb-px">
              <button
                onClick={() => setActiveTab("swarm")}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                  activeTab === "swarm"
                    ? "bg-background border border-border border-b-0 text-hive-amber"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <Brain className="h-4 w-4" />
                Enjambre
              </button>
              <button
                onClick={() => setActiveTab("api-keys")}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                  activeTab === "api-keys"
                    ? "bg-background border border-border border-b-0 text-hive-amber"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <KeyRound className="h-4 w-4" />
                API Keys
              </button>
              <button
                onClick={() => setActiveTab("import")}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                  activeTab === "import"
                    ? "bg-background border border-border border-b-0 text-hive-amber"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <Cloud className="h-4 w-4" />
                Importar
              </button>
              <button
                onClick={() => setActiveTab("visualizar")}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                  activeTab === "visualizar"
                    ? "bg-background border border-border border-b-0 text-hive-amber"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <Hexagon className="h-4 w-4" />
                Visualizar
              </button>
            </div>

            {/* Contenido de las pestañas */}
            {activeTab === "swarm" && (
              <div className="space-y-8">
                {/* Main Configuration Card — Motor de Inteligencia */}
                <div
                  className="rounded-2xl border border-border bg-background/80 backdrop-blur-xl p-8 space-y-6 shadow-honey"
                >

                  {/* Card Header */}
                  <div className="flex items-center gap-4">
                    <div
                      className="p-3 rounded-xl border border-hive-amber/20 bg-hive-amber/10 shadow-sm"
                    >
                      <Brain className="h-5 w-5 text-hive-amber" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        Motor de Inteligencia
                      </h2>
                      <p className="text-xs mt-0.5 text-muted-foreground">
                        Configura el cerebro compartido del enjambre
                      </p>
                    </div>
                  </div>


                  {/* Divider */}
                  <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />


                  {/* Provider Selection */}
                  <div>
                    <label htmlFor="provider-selector" className="block text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground opacity-60">
                      Proveedor
                    </label>

                    <div id="provider-selector">
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
                  </div>

                  {/* Model Selection */}
                  {selectedProviderId && (
                    <div>
                      <label htmlFor="model-selector-config" className="block text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground opacity-60">
                        Modelo
                      </label>

                      <div id="model-selector-config">
                        <ModelSelector
                        models={models.filter(m => m.provider_id === selectedProviderId)}
                        selectedId={selectedModelId}
                        onSelect={(id) => { setSelectedModelId(id); setSaveStatus("idle"); }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Configuration Summary */}
                  {selectedProviderId && selectedModelId && selectedProviderName && selectedModelName && (
                    <ConfigSummary
                      providerName={selectedProviderName}
                      modelName={selectedModelName}
                      agentCount={agentCount || 16}
                    />
                  )}

                  {/* Save Button */}
                  <button
                    onClick={handleSave}
                    disabled={!selectedProviderId || !selectedModelId || isSaving}
                    className="w-full py-3.5 px-6 rounded-xl text-primary-foreground font-bold text-sm bg-hive-amber hover:bg-hive-amber/90 shadow-honey disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2.5 active:scale-[0.98]"
                  >

                    {isSaving ? (
                      <>
                        <Settings2 className="h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Settings2 className="h-4 w-4" />
                        Guardar configuración
                      </>
                    )}
                  </button>

                  {/* Status Messages */}
                  {saveStatus !== "idle" && (
                    <StatusMessage
                      type={saveStatus === "loading" ? "loading" : saveStatus === "success" ? "success" : "error"}
                      message={
                        saveStatus === "success"
                          ? `Configuración guardada — los ${agentCount || 16} agentes ahora usan ${selectedProviderName} / ${selectedModelName}`
                          : saveError ?? "Error desconocido"
                      }
                    />
                  )}
                </div>

                {/* Swarm Pipeline Preview */}
                <SwarmPipelinePreview agentCount={agentCount || 16} />

                {/* Insight Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ConfigInsightCard
                    icon={GitBranch}
                    title="DAG Scheduler"
                    description="Orquesta los agentes en orden óptimo con grafo de dependencias."
                    theme="blue"
                  />
                  <ConfigInsightCard
                    icon={Zap}
                    title="Paralelismo"
                    description="8 agentes de contenido trabajan simultáneamente. Hasta 8× más rápido."
                    theme="cyan"
                  />
                  <ConfigInsightCard
                    icon={Database}
                    title="Caché Inteligente"
                    description="Nodos ya generados se reutilizan. Segunda lección del mismo tema: ~10s."
                    theme="purple"
                  />
                </div>

                {/* Timing Note */}
                <div
                  className="rounded-xl border border-border p-4 text-center bg-secondary/40 backdrop-blur-sm"
                >
                  <p className="text-[11px] font-mono tracking-wider text-muted-foreground/50">
                    ⏱ Primera lección: ~2 min &nbsp;·&nbsp; 🐝 Con caché: ~10 seg &nbsp;·&nbsp; {agentCount || 16} agentes activos
                  </p>
                </div>
              </div>
            )}

            {activeTab === "api-keys" && (
              <div className="rounded-2xl border border-border bg-background/80 backdrop-blur-xl p-8 shadow-honey">
                <ApiKeyManager providers={providers} />
              </div>
            )}

            {activeTab === "import" && (
              <div className="rounded-2xl border border-border bg-background/80 backdrop-blur-xl p-8 shadow-honey">
                <OllamaImporter />
              </div>
            )}

            {activeTab === "visualizar" && (
              <div className="rounded-2xl border border-border bg-background/80 backdrop-blur-xl p-8 shadow-honey">
                <SwarmVisualizer />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
