import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HiveDB } from '@johpaz/hive-db'
import {
  CurriculumValidationError, answersSchemaFor, canAccredit, hashCurriculum, routeFor, scoreDiagnosticFor,
  validateBlueprintFor, validateCurriculumContent,
} from './curriculum-def'
import { aiCurriculumContent, aiCurriculumDef } from './curriculum-ai'
import { curriculumRoute, CURRICULUM_NODES } from './curriculum'
import { QUESTION_BANK, scoreDiagnostic } from './learning'
import { approveCurriculum, ensureCanonicalCurricula, findCurriculum, getCurriculum, saveGeneratedCurriculum } from './curriculum-store'

/** Un tema que no es IA: SQL básico, tres niveles. */
function sqlContent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sql-basico', topic: 'SQL básico', language: 'es', version: 'sql-2026.10.1',
    levels: ['inicial', 'intermedio', 'avanzado'],
    nodes: [
      { id: 'tablas', title: 'Tablas y filas', level: 'inicial', prerequisites: [], objective: 'Explicar qué es una tabla.', evidence: 'Describe una tabla de ejemplo.', tags: ['datos'], sources: ['sqlbolt'] },
      { id: 'select', title: 'Consultar con SELECT', level: 'inicial', prerequisites: ['tablas'], objective: 'Escribir un SELECT simple.', evidence: 'Obtiene columnas de una tabla.', tags: ['consultas'], sources: ['sqlbolt'] },
      { id: 'joins', title: 'Unir tablas', level: 'intermedio', prerequisites: ['select'], objective: 'Combinar tablas con JOIN.', evidence: 'Resuelve una consulta con dos tablas.', tags: ['consultas'], sources: [] },
    ],
    questionBank: [
      { id: 'q-tablas', nodeId: 'tablas', prompt: '¿Qué guarda una fila?', options: ['Un registro', 'Una columna entera', 'Un índice'], correct: 0 },
      { id: 'q-select', nodeId: 'select', prompt: '¿Qué cláusula elige columnas?', options: ['WHERE', 'SELECT', 'ORDER'], correct: 1 },
      { id: 'q-joins', nodeId: 'joins', prompt: '¿Qué hace JOIN?', options: ['Borra filas', 'Ordena', 'Combina tablas'], correct: 2 },
    ],
    sources: { sqlbolt: 'https://sqlbolt.com/' },
    ...overrides,
  }
}

describe('validateCurriculumContent', () => {
  test('acepta un currículo bien formado de cualquier tema', () => {
    const def = validateCurriculumContent(sqlContent())
    expect(def.nodes).toHaveLength(3)
    expect(def.language).toBe('es')
  })

  test('el currículo canónico de IA es válido como definición', () => {
    expect(() => aiCurriculumContent()).not.toThrow()
  })

  test('informa TODOS los problemas del grafo a la vez', () => {
    const bad = sqlContent({
      nodes: [
        { id: 'a', title: 'A', level: 'inicial', prerequisites: ['b'], objective: 'x', evidence: 'x' },
        { id: 'b', title: 'B', level: 'inicial', prerequisites: ['a'], objective: 'x', evidence: 'x' },
        { id: 'c', title: 'C', level: 'nivelfalso', prerequisites: ['zzz', 'c'], objective: 'x', evidence: 'x', sources: ['nope'] },
        { id: 'a', title: 'dup', level: 'inicial', prerequisites: [], objective: 'x', evidence: 'x' },
      ],
      questionBank: [{ id: 'q1', nodeId: 'fantasma', prompt: 'p', options: ['a', 'a', 'b'], correct: 0 }],
    })
    let error: unknown
    try { validateCurriculumContent(bad) } catch (e) { error = e }
    expect(error).toBeInstanceOf(CurriculumValidationError)
    const issues = (error as CurriculumValidationError).issues.join('\n')
    expect(issues).toContain('id duplicado "a"')
    expect(issues).toContain('nivel desconocido "nivelfalso"')
    expect(issues).toContain('prerrequisito inexistente "zzz"')
    expect(issues).toContain('se requiere a sí mismo')
    expect(issues).toContain('fuente desconocida "nope"')
    expect(issues).toContain('nodo inexistente "fantasma"')
    expect(issues).toContain('opciones repetidas')
    expect(issues).toContain('no tiene ninguna pregunta')
  })

  test('detecta ciclos de prerrequisitos', () => {
    const cyc = sqlContent({
      nodes: [
        { id: 'a', title: 'A', level: 'inicial', prerequisites: ['b'], objective: 'x', evidence: 'x' },
        { id: 'b', title: 'B', level: 'inicial', prerequisites: ['a'], objective: 'x', evidence: 'x' },
      ],
      questionBank: [
        { id: 'qa', nodeId: 'a', prompt: 'p', options: ['1', '2', '3'], correct: 0 },
        { id: 'qb', nodeId: 'b', prompt: 'p', options: ['1', '2', '3'], correct: 0 },
      ],
      sources: {},
    })
    expect(() => validateCurriculumContent(cyc)).toThrow(/ciclo/)
  })

  test('un prerrequisito de un nivel posterior es inválido', () => {
    const bad = sqlContent()
    ;(bad.nodes as Array<{ prerequisites: string[] }>)[0].prerequisites = ['joins']
    expect(() => validateCurriculumContent(bad)).toThrow(/nivel posterior|ciclo/)
  })

  test('rechaza límites, campos extra, controles y URL no https', () => {
    expect(() => validateCurriculumContent(sqlContent({ nodes: Array.from({ length: 21 }, (_, i) => ({ id: `n${i}`, title: 't', level: 'inicial', prerequisites: [], objective: 'x', evidence: 'x' })) }))).toThrow(CurriculumValidationError)
    expect(() => validateCurriculumContent({ ...sqlContent(), extra: 1 })).toThrow(CurriculumValidationError)
    expect(() => validateCurriculumContent(sqlContent({ topic: 'mal\u0007tema' }))).toThrow(CurriculumValidationError)
    expect(() => validateCurriculumContent(sqlContent({ sources: { sqlbolt: 'http://sqlbolt.com/' } }))).toThrow(/https/)
    expect(() => validateCurriculumContent(sqlContent({ id: 'Con Mayúsculas' }))).toThrow(CurriculumValidationError)
    expect(() => validateCurriculumContent(null)).toThrow(CurriculumValidationError)
  })
})

