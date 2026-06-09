/**
 * Texturas pixel-art generadas proceduralmente en canvas (16×16).
 * Sin assets binarios: cada sprite se "dibuja" con una grilla de caracteres,
 * lo que mantiene el bundle 100% offline. Cuando lleguen spritesheets reales
 * (pixscii/Kenney), basta reemplazar este módulo manteniendo las claves.
 */

import { Texture } from 'pixi.js'
import type { WorldTheme } from '@hivelearn/core/lesson/levelSpec'
import { Tile } from './tilemap'

type Palette = Record<string, string>

/** Convierte una grilla ASCII + paleta en una Texture pixel-art */
function pixelTexture(rows: string[], palette: Palette, scale = 1): Texture {
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

// ─── Abeja jugador (16×16, frames idle / run1 / run2 / jump) ─────────────────

const BEE_PAL: Palette = {
  k: '#1a1a24', y: '#ffcc00', o: '#ff9933', w: '#cfe8ff', W: '#ffffff', e: '#1a1a24', r: '#ff6b6b',
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

const MAYA_PAL: Palette = { ...BEE_PAL, p: '#ff8fb3', g: '#3aa655' }

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

const WASP_PAL: Palette = { k: '#1a1a24', R: '#e25822', r: '#a33b12', w: '#cfe8ff', W: '#ffffff', e: '#fff36b' }

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

// ─── Moneda de polen / corazón / estrella / bandera ──────────────────────────

const COIN = [
  '................',
  '......gggg......',
  '....gghhhhgg....',
  '...gyhyyyyhyg...',
  '...gyyyhhyyyg...',
  '..gyhyhyyhyhyg..',
  '..gyyyhyyhyyyg..',
  '..gyyhyyyyhyyg..',
  '..gyyhyyyyhyyg..',
  '..gyyyhyyhyyyg..',
  '..gyhyhyyhyhyg..',
  '...gyyyhhyyyg...',
  '...gyhyyyyhyg...',
  '....gghhhhgg....',
  '......gggg......',
  '................',
]
const COIN_PAL: Palette = { g: '#b8860b', y: '#ffd700', h: '#fff1a8' }

const HEART = [
  '................',
  '..rrr....rrr....',
  '.rRRRr..rRRRr...',
  'rRRWRRrrRRRRRr..',
  'rRWRRRRRRRRRRr..',
  'rRRRRRRRRRRRRr..',
  'rRRRRRRRRRRRRr..',
  '.rRRRRRRRRRRr...',
  '..rRRRRRRRRr....',
  '...rRRRRRRr.....',
  '....rRRRRr......',
  '.....rRRr.......',
  '......rr........',
  '................',
  '................',
  '................',
]
const HEART_PAL: Palette = { r: '#8b1a2b', R: '#e8334a', W: '#ffb3c0' }

const STAR = [
  '................',
  '.......yy.......',
  '.......yy.......',
  '......yhhy......',
  '......yhhy......',
  '.yyyyyhhhhyyyyy.',
  '..yhhhhhhhhhhy..',
  '...yhhhhhhhhy...',
  '....yhhhhhhy....',
  '....yhhhhhhy....',
  '...yhhy..yhhy...',
  '...yhy....yhy...',
  '..yy........yy..',
  '................',
  '................',
  '................',
]
const STAR_PAL: Palette = { y: '#cc9900', h: '#ffe066' }

const FLAG = [
  '....k...........',
  '....kgggggg.....',
  '....kgyyyyg.....',
  '....kgyhhyg.....',
  '....kgyhhyg.....',
  '....kgyyyyg.....',
  '....kgggggg.....',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '....k...........',
  '...kkk..........',
  '..kkkkk.........',
]
const FLAG_PAL: Palette = { k: '#5b4632', g: '#3aa655', y: '#ffd700', h: '#fff1a8' }

// ─── Bloques ─────────────────────────────────────────────────────────────────

const QBLOCK = [
  'oooooooooooooooo',
  'oyyyyyyyyyyyyyyB',
  'oyByyyyyyyyyyByB',
  'oyyyyykkkkyyyyyB',
  'oyyyykkykkkyyyyB',
  'oyyyykk..kkyyyyB',
  'oyyyy....kkyyyyB',
  'oyyyyy..kkkyyyyB',
  'oyyyyy.kkyyyyyyB',
  'oyyyyy.kkyyyyyyB',
  'oyyyyyy..yyyyyyB',
  'oyyyyy.kk.yyyyyB',
  'oyyyyy.kk.yyyyyB',
  'oyByyyy..yyyyByB',
  'oyyyyyyyyyyyyyyB',
  'oBBBBBBBBBBBBBBB',
]
const QBLOCK_PAL: Palette = { o: '#fff1a8', y: '#ffb300', B: '#8a5a00', k: '#5b3a00' }

const QBLOCK_USED = [
  'oooooooooooooooo',
  'obbbbbbbbbbbbbbB',
  'obBbbbbbbbbbbBbB',
  'obbbbbbbbbbbbbbB',
  'obbbbbbbbbbbbbbB',
  'obbbbbbbbbbbbbbB',
  'obbbbbbbbbbbbbbB',
  'obbbbbbbbbbbbbbB',
  'obbbbbbbbbbbbbbB',
  'obbbbbbbbbbbbbbB',
  'obbbbbbbbbbbbbbB',
  'obbbbbbbbbbbbbbB',
  'obbbbbbbbbbbbbbB',
  'obBbbbbbbbbbbBbB',
  'obbbbbbbbbbbbbbB',
  'oBBBBBBBBBBBBBBB',
]
const QBLOCK_USED_PAL: Palette = { o: '#c9b18a', b: '#a98c5f', B: '#6e5232' }

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
  prado:   { sky: 0x8ecae6, groundTop: '#6dbf4b', ground: '#8a5a2b', groundDark: '#5e3c1c', platform: '#b07f43', hazard: '#7a8b99', decor: '#ff8fb3' },
  bosque:  { sky: 0x4a7c59, groundTop: '#3e8948', ground: '#4d3826', groundDark: '#332417', platform: '#6e5232', hazard: '#5e7261', decor: '#e8334a' },
  montana: { sky: 0xa3b8cc, groundTop: '#b9c4cc', ground: '#7d8a96', groundDark: '#525c66', platform: '#94a3ae', hazard: '#dfe8ee', decor: '#7ec8e3' },
  colmena: { sky: 0xffb300, groundTop: '#ffd966', ground: '#c98a1b', groundDark: '#8a5a00', platform: '#e0a832', hazard: '#a33b12', decor: '#fff1a8' },
}

function groundTexture(theme: WorldTheme): Texture {
  const p = THEME_COLORS[theme]
  const pal: Palette = { t: p.groundTop, g: p.ground, d: p.groundDark }
  const rows = [
    'tttttttttttttttt',
    'tttttttttttttttt',
    'ggggdgggggggdggg',
    'gggggggggggggggg',
    'ggdgggggdggggggg',
    'gggggggggggggggg',
    'ggggggdggggggdgg',
    'gdgggggggggggggg',
    'gggggggdgggggggg',
    'ggggdggggggggggg',
    'gggggggggggdgggg',
    'ggdggggggggggggg',
    'gggggggdgggggggg',
    'gggggggggggggdgg',
    'gdgggggggggggggg',
    'gggggggggggggggg',
  ]
  return pixelTexture(rows, pal)
}

function platformTexture(theme: WorldTheme): Texture {
  const p = THEME_COLORS[theme]
  const pal: Palette = { p: p.platform, d: p.groundDark }
  const rows = [
    'pppppppppppppppp',
    'pdppppdppppdpppp',
    'dddddddddddddddd',
    '................',
    '................', '................', '................', '................',
    '................', '................', '................', '................',
    '................', '................', '................', '................',
  ]
  return pixelTexture(rows, pal)
}

function hazardTexture(theme: WorldTheme): Texture {
  const p = THEME_COLORS[theme]
  const pal: Palette = { h: p.hazard, d: p.groundDark }
  const rows = [
    '................', '................', '................', '................',
    '................', '................', '................', '................',
    '...h....h....h..',
    '..hh...hhh...hh.',
    '..hhh..hhh..hhh.',
    '.hhhh.hhhhh.hhhh',
    '.hhhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhh',
    'dddddddddddddddd',
    'dddddddddddddddd',
  ]
  return pixelTexture(rows, pal)
}

function decorTexture(theme: WorldTheme): Texture {
  const p = THEME_COLORS[theme]
  const pal: Palette = { f: p.decor, g: '#3aa655', y: '#ffd700' }
  const rows = [
    '................', '................', '................', '................',
    '................', '................',
    '......f.f.......',
    '.....fyfyf......',
    '......fff.......',
    '.......g........',
    '.......g........',
    '....g..g........',
    '.....g.g........',
    '......gg........',
    '.......g........',
    '.......g........',
  ]
  return pixelTexture(rows, pal)
}

function doorTexture(): Texture {
  const pal: Palette = { d: '#5b3a00', D: '#8a5a00', y: '#ffd700', k: '#1a1a24' }
  const rows = [
    '....DDDDDDDD....',
    '...DddddddddD...',
    '..DddddddddddD..',
    '..DddddddddddD..',
    '..DddkkkkkkddD..',
    '..DddkyyyykddD..',
    '..DddkyyyykddD..',
    '..DddkkkkkkddD..',
    '..DddddddddddD..',
    '..DddddyddddD...',
    '..DddddyyddddD..',
    '..DddddydddddD..',
    '..DddddddddddD..',
    '..DddddddddddD..',
    '..DddddddddddD..',
    '..DDDDDDDDDDDD..',
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

export function loadTextures(): GameTextures {
  if (cached) return cached
  const tileCache = new Map<WorldTheme, Partial<Record<Tile, Texture>>>()
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
