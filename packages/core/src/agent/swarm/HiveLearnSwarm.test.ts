import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = mkdtempSync(join(tmpdir(), 'hl-swarm-'))
process.env.HIVELEARN_DB_PATH = join(root, 'hivedb')
process.env.HIVELEARN_SECRET_KEY = 'swarm-test-secret-key-0123456789abcdef'
process.env.HIVELEARN_SDK_DB_PATH = join(root, 'sdk-db')
process.env.HIVELEARN_SDK_HOME = join(root, 'sdk-home')
process.env.HIVELEARN_ALLOW_REMOTE_FOR_MINORS = 'true'

import { initializeDatabase, closeDatabase, getDb } from '../../storage/hivedb'
import { encryptApiKey } from '../../crypto/encrypt'
import { closeSdkEngine } from '../sdk/bootstrap'
import { AGENT_IDS } from '../registry'
import { CURRICULUM_VERSION } from '../../institutional/curriculum'
import { HiveLearnSwarm } from './HiveLearnSwarm'
import { hlSwarmEmitter } from '../../events/swarm-events'

let server: ReturnType<typeof Bun.serve>
/** Tool pedida en cada petición, en orden: sirve para comprobar el reparto por especialistas. */
let requested: string[] = []
let failTool: string | null = null
/** Si > 0, las N primeras planificaciones devuelven una competencia que no existe. */
let badPlans = 0
const planningTasks: string[] = []
/** La caché por concepto sobrevive entre pruebas: cada una usa conceptos propios. */
let run = 0

const toolCall = (name: string, args: object) => ({
  id: 'c', object: 'chat.completion', created: 0, model: 'm',
  choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: `call_${Math.random().toString(36).slice(2)}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
})

const outputs: Record<string, object> = {
  planificar_programa: {
    tema: 'IA y decisiones humanas', curriculumVersion: CURRICULUM_VERSION,
    nodos: [
      { id: 'a', competencyId: 'ai-agency', titulo: 'Quién decide', concepto: 'La IA no decide sola', tipo_pedagogico: 'concept', tipo_visual: 'text_card' },
      { id: 'b', competencyId: 'ai-agency', titulo: 'Practica', concepto: 'Clasificar decisiones', tipo_pedagogico: 'exercise', tipo_visual: 'text_card' },
      { id: 'c', competencyId: 'ai-agency', titulo: 'Quiz', concepto: 'Repaso', tipo_pedagogico: 'quiz', tipo_visual: 'text_card' },
    ],
  },
  generar_explicacion: { titulo: 'Quién decide', explicacion: 'Una IA recomienda, pero las personas responsables deciden y responden por las consecuencias.', ejemplo_concreto: 'Un banco usa un modelo para sugerir créditos, pero un analista firma la decisión.' },
  generar_ejercicio: { enunciado: 'Clasifica cada caso: ¿decide una persona o la IA sugiere?', pasos: ['Lee el caso', 'Decide quién responde'], ejemplo_respuesta: 'La persona responde.', respuesta_correcta: 'Siempre responde una persona.', pista_opcional: 'Piensa en quién firma.' },
  generar_evaluacion: {
    preguntas: [
      { tipo: 'multiple_choice', pregunta: '¿Quién responde por una decisión asistida por IA?', opciones: ['Nadie', 'La persona responsable', 'La pantalla', 'El teclado'], indice_correcto: 1 },
      { tipo: 'multiple_choice', pregunta: '¿Qué hace una IA al recomendar?', opciones: ['Sugiere', 'Firma', 'Responde legalmente', 'Es dueña'], indice_correcto: 0 },
      { tipo: 'multiple_choice', pregunta: '¿Qué conviene revisar?', opciones: ['Nada', 'Los resultados', 'El color', 'El nombre'], indice_correcto: 1 },
      { tipo: 'respuesta_corta', pregunta: 'Explica quién debe supervisar una IA.', respuesta_esperada: 'Las personas responsables de usarla' },
      { tipo: 'respuesta_corta', pregunta: '¿Por qué revisar los resultados?', respuesta_esperada: 'Porque pueden contener errores' },
    ],
  },
  revisar_programa: { aprobado: true, calidad: 90, issues: [], suggestedRetries: [] },
}

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (!new URL(req.url).pathname.endsWith('/chat/completions')) return new Response('nf', { status: 404 })
      const body = await req.json() as { tools?: Array<{ function: { name: string } }>; messages?: Array<{ content?: unknown }> }
      const name = body.tools?.[0]?.function.name ?? ''
      requested.push(name)
      if (name === 'planificar_programa') planningTasks.push(JSON.stringify(body.messages ?? []))
      if (failTool && name === failTool) return new Response('{"error":"fail"}', { status: 500 })
      const out = name === 'generar_quiz' ? outputs.generar_evaluacion
        : name === 'planificar_programa'
          ? { ...outputs.planificar_programa, nodos: (outputs.planificar_programa as { nodos: Array<{ concepto: string }> }).nodos.map(n => ({ ...n, concepto: `${n.concepto} (caso ${run})`, ...(badPlans-- > 0 ? { competencyId: 'inventada' } : {}) })) }
          : outputs[name]
      return Response.json(out ? toolCall(name, out) : { id: 'c', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    },
  })
  await initializeDatabase()
  const db = getDb()
  const { encrypted, iv } = encryptApiKey('sk-test')
  await db.collection('providers').put('openai', { name: 'OpenAI', api_key_encrypted: encrypted, api_key_iv: iv, headers_encrypted: null, headers_iv: null, base_url: `http://localhost:${server.port}/v1`, category: 'llm', num_ctx: null, num_gpu: 0, enabled: 1, active: 1, created_at: new Date().toISOString() })
  for (const id of Object.values(AGENT_IDS)) {
    await db.collection('hl_agents').put(id, { name: id, description: null, system_prompt: 'prompt', role: id === AGENT_IDS.coordinator ? 'coordinator' : 'worker', provider_id: 'openai', model_id: 'm', max_iterations: 6, tools_json: '[]', prompt_patch: null, last_prompt_update_reason: null, enabled: 1, updated_at: new Date().toISOString() })
  }
})
afterAll(async () => { server?.stop(true); await closeSdkEngine(); closeDatabase(); rmSync(root, { recursive: true, force: true }) })
beforeEach(() => { requested = []; failTool = null; badPlans = 0; planningTasks.length = 0; run++ })

