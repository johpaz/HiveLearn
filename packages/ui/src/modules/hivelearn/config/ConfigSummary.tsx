import { ArrowRight, Settings2 } from "lucide-react";

interface ConfigSummaryProps {
  providerName: string;
  modelName: string;
  agentCount: number;
}

export function ConfigSummary({ providerName, modelName, agentCount }: ConfigSummaryProps) {
  return (
    <div className="relative overflow-hidden rounded-[2.5rem] p-8 transition-all duration-700 bg-white/[0.02] backdrop-blur-3xl group/summary border border-white/[0.02]">
      {/* Editorial Gradient Accent */}
      <div className="absolute -top-32 -left-32 w-64 h-64 bg-hive-amber/5 blur-[80px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 flex items-start justify-between gap-8">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-white/[0.03] text-hive-amber">
              <Settings2 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-0.5">
                <div className="h-1 w-1 rounded-full bg-hive-amber shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">PIPELINE_ACTIVO</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-black tracking-tight text-white uppercase">{providerName}</span>
                <ArrowRight className="h-3 w-3 text-white/10" />
                <span className="text-xl font-black tracking-tight text-hive-amber uppercase">{modelName}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 pt-4 border-t border-white/[0.03]">
            <div className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/[0.02] text-[9px] font-black uppercase tracking-widest text-white/40">
              <span className="h-1.5 w-1.5 rounded-full bg-hive-connected" />
              DESPLIEGUE_ACTUALIZADO
            </div>
            <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest italic">
              {agentCount.toString().padStart(2, '0')} NODOS_CONMUTADOS
            </div>
          </div>
        </div>

        <div className="h-14 w-14 rounded-2xl bg-white/[0.02] flex items-center justify-center text-white/10 group-hover/summary:text-hive-amber transition-colors">
          <ArrowRight className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
