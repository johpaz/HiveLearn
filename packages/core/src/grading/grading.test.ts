import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HiveDB } from '@johpaz/hive-db'
import { applyRubric, gradeAnswer, judgedByModel, parseNumber, LLM_CONFIDENCE_CAP, type Grade } from './grade'
import { decideEvidence, getEvidence, masteryReady, recordEvidence } from './evidence'

describe('gradeAnswer', () => {
  const choice = { kind: 'choice' as const, options: ['Un registro', 'Un índice', 'Una vista'], correctIndex: 0 }
  test('opción múltiple por índice o por texto, sin acentos ni mayúsculas; sin coincidencias difusas', () => {
    expect(gradeAnswer(choice, '0').correct).toBe(true)
    expect(gradeAnswer(choice, ' UN REGISTRO ').correct).toBe(true)
    expect(gradeAnswer(choice, 'Un indice').correct).toBe(false)
    // Contener el texto correcto no es acertar.
    const partial = gradeAnswer(choice, 'Un registro y un índice')
    expect(partial.correct).toBe(false)
    expect(partial.confidence).toBeLessThan(1)
    expect(gradeAnswer(choice, '').correct).toBe(false)
  })
  test('clave inválida o opciones ambiguas no se corrigen', () => {
    expect(gradeAnswer({ kind: 'choice', options: ['a', 'A'], correctIndex: 0 }, 'a').correct).toBeNull()
    expect(gradeAnswer({ kind: 'choice', options: ['a', 'b'], correctIndex: 5 }, 'a').correct).toBeNull()
  })
  test('verdadero/falso', () => {
    expect(gradeAnswer({ kind: 'true_false', correct: true }, 'Sí').correct).toBe(true)
    expect(gradeAnswer({ kind: 'true_false', correct: false }, 'verdadero').correct).toBe(false)
  })
  test('numérico: coma decimal, miles, unidades y tolerancia', () => {
    expect(parseNumber('3,5')).toBe(3.5)
    expect(parseNumber('1.200,5')).toBe(1200.5)
    expect(parseNumber('1,200.5')).toBe(1200.5)
    expect(parseNumber('1.200.300')).toBe(1200300)
    expect(parseNumber('12 cm')).toBe(12)
    expect(parseNumber('abc')).toBeNull()
    const spec = { kind: 'numeric' as const, value: 3.14, tolerance: 0.01 }
    expect(gradeAnswer(spec, '3,14').correct).toBe(true)
    expect(gradeAnswer(spec, '3.15').correct).toBe(true)
    expect(gradeAnswer(spec, '3.2').correct).toBe(false)
    expect(gradeAnswer({ kind: 'numeric', value: 1000, relativeTolerance: 0.01 }, '1005').correct).toBe(true)
  })
  test('texto: exacto tras normalizar, palabras clave, y un fallo es poco confiable', () => {
    const spec = { kind: 'text' as const, accepted: ['Una función pura'], requiredKeywords: ['entrada', 'salida'] }
    expect(gradeAnswer(spec, 'una funcion PURA').confidence).toBe(1)
    expect(gradeAnswer(spec, 'depende de la entrada y la salida').correct).toBe(true)
    const miss = gradeAnswer(spec, 'algo parecido pero con otras palabras')
    expect(miss).toMatchObject({ correct: false })
    expect(miss.confidence).toBeLessThan(0.8)
  })
})

describe('applyRubric', () => {
  const rubric = { criteria: [{ id: 'datos', description: 'Menciona que los datos son parciales', weight: 2 }, { id: 'prueba', description: 'Propone probar con casos nuevos' }] }
  const answer = 'Los datos muestran solo una parte del mundo y probaría con casos nuevos.'
  test('el puntaje lo calcula el código y la confianza del LLM tiene tope', () => {
    const grade = applyRubric(rubric, {
      criteria: [{ id: 'datos', met: true, evidence: 'datos muestran solo una parte' }, { id: 'prueba', met: true, evidence: 'probaría con casos nuevos' }],
      confidence: 1,
    }, answer)
    expect(grade).toMatchObject({ correct: true, score: 1, method: 'rubric' })
    expect(grade.confidence).toBe(LLM_CONFIDENCE_CAP)
  })
  test('un criterio sin cita verificable no cuenta y baja la confianza', () => {
    const grade = applyRubric(rubric, {
      criteria: [{ id: 'datos', met: true, evidence: 'frase que el alumno nunca escribió' }, { id: 'prueba', met: true, evidence: 'probaría con casos nuevos' }],
      confidence: 0.9,
    }, answer)
    expect(grade.score).toBeCloseTo(1 / 3)
    expect(grade.correct).toBe(false)
    expect(grade.confidence).toBeLessThan(0.5)
  })
  test('veredicto que no cubre los criterios o con forma inválida no se acepta', () => {
    expect(applyRubric(rubric, { criteria: [{ id: 'datos', met: true, evidence: 'x' }], confidence: 1 }, answer).correct).toBeNull()
    expect(applyRubric(rubric, { criteria: [], confidence: 5 }, answer).correct).toBeNull()
    expect(applyRubric(rubric, 'texto', answer).confidence).toBe(0)
  })
})

