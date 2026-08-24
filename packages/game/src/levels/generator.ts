/**
 * Generador determinista de niveles: LevelSpec → tilemap + posiciones de
 * entidades. Misma seed = mismo nivel (el alumno puede repetirlo idéntico).
 *
 * Estructura: zona de inicio plana → un segmento por concepto (plataformas,
 * monedas, enemigos y SU bloque '?') con checkpoint entre segmentos →
 * zona final con la puerta del jefe.
 */

import type { LevelSpec, ConceptBlock } from '@hivelearn/core/lesson/levelSpec'
import { Tilemap, Tile } from '../engine/tilemap'
import { seededRandom, TILE } from '../engine/types'

export interface EntitySpawn {
  kind: 'coin' | 'wasp' | 'checkpoint'
  x: number
  y: number
}

export interface BlockSpawn {
  col: number
  row: number
  concept: ConceptBlock
}

export interface GeneratedLevel {
  map: Tilemap
  playerSpawn: { x: number; y: number }
  blocks: BlockSpawn[]
  entities: EntitySpawn[]
  /** Posición de la puerta del jefe (px) */
  door: { x: number; y: number }
}

const ROWS = 18
const SEGMENT_COLS = 24
const START_COLS = 10
const END_COLS = 10

export function generateLevel(spec: LevelSpec): GeneratedLevel {
  const rand = seededRandom(spec.seed)
  const nSegments = Math.max(1, spec.concepts.length)
  const cols = START_COLS + nSegments * SEGMENT_COLS + END_COLS
  const map = new Tilemap(cols, ROWS)

  const groundRow = ROWS - 3
  const blocks: BlockSpawn[] = []
  const entities: EntitySpawn[] = []

  // ── Zona de inicio: suelo plano seguro ──
  fillGround(map, 0, START_COLS - 1, groundRow)
  decorate(map, rand, 1, START_COLS - 2, groundRow)

  // ── Un segmento por concepto ──
  let col = START_COLS
  let currentGround = groundRow
  for (let s = 0; s < nSegments; s++) {
    const concept = spec.concepts[s]
    const segEnd = col + SEGMENT_COLS - 1

    // variación de altura del terreno (más con dificultad)
    const heightVar = spec.difficulty
    currentGround = clampRow(groundRow + Math.floor((rand() - 0.5) * 2 * heightVar))

    // sub-tramos de suelo con huecos pequeños (saltables)
    let c = col
    while (c <= segEnd) {
      const runLen = 5 + Math.floor(rand() * 6)
      const to = Math.min(c + runLen, segEnd)
      fillGround(map, c, to, currentGround)
      decorate(map, rand, c, to, currentGround)

      // monedas sobre el tramo
      const nCoins = 1 + Math.floor(rand() * 3)
      for (let i = 0; i < nCoins; i++) {
        const cx = c + 1 + Math.floor(rand() * Math.max(1, to - c - 1))
        entities.push({ kind: 'coin', x: cx * TILE + TILE / 2, y: (currentGround - 2) * TILE })
      }

      // enemigo según dificultad
      if (to - c >= 4 && rand() < 0.25 + spec.difficulty * 0.15) {
        const ex = c + 2 + Math.floor(rand() * (to - c - 3))
        entities.push({ kind: 'wasp', x: ex * TILE + TILE / 2, y: currentGround * TILE })
      }

      c = to + 1
      if (c <= segEnd) {
        // hueco de 2-3 tiles; con dificultad 3 puede llevar espinas
        const gap = 2 + (rand() < spec.difficulty * 0.2 ? 1 : 0)
        if (spec.difficulty >= 2 && rand() < 0.4) {
          for (let g = 0; g < gap && c + g <= segEnd; g++) map.set(c + g, ROWS - 1, Tile.Hazard)
        }
        // plataforma de ayuda sobre el hueco
        if (gap >= 3) map.fillRow(currentGround - 2, c, c + gap - 1, Tile.Platform)
        c += gap
      }
    }

    // plataformas flotantes con monedas
    const nPlats = 1 + Math.floor(rand() * 2)
    for (let p = 0; p < nPlats; p++) {
      const pc = col + 2 + Math.floor(rand() * (SEGMENT_COLS - 8))
      const pr = clampRow(currentGround - 3 - Math.floor(rand() * 3))
      const pw = 2 + Math.floor(rand() * 3)
      map.fillRow(pr, pc, pc + pw, Tile.Platform)
      entities.push({ kind: 'coin', x: (pc + 1) * TILE + TILE / 2, y: (pr - 1) * TILE })
    }

    // el bloque '?' del concepto: a altura de salto, en la mitad del segmento
    if (concept) {
      const bc = col + Math.floor(SEGMENT_COLS / 2) + Math.floor((rand() - 0.5) * 6)
      const br = clampRow(currentGround - 4)
      // asegurar suelo debajo para poder golpearlo
      fillGround(map, bc - 1, bc + 1, currentGround)
      clearAbove(map, bc, br, currentGround)
      blocks.push({ col: bc, row: br, concept })
    }

    // checkpoint al final del segmento (salvo el último)
    if (s < nSegments - 1) {
      fillGround(map, segEnd - 1, segEnd, currentGround)
      map.set(segEnd, currentGround - 1, Tile.Checkpoint)
      entities.push({ kind: 'checkpoint', x: segEnd * TILE + TILE / 2, y: (currentGround - 1) * TILE })
    }

    col = segEnd + 1
  }

  // ── Zona final: explanada con la puerta del jefe ──
  fillGround(map, col, cols - 1, groundRow)
  const doorCol = cols - 4
  map.set(doorCol, groundRow - 1, Tile.GoalDoor)
  map.set(doorCol, groundRow - 2, Tile.GoalDoor)

  return {
    map,
    playerSpawn: { x: 3 * TILE, y: (groundRow - 2) * TILE },
    blocks,
    entities,
    door: { x: doorCol * TILE, y: (groundRow - 2) * TILE },
  }
}

