import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useKeyboardControls } from '@react-three/drei'
import * as THREE from 'three'
import { usePrograma3DStore } from '../state/programa3dStore'

const PLAYER_URL = '/models/programa3d/player.glb'
useGLTF.preload(PLAYER_URL)

const SPEED_WALK = 3.5
const SPEED_RUN  = 6.5

interface PlayerProps {
  enabled: boolean
  visible?: boolean
}

export function Player({ enabled, visible = true }: PlayerProps) {
  const group = useRef<THREE.Group>(null)
  const { scene } = useGLTF(PLAYER_URL) as any
  const [sub] = useKeyboardControls()
  const setPlayerPos = usePrograma3DStore(s => s.setPlayerPos)
  const moveTarget = usePrograma3DStore(s => s.moveTarget)
  const setMoveTarget = usePrograma3DStore(s => s.setMoveTarget)

  // Clone scene so we can use multiple copies (avatar cards)
  const cloned = useRef<THREE.Object3D | null>(null)
  if (!cloned.current) {
    cloned.current = scene.clone(true)
    cloned.current.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
  }

  // Sub a teclas
  const keysRef = useRef({ forward: false, backward: false, left: false, right: false, run: false })
  useEffect(() => {
    return sub(
      (state) => state,
      (state) => { keysRef.current = state as any }
    )
  }, [sub])

  // Walk animation: bob + leg-swing manual con scale.y (sin armature)
  const walkPhase = useRef(0)

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return

    // Posición actual desde el store
    const pos = usePrograma3DStore.getState().playerPos
    g.position.set(pos.x, pos.y, pos.z)

    if (!enabled) {
      // En welcome: pose idle, solo bob suave
      g.rotation.y = state.clock.elapsedTime * 0.3
      const bob = Math.sin(state.clock.elapsedTime * 2) * 0.03
      g.position.y = pos.y + bob
      return
    }

    // Movimiento: WASD relativo a cámara + click target
    const cam = state.camera
    const forward = new THREE.Vector3()
    cam.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    const k = keysRef.current
    let moveX = 0
    let moveZ = 0
    if (k.forward) { moveX += forward.x; moveZ += forward.z }
    if (k.backward) { moveX -= forward.x; moveZ -= forward.z }
    if (k.right) { moveX += right.x; moveZ += right.z }
    if (k.left)  { moveX -= right.x; moveZ -= right.z }

    let usingClick = false
    if (moveX === 0 && moveZ === 0 && moveTarget) {
      const dx = moveTarget.x - pos.x
      const dz = moveTarget.z - pos.z
      const dist = Math.hypot(dx, dz)
      if (dist > 0.15) {
        moveX = dx / dist
        moveZ = dz / dist
        usingClick = true
      } else {
        setMoveTarget(null)
      }
    } else if (moveX !== 0 || moveZ !== 0) {
      // Si hay tecla, cancelar click target
      if (moveTarget) setMoveTarget(null)
    }

    const moving = moveX !== 0 || moveZ !== 0
    if (moving) {
      const len = Math.hypot(moveX, moveZ) || 1
      moveX /= len; moveZ /= len
      const speed = (k.run && !usingClick) ? SPEED_RUN : SPEED_WALK
      const newX = pos.x + moveX * speed * dt
      const newZ = pos.z + moveZ * speed * dt
      setPlayerPos({ x: newX, y: pos.y, z: newZ })

      // Rotar player hacia movimiento (suavizado)
      const targetAngle = Math.atan2(moveX, moveZ)
      const current = g.rotation.y
      const diff = ((targetAngle - current + Math.PI) % (Math.PI * 2)) - Math.PI
      g.rotation.y = current + diff * Math.min(1, dt * 10)

      // Walk cycle (bob + sway)
      walkPhase.current += dt * (k.run && !usingClick ? 12 : 8)
      const bob = Math.abs(Math.sin(walkPhase.current)) * 0.06
      g.position.y = pos.y + bob
      g.rotation.z = Math.sin(walkPhase.current) * 0.06
    } else {
      // Idle: subtle bob
      const bob = Math.sin(state.clock.elapsedTime * 1.5) * 0.02
      g.position.y = pos.y + bob
      g.rotation.z *= 0.9
    }
  })

  return (
    <group ref={group} visible={visible}>
      <primitive object={cloned.current!} />
    </group>
  )
}
