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
      <div className="flex flex-col items-center justify-center py-40 animate-in fade-in duration-1000">
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-hive-amber/30 blur-[100px] rounded-full animate-pulse" />
          <Loader2 className="relative h-16 w-16 animate-spin text-hive-amber/80" />
        </div>
        <p className="text-[12px] font-black uppercase tracking-[1em] text-white/20 italic animate-pulse">
          Sincronizando_Infraestructura_IO
        </p>
      </div>
    );
  }

  const activeCount = providers.filter(p => p.active === 1).length;

  return (
    <div className="space-y-32 animate-in fade-in duration-1000 pb-32">
      {/* ── Stitch Refined Header ───────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-16">
        <div className="space-y-8">
          <div className="flex items-center gap-6">
            <div className="h-px w-20 bg-hive-amber/40" />
            <span className="text-[12px] font-black tracking-[0.8em] uppercase text-hive-amber/70">
              Infraestructura_Proveedores_v4
            </span>
          </div>
          <h2 className="text-8xl font-black tracking-tighter text-white leading-[0.8] uppercase">
            Control de <span className="text-hive-amber italic block mt-4">Proveedores_IO</span>
          </h2>
          <p className="text-xl font-medium text-white/30 max-w-2xl italic leading-relaxed">
            Orquestación de terminales de procesamiento. Conmuta entre proveedores locales y en la nube para optimizar la latencia del enjambre.
          </p>
        </div>

        <div className="flex items-center gap-14 px-14 py-8 rounded-[3rem] bg-white/[0.01] backdrop-blur-3xl border border-white/[0.03] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]">
          <div className="text-right">
            <div className="flex items-center justify-end gap-4 mb-2">
              <div className="h-2 w-2 rounded-full bg-hive-connected animate-pulse" />
              <span className="text-[11px] font-black uppercase tracking-[0.5em] text-white/30">Estado_Red</span>
            </div>
            <span className="text-5xl font-black text-hive-amber tabular-nums leading-none">
              {activeCount.toString().padStart(2, '0')}
              <span className="text-xl text-white/10 ml-4 italic">/ {providers.length.toString().padStart(2, '0')}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Grid — Obsidian Architecture Refined by Stitch ──────────── */}
      <div className="grid grid-cols-1 gap-16">
        {providers.map((prov, idx) => {
          const isActive = prov.active === 1;
          const isLoadingKey = loading[prov.id];
          const isToggling = toggling[prov.id];
          const isOllama = prov.id === "ollama";
          const cat = getCat(prov.category);
          
          return (
            <div
              key={prov.id}
              className={`group relative rounded-[4rem] transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]
                ${isActive 
                  ? "bg-white/[0.02] shadow-[0_128px_256px_-64px_rgba(0,0,0,0.9)]" 
                  : "bg-white/[0.005] opacity-30 grayscale hover:opacity-50 hover:grayscale-0 hover:scale-[1.01]"
                }
                border border-white/[0.02] overflow-hidden
              `}
              style={{ animationDelay: `${idx * 200}ms` }}
            >
              {/* Atmospheric Glow (Stitch Directives) */}
              <div 
                className={`absolute -top-64 -right-64 w-[50rem] h-[50rem] rounded-full blur-[150px] transition-all duration-1000 pointer-events-none opacity-0
                  ${isActive ? "group-hover:opacity-[0.12]" : ""}
                `}
                style={{ background: `radial-gradient(circle, hsl(var(${cat.accentVar})), transparent 70%)` }}
              />

              <div className="relative z-10 p-12 md:p-20">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-16">
                  <div className="flex-1 space-y-12">
                    {/* Header Row */}
                    <div className="flex items-start gap-12">
                      <div className={`p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] transition-all duration-1000
                        ${isActive ? cat.textClass + " scale-110 shadow-[0_0_40px_rgba(255,255,255,0.05)]" : "text-white/5"}
                      `}>
                        <cat.icon className="h-12 w-12" />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-6 mb-4">
                          <span className={`text-[11px] font-black uppercase tracking-[0.6em] ${cat.textClass} px-5 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05]`}>
                            {cat.label}_PROTOCOL
                          </span>
                          {prov.isLocal && (
                            <span className="text-[11px] font-black uppercase tracking-[0.6em] text-hive-cyan px-5 py-2 rounded-xl bg-hive-cyan/5 border border-hive-cyan/10">
                              LOCAL_NODE
                            </span>
                          )}
                        </div>
                        <h3 className={`text-6xl font-black tracking-tighter uppercase transition-all duration-1000
                          ${isActive ? "text-white" : "text-white/10"}
                        `}>
                          {prov.name}
                        </h3>
                      </div>
                    </div>

                    {/* Metadata Grid (Editorial Staging) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
                      <div className="space-y-3">
                        <span className="block text-[10px] font-black uppercase tracking-[0.5em] text-white/10 italic">Identificador</span>
                        <span className="block text-sm font-mono text-white/20">ID::{prov.id.toUpperCase()}</span>
                      </div>
                      {prov.maxContext && (
                        <div className="space-y-3">
                          <span className="block text-[10px] font-black uppercase tracking-[0.5em] text-white/10 italic">Capacidad_Ventana</span>
                          <span className="block text-sm font-mono text-hive-cyan/40">{prov.maxContext.toLocaleString()} TOKENS</span>
                        </div>
                      )}
                      <div className="space-y-3">
                        <span className="block text-[10px] font-black uppercase tracking-[0.5em] text-white/10 italic">Nodos_Registrados</span>
                        <span className="block text-sm font-mono text-white/20">{prov.modelCount.toString().padStart(2, '0')} UNIDADES</span>
                      </div>
                      <div className="space-y-3">
                        <span className="block text-[10px] font-black uppercase tracking-[0.5em] text-white/10 italic">Seguridad_SSL</span>
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${prov.hasApiKey || prov.isLocal ? "bg-hive-connected" : "bg-hive-amber"} animate-pulse`} />
                          <span className={`text-[11px] font-black uppercase tracking-[0.4em] ${prov.hasApiKey || prov.isLocal ? "text-hive-connected/60" : "text-hive-amber/60"}`}>
                            {prov.isLocal ? "BYPASS" : prov.hasApiKey ? "ENCRYPTED" : "REQUIRED"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Skeuomorphic Activation Switch (Stitch) */}
                  <div className="flex items-center gap-12">
                    <div className="hidden xl:block h-32 w-px bg-white/[0.03]" />
                    <button
                      onClick={() => handleToggle(prov.id, isActive)}
                      disabled={isToggling}
                      className={`relative group/toggle h-32 w-32 rounded-[3.5rem] transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]
                        ${isActive 
                          ? "bg-hive-amber text-[#2a1700] shadow-[0_64px_128px_-32px_rgba(245,158,11,0.5)]" 
                          : "bg-white/[0.02] text-white/10 hover:bg-white/[0.05] hover:text-white/30"
                        }
                        active:scale-95 flex items-center justify-center overflow-hidden
                      `}
                    >
                      {/* Internal shadow for skeuomorphic depth */}
                      <div className={`absolute inset-0 rounded-[3.5rem] border-t-2 border-l-2 transition-all duration-1000
                        ${isActive ? "border-white/30" : "border-white/5"}
                      `} />
                      <div className={`absolute inset-0 rounded-[3.5rem] border-b-2 border-r-2 transition-all duration-1000
                        ${isActive ? "border-black/20" : "border-black/10"}
                      `} />
                      
                      {isToggling ? (
                        <Loader2 className="h-10 w-10 animate-spin" />
                      ) : (
                        <Power className={`h-10 w-10 transition-all duration-1000 ${isActive ? "scale-110 drop-shadow-[0_0_15px_rgba(0,0,0,0.3)]" : ""}`} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Sub-Interface (Glassmorphic Wells) */}
                <div className="mt-20 space-y-12">
                  <div className="h-px bg-gradient-to-r from-white/[0.05] via-white/[0.02] to-transparent" />

                  <div className="flex flex-col xl:flex-row gap-16">
                    {/* Endpoint Metadata */}
                    {prov.base_url && (
                      <div className="flex-1 space-y-6">
                        <div className="flex items-center gap-6">
                          <Globe className="h-5 w-5 text-white/20" />
                          <span className="text-[11px] font-black uppercase tracking-[0.6em] text-white/20 italic">Acceso_Topológico</span>
                        </div>
                        <div className="p-10 rounded-[2rem] bg-white/[0.005] border border-white/[0.03] font-mono text-sm text-white/30 break-all transition-all hover:bg-white/[0.01] hover:text-white/50">
                          {prov.base_url}
                        </div>
                      </div>
                    )}

                    {/* Auth / Node Actions */}
                    <div className="flex-[1.5] space-y-8">
                      {isOllama ? (
                        <div className="space-y-8">
                          <div className="flex items-center gap-6">
                            <Download className="h-5 w-5 text-hive-cyan" />
                            <span className="text-[11px] font-black uppercase tracking-[0.6em] text-hive-cyan/60 italic">Motor_Sincronización</span>
                          </div>
                          <button
                            onClick={handleOllamaImport}
                            disabled={ollamaImporting}
                            className="relative w-full h-20 rounded-[2rem] overflow-hidden group/sync transition-all duration-700 active:scale-98 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)]"
                          >
                            <div className="absolute inset-0 bg-hive-cyan opacity-90 group-hover/sync:opacity-100 group-hover/sync:scale-105 transition-all duration-1000" />
                            <div className="relative z-10 flex items-center justify-center gap-6 text-[#002a2a] text-[13px] font-black uppercase tracking-[0.3em]">
                              {ollamaImporting ? <Loader2 className="h-6 w-6 animate-spin" /> : <Layers className="h-6 w-6" />}
                              {ollamaImporting ? "ESCANEANDO_NODOS..." : "SINCRONIZAR_INFRAESTRUCTURA_LOCAL"}
                            </div>
                          </button>
                        </div>
                      ) : !prov.isLocal && (
                        <div className="space-y-8">
                          <div className="flex items-center gap-6">
                            <KeyRound className="h-5 w-5 text-white/20" />
                            <span className="text-[11px] font-black uppercase tracking-[0.6em] text-white/20 italic">Protocolo_Autenticación</span>
                          </div>
                          <div className="flex flex-col md:flex-row gap-6">
                            <div className="relative flex-1">
                              <input
                                type={showKey[prov.id] ? "text" : "password"}
                                value={apiKeys[prov.id] || ""}
                                onChange={e => setApiKeys(p => ({ ...p, [prov.id]: e.target.value }))}
                                placeholder="HL_SECURE_TOKEN_..."
                                className="w-full h-20 px-10 pr-20 rounded-[2rem] bg-white/[0.01] border border-white/[0.05] outline-none text-sm font-mono text-white/70 focus:bg-white/[0.03] focus:border-hive-amber/40 transition-all placeholder:text-white/5"
                              />
                              <button
                                onClick={() => setShowKey(p => ({ ...p, [prov.id]: !showKey[prov.id] }))}
                                className="absolute right-8 top-1/2 -translate-y-1/2 text-white/10 hover:text-white/40 transition-colors p-2"
                              >
                                {showKey[prov.id] ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
                              </button>
                            </div>
                            <button
                              onClick={() => handleSaveKey(prov.id)}
                              disabled={isLoadingKey || !apiKeys[prov.id]?.trim()}
                              className="relative h-20 px-12 rounded-[2rem] overflow-hidden group/save transition-all duration-700 active:scale-95 disabled:opacity-20 shadow-[0_32px_64px_-16px_rgba(245,158,11,0.2)]"
                            >
                              <div className="absolute inset-0 bg-hive-amber opacity-90 group-hover/save:opacity-100 transition-all duration-1000" />
                              <div className="relative z-10 flex items-center justify-center gap-4 text-[#2a1700] text-[13px] font-black uppercase tracking-[0.3em]">
                                {isLoadingKey ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                                VALIDAR
                              </div>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Technical Metadata (Blueprint Style) */}
                <div className="absolute bottom-10 right-16 flex items-center gap-6 pointer-events-none opacity-[0.05]">
                  <span className="text-[10px] font-mono tracking-[0.8em] uppercase italic">
                    Topology_Ref::{prov.id.substring(0,6).toUpperCase()} // Matrix_Node_0x{idx.toString(16).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