describe('hash y acreditación', () => {
  test('el hash es estable ante el orden de claves y cambia con el contenido', () => {
    const a = validateCurriculumContent(sqlContent())
    const reordered = validateCurriculumContent(Object.fromEntries(Object.entries(sqlContent()).reverse()))
    expect(hashCurriculum(a)).toBe(hashCurriculum(reordered))
    expect(hashCurriculum(validateCurriculumContent(sqlContent({ version: 'otra' })))).not.toBe(hashCurriculum(a))
  })

  test('solo lo canónico y lo revisado acredita', () => {
    expect(canAccredit({ status: 'canonical' })).toBe(true)
    expect(canAccredit({ status: 'reviewed' })).toBe(true)
    expect(canAccredit({ status: 'generated' })).toBe(false)
  })
})

describe('routeFor sobre un tema distinto de IA', () => {
  const sql = validateCurriculumContent(sqlContent())
  test('los prerrequisitos controlan la disponibilidad y se filtra por nivel', () => {
    const route = routeFor(sql, 20, 'inicial')
    expect(route.nodes.map(n => [n.id, n.status])).toEqual([['tablas', 'available'], ['select', 'pending']])
    expect(routeFor(sql, 20, 'intermedio', ['tablas', 'select']).nodes.map(n => n.status)).toEqual(['mastered', 'mastered', 'available'])
    expect(route.edges).toEqual([{ from: 'tablas', to: 'select', relation: 'prerequisite' }])
    expect(route.ageBand).toBe('adulto')
  })
  test('valida edad, nivel y competencias', () => {
    expect(() => routeFor(sql, 7, 'inicial')).toThrow()
    expect(() => routeFor(sql, 20, 'inexistente')).toThrow('Nivel curricular desconocido')
    expect(() => routeFor(sql, 20, 'inicial', ['otra'])).toThrow('Competencia desconocida')
  })
  test('el blueprint del enjambre solo admite competencias de ESTE currículo', () => {
    const route = routeFor(sql, 20, 'intermedio', ['tablas'])
    const plan = (competencyId: string) => ({ curriculumVersion: route.version, nodos: [{ id: 'act1', competencyId }] })
    expect(() => validateBlueprintFor(plan('select'), route)).not.toThrow()
    expect(() => validateBlueprintFor(plan('joins'), route)).toThrow()      // prerrequisito pendiente
    expect(() => validateBlueprintFor(plan('ai-agency'), route)).toThrow()  // competencia de otro tema
  })
})

