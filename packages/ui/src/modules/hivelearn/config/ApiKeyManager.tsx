import { useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { KeyRound, CheckCircle2, Trash2, Save, Eye, EyeOff } from "lucide-react";

interface Provider {
  id: string;
  name: string;
  base_url?: string;
  category: string;
  enabled: number;
  active: number;
}

interface ApiKeyManagerProps {
  providers: Provider[];
}

export function ApiKeyManager({ providers }: ApiKeyManagerProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [hasApiKey, setHasApiKey] = useState<Record<string, boolean>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, "idle" | "success" | "error">>({});

  // Providers que requieren API key (excluyendo locales)
  const externalProviders = providers.filter(
    p => !["ollama", "local-tts", "local-llama"].includes(p.id)
  );

  const checkApiKey = useCallback(async (providerId: string) => {
    try {
      const data = await apiClient<{ hasApiKey: boolean }>(`/api/providers/${providerId}/api-key`, { showError: false });
      setHasApiKey(prev => ({ ...prev, [providerId]: data.hasApiKey }));
    } catch {
      setHasApiKey(prev => ({ ...prev, [providerId]: false }));
    }
  }, []);

  const handleSave = useCallback(async (providerId: string) => {
    const apiKey = apiKeys[providerId];
    if (!apiKey || apiKey.trim().length === 0) return;

    setLoading(prev => ({ ...prev, [providerId]: true }));
    setStatus(prev => ({ ...prev, [providerId]: "idle" }));

    try {
      await apiClient(`/api/providers/${providerId}/api-key`, {
        method: "POST",
        body: { apiKey: apiKey.trim() },
        showError: false,
      });
      setStatus(prev => ({ ...prev, [providerId]: "success" }));
      setHasApiKey(prev => ({ ...prev, [providerId]: true }));
      setApiKeys(prev => ({ ...prev, [providerId]: "" }));
      setTimeout(() => setStatus(prev => ({ ...prev, [providerId]: "idle" })), 3000);
    } catch {
      setStatus(prev => ({ ...prev, [providerId]: "error" }));
    } finally {
      setLoading(prev => ({ ...prev, [providerId]: false }));
    }
  }, [apiKeys]);

  const handleDelete = useCallback(async (providerId: string) => {
    setLoading(prev => ({ ...prev, [providerId]: true }));
    try {
      await apiClient(`/api/providers/${providerId}/api-key`, {
        method: "DELETE",
        showError: false,
      });
      setHasApiKey(prev => ({ ...prev, [providerId]: false }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(prev => ({ ...prev, [providerId]: false }));
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-hive-amber/10">
          <KeyRound className="h-5 w-5 text-hive-amber" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">API Keys</h3>
          <p className="text-xs text-muted-foreground">
            Configura las claves de API para los proveedores externos
          </p>
        </div>
      </div>

      {providers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Cargando proveedores...
        </div>
      ) : externalProviders.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Todos los proveedores configurados son locales
        </div>
      ) : (
        <div className="grid gap-4">
          {externalProviders.map(provider => {
          const isConfigured = hasApiKey[provider.id];
          const isLoading = loading[provider.id];
          const currentStatus = status[provider.id] || "idle";
          const isShowing = showKey[provider.id];

          return (
            <div
              key={provider.id}
              className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">{provider.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{provider.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  {isConfigured ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Configurado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <KeyRound className="h-3.5 w-3.5" />
                      Sin configurar
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={isShowing ? "text" : "password"}
                    value={apiKeys[provider.id] || ""}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                    onFocus={() => checkApiKey(provider.id)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-hive-amber/50"
                  />
                  <button
                    onClick={() => setShowKey(prev => ({ ...prev, [provider.id]: !isShowing }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                    type="button"
                  >
                    {isShowing ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <button
                  onClick={() => handleSave(provider.id)}
                  disabled={isLoading || !apiKeys[provider.id]?.trim()}
                  className="px-4 py-2 rounded-lg bg-hive-amber text-primary-foreground text-sm font-medium hover:bg-hive-amber/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading ? (
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar
                </button>

                {isConfigured && (
                  <button
                    onClick={() => handleDelete(provider.id)}
                    disabled={isLoading}
                    className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {currentStatus === "success" && (
                <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  API key guardada correctamente
                </div>
              )}
              {currentStatus === "error" && (
                <div className="text-xs text-destructive">
                  Error al guardar la API key
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}
    </div>
  );
}
