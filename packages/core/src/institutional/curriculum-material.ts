/**
 * Material de una competencia de cualquier currículo: la base sale de la definición (objetivo, evidencia,
 * fuentes, orientación por edad) y la explicación la redacta el especialista y se guarda en caché por
 * (contenido, nodo, banda). Si no hay explicación, la base basta: el alumno nunca se queda sin pantalla.
 */
import type { HiveDB } from '@johpaz/hive-db'
import { AGE_GUIDANCE, type CurriculumDef } from './curriculum-def'
import type { AgeBand } from './age'

export const MATERIALS_COLLECTION = 'hl_node_materials'
const docId = (def: Pick<CurriculumDef, 'id' | 'hash'>, nodeId: string, band: AgeBand) => `${def.id}@${def.hash.slice(0, 12)}:${nodeId}:${band}`

export interface NodeMaterial {
  title: string
  objective: string
  explanation: string
  practice: string
  sources: Array<{ key: string; url: string }>
  generated: boolean
}

export async function cachedExplanation(db: HiveDB, def: Pick<CurriculumDef, 'id' | 'hash'>, nodeId: string, band: AgeBand): Promise<string | null> {
  return (await db.collection<{ text: string }>(MATERIALS_COLLECTION).get(docId(def, nodeId, band)))?.doc.text ?? null
}

export async function saveExplanation(db: HiveDB, def: Pick<CurriculumDef, 'id' | 'hash'>, nodeId: string, band: AgeBand, text: string): Promise<void> {
  const col = db.collection<{ text: string; createdAt: string }>(MATERIALS_COLLECTION)
  const id = docId(def, nodeId, band)
  const existing = await col.get(id)
  await col.put(id, { text, createdAt: new Date().toISOString() }, { expectedVersion: existing?.version ?? 0 }).catch(() => {})
}

export async function nodeMaterial(db: HiveDB, def: CurriculumDef, nodeId: string, band: AgeBand): Promise<NodeMaterial> {
  const node = def.nodes.find(n => n.id === nodeId)
  if (!node) throw new Error('Competencia no encontrada')
  const cached = await cachedExplanation(db, def, nodeId, band)
  const guidance = AGE_GUIDANCE[band]
  return {
    title: node.title,
    objective: node.objective,
    explanation: cached ?? `${node.objective} Cuando lo logres podrás mostrarlo así: ${node.evidence}`,
    practice: `Demuestra con tus palabras: ${node.evidence} Incluye un ejemplo propio y menciona un límite o un caso donde no funcione. ${guidance.supervision}`,
    sources: node.sources.map(key => ({ key, url: def.sources[key] })).filter(s => !!s.url),
    generated: cached !== null,
  }
}
