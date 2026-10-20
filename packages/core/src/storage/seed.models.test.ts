import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'hl-seed-models-'))
process.env.HIVELEARN_DB_PATH = join(root, 'hivedb')
process.env.HIVELEARN_SECRET_KEY = 'seed-models-secret-key-0123456789abcdef'

import { closeDatabase, getDb, initializeDatabase } from './hivedb'
import { seedAllData } from './seed'

beforeAll(async () => { await initializeDatabase() })
afterAll(() => { closeDatabase(); rmSync(root, { recursive: true, force: true }) })

describe('seed de modelos', () => {
  test('siembra el catálogo inicial una sola vez: lo que la sincronización retira no resucita', async () => {
    await seedAllData()
    const models = getDb().collection<{ provider_id: string }>('models')
    const ids = (await models.scan()).map(e => e.id)
    expect(ids).toContain('openrouter/anthropic/claude-opus-4-6') // path distintivo de OpenRouter
    expect(ids).not.toContain('anthropic/claude-opus-4-6')
    expect(ids).toContain('claude-opus-4-6') // el modelo propio de Anthropic conserva su nombre
    expect(ids.some(id => id.includes('local'))).toBe(false)

    await models.delete('claude-opus-4-6')
    await seedAllData()
    expect(await models.get('claude-opus-4-6')).toBeUndefined()
  })

  test('el proveedor retirado (local-llama) se elimina si nada lo usa', async () => {
    const db = getDb()
    await db.collection('providers').put('local-llama', { name: 'Local', base_url: 'http://localhost:8080/v1', category: 'llm', enabled: 1, active: 1 })
    await db.collection('models').put('local-llama-x', { provider_id: 'local-llama', name: 'x', model_type: 'llm', context_window: 1, capabilities: null, enabled: 1, active: 0 })
    await seedAllData()
    expect(await db.collection('providers').get('local-llama')).toBeUndefined()
    expect(await db.collection('models').get('local-llama-x')).toBeUndefined()
  })
})
