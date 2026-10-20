/**
 * Guía: lo que funcionó y lo que no en programas anteriores del mismo tema y banda de edad.
 *
 * - Al cerrar un programa COMPLETADO se destila un resumen determinista y SIN datos personales (nada de nombres ni
 *   ids de cuenta) y se agrega por `tema|banda|idioma` en `hl_program_guides`.
 * - La recuperación usa la búsqueda híbrida de HiveDB (BM25 y, si el embedder local está activo, significado) con
 *   filtros escalares: "excel para ventas" encuentra la guía de "tablas dinámicas en Excel" aunque el texto difiera.
 * - Solo se usa una guía agregada de al menos `MIN_PROGRAMS` programas (k-anonimato): un alumno nunca puede
 *   reconocerse a sí mismo ni a otro en lo que recibe el Arquitecto.
 */
import type { HiveDB } from '@johpaz/hive-db'
import type { PersonalProgram } from './program-def'

export const GUIDES_COLLECTION = 'hl_program_guides'
export const MIN_PROGRAMS = 3
const MAX_TAGS = 8

export interface ProgramGuide {
  key: string
  topic: string
  band: string
  language: string
  programs: number
  /** Suma para calcular promedios sin guardar programas individuales. */
  totals: { levels: number; nodes: number; mastered: number; attempts: number; reinforcements: number; firstTry: number }
  weakTags: Record<string, number>
  strongTags: Record<string, number>
  updatedAt: string
}

export const topicKey = (topic: string) => topic.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'libre'
export const guideKey = (topic: string, band: string, language: string) => `${topicKey(topic)}|${band}|${language}`

/** Aporte de UN programa completado, sin identidad. */
export function distillProgram(program: PersonalProgram): Pick<ProgramGuide, 'totals' | 'weakTags' | 'strongTags'> {
  const nodes = program.levels.flatMap(l => l.nodes)
  const weakTags: Record<string, number> = {}
  const strongTags: Record<string, number> = {}
  let mastered = 0, attempts = 0, firstTry = 0
  for (const node of nodes) {
    const p = program.progress[node.id]
    if (!p) continue
    attempts += p.attempts
    if (p.mastered) mastered++
    if (p.firstTry) firstTry++
    const bucket = p.firstTry ? strongTags : (p.attempts >= 2 || !p.mastered) ? weakTags : null
    if (bucket) for (const tag of node.tags.length ? node.tags : [node.id]) bucket[tag] = (bucket[tag] ?? 0) + 1
  }
  return {
    totals: {
      levels: program.levels.length, nodes: nodes.length, mastered, attempts, firstTry,
      reinforcements: program.levels.filter(l => l.kind === 'reinforcement').length,
    },
    weakTags, strongTags,
  }
}

function mergeTags(into: Record<string, number>, add: Record<string, number>): Record<string, number> {
  const merged = { ...into }
  for (const [tag, n] of Object.entries(add)) merged[tag] = (merged[tag] ?? 0) + n
  return Object.fromEntries(Object.entries(merged).sort((a, b) => b[1] - a[1]).slice(0, 24))
}

export class ProgramGuides {
  constructor(private readonly db: HiveDB) {}

  private col() { return this.db.collection<ProgramGuide>(GUIDES_COLLECTION) }

  /** Suma el aporte de un programa completado y reindexa la guía para la búsqueda. */
  async record(program: PersonalProgram): Promise<ProgramGuide | null> {
    if (program.closeReason !== 'completed') return null
    const key = guideKey(program.intent.topic, program.profile.ageBand, program.language)
    const add = distillProgram(program)
    const now = new Date().toISOString()
    let guide: ProgramGuide | null = null
    for (let attempt = 0; attempt < 4 && !guide; attempt++) {
      const entry = await this.col().get(key)
      const base: ProgramGuide = entry?.doc ?? {
        key, topic: topicKey(program.intent.topic), band: program.profile.ageBand, language: program.language, programs: 0,
        totals: { levels: 0, nodes: 0, mastered: 0, attempts: 0, reinforcements: 0, firstTry: 0 }, weakTags: {}, strongTags: {}, updatedAt: now,
      }
      const next: ProgramGuide = {
        ...base,
        programs: base.programs + 1,
        totals: Object.fromEntries(Object.entries(base.totals).map(([k, v]) => [k, v + add.totals[k as keyof typeof add.totals]])) as ProgramGuide['totals'],
        weakTags: mergeTags(base.weakTags, add.weakTags),
        strongTags: mergeTags(base.strongTags, add.strongTags),
        updatedAt: now,
      }
      try {
        await this.col().put(key, next, { expectedVersion: entry?.version ?? 0 })
        guide = next
      } catch { /* conflicto de versión: se relee */ }
    }
    if (guide) await this.index(guide, program.intent.topic)
    return guide
  }

  /** Documento de búsqueda: nombre = tema; cuerpo = metas y etiquetas; filtros = tipo, banda e idioma. */
  private async index(guide: ProgramGuide, rawTopic: string): Promise<void> {
    const weak = Object.keys(guide.weakTags).slice(0, MAX_TAGS).join(' ')
    const strong = Object.keys(guide.strongTags).slice(0, MAX_TAGS).join(' ')
    await this.db.upsertDoc({
      id: `guide:${guide.key}`,
      name: rawTopic.slice(0, 120),
      body: `Guía de programas completados sobre ${rawTopic}. Cuesta: ${weak}. Funciona: ${strong}.`,
      tags: `${guide.topic} ${weak} ${strong}`.slice(0, 400),
      filters: [{ field: 'kind', value: 'program_guide' }, { field: 'band', value: guide.band }, { field: 'language', value: guide.language }],
    }).catch(() => undefined)
  }

  /**
   * Guías relevantes para un tema. Primero la clave exacta; si no hay, búsqueda híbrida con filtros de banda e idioma.
   * Devuelve un texto breve (≤ 800 caracteres) o `undefined` si no hay evidencia suficiente.
   */
  async brief(topic: string, band: string, language: string): Promise<string | undefined> {
    const exact = (await this.col().get(guideKey(topic, band, language)))?.doc
    let guides: ProgramGuide[] = exact ? [exact] : []
    if (guides.length === 0) {
      const hits = await this.db.queryHybrid({
        text: topic, k: 3,
        filters: [{ field: 'kind', value: 'program_guide' }, { field: 'band', value: band }, { field: 'language', value: language }],
      }).catch(() => [])
      for (const hit of hits) {
        const doc = (await this.col().get(hit.id.replace(/^guide:/, '')))?.doc
        if (doc) guides.push(doc)
      }
    }
    const usable = guides.filter(g => g.programs >= MIN_PROGRAMS)
    if (usable.length === 0) return undefined
    return usable.map(describeGuide).join('\n').slice(0, 800)
  }
}

export function describeGuide(g: ProgramGuide): string {
  const t = g.totals
  const avgNodes = (t.nodes / g.programs).toFixed(1)
  const mastery = t.nodes ? Math.round((t.mastered / t.nodes) * 100) : 0
  const reinforce = Math.round((t.reinforcements / g.programs) * 100)
  const weak = Object.keys(g.weakTags).slice(0, 4).join(', ')
  const strong = Object.keys(g.strongTags).slice(0, 4).join(', ')
  return `Tema "${g.topic}" (${g.programs} programas): ~${avgNodes} nodos por programa, dominio medio ${mastery}%, refuerzo en ${reinforce}% de los casos.`
    + (weak ? ` Suele costar: ${weak}.` : '') + (strong ? ` Funciona bien: ${strong}.` : '')
}
