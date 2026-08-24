import type { Tool } from '../../types/tool'
import { getDb } from '../../storage/hivedb'

interface CurriculaDoc {
  topic_slug: string | null
  rango_edad: string | null
  created_at?: string
  [key: string]: unknown
}

export const buscarCurriculoExistenteTool: Tool = {
  name: 'buscar_curriculo_existente',
  description: 'Busca un currículo cacheado en HiveDB por topic_slug y rango_edad',
  parameters: {
    type: 'object',
    properties: {
      topic_slug: { type: 'string' },
      rango_edad: { type: 'string', enum: ['nino','adolescente','adulto'] },
    },
    required: ['topic_slug', 'rango_edad'],
  },
  execute: async (params) => {
    try {
      const db = getDb()
      const matches = await db.collection<CurriculaDoc>('hl_curricula')
        .findBy('topic_slug', params.topic_slug as string)
      const curriculo = matches
        .map(m => ({ id: m.id, ...m.doc }))
        .filter(c => c.rango_edad === (params.rango_edad as string))
        .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]
      if (!curriculo) return { ok: true, encontrado: false }
      return { ok: true, encontrado: true, curriculo }
    } catch {
      return { ok: true, encontrado: false }
    }
  },
}
