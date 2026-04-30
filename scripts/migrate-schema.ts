/**
 * HiveLearn — Script de migración de schema
 *
 * Elimina las columnas de encriptación de la tabla providers
 * Nota: SQLite no soporta DROP COLUMN directamente en versiones antiguas,
 * por lo que usamos un approach de recrear la tabla.
 *
 * IMPORTANTE: Ejecutar ESTE script DESPUÉS de ejecutar migrate-api-keys.ts
 * para asegurar que todas las API keys estén en Bun.secrets
 *
 * Uso:
 *   bun run scripts/migrate-schema.ts
 */

import { getDb, initDb } from '../packages/core/src/storage/sqlite'
import { existsSync } from 'fs'

async function migrateSchema() {
  console.log('🐝 HiveLearn — Migración de Schema (eliminar columnas de encriptación)')
  console.log('='.repeat(60))
  console.log('')
  console.log('⚠️  ADVERTENCIA: Este script eliminará las columnas:')
  console.log('   - api_key_encrypted')
  console.log('   - api_key_iv')
  console.log('   - headers_encrypted')
  console.log('   - headers_iv')
  console.log('')
  console.log('✅ Asegúrate de haber ejecutado: bun run scripts/migrate-api-keys.ts')
  console.log('')

  const confirm = process.argv.includes('--yes') || process.argv.includes('-y')
  
  if (!confirm) {
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    await new Promise<void>((resolve) => {
      rl.question('¿Continuar con la migración? (yes/no): ', (answer) => {
        rl.close()
        if (answer.toLowerCase() === 'yes') {
          resolve()
        } else {
          console.log('❌ Migración cancelada.')
          process.exit(0)
        }
      })
    })
  }

  const dbPath = process.env.HIVELEARN_DB_PATH || '~/.hive/hivelearn.db'
  const expandedPath = dbPath.startsWith('~') 
    ? dbPath.replace('~', process.env.HOME || process.env.HOMEDIR || '')
    : dbPath

  if (!existsSync(expandedPath)) {
    console.log(`❌ Base de datos no encontrada en: ${expandedPath}`)
    process.exit(1)
  }

  console.log(`📂 Base de datos: ${expandedPath}`)
  console.log('')

  try {
    initDb()
    const db = getDb()

    // Verificar si las columnas existen
    const tableInfo = db.query('PRAGMA table_info(providers)').all() as Array<{ name: string }>
    const columnsToRemove = ['api_key_encrypted', 'api_key_iv', 'headers_encrypted', 'headers_iv']
    const existingColumns = columnsToRemove.filter(col => 
      tableInfo.some(info => info.name === col)
    )

    if (existingColumns.length === 0) {
      console.log('✅ Las columnas de encriptación ya no existen. No se requiere migración.')
      process.exit(0)
    }

    console.log(`📋 Columnas a eliminar: ${existingColumns.join(', ')}`)
    console.log('')

    // SQLite no soporta DROP COLUMN en versiones antiguas
    // Usamos el approach de recrear la tabla
    console.log('🔄 Recreando tabla providers sin columnas de encriptación...')

    db.exec('BEGIN TRANSACTION')

    // 1. Renombrar tabla actual
    db.exec('ALTER TABLE providers RENAME TO providers_old')

    // 2. Crear nueva tabla sin columnas de encriptación
    db.exec(`
      CREATE TABLE providers (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        base_url        TEXT,
        category        TEXT NOT NULL DEFAULT 'llm',
        num_ctx         INTEGER,
        num_gpu         INTEGER DEFAULT -1,
        enabled         INTEGER NOT NULL DEFAULT 1,
        active          INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `)

    // 3. Copiar datos (excluyendo columnas de encriptación)
    db.exec(`
      INSERT INTO providers (id, name, base_url, category, num_ctx, num_gpu, enabled, active, created_at)
      SELECT id, name, base_url, category, num_ctx, num_gpu, enabled, active, created_at
      FROM providers_old
    `)

    // 4. Eliminar tabla antigua
    db.exec('DROP TABLE providers_old')

    db.exec('COMMIT')

    console.log('✅ Migración completada exitosamente!')
    console.log('')
    console.log('Las columnas de encriptación han sido eliminadas.')
    console.log('Las API keys ahora están almacenadas en Bun.secrets (keychain del SO).')
  } catch (error) {
    console.error('❌ Error durante la migración:', (error as Error).message)
    process.exit(1)
  }
}

migrateSchema()
