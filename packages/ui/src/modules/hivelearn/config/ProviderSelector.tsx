import { CheckCircle2, AlertCircle, KeyRound, Server } from "lucide-react";

export interface ProviderOption {
  id: string;
  name: string;
  active: boolean;
  hasApiKey: boolean;
  isLocal?: boolean;
}

interface ProviderSelectorProps {
  providers: ProviderOption[];
  selectedId: string | null;
  onSelect: (providerId: string) => void;
}

export function ProviderSelector({ providers, selectedId, onSelect }: ProviderSelectorProps) {
  if (providers.length === 0) {
    return (
      <div className="rounded-[1.25rem] bg-card/40 backdrop-blur-xl p-10 text-center animate-in fade-in duration-1000">
        <Server className="mx-auto mb-4 h-10 w-10 text-white/10" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 italic">
          No hay nodos activos en el clúster.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
      {providers.map(provider => {
        const isSelected = selectedId === provider.id;
        return (
          <button
            key={provider.id}
            onClick={() => onSelect(provider.id)}
            className={`group relative rounded-[1.25rem] py-6 px-5 text-left transition-all duration-700 ease-in-out overflow-hidden
              ${isSelected 
                ? "bg-card shadow-[0_20px_40px_-12px_rgba(245,158,11,0.15)] scale-[1.02]" 
                : "bg-card/40 hover:bg-card/60 hover:translate-y-[-2px]"
              }`}
          >
            {/* Glass Background */}
            <div className="absolute inset-0 bg-white/[0.02] backdrop-blur-3xl" />

            {/* Ambient Glow for selected */}
            {isSelected && (
              <div className="absolute -top-16 -right-16 w-32 h-32 bg-hive-amber/10 blur-[40px] rounded-full pointer-events-none animate-pulse" />
            )}

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span className={`font-black text-[13px] tracking-tight transition-colors duration-500 ${isSelected ? "text-hive-amber" : "text-white/40 group-hover:text-white/60"}`}>
                  {provider.name}
                </span>
                <div 
                  className={`h-2 w-2 rounded-full transition-all duration-1000 ${provider.active ? "bg-hive-connected shadow-[0_0_10px_hsl(var(--hive-connected))]" : "bg-white/10"}`}
                />
              </div>

              <div className="text-[8px] font-mono uppercase tracking-[0.25em] mb-5 text-white/10 truncate">
                {provider.id.replace(/-/g, '_')}
              </div>

              <div className="flex items-center gap-2">
                {provider.hasApiKey ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter bg-hive-connected/10 text-hive-connected">
                    <KeyRound className="h-2.5 w-2.5" />
                    AUTH_OK
                  </div>
                ) : provider.isLocal ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter bg-hive-cyan/10 text-hive-cyan">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    LOCAL_NODE
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter bg-white/5 text-white/20">
                    <AlertCircle className="h-2.5 w-2.5" />
                    NO_CREDENTIALS
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
