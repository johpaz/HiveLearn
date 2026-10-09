import { ageBandForAge, saveDiagnostic } from './store'
import type { AIDiagnostic, CompetencyEvidence, ProgressionLevel } from './types'

export interface DiagnosticAnswer { competency: CompetencyEvidence['competency']; score: number; evidence: string }

function levelForScore(score: number): ProgressionLevel {
  if (score < 25) return 'fundamentos'
  if (score < 45) return 'usuario_responsable'
  if (score < 65) return 'aplicador'
  if (score < 82) return 'constructor'
  return 'creador_avanzado'
}

export async function createDiagnostic(input: { id: string; studentId: string; institutionId: string; age: number; curriculumVersion?: string; answers: DiagnosticAnswer[] }): Promise<AIDiagnostic> {
  const evidence = input.answers.map(answer => ({ ...answer, score: Math.max(0, Math.min(100, Number(answer.score))), source: 'diagnostic' as const }))
  const score = evidence.length ? evidence.reduce((sum, item) => sum + item.score, 0) / evidence.length : 0
  const diagnostic: AIDiagnostic = { id: input.id, studentId: input.studentId, institutionId: input.institutionId, ageBand: ageBandForAge(input.age), recommendedLevel: levelForScore(score), evidence, completedAt: new Date().toISOString(), curriculumVersion: input.curriculumVersion ?? 'unesco-ai-v1' }
  await saveDiagnostic(diagnostic)
  return diagnostic
}

export const LEVEL_CATALOG: Array<{ id: ProgressionLevel; title: string; description: string }> = [
  { id: 'fundamentos', title: 'Fundamentos', description: 'Entender qué es la IA, sus usos, límites y vocabulario.' },
  { id: 'usuario_responsable', title: 'Usuario responsable', description: 'Usar IA con verificación, privacidad y criterio ético.' },
  { id: 'aplicador', title: 'Aplicador', description: 'Resolver problemas reales con flujos y herramientas de IA.' },
  { id: 'constructor', title: 'Constructor', description: 'Diseñar prototipos, agentes y evaluaciones sencillas.' },
  { id: 'creador_avanzado', title: 'Creador avanzado', description: 'Definir, evaluar y mejorar sistemas de IA con ética por diseño.' },
]
