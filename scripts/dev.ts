#!/usr/bin/env bun
/**
 * HiveLearn Development Script
 * Ejecuta el servidor y la UI en modo desarrollo con HMR
 */

import { $ } from 'bun'
import { existsSync } from 'fs'
import path from 'path'
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
  // La UI es un paquete aparte: si no está en el árbol, solo se levanta el servidor.
  const hasUi = existsSync(path.join(import.meta.dir, '..', 'packages', 'hivelearn-ui', 'package.json'))
  if (!hasUi) log.info('Sin paquete hivelearn-ui: solo se inicia el servidor')
  const ui = hasUi ? $`bun run --cwd packages/hivelearn-ui dev` : Promise.resolve()

  await Promise.all([server, ui])
}

dev().catch((error) => {
  log.error('Dev error', { error: (error as Error).message })
  process.exit(1)
})
