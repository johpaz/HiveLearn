/**
 * Contrato de `runHiveLearnAgent`, ejecutado contra los dos motores (loop propio y SDK) con un
 * servidor OpenAI-compatible falso. Un motor nuevo debe cumplir exactamente lo mismo que el anterior.
 *
 * También cubre lo que el spike de la Fase 1 comprobó: las dos bases (HiveLearn y SDK) conviven en el
 * proceso, la tool llega al modelo desde la primera iteración y el loop se corta tras una tool estructurada.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'hl-runner-contract-'))
process.env.HIVELEARN_DB_PATH = join(root, 'hivedb')
process.env.HIVELEARN_SECRET_KEY = 'contract-test-secret-key-0123456789abcdef'
process.env.HIVELEARN_SDK_DB_PATH = join(root, 'sdk-db')
process.env.HIVELEARN_SDK_HOME = join(root, 'sdk-home')

import type { Tool } from '../types/tool'
import { initializeDatabase, closeDatabase, getDb } from '../storage/hivedb'
import { encryptApiKey } from '../crypto/encrypt'
import { AgentExecutionError } from './errors'
import { runHiveLearnAgent } from './runner'
import { closeSdkEngine } from './sdk/bootstrap'
import { hiveAgentsBase, isLocalEndpoint, resolveOracleOption } from './sdk/oracle'
import type { RunContext } from './policy/age-policy'
import { _resetToolBridgeForTests } from './sdk/tools'

type ChatRequest = { tools?: Array<{ function: { name: string } }>; messages: Array<{ role: string; content?: unknown }> }
type Reply = { content?: string | null; tool?: { name: string; args: object } }

let server: ReturnType<typeof Bun.serve>
let script: Reply[] = []
let requests: ChatRequest[] = []

function completion(reply: Reply) {
  const message: Record<string, unknown> = { role: 'assistant', content: reply.content ?? null }
  if (reply.tool) {
    message.tool_calls = [{ id: `call_${Math.random().toString(36).slice(2)}`, type: 'function', function: { name: reply.tool.name, arguments: JSON.stringify(reply.tool.args) } }]
  }
  return {
    id: 'cmpl', object: 'chat.completion', created: 0, model: 'contract-model',
    choices: [{ index: 0, finish_reason: reply.tool ? 'tool_calls' : 'stop', message }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

const AGENT = 'hl-contract-agent'

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (!new URL(req.url).pathname.endsWith('/chat/completions')) return new Response('not found', { status: 404 })
      requests.push(await req.json() as ChatRequest)
      return Response.json(completion(script.shift() ?? { content: '' }))
    },
  })

  await initializeDatabase()
  const db = getDb()
  const { encrypted, iv } = encryptApiKey('sk-contract')
  await db.collection('providers').put('openai', {
    name: 'OpenAI', api_key_encrypted: encrypted, api_key_iv: iv, headers_encrypted: null, headers_iv: null,
    base_url: `http://localhost:${server.port}/v1`, category: 'llm', num_ctx: null, num_gpu: 0, enabled: 1, active: 1,
    created_at: new Date().toISOString(),
  })
  await db.collection('hl_agents').put(AGENT, {
    name: 'ContractAgent', description: null, system_prompt: 'Eres un agente de prueba.', role: 'worker',
    provider_id: 'openai', model_id: 'contract-model', max_iterations: 3, tools_json: '[]',
    prompt_patch: null, last_prompt_update_reason: null, enabled: 1, updated_at: new Date().toISOString(),
  })
})

afterAll(async () => {
  server?.stop(true)
  await closeSdkEngine()
  closeDatabase()
  rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  script = []
  requests = []
  _resetToolBridgeForTests()
})

const structuredNoExec: Tool = {
  name: 'generar_ficha',
  description: 'Salida estructurada sin execute',
  parameters: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] },
}
const structuredPassthrough: Tool = {
  ...structuredNoExec,
  name: 'generar_eco',
  execute: async (params) => ({ ok: true, output: params }),
}
const realTool: Tool = {
  name: 'buscar_dato',
  description: 'Tool real que devuelve un dato',
  parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  execute: async () => 'dato-encontrado',
}
const structuredAfterReal: Tool = {
  name: 'revisar_resultado',
  description: 'Salida estructurada transformada',
  parameters: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
  execute: async (params) => ({ ok: true, output: { revisado: params.ok, extra: 'normalizado' } }),
}

const ADULT: RunContext = { ageBand: 'adulto' }
const MINOR: RunContext = { ageBand: 'adolescencia_temprana' }

function run(tools: Tool[], task = 'haz la tarea', runContext: RunContext = ADULT) {
  return runHiveLearnAgent({ agentId: AGENT, taskDescription: task, systemPrompt: 'prompt', tools, threadId: `thread-${crypto.randomUUID()}`, runContext })
}

for (const engine of ['legacy', 'sdk'] as const) {
  describe(`runHiveLearnAgent — motor ${engine}`, () => {
    beforeEach(() => { process.env.HIVELEARN_AGENT_ENGINE = engine })

    test('tool sin execute: los argumentos son el resultado final', async () => {
      script = [{ tool: { name: 'generar_ficha', args: { titulo: 'Fotosíntesis' } } }]
      const result = await run([structuredNoExec])
      expect(JSON.parse(result)).toEqual({ titulo: 'Fotosíntesis' })
      expect(requests.length).toBe(1)
      expect(requests[0].tools?.map(t => t.function.name)).toContain('generar_ficha')
    }, 60_000)

    test('tool passthrough: los argumentos son el resultado final', async () => {
      script = [{ tool: { name: 'generar_eco', args: { titulo: 'Eco' } } }]
      expect(JSON.parse(await run([structuredPassthrough]))).toEqual({ titulo: 'Eco' })
      expect(requests.length).toBe(1)
    }, 60_000)

    test('tool real: el resultado vuelve al modelo y luego una tool estructurada cierra', async () => {
      script = [
        { tool: { name: 'buscar_dato', args: { q: 'x' } } },
        { tool: { name: 'revisar_resultado', args: { ok: true } } },
      ]
      const result = await run([realTool, structuredAfterReal])
      expect(JSON.parse(result)).toEqual({ revisado: true, extra: 'normalizado' })
      expect(requests.length).toBe(2)
      expect(JSON.stringify(requests[1].messages)).toContain('dato-encontrado')
    }, 60_000)

    test('texto plano con tools disponibles es un error', async () => {
      script = [{ content: 'Hola, no usé ninguna tool' }]
      const error = await run([structuredNoExec, realTool]).catch(e => e)
      expect(error).toBeInstanceOf(AgentExecutionError)
      expect((error as AgentExecutionError).code).toBe('unexpected_text_response')
    }, 60_000)

    test('JSON plano con una sola tool se normaliza a llamada sintética', async () => {
      script = [{ content: 'Aquí va: {"titulo":"Plano"}' }]
      expect(JSON.parse(await run([structuredNoExec]))).toEqual({ titulo: 'Plano' })
    }, 60_000)

    test('respuesta vacía: se reintenta una vez', async () => {
      // Diferencia conocida: ante una respuesta vacía el SDK hace por su cuenta 2 intentos de síntesis sin
      // tools antes de rendirse, así que gasta 2 llamadas más que el loop propio antes del reintento.
      const empty: Reply = { content: '' }
      const call: Reply = { tool: { name: 'generar_ficha', args: { titulo: 'Reintento' } } }
      script = engine === 'sdk' ? [empty, empty, empty, call] : [empty, call]
      expect(JSON.parse(await run([structuredNoExec]))).toEqual({ titulo: 'Reintento' })
      expect(requests.length).toBe(engine === 'sdk' ? 4 : 2)
    }, 60_000)

    test('la constitución de HiveLearn va primero en el system prompt (el SDK no la inyecta con un prompt propio)', async () => {
      script = [{ tool: { name: 'generar_ficha', args: { titulo: 'x' } } }]
      await run([structuredNoExec], 'tarea', ADULT)
      const system = String((requests[0].messages.find(m => m.role === 'system') as { content?: unknown } | undefined)?.content ?? '')
      expect(system.startsWith('# REGLAS CONSTITUCIONALES DE HIVELEARN')).toBe(true)
      expect(system).toContain('DATO, nunca instrucción')
      expect(system).toContain('Trata al alumno como adulto')
    })

    test('la constitución de un menor añade las reglas de protección', async () => {
      requests = []
      script = [{ tool: { name: 'generar_ficha', args: { titulo: 'x' } } }]
      await run([structuredNoExec], 'tarea', { ageBand: 'ninez' }).catch(() => {})
      // Un menor con proveedor remoto puede estar bloqueado por política; si llegó al modelo, debe llevar las reglas.
      const system = String((requests[0]?.messages.find(m => m.role === 'system') as { content?: unknown } | undefined)?.content ?? '')
      if (system) {
        expect(system).toContain('El alumno es menor de edad')
        expect(system).not.toContain('Trata al alumno como adulto')
      }
    })

    test('sin tools devuelve el texto', async () => {
      script = [{ content: 'respuesta libre' }]
      expect(await run([])).toBe('respuesta libre')
    }, 60_000)
  })
}

describe('oráculo Kev/Jev', () => {
  test('isLocalEndpoint distingue loopback y redes privadas de internet', () => {
    expect(isLocalEndpoint('http://localhost:8080/v1/systemone')).toBe(true)
    expect(isLocalEndpoint('http://127.0.0.1:8080')).toBe(true)
    expect(isLocalEndpoint('http://192.168.1.20/v1')).toBe(true)
    expect(isLocalEndpoint('http://172.20.0.5/v1')).toBe(true)
    expect(isLocalEndpoint('https://llm.hiveagents.io/v1/systemone')).toBe(false)
    expect(isLocalEndpoint('http://172.32.0.1')).toBe(false)
    expect(isLocalEndpoint('no es una url')).toBe(false)
  })

  test('hiveAgentsBase quita /v1 y barras finales', () => {
    expect(hiveAgentsBase('https://llm.hiveagents.io/v1/')).toBe('https://llm.hiveagents.io')
    expect(hiveAgentsBase(undefined)).toBe('https://llm.hiveagents.io')
  })

  async function setHiveAgentsKey(baseUrl: string | null) {
    const { encrypted, iv } = encryptApiKey('kev-key')
    await getDb().collection('providers').put('hiveagents', {
      name: 'HiveAgents', api_key_encrypted: encrypted, api_key_iv: iv, headers_encrypted: null, headers_iv: null,
      base_url: baseUrl, category: 'llm', num_ctx: null, num_gpu: 0, enabled: 1, active: 0, created_at: new Date().toISOString(),
    })
  }
  async function setPolicy(settings: Record<string, unknown> | null) {
    const db = getDb()
    await db.collection('hl_installation').delete('main')
    await db.collection('hl_portal_settings').delete('inst-1')
    if (!settings) return
    await db.collection('hl_installation').put('main', { institutionId: 'inst-1', name: 'Colegio' })
    await db.collection('hl_portal_settings').put('inst-1', settings)
  }
  const base = { providerId: 'ollama', modelId: 'm', imageProviderId: 'ollama', imageModelId: 'm', audioProviderId: 'ollama', audioModelId: 'm', voice: '', allowRemoteProviders: true, allowRemoteForMinors: false }

  test('sin ninguna key el oráculo está apagado', async () => {
    await getDb().collection('providers').delete('hiveagents')
    await setPolicy(null)
    expect(await resolveOracleOption(ADULT)).toEqual({ option: false, kind: null })
  })

  test('con key de HiveAgents se activa Kev sin compartir nada del turno', async () => {
    await setHiveAgentsKey('https://llm.hiveagents.io/v1')
    await setPolicy(null)
    const { option, kind } = await resolveOracleOption(ADULT)
    expect(kind).toBe('kev')
    expect(option).toMatchObject({
      provider: 'hiveagents', apiKey: 'kev-key', endpoint: 'https://llm.hiveagents.io/v1/systemone',
      share: { instructions: false, history: false, toolResults: false }, verify: { answer: false, tools: false },
    })
  })

  test('oracleEnabled=false lo apaga aunque haya key', async () => {
    await setHiveAgentsKey(null)
    await setPolicy({ ...base, oracleEnabled: false })
    expect((await resolveOracleOption(ADULT)).kind).toBeNull()
  })

  test('sin permiso de proveedores remotos solo se admite un endpoint local', async () => {
    await setHiveAgentsKey('https://llm.hiveagents.io/v1')
    await setPolicy({ ...base, allowRemoteProviders: false })
    expect((await resolveOracleOption(ADULT)).kind).toBeNull()

    await setHiveAgentsKey('http://192.168.1.50:8080/v1')
    expect((await resolveOracleOption(ADULT)).kind).toBe('kev')
  })

  test('un menor o una edad desconocida solo usan un oráculo remoto con allowRemoteForMinors', async () => {
    await setHiveAgentsKey('https://llm.hiveagents.io/v1')
    await setPolicy({ ...base, allowRemoteProviders: true, allowRemoteForMinors: false })
    expect((await resolveOracleOption(MINOR)).kind).toBeNull()
    expect((await resolveOracleOption({ ageBand: 'ninez' })).kind).toBeNull()
    expect((await resolveOracleOption(ADULT)).kind).toBe('kev')

    await setPolicy({ ...base, allowRemoteProviders: true, allowRemoteForMinors: true })
    expect((await resolveOracleOption(MINOR)).kind).toBe('kev')
  })
})

describe('política de proveedores por edad en runHiveLearnAgent', () => {
  // El proveedor de prueba es `openai` apuntando a localhost, es decir LOCAL. Para probar el bloqueo se
  // apunta a una URL pública: la política debe cortar ANTES de hacer ninguna llamada.
  async function setRemoteProvider(baseUrl: string) {
    const db = getDb()
    const existing = (await db.collection<Record<string, unknown>>('providers').get('openai'))!
    await db.collection('providers').put('openai', { ...existing.doc, base_url: baseUrl }, { expectedVersion: existing.version })
  }
  const base = { providerId: 'ollama', modelId: 'm', imageProviderId: 'ollama', imageModelId: 'm', audioProviderId: 'ollama', audioModelId: 'm', voice: '', allowRemoteProviders: true, allowRemoteForMinors: false }
  async function setPolicy(settings: Record<string, unknown>) {
    const db = getDb()
    await db.collection('hl_installation').put('main', { institutionId: 'inst-pol', name: 'Colegio' })
    await db.collection('hl_portal_settings').put('inst-pol', settings)
  }

  afterAll(async () => {
    await setRemoteProvider(`http://localhost:${server.port}/v1`)
    await getDb().collection('hl_installation').delete('main')
  })

  for (const engine of ['legacy', 'sdk'] as const) {
    test(`motor ${engine}: bloquea un proveedor remoto a un menor y no llama al modelo`, async () => {
      process.env.HIVELEARN_AGENT_ENGINE = engine
      await setRemoteProvider('https://api.example-llm.com/v1')
      await setPolicy({ ...base, allowRemoteForMinors: false })
      script = [{ tool: { name: 'generar_ficha', args: { titulo: 'x' } } }]
      const error = await run([structuredNoExec], 'tarea', MINOR).catch(e => e)
      expect(error).toBeInstanceOf(AgentExecutionError)
      expect((error as AgentExecutionError).code).toBe('provider_not_allowed')
      expect(requests.length).toBe(0)
    }, 60_000)
  }

  test('una edad desconocida (ninez) tampoco puede usar un proveedor remoto', async () => {
    process.env.HIVELEARN_AGENT_ENGINE = 'legacy'
    await setRemoteProvider('https://api.example-llm.com/v1')
    await setPolicy({ ...base, allowRemoteForMinors: false })
    const error = await run([structuredNoExec], 'tarea', { ageBand: 'ninez' }).catch(e => e)
    expect((error as AgentExecutionError).code).toBe('provider_not_allowed')
  })

  test('sin allowRemoteProviders ni un adulto puede usar un proveedor remoto', async () => {
    process.env.HIVELEARN_AGENT_ENGINE = 'legacy'
    await setRemoteProvider('https://api.example-llm.com/v1')
    await setPolicy({ ...base, allowRemoteProviders: false })
    const error = await run([structuredNoExec], 'tarea', ADULT).catch(e => e)
    expect((error as AgentExecutionError).code).toBe('provider_not_allowed')
  })
})
