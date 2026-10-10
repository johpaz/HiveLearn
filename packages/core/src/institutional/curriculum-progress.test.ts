import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { HiveDB } from '@johpaz/hive-db'
import { approveCurriculum, saveGeneratedCurriculum } from './curriculum-store'
import { CurriculumProgressStore } from './curriculum-progress'
import type { Account } from './accounts'

const content = (overrides: Record<string, unknown> = {}) => ({
  id: 'sql-basico', topic: 'SQL básico', language: 'es', version: 'sql-1', levels: ['inicial', 'avanzado'],
  nodes: [
    { id: 'tablas', title: 'Tablas', level: 'inicial', prerequisites: [], objective: 'Explicar una tabla.', evidence: 'Describe una tabla.', tags: [], sources: [] },
    { id: 'select', title: 'SELECT', level: 'avanzado', prerequisites: ['tablas'], objective: 'Escribir SELECT.', evidence: 'Consulta una tabla.', tags: [], sources: [] },
  ],
  questionBank: [
    { id: 'q1', nodeId: 'tablas', prompt: '¿Qué guarda una fila?', options: ['Un registro', 'Un índice', 'Una vista'], correct: 0 },
    { id: 'q2', nodeId: 'select', prompt: '¿Qué elige columnas?', options: ['WHERE', 'SELECT', 'ORDER'], correct: 1 },
  ],
  sources: {},
  ...overrides,
})
const student = { id: 'st1', role: 'student', institutionId: 'i1', age: 20, teacherId: 't1' } as unknown as Account
const teacher = { id: 't1', role: 'teacher', institutionId: 'i1' } as unknown as Account
const answers = (a: number, b: number) => ({ answers: [{ questionId: 'q1', option: a }, { questionId: 'q2', option: b }] })

let root: string
let db: HiveDB
beforeEach(async () => { root = mkdtempSync(join(tmpdir(), 'hl-progress-')); db = await HiveDB.open(root) })
afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }) })

describe('CurriculumProgressStore', () => {
  test('diagnóstico y ruta sobre un tema que no es IA', async () => {
    const { def } = await saveGeneratedCurriculum(db, content())
    const store = new CurriculumProgressStore(db)
    expect((await store.route(student, def)).diagnosticCompleted).toBe(false)
    const route = await store.diagnostic(student, def, answers(0, 0))
    expect(route).toMatchObject({ diagnosticCompleted: true, level: 'avanzado', scores: { tablas: true, select: false }, curriculumId: 'sql-basico' })
    // Sin dominio acreditado aún: solo "tablas" está disponible, "select" espera su prerrequisito.
    expect(route.nodes.map(n => [n.id, n.status])).toEqual([['tablas', 'available'], ['select', 'pending']])
  })

  test('un currículo generado no acredita; uno revisado sí, y exige prerrequisitos', async () => {
    const saved = await saveGeneratedCurriculum(db, content())
    const store = new CurriculumProgressStore(db)
    await store.diagnostic(student, saved.def, answers(0, 1))
    const evidence = { nodeId: 'tablas', evidence: 'Explicó con sus palabras qué es una tabla y dio un ejemplo.' }
    await expect(store.review(teacher, student, saved.def, evidence)).rejects.toThrow(/no está revisado/)

    const reviewed = await approveCurriculum(db, saved.docId, { id: 't1', role: 'teacher' })
    // El hash no cambia con la aprobación: el diagnóstico previo sigue valiendo.
    const route = await store.review(teacher, student, reviewed, evidence)
    expect(route.nodes.find(n => n.id === 'tablas')?.status).toBe('mastered')
    await expect(store.review(teacher, student, reviewed, { nodeId: 'select', evidence: 'x'.repeat(30) })).resolves.toBeDefined()
  })

  test('prerrequisito sin dominar y docente ajeno se rechazan', async () => {
    const saved = await saveGeneratedCurriculum(db, content())
    const reviewed = await approveCurriculum(db, saved.docId, { id: 't1', role: 'teacher' })
    const store = new CurriculumProgressStore(db)
    await store.diagnostic(student, reviewed, answers(0, 1))
    await expect(store.review(teacher, student, reviewed, { nodeId: 'select', evidence: 'x'.repeat(30) })).rejects.toThrow(/prerrequisitos/)
    const other = { id: 't2', role: 'teacher', institutionId: 'i1' } as unknown as Account
    await expect(store.review(other, student, reviewed, { nodeId: 'tablas', evidence: 'x'.repeat(30) })).rejects.toThrow(/No autorizado/)
  })

  test('si el contenido cambia (otro hash) el progreso anterior no se arrastra', async () => {
    const v1 = (await saveGeneratedCurriculum(db, content())).def
    const store = new CurriculumProgressStore(db)
    await store.diagnostic(student, v1, answers(0, 1))
    const v2 = (await saveGeneratedCurriculum(db, content({ version: 'sql-2', topic: 'SQL básico v2' }))).def
    expect(v2.hash).not.toBe(v1.hash)
    expect((await store.route(student, v2)).diagnosticCompleted).toBe(false)
  })
})

