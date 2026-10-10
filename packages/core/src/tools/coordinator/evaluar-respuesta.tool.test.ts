import { describe, expect, test } from 'bun:test'
import { createEvaluarRespuestaTool, type EvaluatedAttempt } from './evaluar-respuesta.tool'

function build(onEvaluated?: (a: EvaluatedAttempt) => Promise<void> | void) {
  const sent: object[] = []
  let xp = 0
  const tool = createEvaluarRespuestaTool(m => sent.push(m), () => xp, n => { xp += n }, onEvaluated)
  return { tool, sent, xp: () => xp }
}

describe('evaluar_respuesta → memoria', () => {
  test('entrega cada intento con nodo, resultado y etiqueta de error', async () => {
    const seen: EvaluatedAttempt[] = []
    const { tool, sent, xp } = build(a => { seen.push(a) })
    const result = JSON.parse(await tool.execute!({ correcto: false, xpGanado: 0, mensaje: 'casi', nodoId: 'n1', errorTag: 'tipos' }) as string)
    expect(seen).toEqual([{ nodoId: 'n1', correcto: false, errorTag: 'tipos' }])
    expect(result).toMatchObject({ ok: true, correcto: false, xpTotal: 0 })
    expect(sent[0]).toMatchObject({ type: 'evaluation', correcto: false })
    expect(xp()).toBe(0)
  })

  test('un fallo de la memoria no rompe la evaluación ni el XP', async () => {
    const { tool, sent, xp } = build(() => { throw new Error('db caída') })
    const result = JSON.parse(await tool.execute!({ correcto: true, xpGanado: 10, mensaje: 'bien', nodoId: 'n1' }) as string)
    expect(result).toMatchObject({ ok: true, correcto: true, xpGanado: 10, xpTotal: 10 })
    expect(xp()).toBe(10)
    expect(sent.map(m => (m as { type: string }).type)).toEqual(['evaluation', 'xp_award'])
  })

  test('sin callback se comporta como antes', async () => {
    const { tool } = build()
    expect(JSON.parse(await tool.execute!({ correcto: true, xpGanado: 5, mensaje: 'ok' }) as string)).toMatchObject({ ok: true, xpTotal: 5 })
  })
})
