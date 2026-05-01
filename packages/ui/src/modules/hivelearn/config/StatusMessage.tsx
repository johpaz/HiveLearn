import { CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";

interface StatusMessageProps {
  type: "success" | "error" | "loading" | "info";
  message: string;
}

export function StatusMessage({ type, message }: StatusMessageProps) {
  const baseStyles = "flex items-center gap-4 px-5 py-4 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all duration-700 animate-in fade-in slide-in-from-top-2 relative overflow-hidden";
  
  if (type === "loading") {
    return (
      <div className={`${baseStyles} bg-card/50 backdrop-blur-xl text-white/40`}>
        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-hive-amber" />
        <span className="relative z-10 italic">Sincronizando con el Enjambre...</span>
      </div>
    );
  }

  if (type === "success") {
    return (
      <div className={`${baseStyles} bg-hive-connected/5 backdrop-blur-xl text-hive-connected`}>
        {/* Ambient Glow */}
        <div className="absolute inset-0 bg-hive-connected/5 blur-xl pointer-events-none" />
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 relative z-10" />
        <span className="leading-tight relative z-10">{message}</span>
      </div>
    );
  }

  if (type === "error") {
    return (
      <div className={`${baseStyles} bg-hive-red/5 backdrop-blur-xl text-hive-red`}>
        {/* Ambient Glow */}
        <div className="absolute inset-0 bg-hive-red/5 blur-xl pointer-events-none" />
        <AlertCircle className="h-4 w-4 flex-shrink-0 relative z-10" />
        <span className="leading-tight relative z-10">{message}</span>
      </div>
    );
  }

  return (
    <div className={`${baseStyles} bg-white/[0.03] backdrop-blur-xl text-white/60`}>
      <Info className="h-4 w-4 flex-shrink-0 relative z-10" />
      <span className="leading-tight relative z-10">{message}</span>
    </div>
  );
}
