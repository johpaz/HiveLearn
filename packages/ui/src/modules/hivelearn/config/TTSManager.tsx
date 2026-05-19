import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  Mic,
  RefreshCw,
  AlertCircle,
  Cpu,
} from "lucide-react";
import { apiClient } from "@/lib/api";

interface TTSVoice {
  id: string;
  name: string;
  language: string;
  quality: "low" | "medium" | "high";
  size: string;
  downloaded: boolean;
}

interface TTSStatus {
  ok: boolean;
  platform: string;
  binaryInstalled: boolean;
  installed: boolean;
  installedVoices: string[];
  voices: TTSVoice[];
}

type DownloadState = "idle" | "downloading" | "done" | "error";

export function TTSManager() {
  const [status, setStatus] = useState<TTSStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [installingRuntime, setInstallingRuntime] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, { state: DownloadState; error: string | null }>>({});

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient<TTSStatus>("/api/tts/status", { showError: false });
      setStatus(data);
      const nextDownloads: Record<string, { state: DownloadState; error: string | null }> = {};
      for (const voice of data.voices ?? []) {
        nextDownloads[voice.id] = {
          state: voice.downloaded ? "done" : "idle",
          error: null,
        };
      }
      setDownloads((prev) => ({ ...nextDownloads, ...prev }));
    } catch {
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleInstallRuntime = useCallback(async () => {
    setInstallingRuntime(true);
    try {
      await apiClient("/api/tts/install-runtime", { method: "POST" });
      await loadStatus();
    } finally {
      setInstallingRuntime(false);
    }
  }, [loadStatus]);

  const handleDownloadVoice = useCallback(async (voiceId: string) => {
    setDownloads((prev) => ({
      ...prev,
      [voiceId]: { state: "downloading", error: null },
    }));
    try {
      await apiClient("/api/tts/download-voice", {
        method: "POST",
        body: { voice: voiceId },
      });
      setDownloads((prev) => ({
        ...prev,
        [voiceId]: { state: "done", error: null },
      }));
      await loadStatus();
    } catch (error) {
      setDownloads((prev) => ({
        ...prev,
        [voiceId]: {
          state: "error",
          error: error instanceof Error ? error.message : "Error descargando voz",
        },
      }));
    }
  }, [loadStatus]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 rounded-2xl animate-pulse border border-border" style={{ background: "hsl(var(--hive-surface))" }} />
        <div className="h-48 rounded-2xl animate-pulse border border-border" style={{ background: "hsl(var(--hive-surface))" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl border border-hive-amber/20 bg-hive-amber/10 shadow-sm">
          <Mic className="h-5 w-5 text-hive-amber" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">TTS Local</h2>
          <p className="text-xs mt-0.5 text-muted-foreground">
            Descarga Piper y voces offline para narración local en HiveLearn
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

      <div className="rounded-xl border border-border bg-background/60 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-4 w-4 text-hive-amber" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Runtime Piper
          </h3>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {status?.binaryInstalled ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-hive-green" />
                  <span className="text-sm text-foreground">Runtime instalado</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-hive-amber" />
                  <span className="text-sm text-muted-foreground">Runtime pendiente</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Plataforma: {status?.platform ?? "desconocida"}
            </p>
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

      <div className="rounded-xl border border-border bg-background/60 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Mic className="h-4 w-4 text-hive-amber" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Voces disponibles
          </h3>
          <span className="ml-auto text-xs text-muted-foreground">
            Español offline
          </span>
        </div>

        <div className="space-y-3">
          {status?.voices?.map((voice) => {
            const current = downloads[voice.id] ?? {
              state: voice.downloaded ? "done" : "idle",
              error: null,
            };
            const isDone = current.state === "done";
            const isDownloading = current.state === "downloading";
            const isError = current.state === "error";

            return (
              <div
                key={voice.id}
                className={`p-4 rounded-lg border transition-all ${
                  isDone
                    ? "border-hive-green/30 bg-hive-green/5"
                    : isDownloading
                    ? "border-hive-blue/30 bg-hive-blue/5"
                    : "border-border bg-secondary/20"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{voice.name}</p>
                      {isDone && <CheckCircle2 className="h-4 w-4 text-hive-green flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{voice.language}</span>
                      <span>{voice.quality}</span>
                      <span>{voice.size}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                      {voice.id}
                    </p>
                    {isError && (
                      <p className="text-[11px] text-hive-red mt-2">{current.error}</p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {isDone ? (
                      <span className="text-xs font-medium text-hive-green">Descargada</span>
                    ) : (
                      <button
                        onClick={() => handleDownloadVoice(voice.id)}
                        disabled={!status?.binaryInstalled || isDownloading}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                      >
                        {isDownloading ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Descargando...
                          </>
                        ) : (
                          <>
                            <Download className="h-3 w-3" />
                            Descargar
                          </>
                        )}
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
            Instala Piper primero para poder descargar una voz
          </p>
        )}
      </div>
    </div>
  );
}
