/**
 * Guardas deterministas de la adaptación del plan.
 *
 * Los agentes (y el docente) NO regeneran el plan: proponen un parche de operaciones y esta función decide, una por una,
 * cuáles se aplican. Nada que dependa del modelo puede saltarse estas reglas:
 *  - lo ya cursado es inmutable (niveles cerrados y el activo, y cualquier nodo con intentos);
 *  - topes duros de niveles, nodos y revisiones;
 *  - ids únicos en todo el programa y nodos bien formados (misma validación que un currículo);
 *  - un parche que deja un nivel fuera de rango se rechaza entero para ese nivel.
 */
import { z } from 'zod'
import {
  PROGRAM_LIMITS, nodeSchema, allNodeIds, totalNodes,
  type PersonalProgram, type ProgramLevel, type ProgramNode, type ProgramRevision,
} from './program-def'
import { allowedNodes } from './sizing'

const levelText = z.string().trim().min(1).max(160)

export const adaptationOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_level_plan'), levelIndex: z.number().int().min(0), title: levelText, goal: z.string().trim().min(1).max(300), plannedNodes: z.number().int().min(1).max(PROGRAM_LIMITS.maxNodesPerLevel) }).strict(),
  z.object({ op: z.literal('materialize_level'), levelIndex: z.number().int().min(0), nodes: z.array(nodeSchema).min(1).max(PROGRAM_LIMITS.maxNodesPerLevel) }).strict(),
  z.object({ op: z.literal('add_node'), levelIndex: z.number().int().min(0), node: nodeSchema }).strict(),
  z.object({ op: z.literal('drop_unstarted_node'), levelIndex: z.number().int().min(0), nodeId: z.string().min(1).max(48) }).strict(),
  z.object({ op: z.literal('reorder'), levelIndex: z.number().int().min(0), nodeIds: z.array(z.string().min(1).max(48)).min(2).max(PROGRAM_LIMITS.maxNodesPerLevel) }).strict(),
  z.object({ op: z.literal('retitle'), levelIndex: z.number().int().min(0), title: levelText }).strict(),
  z.object({ op: z.literal('add_reinforcement_level'), afterLevel: z.number().int().min(0), title: levelText, goal: z.string().trim().min(1).max(300), nodes: z.array(nodeSchema).min(1).max(PROGRAM_LIMITS.maxNodesPerLevel) }).strict(),
])
export type AdaptationOp = z.infer<typeof adaptationOpSchema>

export interface RejectedOp { op: string; reason: string }
export interface AdaptationResult {
  program: PersonalProgram
  applied: Array<{ op: string; detail: string }>
  rejected: RejectedOp[]
}

const clone = <T>(value: T): T => structuredClone(value)

/** Un nodo con intentos ya forma parte de la historia del alumno: no se toca. */
const started = (program: PersonalProgram, nodeId: string) => (program.progress[nodeId]?.attempts ?? 0) > 0

/**
 * Un nivel se puede adaptar si aún no se cursa: es posterior al actual, o es el actual y nadie ha intentado ninguno de
 * sus nodos (p. ej. quedó sin contenido). Un nivel cerrado o con intentos es historia del alumno.
 */
function editable(program: PersonalProgram, level: ProgramLevel): boolean {
  if (level.status === 'closed') return false
  if (level.index > program.currentLevel) return true
  return level.index === program.currentLevel && level.nodes.every(n => !started(program, n.id))
}

function renumber(levels: ProgramLevel[]): void {
  levels.forEach((level, i) => { level.index = i })
}

