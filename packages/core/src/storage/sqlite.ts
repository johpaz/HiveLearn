/**
 * HiveLearn SQLite — Gestión de base de datos independiente
 * 
 * Base de datos propia de HiveLearn, separada del core principal de Hive
 */
import { Database } from 'bun:sqlite'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

let db: Database | null = null
let dbPath: string = ''

/**
 * Obtener el path de la base de datos
 * Prioridad:
 * 1. HIVELEARN_DB_PATH env var
 * 2. ~/.hivelearn/hivelearn.db
 * 3. ./data/hivelearn.db (desarrollo)
 */
export function getDbPath(): string {
  if (dbPath) return dbPath

  const envPath = process.env.HIVELEARN_DB_PATH
  if (envPath) {
    dbPath = envPath
    return dbPath
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  if (homeDir) {
    const hiveLearnDir = join(homeDir, '.hivelearn')
    try {
      mkdirSync(hiveLearnDir, { recursive: true })
      dbPath = join(hiveLearnDir, 'hivelearn.db')
      return dbPath
    } catch {
      // Fallback a directorio local
    }
  }

  // Desarrollo: usar directorio data/
  dbPath = join(__dirname, '../../data/hivelearn.db')
  return dbPath
}

/**
 * Inicializar la base de datos
 * Debe llamarse desde el server principal
 */
export function initializeDatabase(): Database {
  if (db) return db

  const path = getDbPath()
  
  // Asegurar que el directorio existe
  const dir = dirname(path)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // Directorio ya existe o no se puede crear
  }

  db = new Database(path, { create: true })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  
  console.log(`[hivelearn-db] Database initialized at ${path}`)
  return db
}

/**
 * Obtener instancia de la base de datos
 * Debe llamarse después de initializeDatabase()
 */
export function getDb(): Database {
  if (!db) {
    throw new Error(
      'Database not initialized. Call initializeDatabase() first.'
    )
  }
  return db
}

/**
 * Cerrar la base de datos
 * Llamar al shutdown del servidor
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[hivelearn-db] Database closed')
  }
}
