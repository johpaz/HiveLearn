/**
 * @hivelearn/game — Platformer educativo tipo Mario con PixiJS.
 * Diseño: docs/plans/2026-06-09-mario-pixijs-game-design.md
 */

export { Game, type GameOptions } from './game'
export { GameBridge, emptyProgress } from './bridge/gameBridge'
export type { GameProgress, GameToApp, AppToGame, OnboardingMessage } from './bridge/gameBridge'
export { BootScene } from './scenes/bootScene'
export { demoLevelSpec } from './levels/generator'
