import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { HiveDB } from '@johpaz/hive-db'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyAgentModels } from './agents-config'

let db: HiveDB, directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hl-agents-config-'))
  db = await HiveDB.open(directory)
  await db.collection('providers').put('gemini', { name: 'Gemini', enabled: 1 })
  await db.collection('providers').put('off', { name: 'Off', enabled: 0 })
  await db.collection('models').put('gemini-3.8-flash', { provider_id: 'gemini' })
  await db.collection('models').put('gemini-3.6-flash', { provider_id: 'gemini' })
  await db.collection('models').put('off-m', { provider_id: 'off' })
  for (const id of ['hl-coordinator-agent', 'hl-explanation-agent', 'hl-image-agent', 'hl-audio-agent']) {
    await db.collection('hl_agents').put(id, { name: id, provider_id: 'ollama', model_id: 'gemma', enabled: 1, system_prompt: 'prompt propio' })
  }
})
afterEach(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })

const model = async (id: string) => (await db.collection<{ model_id: string; provider_id: string; system_prompt: string }>('hl_agents').get(id))!.doc

describe('applyAgentModels', () => {
  test('applyToAll cambia los agentes de texto y deja imagen y audio', async () => {
    const result = await applyAgentModels(db, { applyToAll: { providerId: 'gemini', modelId: 'gemini-3.8-flash' } })
    expect(result.updated.sort()).toEqual(['hl-coordinator-agent', 'hl-explanation-agent'])
    expect(result.skipped.sort()).toEqual(['hl-audio-agent', 'hl-image-agent'])
    expect((await model('hl-explanation-agent')).model_id).toBe('gemini-3.8-flash')
    expect((await model('hl-image-agent')).model_id).toBe('gemma')
    expect((await model('hl-explanation-agent')).system_prompt).toBe('prompt propio')
  })

  test('includeMedia los cambia todos', async () => {
    const result = await applyAgentModels(db, { applyToAll: { providerId: 'gemini', modelId: 'gemini-3.6-flash', includeMedia: true } })
    expect(result.updated).toHaveLength(4)
  })

  test('es atómico: un modelo inválido no cambia nada', async () => {
    await expect(applyAgentModels(db, { applyToAll: { providerId: 'gemini', modelId: 'no-existe' } })).rejects.toThrow('no pertenece')
    await expect(applyAgentModels(db, { applyToAll: { providerId: 'off', modelId: 'off-m' } })).rejects.toThrow('desactivado')
    await expect(applyAgentModels(db, { updates: [
      { agentId: 'hl-coordinator-agent', providerId: 'gemini', modelId: 'gemini-3.8-flash' },
      { agentId: 'hl-explanation-agent', providerId: 'gemini', modelId: 'nada' },
    ] })).rejects.toThrow('no pertenece')
    expect((await model('hl-coordinator-agent')).model_id).toBe('gemma')
  })

  test('updates guarda varios cambios individuales de una vez', async () => {
    const result = await applyAgentModels(db, { updates: [
      { agentId: 'hl-coordinator-agent', providerId: 'gemini', modelId: 'gemini-3.8-flash' },
      { agentId: 'hl-explanation-agent', providerId: 'gemini', modelId: 'gemini-3.6-flash', enabled: false },
    ] })
    expect(result.updated).toHaveLength(2)
    expect((await model('hl-explanation-agent')).model_id).toBe('gemini-3.6-flash')
    expect((await db.collection<{ enabled: number }>('hl_agents').get('hl-explanation-agent'))!.doc.enabled).toBe(0)
    await expect(applyAgentModels(db, { updates: [{ agentId: 'x', providerId: 'gemini', modelId: 'gemini-3.8-flash' }] })).rejects.toThrow('no encontrado')
  })
})
