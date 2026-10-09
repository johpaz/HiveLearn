/**
 * Gateway Manager for HiveLearn Core
 *
 * Provides functions to start, stop, and manage the HiveLearn gateway server.
 */

import { resolvePort } from "../utils/port";
import { initializeDatabase, getDb } from '../storage/hivedb'
import { initHiveLearnStorage } from '../storage/init'
import { closeSdkEngine, installShutdownHandlers, startSdkEngineIfEnabled } from '../agent/sdk/bootstrap'
import { logger } from '../utils/logger'
import { createServer, setBunServer } from '../gateway/server'
import type { HiveLearnConfig } from '../config/loader'

const log = logger.child('gateway')

let serverInstance: ReturnType<typeof Bun.serve> | null = null
let isRunning = false

/**
 * Start the HiveLearn gateway server
 */
export async function startGateway(config: HiveLearnConfig): Promise<void> {
  if (isRunning) {
    log.warn('Gateway is already running')
    return
  }

  const PORT = resolvePort(config.gateway?.port ?? process.env.HIVELEARN_PORT, 8787)
  const HOST = config.gateway?.host || process.env.HIVELEARN_HOST || '0.0.0.0'
  const nodeEnv = process.env.NODE_ENV
  const isDev = nodeEnv === 'development'

  log.info(`🐝 HiveLearn Gateway starting... (NODE_ENV=${nodeEnv || 'undefined'})`)
  log.info(`📍 Mode: ${isDev ? 'Development' : 'Production'}`)

  try {
    // Initialize database
    await initializeDatabase()
    log.info('✅ Database initialized')

    // Initialize schemas
    await initHiveLearnStorage()
    log.info('✅ Database schemas initialized')

    // Motor de agentes basado en @johpaz/hive-sdk (opt-in): base propia, separada de hl_*.
    if (await startSdkEngineIfEnabled()) log.info('✅ SDK agent engine initialized')

    // Reconcile de runs de generación huérfanos (larga duración)
    const { reconcileGenerationRuns } = await import('../agent/run-store')
    const interrupted = await reconcileGenerationRuns()
    if (interrupted > 0) log.info(`♻️  ${interrupted} run(s) de generación marcados como interrupted`)
  } catch (error) {
    log.error('❌ Database initialization failed', { error: (error as Error).message })
    throw error
  }

  // Create server
  const server = createServer()

  // Start server
  serverInstance = Bun.serve({
    port: PORT,
    hostname: HOST,
    fetch: server.fetch,
    websocket: server.websocket,
    idleTimeout: 120,
    maxRequestBodySize: 3 * 1024 * 1024,
  })

  // Register Bun server so WebSocket upgrades work inside createServer()
  setBunServer(serverInstance)
  installShutdownHandlers(stopGateway)

  isRunning = true
  log.info(`✅ Gateway listening on http://${HOST}:${PORT}`)

  if (isDev) {
    log.info('🔨 Development mode: UI served from Vite')
  } else {
    log.info('📦 Production mode: UI served from static files')
  }
}

/**
 * Stop the HiveLearn gateway server
 */
export async function stopGateway(): Promise<void> {
  if (!isRunning || !serverInstance) {
    log.warn('Gateway is not running')
    return
  }

  // `stop()` es grácil desde Bun 1.4: espera las peticiones en vuelo y cierra las
  // conexiones ociosas. Sin el await, stopGateway() retornaba —y marcaba
  // isRunning=false— con el apagado todavía en curso.
  await serverInstance.stop()
  serverInstance = null
  isRunning = false
  await closeSdkEngine()
  log.info('✅ Gateway stopped')
}

/**
 * Check if gateway is running
 */
export function getGatewayStatus(): boolean {
  return isRunning
}

/**
 * Get the current server instance (for advanced usage)
 */
export function getServerInstance(): ReturnType<typeof Bun.serve> | null {
  return serverInstance
}
