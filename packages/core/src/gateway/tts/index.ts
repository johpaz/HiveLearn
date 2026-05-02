/**
 * HiveLearn TTS Module
 *
 * Módulo para síntesis de voz offline en el gateway de Hive.
 * Fallback local cuando no hay internet o no hay providers configurados.
 *
 * Iniciar servidor (standalone):
 *   bun run packages/core/src/gateway/tts/server.ts
 *
 * Uso interno:
 *   import { isTTSAvailable, synthesize } from "./tts/client"
 */

export * from "./client.js"
export { detectPlatform } from "./detect.js"
