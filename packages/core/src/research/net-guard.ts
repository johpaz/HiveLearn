/**
 * Descarga web endurecida para el investigador.
 *
 * El `web_fetch` del SDK no tiene timeout, ni protección SSRF, ni tope de bytes. Aquí una URL solo se
 * descarga si pasa TODAS estas comprobaciones, y se repiten en cada redirección:
 *   - esquema https, sin credenciales en la URL, puerto 443;
 *   - el host no es una IP privada/loopback/enlace local (incluidas formas decimales, octales, IPv6 y
 *     IPv4 mapeadas), y TODAS las direcciones a las que resuelve son públicas;
 *   - timeout total, límite de redirecciones y de bytes (se corta el stream, no se descarga y luego se mide);
 *   - solo tipos de contenido textuales.
 *
 * Límite conocido: la resolución DNS de la comprobación y la de la conexión son dos consultas distintas
 * (DNS rebinding). Se reduce validando justo antes de conectar, pero no se elimina; por eso el despliegue
 * institucional debería además filtrar el egreso de red del proceso.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export class FetchBlockedError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message)
    this.name = 'FetchBlockedError'
  }
}

/** Expande una IPv6 a ocho grupos de 16 bits. Devuelve null si no es válida. */
function parseIPv6(address: string): number[] | null {
  let input = address.toLowerCase().replace(/%.*$/, '')
  // IPv4 embebida al final (::ffff:1.2.3.4)
  const v4 = input.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const octets = v4[2].split('.').map(Number)
    if (octets.some(n => n > 255)) return null
    input = `${v4[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }
  const halves = input.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const out = groups.map(group => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : Number.NaN))
  return out.some(Number.isNaN) ? null : out
}

function isPrivateIPv4(octets: number[]): boolean {
  const [a, b, c] = octets
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

/** true si la dirección NO es de internet público (o no se puede interpretar: ante la duda, se bloquea). */
export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address)
  if (kind === 4) return isPrivateIPv4(address.split('.').map(Number))
  if (kind === 6) {
    const g = parseIPv6(address)
    if (!g) return true
    const v4 = (hi: number, lo: number) => isPrivateIPv4([hi >> 8, hi & 255, lo >> 8, lo & 255])
    if (g.slice(0, 5).every(n => n === 0) && g[5] === 0xffff) return v4(g[6], g[7]) // ::ffff:a.b.c.d
    if (g.slice(0, 6).every(n => n === 0)) return true // ::, ::1 y IPv4-compatible (obsoleto)
    if (g[0] === 0x64 && g[1] === 0xff9b) return v4(g[6], g[7]) // NAT64 64:ff9b::/96
    if (g[0] === 0x2002) return v4(g[1], g[2]) // 6to4 con IPv4 embebida
    if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 ULA
    if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 enlace local
    if ((g[0] & 0xff00) === 0xff00) return true // multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true // documentación
    return false
  }
  return true
}

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.onion', '.intranet']

export type Resolver = (hostname: string) => Promise<string[]>

export const defaultResolver: Resolver = async hostname => {
  const rows = await lookup(hostname, { all: true, verbatim: true })
  return rows.map(row => row.address)
}

/** Valida una URL sin red. Devuelve la URL parseada o lanza `FetchBlockedError`. */
export function checkUrlShape(raw: string): URL {
  if (typeof raw !== 'string' || raw.length > 2048) throw new FetchBlockedError('invalid_url', 'URL inválida o demasiado larga')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new FetchBlockedError('invalid_url', 'URL inválida')
  }
  if (url.protocol !== 'https:') throw new FetchBlockedError('scheme', 'Solo se permite https')
  if (url.username || url.password) throw new FetchBlockedError('credentials', 'La URL no puede llevar credenciales')
  if (url.port && url.port !== '443') throw new FetchBlockedError('port', 'Solo se permite el puerto 443')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host || host === 'localhost' || !host.includes('.') && isIP(host) === 0 && !host.includes(':')) {
    throw new FetchBlockedError('host', 'Host no permitido')
  }
  if (BLOCKED_HOST_SUFFIXES.some(suffix => host.endsWith(suffix))) throw new FetchBlockedError('host', 'Host interno no permitido')
  if (isIP(host) !== 0 && isPrivateAddress(host)) throw new FetchBlockedError('private_address', 'Dirección privada no permitida')
  return url
}

/** Forma + resolución DNS: todas las direcciones deben ser públicas. */
export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  const url = checkUrlShape(raw)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) !== 0) return url
  let addresses: string[]
  try {
    addresses = await resolve(host)
  } catch {
    throw new FetchBlockedError('dns', 'No se pudo resolver el host')
  }
  if (addresses.length === 0) throw new FetchBlockedError('dns', 'El host no resuelve')
  if (addresses.some(isPrivateAddress)) throw new FetchBlockedError('private_address', 'El host resuelve a una dirección privada')
  return url
}

export interface SafeFetchOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  resolver?: Resolver
  /** Para pruebas. Debe respetar `redirect: 'manual'`. */
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  userAgent?: string
  /** Se evalúa en CADA salto (incluye la política de dominios por edad). Lanza para bloquear. */
  beforeRequest?: (url: URL) => void
}

export interface SafeFetchResult {
  url: string
  status: number
  contentType: string
  body: string
  truncated: boolean
}

const ALLOWED_TYPES = /^(text\/(html|plain|markdown|xml)|application\/(xhtml\+xml|xml|json))\b/i
const REDIRECTS = new Set([301, 302, 303, 307, 308])

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 12_000
  const maxBytes = options.maxBytes ?? 1_000_000
  const maxRedirects = options.maxRedirects ?? 4
  const doFetch = options.fetchImpl ?? ((url, init) => fetch(url, init))
  const signal = AbortSignal.timeout(timeoutMs)

  let current = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current, options.resolver)
    options.beforeRequest?.(url)

    let response: Response
    try {
      response = await doFetch(url.toString(), {
        redirect: 'manual',
        signal,
        headers: { 'user-agent': options.userAgent ?? 'HiveLearnResearcher/1.0', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
      })
    } catch (error) {
      if (signal.aborted) throw new FetchBlockedError('timeout', `Tiempo agotado (${timeoutMs} ms)`)
      throw new FetchBlockedError('network', `Error de red: ${(error as Error).message}`)
    }

    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel().catch(() => {})
      if (!location) throw new FetchBlockedError('redirect', 'Redirección sin destino')
      current = new URL(location, url).toString()
      continue
    }

    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel().catch(() => {})
      throw new FetchBlockedError('status', `Respuesta HTTP ${response.status}`)
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (!ALLOWED_TYPES.test(contentType)) {
      await response.body?.cancel().catch(() => {})
      throw new FetchBlockedError('content_type', `Tipo de contenido no permitido: ${contentType || 'desconocido'}`)
    }
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > maxBytes * 4) {
      await response.body?.cancel().catch(() => {})
      throw new FetchBlockedError('too_large', 'El documento es demasiado grande')
    }

    // Lectura en streaming con tope duro: nunca se acumula más de `maxBytes`.
    const chunks: Uint8Array[] = []
    let received = 0
    let truncated = false
    const reader = response.body?.getReader()
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const room = maxBytes - received
          if (value.byteLength >= room) {
            chunks.push(value.subarray(0, room))
            received += room
            truncated = true
            await reader.cancel().catch(() => {})
            break
          }
          chunks.push(value)
          received += value.byteLength
        }
      } catch (error) {
        if (signal.aborted) throw new FetchBlockedError('timeout', `Tiempo agotado (${timeoutMs} ms)`)
        throw new FetchBlockedError('network', `Error leyendo el documento: ${(error as Error).message}`)
      }
    }
    const merged = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
    return { url: url.toString(), status: response.status, contentType, body: new TextDecoder('utf-8', { fatal: false }).decode(merged), truncated }
  }
  throw new FetchBlockedError('redirect', `Más de ${maxRedirects} redirecciones`)
}
