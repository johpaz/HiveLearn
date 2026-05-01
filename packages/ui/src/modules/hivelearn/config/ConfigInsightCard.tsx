import { LucideIcon } from "lucide-react";

interface ConfigInsightCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  theme: "amber" | "cyan" | "purple" | "blue";
}

const themeMap = {
  amber: {
    accent: "text-hive-amber",
    bg: "bg-hive-amber/10",
    glow: "bg-hive-amber/5",
  },
  cyan: {
    accent: "text-hive-cyan",
    bg: "bg-hive-cyan/10",
    glow: "bg-hive-cyan/5",
  },
  purple: {
    accent: "text-hive-purple",
    bg: "bg-hive-purple/10",
    glow: "bg-hive-purple/5",
  },
  blue: {
    accent: "text-hive-blue",
    bg: "bg-hive-blue/10",
    glow: "bg-hive-blue/5",
  }
};

export function ConfigInsightCard({ icon: Icon, title, description, theme }: ConfigInsightCardProps) {
  const styles = themeMap[theme] || themeMap.amber;

  return (
    <div className="group relative rounded-[2rem] p-8 transition-all duration-700 hover:-translate-y-1 bg-white/[0.01] backdrop-blur-3xl border border-white/[0.02] overflow-hidden">
      {/* Ambient hover glow */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none blur-[60px] ${styles.glow}`} />

      <div className="relative z-10 space-y-6">
        <div className="flex items-center gap-5">
          <div className={`p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] transition-all duration-700 ${styles.accent} group-hover:scale-110`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className={`h-1 w-1 rounded-full ${styles.accent.replace('text-', 'bg-')} shadow-[0_0_8px_currentColor]`} />
              <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20">Protocol_Insight</span>
            </div>
            <h5 className="text-xs font-black uppercase tracking-[0.2em] text-white/80 group-hover:text-white transition-colors">
              {title}
            </h5>
          </div>
        </div>
        
        <p className="text-[11px] leading-relaxed font-medium text-white/30 group-hover:text-white/50 transition-colors duration-700 italic">
          {description}
        </p>
      </div>

      {/* Decorative corner accent */}
      <div className={`absolute top-0 right-0 w-24 h-24 opacity-[0.03] transition-opacity group-hover:opacity-[0.07] blur-3xl rounded-full ${styles.glow.replace('/5', '/20')}`} />
    </div>
  );
}
