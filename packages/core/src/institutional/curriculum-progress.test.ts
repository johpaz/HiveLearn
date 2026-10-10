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
