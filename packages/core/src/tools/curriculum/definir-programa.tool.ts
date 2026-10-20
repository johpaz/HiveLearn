import { z } from 'zod'
import type { Tool } from '../../types/tool'
import { PROGRAM_LIMITS, nodeSchema } from '../../institutional/program/program-def'
import { allowedNodes, type Sizing } from '../../institutional/program/sizing'

const str = (description: string) => ({ type: 'string', description })
const levelText = z.string().trim().min(1).max(160)

const nodeJsonSchema = {
  type: 'object',
  required: ['id', 'title', 'objective', 'evidence', 'question'],
  properties: {
    id: str('Identificador: minúsculas, números, _ y -, máx. 48'),
    title: str('Título breve'),
    objective: str('Qué podrá hacer el alumno'),
    evidence: str('Qué evidencia observable lo demuestra'),
    tags: { type: 'array', items: { type: 'string' } },
    question: {
      type: 'object',
      required: ['prompt', 'options', 'correct'],
      properties: {
        prompt: str('Enunciado de la comprobación'),
        options: { type: 'array', items: { type: 'string' }, description: 'EXACTAMENTE 3 opciones distintas' },
        correct: { type: 'number', description: 'Índice 0, 1 o 2 de la opción correcta' },
      },
    },
  },
}

export const programPlanSchema = z.object({
  objective: z.string().trim().min(10).max(400),
  levels: z.array(z.object({
    title: levelText,
    goal: z.string().trim().min(1).max(300),
    plannedNodes: z.number().int().min(1).max(PROGRAM_LIMITS.maxNodesPerLevel),
  }).strict()).min(2).max(PROGRAM_LIMITS.maxLevels - 1),
  firstLevelNodes: z.array(nodeSchema).min(1).max(PROGRAM_LIMITS.maxNodesPerLevel),
}).strict()
export type ProgramPlan = z.infer<typeof programPlanSchema>

/**
 * Salida estructurada del Arquitecto de programas. Se crea POR EJECUCIÓN porque valida contra el dimensionado de esa
 * sesión; si algo no cumple devuelve la lista de problemas al modelo para que lo corrija en la siguiente vuelta.
 */
export function createDefinirProgramaTool(sizing: Sizing): Tool {
  return {
    name: 'definir_programa',
    description: 'Entrega el programa formativo: objetivo, niveles (el último es la evaluación final) y los nodos completos del PRIMER nivel. Si es inválido devuelve los problemas para corregirlos.',
    parameters: {
      type: 'object',
      required: ['objective', 'levels', 'firstLevelNodes'],
      properties: {
        objective: str('Objetivo final del programa: "al terminar podrá…"'),
        levels: {
          type: 'array',
          description: `Exactamente ${sizing.levels} niveles; el último es la evaluación final`,
          items: { type: 'object', required: ['title', 'goal', 'plannedNodes'], properties: { title: str('Título breve'), goal: str('Qué demuestra al cerrar el nivel'), plannedNodes: { type: 'number' } } },
        },
        firstLevelNodes: { type: 'array', description: 'Nodos completos del primer nivel', items: nodeJsonSchema },
      },
    },
    execute: async (params) => {
      const parsed = programPlanSchema.safeParse(params)
      const issues: string[] = parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join('.') || 'raíz'}: ${i.message}`)
      if (parsed.success) {
        const plan = parsed.data
        if (plan.levels.length !== sizing.levels) issues.push(`levels: deben ser exactamente ${sizing.levels} niveles (recibiste ${plan.levels.length})`)
        const first = allowedNodes(sizing, 0)
        if (plan.firstLevelNodes.length < first.min || plan.firstLevelNodes.length > first.max) {
          issues.push(`firstLevelNodes: el primer nivel admite entre ${first.min} y ${first.max} nodos (recibiste ${plan.firstLevelNodes.length})`)
        }
        const ids = plan.firstLevelNodes.map(n => n.id)
        if (new Set(ids).size !== ids.length) issues.push('firstLevelNodes: hay ids repetidos')
        plan.levels.forEach((level, i) => {
          const range = allowedNodes(sizing, i)
          if (level.plannedNodes < range.min || level.plannedNodes > range.max) issues.push(`levels[${i}].plannedNodes: entre ${range.min} y ${range.max}`)
        })
        if (plan.levels.reduce((n, l) => n + l.plannedNodes, 0) > PROGRAM_LIMITS.maxNodesTotal) issues.push(`levels: el programa no puede pasar de ${PROGRAM_LIMITS.maxNodesTotal} nodos en total`)
      }
      if (issues.length) {
        return { ok: false, error: 'El programa no es válido. Corrige TODOS estos problemas y vuelve a llamar definir_programa:', issues } as never
      }
      return { ok: true, output: parsed.success ? parsed.data : params }
    },
  }
}
