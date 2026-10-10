/**
 * Política de dominios por banda de edad.
 *
 * - Siempre se deniegan hosts internos o literales de IP (además del bloqueo SSRF de `net-guard`).
 * - Adultos: cualquier dominio público que no esté en la lista de denegados.
 * - Menores o edad desconocida: SOLO dominios de una lista de permitidos (referencias educativas, .edu, .gov),
 *   ampliable por la institución. El modelo ni siquiera ve en la búsqueda lo que no pasa este filtro.
 */
import { isIP } from 'node:net'
import { isMinorBand, type AgeBand } from '../institutional/age'

/** Sufijos de dominio permitidos para menores. Un sufijo coincide con el dominio y sus subdominios. */
export const MINOR_ALLOWED_SUFFIXES = [
  'wikipedia.org', 'wikimedia.org', 'wikibooks.org', 'wikiversity.org', 'britannica.com', 'khanacademy.org',
  'nasa.gov', 'nationalgeographic.com', 'kids.nationalgeographic.com', 'developer.mozilla.org', 'w3.org',
  'si.edu', 'noaa.gov', 'who.int', 'unesco.org', 'un.org', 'oecd.org',
  '.edu', '.gov', '.edu.co', '.gov.co', '.edu.es', '.gob.es', '.edu.mx', '.gob.mx', '.ac.uk', '.gov.uk',
]

/** Denegados para todas las edades (no es una lista de contenido, solo de hosts claramente fuera de lugar). */
export const ALWAYS_DENIED_SUFFIXES = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly']

export interface DomainPolicyOptions {
  extraAllow?: string[]
  extraDeny?: string[]
}

function matches(host: string, suffix: string): boolean {
  const s = suffix.toLowerCase()
  return s.startsWith('.') ? host.endsWith(s) : host === s || host.endsWith(`.${s}`)
}

export interface DomainDecision { allowed: boolean; reason?: string }

export function checkDomain(hostname: string, band: AgeBand, options: DomainPolicyOptions = {}): DomainDecision {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host || isIP(host) !== 0) return { allowed: false, reason: 'No se permiten direcciones IP' }
  if ([...ALWAYS_DENIED_SUFFIXES, ...(options.extraDeny ?? [])].some(s => matches(host, s))) {
    return { allowed: false, reason: 'Dominio denegado' }
  }
  if (!isMinorBand(band)) return { allowed: true }
  const allowed = [...MINOR_ALLOWED_SUFFIXES, ...(options.extraAllow ?? [])]
  if (allowed.some(s => matches(host, s))) return { allowed: true }
  return { allowed: false, reason: 'Dominio no incluido en la lista permitida para menores' }
}
