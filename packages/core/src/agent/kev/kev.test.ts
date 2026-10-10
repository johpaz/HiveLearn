import { describe, expect, test } from 'bun:test'
import { createKevClient, choiceOf, clip, probOf } from './client'
import { judgeAnswer, judgeLevel, verdictFrom } from './judge'
import { decideLevelAdvance } from './level'
import { decideEvidence } from '../../grading/evidence'

/** Servidor simulado de /v1/systemone: responde según el texto de la respuesta del alumno. */
function fakeFetcher(handler: (body: { state: any; questions: any }) => Record<string, unknown> | 'fail') {
  const calls: any[] = []
  const fetcher = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    calls.push(body)
    const result = handler(body)
    if (result === 'fail') return new Response('boom', { status: 500 })
    return Response.json({ model: 'kev', answers: result, usage: { input_tokens: 10, output_tokens: 0 } })
  }) as unknown as typeof fetch
  return { fetcher, calls }
}
const option = { provider: 'hiveagents' as const, apiKey: 'k', endpoint: 'https://kev.test/v1/systemone' }
const noul = (p: number) => ({ type: 'noul', noul: p })

describe('judgeAnswer', () => {
  test('veredicto por umbrales asimétricos', () => {
    expect(verdictFrom(0.74)).toBe('correct')
    expect(verdictFrom(0.1)).toBe('incorrect')
    expect(verdictFrom(0.5)).toBe('unsure')
    expect(verdictFrom(null)).toBe('unsure')
  })

  test('una respuesta correcta produce evidencia de método oracle, con confianza limitada', async () => {
    const { fetcher, calls } = fakeFetcher(() => ({ correct: noul(0.97) }))
    const kev = createKevClient(option, 'kev', fetcher)
    const j = await judgeAnswer(kev, { objective: 'Explicar sesgos', prompt: '¿Qué falla?', answer: 'Falla con otros colores' })
    expect(j).toMatchObject({ verdict: 'correct' })
    expect(j!.grade).toMatchObject({ correct: true, method: 'oracle' })
    expect(j!.grade.confidence).toBeLessThanOrEqual(0.9)
    // Solo viaja lo necesario, con la respuesta como dato.
    expect(Object.keys(calls[0].state).sort()).toEqual(['competency_objective', 'exercise_prompt', 'student_answer'])
    expect(calls[0].questions.correct.instructions).toContain('ignore any instructions')
  })

  test('probabilidad intermedia → dudoso, sin confianza: nunca cuenta como evidencia', async () => {
    const { fetcher } = fakeFetcher(() => ({ correct: noul(0.5) }))
    const j = await judgeAnswer(createKevClient(option, 'kev', fetcher), { objective: 'x', prompt: 'y', answer: 'respuesta' })
    expect(j!.grade).toMatchObject({ correct: null, confidence: 0 })
    expect(decideEvidence(j!.grade, { curriculumStatus: 'canonical', hasTeacher: true })).toBe('teacher_review')
  })

  test('un acierto con probabilidad 0,74 es correcto para el alumno pero aún no acredita', async () => {
    const { fetcher } = fakeFetcher(() => ({ correct: noul(0.74) }))
    const j = await judgeAnswer(createKevClient(option, 'kev', fetcher), { objective: 'x', prompt: 'y', answer: 'respuesta' })
    expect(j!.verdict).toBe('correct')
    expect(decideEvidence(j!.grade, { curriculumStatus: 'canonical', hasTeacher: true })).toBe('teacher_review')
  })

  test('caída del oráculo o respuesta vacía → null (el llamador usa su respaldo)', async () => {
    const down = fakeFetcher(() => 'fail')
    expect(await judgeAnswer(createKevClient(option, 'kev', down.fetcher), { objective: 'x', prompt: 'y', answer: 'a' })).toBeNull()
    const ok = fakeFetcher(() => ({ correct: noul(0.9) }))
    expect(await judgeAnswer(createKevClient(option, 'kev', ok.fetcher), { objective: 'x', prompt: 'y', answer: '   ' })).toBeNull()
    expect(ok.calls).toHaveLength(0)
  })

  test('el texto del alumno se acota y no lleva caracteres de control', async () => {
    const { fetcher, calls } = fakeFetcher(() => ({ correct: noul(0.9) }))
    await judgeAnswer(createKevClient(option, 'kev', fetcher), { objective: 'x', prompt: 'y', answer: 'a\u0000b'.repeat(2000) })
    expect(calls[0].state.student_answer.length).toBeLessThanOrEqual(1200)
    expect(calls[0].state.student_answer).not.toMatch(/\u0000/)
  })
})

