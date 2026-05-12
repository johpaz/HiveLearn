import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Billboard, Text } from '@react-three/drei'

export interface SpiritCardConfig {
  id: string
  label: string
  icon: string
  value: string
  tint?: number
}

interface SpiritCard3DProps {
  config: SpiritCardConfig
  position: [number, number, number]
  hovered: boolean
  selected: boolean
  appearDelay: number
  onAnimationDone?: () => void
}

export function SpiritCard3D({ config, position, hovered, selected, appearDelay, onAnimationDone }: SpiritCard3DProps) {
  const group = useRef<THREE.Group>(null)
  const glowRef = useRef<THREE.PointLight>(null)
  const startedAt = useRef(performance.now())
  const selectStart = useRef<number | null>(null)

  // Snapshot color cuando seleccionado dispara
  useEffect(() => {
    if (selected && selectStart.current === null) {
      selectStart.current = performance.now()
    }
  }, [selected])

  const tint = config.tint ?? 0xfbbf24
  const tintHex = useMemo(() => '#' + tint.toString(16).padStart(6, '0'), [tint])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const now = performance.now()
    const t = state.clock.elapsedTime
    const sinceStart = now - startedAt.current - appearDelay

    // Aparición
    let scale = 1
    let alpha = 1
    if (sinceStart < 0) {
      scale = 0
      alpha = 0
    } else if (sinceStart < 500) {
      const p = sinceStart / 500
      const eased = 1 - Math.pow(1 - p, 3)
      scale = 0.4 + eased * 0.6
      alpha = eased
    }

    // Selección: pop out + dismiss
    if (selectStart.current !== null) {
      const sinceSelect = now - selectStart.current
      if (sinceSelect < 600) {
        const p = sinceSelect / 600
        const burst = Math.sin(p * Math.PI) * 0.5
        scale = (1 + burst) * (1 - p * 0.5)
        alpha = 1 - p
        g.position.y = position[1] + p * 2
      } else {
        if (onAnimationDone) onAnimationDone()
        scale = 0
        alpha = 0
      }
    }

    // Hover lift y bob
    const bob = Math.sin(t * 1.5 + position[0] + position[2]) * 0.08
    const hoverLift = hovered ? 0.2 : 0
    g.position.y = position[1] + bob + hoverLift + (selectStart.current !== null ? (now - (selectStart.current ?? 0)) / 600 * 2 : 0)

    g.scale.setScalar(scale * (hovered ? 1.15 : 1))

    // Glow pulse
    if (glowRef.current) {
      glowRef.current.intensity = (hovered ? 2.5 : 1.2) + Math.sin(t * 2 + position[0]) * 0.3
    }

    // Alpha al material via traverse
    g.traverse((o: any) => {
      if (o.material && 'opacity' in o.material) {
        o.material.transparent = true
        o.material.opacity = alpha
      }
    })
  })

  return (
    <group ref={group} position={position}>
      <pointLight ref={glowRef} color={tintHex} intensity={1.2} distance={2.5} decay={1.5} />
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        {/* Tarjeta cuerpo */}
        <mesh>
          <planeGeometry args={[0.95, 1.25]} />
          <meshStandardMaterial color="#fff8e1" emissive={tintHex} emissiveIntensity={0.3} side={THREE.DoubleSide} />
        </mesh>
        {/* Borde interno */}
        <mesh position={[0, 0, 0.005]}>
          <planeGeometry args={[0.85, 1.15]} />
          <meshStandardMaterial color="#fef3c7" side={THREE.DoubleSide} />
        </mesh>
        {/* Icono emoji */}
        <Text
          position={[0, 0.18, 0.01]}
          fontSize={0.45}
          anchorX="center"
          anchorY="middle"
        >
          {config.icon}
        </Text>
        {/* Label */}
        <Text
          position={[0, -0.35, 0.01]}
          fontSize={0.10}
          color="#0a0e27"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.85}
          textAlign="center"
          fontWeight="bold"
        >
          {config.label}
        </Text>
      </Billboard>
    </group>
  )
}
