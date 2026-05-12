import { useMemo } from 'react'
import { Player } from '../actors/Player'
import { Bee } from '../actors/Bee'
import { Ground } from '../props/Ground'
import { ForestEnvironment } from '../props/ForestEnvironment'
import { ThirdPersonCamera } from '../controls/ThirdPersonCamera'
import { SpiritCardGroup } from '../props/SpiritCardGroup'
import type { SpiritCardConfig } from '../props/SpiritCard3D'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { TEMA_CARDS, OBJETIVO_CARDS, ESTILO_CARDS, AVATAR_CARDS, type Phase } from '../conversation/ProgramaConversation'

interface WorldSceneProps {
  mode: 'welcome' | 'free' | 'capturing'
  onInteractBee?: () => void
  onInteractCard?: (cardId: string, value: string) => void
}

export function WorldScene({ mode, onInteractCard }: WorldSceneProps) {
  // Phase actual: leemos del store global (set por ProgramaConversation via onPhaseChange)
  // El store no tiene "phase" directamente; lo manejamos via prop o key de cards.
  // Para simplicidad: la página pasará las cards correspondientes a la phase.
  // Acá solo renderizamos lo que está activo (la página gestiona).
  return (
    <>
      <ThirdPersonCamera mode={mode} />
      <Ground enabled={mode === 'free'} visible={mode !== 'welcome'} />
      <ForestEnvironment />
      <Bee state={mode === 'welcome' ? 'celebrating' : 'idle'} />
      <Player enabled={mode === 'free'} visible={mode !== 'welcome'} />
    </>
  )
}

interface ActiveCardsProps {
  phase: Phase
  onSelect: (id: string, value: string) => void
}

export function ActiveCards({ phase, onSelect }: ActiveCardsProps) {
  const cards: SpiritCardConfig[] | null = useMemo(() => {
    switch (phase) {
      case 'avatar': return AVATAR_CARDS
      case 'tema': return TEMA_CARDS
      case 'objetivo': return OBJETIVO_CARDS
      case 'estilo': return ESTILO_CARDS
      default: return null
    }
  }, [phase])
  if (!cards) return null
  return <SpiritCardGroup cards={cards} onSelect={onSelect} />
}
