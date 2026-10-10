import { beforeEach, describe, expect, mock, test } from 'bun:test'

const nodos = [
  { id: 'q1', titulo: 'Filas', tipoPedagogico: 'quiz', tipoVisual: 'text_card', concepto: 'filas', xpRecompensa: 50,
    contenido: { quiz: { pregunta: '¿Qué guarda una fila?', opciones: ['Un registro', 'Un índice', 'Una vista'], indicesCorrecto: 0, explicacionesIncorrectas: [] } } },
  { id: 'e1', titulo: 'Libre', tipoPedagogico: 'exercise', tipoVisual: 'text_card', concepto: 'libre', xpRecompensa: 50,
    contenido: { ejercicio: { enunciado: 'Explica una tabla', pasos: [], ejemploRespuesta: '', respuestaCorrecta: 'Una colección de filas' } } },
]
mock.module('../../storage/LessonPersistence', () => ({
  LessonPersistence: class { async getSessionWithCurriculum() { return { nodosJson: JSON.stringify(nodos) } } },
}))

const { createEnviarInteraccionTool, resolveStudentAction } = await import('./enviar-interaccion.tool')

const a2ui = [{ surfaceUpdate: { components: [{}] } }, { beginRendering: { root: 'r' } }]
const flush = () => new Promise(r => setTimeout(r, 5))

async function run(nodoId: string, answers: string[], finish = true) {
  const sent: any[] = [], graded: any[] = []
  const tool = createEnviarInteraccionTool('sess', msg => sent.push(msg), {
    addXp: () => {}, getXpTotal: () => 0,
    onGraded: e => { graded.push(e) },
  })
  const pending = tool.execute!({ a2uiMessages: a2ui, nodoId } as never)
  for (const respuesta of answers) {
    await flush()
    resolveStudentAction('sess', { name: 'check_answer', context: { respuesta }, timestamp: Date.now() })
  }
  if (finish) {
    // Tras acertar, la herramienta avanza al siguiente nodo y espera otra acción; se cierra con una acción ajena.
    await flush()
    resolveStudentAction('sess', { name: 'done', context: {}, timestamp: Date.now() })
  }
  const result = await pending
  return { sent, graded, result: JSON.parse(String(result)) }
}

describe('enviar_interaccion — corrección determinista', () => {
  beforeEach(() => {})

  test('una opción incorrecta se corrige en código y se reintenta; la correcta avanza', async () => {
    const { sent, graded } = await run('q1', ['Un índice', 'Un registro'])
    expect(graded.map(g => g.grade.correct)).toEqual([false, true])
    expect(graded[0].grade).toMatchObject({ method: 'deterministic', confidence: 1 })
    expect(sent.filter(m => m.type === 'evaluation').map(m => m.correcto)).toEqual([false, true])
  })

  test('contener el texto correcto no basta (antes pasaba por coincidencia difusa)', async () => {
    const { graded } = await run('q1', ['Un registro y también un índice', 'Un registro'])
    expect(graded[0].grade.correct).toBe(false)
  })

  test('un ejercicio sin clave no se corrige aquí: lo evalúa el tutor', async () => {
    const { graded, sent } = await run('e1', ['una colección de filas'], false)
    expect(graded).toHaveLength(0)
    expect(sent.some(m => m.type === 'evaluation')).toBe(false)
  })
})

describe('enviar_interaccion — nodo ya completado', () => {
  test('reenviar un nodo resuelto no vuelve a mostrarlo ni a esperar al alumno', async () => {
    const sent: any[] = []
    const tool = createEnviarInteraccionTool('sess2', msg => sent.push(msg), { isCompleted: id => id === 'q1' })
    const result = JSON.parse(String(await tool.execute!({ a2uiMessages: a2ui, nodoId: 'q1' } as never)))
    expect(result.accion).toBe('ya_completado')
    expect(sent).toHaveLength(0)
  })
})

