import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'hl-delivery-'))
process.env.HIVELEARN_DB_PATH = join(root, 'hivedb')
process.env.HIVELEARN_SECRET_KEY = 'delivery-test-secret-key-0123456789abcdef'
process.env.HIVELEARN_SDK_DB_PATH = join(root, 'sdk-db')
process.env.HIVELEARN_SDK_HOME = join(root, 'sdk-home')
process.env.HIVELEARN_ALLOW_REMOTE_FOR_MINORS = 'true'

import { initializeDatabase, closeDatabase, getDb } from '../storage/hivedb'
import { encryptApiKey } from '../crypto/encrypt'
import { closeSdkEngine } from '../agent/sdk/bootstrap'
import { AGENT_IDS } from '../agent/registry'
import { LessonDeliverySession } from './LessonDeliverySession'

type Step = { name: string; args: object } | string
let server: ReturnType<typeof Bun.serve>
let script: Step[] = []

const reply = (step: Step) => ({
  id: 'c', object: 'chat.completion', created: 0, model: 'm',
  choices: [typeof step === 'string'
    ? { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: step } }
    : { index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: `call_${Math.random().toString(36).slice(2)}`, type: 'function', function: { name: step.name, arguments: JSON.stringify(step.args) } }] } }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
})

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (!new URL(req.url).pathname.endsWith('/chat/completions')) return new Response('nf', { status: 404 })
      await req.json()
      return Response.json(reply(script.shift() ?? 'fin'))
    },
  })
  await initializeDatabase()
  const db = getDb()
  const { encrypted, iv } = encryptApiKey('sk-test')
  await db.collection('providers').put('openai', { name: 'OpenAI', api_key_encrypted: encrypted, api_key_iv: iv, headers_encrypted: null, headers_iv: null, base_url: `http://localhost:${server.port}/v1`, category: 'llm', num_ctx: null, num_gpu: 0, enabled: 1, active: 1, created_at: new Date().toISOString() })
  await db.collection('hl_agents').put(AGENT_IDS.coordinator, { name: 'Coord', description: null, system_prompt: 'Coordina', role: 'coordinator', provider_id: 'openai', model_id: 'm', max_iterations: 6, tools_json: '[]', prompt_patch: null, last_prompt_update_reason: null, enabled: 1, updated_at: new Date().toISOString() })
})
afterAll(async () => { server?.stop(true); await closeSdkEngine(); closeDatabase(); rmSync(root, { recursive: true, force: true }) })
beforeEach(() => { script = [] })

function sessionWithFakeStore(sent: object[]) {
  const session = new LessonDeliverySession('s1', msg => sent.push(msg))
  ;(session as unknown as { persistence: object }).persistence = {
    getSessionWithCurriculum: async () => ({
      alumnoId: 'al1', curriculoId: 'c1', metaAlumno: 'aprender', topicSlug: 'sql',
      nodosJson: JSON.stringify([{ id: 'n1', titulo: 'T', tipoPedagogico: 'concept', tipoVisual: 'text_card', concepto: 'c', xpRecompensa: 100, contenido: {} }]),
    }),
    getStudentProfile: async () => ({ nombre: 'Ana', edad: 30 }),
    getInteractions: async () => [],
    getNextTurnIndex: async () => 0,
    saveInteraction: async () => {},
  }
  return session
}

for (const engine of ['legacy', 'sdk'] as const) {
  describe(`entrega de lección — motor ${engine}`, () => {
    beforeEach(() => { process.env.HIVELEARN_AGENT_ENGINE = engine })

    test('texto del modelo tras completar_leccion no llega al alumno como error', async () => {
      script = [
        { name: 'completar_leccion', args: { xpTotal: 100, nodosCompletados: 1, totalNodos: 1, mensaje: '¡Bien!' } },
        'Listo, ¡felicidades por terminar la lección!',
      ]
      const sent: object[] = []
      await sessionWithFakeStore(sent).start()
      const types = sent.map(m => (m as { type: string }).type)
      expect(types).toContain('lesson_complete')
      expect(types).not.toContain('error')
    }, 60_000)

    test('sin completar, un texto inesperado sí se reporta como error', async () => {
      script = ['Hola, ¿empezamos?']
      const sent: object[] = []
      await sessionWithFakeStore(sent).start()
      expect(sent.map(m => (m as { type: string }).type)).toContain('error')
    }, 60_000)
  })
}
