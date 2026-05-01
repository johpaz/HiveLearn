import { Cpu, Zap, Layers } from "lucide-react";

export interface ModelOption {
  id: string;
  name: string;
  provider_id: string;
  context_window?: number;
  capabilities?: string[];
  active: boolean;
}

interface ModelSelectorProps {
  models: ModelOption[];
  selectedId: string | null;
  onSelect: (modelId: string) => void;
}

export function ModelSelector({ models, selectedId, onSelect }: ModelSelectorProps) {
  if (models.length === 0) {
    return (
      <div className="rounded-[1.25rem] bg-card/40 backdrop-blur-xl p-10 text-center animate-in fade-in duration-1000">
        <Cpu className="mx-auto mb-4 h-10 w-10 text-white/10" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 italic">
          No hay modelos disponibles en este nodo.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
      {models.map(model => {
        const isSelected = selectedId === model.id;
        return (
          <button
            key={model.id}
            onClick={() => onSelect(model.id)}
            className={`group relative rounded-[1.25rem] py-6 px-5 text-left transition-all duration-700 ease-in-out overflow-hidden
              ${isSelected 
                ? "bg-card shadow-[0_20px_40px_-12px_rgba(59,130,246,0.15)] scale-[1.02]" 
                : "bg-card/40 hover:bg-card/60 hover:translate-y-[-2px]"
              }`}
          >
            {/* Glass Background */}
            <div className="absolute inset-0 bg-white/[0.02] backdrop-blur-3xl" />

            {/* Ambient Glow for selected */}
            {isSelected && (
              <div className="absolute -top-16 -right-16 w-32 h-32 bg-hive-blue/10 blur-[40px] rounded-full pointer-events-none animate-pulse" />
            )}

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className={`font-black text-[13px] tracking-tight transition-colors duration-500 ${isSelected ? "text-hive-blue" : "text-white/40 group-hover:text-white/60"}`}>
                  {model.name}
                </span>
                {isSelected && <Zap className="h-3.5 w-3.5 text-hive-blue animate-pulse" fill="currentColor" />}
              </div>

              {model.context_window && (
                <div className="flex items-center gap-2 text-[8px] font-mono tracking-[0.2em] uppercase mb-5 text-white/10">
                  <Layers className="h-3 w-3 opacity-30" />
                  {(model.context_window / 1024).toFixed(0)}K_TOKEN_CTX
                </div>
              )}

              {model.capabilities && Array.isArray(model.capabilities) && model.capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-auto">
                  {model.capabilities.map((cap: string) => (
                    <span
                      key={cap}
                      className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all duration-500
                        ${isSelected 
                          ? "bg-hive-blue/10 text-hive-blue" 
                          : "bg-white/5 text-white/10"
                        }`}
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