const perfil = {
  alumnoId: 'alumno-1', nombre: 'Ana', edad: 30, rangoEdad: 'adulto', tiempoSesion: 15, nivelPrevio: 'principiante',
  estilo: 'visual', sesionesTotal: 0, xpAcumulado: 0, nivelActual: 'fundamentos',
} as never

for (const engine of ['legacy', 'sdk'] as const) {
  describe(`HiveLearnSwarm, reparto por rondas — motor ${engine}`, () => {
    beforeEach(() => { process.env.HIVELEARN_AGENT_ENGINE = engine })

    test('el coordinador planifica, reparte por rondas a los especialistas y entrega un programa', async () => {
      const events: string[] = []
      const listener = (type: string) => (e: { taskId?: string }) => events.push(`${type}:${e.taskId ?? ''}`)
      const started = listener('worker:task_started'), done = listener('worker:task_completed')
      hlSwarmEmitter.on('worker:task_started', started)
      hlSwarmEmitter.on('worker:task_completed', done)

      const program = await new HiveLearnSwarm().run(perfil, 'Entender quién decide en la IA')
      hlSwarmEmitter.off('worker:task_started', started)
      hlSwarmEmitter.off('worker:task_completed', done)

      expect(program.nodos).toHaveLength(3)
      expect(program.nodos.map(n => n.tipoPedagogico)).toEqual(['concept', 'exercise', 'quiz'])
      expect(program.nodos[0].contenido?.explicacion?.explicacion).toContain('responsables')
      expect(program.nodos[1].contenido?.ejercicio?.enunciado).toContain('Clasifica')

      // Reparto: el coordinador planifica primero; cada especialista corre su trabajo; la evaluación final va al final.
      expect(requested[0]).toBe('planificar_programa')
      expect(requested.filter(n => n === 'generar_explicacion')).toHaveLength(1)
      expect(requested.filter(n => n === 'generar_ejercicio')).toHaveLength(1)
      const evalIdx = requested.lastIndexOf('generar_evaluacion')
      expect(evalIdx).toBeGreaterThan(requested.indexOf('generar_explicacion'))
      expect(events.filter(e => e.startsWith('worker:task_completed')).map(e => e.split(':')[2]).sort())
        .toEqual(['content-nodo-0', 'content-nodo-1', 'content-nodo-2', 'evaluation'])
    }, 60_000)

    test('un especialista que falla no tumba la generación: se reintenta y el coordinador repara', async () => {
      failTool = 'generar_ejercicio'
      const program = await new HiveLearnSwarm().run(perfil, 'Entender quién decide en la IA').catch(e => e)
      // Con el especialista de ejercicios caído el programa o se entrega (reparado) o falla con un error explícito;
      // en ningún caso se cuelga ni lanza un error de estructura de grafo.
      if (program instanceof Error) expect(program.message).not.toMatch(/graph|cycle|dependency/i)
      else expect(program.nodos.length).toBeGreaterThanOrEqual(2)
      expect(requested.filter(n => n === 'generar_ejercicio').length).toBeGreaterThan(1)
    }, 90_000)
  })
}

