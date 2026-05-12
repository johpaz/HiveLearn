import { create } from 'zustand'

export interface Vec3 { x: number; y: number; z: number }

interface Programa3DState {
  playerPos: Vec3
  setPlayerPos: (v: Vec3) => void

  beePos: Vec3
  setBeePos: (v: Vec3) => void

  moveTarget: Vec3 | null
  setMoveTarget: (v: Vec3 | null) => void

  hint: string | null
  setHint: (v: string | null) => void
}

const SPAWN: Vec3 = { x: 0, y: 0, z: 8 }
const BEE_ANCHOR: Vec3 = { x: 0, y: 1.6, z: 0 }

export const usePrograma3DStore = create<Programa3DState>((set) => ({
  playerPos: { ...SPAWN },
  setPlayerPos: (v) => set({ playerPos: v }),

  beePos: { ...BEE_ANCHOR },
  setBeePos: (v) => set({ beePos: v }),

  moveTarget: null,
  setMoveTarget: (moveTarget) => set({ moveTarget }),

  hint: null,
  setHint: (hint) => set({ hint }),
}))

export const PLAYER_SPAWN: Vec3 = { ...SPAWN }
export const BEE_ANCHOR_POS: Vec3 = { ...BEE_ANCHOR }