describe('diagnóstico genérico', () => {
  const sql = validateCurriculumContent(sqlContent())
  const answers = (picks: Record<string, number>) => ({ answers: sql.questionBank.map(q => ({ questionId: q.id, option: picks[q.id] ?? 0 })) })

  test('el nivel es el del primer nodo con brecha y los puntajes salen por nodo', () => {
    const allRight = scoreDiagnosticFor(sql, answers({ 'q-tablas': 0, 'q-select': 1, 'q-joins': 2 }))
    expect(allRight).toEqual({ scores: { tablas: true, select: true, joins: true }, level: 'avanzado' })
    const gap = scoreDiagnosticFor(sql, answers({ 'q-tablas': 0, 'q-select': 0, 'q-joins': 2 }))
    expect(gap.scores).toEqual({ tablas: true, select: false, joins: true })
    expect(gap.level).toBe('inicial')
  })
  test('un nodo con varias preguntas exige acertarlas todas', () => {
    const two = validateCurriculumContent(sqlContent({
      questionBank: [
        ...sqlContent().questionBank,
        { id: 'q-select-2', nodeId: 'select', prompt: 'Otra', options: ['x', 'y', 'z'], correct: 2 },
      ],
    }))
    const input = { answers: two.questionBank.map(q => ({ questionId: q.id, option: q.id === 'q-select-2' ? 0 : q.correct })) }
    expect(scoreDiagnosticFor(two, input).scores.select).toBe(false)
  })
  test('exige exactamente una respuesta por pregunta', () => {
    expect(() => scoreDiagnosticFor(sql, { answers: [] })).toThrow()
    expect(() => scoreDiagnosticFor(sql, { answers: sql.questionBank.map(() => ({ questionId: 'q-tablas', option: 0 })) })).toThrow('una sola vez')
    expect(answersSchemaFor(sql).safeParse({ answers: [], extra: 1 }).success).toBe(false)
  })
})

describe('el currículo de IA no cambia de comportamiento', () => {
  test('curriculumRoute conserva sus campos y sus nodos conservan los datos canónicos', () => {
    const route = curriculumRoute(18, 'aplicador', ['ai-agency'])
    expect(route.version).toBe(aiCurriculumDef().version)
    expect(route.level).toBe('aplicador')
    expect(route.nodes.every(n => CURRICULUM_NODES.some(c => c.id === n.id && c.title === n.title && c.objective === n.objective))).toBe(true)
    expect(route.suggestedProgram.stages).toHaveLength(5)
  })
  test('el diagnóstico genérico coincide con scoreDiagnostic de IA', () => {
    const def = aiCurriculumContent()
    for (const picks of [QUESTION_BANK.map(q => q.correct), QUESTION_BANK.map(q => (q.correct + 1) % 3), QUESTION_BANK.map((q, i) => (i < 4 ? q.correct : (q.correct + 1) % 3))]) {
      const input = { answers: QUESTION_BANK.map((q, i) => ({ questionId: q.id, option: picks[i] })) }
      expect(scoreDiagnosticFor(def, input)).toEqual(scoreDiagnostic(input))
    }
  })
})

describe('almacén de currículos', () => {
  let dir: string
  let db: HiveDB
  beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'hl-curricula-')); db = await HiveDB.open(dir) })
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }) })

  test('siembra el canónico de IA una sola vez', async () => {
    await ensureCanonicalCurricula(db)
    await ensureCanonicalCurricula(db)
    expect(await db.collection('hl_curricula_defs').count()).toBe(1)
    expect((await findCurriculum(db, 'ai'))?.def.status).toBe('canonical')
  })

  test('lo generado nace sin acreditar, es idempotente y rechaza contenido inválido', async () => {
    const first = await saveGeneratedCurriculum(db, sqlContent())
    expect(first.def.status).toBe('generated')
    expect(first.created).toBe(true)
    expect(canAccredit(first.def)).toBe(false)
    const again = await saveGeneratedCurriculum(db, sqlContent())
    expect(again.created).toBe(false)
    expect(again.docId).toBe(first.docId)
    await expect(saveGeneratedCurriculum(db, sqlContent({ nodes: [] }))).rejects.toBeInstanceOf(CurriculumValidationError)
  })

  test('un agente no puede ocupar el id de un currículo canónico con otro contenido', async () => {
    await ensureCanonicalCurricula(db)
    await expect(saveGeneratedCurriculum(db, { ...sqlContent(), id: 'ai' })).rejects.toThrow(/canónico/)
  })

  test('solo un docente o administrador aprueba, y solo lo generado', async () => {
    const { docId } = await saveGeneratedCurriculum(db, sqlContent())
    await expect(approveCurriculum(db, docId, { id: 'alumno', role: 'student' })).rejects.toThrow(/docente o administrador/)
    const approved = await approveCurriculum(db, docId, { id: 'prof-1', role: 'teacher' })
    expect(approved).toMatchObject({ status: 'reviewed', reviewedBy: 'prof-1' })
    expect(canAccredit(approved)).toBe(true)
    await expect(approveCurriculum(db, docId, { id: 'prof-1', role: 'teacher' })).rejects.toThrow(/generado/)
    expect((await findCurriculum(db, 'sql-basico'))?.def.status).toBe('reviewed')
  })

  test('no aprueba un documento cuyo contenido fue alterado', async () => {
    const { docId, def } = await saveGeneratedCurriculum(db, sqlContent())
    const entry = (await db.collection<typeof def>('hl_curricula_defs').get(docId))!
    await db.collection('hl_curricula_defs').put(docId, { ...entry.doc, topic: 'Tema alterado' }, { expectedVersion: entry.version })
    await expect(approveCurriculum(db, docId, { id: 'prof-1', role: 'admin' })).rejects.toThrow(/hash/)
    expect((await getCurriculum(db, docId))?.status).toBe('generated')
  })
})
