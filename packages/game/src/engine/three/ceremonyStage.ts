/**
 * ceremonyStage — Escenario 3D de la "Ceremonia del Enjambre" (Fase 3).
 *
 * Todo el render es Three.js nativo sobre el canvas WebGL primario:
 *  - Fondo: reutiliza `buildHiveScene3D({variant:'hub'})` (hiveWall + honeyFlow + polen).
 *  - Actores: abejas-agente como sprites billboard con aura de color por personaje.
 *  - Animación: entradas en vuelo (bézier), hover idle con fase propia,
 *    bob de habla al hablar la abeja, pulso de aura al celebrar.
 *
 * Coordenadas: el WorldRenderer usa una OrthographicCamera mapeada a píxeles
 * (0..w, 0..h con y hacia abajo) — las posiciones de los actores SON píxeles,
 * lo que simplifica burbujas DOM sincronizadas y hit-testing de clic.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { buildHiveScene3D } from './builders'
import type { Scene3D } from './worldRenderer'
import type { HiveUniforms } from './shaderMaterial'
import { agentBeeTexture, glowTexture } from './atlas'
import { HIVE_AGENTS, type HiveAgentId } from '../../entities/agents'
import type { HiveTheme } from '../theme'
import { DEFAULT_THEME } from '../theme'

export interface BeeActorView {
  agentId: string
  name: string
  colorHex: number
}

interface BeeActor extends BeeActorView {
  group: THREE.Group
  sprite: THREE.Sprite
  aura: THREE.Sprite
  pos: THREE.Vector2
  from: THREE.Vector2
  to: THREE.Vector2
  ctrl: THREE.Vector2
  flightT: number
  flightDur: number
  flying: boolean
  hoverPhase: number
  speaking: boolean
  auraLevel: number
  baseScalePx: number
}

export type EntrySide = 'left' | 'right' | 'top' | 'center'

export interface SpawnOptions {
  x?: number
  y?: number
  entry?: EntrySide
  /** Escala base en píxeles (altura aproximada del sprite) */
  scalePx?: number
  /** Vuelo de entrada en ms */
  entryMs?: number
}

const EASE_OUT = (t: number) => 1 - Math.pow(1 - t, 3)

export class CeremonyStage {
  private actors = new Map<string, BeeActor>()
  private w: number
  private h: number
  private theme: HiveTheme = DEFAULT_THEME
  private propsGroup: THREE.Group | null = null
  private propMaterials: Array<{ mat: THREE.MeshStandardMaterial; baseColor: THREE.Color }> = []

  constructor(private root: THREE.Group, w: number, h: number) {
    this.w = w
    this.h = h
  }

  resize(w: number, h: number) {
    this.w = w
    this.h = h
    if (this.propsGroup) this.layoutProps()
  }

  // ─── Diorama GLB (creado en Blender: tarima hexagonal + arcos) ──────────

