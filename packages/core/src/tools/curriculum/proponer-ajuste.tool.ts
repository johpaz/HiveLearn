import type { Tool } from '../../types/tool'
import { applyAdaptation } from '../../institutional/program/guards'
import type { PersonalProgram } from '../../institutional/program/program-def'

const nodeJson = {
  type: 'object',
  required: ['id', 'title', 'objective', 'evidence', 'question'],
  properties: {
    id: { type: 'string' }, title: { type: 'string' }, objective: { type: 'string' }, evidence: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    question: { type: 'object', required: ['prompt', 'options', 'correct'], properties: { prompt: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, correct: { type: 'number' } } },
  },
}

/**
 * Salida estructurada del Adaptador. Se prueba el parche en seco contra las guardas: si alguna operación se rechaza, el
 * modelo recibe los motivos y la corrige; el resultado final es solo lo que las guardas aceptarían.
 */
export function createProponerAjusteTool(program: PersonalProgram): Tool {
  return {
    name: 'proponer_ajuste',
    description: 'Entrega el ajuste del programa como lista de operaciones (materialize_level, add_reinforcement_level, set_level_plan, add_node, drop_unstarted_node, reorder, retitle). Devuelve las operaciones rechazadas para corregirlas.',
    parameters: {
      type: 'object',
      required: ['reason', 'ops'],
      properties: {
        reason: { type: 'string', description: 'Por qué se ajusta el plan (una frase)' },
        ops: {
          type: 'array',
          items: {
            type: 'object',
            required: ['op'],
            properties: {
              op: { type: 'string', description: 'materialize_level | add_reinforcement_level | set_level_plan | add_node | drop_unstarted_node | reorder | retitle' },
              levelIndex: { type: 'number' }, afterLevel: { type: 'number' }, title: { type: 'string' }, goal: { type: 'string' },
              plannedNodes: { type: 'number' }, nodeId: { type: 'string' }, nodeIds: { type: 'array', items: { type: 'string' } },
              node: nodeJson, nodes: { type: 'array', items: nodeJson },
            },
          },
        },
      },
    },
    execute: async (params) => {
      const ops = Array.isArray(params.ops) ? params.ops : []
      const reason = typeof params.reason === 'string' ? params.reason : 'ajuste'
      if (ops.length === 0) return { ok: false, error: 'No propusiste operaciones. Materializa al menos el siguiente nivel.', issues: [] } as never
      const trial = applyAdaptation(program, ops, { actor: 'agent', reason })
      if (trial.rejected.length > 0 && trial.applied.length === 0) {
        return { ok: false, error: 'Ninguna operación pasó las guardas. Corrige y vuelve a llamar proponer_ajuste:', issues: trial.rejected.map(r => `${r.op}: ${r.reason}`) } as never
      }
      return { ok: true, output: { reason, ops } }
    },
  }
}
