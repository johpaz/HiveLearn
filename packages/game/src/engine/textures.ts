/**
 * Texturas pixel-art generadas proceduralmente en canvas (16×16).
 * Sin assets binarios: cada sprite se "dibuja" con una grilla de caracteres,
 * lo que mantiene el bundle 100% offline. Cuando lleguen spritesheets reales
 * (pixscii/Kenney), basta reemplazar este módulo manteniendo las claves.
 *
 * Estética: colmena / panal / abeja — todos los temas son variantes del
 * interior y alrededores de una colmena.
 */

import { Texture } from 'pixi.js'
import type { WorldTheme } from '@hivelearn/core/lesson/levelSpec'
import { Tile } from './tilemap'

type Palette = Record<string, string>

/** Convierte una grilla ASCII + paleta en una Texture pixel-art */
export function pixelTexture(rows: string[], palette: Palette, scale = 1): Texture {
  const h = rows.length
  const w = rows[0].length
  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const g = canvas.getContext('2d')!
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x]
      if (ch === '.' || ch === ' ') continue
      g.fillStyle = palette[ch] ?? '#ff00ff'
      g.fillRect(x * scale, y * scale, scale, scale)
    }
  }
  const tex = Texture.from(canvas)
  tex.source.scaleMode = 'nearest'
  return tex
}

// ─── Paleta base de colmena ─────────────────────────────────────────────────

const HONEY_PAL: Palette = {
  k: '#1a1208', // contorno / cera muy oscura
  K: '#3d2817', // sombra cera
  c: '#6b4423', // cera marrón
  C: '#8b5a2b', // cera
  w: '#fff8e1', // cera clara / ala
  W: '#ffffff', // brillo
  y: '#ffd700', // dorado
  Y: '#ffb300', // ámbar
  h: '#ffecb3', // miel clara
  H: '#ffc107', // miel
  o: '#ffab40', // naranja suave
  O: '#e65100', // naranja oscuro
  r: '#d84315', // rojo/corazón oscuro
  R: '#ff7043', // coral
  p: '#ff8fb3', // rosa flor
  P: '#f06292', // rosa fuerte
  g: '#9e7c3c', // tallo cera-marrón
  G: '#c9a227', // cera dorada
  b: '#5e3c1c', // marrón oscuro
  B: '#3e2714', // marrón muy oscuro
  a: '#7b1fa2', // púrpura real
  A: '#9c27b0', // púrpura
  d: '#5d4037', // tierra oscura
  D: '#8d6e63', // tierra
  s: '#b39ddb', // cielo sala real
  S: '#9575cd', // púrpura claro
  n: '#ff9800', // néctar
  N: '#ff6f00', // néctar oscuro
}

// ─── Abeja jugadora (16×16, frames idle / run1 / run2 / jump) ────────────────

const BEE_PAL: Palette = {
  k: '#1a1208',
  y: '#ffd700',
  Y: '#ffb300',
  w: '#fff8e1',
  W: '#ffffff',
  e: '#1a1208',
  r: '#d84315',
}

const BEE_IDLE = [
  '................',
  '.....ww..ww.....',
  '....wWWwwWWw....',
  '....wWWwwWWw....',
  '.....ww..ww.....',
  '...kkkkkkkkk....',
  '..kyyyyyyyyyk...',
  '.kyyekyyyykey...',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '..kyyyyyyyyyk...',
  '...kkkkkkkkk....',
  '.....r...r......',
  '................',
]

const BEE_RUN1 = [
  '................',
  '....ww....ww....',
  '...wWWw..wWWw...',
  '....ww....ww....',
  '...kkkkkkkkk....',
  '..kyyyyyyyyyk...',
  '.kyyekyyyykey...',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '..kyyyyyyyyyk...',
  '...kkkkkkkkk....',
  '....r...r.......',
  '......r.........',
  '................',
]

