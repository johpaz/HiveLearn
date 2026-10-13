import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'hl-model-sync-'))
process.env.HIVELEARN_DB_PATH = join(root, 'hivedb')
process.env.HIVELEARN_SECRET_KEY = 'model-sync-secret-key-0123456789abcdef'

import { closeDatabase, getDb, initializeDatabase } from '../storage/hivedb'
import { catalogModelKey, isResellerProvider, wireModelId } from './model-id'
import { fetchRemoteModels, listTarget, SkipSync } from './remote'
import { migrateResellerIds, planProviderSync, syncModels, lastSyncReport, type StoredModelDoc } from './sync'

beforeAll(async () => { await initializeDatabase() })
afterAll(() => { closeDatabase(); rmSync(root, { recursive: true, force: true }) })

const json = (value: unknown) => Response.json(value)
const doc = (over: Partial<StoredModelDoc> & { provider_id: string }): StoredModelDoc => ({
  name: 'x', model_type: 'llm', context_window: 1000, capabilities: null, enabled: 1, active: 0, ...over,
})

describe('ids de catálogo', () => {
  test('los revendedores llevan su path y el propietario no', () => {
    expect(catalogModelKey('openrouter', 'google/gemini-3.5-flash')).toBe('openrouter/google/gemini-3.5-flash')
    expect(catalogModelKey('gemini', 'gemini-3.5-flash')).toBe('gemini-3.5-flash')
    expect(catalogModelKey('groq', 'groq/compound')).toBe('groq/groq/compound')
    expect(wireModelId('openrouter', 'openrouter/google/gemini-3.5-flash')).toBe('google/gemini-3.5-flash')
    expect(wireModelId('groq', 'groq/groq/compound')).toBe('groq/compound')
    expect(wireModelId('anthropic', 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(isResellerProvider('nvidia')).toBe(true)
    expect(isResellerProvider('openai')).toBe(false)
  })
})

describe('planProviderSync', () => {
  const now = '2026-10-13T00:00:00.000Z'
  const existing = (id: string, d: Partial<StoredModelDoc> = {}, version = 1) => ({ id, version, doc: doc({ provider_id: 'openai', ...d }) })

  test('agrega nuevos inactivos, actualiza contexto y elimina lo retirado', () => {
    const plan = planProviderSync({
      providerId: 'openai', now, usage: new Map(),
      existing: [existing('gpt-a', { context_window: 1000 }), existing('gpt-viejo')],
      remote: [{ wireId: 'gpt-a', name: 'GPT A', modelType: 'llm', contextWindow: 2000 }, { wireId: 'gpt-nuevo', name: 'GPT Nuevo', modelType: 'llm', contextWindow: 4000 }],
    })
    expect(plan.add.map(a => [a.id, a.doc.active, a.doc.source])).toEqual([['gpt-nuevo', 0, 'sync']])
    expect(plan.update.map(u => [u.id, u.changes])).toEqual([['gpt-a', ['context_window', 'wire_id']]])
    expect(plan.remove.map(r => r.id)).toEqual(['gpt-viejo'])
  })

  test('un modelo retirado que usa un agente se conserva marcado y se informa', () => {
    const plan = planProviderSync({
      providerId: 'openai', now, usage: new Map([['gpt-viejo', ['agente Coordinador']]]),
      existing: [existing('gpt-viejo', { active: 1 })], remote: [{ wireId: 'gpt-a', name: 'A', modelType: 'llm' }],
    })
    expect(plan.remove).toEqual([])
    expect(plan.protect).toMatchObject([{ id: 'gpt-viejo', usedBy: ['agente Coordinador'], doc: { status: 'missing', active: 1 } }])
  })

  test('los modelos manuales no se tocan y un listado que encoge no autoriza borrar', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => existing(id))
    const plan = planProviderSync({
      providerId: 'openai', now, usage: new Map(),
      existing: [...rows, existing('mio', { source: 'manual' })],
      remote: [{ wireId: 'a', name: 'a', modelType: 'llm' }],
    })
    expect(plan.remove).toEqual([])
    expect(plan.deletionsBlocked).toContain('1 modelos')
    expect(plan.protect).toEqual([])
  })

  test('descarta embeddings/imagen y repone un modelo que había desaparecido', () => {
    const plan = planProviderSync({
      providerId: 'openai', now, usage: new Map(),
      existing: [existing('gpt-a', { status: 'missing' })],
      remote: [{ wireId: 'gpt-a', name: 'a', modelType: 'llm' }, { wireId: 'text-embedding-3', name: 'e', modelType: 'embedding' }],
    })
    expect(plan.add).toEqual([])
    expect(plan.update.map(u => u.changes)).toEqual([['status', 'wire_id']])
  })
})

