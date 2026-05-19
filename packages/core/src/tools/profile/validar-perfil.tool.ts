import type { Tool } from '../../types/tool'

export const validarPerfilTool: Tool = {
  name: 'validar_perfil',
  description: 'Valida y completa el perfil de adaptación del alumno para la generación de la lección',
  parameters: {
    type: 'object',
    properties: {
      nombre: { type: 'string', description: 'Nombre del alumno' },
      edad: { type: 'number', description: 'Edad validada del alumno' },
      rango_edad: { type: 'string', enum: ['nino', 'adolescente', 'adulto'] },
      nivel_previo: { type: 'string', enum: ['principiante', 'principiante_base', 'intermedio'] },
      estilo: { type: 'string', enum: ['visual', 'lectura', 'retos', 'balanceado', 'mis_retos'] },
      tono: { type: 'string', description: 'Tono recomendado: amigable|motivador|tecnico|neutro' },
      duracion_sesion: { type: 'number', description: 'Duración sugerida de la sesión en minutos: 15, 30 o 45' },
      nodos_recomendados: { type: 'number', description: 'Cantidad sugerida de nodos para la sesión' },
      campos_inferidos: { type: 'array', items: { type: 'string' }, description: 'Campos inferidos o normalizados por el agente' },
    },
    required: ['nombre', 'edad', 'rango_edad', 'nivel_previo', 'estilo', 'tono', 'duracion_sesion', 'nodos_recomendados'],
  },
  execute: async (params) => ({ ok: true, output: params }),
}
