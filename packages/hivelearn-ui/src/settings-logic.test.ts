import { describe, expect, test } from 'bun:test'
import { agentChanged, isLocalBaseUrl, mergeProviders, modelOptions, settingsPayload, usableProviders } from './settings-logic'
import type { InstitutionSettings } from './types'

describe('settings-logic', () => {
  test('isLocalBaseUrl distingue red local de remota', () => {
    expect(isLocalBaseUrl('http://localhost:11434')).toBe(true)
    expect(isLocalBaseUrl('http://192.168.1.20:8080/v1')).toBe(true)
    expect(isLocalBaseUrl('https://llm.hiveagents.io/v1')).toBe(false)
    expect(isLocalBaseUrl('', 'ollama')).toBe(true)
    expect(isLocalBaseUrl('no es url')).toBe(false)
  })

  test('mergeProviders y usableProviders: activo y con clave (o local)', () => {
    const rows = mergeProviders(
      [
        { id: 'gemini', name: 'Gemini', hasApiKey: true, baseUrl: '' },
        { id: 'openai', name: 'OpenAI', hasApiKey: false, baseUrl: 'https://api.openai.com/v1' },
        { id: 'ollama', name: 'Ollama', hasApiKey: false, baseUrl: 'http://localhost:11434' },
        { id: 'groq', name: 'Groq', hasApiKey: true, baseUrl: 'https://api.groq.com/openai/v1' },
      ],
      [{ id: 'gemini', enabled: 1 }, { id: 'openai', enabled: 1 }, { id: 'ollama', enabled: 1 }, { id: 'groq', enabled: 0 }],
    )
    expect(usableProviders(rows).map(r => r.id).sort()).toEqual(['gemini', 'ollama'])
    const withVoice = mergeProviders([{ id: 'piper', name: 'Piper', hasApiKey: false, baseUrl: 'http://localhost:5500' }], [{ id: 'piper', enabled: 1, category: 'tts' }])
    expect(usableProviders(withVoice)).toEqual([])
    expect(usableProviders(withVoice, { voice: true }).map(r => r.id)).toEqual(['piper'])
  })

  test('modelOptions mantiene el valor actual y pone los activos primero', () => {
    const options = modelOptions([{ id: 'b', active: 0 }, { id: 'a', active: 1 }], 'viejo')
    expect(options.map(o => o.id)).toEqual(['viejo', 'a', 'b'])
    expect(options[0].name).toContain('actual')
  })

  test('agentChanged', () => {
    const a = { id: 'x', provider_id: 'p', model_id: 'm', max_iterations: 3, enabled: 1 }
    expect(agentChanged(a, { ...a })).toBe(false)
    expect(agentChanged(a, { ...a, model_id: 'n' })).toBe(true)
  })

  test('settingsPayload descarta un respaldo incompleto', () => {
    const base: InstitutionSettings = {
      providerId: 'p', modelId: 'm', imageProviderId: 'p', imageModelId: 'm', audioProviderId: 'p', audioModelId: 'm',
      voice: '', allowRemoteProviders: true, allowRemoteForMinors: false,
    }
    expect(settingsPayload({ ...base, fallbackProviderId: 'x', fallbackModelId: '' })).not.toHaveProperty('fallbackProviderId')
    expect(settingsPayload({ ...base, fallbackProviderId: 'x', fallbackModelId: 'y' })).toMatchObject({ fallbackProviderId: 'x', fallbackModelId: 'y' })
  })
})
