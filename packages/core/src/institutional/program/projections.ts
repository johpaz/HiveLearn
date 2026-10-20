/**
 * Proyecciones de lectura del programa.
 *
 * La verdad sigue siendo el documento `hl_personal_programs` (un programa se cambia de forma atómica, con control de
 * versión). Niveles y nodos se proyectan a colecciones propias, con índices, para poder preguntar "qué nodos cuestan
 * más en esta institución" o "cuántos niveles de refuerzo hubo" sin cargar programa por programa. Se escriben en el
 * MISMO `batch` que el programa, así nunca quedan desfasadas.
 */
import type { BatchOp, HiveDB } from '@johpaz/hive-db'
import {
  PROGRAM_LEVELS_COLLECTION, PROGRAM_NODES_COLLECTION, type PersonalProgram,
} from './program-def'

export interface LevelRow {
  programId: string; accountId: string; institutionId: string; topic: string; band: string
  index: number; kind: string; title: string; goal: string; status: string
  nodeCount: number; mastered: number; attempted: number; decision: string | null; revision: number
}

export interface NodeRow {
  programId: string; accountId: string; institutionId: string; topic: string; band: string
  levelIndex: number; levelKind: string; nodeId: string; title: string; tags: string[]
  attempts: number; correct: boolean; firstTry: boolean; mastered: boolean
  openVerdict: string | null; teacherDecision: string | null
}

export const levelRowId = (programId: string, index: number) => `${programId}:L${index}`
export const nodeRowId = (programId: string, nodeId: string) => `${programId}:${nodeId}`

export function projectProgram(program: PersonalProgram): { levels: Array<{ id: string; doc: LevelRow }>; nodes: Array<{ id: string; doc: NodeRow }> } {
  const base = { programId: program.id, accountId: program.accountId, institutionId: program.institutionId, topic: program.intent.topic.toLowerCase(), band: program.profile.ageBand }
  const levels = program.levels.map(l => ({
    id: levelRowId(program.id, l.index),
    doc: {
      ...base, index: l.index, kind: l.kind, title: l.title, goal: l.goal, status: l.status,
      nodeCount: l.nodes.length, mastered: l.nodes.filter(n => program.progress[n.id]?.mastered).length,
      attempted: l.nodes.filter(n => (program.progress[n.id]?.attempts ?? 0) > 0).length,
      decision: l.checkpoint?.decision ?? null, revision: l.revision,
    } satisfies LevelRow,
  }))
  const nodes = program.levels.flatMap(l => l.nodes.map(n => {
    const p = program.progress[n.id]
    return {
      id: nodeRowId(program.id, n.id),
      doc: {
        ...base, levelIndex: l.index, levelKind: l.kind, nodeId: n.id, title: n.title, tags: n.tags,
        attempts: p?.attempts ?? 0, correct: p?.correct ?? false, firstTry: p?.firstTry ?? false, mastered: p?.mastered ?? false,
        openVerdict: p?.open?.verdict ?? null, teacherDecision: p?.teacher?.decision ?? null,
      } satisfies NodeRow,
    }
  }))
  return { levels, nodes }
}

async function rowsOf(db: HiveDB, collection: string, programId: string): Promise<Array<{ id: string }>> {
  try { return await db.collection(collection).findBy('programId', programId) } catch { return (await db.collection(collection).scan({ prefix: `${programId}:` })) }
}

/** Operaciones de lote que dejan las proyecciones iguales al programa (escribe lo vigente y borra lo que ya no está). */
export async function projectionOps(db: HiveDB, program: PersonalProgram): Promise<BatchOp[]> {
  const { levels, nodes } = projectProgram(program)
  const ops: BatchOp[] = []
  const keepLevels = new Set(levels.map(l => l.id)), keepNodes = new Set(nodes.map(n => n.id))
  for (const l of levels) ops.push({ op: 'put', collection: PROGRAM_LEVELS_COLLECTION, id: l.id, doc: l.doc })
  for (const n of nodes) ops.push({ op: 'put', collection: PROGRAM_NODES_COLLECTION, id: n.id, doc: n.doc })
  for (const row of await rowsOf(db, PROGRAM_LEVELS_COLLECTION, program.id)) if (!keepLevels.has(row.id)) ops.push({ op: 'delete', collection: PROGRAM_LEVELS_COLLECTION, id: row.id })
  for (const row of await rowsOf(db, PROGRAM_NODES_COLLECTION, program.id)) if (!keepNodes.has(row.id)) ops.push({ op: 'delete', collection: PROGRAM_NODES_COLLECTION, id: row.id })
  return ops
}

export interface WeakNode {
  title: string
  topic: string
  students: number
  attempts: number
  firstTryRate: number
  masteryRate: number
}

/**
 * Nodos que más cuestan: agrupa por (tema, título) en la institución y ordena por menor tasa de acierto al primer
 * intento. `accountIds` acota a los alumnos de un docente.
 */
export async function weakNodes(db: HiveDB, institutionId: string, opts: { topic?: string; accountIds?: Set<string>; minStudents?: number; limit?: number } = {}): Promise<WeakNode[]> {
  const rows = (await db.collection<NodeRow>(PROGRAM_NODES_COLLECTION).findBy('institutionId', institutionId).catch(() => []))
    .map(e => e.doc)
    .filter(r => r.attempts > 0 && (!opts.topic || r.topic.includes(opts.topic.toLowerCase())) && (!opts.accountIds || opts.accountIds.has(r.accountId)))
  const groups = new Map<string, NodeRow[]>()
  for (const row of rows) {
    const key = `${row.topic}|${row.title.toLowerCase()}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()]
    .map(g => ({
      title: g[0].title, topic: g[0].topic,
      students: new Set(g.map(r => r.accountId)).size,
      attempts: g.reduce((n, r) => n + r.attempts, 0),
      firstTryRate: g.filter(r => r.firstTry).length / g.length,
      masteryRate: g.filter(r => r.mastered).length / g.length,
    }))
    .filter(w => w.students >= (opts.minStudents ?? 1))
    .sort((a, b) => a.firstTryRate - b.firstTryRate || b.attempts - a.attempts)
    .slice(0, opts.limit ?? 10)
}
