/**
 * Motor de agentes basado en @johpaz/hive-sdk — arranque y cierre.
 *
 * El SDK abre su propia HiveDB (singleton de módulo, ruta por HIVE_DB_PATH). Se le da una base
 * SEPARADA de la de HiveLearn (`hl_*`) porque comparten nombres de colección (`providers`, `models`,
 * `counters`) con shapes distintos y el SDK resiembra los modelos de catálogo en cada arranque.
 *
 * El SDK se importa de forma perezosa: con el motor `legacy` no se carga nada.
 */
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { closeDatabase, getDbPath } from '../../storage/hivedb'
import { logger } from '../../utils/logger'
import { installSdkToolPolicy, removeSdkToolPolicy } from '../policy/sdk-hook'

const log = logger.child('hl-sdk-engine')

let ready: Promise<void> | null = null
let started = false

export type AgentEngine = 'sdk' | 'legacy'

/** Motor activo. Por defecto `legacy` hasta que el SDK pase la paridad. */
export function getAgentEngine(): AgentEngine {
  return process.env.HIVELEARN_AGENT_ENGINE === 'sdk' ? 'sdk' : 'legacy'
}

/** Rutas de la base y del directorio de trabajo del SDK (junto a la base de HiveLearn). */
export function sdkPaths(): { home: string; dbPath: string } {
  const parent = dirname(getDbPath())
  return {
    home: process.env.HIVELEARN_SDK_HOME || join(parent, 'sdk-home'),
    dbPath: process.env.HIVELEARN_SDK_DB_PATH || join(parent, 'sdk-db'),
  }
}

/**
 * Abre la base del SDK. Idempotente. Debe ejecutarse antes del primer uso del SDK.
 * HIVE_HOME y HIVE_DB_PATH se fijan SIEMPRE aquí: si el entorno apuntara a la instalación de Hive,
 * el SDK compartiría su base con otra aplicación.
 */
export function initSdkEngine(): Promise<void> {
  if (ready) return ready
  ready = (async () => {
    const { home, dbPath } = sdkPaths()
    mkdirSync(home, { recursive: true })
    mkdirSync(dbPath, { recursive: true })
    process.env.HIVE_HOME = home
    process.env.HIVE_DB_PATH = dbPath

    const storage = await import('@johpaz/hive-sdk/storage')
    await storage.ensureHiveDb({ specialists: 'none' })
    await installSdkToolPolicy()
    started = true
    log.info(`SDK engine ready (db=${dbPath})`)
  })().catch((error) => {
    ready = null
    throw error
  })
  return ready
}

/** Cierre ordenado: vaciar trazas y cerrar la base del SDK antes de salir del proceso. */
export async function closeSdkEngine(): Promise<void> {
  if (!started) return
  started = false
  ready = null
  removeSdkToolPolicy()
  const agent = await import('@johpaz/hive-sdk/agent')
  const storage = await import('@johpaz/hive-sdk/storage')
  await agent.flushTraces()
  storage.closeHiveDb()
  log.info('SDK engine closed')
}

export function isSdkEngineStarted(): boolean {
  return started
}

/**
 * Arranque común de los dos entrypoints del servidor (`startGateway` y `gateway/index.ts`):
 * abre la base del SDK solo si el motor `sdk` está activo.
 */
export async function startSdkEngineIfEnabled(): Promise<boolean> {
  if (getAgentEngine() !== 'sdk') return false
  await initSdkEngine()
  return true
}

let shutdownHandlersRegistered = false

/**
 * Cierra servidor y bases en orden al recibir SIGINT/SIGTERM. Sin esto, con la base del SDK abierta el
 * proceso termina con un fallo nativo al finalizar (observado en las pruebas del motor SDK).
 * Solo se instala con el motor `sdk`: el comportamiento del motor `legacy` no cambia.
 */
export function installShutdownHandlers(stopServer: () => Promise<void>): void {
  if (shutdownHandlersRegistered || getAgentEngine() !== 'sdk') return
  shutdownHandlersRegistered = true
  const shutdown = async (signal: string) => {
    log.info(`${signal} recibido, cerrando...`)
    try {
      await stopServer()
    } finally {
      await closeSdkEngine()
      closeDatabase()
      process.exit(0)
    }
  }
  process.once('SIGINT', () => { void shutdown('SIGINT') })
  process.once('SIGTERM', () => { void shutdown('SIGTERM') })
}
