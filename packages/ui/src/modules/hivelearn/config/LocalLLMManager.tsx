import { useEffect, useState, useCallback, useRef } from "react";
import {
  Cpu,
  Download,
  Play,
  Square,
  HardDrive,
  Eye,
  Mic,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Server,
  Monitor,
  RefreshCw,
} from "lucide-react";
import { apiClient } from "@/lib/api";

interface GPUInfo {
  backend: string;
  deviceName: string;
  platform: string;
}

interface ModelInfo {
  id: string;
  name: string;
  size: string;
  downloaded: boolean;
  path: string;
  mmprojPath: string;
  supportsMTP: boolean;
}

interface LLMStatus {
  ok: boolean;
  binaryInstalled: boolean;
  binaryPath: string | null;
  modelInstalled: boolean;
  mmprojInstalled: boolean;
  serverRunning: boolean;
  serverState: string;
  serverUrl: string;
  autoStartEnabled: boolean;
  activeModel: string | null;
  error: string | null;
  gpu: GPUInfo;
  models: ModelInfo[];
}

type DownloadState = "idle" | "downloading" | "done" | "error";

interface ModelDownloadState {
  state: DownloadState;
  progress: number;
  error: string | null;
}

export function LocalLLMManager() {
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [installingRuntime, setInstallingRuntime] = useState(false);
  const [startingServer, setStartingServer] = useState(false);
  const [stoppingServer, setStoppingServer] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, ModelDownloadState>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient<LLMStatus>("/api/llm/status", { showError: false });
      setStatus(data);
      // Initialize download states for models
      const initial: Record<string, ModelDownloadState> = {};
      for (const m of data.models ?? []) {
        initial[m.id] = {
          state: m.downloaded ? "done" : "idle",
          progress: m.downloaded ? 100 : 0,
          error: null,
        };
      }
      setDownloads((prev) => ({ ...initial, ...prev }));
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const setupDownloadWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = import.meta.env.DEV
      ? `ws://localhost:8787/ws/llm`
      : `${protocol}//${window.location.host}/ws/llm`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "download_progress") {
          setDownloads((prev) => ({
            ...prev,
            [data.model]: {
              state: data.done ? "done" : "downloading",
              progress: data.percent ?? 0,
              error: null,
            },
          }));
          if (data.done) {
            loadStatus();
          }
        } else if (data.type === "error") {
          setDownloads((prev) => ({
            ...prev,
            [data.model ?? "unknown"]: {
              state: "error",
              progress: 0,
              error: data.message ?? "Error desconocido",
            },
          }));
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  }, [loadStatus]);

  const handleInstallRuntime = async () => {
    setInstallingRuntime(true);
    try {
      await apiClient("/api/llm/install-runtime", { method: "POST" });
      await loadStatus();
    } catch {
      // error handled by status
    } finally {
      setInstallingRuntime(false);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    setupDownloadWS();
    setDownloads((prev) => ({
      ...prev,
      [modelId]: { state: "downloading", progress: 0, error: null },
    }));
    try {
      await apiClient("/api/llm/download-model", {
        method: "POST",
        body: { model: modelId },
      });
    } catch {
      setDownloads((prev) => ({
        ...prev,
        [modelId]: { state: "error", progress: 0, error: "Error descargando modelo" },
      }));
    }
  };

  const handleStartServer = async () => {
    setStartingServer(true);
    try {
      await apiClient("/api/llm/start", { method: "POST" });
      await loadStatus();
    } catch {
      // error
    } finally {
      setStartingServer(false);
    }
  };

  const handleStopServer = async () => {
    setStoppingServer(true);
    try {
      await apiClient("/api/llm/stop", { method: "POST" });
      await loadStatus();
    } catch {
      // error
    } finally {
      setStoppingServer(false);
    }
  };

  const backendLabel = (backend: string) => {
    const map: Record<string, string> = {
      cuda: "NVIDIA CUDA",
      vulkan: "Vulkan",
      metal: "Apple Metal",
      rocm: "AMD ROCm",
      cpu: "CPU",
    };
    return map[backend] ?? backend;
  };

  const backendIcon = (backend: string) => {
    switch (backend) {
      case "cuda":
      case "rocm":
        return <Cpu className="h-5 w-5" />;
      case "vulkan":
        return <Monitor className="h-5 w-5" />;
      case "metal":
        return <Monitor className="h-5 w-5" />;
      default:
        return <Cpu className="h-5 w-5" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 rounded-2xl animate-pulse border border-border" style={{ background: "hsl(var(--hive-surface))" }} />
        <div className="h-48 rounded-2xl animate-pulse border border-border" style={{ background: "hsl(var(--hive-surface))" }} />
        <div className="h-32 rounded-2xl animate-pulse border border-border" style={{ background: "hsl(var(--hive-surface))" }} />
      </div>
    );
  }

  const hasDownloadedModel = status?.models?.some((m) => m.downloaded) ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl border border-hive-amber/20 bg-hive-amber/10 shadow-sm">
          <Server className="h-5 w-5 text-hive-amber" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">LLM Local</h2>
          <p className="text-xs mt-0.5 text-muted-foreground">
            Ejecuta Gemma 4 localmente con llama.cpp — sin API keys, sin nube
          </p>
        </div>
        <button
          onClick={loadStatus}
          className="ml-auto p-2 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
          title="Refrescar estado"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Section A: Runtime Status */}
      <div className="rounded-xl border border-border bg-background/60 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-4 w-4 text-hive-amber" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Runtime
          </h3>
        </div>

        {status?.gpu && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-border bg-secondary/30">
            {backendIcon(status.gpu.backend)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {status.gpu.deviceName || "GPU detectada"}
              </p>
              <p className="text-xs text-muted-foreground">
                {backendLabel(status.gpu.backend)} · {status.gpu.platform}
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-hive-green/10 text-hive-green border border-hive-green/20">
              <Zap className="h-3 w-3" />
              Aceleración activa
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status?.binaryInstalled ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-hive-green" />
                <span className="text-sm text-foreground">llama.cpp instalado</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {status.binaryPath?.split("/").slice(-3).join("/")}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-hive-amber" />
                <span className="text-sm text-muted-foreground">Runtime no instalado</span>
              </>
            )}
          </div>
          {!status?.binaryInstalled && (
            <button
              onClick={handleInstallRuntime}
              disabled={installingRuntime}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-hive-amber hover:bg-hive-amber/90 text-primary-foreground disabled:opacity-40 transition-all flex items-center gap-2"
            >
              {installingRuntime ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Descargando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Descargar Runtime
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Section B: Models */}
      <div className="rounded-xl border border-border bg-background/60 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="h-4 w-4 text-hive-amber" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Modelos Gemma 4
          </h3>
          <span className="ml-auto text-xs text-muted-foreground">
            Incluye mmproj para visión e audio
          </span>
        </div>

        <div className="space-y-3">
          {status?.models?.map((model) => {
            const dl = downloads[model.id] ?? { state: model.downloaded ? "done" : "idle", progress: model.downloaded ? 100 : 0, error: null };
            const isDownloading = dl.state === "downloading";
            const isDone = dl.state === "done";
            const isError = dl.state === "error";

            return (
              <div
                key={model.id}
                className={`p-4 rounded-lg border transition-all ${
                  isDone
                    ? "border-hive-green/30 bg-hive-green/5"
                    : isDownloading
                    ? "border-hive-blue/30 bg-hive-blue/5"
                    : "border-border bg-secondary/20"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{model.name}</p>
                      {model.supportsMTP && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-hive-amber/10 text-hive-amber border border-hive-amber/20">
                          MTP
                        </span>
                      )}
                      {isDone && (
                        <CheckCircle2 className="h-4 w-4 text-hive-green flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{model.size}</span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Visión
                      </span>
                      <span className="flex items-center gap-1">
                        <Mic className="h-3 w-3" />
                        Audio
                      </span>
                    </div>
                    {isDone && (
                      <p className="text-[11px] text-hive-green/70 mt-1 font-mono truncate">
                        {model.path.split("/").slice(-2).join("/")}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {isDone ? (
                      <span className="text-xs font-medium text-hive-green">Descargado</span>
                    ) : isDownloading ? (
                      <div className="w-32">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                          <span>{dl.progress}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full bg-hive-blue transition-all duration-300"
                            style={{ width: `${dl.progress}%` }}
                          />
                        </div>
                      </div>
                    ) : isError ? (
                      <div className="text-right">
                        <p className="text-[11px] text-hive-red mb-1">{dl.error}</p>
                        <button
                          onClick={() => handleDownloadModel(model.id)}
                          className="text-xs text-hive-amber hover:underline"
                        >
                          Reintentar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDownloadModel(model.id)}
                        disabled={!status?.binaryInstalled}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                      >
                        <Download className="h-3 w-3" />
                        Descargar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!status?.binaryInstalled && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Descarga el runtime primero para poder descargar modelos
          </p>
        )}
      </div>

      {/* Section C: Server Control */}
      <div className="rounded-xl border border-border bg-background/60 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="h-4 w-4 text-hive-amber" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Servidor
          </h3>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {status?.serverRunning ? (
              <>
                <div className="h-2.5 w-2.5 rounded-full bg-hive-green animate-pulse" style={{ boxShadow: "0 0 8px hsl(var(--hive-green))" }} />
                <div>
                  <p className="text-sm font-medium text-foreground">Servidor activo</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {status.serverUrl}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
                <div>
                  <p className="text-sm text-muted-foreground">Servidor detenido</p>
                  {status?.error && (
                    <p className="text-xs text-hive-red mt-0.5">{status.error}</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {status?.serverRunning ? (
              <button
                onClick={handleStopServer}
                disabled={stoppingServer}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-hive-red/30 text-hive-red hover:bg-hive-red/10 disabled:opacity-40 transition-all flex items-center gap-2"
              >
                {stoppingServer ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Detener
              </button>
            ) : (
              <button
                onClick={handleStartServer}
                disabled={startingServer || !hasDownloadedModel}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-hive-amber hover:bg-hive-amber/90 text-primary-foreground disabled:opacity-40 transition-all flex items-center gap-2"
              >
                {startingServer ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Iniciando...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Iniciar
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {status?.serverRunning && status.activeModel && (
          <div className="mt-4 p-3 rounded-lg border border-border bg-secondary/30">
            <p className="text-xs text-muted-foreground">
              Modelo activo:{" "}
              <span className="text-foreground font-medium">{status.activeModel}</span>
            </p>
          </div>
        )}

        {!hasDownloadedModel && status?.binaryInstalled && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Descarga al menos un modelo para poder iniciar el servidor
          </p>
        )}
      </div>
    </div>
  );
}
