import type { Tool } from '../../types/tool'

export const generarExplicacionTool: Tool = {
  name: 'generar_explicacion',
  description: 'Guarda una explicación de concepto generada para un nodo',
  parameters: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Título del concepto' },
      explicacion: { type: 'string', description: 'Explicación en máx 70 palabras' },
      ejemplo_concreto: { type: 'string', description: 'Ejemplo concreto del concepto' },
      claim_ids: { type: 'array', items: { type: 'string' }, description: 'Ids (c1, c2…) de las afirmaciones del DOSSIER en que se apoya. Solo los que aparezcan en el dossier; omitir si no hay dossier.' },
    },
    required: ['titulo', 'explicacion', 'ejemplo_concreto'],
  },
  execute: async (params) => ({ ok: true, output: {
    titulo: params.titulo,
    explicacion: params.explicacion,
    ejemploConcreto: params.ejemplo_concreto,
    ...(Array.isArray(params.claim_ids) ? { claimIds: (params.claim_ids as unknown[]).filter((id): id is string => typeof id === 'string').slice(0, 6) } : {}),
  } }),
}
