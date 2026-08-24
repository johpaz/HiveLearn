/**
 * builders — factory functions for the 3D scenes used by WorldRenderer.
 *
 * Cada builder devuelve un Scene3D listo para attach al WorldRenderer.
 * El Scene3D.root es añadido a three.Scene; update() recibe dt + uniforms.
 */

import * as THREE from 'three'
import type { Scene3D } from './worldRenderer'
import { makeShaderMaterial, type HiveUniforms } from './shaderMaterial'
import * as hiveWall from './shaders/hiveWall.glsl'
import * as honeyFlow from './shaders/honeyFlow.glsl'
import * as pollenParticles from './shaders/pollenParticles.glsl'
import * as skyCycle from './shaders/skyCycle.glsl'
import * as portal from './shaders/portal.glsl'
import * as bossArena from './shaders/bossArena.glsl'

/** Quad NDC (-1..1) que cubre todo el viewport. */
function fullQuad(material: THREE.ShaderMaterial): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(2, 2)
  return new THREE.Mesh(geo, material)
}

export interface HiveScene3DOptions {
  /** Modo de ambiente: 'hub' (pareja hexagonos + trono miel) | 'calm' | 'tight' (boss). */
  variant?: 'hub' | 'calm' | 'tight'
  /** Cuántas partículas de polen (default 50_000). */
  pollenCount?: number
}

/** Escena 3D para el Hive Hub (Colmena Central). */
export function buildHiveScene3D(opts: HiveScene3DOptions = {}): Scene3D {
  const root = new THREE.Group()

  const wallMat = makeShaderMaterial({
    vertexShader: hiveWall.vertex,
    fragmentShader: hiveWall.fragment,
    transparent: false,
    depthWrite: false,
  })
  const wall = fullQuad(wallMat)
  wall.position.z = -2
  root.add(wall)

  // Trono miel solo en modo 'hub'
  let honeyMat: THREE.ShaderMaterial | null = null
  let honey: THREE.Mesh | null = null
  if ((opts.variant ?? 'hub') === 'hub') {
    honeyMat = makeShaderMaterial({
      vertexShader: honeyFlow.vertex,
      fragmentShader: honeyFlow.fragment,
      transparent: true,
    })
    honey = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), honeyMat)
    honey.position.set(0, -0.3, -1.5)
    root.add(honey)
  }

  // Partículas de polen ambientales
  const POLL = Math.floor((opts.pollenCount ?? 50_000) * 0.25) // recortado por calidad
  const pollenMat = makeShaderMaterial({
    vertexShader: pollenParticles.vertex,
    fragmentShader: pollenParticles.fragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const pollenGeo = new THREE.BufferGeometry()
  const seeds = new Float32Array(POLL * 3)
  for (let i = 0; i < POLL; i++) {
    seeds[i * 3 + 0] = Math.random()
    seeds[i * 3 + 1] = Math.random()
    seeds[i * 3 + 2] = Math.random()
  }
  pollenGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
  pollenGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POLL * 3), 3))
  const pollen = new THREE.Points(pollenGeo, pollenMat)
  pollen.frustumCulled = false
  root.add(pollen)

  return {
    root,
    update(_dt, uniforms: HiveUniforms) {
      // Push uniforms hacia los hijos
      for (const k of ['uTime', 'uCamera', 'uMood', 'uQuality', 'uResolution'] as (keyof HiveUniforms)[]) {
        wallMat.uniforms[k].value = uniforms[k].value
        honeyMat && (honeyMat.uniforms[k].value = uniforms[k].value)
        pollenMat.uniforms[k].value = uniforms[k].value
      }
      honey && (honey.rotation.z = uniform_sine(uniforms.uTime.value, 0.2) * 0.05)
    },
    dispose() {
      wallMat.dispose(); wall.geometry.dispose()
      honeyMat?.dispose(); honey?.geometry.dispose()
      pollenMat.dispose(); pollenGeo.dispose()
    },
  }
}

/** Escena 3D genérica para niveles */ 
export function buildLevelScene3D(opts: { themeColor?: [number, number, number] } = {}): Scene3D {
  const root = new THREE.Group()
  const skyMat = makeShaderMaterial({
    vertexShader: skyCycle.vertex,
    fragmentShader: skyCycle.fragment,
    transparent: false,
    depthWrite: false,
  })
  const sky = fullQuad(skyMat)
  sky.position.z = -3
  root.add(sky)

  const POLL = 6_000
  const pollenMat = makeShaderMaterial({
    vertexShader: pollenParticles.vertex,
    fragmentShader: pollenParticles.fragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const pollenGeo = new THREE.BufferGeometry()
  const seeds = new Float32Array(POLL * 3)
  for (let i = 0; i < POLL; i++) {
    seeds[i * 3 + 0] = Math.random()
    seeds[i * 3 + 1] = Math.random()
    seeds[i * 3 + 2] = Math.random()
  }
  pollenGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3))
  pollenGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POLL * 3), 3))
  const pollen = new THREE.Points(pollenGeo, pollenMat)
  root.add(pollen)

  return {
    root,
    update(_dt, uniforms) {
      for (const k of ['uTime', 'uCamera', 'uMood', 'uQuality', 'uResolution'] as (keyof HiveUniforms)[]) {
        skyMat.uniforms[k].value = uniforms[k].value
        pollenMat.uniforms[k].value = uniforms[k].value
      }
    },
    dispose() {
      skyMat.dispose(); sky.geometry.dispose()
      pollenMat.dispose(); pollenGeo.dispose()
    },
  }
}

/** Escena 3D para el portal del hub. */
export function buildPortalScene3D(): Scene3D {
  const root = new THREE.Group()
  const mat = makeShaderMaterial({
    vertexShader: portal.vertex,
    fragmentShader: portal.fragment,
    transparent: true,
    depthWrite: false,
  })
  const mesh = fullQuad(mat)
  root.add(mesh)
  return {
    root,
    update(_dt, uniforms) {
      for (const k of ['uTime', 'uCamera', 'uMood', 'uQuality', 'uResolution'] as (keyof HiveUniforms)[]) {
        mat.uniforms[k].value = uniforms[k].value
      }
    },
    dispose() { mat.dispose(); mesh.geometry.dispose() },
  }
}

/** Escena 3D para el jefe. */
export function buildBossScene3D(): Scene3D {
  const root = new THREE.Group()
  const mat = makeShaderMaterial({
    vertexShader: bossArena.vertex,
    fragmentShader: bossArena.fragment,
    transparent: false,
    depthWrite: false,
  })
  const mesh = fullQuad(mat)
  root.add(mesh)
  return {
    root,
    update(_dt, uniforms) {
      for (const k of ['uTime', 'uCamera', 'uMood', 'uQuality', 'uResolution'] as (keyof HiveUniforms)[]) {
        mat.uniforms[k].value = uniforms[k].value
      }
    },
    dispose() { mat.dispose(); mesh.geometry.dispose() },
  }
}

/** Helper de tiempo pequeño para evitar importar Math en cada update. */
function uniform_sine(t: number, k: number): number { return Math.sin(t * k) }