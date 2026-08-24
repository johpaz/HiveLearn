/**
 * shaderMaterial — helper ligero para ShaderMaterial con uniforms estándar.
 *
 * Uniforms compartidos por todos los shaders del mundo 3D:
 *   uTime        (float, segundos)
 *   uCamera      (vec2, posición de la cámara 3D en unidades mundo)
 *   uMood        (float 0..1, animada emocional por escena)
 *   uQuality     (float 0..1, factor de degradación por GPU tier)
 *   uResolution  (vec2, viewport en pixels)
 *
 * Los fragmentos y vertex están en `shaders/*.glsl.ts` como template strings.
 */

import * as THREE from 'three'

export interface HiveUniforms {
  uTime: THREE.IUniform<number>
  uCamera: THREE.IUniform<THREE.Vector2>
  uMood: THREE.IUniform<number>
  uQuality: THREE.IUniform<number>
  uResolution: THREE.IUniform<THREE.Vector2>
}

export function makeHiveUniforms(): HiveUniforms {
  return {
    uTime: { value: 0 },
    uCamera: { value: new THREE.Vector2(0, 0) },
    uMood: { value: 0.5 },
    uQuality: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  }
}

export interface ShaderMaterialOptions {
  uniforms?: Partial<HiveUniforms>
  vertexShader: string
  fragmentShader: string
  transparent?: boolean
  depthWrite?: boolean
  blending?: THREE.Blending
  side?: THREE.Side
}

/** Crea ShaderMaterial con los uniforms estándar + overrides del caller. */
export function makeShaderMaterial(opts: ShaderMaterialOptions): THREE.ShaderMaterial {
  const base = makeHiveUniforms()
  if (opts.uniforms) for (const k of Object.keys(opts.uniforms) as (keyof HiveUniforms)[]) {
    base[k].value = opts.uniforms[k]!.value
  }
  return new THREE.ShaderMaterial({
    uniforms: base as unknown as { [uniform: string]: THREE.IUniform },
    vertexShader: opts.vertexShader,
    fragmentShader: opts.fragmentShader,
    transparent: opts.transparent ?? true,
    depthWrite: opts.depthWrite ?? false,
    blending: opts.blending ?? THREE.NormalBlending,
    side: opts.side ?? THREE.FrontSide,
  })
}

/** Devuelve el conjunto estándar de uniforms hackeable por escena. */
export type { ShaderMaterialOptions as ShaderOpts }