export function applyAdaptation(input: PersonalProgram, rawOps: unknown[], opts: { actor: 'agent' | 'teacher' | 'system'; reason: string; now?: Date }): AdaptationResult {
  const program = clone(input)
  const applied: AdaptationResult['applied'] = []
  const rejected: RejectedOp[] = []
  const now = (opts.now ?? new Date()).toISOString()
  const revisionsThisLevel = new Map<number, number>()
  for (const r of program.revisions) revisionsThisLevel.set(r.levelIndex, (revisionsThisLevel.get(r.levelIndex) ?? 0) + 1)

  const reject = (op: string, reason: string) => rejected.push({ op, reason })

  for (const raw of rawOps) {
    const parsed = adaptationOpSchema.safeParse(raw)
    if (!parsed.success) { reject(String((raw as { op?: unknown })?.op ?? 'desconocida'), parsed.error.issues.map(i => `${i.path.join('.') || 'op'}: ${i.message}`).join('; ').slice(0, 200)); continue }
    const op = parsed.data

    if (program.revisions.length + applied.length >= PROGRAM_LIMITS.maxRevisions) { reject(op.op, 'se alcanzó el tope de revisiones del programa'); continue }

    const targetIndex = op.op === 'add_reinforcement_level' ? op.afterLevel : (op as { levelIndex: number }).levelIndex
    const target = program.levels[targetIndex]
    if (!target) { reject(op.op, 'el nivel no existe'); continue }

    if (op.op === 'add_reinforcement_level') {
      if (program.levels.length >= PROGRAM_LIMITS.maxLevels) { reject(op.op, `máximo ${PROGRAM_LIMITS.maxLevels} niveles`); continue }
      // El refuerzo va justo después del nivel indicado, nunca antes de lo ya cursado.
      if (op.afterLevel < program.currentLevel) { reject(op.op, 'no se puede insertar antes del nivel actual'); continue }
      if (totalNodes(program.levels) + op.nodes.length > PROGRAM_LIMITS.maxNodesTotal) { reject(op.op, `máximo ${PROGRAM_LIMITS.maxNodesTotal} nodos en el programa`); continue }
      const ids = allNodeIds(program.levels)
      const dup = op.nodes.find(n => ids.has(n.id)) ?? op.nodes.find((n, i) => op.nodes.findIndex(m => m.id === n.id) !== i)
      if (dup) { reject(op.op, `id de nodo repetido: ${dup.id}`); continue }
      const level: ProgramLevel = { index: op.afterLevel + 1, kind: 'reinforcement', title: op.title, goal: op.goal, status: 'outline', plannedNodes: op.nodes.length, nodes: op.nodes, revision: 0 }
      program.levels.splice(op.afterLevel + 1, 0, level)
      renumber(program.levels)
      applied.push({ op: op.op, detail: `refuerzo "${op.title}" tras el nivel ${op.afterLevel + 1}` })
      continue
    }

    const level = target
    if (!editable(program, level)) { reject(op.op, `el nivel ${level.index + 1} ya se cursa o está cerrado`); continue }
    if (level.kind === 'final' && !['retitle', 'materialize_level', 'set_level_plan'].includes(op.op)) { reject(op.op, 'la evaluación final solo se materializa o se retitula'); continue }
    if ((revisionsThisLevel.get(level.index) ?? 0) >= PROGRAM_LIMITS.maxRevisionsPerLevel && opts.actor === 'agent') {
      reject(op.op, `máximo ${PROGRAM_LIMITS.maxRevisionsPerLevel} adaptaciones por nivel`); continue
    }

    const bounds = allowedNodes(program.sizing, level.index)
    const others = new Set([...allNodeIds(program.levels)].filter(id => !level.nodes.some(n => n.id === id)))
    const fits = (nodes: ProgramNode[]) => nodes.length >= bounds.min && nodes.length <= bounds.max
      && totalNodes(program.levels) - level.nodes.length + nodes.length <= PROGRAM_LIMITS.maxNodesTotal

    switch (op.op) {
      case 'set_level_plan': {
        if (level.nodes.length > 0) { reject(op.op, 'el nivel ya tiene nodos; usa add_node o drop_unstarted_node'); break }
        level.title = op.title; level.goal = op.goal
        level.plannedNodes = Math.min(Math.max(op.plannedNodes, bounds.min), bounds.max)
        level.revision++
        applied.push({ op: op.op, detail: `nivel ${level.index + 1}: "${op.title}" (${level.plannedNodes} nodos)` })
        break
      }
      case 'materialize_level': {
        const dup = op.nodes.find(n => others.has(n.id)) ?? op.nodes.find((n, i) => op.nodes.findIndex(m => m.id === n.id) !== i)
        if (dup) { reject(op.op, `id de nodo repetido: ${dup.id}`); break }
        if (!fits(op.nodes)) { reject(op.op, `el nivel admite entre ${bounds.min} y ${bounds.max} nodos`); break }
        level.nodes = op.nodes
        level.plannedNodes = op.nodes.length
        level.revision++
        applied.push({ op: op.op, detail: `nivel ${level.index + 1}: ${op.nodes.length} nodos` })
        break
      }
      case 'add_node': {
        if (others.has(op.node.id) || level.nodes.some(n => n.id === op.node.id)) { reject(op.op, `id de nodo repetido: ${op.node.id}`); break }
        const next = [...level.nodes, op.node]
        if (next.length > bounds.max || totalNodes(program.levels) + 1 > PROGRAM_LIMITS.maxNodesTotal) { reject(op.op, `el nivel admite hasta ${bounds.max} nodos`); break }
        level.nodes = next; level.plannedNodes = next.length; level.revision++
        applied.push({ op: op.op, detail: `nivel ${level.index + 1}: + ${op.node.title}` })
        break
      }
      case 'drop_unstarted_node': {
        const node = level.nodes.find(n => n.id === op.nodeId)
        if (!node) { reject(op.op, 'el nodo no existe en ese nivel'); break }
        if (started(program, node.id)) { reject(op.op, 'el nodo ya tiene intentos'); break }
        const next = level.nodes.filter(n => n.id !== op.nodeId)
        if (next.length < bounds.min) { reject(op.op, `el nivel necesita al menos ${bounds.min} nodos`); break }
        level.nodes = next; level.plannedNodes = next.length; level.revision++
        applied.push({ op: op.op, detail: `nivel ${level.index + 1}: − ${node.title}` })
        break
      }
      case 'reorder': {
        const same = op.nodeIds.length === level.nodes.length && new Set(op.nodeIds).size === op.nodeIds.length && op.nodeIds.every(id => level.nodes.some(n => n.id === id))
        if (!same) { reject(op.op, 'el orden debe incluir exactamente los nodos del nivel'); break }
        level.nodes = op.nodeIds.map(id => level.nodes.find(n => n.id === id)!)
        level.revision++
        applied.push({ op: op.op, detail: `nivel ${level.index + 1}: nuevo orden` })
        break
      }
      case 'retitle': {
        level.title = op.title; level.revision++
        applied.push({ op: op.op, detail: `nivel ${level.index + 1}: "${op.title}"` })
        break
      }
    }
    if (applied.length) revisionsThisLevel.set(level.index, (revisionsThisLevel.get(level.index) ?? 0) + 1)
  }

  if (applied.length) {
    const revision: ProgramRevision = {
      at: now, levelIndex: Math.min(program.currentLevel + 1, program.levels.length - 1), actor: opts.actor,
      reason: opts.reason.slice(0, 300), ops: applied.map(a => ({ op: a.op, detail: a.detail.slice(0, 200) })),
    }
    program.revisions.push(revision)
    program.updatedAt = now
  }
  return { program, applied, rejected }
}
