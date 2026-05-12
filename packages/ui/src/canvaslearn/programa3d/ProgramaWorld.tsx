import { Canvas } from '@react-three/fiber'
import { Sky, Loader, KeyboardControls } from '@react-three/drei'
import { Suspense } from 'react'
import * as THREE from 'three'
import { WorldScene, ActiveCards } from './scenes/WorldScene'
import { PergaminoHtml } from './ui/PergaminoHtml'
import type { Phase } from './conversation/ProgramaConversation'

export type ProgramaMode = 'welcome' | 'free' | 'capturing'

export interface PergaminoConfig {
  visible: boolean
  question: string
  placeholder: string
  type?: 'text' | 'number'
  loading?: boolean
  onSubmit: (value: string) => void
}

export interface ProgramaWorldProps {
  mode: ProgramaMode
  phase: Phase
  pergamino?: PergaminoConfig
  onSelectCard?: (cardId: string, value: string) => void
}

export const KEY_MAP = [
  { name: 'forward',  keys: ['ArrowUp', 'KeyW', 'w', 'W'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS', 's', 'S'] },
  { name: 'left',     keys: ['ArrowLeft', 'KeyA', 'a', 'A'] },
  { name: 'right',    keys: ['ArrowRight', 'KeyD', 'd', 'D'] },
  { name: 'run',      keys: ['Shift'] },
  { name: 'interact', keys: ['KeyE', 'e', 'E', 'Enter'] },
] as const

export function ProgramaWorld({ mode, phase, pergamino, onSelectCard }: ProgramaWorldProps) {
  return (
    <>
      <KeyboardControls map={KEY_MAP as any}>
        <Canvas
          shadows={{ type: THREE.PCFShadowMap }}
          camera={{ position: [0, 4.5, 10], fov: 60, near: 0.1, far: 200 }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#0a0e27']} />
          <fog attach="fog" args={['#1a3a5c', 25, 80]} />

          <Suspense fallback={null}>
            <Sky distance={450000} sunPosition={[5, 1, 5]} inclination={0.49} azimuth={0.25} turbidity={4} rayleigh={1} />

            {/* Iluminación ambiente cálida */}
            <ambientLight intensity={0.55} color="#fef3c7" />
            <hemisphereLight args={['#bce3a4', '#3d6b3a', 0.45]} />
            <directionalLight
              position={[10, 18, 8]}
              intensity={1.4}
              color="#fff8e1"
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-camera-left={-25}
              shadow-camera-right={25}
              shadow-camera-top={25}
              shadow-camera-bottom={-25}
              shadow-camera-near={0.1}
              shadow-camera-far={50}
            />

            <WorldScene mode={mode} />
            {onSelectCard && <ActiveCards phase={phase} onSelect={onSelectCard} />}
            {pergamino?.visible && (
              <PergaminoHtml
                visible
                question={pergamino.question}
                placeholder={pergamino.placeholder}
                type={pergamino.type}
                loading={pergamino.loading}
                onSubmit={pergamino.onSubmit}
              />
            )}
          </Suspense>
        </Canvas>
      </KeyboardControls>
      <Loader />
    </>
  )
}

export default ProgramaWorld
