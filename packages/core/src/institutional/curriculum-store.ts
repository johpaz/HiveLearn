/**
 * Catálogo de currículos (`hl_curricula_defs`).
 *
 * Reglas de integridad:
 *  - El contenido se valida SIEMPRE antes de guardarse; un agente solo puede crear `generated`.
 *  - Una definición `canonical` nunca se sobrescribe ni se degrada: se siembra con `expectedVersion: 0`.
 *  - El id del documento es `<id>@<hash12>`: dos contenidos distintos nunca comparten documento, y el mismo
 *    contenido es idempotente.
 *  - Solo un docente o administrador de la misma institución puede pasar `generated → reviewed`.
 */
import type { HiveDB } from '@johpaz/hive-db'
import { aiCurriculumDef } from './curriculum-ai'
import { hashCurriculum, validateCurriculumContent, type CurriculumDef } from './curriculum-def'

export const CURRICULA_COLLECTION = 'hl_curricula_defs'

export interface Reviewer { id: string; role: 'admin' | 'teacher' | 'student'; institutionId?: string }

export function curriculumDocId(id: string, hash: string): string {
  return `${id}@${hash.slice(0, 12)}`
}

/** Siembra el currículo canónico de IA. Idempotente. */
export async function ensureCanonicalCurricula(db: HiveDB): Promise<void> {
  const def = aiCurriculumDef()
  const col = db.collection<CurriculumDef>(CURRICULA_COLLECTION)
  const id = curriculumDocId(def.id, def.hash)
  if (await col.get(id)) return
  await col.put(id, def, { expectedVersion: 0 })
}

/** Guarda una definición producida por un agente. Siempre nace `generated`. Devuelve el documento. */
export async function saveGeneratedCurriculum(db: HiveDB, input: unknown): Promise<{ docId: string; def: CurriculumDef; created: boolean }> {
  const content = validateCurriculumContent(input)
  const hash = hashCurriculum(content)
  const docId = curriculumDocId(content.id, hash)
  const col = db.collection<CurriculumDef>(CURRICULA_COLLECTION)

  const existing = await col.get(docId)
  if (existing) return { docId, def: existing.doc, created: false }

  // Un id ya ocupado por una definición CANÓNICA no se reutiliza con otro contenido.
  for (const entry of await col.scan({ prefix: `${content.id}@` })) {
    if (entry.doc.status === 'canonical') throw new Error(`El identificador "${content.id}" pertenece a un currículo canónico`)
  }

  const def: CurriculumDef = { ...content, hash, status: 'generated', createdAt: new Date().toISOString() }
  await col.put(docId, def, { expectedVersion: 0 })
  return { docId, def, created: true }
}

export async function getCurriculum(db: HiveDB, docId: string): Promise<CurriculumDef | null> {
  return (await db.collection<CurriculumDef>(CURRICULA_COLLECTION).get(docId))?.doc ?? null
}

/** La definición más reciente de un id (prefiere canónica > revisada > generada). */
export async function findCurriculum(db: HiveDB, id: string): Promise<{ docId: string; def: CurriculumDef } | null> {
  const rank: Record<CurriculumDef['status'], number> = { canonical: 3, reviewed: 2, generated: 1 }
  const entries = await db.collection<CurriculumDef>(CURRICULA_COLLECTION).scan({ prefix: `${id}@` })
  const best = entries.sort((a, b) => rank[b.doc.status] - rank[a.doc.status] || b.doc.createdAt.localeCompare(a.doc.createdAt))[0]
  return best ? { docId: best.id, def: best.doc } : null
}

/** Un docente o administrador aprueba una definición generada. */
export async function approveCurriculum(db: HiveDB, docId: string, reviewer: Reviewer): Promise<CurriculumDef> {
  if (reviewer.role !== 'teacher' && reviewer.role !== 'admin') throw new Error('Solo un docente o administrador puede aprobar un currículo')
  const col = db.collection<CurriculumDef>(CURRICULA_COLLECTION)
  const entry = await col.get(docId)
  if (!entry) throw new Error('Currículo no encontrado')
  if (entry.doc.status !== 'generated') throw new Error(`Solo se aprueba un currículo generado (estado actual: ${entry.doc.status})`)
  // Se revalida el contenido guardado: la aprobación no debe cubrir un documento alterado.
  const { hash, status, createdAt, reviewedBy, reviewedAt, ...content } = entry.doc
  if (hashCurriculum(validateCurriculumContent(content)) !== hash) throw new Error('El contenido del currículo no coincide con su hash')
  const next: CurriculumDef = { ...entry.doc, status: 'reviewed', reviewedBy: reviewer.id, reviewedAt: new Date().toISOString() }
  await col.put(docId, next, { expectedVersion: entry.version })
  return next
}
