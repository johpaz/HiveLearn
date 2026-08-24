import type { Tool } from '../../types/tool'
import { getDb } from '../../storage/hivedb'

interface SearchIndexDoc {
  entidad_tipo: string
  entidad_id: string
  contenido_texto: string
  metadata_json: string | null
}

/** Cutoff relativo: descarta hits con score < 0.3 × mejor score (patrón Hive capability-search) */
const RELATIVE_CUTOFF = 0.3

export const buscarEnHiveLearnTool: Tool = {
  name: 'buscar_en_hivelearn',
  description: 'Búsqueda semántica (BM25 + vectores) en el índice de HiveLearn',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Términos de búsqueda' },
      tipo: { type: 'string', description: 'Filtrar por tipo: tool|skill (opcional)' },
      limite: { type: 'number', description: 'Máx resultados (default: 5)' },
    },
    required: ['query'],
  },
  execute: async (params) => {
    try {
      const db = getDb()
      const limite = (params.limite as number) ?? 5
      const filters = params.tipo
        ? [{ field: 'type', value: String(params.tipo) }]
        : undefined

      const hits = await db.queryHybrid({
        text: String(params.query),
        k: limite * 3,
        filters,
        boosts: { name: 4, tags: 3, body: 2 },
      })

      const top = hits[0]?.score ?? 0
      const relevant = hits.filter(h => h.score >= top * RELATIVE_CUTOFF).slice(0, limite)

      const searchCol = db.collection<SearchIndexDoc>('hl_search_index')
      const results = [] as Array<{ entidad_tipo: string; entidad_id: string; snippet: string; score: number }>
      for (const hit of relevant) {
        const entry = await searchCol.get(hit.id)
        if (!entry) continue
        const texto = entry.doc.contenido_texto ?? ''
        results.push({
          entidad_tipo: entry.doc.entidad_tipo,
          entidad_id: entry.doc.entidad_id,
          snippet: texto.length > 240 ? `${texto.slice(0, 240)}...` : texto,
          score: hit.score,
        })
      }

      return { ok: true, resultados: results, total: results.length }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },
}
