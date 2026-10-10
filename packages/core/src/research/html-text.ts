/**
 * Extracción de texto de HTML, sin dependencias. No es un parser completo: su objetivo es entregar al modelo
 * texto plano acotado y sin marcado ejecutable ni contenido oculto evidente.
 */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' }

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d{1,6});/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' ' })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' ' })
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
}

/** Caracteres de control y de ancho cero / formato bidireccional (usados para ocultar instrucciones). */
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g

export function cleanText(input: string): string {
  return input.replace(INVISIBLE, '').replace(/[ \t\f\v ]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export interface ExtractedPage { title: string; text: string }

export function htmlToText(html: string, maxChars = 20_000): ExtractedPage {
  const title = cleanText(decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]*>/g, ' '))).slice(0, 200)
  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe|object|embed|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    // Elementos ocultos evidentes: un sitio hostil los usa para esconder instrucciones al modelo.
    .replace(/<([a-z][a-z0-9]*)\b[^>]*\b(?:hidden|aria-hidden\s*=\s*["']true["']|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0)[^"']*["'])[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|br|blockquote|pre)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
  body = cleanText(decodeEntities(body))
  return { title, text: body.slice(0, maxChars) }
}

/** Texto plano (text/plain, markdown, json): solo se limpia. */
export function plainToText(raw: string, maxChars = 20_000): ExtractedPage {
  return { title: '', text: cleanText(raw).slice(0, maxChars) }
}