describe('dominio por evidencia (regla híbrida)', () => {
  test('solo en currículos que acreditan, con diagnóstico y prerrequisitos', async () => {
    const { recordAssessment } = await import('../grading/assessment')
    const saved = await saveGeneratedCurriculum(db, content())
    const store = new CurriculumProgressStore(db)
    await store.diagnostic(student, saved.def, answers(0, 1))
    const ok = { correct: true, score: 1, confidence: 1, method: 'deterministic' as const, detail: '' }
    const evidence = (sessionId: string, nodeId = 'tablas') => recordAssessment(db, { alumnoId: student.id, curriculumId: 'sql-basico', nodeId, sessionId, grade: ok })

    // Generado: nunca domina, por mucha evidencia que haya.
    await evidence('a'); await evidence('b'); await evidence('c')
    expect((await store.route(student, saved.def)).nodes.find(n => n.id === 'tablas')?.status).toBe('available')

    // Aprobado por un docente: la evidencia en sesiones distintas ya basta.
    const reviewed = await approveCurriculum(db, saved.docId, { id: 't1', role: 'teacher' })
    await evidence('d'); await evidence('e') // lo anterior era autodeclarado: no cuenta
    expect((await store.route(student, reviewed)).nodes.find(n => n.id === 'tablas')?.status).toBe('mastered')
    // Un nodo con prerrequisito sin dominar no se da por dominado.
    await evidence('a', 'select'); await evidence('b', 'select')
    expect(await store.masterByEvidence(student.id, reviewed, 'tablas')).toBe(false) // ya dominado: idempotente
  })
})

describe('levelCheck: ¿superó el nivel?', () => {
  const fakeKev = (ready: number | null) => ({
    kind: 'custom' as const,
    ask: async () => (ready === null ? null : { ready: { type: 'noul' as const, noul: ready } }),
  })
  const evidence = { nodeId: 'tablas', evidence: 'Explicó con sus palabras qué es una tabla y dio un ejemplo.' }

  async function setup() {
    const saved = await saveGeneratedCurriculum(db, content())
    const reviewed = await approveCurriculum(db, saved.docId, { id: 't1', role: 'teacher' })
    const store = new CurriculumProgressStore(db)
    await store.diagnostic(student, reviewed, answers(0, 1))
    return { store, reviewed, saved }
  }

  test('sin evidencia el nivel no se supera, aunque Kev diga que sí', async () => {
    const { store, reviewed } = await setup()
    const r = await store.levelCheck(student, reviewed, { kev: fakeKev(0.99) as never, level: 'inicial' })
    expect(r).toMatchObject({ decision: 'hold', masteredCount: 0, total: 1, kevReady: 0.99 })
  })

  test('con todo dominado avanza; si Kev ve evidencia débil pasa a revisión docente y queda registrado una sola vez', async () => {
    const { store, reviewed } = await setup()
    await store.review(teacher, student, reviewed, evidence)
    expect((await store.levelCheck(student, reviewed, { kev: fakeKev(0.9) as never, level: 'inicial' })).decision).toBe('advance')
    expect((await store.levelCheck(student, reviewed, { kev: null, level: 'inicial' })).decision).toBe('advance')

    const doubtful = await store.levelCheck(student, reviewed, { kev: fakeKev(0.1) as never, level: 'inicial' })
    expect(doubtful.decision).toBe('teacher_review')
    await store.levelCheck(student, reviewed, { kev: fakeKev(0.1) as never, level: 'inicial' })
    const { LEVEL_REVIEWS_COLLECTION } = await import('./curriculum-progress')
    expect(await db.collection(LEVEL_REVIEWS_COLLECTION).scan()).toHaveLength(1)
  })

  test('un currículo sin revisar nunca supera el nivel', async () => {
    const { store, saved } = await setup()
    expect((await store.levelCheck(student, saved.def, { kev: fakeKev(0.99) as never, level: 'inicial' })).decision).toBe('hold')
  })
})