const BEE_RUN2 = [
  '................',
  '................',
  '....ww....ww....',
  '...wWWw..wWWw...',
  '...kkkkkkkkk....',
  '..kyyyyyyyyyk...',
  '.kyyekyyyykey...',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '..kyyyyyyyyyk...',
  '...kkkkkkkkk....',
  '......r..r......',
  '................',
  '................',
]

const BEE_JUMP = [
  '....ww....ww....',
  '...wWWw..wWWw...',
  '...wWWw..wWWw...',
  '....ww....ww....',
  '...kkkkkkkkk....',
  '..kyyyyyyyyyk...',
  '.kyyekyyyykey...',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '..kyyyyyyyyyk...',
  '...kkkkkkkkk....',
  '.....r..r.......',
  '................',
  '................',
]

// ─── NPC Maya (abeja guía con flor) ──────────────────────────────────────────

const MAYA = [
  '.....ww..ww.....',
  '....wWWwwWWw....',
  '....wWWwwWWw....',
  '.....ww..ww.....',
  '...kkkkkkkkk....',
  '..kyyyyyyyyyk...',
  '.kyyekyyyykey...',
  '.kyyyyrryyyyyk..',
  '.kkkkkkkkkkkkk..',
  '.kyyyyyyyyyyyk..',
  '.kkkkkkkkkkkkk..',
  '..kyyyyyyyyyk...',
  '...kkkkkkkkk....',
  '....p..p..p.....',
  '.....pppp.......',
  '......gg........',
]

const MAYA_PAL: Palette = { ...BEE_PAL, p: '#ff8fb3', g: '#9e7c3c' }

// ─── Enemigo avispón ─────────────────────────────────────────────────────────

const WASP = [
  '................',
  '....ww....ww....',
  '...wWWw..wWWw...',
  '....ww....ww....',
  '..rkkkkkkkkkr...',
  '.rkRRRRRRRRRkr..',
  '.kRReRRRRReRRk..',
  '.kRRRRRRRRRRRk..',
  '.kkkkkkkkkkkkk..',
  '.kRRRRRRRRRRRk..',
  '.kkkkkkkkkkkkk..',
  '..kRRRRRRRRRk...',
  '...kkkkkkkkkk...',
  '.....k....k.....',
  '......kk........',
  '.......k........',
]

const WASP_PAL: Palette = { k: '#1a1208', R: '#e25822', r: '#a33b12', w: '#fff8e1', W: '#ffffff', e: '#fff36b' }

// ─── Jefe (avispón grande se renderiza escalando esta base) ──────────────────

const BOSS = [
  '..ww........ww..',
  '.wWWw......wWWw.',
  '.wWWWw....wWWWw.',
  '..www..kk..www..',
  '....kkkRRkkk....',
  '..kkRRRRRRRRkk..',
  '.kRReRRRRRReRRk.',
  '.kRRRRRkkRRRRRk.',
  '.kkkkkkkkkkkkkk.',
  '.kRRRRRRRRRRRRk.',
  '.kkkkkkkkkkkkkk.',
  '.kRRRRRRRRRRRRk.',
  '..kkkkkkkkkkkk..',
  '...k.k....k.k...',
  '....kk....kk....',
  '.....k.....k....',
]

// ─── Gota de néctar / corazón de abeja / estrella de colmena / banderín ───────

const COIN = [
  '................',
  '......YYYY......',
  '....YYhhhhYY....',
  '...YhhYYYYhhY...',
  '..YhYYYYYYYYhY..',
  '..YhYYYYYYYYhY..',
  '..YhYYYYWWYYhY..',
  '..YhYYYYYYYYhY..',
  '..YhYYYYYYYYhY..',
  '...YhhYYYYhhY...',
  '....YYhhhhYY....',
  '......YYYY......',
  '................',
  '................',
  '................',
  '................',
]
const COIN_PAL: Palette = { Y: '#ffd700', h: '#ffab40', W: '#ffffff' }