describe('listados remotos', () => {
  test('OpenRouter: nombre propio, contexto y capacidades; sin salida de texto se descarta', async () => {
    const fetcher = (async () => json({ data: [
      { id: 'google/gemini-3.5-flash', name: 'Google: Gemini 3.5 Flash', context_length: 1_000_000, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, supported_parameters: ['tools', 'reasoning'] },
      { id: 'black-forest-labs/flux', name: 'Flux', architecture: { output_modalities: ['image'] } },
    ] })) as unknown as typeof fetch
    const target = listTarget('openrouter', undefined, undefined)
    const models = await fetchRemoteModels(target, fetcher)
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({ wireId: 'google/gemini-3.5-flash', contextWindow: 1_000_000 })
    expect(models[0].capabilities).toEqual(expect.arrayContaining(['vision', 'function_calling', 'reasoning']))
  })

  test('Gemini: quita "models/" y exige generateContent; Anthropic y Ollama', async () => {
    const gemini = await fetchRemoteModels(listTarget('gemini', undefined, 'k'), (async () => json({ models: [
      { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', inputTokenLimit: 1048576, supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ] })) as unknown as typeof fetch)
    expect(gemini.map(m => m.wireId)).toEqual(['gemini-3.8-flash'])

    const anthropic = await fetchRemoteModels(listTarget('anthropic', undefined, 'k'), (async () => json({ data: [{ id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' }] })) as unknown as typeof fetch)
    expect(anthropic[0]).toMatchObject({ wireId: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' })

    const ollama = await fetchRemoteModels(listTarget('ollama', 'http://localhost:11434', undefined), (async () => json({ models: [{ name: 'gemma4:e4b' }] })) as unknown as typeof fetch)
    expect(ollama[0].wireId).toBe('gemma4:e4b')
  })

  test('sin clave o sin API de listado se omite', () => {
    expect(() => listTarget('openai', 'https://api.openai.com/v1', undefined)).toThrow(SkipSync)
    expect(() => listTarget('hiveagents', 'https://llm.hiveagents.io/v1', 'k')).toThrow(SkipSync)
  })
})

describe('syncModels', () => {
  beforeEach(async () => {
    const db = getDb()
    for (const name of ['models', 'providers', 'hl_agents', 'hl_portal_settings', 'hl_installation', 'hl_model_sync_runs']) {
      for (const entry of await db.collection(name).scan()) await db.collection(name).delete(entry.id)
    }
  })

  const provider = (id: string, base: string) => getDb().collection('providers').put(id, { name: id, base_url: base, category: 'llm', enabled: 1, active: 1 })
  const model = (id: string, d: Partial<StoredModelDoc> & { provider_id: string }) => getDb().collection('models').put(id, doc(d))
  const agent = (id: string, provider_id: string, model_id: string) =>
    getDb().collection('hl_agents').put(id, { name: id, provider_id, model_id, max_iterations: 3, enabled: 1 })

  const fetcher = ((url: string) => {
    if (String(url).includes('openrouter')) return json({ data: [
      { id: 'google/gemini-3.6-flash', name: 'Gemini 3.6 Flash', context_length: 1_000_000, architecture: { output_modalities: ['text'] } },
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', context_length: 400000, architecture: { output_modalities: ['text'] } },
    ] })
    if (String(url).includes('generativelanguage')) return json({ models: [{ name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', inputTokenLimit: 1048576, supportedGenerationMethods: ['generateContent'] }] })
    return new Response('no', { status: 500 })
  }) as unknown as typeof fetch
  const resolveConfig = async (id: string) => ({ apiKey: id === 'gemini' ? 'k' : undefined, baseUrl: undefined })

  test('migra ids de OpenRouter al path con prefijo y re-apunta a los agentes', async () => {
    await provider('openrouter', 'https://openrouter.ai/api/v1')
    await model('google/gemini-3.6-flash', { provider_id: 'openrouter', name: 'Gemini 3.6 (OR)' })
    await model('anthropic/claude-viejo', { provider_id: 'openrouter' })
    await agent('hl-uno', 'openrouter', 'google/gemini-3.6-flash')
    await getDb().collection('hl_portal_settings').put('inst', { providerId: 'openrouter', modelId: 'google/gemini-3.6-flash' })

    const report = await syncModels(getDb(), { fetcher, resolveConfig, ignorePolicy: true, providerId: 'openrouter' })
    const r = report.providers[0]
    expect(r.status).toBe('ok')
    expect(r.migrated).toContain('google/gemini-3.6-flash → openrouter/google/gemini-3.6-flash')

    const ids = (await getDb().collection('models').scan()).map(e => e.id).sort()
    expect(ids).toEqual(['openrouter/anthropic/claude-sonnet-5', 'openrouter/google/gemini-3.6-flash'])
    expect((await getDb().collection<{ model_id: string }>('hl_agents').get('hl-uno'))!.doc.model_id).toBe('openrouter/google/gemini-3.6-flash')
    expect((await getDb().collection<{ modelId: string }>('hl_portal_settings').get('inst'))!.doc.modelId).toBe('openrouter/google/gemini-3.6-flash')
    expect(r.removed).toEqual(['openrouter/anthropic/claude-viejo'])
    expect(r.added).toEqual(['openrouter/anthropic/claude-sonnet-5'])
    expect((await lastSyncReport(getDb()))?.providers[0].providerId).toBe('openrouter')
  })

  test('un modelo directo y el mismo vía OpenRouter conviven con ids distintos', async () => {
    await provider('gemini', '')
    await provider('openrouter', 'https://openrouter.ai/api/v1')
    await syncModels(getDb(), { fetcher, resolveConfig, ignorePolicy: true })
    const ids = (await getDb().collection('models').scan()).map(e => e.id).sort()
    expect(ids).toContain('gemini-3.8-flash')
    expect(ids).toContain('openrouter/google/gemini-3.6-flash')
    expect(ids.some(id => id === 'google/gemini-3.6-flash')).toBe(false)
  })

  test('simulación no escribe; error de un proveedor no afecta a los demás', async () => {
    await provider('gemini', '')
    await provider('openai', 'https://api.openai.com/v1') // 500 con el fetcher de prueba
    const report = await syncModels(getDb(), { fetcher, resolveConfig: async id => ({ apiKey: 'k', baseUrl: id === 'gemini' ? undefined : 'https://api.openai.com/v1' }), ignorePolicy: true, dryRun: true })
    expect(report.providers.find(p => p.providerId === 'gemini')?.added).toEqual(['gemini-3.8-flash'])
    expect(report.providers.find(p => p.providerId === 'openai')?.status).toBe('error')
    expect(await getDb().collection('models').count()).toBe(0)
    expect(await lastSyncReport(getDb())).toBeNull()
  })

  test('con la política en "sin proveedores remotos" solo se consultan los locales', async () => {
    await getDb().collection('hl_installation').put('main', { institutionId: 'inst', name: 'Colegio' })
    await getDb().collection('hl_portal_settings').put('inst', { allowRemoteProviders: false, allowRemoteForMinors: false })
    await provider('openrouter', 'https://openrouter.ai/api/v1')
    const report = await syncModels(getDb(), { fetcher, resolveConfig })
    expect(report.providers[0]).toMatchObject({ status: 'skipped', reason: expect.stringContaining('política') })
  })

  test('migrateResellerIds es idempotente y respeta filas ya prefijadas', async () => {
    await model('openrouter/google/x', { provider_id: 'openrouter', wire_id: 'google/x' })
    await model('groq/compound', { provider_id: 'groq' })
    expect(await migrateResellerIds(getDb())).toEqual([{ from: 'groq/compound', to: 'groq/groq/compound' }])
    expect(await migrateResellerIds(getDb())).toEqual([])
  })
})
