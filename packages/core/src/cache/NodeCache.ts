import { getDb, nowIso } from '../storage/hivedb'

const TTL_DAYS = Number(process.env.HIVELEARN_CACHE_TTL_DAYS ?? 30)

function buildKey(agenteTipo: string, conceptoSlug: string, nivel: string, rangoEdad: string): string {
  return `${agenteTipo}:${conceptoSlug}:${nivel}:${rangoEdad}`
}

function expiresAt(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export interface CachedOutput {
  cacheKey: string
  agenteTipo: string
  conceptoSlug: string
  nivel: string
  rangoEdad: string
  outputJson: string
  hits: number
}

interface NodeCacheDoc {
  agente_tipo: string
  concepto_slug: string
  nivel: string
  rango_edad: string
  output_json: string
  hits: number
  expires_at: string
}

export class NodeCache {
  private col() {
    return getDb().collection<NodeCacheDoc>('hl_node_cache')
  }

  async get(agenteTipo: string, conceptoSlug: string, nivel: string, rangoEdad: string): Promise<CachedOutput | null> {
    try {
      const key = buildKey(agenteTipo, conceptoSlug, nivel, rangoEdad)
      const entry = await this.col().get(key)
      // WHERE expires_at > datetime('now') — las fechas son ISO, comparación lexicográfica válida
      if (!entry || entry.doc.expires_at <= nowIso()) return null

      // Auto-sanar entradas con doble-encoding: si output_json es un JSON string
      // (empieza con `"` y termina con `"`), decodificarlo una vez
      let outputJson: string = entry.doc.output_json
      if (typeof outputJson === 'string' && outputJson.startsWith('"') && outputJson.endsWith('"')) {
        try {
          const inner = JSON.parse(outputJson)
          if (typeof inner === 'string') {
            outputJson = inner
            // Actualizar la entrada en DB para que quede sana
            await this.col().put(key, { ...entry.doc, output_json: outputJson })
          }
        } catch { /* dejar como está si falla */ }
      }

      return {
        cacheKey: entry.id,
        agenteTipo: entry.doc.agente_tipo,
        conceptoSlug: entry.doc.concepto_slug,
        nivel: entry.doc.nivel,
        rangoEdad: entry.doc.rango_edad,
        outputJson,
        hits: entry.doc.hits,
      }
    } catch {
      return null
    }
  }

  async set(agenteTipo: string, conceptoSlug: string, nivel: string, rangoEdad: string, output: unknown): Promise<void> {
    try {
      const key = buildKey(agenteTipo, conceptoSlug, nivel, rangoEdad)
      // Si output ya es un string (JSON), guardarlo tal cual — no hacer JSON.stringify
      // para evitar doble-encoding (string → '"{\"key\"..."}"' que parseAgentOutput no puede leer)
      const valueToStore = typeof output === 'string' ? output : JSON.stringify(output)
      // INSERT OR REPLACE del schema anterior
      await this.col().put(key, {
        agente_tipo: agenteTipo,
        concepto_slug: conceptoSlug,
        nivel,
        rango_edad: rangoEdad,
        output_json: valueToStore,
        hits: 0,
        expires_at: expiresAt(TTL_DAYS),
      })
    } catch { /* cache miss no es crítico */ }
  }

  async hit(agenteTipo: string, conceptoSlug: string, nivel: string, rangoEdad: string): Promise<void> {
    try {
      const key = buildKey(agenteTipo, conceptoSlug, nivel, rangoEdad)
      const entry = await this.col().get(key)
      if (!entry) return
      await this.col().put(key, { ...entry.doc, hits: entry.doc.hits + 1 })
    } catch { /* silencioso */ }
  }
}

export const nodeCache = new NodeCache()
