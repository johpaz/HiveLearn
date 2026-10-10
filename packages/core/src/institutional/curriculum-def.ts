/**
 * Definición de currículo genérica (cualquier tema).
 *
 * Hasta ahora el currículo eran constantes de código sobre IA. `CurriculumDef` es la misma información como
 * DATOS validados: puede venir del catálogo canónico (IA), o generarse por un agente a partir de un dossier
 * de investigación. Tres estados:
 *   - `canonical`  escrito y mantenido por el equipo; acredita.
 *   - `generated`  producido por un agente; NO acredita hasta que un docente lo revise.
 *   - `reviewed`   generado y aprobado por un docente/administrador; acredita.
 *
 * El hash depende solo del contenido pedagógico (no del estado), así la identidad de una definición no
 * cambia cuando se aprueba y un agente no puede "reemplazar" una canónica con otra de igual id.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ageBandFor } from './age'
import type { AgeBand } from './types'

export const MAX_NODES = 20
export const MAX_LEVELS = 6
export type CurriculumStatus = 'canonical' | 'generated' | 'reviewed'

const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/, 'identificador inválido (a-z, 0-9, _ y -; máx. 48)')
const NO_CONTROL = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/
const text = (max: number) => z.string().trim().min(1).max(max).regex(NO_CONTROL, 'caracteres de control no permitidos')
const httpsUrl = z.string().url().max(300).refine(value => value.startsWith('https://'), 'solo https')

const nodeSchema = z.object({
  id: slug,
  title: text(120),
  level: slug,
  prerequisites: z.array(slug).max(8),
  objective: text(400),
  evidence: text(400),
  /** Etiquetas para ordenar por interés del alumno (reemplaza al mapa de ids de IA). */
  tags: z.array(slug).max(5).default([]),
  sources: z.array(slug).max(6).default([]),
}).strict()

const questionSchema = z.object({
  id: slug,
  nodeId: slug,
  prompt: text(300),
  options: z.tuple([text(160), text(160), text(160)]),
  correct: z.number().int().min(0).max(2),
}).strict()

export const curriculumDefSchema = z.object({
  id: slug,
  topic: text(120),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('es'),
  version: text(60),
  levels: z.array(slug).min(1).max(MAX_LEVELS),
  nodes: z.array(nodeSchema).min(1).max(MAX_NODES),
  questionBank: z.array(questionSchema).min(1).max(MAX_NODES * 3),
  /** clave → URL https. Los nodos citan estas claves. */
  sources: z.record(slug, httpsUrl).default({}),
}).strict()

export type CurriculumContent = z.infer<typeof curriculumDefSchema>
export type CurriculumNodeDef = CurriculumContent['nodes'][number]
export type CurriculumQuestion = CurriculumContent['questionBank'][number]

export interface CurriculumDef extends CurriculumContent {
  hash: string
  status: CurriculumStatus
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
}

