import { getDb, nowIso } from '../storage/hivedb'

interface NodeCacheDoc {
  agente_tipo: string
  concepto_slug: string
  expires_at: string
}

interface NodeEffectivenessDoc {
  agente_tipo: string
  nodo_content_hash: string
  tasa_abandono: number
}

export class CacheInvalidator {
  /** Elimina entradas expiradas de hl_node_cache */
  async invalidateExpired(): Promise<number> {
    try {
      const col = getDb().collection<NodeCacheDoc>('hl_node_cache')
      const now = nowIso()
      const entries = await col.scan()
      let deleted = 0
      for (const entry of entries) {
        if (entry.doc.expires_at < now) {
          await col.delete(entry.id)
          deleted++
        }
      }
      return deleted
    } catch {
      return 0
    }
  }

  /** Invalida todas las entradas de un agente específico */
  async invalidateByAgent(agenteTipo: string): Promise<number> {
    try {
      const col = getDb().collection<NodeCacheDoc>('hl_node_cache')
      const entries = await col.findBy('agente_tipo', agenteTipo)
      for (const entry of entries) {
        await col.delete(entry.id)
      }
      return entries.length
    } catch {
      return 0
    }
  }

  /** Invalida entradas con tasa de abandono alta (ciclo de mejora continua) */
  async invalidateIneffective(umbralTasaAbandono = 0.4): Promise<number> {
    try {
      const db = getDb()
      const effectiveness = await db.collection<NodeEffectivenessDoc>('hl_node_effectiveness').scan()

      // DISTINCT agente_tipo + concepto_slug (el concepto es el content hash del nodo)
      const ineficaces = new Map<string, { agente_tipo: string; concepto_slug: string }>()
      for (const entry of effectiveness) {
        if (entry.doc.tasa_abandono > umbralTasaAbandono) {
          ineficaces.set(`${entry.doc.agente_tipo}|${entry.doc.nodo_content_hash}`, {
            agente_tipo: entry.doc.agente_tipo,
            concepto_slug: entry.doc.nodo_content_hash,
          })
        }
      }

      const cache = db.collection<NodeCacheDoc>('hl_node_cache')
      let deleted = 0
      for (const row of ineficaces.values()) {
        const entries = await cache.findBy('agente_tipo', row.agente_tipo)
        for (const entry of entries) {
          if ((entry.doc as { concepto_slug?: string }).concepto_slug === row.concepto_slug) {
            await cache.delete(entry.id)
            deleted++
          }
        }
      }
      return deleted
    } catch {
      return 0
    }
  }
}

export const cacheInvalidator = new CacheInvalidator()
