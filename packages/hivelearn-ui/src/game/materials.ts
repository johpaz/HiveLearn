/**
 * Materiales del mundo con TSL (se compilan a WGSL o a GLSL según el backend). Todo se genera por código: no hay
 * texturas ni archivos. Los valores de color pueden pasar de 1 a propósito: el bloom y el tone mapping hacen el resto.
 */
import {
  AdditiveBlending, BackSide, Color, DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SpriteNodeMaterial,
} from 'three/webgpu'
import {
  abs, attribute, dot, float, floor, fract, max, mix, mx_noise_float, normalGeometry, normalize, positionGeometry, pow, sin,
  smoothstep, step, time, uniform, uv, vec3,
} from 'three/tsl'
import type { CellVisual } from './layout'

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any

export interface StateLook { color: string; glow: number; height: number }

/** Aspecto de cada estado: neón sobre acero oscuro. El brillo es el que reciben el bloom y el emisivo de la baldosa. */
export const LOOK: Record<CellVisual, StateLook> = {
  locked: { color: '#2b4766', glow: 0.14, height: 0.25 },
  available: { color: '#22d3ee', glow: 0.55, height: 0.55 },
  tried: { color: '#ff6a3d', glow: 0.85, height: 0.5 },
  mastered: { color: '#ffc933', glow: 1.25, height: 1.05 },
  ready: { color: '#7dffd8', glow: 1.5, height: 0.9 },
  passed: { color: '#ffd966', glow: 1.1, height: 1.2 },
  hold: { color: '#ff7a6b', glow: 1.0, height: 0.7 },
  review: { color: '#b99cff', glow: 0.9, height: 0.8 },
}

/** Distancia al borde de un hexágono unitario con vértices sobre el eje z (como `CylinderGeometry(…, 6)`). */
const hexDistance = (p: N): N => max(abs(p.x).mul(1.1547005), abs(p.x).mul(0.57735).add(abs(p.z)))

/**
 * Baldosa holográfica. Lee dos atributos por instancia: `aTint` (color) y `aInfo` (x = brillo, y = destello). El borde
 * del hexágono brilla más que el centro y una línea de barrido recorre la cara superior.
 */
export function platformMaterial(): MeshStandardNodeMaterial {
  const tint = attribute('aTint', 'vec3') as N
  const info = attribute('aInfo', 'vec2') as N
  const top = step(0.5, (normalGeometry as N).y)
  const d = hexDistance(positionGeometry)
  const rim = smoothstep(0.76, 0.93, d).mul(top)
  const scan = sin((positionGeometry as N).x.mul(7).add((positionGeometry as N).z.mul(4)).sub(time.mul(1.7))).mul(0.5).add(0.5)
  const material = new MeshStandardNodeMaterial({ roughness: 0.34, metalness: 0.72 })
  material.colorNode = mix(vec3(0.04, 0.065, 0.1), tint.mul(0.2), top)
  material.emissiveNode = tint.mul(rim.mul(2.1).add(top.mul(scan.mul(0.16).add(0.2)))).mul(info.x)
    .add(vec3(1, 1, 1).mul(info.y).mul(top).mul(0.9))
  return material
}

/** Base de cada isla: acero oscuro con un anillo de neón en el borde (el color lo marca el estado del nivel). */
export function padMaterial(): { material: MeshStandardNodeMaterial; tint: { value: Color }; glow: { value: number } } {
  const tint = uniform(new Color('#22d3ee')) as N
  const glow = uniform(1) as N
  const d = hexDistance(positionGeometry)
  const rim = smoothstep(0.9, 0.985, d).mul(step(0.5, (normalGeometry as N).y))
  const material = new MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.8 })
  material.colorNode = vec3(0.03, 0.045, 0.075)
  material.emissiveNode = tint.mul(rim.mul(2.4)).mul(glow)
  return { material, tint, glow }
}

