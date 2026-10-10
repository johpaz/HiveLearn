/**
 * portraits — retratos IA de los agentes de la colmena, generados bajo demanda.
 *
 * Flujo:
 *   1. `ensurePortrait(gameId)` mira el cache en disco `data/portraits/{id}.svg`.
 *   2. Si no existe, pide al agente de imagen (`hl-image-agent`) un SVG pixel-art
 *      del personaje (vía `runHiveLearnConversation`), lo valida y lo cachea.
 *   3. Si el LLM falla o no devuelve SVG válido → null (el cliente cae al
 *      sprite procedural, que siempre funciona).
 *
 * Las llamadas concurrentes para el mismo agente se deduplican (in-flight map).
 */

import { mkdirSync, existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { runHiveLearnConversation } from '../agent/conversation.js'
import { resolveCharacter } from '../agent/characters.js'
import { logger } from '../utils/logger.js'

const log = logger.child('portraits')

const PORTRAITS_DIR = join(process.cwd(), 'data', 'portraits')
const GEN_TIMEOUT_MS = 60_000

export interface PortraitFile {
  path: string
  contentType: 'image/svg+xml' | 'image/png'
}

/** Busca un retrato cacheado (svg o png). */
export function findCachedPortrait(gameId: string): PortraitFile | null {
  const svg = join(PORTRAITS_DIR, `${gameId}.svg`)
  if (existsSync(svg)) return { path: svg, contentType: 'image/svg+xml' }
  const png = join(PORTRAITS_DIR, `${gameId}.png`)
  if (existsSync(png)) return { path: png, contentType: 'image/png' }
  return null
}

const inFlight = new Map<string, Promise<PortraitFile | null>>()

/** Devuelve el retrato cacheado o lo genera bajo demanda. null si no se pudo. */
export function ensurePortrait(gameId: string): Promise<PortraitFile | null> {
  const cached = findCachedPortrait(gameId)
  if (cached) return Promise.resolve(cached)

  let pending = inFlight.get(gameId)
  if (!pending) {
    pending = generatePortrait(gameId)
      .catch((e) => {
        log.warn('generación de retrato falló', { gameId, error: (e as Error).message })
        return null
      })
      .finally(() => inFlight.delete(gameId))
    inFlight.set(gameId, pending)
  }
  return pending
}

function buildPrompt(name: string, title: string, color: string, personality: string): string {
  return `Genera el retrato oficial de un personaje de videojuego. Responde ÚNICAMENTE con un SVG válido (sin markdown, sin explicación, sin backticks).

Personaje: ${name} — ${title}, una abeja de la colmena del saber.
Personalidad: ${personality}
Color de acento principal: ${color}

Requisitos del SVG:
- viewBox="0 0 128 128", width="128", height="128".
- Estilo pixel-art 16-bit tipo retrato RPG: formas geométricas simples y sólidas (rect/circle/polygon), sin filtros, sin degradados complejos, sin texto.
- Retrato de busto centrado sobre fondo oscuro (#0a0f1e) con borde redondeado sutil del color de acento.
- Reconocible como abeja: antenas, alas, rayas; con un detalle que aluda a su rol (${title}).`
}

/** Extrae y normaliza el primer bloque <svg…</svg> de una respuesta de LLM. */
export function extractSvg(text: string): string | null {
  const m = text.match(/<svg[\s\S]*?<\/svg>/i)
  if (!m) return null
  let svg = m[0]
  // Asegurar dimensiones explícitas (Pixi rasteriza SVG vía <img>; sin
  // width/height algunos navegadores lo rasterizan a tamaño 0).
  if (!/\bwidth\s*=/i.test(svg)) svg = svg.replace(/<svg/i, '<svg width="128"')
  if (!/\bheight\s*=/i.test(svg)) svg = svg.replace(/<svg/i, '<svg height="128"')
  return svg
}

async function generatePortrait(gameId: string): Promise<PortraitFile | null> {
  const character = resolveCharacter(gameId)
  if (!character) return null

  const result = await Promise.race([
    runHiveLearnConversation({
      agentId: 'hl-image-agent',
      messages: [
        { role: 'user', content: buildPrompt(character.name, character.title, character.color, character.personality) },
      ],
      maxTokens: 2048,
      temperature: 0.6,
      // Genera un retrato de personaje: no lleva datos de ningún alumno.
      runContext: { ageBand: 'adulto' },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout generando retrato')), GEN_TIMEOUT_MS),
    ),
  ])

  const svg = extractSvg(result.content)
  if (!svg) {
    log.warn('el LLM no devolvió SVG válido', { gameId })
    return null
  }

  mkdirSync(PORTRAITS_DIR, { recursive: true })
  const path = join(PORTRAITS_DIR, `${gameId}.svg`)
  await writeFile(path, svg, 'utf8')
  log.info('retrato generado y cacheado', { gameId, path })
  return { path, contentType: 'image/svg+xml' }
}
