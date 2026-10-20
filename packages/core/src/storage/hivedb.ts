/**
 * HiveLearn HiveDB — Gestión de base de datos independiente
 *
 * Motor de almacenamiento: @johpaz/hive-db (redb + índice semántico).
 * Base de datos propia de HiveLearn, separada del core principal de Hive.
 * El path es un DIRECTORIO (no un archivo sqlite).
 */
import { HiveDB } from '@johpaz/hive-db'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { logger } from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let db: HiveDB | null = null
let dbPath: string = ''

const LEGACY_META_BACKUP_SUFFIX = '.v0.3.backup'

/**
 * Migra únicamente el meta.json escrito por HiveDB <= 0.3.x.
 *
 * HiveDB 0.5 introdujo documentos semánticos autoritativos y deshabilita los
 * vectores cuando no se proporciona una configuración explícita. HiveLearn
 * usa ese modo de texto y reconstruye su índice durante initHiveLearnStorage.
 */
export function migrateLegacyDatabaseMetadata(path: string): boolean {
  const metaPath = join(path, 'meta.json')
  if (!existsSync(metaPath)) return false

  let metadata: unknown
  try {
    metadata = JSON.parse(readFileSync(metaPath, 'utf8'))
  } catch {
    // HiveDB emitirá el error canónico para metadatos dañados o ilegibles.
    return false
  }

  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  ) return false

  const record = metadata as Record<string, unknown>
  const keys = Object.keys(record)
  const isLegacyMetadata =
    keys.length === 1 &&
    keys[0] === 'vector_dimension' &&
    Number.isInteger(record.vector_dimension) &&
    Number(record.vector_dimension) > 0

  if (!isLegacyMetadata) return false

  const backupPath = `${metaPath}${LEGACY_META_BACKUP_SUFFIX}`
  if (!existsSync(backupPath)) copyFileSync(metaPath, backupPath)

  const temporaryPath = `${metaPath}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    writeFileSync(temporaryPath, JSON.stringify({
      schema_version: 2,
      metric: 'cosine',
      vector: null,
    }, null, 2))
    renameSync(temporaryPath, metaPath)
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
  }

  return true
}

/**
 * Obtener el path de la base de datos
 * Prioridad:
 * 1. HIVELEARN_DB_PATH env var
 * 2. ~/.hivelearn/hivedb
 * 3. ./data/hivedb (desarrollo)
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
      dbPath = join(hiveLearnDir, 'hivedb')
      return dbPath
    } catch {
      // Fallback a directorio local
    }
  }

  // Desarrollo: usar directorio data/
  dbPath = join(__dirname, '../../data/hivedb')
  return dbPath
}

/**
 * Inicializar la base de datos
 * Debe llamarse desde el server principal (async — HiveDB.open es async)
 */
export async function initializeDatabase(): Promise<HiveDB> {
  if (db) return db

  const path = getDbPath()

  // Asegurar que el directorio existe
  try {
    mkdirSync(path, { recursive: true })
  } catch {
    // Directorio ya existe o no se puede crear
  }

  if (migrateLegacyDatabaseMetadata(path)) {
    logger.info('Legacy HiveDB metadata migrated from 0.3 to 0.5', {
      source: 'hivelearn-db',
      backup: `${join(path, 'meta.json')}${LEGACY_META_BACKUP_SUFFIX}`,
    })
  }

  // Búsqueda semántica local (multilingual-e5-small, ~470 MB la primera vez). Opt-in: sin ella la búsqueda es
  // BM25 sobre texto, que ya cubre guías, programas y materiales. Si el embedder no está disponible se abre en modo texto.
  if (process.env.HIVELEARN_EMBEDDER === 'local') {
    try {
      db = await HiveDB.open(path, { embedder: 'local' })
      logger.info('Embedder local activo: la búsqueda combina texto y significado', { source: 'hivelearn-db' })
    } catch (error) {
      logger.warn(`Embedder local no disponible (${(error as Error).message}); búsqueda solo por texto`, { source: 'hivelearn-db' })
    }
  }
  if (!db) db = await HiveDB.open(path)

  logger.info(`Database initialized at ${path}`, { source: 'hivelearn-db' })
  return db
}

/**
 * Obtener instancia de la base de datos
 * Debe llamarse después de initializeDatabase()
 */
export function getDb(): HiveDB {
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
    logger.info('Database closed', { source: 'hivelearn-db' })
  }
}

// ─── Contadores con OCC ─────────────────────────────────────────────────────

interface CounterDoc {
  value: number
}

/**
 * Genera el siguiente ID numérico para un contador nombrado.
 * Emula los INTEGER PRIMARY KEY AUTOINCREMENT del schema sqlite anterior,
 * usando optimistic concurrency (put con expectedVersion) con reintentos.
 */
export async function nextNumericId(counterName: string, maxRetries = 10): Promise<number> {
  const counters = getDb().collection<CounterDoc>('counters')

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const entry = await counters.get(counterName)
    const next = (entry?.doc.value ?? 0) + 1
    try {
      await counters.put(counterName, { value: next }, { expectedVersion: entry?.version ?? 0 })
      return next
    } catch {
      // Conflicto de versión — reintentar
    }
  }

  throw new Error(`No se pudo incrementar el contador "${counterName}" tras ${maxRetries} intentos`)
}

/**
 * Secuencia por sesión para colecciones append-only
 * (ids ordenables: `${sessionId}:${seq con padding}` → scan con prefix queda ordenado).
 */
export async function nextSessionSeq(collection: string, sessionId: string): Promise<string> {
  const seq = await nextNumericId(`${collection}:${sessionId}`)
  return String(seq).padStart(8, '0')
}

/** Timestamp actual en ISO (reemplaza CURRENT_TIMESTAMP / datetime('now') de sqlite) */
export function nowIso(): string {
  return new Date().toISOString()
}