/** Haz de energía de un puente: franjas que corren por la cinta; cerrado es una barrera roja que parpadea. */
export function bridgeMaterial(open: boolean, length: number, reinforcement: boolean): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ transparent: true, side: DoubleSide, depthWrite: false, blending: AdditiveBlending })
  const u = (uv() as N).x
  const across = abs((uv() as N).y.sub(0.5)).mul(2)
  const edge = float(1).sub(smoothstep(0.55, 1, across))
  if (open) {
    const bands = fract(u.mul(length * 1.4).sub(time.mul(1.6)))
    const flow = smoothstep(0.0, 0.5, bands).mul(float(1).sub(smoothstep(0.5, 1, bands)))
    material.colorNode = vec3(0.1, 0.9, 1.0).mul(flow.mul(1.4).add(0.25)).mul(edge)
  } else {
    const color = reinforcement ? vec3(1.0, 0.45, 0.2) : vec3(1.0, 0.18, 0.28)
    const flicker = sin(time.mul(5).add(u.mul(20))).mul(0.5).add(0.5)
    material.colorNode = color.mul(flicker.mul(0.35).add(0.18)).mul(edge)
  }
  return material
}

/** Cielo: degradado espacial, nebulosa de ruido y estrellas que titilan. Se coloca centrado en la cámara. */
export function skyMaterial(): MeshBasicNodeMaterial {
  const dir = normalize(positionGeometry as N) as N
  const base = mix(vec3(0.012, 0.016, 0.045), vec3(0.05, 0.022, 0.12), smoothstep(-0.25, 0.85, dir.y))
  const n1 = mx_noise_float(dir.mul(2.3).add(vec3(0, time.mul(0.012), 0))) as N
  const n2 = mx_noise_float(dir.mul(5.1).add(vec3(time.mul(0.006), 0, 0))) as N
  const cloud = smoothstep(0.05, 0.95, n1.mul(0.6).add(n2.mul(0.4)).add(0.5))
  const band = pow(smoothstep(0.35, 1, n2.add(0.5)), float(2.2))
  const cell = floor(dir.mul(240)) as N
  const h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453)) as N
  const star = step(0.9965, h).mul(sin(time.mul(2.5).add(h.mul(60))).mul(0.3).add(0.85)).mul(1.6)
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false })
  material.colorNode = base.add(vec3(0.07, 0.025, 0.15).mul(cloud)).add(vec3(0.0, 0.09, 0.16).mul(band)).add(vec3(1, 1, 1).mul(star))
  return material
}

/** Anillo de un portal o de la corona: neón plano. `speed` anima un barrido para que no se vea estático. */
export function ringMaterial(color: string, intensity = 1): { material: MeshBasicNodeMaterial; intensity: { value: number }; tint: { value: Color } } {
  const tint = uniform(new Color(color)) as N
  const level = uniform(intensity) as N
  const material = new MeshBasicNodeMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
  const sweep = sin((uv() as N).x.mul(24).add(time.mul(2.2))).mul(0.5).add(0.5)
  material.colorNode = tint.mul(level).mul(sweep.mul(0.5).add(0.7))
  return { material, intensity: level, tint }
}

/** Disco interior del portal: velo traslúcido con ondas que se alejan del centro. */
export function portalVeilMaterial(): { material: MeshBasicNodeMaterial; tint: { value: Color }; intensity: { value: number } } {
  const tint = uniform(new Color('#22d3ee')) as N
  const level = uniform(0.4) as N
  const material = new MeshBasicNodeMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
  const centered = (uv() as N).sub(0.5).mul(2)
  const r = centered.length()
  const ripple = sin(r.mul(14).sub(time.mul(3))).mul(0.5).add(0.5)
  const falloff = float(1).sub(smoothstep(0.7, 1, r))
  material.colorNode = tint.mul(level).mul(ripple.mul(0.6).add(0.4)).mul(falloff)
  return { material, tint, intensity: level }
}

/** Chispas y motas: billboards aditivos con color por instancia. */
export function sparkMaterial(): SpriteNodeMaterial {
  const material = new SpriteNodeMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false })
  const r = (uv() as N).sub(0.5).mul(2).length()
  material.colorNode = vec3(1, 1, 1).mul(float(1).sub(smoothstep(0.0, 1, r)).pow(1.6)).mul(1.8)
  material.opacityNode = float(1).sub(smoothstep(0.6, 1, r))
  return material
}
