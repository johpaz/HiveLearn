import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { usePrograma3DStore } from '../state/programa3dStore'

interface GroundProps {
  enabled: boolean
  visible?: boolean
}

const GROUND_SIZE = 60

export function Ground({ enabled, visible = true }: GroundProps) {
  const { camera, raycaster, mouse, gl } = useThree()
  const setMoveTarget = usePrograma3DStore(s => s.setMoveTarget)

  // Geometry single quad horizontal
  const geometry = useMemo(() => new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1), [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3d6b3a', roughness: 0.95 }), [])

  const handleClick = (e: any) => {
    if (!enabled) return
    e.stopPropagation()
    const point = e.point as THREE.Vector3
    // Limitar al área central
    const dist = Math.hypot(point.x, point.z)
    if (dist > 13) return
    setMoveTarget({ x: point.x, y: 0, z: point.z })
  }

  return (
    <mesh
      visible={visible}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={handleClick}
      geometry={geometry}
      material={material}
    />
  )
}
