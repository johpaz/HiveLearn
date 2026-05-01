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
      // Auto-activate the provider after setting the key
      await apiClient(`/api/providers/${pid}/toggle`, { method: "PUT", body: { active: true }, showError: false });
      
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
    <div className="space-y-16 animate-in fade-in duration-1000 pb-32">
      {/* ── Compact Header ───────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-px w-12 bg-hive-amber/40" />
            <span className="text-[10px] font-black tracking-[0.6em] uppercase text-hive-amber/70">
              Gestión_Infraestructura
            </span>
          </div>
          <h2 className="text-5xl font-black tracking-tighter text-white leading-none uppercase">
            Control de <span className="text-hive-amber italic block mt-2">Proveedores</span>
          </h2>
          <p className="text-sm font-medium text-white/20 max-w-xl italic">
            Configuración y orquestación de terminales de cómputo para el enjambre.
          </p>
        </div>

        <div className="flex items-center gap-10 px-10 py-6 rounded-2xl bg-white/[0.01] border border-white/[0.03]">
          <div className="text-right">
            <div className="flex items-center justify-end gap-3 mb-1">
              <div className="h-1.5 w-1.5 rounded-full bg-hive-connected animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">Estado_Red</span>
            </div>
            <span className="text-4xl font-black text-hive-amber tabular-nums">
              {activeCount.toString().padStart(2, '0')}
              <span className="text-base text-white/10 ml-3 italic">/ {providers.length.toString().padStart(2, '0')}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Grid 2 Columns (Starting from MD) ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {providers.map((prov, idx) => {
          const isActive = prov.active === 1;
          const isLoadingKey = loading[prov.id];
          const isToggling = toggling[prov.id];
          const isOllama = prov.id === "ollama";
          const cat = getCat(prov.category);
          
          return (
            <div
              key={prov.id}
              className={`group relative rounded-[2rem] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]
                ${isActive 
                  ? "bg-white/[0.02] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)]" 
                  : "bg-white/[0.005] opacity-30 grayscale"
                }
                border border-white/[0.02] overflow-hidden flex flex-col
              `}
            >
              <div 
                className={`absolute -top-16 -right-16 w-[20rem] h-[20rem] rounded-full blur-[80px] transition-all duration-1000 pointer-events-none opacity-0
                  ${isActive ? "group-hover:opacity-[0.08]" : ""}
                `}
                style={{ background: `radial-gradient(circle, hsl(var(${cat.accentVar})), transparent 70%)` }}
              />

              <div className="relative z-10 p-8 flex-1 flex flex-col justify-between space-y-8">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-6">
                    <div className={`p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] transition-all
                      ${isActive ? cat.textClass : "text-white/5"}
                    `}>
                      <cat.icon className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <span className={`text-[8px] font-black uppercase tracking-[0.3em] ${cat.textClass} px-2 py-0.5 rounded bg-white/[0.02] border border-white/[0.05]`}>
                        {cat.label}
                      </span>
                      <h3 className={`text-2xl font-black tracking-tight uppercase
                        ${isActive ? "text-white" : "text-white/10"}
                      `}>
                        {prov.name}
                      </h3>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggle(prov.id, isActive)}
                    disabled={isToggling}
                    className={`relative h-14 w-14 rounded-2xl transition-all active:scale-95 flex items-center justify-center overflow-hidden flex-shrink-0
                      ${isActive ? "bg-hive-amber text-[#2a1700]" : "bg-white/[0.02] text-white/10 hover:bg-white/[0.05]"}
                    `}
                  >
                    {isToggling ? <Loader2 className="h-5 w-5 animate-spin" /> : <Power className="h-6 w-6" />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6 py-6 border-y border-white/[0.03]">
                  <div className="space-y-1">
                    <span className="block text-[8px] font-black uppercase tracking-[0.3em] text-white/10">Nodos</span>
                    <span className="block text-xs font-mono text-white/20">{prov.modelCount.toString().padStart(2, '0')} UNITS</span>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[8px] font-black uppercase tracking-[0.3em] text-white/10">Auth</span>
                    <div className="flex items-center gap-2">
                      <div className={`h-1 w-1 rounded-full ${prov.hasApiKey || prov.isLocal ? "bg-hive-connected" : "bg-hive-amber"} animate-pulse`} />
                      <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${prov.hasApiKey || prov.isLocal ? "text-hive-connected/60" : "text-hive-amber/60"}`}>
                        {prov.isLocal ? "BYPASS" : prov.hasApiKey ? "PASS" : "REQUIRED"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {isOllama ? (
                    <button
                      onClick={handleOllamaImport}
                      disabled={ollamaImporting}
                      className="relative w-full h-12 rounded-xl overflow-hidden bg-hive-cyan/90 text-[#002a2a] transition-all active:scale-98"
                    >
                      <div className="relative z-10 flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em]">
                        {ollamaImporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />}
                        {ollamaImporting ? "ESCANEANDO..." : "Sincronizar Local"}
                      </div>
                    </button>
                  ) : !prov.isLocal && (
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <input
                          type={showKey[prov.id] ? "text" : "password"}
                          value={apiKeys[prov.id] || ""}
                          onChange={e => setApiKeys(p => ({ ...p, [prov.id]: e.target.value }))}
                          placeholder={prov.hasApiKey ? "TOKEN_CONFIGURADO" : "API_KEY"}
                          className="w-full h-12 px-5 pr-12 rounded-xl bg-white/[0.01] border border-white/[0.05] outline-none text-[10px] font-mono text-white/40 focus:bg-white/[0.02] focus:border-hive-amber/20 transition-all"
                        />
                        <button
                          onClick={() => setShowKey(p => ({ ...p, [prov.id]: !showKey[prov.id] }))}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/10 hover:text-white/30 p-1 flex items-center justify-center"
                        >
                          {showKey[prov.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                      <button
                        onClick={() => handleSaveKey(prov.id)}
                        disabled={isLoadingKey || !apiKeys[prov.id]?.trim()}
                        className={`h-12 px-5 rounded-xl transition-all active:scale-95 disabled:opacity-10 flex items-center justify-center
                          ${status[prov.id] === "success" ? "bg-hive-connected text-black" : "bg-hive-amber/90 hover:bg-hive-amber text-[#2a1700]"}
                        `}
                      >
                        {isLoadingKey ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : status[prov.id] === "success" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </button>
                      {prov.hasApiKey && (
                        <button
                          onClick={() => handleDeleteKey(prov.id)}
                          disabled={isLoadingKey}
                          className="h-12 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500/40 hover:text-red-500 transition-all active:scale-95 border border-red-500/10 flex items-center justify-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-between opacity-[0.02]">
                  <span className="text-[7px] font-mono tracking-[0.4em] uppercase">ID::{prov.id.substring(0,8)}</span>
                  <span className="text-[7px] font-mono tracking-[0.4em] uppercase">NODE_0x{idx.toString(16).toUpperCase()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
