/**
 * Dimensionado del programa a partir de lo declarado. Determinista, acotado y sin modelo: el Arquitecto puede variar
 * el resultado ±1 nodo por nivel (`clampToSizing`), nunca salirse de estos límites.
 */
import type { AgeBand } from '../age'
import { PROGRAM_LIMITS, type ProgramIntent } from './program-def'

const MINUTES_PER_NODE: Record<AgeBand, number> = { ninez: 6, adolescencia_temprana: 8, adolescencia: 10, adulto: 10 }

export interface Sizing { levels: number; nodesPerLevel: number[]; minutesPerNode: number }

export interface SizingInput {
  intent: Pick<ProgramIntent, 'minutes' | 'energy' | 'priorKnowledge'>
  ageBand: AgeBand
  /** Nodos que la memoria del alumno ya registra como consolidados en este tema (reducen lo introductorio). */
  alreadyMastered?: number
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function sizeProgram(input: SizingInput): Sizing {
  const { intent, ageBand } = input
  const minutesPerNode = MINUTES_PER_NODE[ageBand]
  const base = clamp(Math.round(intent.minutes / minutesPerNode), PROGRAM_LIMITS.minNodesPerLevel, 5)
  const levels = intent.minutes <= 15 ? 2 : intent.minutes <= 30 ? 3 : intent.minutes <= 45 ? 4 : 5

  const perLevel = Array.from({ length: levels }, () => base)
  // Poca energía: cargas más livianas en todos los niveles.
  if (intent.energy === 'baja') for (let i = 0; i < perLevel.length; i++) perLevel[i] -= 1
  // Conocimiento previo: el nivel introductorio pide menos.
  if (intent.priorKnowledge !== 'ninguno') perLevel[0] -= 1
  if (intent.priorKnowledge === 'bastante') perLevel[0] -= (input.alreadyMastered ?? 0) >= 3 ? 1 : 0

  let sizes = perLevel.map(n => clamp(n, PROGRAM_LIMITS.minNodesPerLevel, PROGRAM_LIMITS.maxNodesPerLevel))
  // Tope global de nodos: se recorta desde los últimos niveles.
  let total = sizes.reduce((a, b) => a + b, 0)
  for (let i = sizes.length - 1; total > PROGRAM_LIMITS.maxNodesTotal && i >= 0; i--) {
    const cut = Math.min(total - PROGRAM_LIMITS.maxNodesTotal, sizes[i] - PROGRAM_LIMITS.minNodesPerLevel)
    sizes[i] -= cut
    total -= cut
  }
  return { levels, nodesPerLevel: sizes, minutesPerNode }
}

/** Cuántos nodos admite un nivel: lo dimensionado ±1, dentro de los límites globales. */
export function allowedNodes(sizing: Sizing, levelIndex: number): { min: number; max: number } {
  const planned = sizing.nodesPerLevel[Math.min(levelIndex, sizing.nodesPerLevel.length - 1)] ?? PROGRAM_LIMITS.minNodesPerLevel
  return {
    min: Math.max(PROGRAM_LIMITS.minNodesPerLevel, planned - 1),
    max: Math.min(PROGRAM_LIMITS.maxNodesPerLevel, planned + 1),
  }
}
