import { useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import {
  KeyRound,
  CheckCircle2,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Power,
  Globe,
  Cpu,
  Mic,
  Volume2,
  Download,
  Loader2,
  AlertCircle,
  ChevronDown,
  Server,
  Layers,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────

export interface FullProvider {
  id: string;
  name: string;
  base_url: string | null;
  category: string;
  enabled: number;
  active: number;
  created_at: number;
  modelCount: number;
  hasApiKey: boolean;
  isLocal: boolean;
  maxContext?: number;
}

interface ProviderManagerProps {
  providers: FullProvider[];
  onProviderToggle?: () => void;
}

// ── Category Config ─────────────────────────────────────────────────────

const CATEGORY_META: Record<string, {
  label: string;
  icon: typeof Cpu;
  accentVar: string;
  bgClass: string;
  textClass: string;
}> = {
  llm: {
    label: "LLM",
    icon: Cpu,
    accentVar: "--hive-blue",
    bgClass: "bg-hive-blue/10",
    textClass: "text-hive-blue",
  },
  tts: {
    label: "TTS",
    icon: Volume2,
    accentVar: "--hive-purple",
    bgClass: "bg-hive-purple/10",
    textClass: "text-hive-purple",
  },
  stt: {
    label: "STT",
    icon: Mic,
    accentVar: "--hive-cyan",
    bgClass: "bg-hive-cyan/10",
    textClass: "text-hive-cyan",
  },
};

function getCat(category: string) {
  return CATEGORY_META[category] || CATEGORY_META.llm;
}

// ── Component ────────────────────────────────────────────────────────────

export function ProviderManager({ providers, onProviderToggle }: ProviderManagerProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, "idle" | "success" | "error">>({});
  const [expandedKey, setExpandedKey] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  // Ollama import
  const [ollamaImporting, setOllamaImporting] = useState(false);
  const [ollamaResult, setOllamaResult] = useState<{ imported: number; models: string[] } | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  const handleSaveKey = useCallback(async (pid: string) => {
    const key = apiKeys[pid];
    if (!key?.trim()) return;
    setLoading(p => ({ ...p, [pid]: true }));
    setStatus(p => ({ ...p, [pid]: "idle" }));
    try {
      await apiClient(`/api/providers/${pid}/api-key`, { method: "POST", body: { apiKey: key.trim() }, showError: false });
      setStatus(p => ({ ...p, [pid]: "success" }));
      setApiKeys(p => ({ ...p, [pid]: "" }));
      onProviderToggle?.();
      setTimeout(() => setStatus(p => ({ ...p, [pid]: "idle" })), 3000);
    } catch {
      setStatus(p => ({ ...p, [pid]: "error" }));
    } finally {
      setLoading(p => ({ ...p, [pid]: false }));
    }
  }, [apiKeys, onProviderToggle]);

  const handleDeleteKey = useCallback(async (pid: string) => {
    setLoading(p => ({ ...p, [pid]: true }));
    try {
      await apiClient(`/api/providers/${pid}/api-key`, { method: "DELETE", showError: false });
      onProviderToggle?.();
    } catch (e) { console.error(e); }
    finally { setLoading(p => ({ ...p, [pid]: false })); }
  }, [onProviderToggle]);

  const handleToggle = useCallback(async (pid: string, active: boolean) => {
    setToggling(p => ({ ...p, [pid]: true }));
    try {
      await apiClient(`/api/providers/${pid}/toggle`, { method: "PUT", body: { active: !active }, showError: false });
      onProviderToggle?.();
    } catch (e) { console.error(e); }
    finally { setToggling(p => ({ ...p, [pid]: false })); }
  }, [onProviderToggle]);

  const handleOllamaImport = useCallback(async () => {
    setOllamaImporting(true);
    setOllamaError(null);
    setOllamaResult(null);
    try {
      const d = await apiClient<{ ok: boolean; imported: number; models: string[] }>("/api/providers/ollama/import", { method: "POST", showError: false });
      setOllamaResult({ imported: d.imported, models: d.models });
      onProviderToggle?.();
    } catch (e) {
      setOllamaError(e instanceof Error ? e.message : "Error al importar modelos");
    } finally { setOllamaImporting(false); }
  }, [onProviderToggle]);

  if (providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 animate-in fade-in duration-1000">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-hive-amber/20 blur-3xl rounded-full animate-pulse" />
          <Loader2 className="relative h-12 w-12 animate-spin text-hive-amber/60" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20 italic animate-pulse">
          Sincronizando_Topologia_Nodal
        </p>
      </div>
    );
  }

  const activeCount = providers.filter(p => p.active === 1).length;

  return (
    <div className="space-y-24 animate-in fade-in duration-1000 pb-20">
      {/* ── Editorial Header ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-px w-12 bg-hive-amber/30" />
            <span className="text-[11px] font-black tracking-[0.6em] uppercase text-hive-amber/60">
              Infraestructura_v4
            </span>
          </div>
          <h2 className="text-6xl font-black tracking-tighter text-white leading-none uppercase">
            Gestión de <span className="text-hive-amber italic block mt-2">Nodos_IO</span>
          </h2>
          <p className="text-lg font-medium text-white/20 max-w-xl italic leading-relaxed">
            Orquestación de terminales de procesamiento. Conmuta entre proveedores locales y en la nube para optimizar la latencia del enjambre.
          </p>
        </div>

        <div className="flex items-center gap-10 px-10 py-6 rounded-[2rem] bg-white/[0.02] backdrop-blur-3xl border border-white/[0.02]">
          <div className="text-right">
            <div className="flex items-center justify-end gap-3 mb-1">
              <div className="h-1 w-1 rounded-full bg-hive-connected animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Estado_Red</span>
            </div>
            <span className="text-4xl font-black text-hive-amber tabular-nums leading-none">
              {activeCount.toString().padStart(2, '0')}
              <span className="text-lg text-white/10 ml-2">/ {providers.length.toString().padStart(2, '0')}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Grid — Obsidian Architecture ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-12">
        {providers.map((prov, idx) => {
          const isActive = prov.active === 1;
          const isLoadingKey = loading[prov.id];
          const isToggling = toggling[prov.id];
          const curStatus = status[prov.id] || "idle";
          const isShowing = showKey[prov.id];
          const isKeyOpen = expandedKey[prov.id];
          const isOllama = prov.id === "ollama";
          const cat = getCat(prov.category);
          
          return (
            <div
              key={prov.id}
              className={`group relative rounded-[3rem] transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)]
                ${isActive 
                  ? "bg-white/[0.02] shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)]" 
                  : "bg-white/[0.01] opacity-40 grayscale-[0.8] scale-[0.98] hover:scale-[1] hover:opacity-60"
                }
                border border-white/[0.02] overflow-hidden
              `}
              style={{ animationDelay: `${idx * 150}ms` }}
            >
              {/* Category Glow Background */}
              <div 
                className={`absolute -top-32 -right-32 w-[30rem] h-[30rem] rounded-full blur-[120px] transition-all duration-1000 pointer-events-none opacity-0
                  ${isActive ? "group-hover:opacity-[0.08]" : ""}
                `}
                style={{ background: `radial-gradient(circle, hsl(var(${cat.accentVar})), transparent 70%)` }}
              />

              <div className="relative z-10 p-10 md:p-14">
                {/* ── Layout Principal ─────────────────────────────────── */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12">
                  <div className="flex-1 space-y-8">
                    {/* Header Row */}
                    <div className="flex items-start gap-8">
                      <div className={`p-5 rounded-2xl bg-white/[0.03] border border-white/[0.05] transition-all duration-700
                        ${isActive ? cat.textClass + " scale-110 shadow-[0_0_20px_rgba(255,255,255,0.05)]" : "text-white/10"}
                      `}>
                        <cat.icon className="h-8 w-8" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-4 mb-2">
                          <span className={`text-[10px] font-black uppercase tracking-[0.4em] ${cat.textClass} px-3 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05]`}>
                            {cat.label}_PROTOCOL
                          </span>
                          {prov.isLocal && (
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-hive-cyan px-3 py-1 rounded-lg bg-hive-cyan/5 border border-hive-cyan/10">
                              LOCAL_NODE
                            </span>
                          )}
                        </div>
                        <h3 className={`text-4xl font-black tracking-tighter uppercase transition-colors duration-700
                          ${isActive ? "text-white" : "text-white/20"}
                        `}>
                          {prov.name}
                        </h3>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-10 pt-4">
                      <div className="space-y-2">
                        <span className="block text-[9px] font-black uppercase tracking-[0.3em] text-white/10">Identificador</span>
                        <span className="block text-xs font-mono text-white/30 truncate">ID::{prov.id.toUpperCase()}</span>
                      </div>
                      {prov.maxContext && (
                        <div className="space-y-2">
                          <span className="block text-[9px] font-black uppercase tracking-[0.3em] text-white/10">Ventana_Max</span>
                          <span className="block text-xs font-mono text-hive-cyan/50 italic">{prov.maxContext.toLocaleString()} TKNS</span>
                        </div>
                      )}
                      <div className="space-y-2">
                        <span className="block text-[9px] font-black uppercase tracking-[0.3em] text-white/10">Modelos_Reg</span>
                        <span className="block text-xs font-mono text-white/30">{prov.modelCount.toString().padStart(2, '0')} NODOS</span>
                      </div>
                      <div className="space-y-2">
                        <span className="block text-[9px] font-black uppercase tracking-[0.3em] text-white/10">Auth_Status</span>
                        <div className="flex items-center gap-2">
                          <div className={`h-1.5 w-1.5 rounded-full ${prov.hasApiKey || prov.isLocal ? "bg-hive-connected" : "bg-hive-amber"} animate-pulse`} />
                          <span className={`text-xs font-black uppercase tracking-widest ${prov.hasApiKey || prov.isLocal ? "text-hive-connected/60" : "text-hive-amber/60"}`}>
                            {prov.isLocal ? "BYPASS" : prov.hasApiKey ? "ENCRYPTED" : "REQUIRED"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* High-End Activation Switch */}
                  <div className="flex items-center gap-8">
                    <div className="hidden lg:block h-20 w-px bg-white/[0.03]" />
                    <button
                      onClick={() => handleToggle(prov.id, isActive)}
                      disabled={isToggling}
                      className={`relative group/toggle h-24 w-24 rounded-[2.5rem] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]
                        ${isActive 
                          ? "bg-hive-amber text-[#2a1700] shadow-[0_32px_64px_-16px_rgba(245,158,11,0.4)]" 
                          : "bg-white/[0.03] text-white/10 hover:bg-white/[0.06] hover:text-white/30"
                        }
                        active:scale-90 flex items-center justify-center
                      `}
                    >
                      <div className={`absolute inset-0 rounded-[2.5rem] border-2 transition-all duration-700
                        ${isActive ? "border-white/20" : "border-white/5 group-hover/toggle:border-white/10"}
                      `} />
                      {isToggling ? (
                        <Loader2 className="h-8 w-8 animate-spin" />
                      ) : (
                        <Power className={`h-8 w-8 transition-transform duration-700 ${isActive ? "scale-110" : ""}`} />
                      )}
                    </button>
                  </div>
                </div>

                {/* ── Extended Functionality Area ──────────────────────── */}
                <div className="mt-14 space-y-10">
                  <div className="h-px bg-gradient-to-r from-white/[0.05] via-white/[0.02] to-transparent" />

                  <div className="flex flex-col md:flex-row gap-12">
                    {/* Access Point Info */}
                    {prov.base_url && (
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-4">
                          <Globe className="h-4 w-4 text-white/20" />
                          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Endpoint_Protocol</span>
                        </div>
                        <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/[0.03] font-mono text-xs text-white/40 break-all transition-colors hover:text-white/60">
                          {prov.base_url}
                        </div>
                      </div>
                    )}

                    {/* API Key or Ollama Actions */}
                    <div className="flex-[1.5] space-y-6">
                      {isOllama ? (
                        <div className="space-y-6">
                          <div className="flex items-center gap-4">
                            <Download className="h-4 w-4 text-hive-cyan" />
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-hive-cyan/60">Sync_Manager</span>
                          </div>
                          <div className="flex flex-col md:flex-row gap-4">
                            <button
                              onClick={handleOllamaImport}
                              disabled={ollamaImporting}
                              className="relative flex-1 h-14 rounded-2xl overflow-hidden group/sync transition-all duration-500 active:scale-95"
                            >
                              <div className="absolute inset-0 bg-hive-cyan opacity-90 group-hover/sync:opacity-100 group-hover/sync:scale-110 transition-all duration-700" />
                              <div className="relative z-10 flex items-center justify-center gap-4 text-[#002a2a] text-[11px] font-black uppercase tracking-widest">
                                {ollamaImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                                {ollamaImporting ? "ESCANEANDO_NODOS..." : "SINCRONIZAR_MODELOS_LOCALES"}
                              </div>
                            </button>
                          </div>
                          
                          {ollamaResult && (
                            <div className="animate-in slide-in-from-top-2 duration-500 p-6 rounded-2xl bg-hive-connected/5 border border-hive-connected/10 space-y-4">
                              <div className="flex items-center gap-3 text-hive-connected">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">{ollamaResult.imported} NODOS_IMPORTADOS</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {ollamaResult.models.slice(0, 8).map(m => (
                                  <span key={m} className="px-3 py-1.5 rounded-lg bg-white/[0.03] text-[9px] font-mono text-white/40 border border-white/[0.02]">{m}</span>
                                ))}
                                {ollamaResult.models.length > 8 && (
                                  <span className="text-[9px] font-black text-white/10 py-1.5 uppercase tracking-widest px-2">+{ollamaResult.models.length - 8}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : !prov.isLocal && (
                        <div className="space-y-6">
                          <div className="flex items-center gap-4">
                            <KeyRound className="h-4 w-4 text-white/20" />
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Security_Protocol</span>
                          </div>
                          <div className="flex flex-col md:flex-row gap-4">
                            <div className="relative flex-1">
                              <input
                                type={isShowing ? "text" : "password"}
                                value={apiKeys[prov.id] || ""}
                                onChange={e => setApiKeys(p => ({ ...p, [prov.id]: e.target.value }))}
                                placeholder="LLAVE_DE_ACCESO_TLS..."
                                className="w-full h-14 px-8 pr-16 rounded-2xl bg-white/[0.02] border border-white/[0.05] outline-none text-xs font-mono text-white/80 focus:bg-white/[0.04] focus:border-hive-amber/30 transition-all placeholder:text-white/5"
                              />
                              <button
                                onClick={() => setShowKey(p => ({ ...p, [prov.id]: !isShowing }))}
                                className="absolute right-5 top-1/2 -translate-y-1/2 text-white/10 hover:text-white/40 transition-colors"
                              >
                                {isShowing ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                            <button
                              onClick={() => handleSaveKey(prov.id)}
                              disabled={isLoadingKey || !apiKeys[prov.id]?.trim()}
                              className="relative h-14 px-10 rounded-2xl overflow-hidden group/save transition-all duration-500 active:scale-95 disabled:opacity-20"
                            >
                              <div className="absolute inset-0 bg-hive-amber opacity-90 group-hover/save:opacity-100 transition-all duration-700" />
                              <div className="relative z-10 flex items-center justify-center gap-3 text-[#2a1700] text-[11px] font-black uppercase tracking-widest">
                                {isLoadingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                VALIDAR
                              </div>
                            </button>
                            {prov.hasApiKey && (
                              <button
                                onClick={() => handleDeleteKey(prov.id)}
                                className="h-14 w-14 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center text-white/20 hover:text-hive-red hover:bg-hive-red/10 hover:border-hive-red/20 transition-all duration-500"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Technical Coordinates Footer */}
                <div className="absolute bottom-6 right-10 flex items-center gap-4 pointer-events-none opacity-[0.03]">
                  <span className="text-[8px] font-mono tracking-[0.5em]">COORD_{idx.toString().padStart(2, '0')}_NODE_{prov.id.substring(0,4).toUpperCase()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
