import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { usePrograma3DStore, BEE_ANCHOR_POS } from '../state/programa3dStore'

interface Props {
  mode: 'welcome' | 'free' | 'capturing'
}

export function ThirdPersonCamera({ mode }: Props) {
  const targetPos = useRef(new THREE.Vector3())
  const camOffset = useRef(new THREE.Vector3(0, 4.5, 7))
  const camLookAt = useRef(new THREE.Vector3())
  const cinemaTime = useRef(0)

  useFrame((state, dt) => {
    const cam = state.camera
    const player = usePrograma3DStore.getState().playerPos

    if (mode === 'welcome') {
      // Cinema: orbit around bee anchor
      cinemaTime.current += dt * 0.25
      const r = 6
      const x = Math.cos(cinemaTime.current) * r
      const z = Math.sin(cinemaTime.current) * r
      targetPos.current.set(x, 4, z)
      camLookAt.current.set(BEE_ANCHOR_POS.x, BEE_ANCHOR_POS.y + 0.5, BEE_ANCHOR_POS.z)
    } else if (mode === 'capturing') {
      // Cerca de la bee, ángulo bajo, mirando al pergamino
      const beePos = usePrograma3DStore.getState().beePos
      targetPos.current.set(beePos.x + 2.2, beePos.y + 1.2, beePos.z + 3)
      camLookAt.current.set(beePos.x, beePos.y + 0.5, beePos.z)
    } else {
      // Free: tercera persona detrás del player
      // Calcular dirección de la cámara (rotación en y mantenida)
      targetPos.current.set(
        player.x + camOffset.current.x,
        player.y + camOffset.current.y,
        player.z + camOffset.current.z,
      )
      camLookAt.current.set(player.x, player.y + 1.2, player.z)
    }

    cam.position.lerp(targetPos.current, Math.min(1, dt * 4))
    cam.lookAt(camLookAt.current)
  })

  return null
}