const HEART = [
  '................',
  '..kkk....kkk....',
  '.kYYYk..kYYYk...',
  'kYkYkYkkYkYkYk..',
  'kYYYYYYYYYYYYk..',
  'kYkYkYYYYYkYkY..',
  'kYYYYYYYYYYYYk..',
  '.kYYYYYYYYYYk...',
  '..kYYYYYYYYk....',
  '...kYYYYYYk.....',
  '....kYYYYk......',
  '.....kYYk.......',
  '......kk........',
  '................',
  '................',
  '................',
]
const HEART_PAL: Palette = { k: '#1a1208', Y: '#ffd700', W: '#ffffff' }

const STAR = [
  '................',
  '.......YY.......',
  '.......YY.......',
  '......YYYY......',
  '.Y...YYYYYY...Y.',
  '..Y.YYYYYYYY.Y..',
  '...YYYYYYYYYY...',
  '.YYYYYYYYYYYYYY.',
  '.YYYYYYYYYYYYYY.',
  '...YYYYYYYYYY...',
  '..Y.YYYYYYYY.Y..',
  '.Y...YYYYYY...Y.',
  '......YYYY......',
  '.......YY.......',
  '.......YY.......',
  '................',
]
const STAR_PAL: Palette = { Y: '#ffb300', y: '#ffd700' }

const FLAG = [
  '....k...........',
  '....kYYYYYYk....',
  '....kYYYYYYYYk..',
  '....kYYYYYYk....',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '...kkk..........',
  '..kkkkk.........',
  '................',
]
const FLAG_PAL: Palette = { k: '#5e3c1c', Y: '#ffd700' }

// ─── Bloques ─────────────────────────────────────────────────────────────────

const QBLOCK = [
  'CCCCCCCCCCCCCCCC',
  'CHHHHHHHHHHHHHHC',
  'CHH..HHHHH..HHHC',
  'CHH..HYYHH..HHHC',
  'CHH..HYHHH..HHHC',
  'CHH..HYYHH..HHHC',
  'CHH..HHHHH..HHHC',
  'CHHHHHHHHHHHHHHC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
]
const QBLOCK_PAL: Palette = { C: '#6b4423', H: '#ffecb3', Y: '#ff9800' }

const QBLOCK_USED = [
  'CCCCCCCCCCCCCCCC',
  'CHHHHHHHHHHHHHHC',
  'CHH..HHHHH..HHHC',
  'CHH..H..H..HHHHC',
  'CHH..H..H..HHHHC',
  'CHH..HHHHH..HHHC',
  'CHHHHHHHHHHHHHHC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
]
const QBLOCK_USED_PAL: Palette = { C: '#5e3c1c', H: '#c9b18a' }

// ─── Tiles de terreno por tema ───────────────────────────────────────────────

interface ThemePalette {
  sky: number
  groundTop: string
  ground: string
  groundDark: string
  platform: string
  hazard: string
  decor: string
}

export const THEME_COLORS: Record<WorldTheme, ThemePalette> = {
  jardin:    { sky: 0xffe082, groundTop: '#ffd54f', ground: '#d4a017', groundDark: '#8b6914', platform: '#c68e17', hazard: '#b86d29', decor: '#ff8a65' },
  almacen:   { sky: 0xffc107, groundTop: '#ffb300', ground: '#c7831d', groundDark: '#8b5a1a', platform: '#e09200', hazard: '#a0522d', decor: '#ffd54f' },
  criadero:  { sky: 0xffcc80, groundTop: '#ffab40', ground: '#c97b1b', groundDark: '#8b4513', platform: '#d98c2a', hazard: '#a83e1d', decor: '#ff7043' },
  sala_real: { sky: 0xd1b3ff, groundTop: '#e1c699', ground: '#9c7c3c', groundDark: '#5d4037', platform: '#b8860b', hazard: '#7b1fa2', decor: '#ffd700' },
}

