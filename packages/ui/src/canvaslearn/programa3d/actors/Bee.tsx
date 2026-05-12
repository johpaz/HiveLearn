import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { usePrograma3DStore, BEE_ANCHOR_POS } from '../state/programa3dStore'

const BEE_URL = '/models/programa3d/bee.glb'
useGLTF.preload(BEE_URL)

interface BeeProps {
  state?: 'idle' | 'talking' | 'celebrating'
}

export function Bee({ state = 'idle' }: BeeProps) {
  const group = useRef<THREE.Group>(null)
  const wingL = useRef<THREE.Object3D | null>(null)
  const wingR = useRef<THREE.Object3D | null>(null)

  const { scene } = useGLTF(BEE_URL) as any
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o: any) => {
      if (o.isMesh) o.castShadow = true
      if (o.name === 'Wing_L' || o.name.startsWith('Wing_L')) wingL.current = o
      if (o.name === 'Wing_R' || o.name.startsWith('Wing_R')) wingR.current = o
    })
    return c
  }, [scene])

  useFrame((s, dt) => {
    const g = group.current
    if (!g) return

    const t = s.clock.elapsedTime
    // Bob (flotando)
    const bob = Math.sin(t * 2.2) * 0.18
    g.position.set(BEE_ANCHOR_POS.x, BEE_ANCHOR_POS.y + bob, BEE_ANCHOR_POS.z)

    // Pequeña rotación según estado
    if (state === 'talking') {
      g.rotation.y = Math.sin(t * 0.8) * 0.25
    } else if (state === 'celebrating') {
      g.rotation.y = t * 1.5
    } else {
      g.rotation.y = Math.sin(t * 0.4) * 0.4
    }

    // Aleteo rápido de alas
    const flap = Math.sin(t * 35) * 0.5 + 0.2
    if (wingL.current) wingL.current.rotation.y = -flap
    if (wingR.current) wingR.current.rotation.y =  flap

    // Sync con store para anclar Html del pergamino
    usePrograma3DStore.getState().setBeePos({ x: g.position.x, y: g.position.y, z: g.position.z })
  })

  return (
    <group ref={group} scale={0.7}>
      <primitive object={cloned} />
      {/* Glow disco simple */}
      <pointLight color={state === 'celebrating' ? '#fbbf24' : '#fef3c7'} intensity={state === 'celebrating' ? 2 : 0.8} distance={4} decay={1.6} />
    </group>
  )
}
