/**
 * El dron-abeja del jugador. Se construye por código (sirve de respaldo si un modelo .glb no carga) y expone una
 * interfaz mínima: `update` lo anima según su velocidad y `group` es lo que se mueve por el mundo. Su frente es -z.
 */
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import {
  AdditiveBlending, AnimationMixer, CircleGeometry, DoubleSide, Group, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PointLight,
  SphereGeometry, TorusGeometry,
} from 'three/webgpu'
import { smoothstep, uv, vec3, float } from 'three/tsl'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DroneRig {
  readonly group: Group
  /** Anima aleteo y propulsor; `speed` en unidades por segundo y `groundY` la altura del suelo bajo el dron. */
  update(time: number, speed: number, groundY: number): void
  /** Sustituye el cuerpo procedural por el modelo de Blender (con su animación de aleteo). */
  useModel(gltf: GLTF): void
  dispose(): void
}

export function createProceduralDrone(): DroneRig {
  const group = new Group()
  const body = new Group()
  group.add(body)

  const shell = new MeshStandardNodeMaterial({ color: '#1a2433', roughness: 0.3, metalness: 0.85, emissive: '#ffb000', emissiveIntensity: 0.05 })
  const amber = new MeshStandardNodeMaterial({ color: '#ffb000', emissive: '#ff9d00', emissiveIntensity: 2.4, roughness: 0.4 })
  const cyan = new MeshStandardNodeMaterial({ color: '#22d3ee', emissive: '#22d3ee', emissiveIntensity: 3.5, roughness: 0.2 })
  const wingMaterial = new MeshBasicNodeMaterial({ color: '#bff6ff', transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })

  const torso = new Mesh(new SphereGeometry(0.3, 24, 16), shell)
  torso.scale.set(1, 0.8, 1.4)
  torso.castShadow = true
  body.add(torso)
  for (const z of [-0.12, 0.14]) {
    const stripe = new Mesh(new TorusGeometry(0.285 - Math.abs(z) * 0.18, 0.026, 8, 28), amber)
    stripe.rotation.x = Math.PI / 2
    stripe.position.set(0, 0, z * 1.5)
    stripe.scale.set(1, 1.3, 1)
    body.add(stripe)
  }
  const eye = new Mesh(new SphereGeometry(0.085, 14, 10), cyan)
  eye.position.set(0, 0.04, -0.4)
  body.add(eye)
  const sting = new Mesh(new SphereGeometry(0.06, 10, 8), amber)
  sting.position.set(0, -0.02, 0.43)
  body.add(sting)

  const wings: Mesh[] = []
  for (const side of [-1, 1]) {
    const wing = new Mesh(new SphereGeometry(0.26, 14, 8), wingMaterial)
    wing.scale.set(1, 0.07, 1.8)
    wing.position.set(side * 0.3, 0.22, 0.02)
    wings.push(wing)
    body.add(wing)
  }
  const thruster = new Mesh(new TorusGeometry(0.2, 0.02, 8, 24), cyan)
  thruster.rotation.x = Math.PI / 2
  thruster.position.y = -0.27
  body.add(thruster)

  const procedural = [...body.children]
  let mixer: AnimationMixer | null = null
  let lastTime = 0

  const light = new PointLight('#22d3ee', 5, 7, 2)
  light.position.y = -0.3
  group.add(light)

  // Halo sobre el suelo: marca dónde está el dron y hace de sombra luminosa.
  const centered = (uv() as any).sub(0.5).mul(2).length()
  const haloMaterial = new MeshBasicNodeMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false })
  haloMaterial.colorNode = vec3(0.1, 0.8, 1).mul(float(1).sub(smoothstep(0.1, 1, centered)).pow(2)).mul(0.9)
  const halo = new Mesh(new CircleGeometry(0.95, 32), haloMaterial)
  halo.rotation.x = -Math.PI / 2
  group.add(halo)

  return {
    group,
    useModel(gltf) {
      for (const part of procedural) body.remove(part)
      const model = gltf.scene.clone(true)
      body.add(model)
      if (gltf.animations.length > 0) {
        mixer = new AnimationMixer(model)
        for (const clip of gltf.animations) mixer.clipAction(clip).play()
      }
    },
    update(time, speed, groundY) {
      const dt = Math.min(0.1, Math.max(0, time - lastTime))
      lastTime = time
      if (mixer) mixer.update(dt * (1 + Math.min(2, speed * 0.25)))
      else {
        const flap = Math.sin(time * 52) * (0.5 + Math.min(0.4, speed * 0.06))
        wings[0]!.rotation.z = flap
        wings[1]!.rotation.z = -flap
        thruster.scale.setScalar(1 + Math.min(0.5, speed * 0.08) + Math.sin(time * 9) * 0.04)
      }
      halo.position.y = groundY - group.position.y + 0.04
      halo.scale.setScalar(1 + Math.min(0.4, speed * 0.05))
    },
    dispose() {
      group.traverse(o => {
        const mesh = o as Mesh
        if (mesh.geometry) mesh.geometry.dispose()
      })
      for (const m of [shell, amber, cyan, wingMaterial, haloMaterial]) m.dispose()
    },
  }
}
