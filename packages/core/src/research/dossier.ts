/**
 * Dossier de investigación: afirmaciones verificables con fuentes REALES de la sesión.
 *
 * El modelo no escribe URLs ni fechas: referencia ids de fuentes que la propia sesión descargó
 * (`s1`, `s2`…), y los datos de la fuente (url, título, fecha) los pone el sistema. Así no puede inventar
 * ni alterar una fuente. La confianza "alta" exige al menos dos dominios distintos.
 */
import { createHash } from 'node:crypto'
import type { HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'
import type { AgeBand } from '../institutional/age'

export const DOSSIERS_COLLECTION = 'hl_research_dossiers'
export const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const MAX_CLAIMS = 20

export type Reliability = 'alta' | 'media' | 'baja'
export type Confidence = 'alta' | 'media' | 'baja'

export interface DossierSource { id: string; url: string; title: string; fetchedAt: string; summary: string; reliability: Reliability }
export interface DossierClaim { id: string; text: string; sourceIds: string[]; confidence: Confidence }
export interface Dossier {
  key: string
  topic: string
  language: string
  ageBand: AgeBand
  createdAt: string
  expiresAt: string
  queries: string[]
  sources: DossierSource[]
  claims: DossierClaim[]
}

/** Una fuente descargada en la sesión de investigación. */
export interface FetchedSource { id: string; url: string; title: string; fetchedAt: string }

const NO_CONTROL = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/
const text = (max: number) => z.string().trim().min(1).max(max).regex(NO_CONTROL)

const submissionSchema = z.object({
  sources: z.array(z.object({
    id: z.string().regex(/^s\d{1,3}$/),
    summary: text(500),
    reliability: z.enum(['alta', 'media', 'baja']),
  }).strict()).min(1).max(12),
  claims: z.array(z.object({
    text: text(400),
    sourceIds: z.array(z.string().regex(/^s\d{1,3}$/)).min(1).max(4),
    confidence: z.enum(['alta', 'media', 'baja']),
  }).strict()).min(1).max(MAX_CLAIMS),
}).strict()

export class DossierValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Dossier inválido: ${issues.join('; ')}`)
    this.name = 'DossierValidationError'
  }
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

/** Valida lo que entrega el modelo contra las fuentes realmente descargadas. Devuelve fuentes y afirmaciones. */
export function buildDossierContent(input: unknown, fetched: FetchedSource[]): { sources: DossierSource[]; claims: DossierClaim[]; downgraded: number } {
  const parsed = submissionSchema.safeParse(input)
  if (!parsed.success) {
    throw new DossierValidationError(parsed.error.issues.map(issue => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`))
  }
  const byId = new Map(fetched.map(source => [source.id, source]))
  const issues: string[] = []

  const seen = new Set<string>()
  const sources: DossierSource[] = []
  for (const declared of parsed.data.sources) {
    const real = byId.get(declared.id)
    if (!real) { issues.push(`la fuente "${declared.id}" no fue descargada con safe_web_fetch en esta investigación`); continue }
    if (seen.has(declared.id)) { issues.push(`fuente repetida "${declared.id}"`); continue }
    seen.add(declared.id)
    sources.push({ ...real, summary: declared.summary, reliability: declared.reliability })
  }

  let downgraded = 0
  const claims: DossierClaim[] = []
  parsed.data.claims.forEach((claim, index) => {
    const unknown = claim.sourceIds.filter(id => !seen.has(id))
    if (unknown.length) { issues.push(`afirmación ${index + 1}: cita fuentes no declaradas (${unknown.join(', ')})`); return }
    const domains = new Set(claim.sourceIds.map(id => hostOf(byId.get(id)!.url)))
    let confidence: Confidence = claim.confidence
    if (confidence === 'alta' && domains.size < 2) { confidence = 'media'; downgraded++ }
    claims.push({ id: `c${index + 1}`, text: claim.text, sourceIds: [...new Set(claim.sourceIds)], confidence })
  })
  if (issues.length) throw new DossierValidationError(issues)
  return { sources, claims, downgraded }
}

export function dossierKey(topic: string, language: string, band: AgeBand): string {
  const normalized = topic.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(`${normalized}|${language.toLowerCase()}|${band}`).digest('hex').slice(0, 16)
}

export function dossierDocId(dossier: Pick<Dossier, 'key' | 'createdAt'>): string {
  return `${dossier.key}@${dossier.createdAt}`
}

export async function saveDossier(db: HiveDB, dossier: Dossier): Promise<string> {
  const id = dossierDocId(dossier)
  await db.collection<Dossier>(DOSSIERS_COLLECTION).put(id, dossier, { expectedVersion: 0 })
  return id
}

/** El dossier vigente más reciente para esa clave, o null si no hay o ya venció. */
export async function findFreshDossier(db: HiveDB, key: string, now = Date.now()): Promise<Dossier | null> {
  const entries = await db.collection<Dossier>(DOSSIERS_COLLECTION).scan({ prefix: `${key}@` })
  const fresh = entries.map(entry => entry.doc).filter(doc => Date.parse(doc.expiresAt) > now)
  fresh.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return fresh[0] ?? null
}

/** Texto compacto para el Arquitecto y los autores: cada afirmación con las URLs de sus fuentes. */
export function dossierToText(dossier: Dossier): string {
  const urlOf = new Map(dossier.sources.map(source => [source.id, source.url]))
  const lines = dossier.claims.map(claim =>
    `[${claim.id}] (${claim.confidence}) ${claim.text} — fuentes: ${claim.sourceIds.map(id => urlOf.get(id)).join(', ')}`)
  return [`Tema: ${dossier.topic}`, `Vigente hasta: ${dossier.expiresAt}`, ...lines].join('\n')
}
