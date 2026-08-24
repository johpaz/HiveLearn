import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";
import { AudioWaveform, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Provider {
  id: string;
  name: string;
  active: boolean | number;
  enabled?: boolean | number;
  hasApiKey?: boolean;
  isLocal?: boolean;
  base_url?: string;
  category?: string;
  modelCount?: number;
  requiresApiKey?: boolean;
}

interface ModelRecord {
  id: string;
  provider_id: string;
  name: string;
  model_type: string;
  context_window?: number;
  capabilities?: string[];
  enabled: number | boolean;
  active: number | boolean;
}

function isEnabled(value: boolean | number | string | undefined): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function STTManager() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [providersData, modelsData] = await Promise.all([
        apiClient<{ providers: Provider[] }>("/api/providers", { showError: false }),
        apiClient<{ models: ModelRecord[] }>("/api/models", { showError: false }),
      ]);

      setProviders(providersData.providers ?? []);
      setModels(modelsData.models ?? []);
    } catch {
      setProviders([]);
      setModels([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Provider con categoría stt o que tengan modelos model_type === 'stt'
  const sttProviders = useMemo(() => {
    const sttProviderIds = new Set(
      models.filter((m) => m.model_type === "stt").map((m) => m.provider_id)
    );

    return providers.filter(
      (p) => p.category === "stt" || sttProviderIds.has(p.id)
    );
  }, [providers, models]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div
          className="h-24 rounded-2xl animate-pulse border border-border"
          style={{ background: "hsl(var(--hive-surface))" }}
        />
        <div
          className="h-48 rounded-2xl animate-pulse border border-border"
          style={{ background: "hsl(var(--hive-surface))" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl border border-hive-amber/20 bg-hive-amber/10 shadow-sm">
          <AudioWaveform className="h-5 w-5 text-hive-amber" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">STT (Speech-to-Text)</h2>
          <p className="text-xs mt-0.5 text-muted-foreground">
            Proveedores y modelos de transcripción de voz disponibles en la base de datos
          </p>
        </div>
        <button
          onClick={loadData}
          className="ml-auto p-2 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
          title="Refrescar estado"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {sttProviders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground italic">
            No se encontraron proveedores o modelos de transcripción (STT) configurados en la base de datos.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sttProviders.map((provider) => {
            const providerEnabled = isEnabled(provider.enabled) && isEnabled(provider.active);
            const providerModels = models.filter(
              (m) => m.provider_id === provider.id && m.model_type === "stt"
            );
            const configured = provider.hasApiKey || provider.isLocal;

            return (
              <div
                key={provider.id}
                className="rounded-xl border border-border bg-background/60 backdrop-blur-sm p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-bold text-foreground">{provider.name}</h3>
                      <Badge
                        variant="outline"
                        className={
                          providerEnabled
                            ? "border-emerald-500/30 text-emerald-400"
                            : "border-gray-500/30 text-gray-400"
                        }
                      >
                        {providerEnabled ? "Activo" : "Desactivado"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          configured
                            ? "border-emerald-500/30 text-emerald-400"
                            : "border-amber-500/30 text-amber-400"
                        }
                      >
                        {provider.isLocal
                          ? "Local (Sin Key)"
                          : configured
                          ? "Key Configurada"
                          : "Falta Key"}
                      </Badge>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mt-1">ID: {provider.id}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Modelos STT ({providerModels.length})
                  </h4>
                  {providerModels.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No hay modelos STT registrados para este proveedor en la BD.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {providerModels.map((model) => {
                        const modelActive = isEnabled(model.enabled) && isEnabled(model.active);
                        return (
                          <div
                            key={model.id}
                            className={`p-3 rounded-lg border transition-all ${
                              modelActive
                                ? "border-emerald-500/30 bg-emerald-500/5"
                                : "border-border bg-secondary/20"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-sm font-semibold text-foreground truncate">
                                {model.name}
                              </span>
                              {modelActive && (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">
                              {model.id}
                            </div>
                            {model.capabilities && Array.isArray(model.capabilities) && model.capabilities.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {model.capabilities.map((cap) => (
                                  <span
                                    key={cap}
                                    className="px-1.5 py-0.5 rounded text-[8px] font-medium uppercase tracking-wider border border-hive-amber/20 bg-hive-amber/10 text-hive-amber"
                                  >
                                    {cap}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