describe('decideEvidence (regla híbrida)', () => {
  const g = (correct: boolean | null, confidence: number): Grade => ({ correct, score: correct ? 1 : 0, confidence, method: 'deterministic', detail: '' })
  test('currículo que acredita + confianza alta cuenta', () => {
    expect(decideEvidence(g(true, 1), { curriculumStatus: 'canonical', hasTeacher: true })).toBe('counts')
    expect(decideEvidence(g(true, 0.9), { curriculumStatus: 'reviewed', hasTeacher: false })).toBe('counts')
  })
  test('currículo generado nunca acredita', () => {
    expect(decideEvidence(g(true, 1), { curriculumStatus: 'generated', hasTeacher: true })).toBe('self_reported')
  })
  test('confianza baja: revisión docente, o autodeclarado sin docente', () => {
    expect(decideEvidence(g(true, 0.6), { curriculumStatus: 'canonical', hasTeacher: true })).toBe('teacher_review')
    expect(decideEvidence(g(true, 0.6), { curriculumStatus: 'canonical', hasTeacher: false })).toBe('self_reported')
    expect(decideEvidence(judgedByModel(true), { curriculumStatus: 'canonical', hasTeacher: true })).toBe('teacher_review')
  })
  test('incorrecto confiable reintenta; dudoso o sin decisión va a revisión', () => {
    expect(decideEvidence(g(false, 1), { curriculumStatus: 'canonical', hasTeacher: true })).toBe('retry')
    expect(decideEvidence(g(false, 0.5), { curriculumStatus: 'canonical', hasTeacher: true })).toBe('teacher_review')
    expect(decideEvidence(g(null, 0), { curriculumStatus: 'canonical', hasTeacher: false })).toBe('self_reported')
  })
})

describe('recordEvidence', () => {
  let root: string, db: HiveDB
  beforeEach(async () => { root = mkdtempSync(join(tmpdir(), 'hl-evidence-')); db = await HiveDB.open(root) })
  afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }) })
  const ok: Grade = { correct: true, score: 1, confidence: 1, method: 'deterministic', detail: '' }
  const base = { studentId: 's1', curriculumId: 'sql', nodeId: 'n1', grade: ok, context: { curriculumStatus: 'reviewed' as const, hasTeacher: true } }

  test('el dominio exige evidencia en sesiones distintas, no repetir en la misma', async () => {
    let r = await recordEvidence(db, { ...base, sessionId: 'a' })
    expect(r.masteryReady).toBe(false)
    r = await recordEvidence(db, { ...base, sessionId: 'a' })
    expect(r.masteryReady).toBe(false)
    r = await recordEvidence(db, { ...base, sessionId: 'b' })
    expect(r.masteryReady).toBe(true)
    expect(masteryReady(await getEvidence(db, 's1', 'sql', 'n1'))).toBe(true)
  })

  test('escrituras concurrentes no se pierden', async () => {
    await Promise.all(['a', 'b', 'c', 'd'].map(sessionId => recordEvidence(db, { ...base, sessionId })))
    expect((await getEvidence(db, 's1', 'sql', 'n1'))?.entries).toHaveLength(4)
  })

  test('lo autodeclarado no acerca al dominio', async () => {
    const context = { curriculumStatus: 'generated' as const, hasTeacher: true }
    await recordEvidence(db, { ...base, context, sessionId: 'a' })
    const r = await recordEvidence(db, { ...base, context, sessionId: 'b' })
    expect(r.masteryReady).toBe(false)
  })
})