function groundTexture(theme: WorldTheme): Texture {
  const p = THEME_COLORS[theme]
  const pal: Palette = { t: shadeColor(p.groundTop), g: shadeColor(p.ground), d: shadeColor(p.groundDark) }
  // Panal de cera: celdas hexagonales en bands offset (identidad "Panal de Cuentos")
  const grid: string[][] = Array.from({ length: 16 }, () => Array<string>(16).fill('g'))
  const hexCell = (cx: number, cy: number) => {
    // contorno hexagonal 6x6
    const outline: Array<[number, number]> = [
      [1, 0], [2, 0], [3, 0], [4, 0],
      [0, 1], [5, 1], [0, 2], [5, 2], [0, 3], [5, 3], [0, 4], [5, 4],
      [1, 5], [2, 5], [3, 5], [4, 5],
    ]
    for (const [dx, dy] of outline) {
      const x = cx + dx, y = cy + dy
      if (y >= 0 && y < 16 && x >= 0 && x < 16) grid[y]![x] = 'd'
    }
    // relleno con brillo superior
    for (let dy = 1; dy < 5; dy++) {
      for (let dx = 1; dx < 5; dx++) {
        const x = cx + dx, y = cy + dy
        if (y >= 0 && y < 16 && x >= 0 && x < 16) grid[y]![x] = dy === 1 ? 't' : 'g'
      }
    }
  }
  // fila superior = superficie iluminada
  for (let x = 0; x < 16; x++) grid[0]![x] = 't'
  // bands de celdas: offsets alternos para el patrón honeycomb
  const bands: Array<{ y: number; xs: number[] }> = [
    { y: 1, xs: [1, 9] },
    { y: 7, xs: [5, 13] },
    { y: 13, xs: [1, 9] },
  ]
  for (const { y, xs } of bands) for (const x of xs) hexCell(x, y)
  const rows = grid.map(r => r.join(''))
  return pixelTexture(rows, pal)
}

function platformTexture(theme: WorldTheme): Texture {
  const p = THEME_COLORS[theme]
  const pal: Palette = { p: shadeColor(p.platform), d: shadeColor(p.groundDark), h: '#ffc107', H: '#ffecb3' }
  const rows = [
    'pppppppppppppppp',
    'pppppppppppppppp',
    'dddddddddddddddd',
    '.......HH.......',
    '......HHHH......',
    '......HHHH......',
    '......HHHH......',
    '.......HH.......',
    '................', '................', '................', '................',
    '................', '................', '................', '................',
  ]
  return pixelTexture(rows, pal)
}

function hazardTexture(theme: WorldTheme): Texture {
  const p = THEME_COLORS[theme]
  const pal: Palette = { h: shadeColor(p.hazard), H: '#ffc107', W: '#ffffff' }
  const rows = [
    '................', '................',
    '.......HH.......',
    '......HHHH......',
    '.....HHHHHH.....',
    '....HHHHWWHH....',
    '...HHHHHHHHHH...',
    '..HHHHHHHHHHHH..',
    '..HHHHHHHHHHHH..',
    '...HHHHHHHHHH...',
    '....HHHHHHHH....',
    '.....HHHHHH.....',
    '......HHHH......',
    '.......HH.......',
    '................', '................',
  ]
  return pixelTexture(rows, pal)
}

function decorTexture(theme: WorldTheme): Texture {
  const p = THEME_COLORS[theme]
  const pal: Palette = { f: shadeColor(p.decor), F: '#f06292', g: '#9e7c3c', y: '#ffd700' }
  const rows = [
    '................', '................',
    '.......f.f......',
    '......fFfFf.....',
    '.......fff......',
    '.......ggg......',
    '.......ggg......',
    '......ggggg.....',
    '.......ggg......',
    '.......ggg......',
    '.......ggg......',
    '................', '................', '................', '................', '................',
  ]
  return pixelTexture(rows, pal)
}

