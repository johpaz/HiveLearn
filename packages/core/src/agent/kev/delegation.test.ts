import { describe, expect, test } from 'bun:test'
import { createKevClient } from './client'
import { contentAgentFor, defaultPlan, lengthHint, planDelegation, planSpecialist } from './delegation'
import { defaultSkills, eligibleSkills, finalizeSkills, renderSkills } from '../skills/catalog'
import { AGENT_IDS } from '../registry'

const option = { provider: 'hiveagents' as const, apiKey: 'k', endpoint: 'https://kev.test/v1/systemone' }
function kevWith(answers: (body: { state: any; questions: Record<string, any> }) => Record<string, unknown> | 'fail') {
  const calls: any[] = []
  const fetcher = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    calls.push(body)
    const given = answers(body)
    // El servidor real responde SIEMPRE todas las preguntas (askJev rechaza respuestas incompletas): lo no
    // especificado se completa con una respuesta neutra y poco confiada.
    const a = given === 'fail' ? given : { ...Object.fromEntries(Object.entries(body.questions).map(([name, q]: [string, any]) => [name,
      q.type === 'noul' ? { type: 'noul', noul: 0.1 }
        : { type: 'choice', choice: Object.keys(q.criteria)[0], confidence: 0.34, probabilities: { [Object.keys(q.criteria)[0]]: 0.34 } }])), ...given }
    return a === 'fail' ? new Response('x', { status: 500 }) : Response.json({ answers: a, usage: { input_tokens: 1, output_tokens: 0 } })
  }) as unknown as typeof fetch
  return { kev: createKevClient(option, 'kev', fetcher), calls }
}
const noul = (noul: number) => ({ type: 'noul', noul })
const choice = (c: string, confidence: number) => ({ type: 'choice', choice: c, confidence, probabilities: { [c]: confidence } })

const nodes = [
  { id: 'n1', titulo: 'Qué es una tabla', concepto: 'tabla', tipoPedagogico: 'concept', tipoVisual: 'text_card' },
  { id: 'n2', titulo: 'Practica SELECT', concepto: 'select', tipoPedagogico: 'exercise', tipoVisual: 'text_card' },
]

describe('catálogo de skills', () => {
  test('elegibilidad por agente y banda; obligatoria con dossier', () => {
    const minors = eligibleSkills(AGENT_IDS.explanation, 'ninez', { hasDossier: false })
    expect(minors.optional.map(s => s.id)).toContain('lenguaje-simple')
    expect(minors.optional.map(s => s.id)).not.toContain('rigor-tecnico')
    const adult = eligibleSkills(AGENT_IDS.explanation, 'adulto', { hasDossier: true })
    expect(adult.optional.map(s => s.id)).toContain('rigor-tecnico')
    expect(adult.optional.map(s => s.id)).not.toContain('lenguaje-simple')
    expect(adult.mandatory.map(s => s.id)).toEqual(['verificar-con-fuente'])
  })
  test('finalizeSkills descarta lo no elegible, limita a 3 y conserva obligatorias', () => {
    const out = finalizeSkills(AGENT_IDS.explanation, 'adulto', { hasDossier: true },
      ['rigor-tecnico', 'lenguaje-simple', 'inexistente', 'analogias', 'contraejemplo', 'ejemplos-cotidianos', 'error-comun'])
    expect(out[0]).toBe('verificar-con-fuente')
    expect(out).not.toContain('lenguaje-simple')
    expect(out.length).toBe(4) // 1 obligatoria + 3 opcionales
  })
  test('base determinista por banda y bloque estable', () => {
    expect(defaultSkills(AGENT_IDS.explanation, 'ninez', { hasDossier: false })).toEqual(['lenguaje-simple'])
    expect(renderSkills(['lenguaje-simple', 'nada'])).toContain('Lenguaje simple')
    expect(renderSkills([])).toBe('')
  })
})

describe('planDelegation (coordinador)', () => {
  test('sin oráculo: plan determinista que respeta el blueprint', async () => {
    const plan = await planDelegation(null, { objective: 'SQL', band: 'ninez', nodes, hasDossier: false })
    expect(plan.oracle).toBe(false)
    expect(plan.nodes.get('n1')).toMatchObject({ agentId: AGENT_IDS.explanation, tipoVisual: 'text_card', skills: ['lenguaje-simple'], source: 'default' })
    expect(plan.nodes.get('n2')!.agentId).toBe(AGENT_IDS.exercise)
  })

  test('Kev elige visual y skills por nodo (una consulta por nodo, con solo ese nodo en el estado)', async () => {
    const { kev, calls } = kevWith(({ state }) => (state.step.i === 0
      ? { visual: choice('infographic', 0.9), skill_analogias: noul(0.9), skill_contraejemplo: noul(0.2) }
      : { visual: choice('text_card', 0.9) }))
    const plan = await planDelegation(kev, { objective: 'SQL', band: 'adulto', nodes, hasDossier: false })
    expect(calls).toHaveLength(2)
    expect(plan.oracle).toBe(true)
    expect(plan.nodes.get('n1')).toMatchObject({ tipoVisual: 'infographic', source: 'oracle' })
    expect(plan.nodes.get('n1')!.skills).toEqual(['analogias'])
    expect(plan.nodes.get('n2')).toMatchObject({ tipoVisual: 'text_card' })
    // El estado de cada consulta lleva solo su nodo y ninguna identidad.
    expect(Object.keys(calls[0].state).sort()).toEqual(['age_band', 'objective', 'step'])
    expect(JSON.stringify(calls[0].state)).toContain('Qué es una tabla')
    expect(JSON.stringify(calls[0].state)).not.toContain('Practica un SELECT')
  })

  test('confianza baja u opciones inventadas → se conserva el blueprint', async () => {
    const { kev } = kevWith(({ state }) => ({ visual: state.step.i === 0 ? choice('infographic', 0.4) : choice('hologram', 0.99) }))
    const plan = await planDelegation(kev, { objective: 'SQL', band: 'adulto', nodes, hasDossier: false })
    expect(plan.nodes.get('n1')!.tipoVisual).toBe('text_card')
    expect(plan.nodes.get('n2')!.tipoVisual).toBe('text_card')
    expect(plan.nodes.get('n1')!.length).toBeNull()
  })

  test('Kev caído → plan determinista y no se insiste con los demás nodos', async () => {
    const { kev, calls } = kevWith(() => 'fail')
    const plan = await planDelegation(kev, { objective: 'SQL', band: 'ninez', nodes, hasDossier: false })
    expect(plan.oracle).toBe(false)
    expect(calls).toHaveLength(1)
    expect(plan.nodes.get('n2')!.source).toBe('default')
  })

  test('Kev no puede quitar la skill obligatoria ni añadir una no elegible', async () => {
    const { kev } = kevWith(() => ({ 'skill_lenguaje-simple': noul(0.99), 'skill_rigor-tecnico': noul(0.99) }))
    const plan = await planDelegation(kev, { objective: 'SQL', band: 'adulto', nodes, hasDossier: true })
    const skills = plan.nodes.get('n1')!.skills
    expect(skills).toContain('verificar-con-fuente')
    expect(skills).toContain('rigor-tecnico')
    expect(skills).not.toContain('lenguaje-simple')
  })
})

