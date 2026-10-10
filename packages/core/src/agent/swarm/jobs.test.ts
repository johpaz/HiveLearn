import { describe, expect, test } from 'bun:test'
import { mergeRounds, resultsOf, runRound, type Job, type JobExecutor } from './jobs'
import { buildWorkPlan } from './work-plan'
import { AGENT_IDS } from '../registry'

const job = (id: string, extra: Partial<Job> = {}): Job => ({ id, agentId: 'a', name: id, taskDescription: id, ...extra })
const base = { sessionId: 's', coordinatorId: 'c' }

describe('runRound', () => {
  test('respeta el tope de concurrencia y recoge todos los resultados', async () => {
    let active = 0, peak = 0
    const executor: JobExecutor = { execute: async j => { active++; peak = Math.max(peak, active); await Bun.sleep(15); active--; return `r-${j.id}` } }
    const r = await runRound(['a', 'b', 'c', 'd', 'e'].map(id => job(id)), { ...base, executor, concurrency: 2 })
    expect(peak).toBe(2)
    expect(r.success).toBe(true)
    expect(r.completed.map(j => j.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(resultsOf(r)).toMatchObject({ a: 'r-a', e: 'r-e' })
  })

  test('mayor prioridad primero', async () => {
    const order: string[] = []
    const executor: JobExecutor = { execute: async j => { order.push(j.id); return '' } }
    await runRound([job('bajo', { priority: 1 }), job('alto', { priority: 9 }), job('medio', { priority: 5 })], { ...base, executor, concurrency: 1 })
    expect(order).toEqual(['alto', 'medio', 'bajo'])
  })

  test('un fallo se reintenta y no detiene a los demás', async () => {
    const tries: Record<string, number> = {}
    const executor: JobExecutor = {
      execute: async j => {
        tries[j.id] = (tries[j.id] ?? 0) + 1
        if (j.id === 'malo') throw new Error('boom')
        if (j.id === 'flaky' && tries[j.id] < 2) throw new Error('una vez')
        return 'ok'
      },
    }
    const r = await runRound([job('malo', { maxRetries: 1 }), job('flaky', { maxRetries: 1 }), job('bien')], { ...base, executor })
    expect(r.success).toBe(false)
    expect(r.failed.map(j => j.id)).toEqual(['malo'])
    expect(r.failed[0]).toMatchObject({ error: 'boom', retries: 1 })
    expect(r.completed.map(j => j.id).sort()).toEqual(['bien', 'flaky'])
    expect(tries.malo).toBe(2)
  })

  test('el tiempo agotado cuenta como fallo y no bloquea la ronda', async () => {
    const executor: JobExecutor = { execute: async j => (j.id === 'lento' ? new Promise<string>(() => {}) : 'ok') }
    const r = await runRound([job('lento', { maxRetries: 0 }), job('rapido')], { ...base, executor, timeoutMs: 40 })
    expect(r.failed[0].error).toContain('tiempo agotado')
    expect(r.completed.map(j => j.id)).toEqual(['rapido'])
  })

  test('la ronda siguiente recibe los resultados de la anterior', async () => {
    const seen: Record<string, string>[] = []
    const executor: JobExecutor = { execute: async (j, prior) => { seen.push(prior); return `r-${j.id}` } }
    const first = await runRound([job('a'), job('b')], { ...base, executor })
    const second = await runRound([job('final')], { ...base, executor, priorResults: resultsOf(first) })
    expect(seen.at(-1)).toEqual({ a: 'r-a', b: 'r-b' })
    expect(mergeRounds([first, second]).completed).toHaveLength(3)
  })
})

describe('buildWorkPlan', () => {
  const nodo = (id: string, tipoPedagogico: string, tipoVisual: string) => ({
    id, titulo: id, concepto: id, tipoPedagogico, tipoVisual, nivel: 'principiante', rangoEdad: 'adulto', estado: 'disponible', xpRecompensa: 10,
  }) as never
  test('un trabajo pedagógico por nodo, uno visual cuando se pide, y la evaluación en la ronda final', () => {
    const plan = buildWorkPlan(
      { alumnoId: 'a', meta: 'SQL', sessionId: 's', perfil: { rangoEdad: 'adulto', nivelPrevio: 'principiante', tono: 'amable', duracionSesion: 20, estilo: 'x' } as never },
      [nodo('n1', 'concept', 'text_card'), nodo('n2', 'exercise', 'infographic'), nodo('n3', 'quiz', 'audio_ai')],
    )
    expect(plan.nodeJobs.map(j => j.id)).toEqual(['content-n1', 'content-n2', 'visual-n2', 'content-n3', 'visual-n3'])
    expect(plan.nodeJobs.find(j => j.id === 'content-n3')!.agentId).toBe(AGENT_IDS.evaluation)
    expect(plan.nodeJobs.find(j => j.id === 'visual-n3')!.agentId).toBe(AGENT_IDS.audio)
    expect(plan.finalJobs.map(j => j.id)).toEqual(['evaluation'])
    // Ningún trabajo declara dependencias: el orden lo da la ronda.
    expect(JSON.stringify(plan)).not.toContain('deps')
  })
})
