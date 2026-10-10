/**
 * Proveedor de búsqueda intercambiable. El predeterminado consulta la versión HTML de DuckDuckGo a través
 * de `safeFetch` (mismas protecciones que cualquier descarga). Es un raspado: si cambia su marcado el
 * proveedor devuelve cero resultados en lugar de inventar nada. Para producción conviene un proveedor con API.
 */
import { safeFetch, type SafeFetchOptions } from './net-guard'
import { cleanText } from './html-text'

export interface SearchHit { title: string; url: string; snippet: string }

export interface SearchProvider {
  readonly name: string
  search(query: string, options: { limit: number; fetch?: SafeFetchOptions }): Promise<SearchHit[]>
}

function decodeAttr(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
}

/** Los enlaces de DDG van envueltos: //duckduckgo.com/l/?uddg=<url codificada>. */
function unwrap(href: string): string | null {
  const absolute = href.startsWith('//') ? `https:${href}` : href
  try {
    const url = new URL(absolute)
    if (url.hostname.endsWith('duckduckgo.com') && url.pathname.startsWith('/l/')) return url.searchParams.get('uddg')
    return absolute
  } catch {
    return null
  }
}

export function parseDuckDuckGoHtml(html: string, limit: number): SearchHit[] {
  const hits: SearchHit[] = []
  const blocks = html.split(/class="result__a"/).slice(1)
  for (const block of blocks) {
    const href = block.match(/href="([^"]+)"/)?.[1]
    const title = block.match(/>([\s\S]*?)<\/a>/)?.[1]
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''
    if (!href || !title) continue
    const url = unwrap(decodeAttr(href))
    if (!url || !url.startsWith('https://')) continue
    hits.push({
      title: cleanText(decodeAttr(title.replace(/<[^>]*>/g, ''))).slice(0, 200),
      url,
      snippet: cleanText(decodeAttr(snippet.replace(/<[^>]*>/g, ''))).slice(0, 400),
    })
    if (hits.length >= limit) break
  }
  return hits
}

export const duckDuckGoProvider: SearchProvider = {
  name: 'duckduckgo-html',
  async search(query, { limit, fetch: fetchOptions }) {
    const page = await safeFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { ...fetchOptions, maxBytes: 400_000 })
    return parseDuckDuckGoHtml(page.body, limit)
  },
}
