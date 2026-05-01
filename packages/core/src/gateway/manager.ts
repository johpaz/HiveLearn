/**
 * Gateway Manager for HiveLearn Core
 *
 * Provides functions to start, stop, and manage the HiveLearn gateway server.
 */

import { initializeDatabase, getDb } from '../storage/sqlite'
import { initHiveLearnStorage } from '../storage/init'
import { logger, redact } from '../utils/logger'
import { createServer } from '../gateway/server'
import { setupGlobalErrorHandlers } from '../middleware/error-handler'
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

  // Setup global error handlers
  setupGlobalErrorHandlers()
  log.info('✅ Global error handlers registered')

  log.info('🐝 HiveLearn Gateway starting...', {
    NODE_ENV: nodeEnv || 'undefined',
    mode: isDev ? 'Development' : 'Production',
    port: PORT,
    host: HOST,
  })

  // Log environment configuration (redacted)
  const envConfig = redact({
    HIVELEARN_PORT: process.env.HIVELEARN_PORT,
    HIVELEARN_HOST: process.env.HIVELEARN_HOST,
    HIVELEARN_HOME: process.env.HIVELEARN_HOME,
    HIVELEARN_DB_PATH: process.env.HIVELEARN_DB_PATH,
    NODE_ENV: process.env.NODE_ENV,
    // Redactar sensitive vars
    HIVE_MASTER_KEY: process.env.HIVE_MASTER_KEY ? '[SET]' : '[NOT SET]',
  })
  log.debug('Environment configuration', envConfig)

  try {
    // Initialize database
    log.info('📦 Initializing database...')
    const db = initializeDatabase()
    log.info('✅ Database initialized', {
      path: process.env.HIVELEARN_DB_PATH || '~/.hivelearn/hivelearn.db',
    })

    // Initialize schemas
    log.info('📋 Initializing schemas...')
    initHiveLearnStorage(db)
    log.info('✅ Database schemas initialized')

    // Verify database state
    try {
      const providersCount = (db.query('SELECT COUNT(*) as count FROM providers').get() as any)?.count || 0
      const modelsCount = (db.query('SELECT COUNT(*) as count FROM models').get() as any)?.count || 0
      log.info('📊 Database state', {
        providers: providersCount,
        models: modelsCount,
      })
    } catch (error) {
      log.warn('Could not verify database state', { error: (error as Error).message })
    }
  } catch (error) {
    log.error('❌ Database initialization failed', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    throw error
  }

  // Create server
  log.info('🔧 Creating server instance...')
  const server = createServer()
  log.debug('Server instance created')

  try {
    // Start server
    log.info(`🚀 Starting server on http://${HOST}:${PORT}...`)
    serverInstance = Bun.serve({
      port: PORT,
      hostname: HOST,
      fetch: server.fetch,
      websocket: server.websocket,
    })

    isRunning = true
    log.info(`✅ Gateway listening on http://${HOST}:${PORT}`)

    if (isDev) {
      log.info('🔨 Development mode: UI served from Vite dev server')
      log.info('📝 Logs will be written to ~/.hivelearn/logs/')
    } else {
      log.info('📦 Production mode: UI served from static files')
    }

    // Log startup summary
    log.info('📊 Startup summary', {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
    })
  } catch (error) {
    log.error('❌ Failed to start server', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      port: PORT,
      host: HOST,
    })
    throw error
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
