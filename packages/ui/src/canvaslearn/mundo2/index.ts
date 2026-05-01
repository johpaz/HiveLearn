/**
 * Mundo de Aprendizaje HiveLearn — Módulo principal
 * 
 * Exporta todos los componentes y utilidades del mundo pixel art dinámico
 */

// ─── Componente principal ────────────────────────────────────────────────────
export { MundoWorld } from './MundoWorld'
export type { MundoWorldProps } from './MundoWorld'

// ─── Constants ───────────────────────────────────────────────────────────────
export * from './constants'

// ─── Types ───────────────────────────────────────────────────────────────────
export * from './types'

// ─── Player ──────────────────────────────────────────────────────────────────
export { Player } from './player/Player'
export type { PlayerOptions } from './player/Player'

// ─── World ───────────────────────────────────────────────────────────────────
export { WorldMap } from './world/WorldMap'
export type { WorldMapOptions } from './world/WorldMap'

export { WorldCamera } from './world/WorldCamera'
export type { WorldCameraOptions } from './world/WorldCamera'

export { ParallaxBackground } from './world/ParallaxBackground'

// ─── Zones ───────────────────────────────────────────────────────────────────
export { ZoneManager } from './zones/ZoneManager'

// ─── Effects ─────────────────────────────────────────────────────────────────
export { ParticleSystem } from './effects/ParticleSystem'
export { SoundManager, soundManager } from './effects/SoundManager'
export type { SoundDef } from './effects/SoundManager'

// ─── Events ──────────────────────────────────────────────────────────────────
export { SurpriseEventManager, surpriseEventManager } from './events/SurpriseEvents'
export type { SurpriseEventsOptions } from './events/SurpriseEvents'

// ─── Gamification ────────────────────────────────────────────────────────────
export { GamificationOverlay } from './gamification/GamificationOverlay'
export type { GamificationOverlayProps } from './gamification/GamificationOverlay'

// ─── Protocol ────────────────────────────────────────────────────────────────
export { WebSocketManager } from './protocol/WebSocketManager'
export type { WebSocketManagerOptions, WebSocketState, MessageHandler } from './protocol/WebSocketManager'

export { A2UIBridge } from './protocol/A2UIBridge'
export type { A2UIBridgeOptions } from './protocol/A2UIBridge'

// ─── Utils ───────────────────────────────────────────────────────────────────
export { WorldSaveManager, WorldRegenerator } from './utils/WorldSaveManager'
export type { SaveOptions, LoadResult } from './utils/WorldSaveManager'

// ─── Agents ──────────────────────────────────────────────────────────────────
export { CoordinatorCharacter } from './agents/CoordinatorCharacter'
export type { CoordinatorCharacterOptions } from './agents/CoordinatorCharacter'

export { PedagogicalCharacter } from './agents/PedagogicalCharacter'
export type { PedagogicalCharacterOptions } from './agents/PedagogicalCharacter'

export { MonitorCharacter } from './agents/MonitorCharacter'
export type { MonitorCharacterOptions } from './agents/MonitorCharacter'
