import { useMemo } from 'react'
import { useGLTF, Instances, Instance } from '@react-three/drei'

const TREE_URL   = '/models/programa3d/tree.glb'
const FLOWER_URL = '/models/programa3d/flower.glb'
const ROCK_URL   = '/models/programa3d/rock.glb'

useGLTF.preload(TREE_URL)
useGLTF.preload(FLOWER_URL)
useGLTF.preload(ROCK_URL)

// Generar posiciones determinísticas (bordes del claro)
function generatePositions() {
  const positions: Array<{ x: number; z: number; rot: number; scale: number; type: 'tree' | 'flower' | 'rock' }> = []
  let seed = 1337
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }

  // Árboles formando un anillo
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2 + rand() * 0.2
    const radius = 14 + rand() * 4
    positions.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      rot: rand() * Math.PI * 2,
      scale: 0.9 + rand() * 0.5,
      type: 'tree',
    })
  }
  // Algunos árboles dispersos
  for (let i = 0; i < 8; i++) {
    positions.push({
      x: (rand() - 0.5) * 20,
      z: (rand() - 0.5) * 20,
      rot: rand() * Math.PI * 2,
      scale: 0.7 + rand() * 0.3,
      type: 'tree',
    })
  }
  // Flores
  for (let i = 0; i < 30; i++) {
    positions.push({
      x: (rand() - 0.5) * 18,
      z: (rand() - 0.5) * 18,
      rot: rand() * Math.PI * 2,
      scale: 0.8 + rand() * 0.4,
      type: 'flower',
    })
  }
  // Rocas
  for (let i = 0; i < 12; i++) {
    positions.push({
      x: (rand() - 0.5) * 22,
      z: (rand() - 0.5) * 22,
      rot: rand() * Math.PI * 2,
      scale: 0.5 + rand() * 0.8,
      type: 'rock',
    })
  }
  return positions
}

export function ForestEnvironment() {
  const positions = useMemo(generatePositions, [])
  const trees   = positions.filter(p => p.type === 'tree')
  const flowers = positions.filter(p => p.type === 'flower')
  const rocks   = positions.filter(p => p.type === 'rock')

  return (
    <>
      {trees.map((p, i) => (
        <TreeSingle key={`t${i}`} {...p} />
      ))}
      {flowers.map((p, i) => (
        <FlowerSingle key={`f${i}`} {...p} />
      ))}
      {rocks.map((p, i) => (
        <RockSingle key={`r${i}`} {...p} />
      ))}
    </>
  )
}

function TreeSingle({ x, z, rot, scale }: any) {
  const { scene } = useGLTF(TREE_URL) as any
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return c
  }, [scene])
  return <primitive object={cloned} position={[x, 0, z]} rotation={[0, rot, 0]} scale={scale} />
}

function FlowerSingle({ x, z, rot, scale }: any) {
  const { scene } = useGLTF(FLOWER_URL) as any
  const cloned = useMemo(() => scene.clone(true), [scene])
  return <primitive object={cloned} position={[x, 0, z]} rotation={[0, rot, 0]} scale={scale} />
}

function RockSingle({ x, z, rot, scale }: any) {
  const { scene } = useGLTF(ROCK_URL) as any
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return c
  }, [scene])
  return <primitive object={cloned} position={[x, 0, z]} rotation={[0, rot, 0]} scale={scale} />
}