describe('planSpecialist (cada especialista)', () => {
  const base = { agentId: AGENT_IDS.explanation, band: 'adulto' as const, task: 'Nodo: "Tabla". Genera contenido.', hasDossier: false, nodePlanLength: null }

  test('decide esfuerzo, longitud y recorta las skills propuestas por el coordinador', async () => {
    const { kev, calls } = kevWith(() => ({
      effort: choice('reason', 0.9), length: choice('standard', 0.8), 'skill_analogias': noul(0.9), 'skill_contraejemplo': noul(0.1),
    }))
    const plan = await planSpecialist(kev, { ...base, proposed: ['analogias', 'contraejemplo'] })
    expect(plan).toMatchObject({ effort: 'reason', length: 'standard', skills: ['analogias'], source: 'oracle' })
    expect(calls).toHaveLength(1)
    // Solo se pregunta por las skills que el coordinador propuso.
    expect(Object.keys(calls[0].questions).filter(k => k.startsWith('skill_')).sort()).toEqual(['skill_analogias', 'skill_contraejemplo'])
  })

  test('esfuerzo "direct" con baja confianza no se aplica', async () => {
    const { kev } = kevWith(() => ({ effort: choice('direct', 0.5) }))
    expect((await planSpecialist(kev, { ...base, proposed: [] })).effort).toBeNull()
  })

  test('sin oráculo o con fallo: conserva lo propuesto y la longitud del plan', async () => {
    const down = kevWith(() => 'fail')
    const a = await planSpecialist(down.kev, { ...base, proposed: ['analogias'], nodePlanLength: 'brief' })
    expect(a).toMatchObject({ effort: null, length: 'brief', skills: ['analogias'], source: 'default' })
    const b = await planSpecialist(null, { ...base, proposed: ['analogias'] })
    expect(b.source).toBe('default')
  })

  test('helpers', () => {
    expect(contentAgentFor('quiz')).toBe(AGENT_IDS.evaluation)
    expect(contentAgentFor('desconocido')).toBe(AGENT_IDS.explanation)
    expect(lengthHint('brief')).toContain('breve')
    expect(defaultPlan(nodes, 'adulto', { hasDossier: false }).nodes.size).toBe(2)
  })
})

describe('decideTutorMove', () => {
  const base = {
    band: 'adulto' as const, node: { title: 'SELECT', concept: 'consultas' },
    available: { hint: true, reexplain: true, simplify: true },
  }
  test('Kev elige la ayuda dentro de lo disponible', async () => {
    const { decideTutorMove } = await import('./tutor')
    const { kev, calls } = kevWith(() => ({ move: choice('simplify', 0.9) }))
    expect(await decideTutorMove(kev, { ...base, attempts: 1 })).toEqual({ move: 'simplify', source: 'oracle' })
    expect(Object.keys(calls[0].questions.move.criteria).sort()).toEqual(['hint', 'reexplain', 'simplify'])
    expect(JSON.stringify(calls[0].state)).not.toMatch(/alumn|student_answer/i)
  })
  test('no se abandona un nodo antes del tercer fallo, ni por Kev ni por defecto', async () => {
    const { decideTutorMove, fallbackMove } = await import('./tutor')
    const { kev } = kevWith(() => ({ move: choice('advance', 0.99) })) // 'advance' no es una opción antes del 3.er fallo
    expect((await decideTutorMove(kev, { ...base, attempts: 1 })).move).not.toBe('advance')
    expect(fallbackMove({ ...base, attempts: 1, available: { hint: false, reexplain: false, simplify: false } })).toBe('hint')
    expect(fallbackMove({ ...base, attempts: 3 })).toBe('advance')
  })
  test('escalera determinista sin oráculo y sin consulta al llegar al límite', async () => {
    const { decideTutorMove } = await import('./tutor')
    expect((await decideTutorMove(null, { ...base, attempts: 1 })).move).toBe('hint')
    expect((await decideTutorMove(null, { ...base, attempts: 2 })).move).toBe('reexplain')
    const { kev, calls } = kevWith(() => ({}))
    expect((await decideTutorMove(kev, { ...base, attempts: 3 })).move).toBe('advance')
    expect(calls).toHaveLength(0)
  })
})
