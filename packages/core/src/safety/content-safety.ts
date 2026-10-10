/**
 * Puerta de seguridad del contenido generado (determinista, sin LLM).
 *
 * `hl-safety-policy-agent` nunca tuvo tools ni se invocaba: la "revisión de seguridad" no existía. Esta
 * puerta es código y se ejecuta siempre antes de entregar un programa. Tres resultados:
 *   - `veto`   : no se publica (correos, marcado ejecutable, restos de inyección de prompt,
 *                http, dominios no permitidos para menores, citas a afirmaciones inexistentes).

 *   - `review` : se entrega solo con revisión docente (números que parecen teléfono o documento —pueden ser matemáticas—, temas sensibles para menores, fuentes fuera del dossier).
 *   - `ok`.
 * Es una red de seguridad, no un clasificador de contenido: complementa la revisión pedagógica, no la sustituye.
 */
import { isIP } from 'node:net'
import { checkDomain } from '../research/domain-policy'
import { isMinorBand, type AgeBand } from '../institutional/age'
import type { LessonProgram } from '../types'

export type SafetyState = 'ok' | 'review' | 'veto'
export interface SafetyFinding { severity: 'veto' | 'review'; code: string; where: string; detail: string }
export interface SafetyReport { state: SafetyState; findings: SafetyFinding[] }

export interface SafetyOptions {
  ageBand: AgeBand
  /** URLs del dossier. Con dossier, citar otra fuente exige revisión. */
  allowedUrls?: string[]
  /** claimIds válidos del dossier. Si se da, toda cita debe estar aquí y los conceptos deberían citar. */
  validClaimIds?: string[]
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE = /(?<![\d.])(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}(?![\d.])/
const LONG_ID = /(?<![\d.])\d{8,12}(?![\d.])/
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s"'<>)\]]+/gi
const INJECTION = /(ignora|olvida|descarta)\s+(todas?\s+)?(tus|las|mis)?\s*(instrucciones|reglas|indicaciones)|ignore\s+(all\s+)?(previous|prior|your)\s+instructions|system\s+prompt|revela\s+tu\s+prompt|act[uú]a\s+como\s+(?:un|el)\s+(?:administrador|sistema)/i
const EXECUTABLE = /<\s*script\b|javascript\s*:|\bon[a-z]{3,}\s*=|<\s*(iframe|object|embed|foreignObject)\b|data\s*:\s*text\/html/i
/** Temas que para menores no se publican sin revisión docente. Es una lista corta e intencionalmente conservadora. */
const SENSITIVE_FOR_MINORS = /\b(sexo|sexual|pornograf|suicid|autolesi|droga|cocaína|marihuana|alcohol|apuesta|armas?\b|asesinat|violaci[oó]n|tortur)\w*/i

/** Recorre todos los strings del contenido con su ruta. */
function* strings(value: unknown, path: string, depth = 0): Generator<[string, string]> {
  if (depth > 8) return
  if (typeof value === 'string') yield [path, value]
  else if (Array.isArray(value)) for (const [i, item] of value.entries()) yield* strings(item, `${path}[${i}]`, depth + 1)
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`, depth + 1)
}

export function evaluateProgramSafety(program: Pick<LessonProgram, 'nodos'>, options: SafetyOptions): SafetyReport {
  const findings: SafetyFinding[] = []
  const minor = isMinorBand(options.ageBand)
  const allowedUrls = options.allowedUrls ? new Set(options.allowedUrls) : null
  const claims = options.validClaimIds ? new Set(options.validClaimIds) : null

  for (const node of program.nodos) {
    const base = `nodo ${node.id}`
    for (const [path, text] of strings(node.contenido ?? {}, base)) {
      // Las claves de claimIds no son texto libre.
      if (path.includes('.claimIds')) continue
      if (EMAIL.test(text)) findings.push({ severity: 'veto', code: 'pii_email', where: path, detail: 'contiene un correo electrónico' })
      if (PHONE.test(text) || LONG_ID.test(text)) findings.push({ severity: 'review', code: 'pii_number', where: path, detail: 'contiene un número que parece teléfono o documento' })
      if (INJECTION.test(text)) findings.push({ severity: 'veto', code: 'prompt_injection', where: path, detail: 'contiene texto de inyección de prompt' })
      if (EXECUTABLE.test(text)) findings.push({ severity: 'veto', code: 'executable_markup', where: path, detail: 'contiene marcado ejecutable' })
      if (minor && SENSITIVE_FOR_MINORS.test(text)) findings.push({ severity: 'review', code: 'sensitive_for_minor', where: path, detail: 'tema sensible para un menor' })

      for (const match of text.matchAll(URL_RE)) {
        const raw = match[0].replace(/[.,;:]+$/, '')
        let url: URL
        try { url = new URL(raw.startsWith('www.') ? `https://${raw}` : raw) } catch {
          findings.push({ severity: 'veto', code: 'bad_url', where: path, detail: `URL inválida: ${raw.slice(0, 80)}` }); continue
        }
        if (url.protocol !== 'https:') { findings.push({ severity: 'veto', code: 'insecure_url', where: path, detail: `URL no https: ${raw.slice(0, 80)}` }); continue }
        if (isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0) { findings.push({ severity: 'veto', code: 'ip_url', where: path, detail: 'URL con IP literal' }); continue }
        if (minor && !checkDomain(url.hostname, options.ageBand).allowed) {
          findings.push({ severity: 'veto', code: 'domain_not_allowed', where: path, detail: `dominio no permitido para menores: ${url.hostname}` }); continue
        }
        if (allowedUrls && !allowedUrls.has(url.toString()) && !allowedUrls.has(raw)) {
          findings.push({ severity: 'review', code: 'source_outside_dossier', where: path, detail: `URL fuera del dossier: ${url.hostname}` })
        }
      }
    }

    if (claims) {
      const cited = node.contenido?.explicacion?.claimIds ?? []
      const unknown = cited.filter(id => !claims.has(id))
      if (unknown.length) findings.push({ severity: 'veto', code: 'unknown_claim', where: `${base}.explicacion.claimIds`, detail: `cita afirmaciones inexistentes: ${unknown.join(', ')}` })
      else if (node.tipoPedagogico === 'concept' && cited.length === 0) {
        findings.push({ severity: 'review', code: 'uncited_concept', where: `${base}.explicacion`, detail: 'concepto sin citas al dossier' })
      }
    }
  }

  const state: SafetyState = findings.some(f => f.severity === 'veto') ? 'veto' : findings.length ? 'review' : 'ok'
  return { state, findings }
}

export function summarizeReport(report: SafetyReport, max = 5): string {
  return report.findings.slice(0, max).map(f => `${f.code} en ${f.where}: ${f.detail}`).join('; ')
}
