/**
 * Agentes del pipeline HiveLearn representados como abejas especializadas
 * de la colmena. Cada agente tiene un sprite, nombre, color y rol.
 */

import { Texture } from 'pixi.js'
import { pixelTexture } from '../engine/textures'

export type HiveAgentId =
  | 'coordinator'
  | 'content'
  | 'practice'
  | 'assessment'
  | 'image'
  | 'infographic'
  | 'audio'
  | 'gamification'

export interface HiveAgent {
  id: HiveAgentId
  name: string
  title: string
  emoji: string
  description: string
  color: number
  sprite: Texture
}

// Paleta base compartida para todos los agentes-abeja
const BASE: Record<string, string> = {
  k: '#1a1208', // contorno
  y: '#ffd700', // dorado cuerpo
  Y: '#ffb300', // ámbar cuerpo
  w: '#fff8e1', // alas
  W: '#ffffff', // brillo alas
  e: '#1a1208', // ojos
}

/** Definición cruda de sprite (filas + paleta) — compartida con el atlas Three.js */
export interface SpriteDef {
  rows: string[]
  palette: Record<string, string>
}

function buildAgentSpriteDef(accent: string, mark: string): SpriteDef {
  // 16x16 abeja con acento de color en el pecho/marca
  return {
    rows: [
      '.....ww..ww.....',
      '....wWWwwWWw....',
      '....wWWwwWWw....',
      '.....ww..ww.....',
      '...kkkkkkkkk....',
      '..kyyyyyyyyyk...',
      '.kyyekyyyykey...',
      '.kyyyayyyyyyk..',
      '.kkkkkkkkkkkkk..',
      '.kyyyyyyyyyyk..',
      '.kkkkkkkkkkkkk..',
      '..kyyyyyyyyyk...',
      '...kkkkkkkkk....',
      '....m...m.......',
      '................',
      '................',
    ],
    palette: { ...BASE, a: accent, m: mark },
  }
}

export const AGENT_SPRITE_DEFS: Record<HiveAgentId, SpriteDef> = {
  coordinator:  buildAgentSpriteDef('#9c27b0', '#e1bee7'),
  content:      buildAgentSpriteDef('#ff8fb3', '#ffd700'),
  practice:     buildAgentSpriteDef('#ffb300', '#fff8e1'),
  assessment:   buildAgentSpriteDef('#e25822', '#ffffff'),
  image:        buildAgentSpriteDef('#4fc3f7', '#ffffff'),
  infographic:  buildAgentSpriteDef('#66bb6a', '#ffffff'),
  audio:        buildAgentSpriteDef('#ba68c8', '#ffffff'),
  gamification: buildAgentSpriteDef('#ffd700', '#ff6f00'),
}

export const HIVE_AGENTS: Record<HiveAgentId, HiveAgent> = {
  coordinator: {
    id: 'coordinator',
    name: 'Reina Miel',
    title: 'Coordinadora del Enjambre',
    emoji: '👑',
    description: 'Planifica tu camino de aprendizaje y coordina a todas las abejas.',
    color: 0x9c27b0,
    sprite: pixelTexture(AGENT_SPRITE_DEFS.coordinator.rows, AGENT_SPRITE_DEFS.coordinator.palette),
  },
  content: {
    id: 'content',
    name: 'Polen',
    title: 'Abeja Recolectora',
    emoji: '🌸',
    description: 'Recoleta las mejores explicaciones y ejemplos para cada concepto.',
    color: 0xff8fb3,
    sprite: pixelTexture(AGENT_SPRITE_DEFS.content.rows, AGENT_SPRITE_DEFS.content.palette),
  },
  practice: {
    id: 'practice',
    name: 'Cera',
    title: 'Abeja Obrera',
    emoji: '🔧',
    description: 'Construye ejercicios y retos prácticos para que aprendas haciendo.',
    color: 0xffb300,
    sprite: pixelTexture(AGENT_SPRITE_DEFS.practice.rows, AGENT_SPRITE_DEFS.practice.palette),
  },
  assessment: {
    id: 'assessment',
    name: 'Guardia',
    title: 'Abeja Guardiana',
    emoji: '🛡️',
    description: 'Prepara las preguntas que ponen a prueba lo aprendido.',
    color: 0xe25822,
    sprite: pixelTexture(AGENT_SPRITE_DEFS.assessment.rows, AGENT_SPRITE_DEFS.assessment.palette),
  },
  image: {
    id: 'image',
    name: 'Pigmento',
    title: 'Abeja Arquitecta Visual',
    emoji: '🎨',
    description: 'Dibuja diagramas e imágenes que hacen los conceptos visibles.',
    color: 0x4fc3f7,
    sprite: pixelTexture(AGENT_SPRITE_DEFS.image.rows, AGENT_SPRITE_DEFS.image.palette),
  },
  infographic: {
    id: 'infographic',
    name: 'Mapa',
    title: 'Abeja Cartógrafa',
    emoji: '🗺️',
    description: 'Resume lo importante en infografías claras y fáciles de recordar.',
    color: 0x66bb6a,
    sprite: pixelTexture(AGENT_SPRITE_DEFS.infographic.rows, AGENT_SPRITE_DEFS.infographic.palette),
  },
  audio: {
    id: 'audio',
    name: 'Melodia',
    title: 'Abeja Cantora',
    emoji: '🎵',
    description: 'Prepara narraciones y audios para que escuches mientras juegas.',
    color: 0xba68c8,
    sprite: pixelTexture(AGENT_SPRITE_DEFS.audio.rows, AGENT_SPRITE_DEFS.audio.palette),
  },
  gamification: {
    id: 'gamification',
    name: 'Festiva',
    title: 'Abeja Celebradora',
    emoji: '🎉',
    description: 'Reparte XP, estrellas y logros cuando avanzas.',
    color: 0xffd700,
    sprite: pixelTexture(AGENT_SPRITE_DEFS.gamification.rows, AGENT_SPRITE_DEFS.gamification.palette),
  },
}

export function getAgent(id: HiveAgentId): HiveAgent {
  return HIVE_AGENTS[id]
}

export const AGENT_ORDER: HiveAgentId[] = [
  'coordinator',
  'content',
  'practice',
  'assessment',
  'image',
  'infographic',
  'audio',
  'gamification',
]
