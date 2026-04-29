#!/usr/bin/env bun
/**
 * HiveLearn Build Script
 * Construye todos los paquetes del monorepo
 */

import { $ } from 'bun'
import { existsSync, rmSync } from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dir, '..')
const PACKAGES = ['core', 'server', 'ui']

async function build() {
  console.log('🐝 Building HiveLearn...\n')
  
  for (const pkg of PACKAGES) {
    const pkgDir = path.join(ROOT, 'packages', pkg)
    const distDir = path.join(pkgDir, 'dist')
    
    console.log(`📦 Building @hivelearn/${pkg}...`)
    
    // Clean dist
    if (existsSync(distDir)) {
      rmSync(distDir, { recursive: true })
    }
    
    try {
      if (pkg === 'ui') {
        // Vite build
        await $`cd ${pkgDir} && bun run build`
      } else {
        // Bun build
        await $`cd ${pkgDir} && bun run build`
      }
      console.log(`✅ @hivelearn/${pkg} built successfully\n`)
    } catch (error) {
      console.error(`❌ @hivelearn/${pkg} build failed:`, error)
      process.exit(1)
    }
  }
  
  console.log('🎉 All packages built successfully!')
}

build()
