import { useRioMundoStore } from '@/store/rioMundoStore'

const AGENT_LABELS: Record<string, string> = {
  'hl-profile-agent': 'Analizando tu perfil…',
  'hl-intent-agent': 'Detectando tu intención…',
  'hl-structure-agent': 'Diseñando tu programa…',
  'hl-explanation-agent': 'Preparando explicaciones…',
  'hl-exercise-agent': 'Creando ejercicios…',
  'hl-quiz-agent': 'Diseñando quizzes…',
  'hl-challenge-agent': 'Preparando desafíos…',
  'hl-gamification-agent': 'Asignando XP y logros…',
  'hl-evaluation-agent': 'Preparando evaluación…',
  'hl-feedback-agent': 'Calibrando feedback…',
  'hl-coordinator-agent': 'Orquestando agentes…',
}

function agentToHumanLabel(agentId: string | null, fallback: string): string {
  if (!agentId) return fallback
  return AGENT_LABELS[agentId] || fallback
}

export function ProgramaProgressHUD() {
  const isGenerating = useRioMundoStore(s => s.isGenerating)
  const swarmProgress = useRioMundoStore(s => s.swarmProgress)
  const programaError = useRioMundoStore(s => s.programaError)

  if (programaError) return null
  if (!isGenerating) return null

  const pct = Math.max(5, Math.min(100, swarmProgress.percentComplete || 0))
  const label = agentToHumanLabel(swarmProgress.currentAgentId, 'Generando tu programa…')

  return (
    <div className="absolute inset-x-0 bottom-0 pb-8 pointer-events-none flex justify-center z-40">
      <div className="bg-[#0a0e27]/90 backdrop-blur-md border border-[#fbbf24]/30 rounded-2xl px-6 py-4 shadow-xl shadow-[#fbbf24]/10 w-[min(560px,90vw)]">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-3 h-3 rounded-full bg-[#fbbf24] animate-pulse" />
          <span className="text-[#fbbf24] font-bold text-sm uppercase tracking-wider">{label}</span>
          <span className="ml-auto text-[#fbbf24]/70 text-xs font-bold">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#1a1f3a] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#fbbf24] via-[#f59e0b] to-[#fbbf24] transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-[#888] text-xs text-center">
          La abeja está coordinando a los agentes para crear tu programa de aprendizaje.
        </p>
      </div>
    </div>
  )
}
