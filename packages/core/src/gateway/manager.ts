/**
 * Gateway Manager for HiveLearn Core
 *
 * Provides functions to start, stop, and manage the HiveLearn gateway server.
 */

import { initializeDatabase, getDb } from '../storage/sqlite'
import { initHiveLearnStorage } from '../storage/init'
import { logger } from '../utils/logger'
import { createServer } from '../gateway/server'
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

  const PORT = config.gateway?.port || parseInt(process.env.HIVELEARN_PORT || '8787')
  const HOST = config.gateway?.host || process.env.HIVELEARN_HOST || '0.0.0.0'
  const nodeEnv = process.env.NODE_ENV
  const isDev = nodeEnv === 'development'

  log.info(`🐝 HiveLearn Gateway starting... (NODE_ENV=${nodeEnv || 'undefined'})`)
  log.info(`📍 Mode: ${isDev ? 'Development' : 'Production'}`)

  try {
    // Initialize database
    const db = initializeDatabase()
    log.info('✅ Database initialized')

    // Initialize schemas
    initHiveLearnStorage(db)
    log.info('✅ Database schemas initialized')
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
  })

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

  serverInstance.stop()
  serverInstance = null
  isRunning = false
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
