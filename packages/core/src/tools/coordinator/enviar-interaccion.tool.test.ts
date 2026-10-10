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
