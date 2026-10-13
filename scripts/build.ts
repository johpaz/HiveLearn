#!/usr/bin/env bun
/**
 * HiveLearn Build Script
 * Construye todos los paquetes del monorepo
 */

import { $ } from 'bun'
import { existsSync, rmSync } from 'fs'
import path from 'path'

const ROOT = path.join(import.meta.dir, '..')
// Solo se construyen los paquetes que existen en el árbol (la UI vuelve como paquete aparte).
const exists = (pkg: string) => existsSync(path.join(ROOT, 'packages', pkg, 'package.json'))
// El CLI embebe la UI compilada: sin `hivelearn-ui/dist` no se puede empaquetar.
const uiBuilt = existsSync(path.join(ROOT, 'packages', 'hivelearn-ui', 'dist'))
const PACKAGES = ['core', 'hivelearn-ui', 'cli'].filter(pkg => exists(pkg) && (pkg !== 'cli' || uiBuilt))

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
      await $`cd ${pkgDir} && bun run build`
      console.log(`✅ @hivelearn/${pkg} built successfully\n`)
    } catch (error) {
      console.error(`❌ @hivelearn/${pkg} build failed:`, error)
      process.exit(1)
    }
  }
  
  console.log('🎉 All packages built successfully!')
}

build()
