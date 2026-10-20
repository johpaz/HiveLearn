/**
 * Planificador y adaptador deterministas para los E2E. La opción correcta de toda pregunta es la B (índice 1);
 * la A (índice 0) es siempre incorrecta, así que una prueba decide si acierta o falla sin conocer la clave.
 */
import type { AdapterFn, PlannerFn } from '../../packages/core/src/agent/program-architect'
import type { ProgramNode } from '../../packages/core/src/institutional/program/program-def'
import type { EngineDeps } from '../../packages/core/src/institutional/program/engine'

export const CORRECT = 1
export const WRONG = 0

const node = (id: string, title: string): ProgramNode => ({
  id, title, objective: `Entender ${title.toLowerCase()}`, evidence: `Explica ${title.toLowerCase()} con un ejemplo propio`, tags: ['sql'],
  question: { prompt: `¿Qué describe mejor «${title}»?`, options: ['Una idea errónea', 'La idea correcta', 'Otra idea errónea'], correct: CORRECT },
})

export const LEVEL_SIZE = 3
const nodes = (prefix: string, names: string[]) => names.map((name, i) => node(`${prefix}${i + 1}`, name))

export const FIRST_LEVEL_IDS = ['f1', 'f2', 'f3']

const plan = {
  objective: 'Al terminar podrá consultar y filtrar datos con SQL en su trabajo.',
  levels: [
    { title: 'Fundamentos', goal: 'Entiende tablas y SELECT', plannedNodes: LEVEL_SIZE },
    { title: 'Filtrar y ordenar', goal: 'Usa WHERE y ORDER BY', plannedNodes: LEVEL_SIZE },
    { title: 'Evaluación final', goal: 'Integra todo', plannedNodes: LEVEL_SIZE },
  ],
  firstLevelNodes: nodes('f', ['Tablas y filas', 'La consulta SELECT', 'Columnas y alias']),
}

export interface FakeLog { planned: number; adapted: Array<{ decision: string; level: number }> }

export function fakeProgramDeps(log: FakeLog = { planned: 0, adapted: [] }): Partial<EngineDeps> & { log: FakeLog } {
  const planner: PlannerFn = async () => { log.planned++; return plan }
  const adapter: AdapterFn = async input => {
    const current = input.program.currentLevel
    log.adapted.push({ decision: input.decision, level: current })
    const next = input.program.levels[current + 1]
    return {
      reason: input.decision === 'hold' ? 'Conviene reforzar antes de seguir.' : 'Dominaste el nivel.',
      ops: [
        ...(input.decision === 'hold' ? [{
          op: 'add_reinforcement_level' as const, afterLevel: current, title: 'Refuerzo', goal: 'Afianzar lo anterior',
          nodes: nodes(`r${current}-`, ['Repaso de la consulta', 'Repaso de las columnas']),
        }] : []),
        ...(next && input.decision !== 'hold' ? [{
          op: 'materialize_level' as const, levelIndex: next.index,
          nodes: nodes(`n${next.index}-`, next.kind === 'final' ? ['Caso integrador 1', 'Caso integrador 2', 'Caso integrador 3'] : ['Filtrar con WHERE', 'Ordenar con ORDER BY', 'Combinar condiciones']),
        }] : []),
      ],
    }
  }
  return { planner, adapter, kev: async () => null, log }
}