describe('enviar_interaccion — respuestas abiertas juzgadas por el oráculo', () => {
  const grade = (correct: boolean | null, confidence: number) => ({ correct, score: correct ? 0.9 : 0.1, confidence, method: 'oracle' as const, detail: '' })

  async function runOpen(judge: (a: string) => any, answers: string[], finish = true) {
    const sent: any[] = [], graded: any[] = [], judged: string[] = []
    const tool = createEnviarInteraccionTool('open', m => sent.push(m), {
      addXp: () => {}, getXpTotal: () => 0,
      onGraded: e => { graded.push(e) },
      judgeOpen: async ({ answer }) => { judged.push(answer); return judge(answer) },
    })
    const pending = tool.execute!({ a2uiMessages: a2ui, nodoId: 'e1' } as never)
    for (const respuesta of answers) {
      await flush()
      resolveStudentAction('open', { name: 'check_answer', context: { respuesta }, timestamp: Date.now() })
    }
    if (finish) { await flush(); resolveStudentAction('open', { name: 'done', context: {}, timestamp: Date.now() }) }
    return { sent, graded, judged, result: JSON.parse(String(await pending)) }
  }

  test('veredicto decisivo: el sistema corrige, da XP y registra evidencia de método oracle', async () => {
    const { sent, graded, judged } = await runOpen(() => ({ verdict: 'correct', probability: 0.95, grade: grade(true, 0.9) }), ['una colección de filas'])
    expect(judged).toEqual(['una colección de filas'])
    expect(graded[0].grade.method).toBe('oracle')
    expect(sent.filter(m => m.type === 'evaluation')[0]).toMatchObject({ correcto: true, xpGanado: 50 })
  })

  test('veredicto incorrecto reintenta sin XP', async () => {
    const { sent, graded } = await runOpen(a => (a.startsWith('mal')
      ? { verdict: 'incorrect', probability: 0.05, grade: grade(false, 0.9) }
      : { verdict: 'correct', probability: 0.95, grade: grade(true, 0.9) }), ['mal respondido', 'bien respondido'])
    expect(graded.map(g => g.grade.correct)).toEqual([false, true])
    expect(sent.filter(m => m.type === 'evaluation').map(m => m.xpGanado)).toEqual([0, 50])
  })

  test('dudoso: no corrige por el alumno; avisa al tutor y no registra evidencia', async () => {
    const { sent, graded, result } = await runOpen(() => ({ verdict: 'unsure', probability: 0.5, grade: grade(null, 0) }), ['algo ambiguo'], false)
    expect(graded).toHaveLength(0)
    expect(sent.some(m => m.type === 'evaluation')).toBe(false)
    expect(result.veredictoOraculo).toMatchObject({ veredicto: 'dudoso', probabilidad: 0.5 })
  })

  test('con clave de respuesta el oráculo no se consulta', async () => {
    const judged: string[] = []
    const tool = createEnviarInteraccionTool('keyed', () => {}, { judgeOpen: async ({ answer }) => { judged.push(answer); return null } })
    const pending = tool.execute!({ a2uiMessages: a2ui, nodoId: 'q1' } as never)
    await flush(); resolveStudentAction('keyed', { name: 'check_answer', context: { respuesta: 'Un registro' }, timestamp: Date.now() })
    await flush(); resolveStudentAction('keyed', { name: 'done', context: {}, timestamp: Date.now() })
    await pending
    expect(judged).toHaveLength(0)
  })

  test('si el oráculo cae (null), el tutor evalúa como antes', async () => {
    const { graded, sent } = await runOpen(() => null, ['respuesta'], false)
    expect(graded).toHaveLength(0)
    expect(sent.some(m => m.type === 'evaluation')).toBe(false)
  })
})

describe('enviar_interaccion — ayuda tras fallos', () => {
  async function wrong(onIncorrect: (i: any) => any, answers: string[]) {
    const sent: any[] = []
    const tool = createEnviarInteraccionTool('help', m => sent.push(m), { addXp: () => {}, getXpTotal: () => 0, onIncorrect: async i => onIncorrect(i) })
    const pending = tool.execute!({ a2uiMessages: a2ui, nodoId: 'q1' } as never)
    for (const respuesta of answers) { await flush(); resolveStudentAction('help', { name: 'check_answer', context: { respuesta }, timestamp: Date.now() }) }
    await flush(); resolveStudentAction('help', { name: 'done', context: {}, timestamp: Date.now() })
    return { sent, result: JSON.parse(String(await pending)) }
  }

  test('la ayuda reemplaza el mensaje y la pista y cuenta los fallos del nodo', async () => {
    const seen: number[] = []
    const { sent } = await wrong(i => { seen.push(i.attempts); return { pista: `ayuda ${i.attempts}` } }, ['Un índice', 'Una vista', 'Un registro'])
    expect(seen).toEqual([1, 2])
    expect(sent.filter(m => m.type === 'evaluation').map(m => m.pista)).toEqual(['ayuda 1', 'ayuda 2', undefined])
  })

  test('advance sigue al siguiente nodo sin crédito ni XP', async () => {
    const { sent } = await wrong(() => ({ mensaje: 'Sigamos', advance: true }), ['Un índice'])
    const evaluations = sent.filter(m => m.type === 'evaluation')
    expect(evaluations).toHaveLength(1)
    expect(evaluations[0]).toMatchObject({ correcto: false, xpGanado: 0, mensaje: 'Sigamos' })
    // Pasó al nodo siguiente (e1) sin esperar otra respuesta del mismo.
    expect(sent.filter(m => m.type === 'a2ui').map(m => m.nodoId)).toEqual(['q1', 'e1'])
  })

  test('si la ayuda falla, el flujo sigue como antes', async () => {
    const { sent } = await wrong(() => { throw new Error('boom') }, ['Un índice', 'Un registro'])
    expect(sent.filter(m => m.type === 'evaluation').map(m => m.correcto)).toEqual([false, true])
  })
})
