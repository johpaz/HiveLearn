import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'hl-convpolicy-'))
process.env.HIVELEARN_DB_PATH = join(root, 'hivedb')
process.env.HIVELEARN_SECRET_KEY = 'conv-policy-secret-key-0123456789abcdef'
delete process.env.HIVELEARN_ALLOW_REMOTE_FOR_MINORS

import { initializeDatabase, closeDatabase, getDb } from '../storage/hivedb'
import { encryptApiKey } from '../crypto/encrypt'
import { runHiveLearnConversation } from './conversation'

beforeAll(async () => {
  await initializeDatabase()
  const { encrypted, iv } = encryptApiKey('sk-test')
  await getDb().collection('providers').put('openai', { name: 'OpenAI', api_key_encrypted: encrypted, api_key_iv: iv, headers_encrypted: null, headers_iv: null, base_url: 'https://remote.invalid/v1', category: 'llm', num_ctx: null, num_gpu: 0, enabled: 1, active: 1, created_at: new Date().toISOString() })
  await getDb().collection('hl_agents').put('hl-onboarding-agent', { name: 'O', description: null, system_prompt: 'Eres Maya', role: 'worker', provider_id: 'openai', model_id: 'm', max_iterations: 3, tools_json: '[]', prompt_patch: null, last_prompt_update_reason: null, enabled: 1, updated_at: new Date().toISOString() })
})
afterAll(() => { closeDatabase(); rmSync(root, { recursive: true, force: true }) })

describe('runHiveLearnConversation respeta la política por edad', () => {
  const ask = (runContext?: { ageBand: 'ninez' | 'adulto' }) => runHiveLearnConversation({ agentId: 'hl-onboarding-agent', messages: [{ role: 'user', content: 'hola' } as never], runContext }).catch(e => e)

  test('sin contexto se asume la banda restrictiva: un proveedor remoto no se usa', async () => {
    const error = await ask()
    expect((error as { code?: string }).code).toBe('provider_not_allowed')
  })

  test('un menor tampoco', async () => {
    expect(((await ask({ ageBand: 'ninez' })) as { code?: string }).code).toBe('provider_not_allowed')
  })

  test('un adulto sí llega al proveedor (aquí falla por red, no por política)', async () => {
    const error = await ask({ ageBand: 'adulto' })
    expect((error as { code?: string }).code).not.toBe('provider_not_allowed')
  })
})
