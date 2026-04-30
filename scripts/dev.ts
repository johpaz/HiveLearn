#!/usr/bin/env bun
/**
 * HiveLearn Development Script
 * Ejecuta el servidor y la UI en modo desarrollo con HMR
 */

import { $ } from 'bun'
import { logger } from '../packages/core/src/utils/logger'

// Set environment variables
process.env.NODE_ENV = 'development'

const log = logger.child('dev')

async function dev() {
  log.info('🐝 Starting HiveLearn development mode...')
  log.info('📡 Starting server on port 8787...')
  log.info('🎨 Starting UI on port 5173 (HMR enabled) - will use 5174 if busy...')

  // Start both processes in parallel
  const server = $`NODE_ENV=development bun run --cwd packages/core dev`
  const ui = $`bun run --cwd packages/ui dev`

  // Wait for both
  await Promise.all([server, ui])
}

dev().catch((error) => {
  log.error('Dev error', { error: (error as Error).message })
  process.exit(1)
})