function fillGround(map: Tilemap, from: number, to: number, groundRow: number) {
  for (let c = from; c <= to; c++) {
    for (let r = groundRow; r < map.rows; r++) map.set(c, r, Tile.Ground)
  }
}

/** Limpia tiles entre el bloque y el suelo para que sea alcanzable */
function clearAbove(map: Tilemap, col: number, fromRow: number, toRow: number) {
  for (let r = fromRow; r < toRow; r++) {
    if (map.get(col, r) === Tile.Ground || map.get(col, r) === Tile.Platform) map.set(col, r, Tile.Empty)
  }
}

function decorate(map: Tilemap, rand: () => number, from: number, to: number, groundRow: number) {
  for (let c = from; c <= to; c++) {
    if (rand() < 0.15) map.set(c, groundRow - 1, Tile.Decor)
  }
}

function clampRow(r: number): number {
  return Math.max(8, Math.min(ROWS - 3, r))
}

/** Nivel demo para desarrollo (?devLevel=1) y para la espera del pipeline */
export function demoLevelSpec(): LevelSpec {
  return {
    lessonId: 'demo-nivel-1',
    sessionId: 'demo',
    titulo: 'El Prado de Prueba',
    seed: 'demo:0',
    theme: 'jardin',
    difficulty: 1,
    concepts: [
      {
        nodeId: 'demo-1',
        titulo: '¡Bienvenido a HiveLearn!',
        contenido: 'Este es un bloque de concepto. Cuando juegues una lección de verdad, aquí aparecerá lo que la IA preparó para ti.\n\nEjemplo: las abejas se comunican bailando. ¡En serio!',
        xp: 10,
        ttsText: 'Bienvenido a HiveLearn.',
        microEval: {
          pregunta: '¿Cómo se comunican las abejas?',
          opciones: ['Bailando', 'Cantando', 'Por radio'],
          indiceCorrecto: 0,
          pista: 'Lo acabas de leer arriba 😉',
        },
      },
      {
        nodeId: 'demo-2',
        titulo: 'Los bloques ? guardan saberes',
        contenido: 'Golpea todos los bloques ? del nivel para abrir la puerta del jefe al final.',
        xp: 10,
        ttsText: 'Golpea todos los bloques.',
      },
    ],
    boss: {
      nombre: 'Avispón de Prueba',
      preguntas: [
        { pregunta: '¿Qué hay que hacer antes de pelear con el jefe?', opciones: ['Abrir todos los bloques ?', 'Nada', 'Correr en círculos'], indiceCorrecto: 0 },
        { pregunta: '¿Las abejas bailan para comunicarse?', opciones: ['Verdadero', 'Falso'], indiceCorrecto: 0 },
      ],
    },
  }
}
