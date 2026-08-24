/**
 * @hivelearn/game — Platformer educativo tipo Mario con PixiJS.
 * Diseño: docs/plans/2026-06-09-mario-pixijs-game-design.md
 */

export { Game, type GameOptions } from './game'
export { GameBridge, emptyProgress } from './bridge/gameBridge'
export type { GameProgress, GameToApp, AppToGame, OnboardingMessage, A2UIMessage } from './bridge/gameBridge'
export { BootScene } from './scenes/bootScene'
export { TitleScene } from './scenes/titleScene'
export { HiveHubScene } from './scenes/hiveHubScene'
export { demoLevelSpec } from './levels/generator'
export { HIVE_AGENTS, getAgent, AGENT_ORDER } from './entities/agents'
export type { HiveAgent, HiveAgentId } from './entities/agents'
