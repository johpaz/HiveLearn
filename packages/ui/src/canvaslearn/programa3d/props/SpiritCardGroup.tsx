import { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { SpiritCard3D, type SpiritCardConfig } from './SpiritCard3D'
import { usePrograma3DStore, BEE_ANCHOR_POS } from '../state/programa3dStore'

interface SpiritCardGroupProps {
  cards: SpiritCardConfig[]
  onSelect: (id: string, value: string) => void
}

const RING_RADIUS = 3.0
const HOVER_DIST = 1.6

export function SpiritCardGroup({ cards, onSelect }: SpiritCardGroupProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sub] = useKeyboardControls()
  const interactRef = useRef(false)
  const setHint = usePrograma3DStore(s => s.setHint)

  // Posiciones en arco
  const positions = useMemo(() => {
    return cards.map((_, i) => {
      const angle = -Math.PI / 2 + (i / cards.length) * Math.PI * 1.3 - Math.PI * 0.65
      const x = BEE_ANCHOR_POS.x + Math.cos(angle) * RING_RADIUS
      const z = BEE_ANCHOR_POS.z + Math.sin(angle) * RING_RADIUS
      return [x, 1.4, z] as [number, number, number]
    })
  }, [cards])

  // Suscribirse a tecla E
  useEffect(() => {
    return sub(
      (state) => (state as any).interact,
      (pressed) => {
        if (pressed) interactRef.current = true
      }
    )
  }, [sub])

  useFrame(() => {
    if (selectedId) return
    const player = usePrograma3DStore.getState().playerPos

    // Detectar más cercana en xz
    let nearestId: string | null = null
    let nearestDist = HOVER_DIST
    cards.forEach((c, i) => {
      const p = positions[i]
      const d = Math.hypot(p[0] - player.x, p[2] - player.z)
      if (d < nearestDist) {
        nearestDist = d
        nearestId = c.id
      }
    })

    if (nearestId !== hoveredId) setHoveredId(nearestId)

    if (nearestId) {
      const card = cards.find(c => c.id === nearestId)
      setHint(card ? `Elegir · ${card.label}` : null)
    } else {
      setHint(null)
    }

    // Procesar interact
    if (interactRef.current) {
      interactRef.current = false
      if (nearestId) {
        const card = cards.find(c => c.id === nearestId)!
        setSelectedId(nearestId)
        setHint(null)
        // Disparar onSelect después de la animación de selección
        setTimeout(() => onSelect(card.id, card.value), 400)
      }
    }
  })

  return (
    <>
      {cards.map((c, i) => (
        <SpiritCard3D
          key={c.id}
          config={c}
          position={positions[i]}
          hovered={hoveredId === c.id}
          selected={selectedId === c.id}
          appearDelay={i * 80}
        />
      ))}
    </>
  )
}
