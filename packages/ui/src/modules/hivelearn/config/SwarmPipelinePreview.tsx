import { useState } from "react";
import { ChevronDown, Hexagon, Activity, Share2, Target, ArrowRight } from "lucide-react";

const PIPELINE_PHASES = [
  {
    label: "Análisis",
    agents: ["👤", "🎯", "🗺️"],
    icon: Target,
    accent: "hive-blue",
  },
  {
    label: "Contenido",
    agents: ["📖", "✏️", "❓", "⚡", "💻", "📊", "🎞️", "🖼️"],
    icon: Activity,
    accent: "hive-cyan",
  },
  {
    label: "Final",
    agents: ["📈", "🏆", "📝", "🔍", "🧠"],
    icon: Share2,
    accent: "hive-connected",
  },
];

interface SwarmPipelinePreviewProps {
  agentCount: number;
}

export function SwarmPipelinePreview({ agentCount }: SwarmPipelinePreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`group rounded-[2.5rem] overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] bg-white/[0.01] backdrop-blur-3xl border border-white/[0.02]
        ${open ? "bg-white/[0.03] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)]" : "hover:bg-white/[0.03]"}
      `}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-10 py-8 text-left transition-all duration-500"
      >
        <div className="flex items-center gap-8">
          <div
            className={`p-4 rounded-2xl transition-all duration-700 
              ${open ? "bg-hive-amber/10 text-hive-amber shadow-[0_0_20px_rgba(245,158,11,0.2)]" : "bg-white/[0.03] text-white/20"}
            `}
          >
            <Hexagon
              className={`h-6 w-6 transition-all duration-700 ${open ? "scale-110" : ""}`}
              fill={open ? "currentColor" : "none"}
              fillOpacity={0.1}
            />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className={`h-1 w-1 rounded-full transition-all duration-700 ${open ? "bg-hive-amber" : "bg-white/10"}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Malla_Operacional</span>
            </div>
            <h4 className="text-xl font-black tracking-tight text-white uppercase group-hover:text-hive-amber transition-colors">Logística del Enjambre</h4>
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/10 mt-1">
              {agentCount.toString().padStart(2, '0')} NODOS_INTELIGENTES_REPORTADOS
            </div>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="hidden sm:flex -space-x-3">
            {["👤", "🎯", "🗺️", "📖"].map((emoji, i) => (
              <div key={i} className="w-10 h-10 rounded-2xl bg-[#0e131f] border border-white/[0.03] flex items-center justify-center text-base backdrop-blur-3xl shadow-lg transform group-hover:translate-y-[-4px] transition-transform" style={{ transitionDelay: `${i * 50}ms` }}>
                {emoji}
              </div>
            ))}
          </div>
          <div className={`p-3 rounded-xl transition-all duration-500 ${open ? "bg-hive-amber/10 text-hive-amber rotate-180" : "bg-white/[0.03] text-white/20"}`}>
            <ChevronDown className="h-5 w-5" />
          </div>
        </div>
      </button>

      {open && (
        <div className="px-10 pb-12 animate-in fade-in slide-in-from-top-6 duration-700 ease-out">
          {/* Editorial Divider */}
          <div className="h-px bg-white/[0.03] mb-12" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {PIPELINE_PHASES.map((phase, i) => {
              const PhaseIcon = phase.icon;
              return (
                <div key={phase.label} className="relative group/phase">
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl bg-${phase.accent}/10 text-${phase.accent} border border-white/[0.02]`}>
                        <PhaseIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <span className={`text-[10px] font-black uppercase tracking-[0.3em] text-${phase.accent}`}>
                          FASE_0{i + 1}
                        </span>
                        <h5 className="text-sm font-black text-white uppercase tracking-tight mt-0.5">{phase.label}</h5>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      {phase.agents.map((emoji, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-2xl flex items-center justify-center text-xl bg-white/[0.01] hover:bg-white/[0.04] border border-white/[0.02] transition-all duration-500 hover:scale-110 hover:-translate-y-1 cursor-default group/emoji"
                          title={`Agente ${idx + 1}`}
                        >
                          <span className="filter grayscale group-hover/emoji:grayscale-0 transition-all duration-700">{emoji}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {i < PIPELINE_PHASES.length - 1 && (
                    <div className="hidden md:block absolute -right-5 top-1/2 -translate-y-1/2">
                      <ArrowRight className="h-4 w-4 text-white/5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-12 p-6 rounded-3xl bg-white/[0.01] border border-white/[0.02] flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-2 w-2 rounded-full bg-hive-connected animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Estado_Red: OPTIMIZADO</span>
            </div>
            <div className="text-[10px] font-mono text-white/10 uppercase">HIVELEARN_CORE_PROTOCOL_V4.0</div>
          </div>
        </div>
      )}
    </div>
  );
}
