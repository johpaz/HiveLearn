import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { KeyRound, CheckCircle2, Plus, Power, PowerOff, Eye, EyeOff, Trash2, Server, Database, Cpu } from "lucide-react";

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
  num_ctx?: number;
  num_gpu?: number;
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

interface ProviderDetailsResponse {
  provider: Provider & { created_at?: number | string };
  hasApiKey: boolean;
  models: ModelRecord[];
}

interface ApiKeyManagerProps {
  providers: Provider[];
  onProvidersChange?: () => Promise<void> | void;
}

function isEnabled(value: boolean | number | undefined): boolean {
  return value === true || value === 1;
}

export function ApiKeyManager({ providers, onProvidersChange }: ApiKeyManagerProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [details, setDetails] = useState<ProviderDetailsResponse | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [togglingProvider, setTogglingProvider] = useState(false);
  const [addingModel, setAddingModel] = useState(false);
  const [togglingModelId, setTogglingModelId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [numCtx, setNumCtx] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newModel, setNewModel] = useState({
    id: "",
    name: "",
    modelType: "llm",
    contextWindow: "20000",
    capabilities: "",
  });

  const sortedProviders = useMemo(
    () => [...providers].sort((a, b) => a.name.localeCompare(b.name)),
    [providers]
  );

  const loadProviderDetails = useCallback(async (providerId: string) => {
    setLoadingDetails(true);
    setError(null);
    setStatus(null);
    try {
      const data = await apiClient<ProviderDetailsResponse>(`/api/providers/${providerId}/details`, { showError: false });
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el provider");
      setDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedProviderId) {
      setDetails(null);
      setApiKey("");
      setNumCtx("");
      setShowKey(false);
      setNewModel({ id: "", name: "", modelType: "llm", contextWindow: "20000", capabilities: "" });
      return;
    }
    loadProviderDetails(selectedProviderId);
  }, [selectedProviderId, loadProviderDetails]);

  const selectedProvider = details?.provider;
  const requiresApiKey = selectedProvider?.requiresApiKey ?? false;
  const hasStoredKey = details?.hasApiKey ?? false;

  const refreshAll = useCallback(async () => {
    if (selectedProviderId) {
      await loadProviderDetails(selectedProviderId);
    }
    await onProvidersChange?.();
  }, [loadProviderDetails, onProvidersChange, selectedProviderId]);

  useEffect(() => {
    if (details?.provider?.num_ctx !== undefined && details?.provider?.num_ctx !== null) {
      setNumCtx(details.provider.num_ctx.toString());
    }
  }, [details]);

  const handleSaveContext = useCallback(async () => {
    if (!selectedProviderId || !numCtx) return;
    const contextValue = parseInt(numCtx, 10);
    if (isNaN(contextValue)) return;
    
    setSavingApiKey(true);
    setError(null);
    setStatus(null);
    try {
      await apiClient(`/api/providers/${selectedProviderId}/context`, {
        method: "PATCH",
        body: { num_ctx: contextValue },
        showError: false,
      });
      setStatus("Contexto actualizado correctamente");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el contexto");
    } finally {
      setSavingApiKey(false);
    }
  }, [numCtx, refreshAll, selectedProviderId]);

  const handleSaveApiKey = useCallback(async () => {
    if (!selectedProviderId || !apiKey.trim()) return;
    setSavingApiKey(true);
    setError(null);
    setStatus(null);
    try {
      await apiClient(`/api/providers/${selectedProviderId}/api-key`, {
        method: "POST",
        body: { apiKey: apiKey.trim() },
        showError: false,
      });
      await apiClient(`/api/providers/${selectedProviderId}/enabled`, {
        method: "PATCH",
        body: { enabled: true },
        showError: false,
      });
      setApiKey("");
      setStatus("API key guardada y provider activado");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la API key");
    } finally {
      setSavingApiKey(false);
    }
  }, [apiKey, refreshAll, selectedProviderId]);

  const handleDeleteApiKey = useCallback(async () => {
    if (!selectedProviderId) return;
    setSavingApiKey(true);
    setError(null);
    setStatus(null);
    try {
      await apiClient(`/api/providers/${selectedProviderId}/api-key`, {
        method: "DELETE",
        showError: false,
      });
      setStatus("API key eliminada");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar la API key");
    } finally {
      setSavingApiKey(false);
    }
  }, [refreshAll, selectedProviderId]);

  const handleToggleProvider = useCallback(async (enabled: boolean) => {
    if (!selectedProviderId) return;
    setTogglingProvider(true);
    setError(null);
    setStatus(null);
    try {
      await apiClient(`/api/providers/${selectedProviderId}/enabled`, {
        method: "PATCH",
        body: { enabled },
        showError: false,
      });
      setStatus(enabled ? "Provider activado" : "Provider desactivado");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando el provider");
    } finally {
      setTogglingProvider(false);
    }
  }, [refreshAll, selectedProviderId]);

  const handleToggleModel = useCallback(async (modelId: string, enabled: boolean) => {
    setTogglingModelId(modelId);
    setError(null);
    setStatus(null);
    try {
      await apiClient(`/api/models/${modelId}/enabled`, {
        method: "PATCH",
        body: { enabled },
        showError: false,
      });
      setStatus(enabled ? "Modelo activado" : "Modelo desactivado");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando el modelo");
    } finally {
      setTogglingModelId(null);
    }
  }, [refreshAll]);

  const handleAddModel = useCallback(async () => {
    if (!selectedProviderId) return;
    setAddingModel(true);
    setError(null);
    setStatus(null);
    try {
      const capabilities = newModel.capabilities
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      await apiClient(`/api/providers/${selectedProviderId}/models`, {
        method: "POST",
        body: {
          id: newModel.id.trim(),
          name: newModel.name.trim(),
          modelType: newModel.modelType.trim() || "llm",
          contextWindow: Number(newModel.contextWindow || "20000"),
          capabilities,
        },
        showError: false,
      });
      setNewModel({ id: "", name: "", modelType: "llm", contextWindow: "20000", capabilities: "" });
      setStatus("Modelo agregado");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error agregando el modelo");
    } finally {
      setAddingModel(false);
    }
  }, [newModel, refreshAll, selectedProviderId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-hive-amber/10">
          <KeyRound className="h-5 w-5 text-hive-amber" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Providers y credenciales</h3>
          <p className="text-xs text-muted-foreground">
            Administra API keys, activación y modelos disponibles por provider.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedProviders.map((provider) => {
          const providerEnabled = isEnabled(provider.enabled);
          const local = provider.isLocal ?? false;
          const configured = provider.hasApiKey || local;

          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => setSelectedProviderId(provider.id)}
              className="rounded-2xl border border-border bg-secondary/30 p-5 text-left transition-colors hover:border-hive-amber/40 hover:bg-secondary/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{provider.name}</div>
                  <div className="mt-1 text-[11px] font-mono text-muted-foreground">{provider.id}</div>
                </div>
                <Badge variant="outline" className={providerEnabled ? "border-emerald-500/30 text-emerald-400" : "border-gray-500/30 text-gray-400"}>
                  {providerEnabled ? "Activo" : "Desactivado"}
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline" className="border-border text-muted-foreground">
                  {provider.category ?? "llm"}
                </Badge>
                <Badge variant="outline" className={configured ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}>
                  {local ? "No requiere key" : configured ? "Key configurada" : "Falta key"}
                </Badge>
                <Badge variant="outline" className="border-border text-muted-foreground">
                  {provider.modelCount ?? 0} modelos
                </Badge>
                {provider.num_ctx !== undefined && provider.num_ctx !== null && (
                  <Badge variant="outline" className="border-hive-amber/30 text-hive-amber bg-hive-amber/5">
                    {provider.num_ctx >= 1000 ? `${(provider.num_ctx / 1000).toFixed(0)}K` : provider.num_ctx} ctx
                  </Badge>
                )}
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                {provider.base_url || "Sin base_url en BD"}
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={selectedProviderId !== null} onOpenChange={(open) => !open && setSelectedProviderId(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[min(960px,calc(100vw-2rem))] border-border bg-background p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader>
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <DialogTitle>{selectedProvider?.name ?? "Provider"}</DialogTitle>
              <DialogDescription>
              Información en BD, credenciales y modelos asociados.
              </DialogDescription>
            </div>
          </DialogHeader>

          {loadingDetails || !details ? (
            <div className="px-4 py-12 text-sm text-muted-foreground sm:px-6">Cargando provider...</div>
          ) : (
            <div className="max-h-[85vh] overflow-y-auto px-4 py-4 sm:max-h-[80vh] sm:px-6 sm:py-6">
              <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
                <div className="space-y-6">
                <div className="rounded-xl border border-border bg-secondary/20 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Database className="h-4 w-4 text-hive-amber" />
                    <span className="text-sm font-semibold text-foreground">Datos del provider</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-muted-foreground">ID:</span> {selectedProvider?.id}</div>
                    <div><span className="text-muted-foreground">Categoría:</span> {selectedProvider?.category ?? "llm"}</div>
                    <div><span className="text-muted-foreground">Base URL:</span> {selectedProvider?.base_url || "Sin definir"}</div>
                    <div><span className="text-muted-foreground">Activo BD:</span> {isEnabled(selectedProvider?.active) ? "Sí" : "No"}</div>
                    <div><span className="text-muted-foreground">Habilitado:</span> {isEnabled(selectedProvider?.enabled) ? "Sí" : "No"}</div>
                    
                    <div>
                      <span className="text-muted-foreground block mb-1">Contexto (num_ctx):</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={numCtx}
                          onChange={(e) => setNumCtx(e.target.value)}
                          placeholder="Ej: 4096"
                          className="h-8 w-32 bg-background"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleSaveContext}
                          disabled={savingApiKey || numCtx === selectedProvider?.num_ctx?.toString()}
                        >
                          Guardar
                        </Button>
                      </div>
                      {selectedProvider?.num_ctx !== undefined && selectedProvider?.num_ctx !== null && selectedProvider.num_ctx >= 1000 && (
                        <div className="text-xs text-muted-foreground mt-1">Actual: {(selectedProvider.num_ctx / 1000).toFixed(0)}K tokens</div>
                      )}
                    </div>

                    {selectedProvider?.num_gpu !== undefined && selectedProvider?.num_gpu !== null && selectedProvider?.num_gpu !== -1 && (
                      <div><span className="text-muted-foreground">GPUs asignados (num_gpu):</span> {selectedProvider.num_gpu}</div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">Disponibilidad del provider</div>
                      <div className="text-xs text-muted-foreground">Controla si aparece como opción utilizable.</div>
                    </div>
                    <Switch
                      checked={isEnabled(selectedProvider?.enabled)}
                      disabled={togglingProvider}
                      onCheckedChange={handleToggleProvider}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-secondary/20 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Server className="h-4 w-4 text-hive-amber" />
                    <span className="text-sm font-semibold text-foreground">Credencial</span>
                  </div>

                  {!requiresApiKey ? (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                      Este provider es local. No requiere API key.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        {hasStoredKey ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <KeyRound className="h-4 w-4 text-amber-400" />
                        )}
                        <span className={hasStoredKey ? "text-emerald-400" : "text-amber-400"}>
                          {hasStoredKey ? "API key configurada" : "API key no configurada"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="provider-api-key">Nueva API key</Label>
                        <div className="relative">
                          <Input
                            id="provider-api-key"
                            type={showKey ? "text" : "password"}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey((prev) => !prev)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          >
                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={handleSaveApiKey} disabled={savingApiKey || !apiKey.trim()}>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Guardar key
                        </Button>
                        <Button
                          variant={isEnabled(selectedProvider?.enabled) ? "outline" : "default"}
                          onClick={() => handleToggleProvider(!isEnabled(selectedProvider?.enabled))}
                          disabled={togglingProvider}
                        >
                          {isEnabled(selectedProvider?.enabled) ? (
                            <PowerOff className="mr-2 h-4 w-4" />
                          ) : (
                            <Power className="mr-2 h-4 w-4" />
                          )}
                          {isEnabled(selectedProvider?.enabled) ? "Desactivar" : "Activar"}
                        </Button>
                        {hasStoredKey && (
                          <Button variant="outline" onClick={handleDeleteApiKey} disabled={savingApiKey}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-xl border border-border bg-secondary/20 p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-hive-amber" />
                      <span className="text-sm font-semibold text-foreground">Modelos del provider</span>
                    </div>

                    <div className="space-y-3">
                      {details.models.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                          No hay modelos registrados para este provider.
                        </div>
                      ) : (
                        details.models.map((model) => {
                          const enabled = isEnabled(model.enabled);
                          return (
                            <div key={model.id} className="rounded-lg border border-border bg-background/70 p-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-foreground">{model.name}</div>
                                  <div className="break-all text-[11px] font-mono text-muted-foreground">{model.id}</div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full sm:w-auto"
                                  disabled={togglingModelId === model.id}
                                  onClick={() => handleToggleModel(model.id, !enabled)}
                                >
                                  {enabled ? <PowerOff className="mr-2 h-3.5 w-3.5" /> : <Power className="mr-2 h-3.5 w-3.5" />}
                                  {enabled ? "Desactivar" : "Activar"}
                                </Button>
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                                <Badge variant="outline" className="border-border text-muted-foreground">{model.model_type}</Badge>
                                <Badge variant="outline" className={enabled ? "border-emerald-500/30 text-emerald-400" : "border-gray-500/30 text-gray-400"}>
                                  {enabled ? "Habilitado" : "Deshabilitado"}
                                </Badge>
                                {model.context_window ? (
                                  <Badge variant="outline" className="border-border text-muted-foreground">
                                    {(model.context_window / 1000).toFixed(0)}K ctx
                                  </Badge>
                                ) : null}
                              </div>

                              {model.capabilities && model.capabilities.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {model.capabilities.map((capability) => (
                                    <Badge key={capability} variant="outline" className="border-hive-amber/20 text-hive-amber">
                                      {capability}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-secondary/20 p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-hive-amber" />
                      <span className="text-sm font-semibold text-foreground">Agregar modelo</span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="new-model-id">ID</Label>
                        <Input
                          id="new-model-id"
                          value={newModel.id}
                          onChange={(e) => setNewModel((prev) => ({ ...prev, id: e.target.value }))}
                          placeholder="openai-gpt-custom"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-model-name">Nombre</Label>
                        <Input
                          id="new-model-name"
                          value={newModel.name}
                          onChange={(e) => setNewModel((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="GPT Custom"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-model-type">Tipo</Label>
                        <Input
                          id="new-model-type"
                          value={newModel.modelType}
                          onChange={(e) => setNewModel((prev) => ({ ...prev, modelType: e.target.value }))}
                          placeholder="llm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-model-ctx">Context window</Label>
                        <Input
                          id="new-model-ctx"
                          type="number"
                          min="0"
                          value={newModel.contextWindow}
                          onChange={(e) => setNewModel((prev) => ({ ...prev, contextWindow: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <Label htmlFor="new-model-capabilities">Capabilities</Label>
                      <Input
                        id="new-model-capabilities"
                        value={newModel.capabilities}
                        onChange={(e) => setNewModel((prev) => ({ ...prev, capabilities: e.target.value }))}
                        placeholder="chat, vision, json_mode"
                      />
                    </div>

                    <div className="mt-4">
                      <Button className="w-full sm:w-auto" onClick={handleAddModel} disabled={addingModel || !newModel.id.trim() || !newModel.name.trim()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar modelo
                      </Button>
                    </div>
                  </div>

                  {(status || error) && (
                    <div className={`rounded-lg border p-3 text-sm ${error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"}`}>
                      {error || status}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
