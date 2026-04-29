#!/usr/bin/env bun
/**
 * HiveLearn Development Script
 * Ejecuta el servidor y la UI en modo desarrollo con HMR
 */

import { $ } from 'bun'

// Set environment variables
process.env.NODE_ENV = 'development'

async function dev() {
  console.log('🐝 Starting HiveLearn development mode...\n')
  console.log('📡 Starting server on port 8787...')
  console.log('🎨 Starting UI on port 5173 (HMR enabled)...\n')
  
  // Start both processes in parallel
  const server = $`NODE_ENV=development bun run --cwd packages/core dev`
  const ui = $`bun run --cwd packages/ui dev`
  
  // Wait for both
  await Promise.all([server, ui])
}

dev().catch((error) => {
  console.error('Dev error:', error)
  process.exit(1)
})
