/**
 * Configuration Loader for HiveLearn Core
 *
 * Loads and manages configuration from environment variables and config files.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '../utils/logger'
import { getDbPath } from '../storage/sqlite'

const log = logger.child('config')

export interface HiveLearnConfig {
  gateway?: {
    port?: number
    host?: string
    pidFile?: string
  }
  logging?: {
    level?: string
  }
  models?: {
    defaultProvider?: string
    defaults?: Record<string, string>
  }
}

let cachedConfig: HiveLearnConfig | null = null

/**
 * Get the base Hive directory from environment or default
 */
export function getHiveDir(customDir?: string): string {
  if (customDir) {
    return join(customDir)
  }

  // Check environment variable
  if (process.env.HIVE_HOME) {
    return join(process.env.HIVE_HOME)
  }

  // Development mode
  if (process.env.HIVE_DEV === 'true') {
    return join(process.env.HOME || '', '.hive-dev')
  }

  // Default production location
  return join(process.env.HOME || '', '.hive')
}

/**
 * Load configuration from environment and config files
 */
export async function loadConfig(): Promise<HiveLearnConfig> {
  if (cachedConfig) {
    return cachedConfig
  }

  const config: HiveLearnConfig = {
    gateway: {
      port: parseInt(process.env.HIVELEARN_PORT || '8787'),
      host: process.env.HIVELEARN_HOST || '0.0.0.0',
    },
    logging: {
      level: process.env.HIVELEARN_LOG_LEVEL || 'info',
    },
    models: {
      defaultProvider: process.env.HIVELEARN_PROVIDER || 'ollama',
      defaults: {
        ollama: process.env.HIVELEARN_MODEL || 'gemma4:2b',
      },
    },
  }

  // Try to load from config file if exists
  const hiveDir = getHiveDir()
  const configPath = join(hiveDir, 'config.json')

  if (existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<HiveLearnConfig>
      cachedConfig = { ...config, ...fileConfig }
      log.debug('Config loaded from file', { path: configPath })
      return cachedConfig
    } catch (error) {
      log.warn('Failed to load config file', { error: (error as Error).message })
    }
  }

  cachedConfig = config
  log.debug('Config loaded from environment')
  return config
}

/**
 * Reset cached config (for testing or reload)
 */
export function resetConfig(): void {
  cachedConfig = null
}

/**
 * Get logger instance
 */
export { logger }
