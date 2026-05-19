import type { Tool } from '../../types/tool'

export const repararNodoCompletoTool: Tool = {
  name: 'reparar_nodo_completo',
  description: 'Devuelve un nodo completo reparado cuando uno o más agentes del enjambre fallaron o devolvieron contenido inválido.',
  parameters: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'ID del nodo a reparar' },
      titulo: { type: 'string', description: 'Título final del nodo' },
      concepto: { type: 'string', description: 'Concepto central del nodo' },
      tipoPedagogico: {
        type: 'string',
        enum: ['concept', 'exercise', 'quiz', 'milestone'],
      },
      tipoVisual: {
        type: 'string',
        enum: ['text_card', 'image_ai', 'infographic', 'audio_ai'],
      },
      xpRecompensa: { type: 'number', description: 'XP final del nodo' },
      contenido: {
        type: 'object',
        description: 'Contenido final y completo del nodo usando los nombres de campos camelCase esperados por HiveLearn.',
        additionalProperties: true,
      },
      razon: {
        type: 'string',
        description: 'Resumen breve de por qué fue necesario reparar este nodo.',
      },
    },
    required: ['nodeId', 'titulo', 'concepto', 'tipoPedagogico', 'tipoVisual', 'xpRecompensa', 'contenido'],
  },
  execute: async (params) => ({ ok: true, output: params }),
}