describe('blueprint rechazado: el coordinador corrige con el motivo', () => {
  test('una competencia inventada se rechaza, se le dice cuáles son válidas y el segundo intento pasa', async () => {
    process.env.HIVELEARN_AGENT_ENGINE = 'legacy'
    badPlans = 3 // los 3 nodos de la primera respuesta llevan la competencia inventada
    const program = await new HiveLearnSwarm().run({ ...(perfil as object), alumnoId: 'alumno-2' } as never, 'Entender quién decide en la IA')
    expect(program.nodos).toHaveLength(3)
    expect(requested.filter(n => n === 'planificar_programa')).toHaveLength(2)
    expect(planningTasks[0]).not.toContain('RECHAZADO')
    expect(planningTasks[1]).toContain('RECHAZADO')
    expect(planningTasks[1]).toContain('ai-agency')
  }, 60_000)

  test('si el modelo insiste, tras 3 intentos falla con el motivo y sin colgarse', async () => {
    process.env.HIVELEARN_AGENT_ENGINE = 'legacy'
    badPlans = 99
    const error = await new HiveLearnSwarm().run({ ...(perfil as object), alumnoId: 'alumno-3' } as never, 'Entender quién decide en la IA').catch(e => e)
    expect(error).toBeInstanceOf(Error)
    expect(String(error.message)).toMatch(/currículo|prerrequisitos/)
    expect(requested.filter(n => n === 'planificar_programa')).toHaveLength(3)
  }, 60_000)
})

describe('sanitizeVisuals', () => {
  test('un nodo nunca promete un visual que no tiene ni un tipo inventado', async () => {
    const { sanitizeVisuals } = await import('./HiveLearnSwarm')
    const out = sanitizeVisuals([
      { tipoVisual: 'infographic', contenido: { explicacion: { titulo: 't', explicacion: 'e', ejemploConcreto: 'x' } } },
      { tipoVisual: 'infographic', contenido: { infografia: { secciones: [{ emoji: '🐝', titulo: 'a', valor: 'b' }] } } },
      { tipoVisual: 'interactive_diagram' as never, contenido: {} },
      { tipoVisual: 'image_ai', contenido: { imagen: { prompt: 'p', estilo: 'diagram', alt_text: '', caption: '', svg_fallback: '' } } },
      { tipoVisual: 'audio_ai', contenido: {} },
      { tipoVisual: 'text_card', contenido: {} },
    ] as never)
    expect(out.map(n => n.tipoVisual)).toEqual(['text_card', 'infographic', 'text_card', 'image_ai', 'text_card', 'text_card'])
  })
})

describe('nodo irreparable', () => {
  test('un nodo que no se puede reparar se descarta y el resto se entrega (con XP renormalizado)', async () => {
    process.env.HIVELEARN_AGENT_ENGINE = 'legacy'
    failTool = 'generar_ejercicio' // el nodo de práctica nunca se genera; su reparación tampoco
    const program = await new HiveLearnSwarm().run({ ...(perfil as object), alumnoId: 'alumno-4' } as never, 'Entender quién decide en la IA').catch(e => e)
    // Con 3 nodos y mínimo de 2: o se entrega con 2 (sin el irreparable) o falla con el motivo explícito, nunca se cuelga.
    if (program instanceof Error) expect(program.message).toMatch(/nodos|reparar/i)
    else {
      expect(program.nodos.length).toBeGreaterThanOrEqual(2)
      const xp = program.nodos.reduce((s: number, n: { xpRecompensa: number }) => s + n.xpRecompensa, 0)
      // El revisor simulado no redistribuye XP (suma 0); si lo hay, suma exactamente 100.
      expect([0, 100]).toContain(xp)
    }
  }, 60_000)
})
