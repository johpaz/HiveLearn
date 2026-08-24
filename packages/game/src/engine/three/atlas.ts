/**
 * atlas — Fábrica de texturas Three.js a partir de los sprites de píxeles
 * del juego (misma fuente que Pixi: `pixelTexture` sobre canvas 2D).
 *
 * - `canvasTextureFromSpriteDef`: píxel-art → THREE.CanvasTexture (NearestFilter).
 * - `glowTexture`: halo radial suave para auras por color de personaje.
 *
 * Todas las texturas se cachean por clave: la ceremonia y los futuros niveles
 * Three-native comparten GPU memory.
 */
import * as THREE from 'three'
import { AGENT_SPRITE_DEFS, type SpriteDef } from '../../entities/agents'
import type { HiveAgentId } from '../../entities/agents'

const cache = new Map<string, THREE.CanvasTexture>()

/** Píxel-art → CanvasTexture con nearest-neighbor (estética pixel crisp) */
export function canvasTexture(key: string, def: SpriteDef): THREE.CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit

  const h = def.rows.length
  const w = def.rows[0]!.length
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  for (let y = 0; y < h; y++) {
    const row = def.rows[y]!
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.'
      if (ch === '.' || ch === ' ') continue
      const color = def.palette[ch]
      if (!color) continue
      g.fillStyle = color
      g.fillRect(x, y, 1, 1)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  cache.set(key, tex)
  return tex
}

/** Textura de abeja-agente por id corto (coordinator, content, …) */
export function agentBeeTexture(agentId: string): THREE.CanvasTexture {
  const id = normalize(agentId)
  return canvasTexture(`bee:${id}`, AGENT_SPRITE_DEFS[id])
}

/** Halo radial blanco → transparente; teñir con sprite.material.color */
export function glowTexture(): THREE.CanvasTexture {
  const key = '__glow64'
  const hit = cache.get(key)
  if (hit) return hit

  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  cache.set(key, tex)
  return tex
}

function normalize(agentId: string): HiveAgentId {
  const id = agentId.trim().toLowerCase()
  if (id === 'maya' || id.includes('onboarding')) return 'coordinator' // Maya usa look de reina-guía dorado
  if (id.includes('coordinator')) return 'coordinator'
  if (id.includes('content') || id.includes('explanation')) return 'content'
  if (id.includes('practice') || id.includes('exercise')) return 'practice'
  if (id.includes('assessment') || id.includes('evaluation')) return 'assessment'
  if (id.includes('image')) return 'image'
  if (id.includes('infographic')) return 'infographic'
  if (id.includes('audio')) return 'audio'
  if (id.includes('gamification')) return 'gamification'
  return 'content'
}
