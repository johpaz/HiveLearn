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

// `bun run dev -- --sdk` (o `bun run dev:sdk`) arranca con el motor de agentes de @johpaz/hive-sdk.
if (process.argv.includes('--sdk')) process.env.HIVELEARN_AGENT_ENGINE = 'sdk'

async function dev() {
  log.info(`🐝 Starting HiveLearn development mode... (motor de agentes: ${process.env.HIVELEARN_AGENT_ENGINE === 'sdk' ? 'sdk' : 'legacy'})`)
  log.info('📡 Starting server on port 8787...')
  log.info('🎨 UI con HMR en :5173 y compilada (dist) para el gateway en :8787')

  // La UI es un paquete aparte: si no está en el árbol, solo se levanta el servidor.
  const hasUi = existsSync(path.join(import.meta.dir, '..', 'packages', 'hivelearn-ui', 'package.json'))
  if (!hasUi) log.info('Sin paquete hivelearn-ui: solo se inicia el servidor')

  // El gateway (:8787) sirve `packages/hivelearn-ui/dist`: se compila ANTES de arrancar para que no abra con una
  // UI vieja o vacía, y se mantiene al día con `vite build --watch` mientras se desarrolla.
  if (hasUi) {
    log.info('🎨 Compilando la UI (dist) para el gateway...')
    await $`bun run --cwd packages/hivelearn-ui build`
  }

  const server = $`NODE_ENV=development bun run --cwd packages/core dev`
  const ui = hasUi ? $`bun run --cwd packages/hivelearn-ui dev` : Promise.resolve()
  const watch = hasUi ? $`bun run --cwd packages/hivelearn-ui build:watch` : Promise.resolve()

  await Promise.all([server, ui, watch])
}

dev().catch((error) => {
  log.error('Dev error', { error: (error as Error).message })
  process.exit(1)
})