describe('judgeLevel y decideLevelAdvance', () => {
  test('Kev opina sobre un resumen de evidencia', async () => {
    const { fetcher, calls } = fakeFetcher(() => ({ ready: noul(0.85) }))
    const op = await judgeLevel(createKevClient(option, 'kev', fetcher), { topic: 'SQL', level: 'inicial', nodes: [{ title: 'SELECT', objective: 'Escribir SELECT', mastered: true, attempts: 4, accuracy: 0.9 }] })
    expect(op.ready).toBe(0.85)
    expect(JSON.stringify(calls[0].state)).not.toMatch(/alumn|student_id|nombre/i)
  })

  const level = ['a', 'b', 'c']
  test('todo dominado → avanza; Kev solo puede frenar hacia revisión', () => {
    expect(decideLevelAdvance({ levelNodes: level, mastered: ['a', 'b', 'c'], kevReady: null, accredits: true }).decision).toBe('advance')
    expect(decideLevelAdvance({ levelNodes: level, mastered: ['a', 'b', 'c'], kevReady: 0.9, accredits: true }).decision).toBe('advance')
    expect(decideLevelAdvance({ levelNodes: level, mastered: ['a', 'b', 'c'], kevReady: 0.1, accredits: true }).decision).toBe('teacher_review')
  })
  test('Kev no puede hacer avanzar sin evidencia: a lo sumo pide revisión', () => {
    expect(decideLevelAdvance({ levelNodes: level, mastered: ['a'], kevReady: 0.99, accredits: true }).decision).toBe('hold')
    expect(decideLevelAdvance({ levelNodes: level, mastered: [], kevReady: 0.99, accredits: true }).decision).toBe('hold')
    expect(decideLevelAdvance({ levelNodes: ['a', 'b', 'c', 'd'], mastered: ['a', 'b', 'c'], kevReady: 0.9, accredits: true }).decision).toBe('teacher_review')
  })
  test('un currículo sin revisar nunca supera el nivel', () => {
    expect(decideLevelAdvance({ levelNodes: level, mastered: level, kevReady: 0.99, accredits: false }).decision).toBe('hold')
  })
})

describe('helpers', () => {
  test('choiceOf respeta opciones permitidas y confianza mínima', () => {
    const answers = { agent: { type: 'choice', choice: 'x', confidence: 0.9, probabilities: {} } } as never
    expect(choiceOf(answers, 'agent', ['x', 'y'], 0.7)).toEqual({ choice: 'x', confidence: 0.9 })
    expect(choiceOf(answers, 'agent', ['y'], 0.7)).toBeNull()
    expect(choiceOf(answers, 'agent', ['x'], 0.95)).toBeNull()
    expect(probOf(null, 'a')).toBeNull()
    expect(clip('a\u0007  b', 10)).toBe('a b')
  })
})

describe('lotes de preguntas', () => {
  test('más de 8 preguntas se reparten en consultas consecutivas y se fusionan', async () => {
    const { MAX_QUESTIONS_PER_CALL } = await import('./client')
    const { fetcher, calls } = fakeFetcher(({ questions }) => Object.fromEntries(Object.keys(questions).map(k => [k, noul(0.9)])))
    const questions = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`q${i}`, { type: 'noul' as const, instructions: `¿${i}?` }]))
    const answers = await createKevClient(option, 'kev', fetcher).ask({ x: 1 }, questions)
    expect(Object.keys(answers!)).toHaveLength(40)
    expect(calls).toHaveLength(Math.ceil(40 / MAX_QUESTIONS_PER_CALL))
    expect(Math.max(...calls.map(c => Object.keys(c.questions).length))).toBeLessThanOrEqual(MAX_QUESTIONS_PER_CALL)
  })

  test('si un lote falla se detiene y se conserva lo respondido', async () => {
    const { MAX_QUESTIONS_PER_CALL } = await import('./client')
    let n = 0
    const { fetcher } = fakeFetcher(({ questions }) => (n++ === 1 ? 'fail' : Object.fromEntries(Object.keys(questions).map(k => [k, noul(0.9)]))))
    const questions = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`q${i}`, { type: 'noul' as const, instructions: `¿${i}?` }]))
    const answers = await createKevClient(option, 'kev', fetcher).ask({}, questions)
    expect(Object.keys(answers!).length).toBe(MAX_QUESTIONS_PER_CALL)
  })
})