  /** Carga el diorama low-poly y sus luces. Fire-and-forget seguro. */
  loadDiorama(url: string): void {
    const loader = new GLTFLoader()
    loader.load(
      url,
      (gltf) => {
        const group = gltf.scene as THREE.Group

        // Normaliza materiales y guarda color base para tinte por tema
        group.traverse((obj) => {
          const mesh = obj as THREE.Mesh
          if (!mesh.isMesh) return
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial
            if (std.isMeshStandardMaterial && !this.propMaterials.some(p => p.mat === std)) {
              this.propMaterials.push({ mat: std, baseColor: std.color.clone() })
            }
          }
          mesh.castShadow = false
          mesh.receiveShadow = false
        })

        // Luces cálidas de miel (viven en el root → se limpian con dispose)
        const ambient = new THREE.AmbientLight(0xffe0a0, 1.1)
        const key = new THREE.DirectionalLight(0xffc94d, 2.2)
        key.position.set(180, -420, 520)
        key.lookAt(0, 0, 0)
        const rim = new THREE.DirectionalLight(0xffe082, 0.9)
        rim.position.set(-300, -200, -260)
        rim.lookAt(0, 0, 0)

        this.propsGroup = new THREE.Group()
        this.propsGroup.name = 'diorama'
        this.propsGroup.add(group, ambient, key, rim)

        // Los sprites (renderOrder 10, depthTest:false) siempre dibujan encima;
        // el diorama queda detrás como escenario.
        this.propsGroup.renderOrder = 1
        group.traverse(o => { o.renderOrder = 1 })

        this.root.add(this.propsGroup)
        this.applyTheme(this.theme)
        this.layoutProps()
      },
      undefined,
      () => { /* sin diorama: el backdrop shader sostiene la escena igual */ },
    )
  }

  /** Coloca y escala el diorama al viewport en píxeles */
  private layoutProps() {
    if (!this.propsGroup) return
    const s = Math.min(this.w / 7.5, this.h / 6.5)
    this.propsGroup.scale.setScalar(s)
    this.propsGroup.position.set(0, 0, -80)
    // El grupo GLB está centrado en la tarima; lo bajamos para que la tarima
    // quede bajo los actores y los arcos detrás-arriba.
    this.propsGroup.children.forEach(c => {
      if (c !== (this.propsGroup as THREE.Group).children[0]) c.position.set(0, 0, 0)
    })
    const scene = this.propsGroup.children[0]
    if (scene) {
      scene.position.set(0, -this.h * 0.10, 0)
    }
  }

  get beeViews(): BeeActorView[] {
    return [...this.actors.values()].map(({ agentId, name, colorHex }) => ({ agentId, name, colorHex }))
  }

  getBeePos(agentId: string): { x: number; y: number } | null {
    const a = this.actors.get(agentId)
    return a ? { x: a.pos.x, y: a.pos.y } : null
  }

  // ─── Tema adaptativo ("Panal de Cuentos") ───────────────────────────────

  get currentTheme(): HiveTheme { return this.theme }

  /** Aplica el tema del alumno: tinte del diorama + re-escala actores */
  applyTheme(theme: HiveTheme): void {
    this.theme = theme
    const tint = new THREE.Color(theme.dioramaTint)
    for (const { mat, baseColor } of this.propMaterials) {
      mat.color.copy(baseColor).multiply(tint)
    }
    for (const a of this.actors.values()) {
      const s = a.baseScalePx * theme.characterScale
      a.sprite.scale.set(s, s, 1)
    }
  }

  /** Densidad de partículas del backdrop (la consume el uniform uMood externo) */
  get shaderMood(): number { return this.theme.shaderMood }

  spawnBee(agentId: string, opts: SpawnOptions = {}): void {
    if (this.actors.has(agentId)) return
    // Maya no tiene sprite propio: usa el look de reina-guía dorado
    const spriteKey: HiveAgentId = (agentId as HiveAgentId) in HIVE_AGENTS
      ? (agentId as HiveAgentId)
      : (agentId.includes('onboarding') || agentId.includes('maya') || agentId.includes('coordinator'))
        ? 'coordinator'
        : 'content'
    const info = HIVE_AGENTS[spriteKey]

    const group = new THREE.Group()

    // Aura de color detrás del sprite
    const auraMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color(info.color),
      transparent: true,
      opacity: 0.35,
      depthTest: false,
    })
    const aura = new THREE.Sprite(auraMat)
    const scalePx = (opts.scalePx ?? 56) * this.theme.characterScale
    const auraSize = scalePx * 2.6
    aura.scale.set(auraSize, auraSize, 1)

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: agentBeeTexture(info.id),
        transparent: true,
        depthTest: false,
      }),
    )
    sprite.scale.set(scalePx * (16 / 16), scalePx, 1)

    group.add(aura)
    group.add(sprite)
    group.renderOrder = 10
    this.root.add(group)

    const to = new THREE.Vector2(opts.x ?? this.w / 2, opts.y ?? this.h / 2)
    const from = this.entryPoint(opts.entry ?? 'left')
    const actor: BeeActor = {
      agentId,
      name: info.name,
      colorHex: info.color,
      group,
      sprite,
      aura,
      pos: from.clone(),
      from,
      to,
      ctrl: this.controlPoint(from, to),
      flightT: 0,
      flightDur: (opts.entryMs ?? 1400) / 1000,
      flying: true,
      hoverPhase: Math.random() * Math.PI * 2,
      speaking: false,
      auraLevel: 0,
      baseScalePx: scalePx,
    }
    group.position.set(from.x, from.y, 5 + this.actors.size * 0.1)
    this.actors.set(agentId, actor)
  }

  removeBee(agentId: string): void {
    const a = this.actors.get(agentId)
    if (!a) return
    this.root.remove(a.group)
    a.sprite.material.dispose()
    a.aura.material.dispose()
    this.actors.delete(agentId)
  }

  flyTo(agentId: string, x: number, y: number, ms = 900): void {
    const a = this.actors.get(agentId)
    if (!a) return
    a.from.copy(a.pos)
    a.to.set(x, y)
    a.ctrl = this.controlPoint(a.from, a.to)
    a.flightT = 0
    a.flightDur = ms / 1000
    a.flying = true
  }

  setSpeaking(agentId: string, speaking: boolean): void {
    const a = this.actors.get(agentId)
    if (a) a.speaking = speaking
  }

  pulseAura(agentId: string): void {
    const a = this.actors.get(agentId)
    if (a) a.auraLevel = 1
  }

  update(dt: number): void {
    for (const a of this.actors.values()) {
      // Vuelo bézier cúbica (from → ctrl → to)
      if (a.flying) {
        a.flightT += dt / Math.max(a.flightDur, 0.001)
        const t = EASE_OUT(Math.min(a.flightT, 1))
        const it = 1 - t
        a.pos.set(
          it * it * a.from.x + 2 * it * t * a.ctrl.x + t * t * a.to.x,
          it * it * a.from.y + 2 * it * t * a.ctrl.y + t * t * a.to.y,
        )
        if (a.flightT >= 1) a.flying = false
      } else {
        // Hover idle: seno suave con fase propia
        a.pos.y += Math.sin(performance.now() / 1000 * 2 + a.hoverPhase) * 8 * this.theme.motionAmp * dt
      }
      a.group.position.set(a.pos.x, a.pos.y, a.group.position.z)

      // Bob de habla: pulso rápido de escala
      const now = performance.now() / 1000
      if (a.speaking) {
        const s = a.baseScalePx * this.theme.characterScale * (1 + Math.sin(now * 12) * 0.05)
        a.sprite.scale.set(s, s, 1)
      } else {
        a.sprite.scale.set(a.baseScalePx * this.theme.characterScale, a.baseScalePx * this.theme.characterScale, 1)
      }
      // Inclinación de vuelo según velocidad vertical
      a.sprite.material.rotation = a.flying ? Math.sin(now * 30) * 0.18 : Math.sin(now * 4 + a.hoverPhase) * 0.06

      // Aura: decae tras el pulso; sube al hablar
      a.auraLevel = Math.max(0, a.auraLevel - dt * 1.2)
      const auraTarget = 0.28 + (a.speaking ? 0.25 : 0) + a.auraLevel * 0.5
      a.aura.material.opacity += (auraTarget - a.aura.material.opacity) * Math.min(dt * 6, 1)
      const auraS = a.baseScalePx * this.theme.characterScale * (2.4 + a.auraLevel * 0.9 + Math.sin(now * 3 + a.hoverPhase) * 0.08)
      a.aura.scale.set(auraS, auraS, 1)
    }
  }

  dispose(): void {
    for (const id of [...this.actors.keys()]) this.removeBee(id)
    if (this.propsGroup) {
      this.root.remove(this.propsGroup)
      this.propsGroup.traverse(o => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry?.dispose()
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          mats.forEach(m => m?.dispose())
        }
      })
      this.propMaterials.length = 0
      this.propsGroup = null
    }
  }

  private entryPoint(side: EntrySide): THREE.Vector2 {
    switch (side) {
      case 'left': return new THREE.Vector2(-80, this.h * (0.3 + Math.random() * 0.4))
      case 'right': return new THREE.Vector2(this.w + 80, this.h * (0.3 + Math.random() * 0.4))
      case 'top': return new THREE.Vector2(this.w * (0.25 + Math.random() * 0.5), -80)
      default: return new THREE.Vector2(this.w / 2, this.h / 2)
    }
  }

  /** Punto de control curvando el vuelo por arriba */
  private controlPoint(from: THREE.Vector2, to: THREE.Vector2): THREE.Vector2 {
    const midX = (from.x + to.x) / 2
    const arc = Math.min(Math.abs(to.x - from.x) * 0.25, 160)
    return new THREE.Vector2(midX, Math.min(from.y, to.y) - arc)
  }
}

/** Construye la escena 3D completa de la ceremonia (fondo + actores) */
export function buildCeremonyStage(w: number, h: number): { scene3d: Scene3D; stage: CeremonyStage } {
  const backdrop = buildHiveScene3D({ variant: 'hub' })
  const root = new THREE.Group()
  root.add(backdrop.root)

  const stage = new CeremonyStage(root, w, h)

  return {
    stage,
    scene3d: {
      root,
      update(dt: number, uniforms: HiveUniforms) {
        backdrop.update?.(dt, uniforms)
        stage.update(dt)
      },
      dispose() {
        stage.dispose()
        backdrop.dispose?.()
      },
    },
  }
}
