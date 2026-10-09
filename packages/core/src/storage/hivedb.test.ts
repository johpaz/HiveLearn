import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HiveDB } from '@johpaz/hive-db'

import { migrateLegacyDatabaseMetadata } from './hivedb'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function temporaryDatabase(): string {
  const directory = mkdtempSync(join(tmpdir(), 'hivelearn-hivedb-test-'))
  temporaryDirectories.push(directory)
  return directory
}

describe('migrateLegacyDatabaseMetadata', () => {
  test('migrates HiveDB 0.3 metadata and preserves a backup', async () => {
    const directory = temporaryDatabase()
    const metaPath = join(directory, 'meta.json')
    writeFileSync(metaPath, JSON.stringify({ vector_dimension: 384 }))

    expect(migrateLegacyDatabaseMetadata(directory)).toBe(true)
    expect(JSON.parse(readFileSync(metaPath, 'utf8'))).toEqual({
      schema_version: 2,
      metric: 'cosine',
      vector: null,
    })
    expect(JSON.parse(readFileSync(`${metaPath}.v0.3.backup`, 'utf8'))).toEqual({
      vector_dimension: 384,
    })

    const db = await HiveDB.open(directory)
    db.close()
  })

  test('leaves current and unknown metadata untouched', () => {
    const currentDirectory = temporaryDatabase()
    const currentPath = join(currentDirectory, 'meta.json')
    const current = { schema_version: 2, metric: 'cosine', vector: null }
    writeFileSync(currentPath, JSON.stringify(current))

    expect(migrateLegacyDatabaseMetadata(currentDirectory)).toBe(false)
    expect(JSON.parse(readFileSync(currentPath, 'utf8'))).toEqual(current)

    const unknownDirectory = temporaryDatabase()
    const unknownPath = join(unknownDirectory, 'meta.json')
    const unknown = { vector_dimension: 384, custom: true }
    writeFileSync(unknownPath, JSON.stringify(unknown))

    expect(migrateLegacyDatabaseMetadata(unknownDirectory)).toBe(false)
    expect(JSON.parse(readFileSync(unknownPath, 'utf8'))).toEqual(unknown)
  })
})