function doorTexture(): Texture {
  const pal: Palette = { d: '#6b4423', D: '#8b5a2b', Y: '#ffd700', h: '#ffecb3', H: '#ffc107' }
  const rows = [
    'DDDDDDDDDDDDDDDD',
    'DhhhhhhhhhhhhhhD',
    'Dh............hD',
    'Dh..YYYYYYYY..hD',
    'Dh..YHHHHHHY..hD',
    'Dh..YHHYYHHY..hD',
    'Dh..YHHHHHHY..hD',
    'Dh..YYYYYYYY..hD',
    'Dh............hD',
    'Dh............hD',
    'Dh............hD',
    'DhhhhhhhhhhhhhhD',
    'DDDDDDDDDDDDDDDD',
    'DDDDDDDDDDDDDDDD',
    'DDDDDDDDDDDDDDDD',
    'DDDDDDDDDDDDDDDD',
  ]
  return pixelTexture(rows, pal)
}

// ─── Atlas público ───────────────────────────────────────────────────────────

export interface GameTextures {
  bee: { idle: Texture; run1: Texture; run2: Texture; jump: Texture }
  maya: Texture
  wasp: Texture
  boss: Texture
  coin: Texture
  heart: Texture
  star: Texture
  flag: Texture
  qblock: Texture
  qblockUsed: Texture
  tiles: (theme: WorldTheme) => Partial<Record<Tile, Texture>>
}

let cached: GameTextures | null = null

// ── Tema "Panal de Cuentos": shade global de tiles ──────────────────────────
// Solo los tiles del mundo se tiñen; los personajes conservan color vivo
// para destacar contra escenarios más oscuros/claros según el alumno.

let tileShade = 0
const tileCacheByShade = new Map<string, Map<WorldTheme, Partial<Record<Tile, Texture>>>>()

/** Ajusta la luminosidad de los tilesets (k ∈ [-1,1]). Regenera bajo demanda. */
export function setTexturesShade(k: number): void {
  const clamped = Math.max(-1, Math.min(1, Math.round(k * 100) / 100))
  if (clamped === tileShade) return
  tileShade = clamped
  cached = null // fuerza regeneración con el nuevo shade
}

/** Aplica el shade activo a un color de paleta '#rrggbb' */
function shadeColor(hex: string): string {
  if (tileShade === 0) return hex
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff
  const t = tileShade > 0 ? 255 : 0
  const a = Math.abs(tileShade) * 0.6 // moderado: el mundo nunca se pierde
  const mix = (c: number) => Math.round(c + (t - c) * a)
    .toString(16).padStart(2, '0')
  return `#${mix(r)}${mix(g)}${mix(b)}`
}

export function loadTextures(): GameTextures {
  if (cached) return cached
  const shadeKey = String(tileShade)
  if (!tileCacheByShade.has(shadeKey)) {
    tileCacheByShade.set(shadeKey, new Map())
  }
  const tileCache = tileCacheByShade.get(shadeKey)!
  cached = {
    bee: {
      idle: pixelTexture(BEE_IDLE, BEE_PAL),
      run1: pixelTexture(BEE_RUN1, BEE_PAL),
      run2: pixelTexture(BEE_RUN2, BEE_PAL),
      jump: pixelTexture(BEE_JUMP, BEE_PAL),
    },
    maya: pixelTexture(MAYA, MAYA_PAL),
    wasp: pixelTexture(WASP, WASP_PAL),
    boss: pixelTexture(BOSS, WASP_PAL),
    coin: pixelTexture(COIN, COIN_PAL),
    heart: pixelTexture(HEART, HEART_PAL),
    star: pixelTexture(STAR, STAR_PAL),
    flag: pixelTexture(FLAG, FLAG_PAL),
    qblock: pixelTexture(QBLOCK, QBLOCK_PAL),
    qblockUsed: pixelTexture(QBLOCK_USED, QBLOCK_USED_PAL),
    tiles: (theme: WorldTheme) => {
      let t = tileCache.get(theme)
      if (!t) {
        t = {
          [Tile.Ground]: groundTexture(theme),
          [Tile.Platform]: platformTexture(theme),
          [Tile.Hazard]: hazardTexture(theme),
          [Tile.Decor]: decorTexture(theme),
          [Tile.GoalDoor]: doorTexture(),
          [Tile.Checkpoint]: pixelTexture(FLAG, FLAG_PAL),
        }
        tileCache.set(theme, t)
      }
      return t
    },
  }
  return cached
}
