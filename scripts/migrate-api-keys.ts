/**
 * HiveLearn — Migración de API Keys a Bun.secrets
 *
 * Este script migra las API keys encriptadas desde la base de datos
 * hacia el almacenamiento seguro del SO usando Bun.secrets
 *
 * Uso:
 *   bun run scripts/migrate-api-keys.ts
 *
 * Nota: Este script usa las funciones decryptApiKey existentes para
 * leer las keys de la BD y luego las guarda en Bun.secrets
 */

import { getDb, initDb } from '../packages/core/src/storage/sqlite'
import { decryptApiKey } from '../packages/core/src/crypto/decrypt'
import { existsSync } from 'fs'

async function migrateApiKeys() {
  console.log('🐝 HiveLearn — Migración de API Keys a Bun.secrets')
  console.log('=' .repeat(50))

  // Inicializar BD si es necesario
  const dbPath = process.env.HIVELEARN_DB_PATH || '~/.hive/hivelearn.db'
  const expandedPath = dbPath.startsWith('~') 
    ? dbPath.replace('~', process.env.HOME || process.env.HOMEDIR || '')
    : dbPath

  if (!existsSync(expandedPath)) {
    console.log(`❌ Base de datos no encontrada en: ${expandedPath}`)
    console.log('Asegúrate de haber ejecutado HiveLearn al menos una vez.')
    process.exit(1)
  }

  console.log(`📂 Base de datos: ${expandedPath}`)

  try {
    initDb()
    const db = getDb()

    // Obtener todos los providers con API key encriptada
    const providers = db.query(`
      SELECT id, name, api_key_encrypted, api_key_iv, active
      FROM providers
      WHERE api_key_encrypted IS NOT NULL AND api_key_encrypted != ''
    `).all() as Array<{
      id: string
      name: string
      api_key_encrypted: string
      api_key_iv: string
      active: number
    }>

    if (providers.length === 0) {
      console.log('✅ No hay API keys encriptadas para migrar.')
      process.exit(0)
    }

    console.log(`📋 Encontrados ${providers.length} providers con API keys encriptadas`)
    console.log('')

    let migrated = 0
    let failed = 0

    for (const provider of providers) {
      process.stdout.write(`   Migrando ${provider.name} (${provider.id})... `)

      try {
        // Desencriptar API key desde la BD
        const apiKey = decryptApiKey(provider.api_key_encrypted, provider.api_key_iv)

        // Guardar en Bun.secrets (usar argumentos posicionales: service, name, value)
        await Bun.secrets.set('hivelearn', `provider:${provider.id}:apikey`, apiKey)

        console.log('✅ OK')
        migrated++
      } catch (error) {
        console.log(`❌ Error: ${(error as Error).message}`)
        failed++
      }
    }

    console.log('')
    console.log('=' .repeat(50))
    console.log(`📊 Resumen:`)
    console.log(`   ✅ Migrados: ${migrated}`)
    console.log(`   ❌ Fallidos: ${failed}`)
    console.log('')

    if (failed === 0) {
      console.log('🎉 ¡Migración completada exitosamente!')
      console.log('')
      console.log('Las API keys ahora están almacenadas en el keychain del SO.')
      console.log('Puedes eliminar las columnas api_key_encrypted y api_key_iv de la BD.')
    } else {
      console.log('⚠️  Algunos providers fallaron. Revisa los errores arriba.')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error durante la migración:', (error as Error).message)
    process.exit(1)
  }
}

// Ejecutar migración
migrateApiKeys()