export class CurriculumValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Currículo inválido: ${issues.slice(0, 8).join('; ')}${issues.length > 8 ? `; …(+${issues.length - 8})` : ''}`)
    this.name = 'CurriculumValidationError'
  }
}

/** Valida estructura y reglas del grafo. Lanza `CurriculumValidationError` con TODOS los problemas. */
export function validateCurriculumContent(input: unknown): CurriculumContent {
  const parsed = curriculumDefSchema.safeParse(input)
  if (!parsed.success) {
    throw new CurriculumValidationError(parsed.error.issues.map(issue => `${issue.path.join('.') || 'raíz'}: ${issue.message}`))
  }
  const def = parsed.data
  const issues: string[] = []

  if (new Set(def.levels).size !== def.levels.length) issues.push('levels: hay niveles repetidos')
  const levelIndex = new Map(def.levels.map((level, index) => [level, index]))

  const ids = new Set<string>()
  for (const node of def.nodes) {
    if (ids.has(node.id)) issues.push(`nodes: id duplicado "${node.id}"`)
    ids.add(node.id)
  }
  for (const node of def.nodes) {
    if (!levelIndex.has(node.level)) issues.push(`nodes.${node.id}: nivel desconocido "${node.level}"`)
    if (new Set(node.prerequisites).size !== node.prerequisites.length) issues.push(`nodes.${node.id}: prerrequisitos repetidos`)
    for (const prerequisite of node.prerequisites) {
      if (prerequisite === node.id) issues.push(`nodes.${node.id}: se requiere a sí mismo`)
      else if (!ids.has(prerequisite)) issues.push(`nodes.${node.id}: prerrequisito inexistente "${prerequisite}"`)
      else {
        const from = levelIndex.get(def.nodes.find(n => n.id === prerequisite)!.level)
        const to = levelIndex.get(node.level)
        if (from !== undefined && to !== undefined && from > to) issues.push(`nodes.${node.id}: exige "${prerequisite}", de un nivel posterior`)
      }
    }
    for (const source of node.sources) if (!(source in def.sources)) issues.push(`nodes.${node.id}: fuente desconocida "${source}"`)
  }

  // Aciclicidad (Kahn) solo si las referencias existen.
  if (!issues.some(issue => issue.includes('inexistente') || issue.includes('sí mismo'))) {
    const pending = new Map(def.nodes.map(node => [node.id, node.prerequisites.length]))
    const ready = [...pending].filter(([, count]) => count === 0).map(([id]) => id)
    let visited = 0
    while (ready.length) {
      const id = ready.pop()!
      visited++
      for (const node of def.nodes) {
        if (node.prerequisites.includes(id)) {
          const left = pending.get(node.id)! - 1
          pending.set(node.id, left)
          if (left === 0) ready.push(node.id)
        }
      }
    }
    if (visited !== def.nodes.length) issues.push('nodes: los prerrequisitos forman un ciclo')
  }

  const questionIds = new Set<string>()
  const covered = new Set<string>()
  for (const question of def.questionBank) {
    if (questionIds.has(question.id)) issues.push(`questionBank: id duplicado "${question.id}"`)
    questionIds.add(question.id)
    if (!ids.has(question.nodeId)) issues.push(`questionBank.${question.id}: nodo inexistente "${question.nodeId}"`)
    covered.add(question.nodeId)
    if (new Set(question.options.map(option => option.trim().toLowerCase())).size !== 3) issues.push(`questionBank.${question.id}: opciones repetidas`)
  }
  for (const node of def.nodes) if (!covered.has(node.id)) issues.push(`nodes.${node.id}: no tiene ninguna pregunta de diagnóstico`)

  if (issues.length) throw new CurriculumValidationError(issues)
  return def
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** Hash del contenido pedagógico. No depende del estado, de fechas ni del revisor. */
export function hashCurriculum(content: CurriculumContent): string {
  return createHash('sha256').update(canonicalJson(content)).digest('hex')
}

/** ¿Puede esta definición acreditar dominio? Solo la canónica y la revisada por una persona. */
export function canAccredit(def: Pick<CurriculumDef, 'status'>): boolean {
  return def.status === 'canonical' || def.status === 'reviewed'
}

export const AGE_GUIDANCE: Record<AgeBand, { context: string; supervision: string }> = {
  ninez: { context: '8–11: ejemplos concretos, clasificación de objetos y actividades sin cuentas externas.', supervision: 'Actividad mediada por docente; datos ficticios y herramientas institucionales.' },
  adolescencia_temprana: { context: '12–14: datos sencillos, comparación de respuestas y proyectos escolares guiados.', supervision: 'Revisión docente de herramientas, fuentes y publicaciones.' },
  adolescencia: { context: '15–17: proyectos contextualizados, evaluación de modelos y discusión de impactos.', supervision: 'Supervisión institucional y revisión antes de publicar o desplegar.' },
  adulto: { context: '18+: situaciones ciudadanas o laborales; programación opcional según diagnóstico.', supervision: 'Revisión humana proporcional al riesgo; no usar datos sensibles reales en ejercicios.' },
}

export type NodeStatus = 'mastered' | 'available' | 'pending'

/** Lo mínimo que necesita una ruta: sirve tanto para una definición como para las constantes de IA. */
export interface RouteNode { id: string; level: string; prerequisites: readonly string[]; sources: readonly string[]; tags?: readonly string[] }
export interface RouteSource<N extends RouteNode = RouteNode> {
  version: string
  levels: readonly string[]
  nodes: ReadonlyArray<N>
  sources: Readonly<Record<string, string>>
}

/** Ruta del alumno sobre una definición: qué está dominado, disponible o bloqueado por prerrequisitos. */
export function routeFor<N extends RouteNode>(def: RouteSource<N>, age: number, level: string, mastered: readonly string[] = []) {
  if (!Number.isInteger(age) || age < 8 || age > 120) throw new Error('Edad fuera del catálogo (8–120)')
  const levelIndex = def.levels.indexOf(level)
  if (levelIndex < 0) throw new Error('Nivel curricular desconocido')
  const known = new Set(def.nodes.map(node => node.id))
  if (mastered.some(id => !known.has(id))) throw new Error('Competencia desconocida')
  const ageBand = ageBandFor(age)
  const completed = new Set(mastered)
  const nodes = def.nodes.filter(node => def.levels.indexOf(node.level) <= levelIndex).map(node => ({
    ...node, prerequisites: [...node.prerequisites], sources: [...node.sources], tags: [...(node.tags ?? [])],
    status: (completed.has(node.id) ? 'mastered' : node.prerequisites.every(id => completed.has(id)) ? 'available' : 'pending') as NodeStatus,
  }))
  return {
    version: def.version, ageBand, level, guidance: { ...AGE_GUIDANCE[ageBand] }, nodes,
    edges: nodes.flatMap(node => node.prerequisites.map(from => ({ from, to: node.id, relation: 'prerequisite' as const }))),
    sources: { ...def.sources },
  }
}

/** Esquema de respuestas del diagnóstico: una por pregunta del banco, ni más ni menos. */
export function answersSchemaFor(def: Pick<CurriculumContent, 'questionBank'>) {
  return z.object({
    answers: z.array(z.object({ questionId: z.string(), option: z.number().int().min(0).max(2) }).strict()).length(def.questionBank.length),
  }).strict()
}

/**
 * Califica el diagnóstico en el servidor (la respuesta correcta nunca va al cliente). Un nodo se da por
 * conocido si TODAS sus preguntas son correctas. El nivel es el del primer nodo con una brecha.
 * El diagnóstico nunca certifica dominio práctico.
 */
export function scoreDiagnosticFor(def: CurriculumContent, input: unknown) {
  const { answers } = answersSchemaFor(def).parse(input)
  const given = new Map(answers.map(answer => [answer.questionId, answer.option]))
  if (given.size !== def.questionBank.length || def.questionBank.some(question => !given.has(question.id))) throw new Error('Responda cada pregunta una sola vez')
  const scores: Record<string, boolean> = {}
  for (const node of def.nodes) {
    const questions = def.questionBank.filter(question => question.nodeId === node.id)
    scores[node.id] = questions.every(question => given.get(question.id) === question.correct)
  }
  const firstGap = def.nodes.find(node => !scores[node.id])
  return { scores, level: firstGap?.level ?? def.levels[def.levels.length - 1] }
}

/** Un plan del enjambre solo puede usar competencias de ESTE currículo cuyos prerrequisitos estén cumplidos. */
export function validateBlueprintFor(input: unknown, route: ReturnType<typeof routeFor>) {
  const plan = input as { curriculumVersion?: unknown; nodos?: { id?: unknown; competencyId?: unknown }[] }
  if (!plan || plan.curriculumVersion !== route.version || !Array.isArray(plan.nodos) || !plan.nodos.length || plan.nodos.length > MAX_NODES) throw new Error('Blueprint sin versión curricular válida o sin actividades')
  const ids = new Set<unknown>()
  for (const node of plan.nodos) {
    if (!node || typeof node.id !== 'string' || ids.has(node.id)) throw new Error('Identificador de actividad inválido o duplicado')
    ids.add(node.id)
    if (!route.nodes.some(n => n.id === node.competencyId && n.status !== 'pending')) throw new Error('Actividad fuera del currículo o con prerrequisitos pendientes')
  }
}
