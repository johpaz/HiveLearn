/**
 * PixiJS Swarm World - Módulo de visualización del enjambre HiveLearn
 * 
 * Componentes para visualizar la interacción entre el coordinador
 * y los agentes educativos usando PixiJS v8 con robots procedurales
 */

// Componentes principales
export { RobotSprite } from './RobotSprite'
export type { RobotSpriteOptions } from './RobotSprite'

export { LaboratoryWorld } from './LaboratoryWorld'
export type { LaboratoryWorldProps } from './LaboratoryWorld'

// Sistemas
export { ParticleSystem, particleSystem } from './ParticleSystem'
export type { ParticleType, ParticleData } from './ParticleSystem'

export { SoundManager, soundManager } from './SoundManager'
export type { SoundDef } from './SoundManager'

// Eventos sorpresa
export { SurpriseEventManager, surpriseEventManager } from './SurpriseEvents'
export type { SurpriseEventType, SurpriseEvent } from './SurpriseEvents'

// Gamificación
export { 
  GamificationOverlay,
  XPBar,
  AchievementNotification,
  XPPopup,
  GamificationManager,
  gamificationManager,
} from './GamificationOverlay'
export type { LevelInfo, Achievement, RobotGamification } from './GamificationOverlay'

// Animación
export { Tween, Tween2D, TweenManager, tweenManager, Easings } from './Tween'
export type { TweenConfig, Tween2DConfig, TweenOptions, EasingFunction } from './Tween'

// Hooks
export { usePixiApp, usePixiAssets } from './usePixiApp'

// Constants
export * from './constants'

// Legacy exports (para compatibilidad hacia atrás)
export { AgentSprite } from './AgentSprite'
export { CoordinatorSprite } from './CoordinatorSprite'
export { DelegationParticles, ConnectionLines } from './DelegationParticles'
export { PixiSwarmWorld } from './PixiSwarmWorld'
export type { PixiSwarmWorldProps } from './PixiSwarmWorld'
