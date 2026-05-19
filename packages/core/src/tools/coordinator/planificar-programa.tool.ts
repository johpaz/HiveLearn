import type { Tool } from '../../types/tool'

export const planificarProgramaTool: Tool = {
  name: 'planificar_programa',
  description: 'Genera el blueprint estructurado del programa educativo a partir del perfil y la meta del alumno.',
  parameters: {
    type: 'object',
    properties: {
      tema: { type: 'string', description: 'Tema principal del programa' },
      topic_slug: { type: 'string', description: 'Slug del tema si es conocido' },
      nodos: {
        type: 'array',
        description: 'Blueprint de nodos del programa',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            titulo: { type: 'string' },
            concepto: { type: 'string' },
            tipo_pedagogico: {
              type: 'string',
              enum: ['concept', 'exercise', 'quiz', 'challenge', 'milestone', 'evaluation'],
            },
            tipo_visual: {
              type: 'string',
              enum: ['text_card', 'svg_diagram', 'gif_guide', 'infographic', 'image_ai', 'audio_ai'],
            },
            xp_recompensa: { type: 'number' },
          },
          required: ['id', 'titulo', 'concepto', 'tipo_pedagogico', 'tipo_visual', 'xp_recompensa'],
        },
      },
    },
    required: ['tema', 'nodos'],
  },
  execute: async (params) => ({ ok: true, output: params }),
}
