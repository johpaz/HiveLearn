import type { HiveDB } from '@johpaz/hive-db'
import { z } from 'zod'
import type { Account } from './accounts'
import { CURRICULUM_NODES, CURRICULUM_VERSION, curriculumRoute } from './curriculum'
import type { ProgressionLevel } from './types'

// Original formative items; not a psychometrically validated examination.
export const QUESTION_BANK = [
  { id: 'agency', nodeId: 'ai-agency', prompt: 'Una IA recomienda una decisión que afecta a una persona. ¿Quién debe responder por esa decisión?', options: ['Nadie: la IA decide sola', 'Las personas responsables de usarla y supervisarla', 'La pantalla del computador'], correct: 1 },
  { id: 'patterns', nodeId: 'data-patterns', prompt: 'Un clasificador solo ha visto fotos de perros blancos. ¿Qué conviene probar?', options: ['Perros de otros colores y ejemplos nuevos', 'Solo las mismas fotos', 'Cambiar el nombre del modelo'], correct: 0 },
  { id: 'privacy', nodeId: 'privacy', prompt: 'Para practicar con un asistente, ¿qué datos conviene usar?', options: ['Documentos reales del curso', 'Contraseñas del grupo', 'Datos ficticios sin identificar personas'], correct: 2 },
  { id: 'verification', nodeId: 'verification', prompt: 'Una respuesta incluye una cifra y una fuente. ¿Qué haces antes de usarla?', options: ['La acepto si suena segura', 'Abro la fuente y compruebo que respalde la cifra', 'Pregunto lo mismo hasta obtener esa cifra'], correct: 1 },
  { id: 'scoping', nodeId: 'problem-scoping', prompt: 'Antes de elegir un modelo, ¿qué defines?', options: ['El problema, las personas afectadas y cómo medir la solución', 'Solo el nombre del proveedor', 'El color del asistente'], correct: 0 },
  { id: 'workflow', nodeId: 'ai-workflow', prompt: '¿Qué flujo permite usar IA con criterio?', options: ['Copiar todo sin leer', 'Ocultar los errores', 'Definir tarea, revisar resultados y corregirlos'], correct: 2 },
  { id: 'evaluation', nodeId: 'model-evaluation', prompt: '¿Cómo compruebas si un modelo funciona con casos nuevos?', options: ['Solo con los datos usados para entrenarlo', 'Con ejemplos de prueba separados del entrenamiento', 'Con el tamaño del archivo'], correct: 1 },
  { id: 'design', nodeId: 'system-design', prompt: 'Un agente puede enviar mensajes. ¿Qué control necesita?', options: ['Permisos limitados y aprobación para acciones sensibles', 'Permisos ilimitados', 'Ningún registro'], correct: 0 },
  { id: 'risk', nodeId: 'risk-governance', prompt: '¿Qué debe incluir un registro de riesgos de IA?', options: ['Solo una lista de herramientas', 'Solo beneficios', 'Daños posibles, personas afectadas, responsables y mitigaciones'], correct: 2 },
  { id: 'iteration', nodeId: 'iteration', prompt: 'Una nueva versión mejora unos casos y empeora otros. ¿Qué haces?', options: ['La publico sin revisar', 'Comparo con la misma evaluación y reviso las regresiones', 'Borro los casos difíciles'], correct: 1 },
] as const
export const answersSchema = z.object({ answers: z.array(z.object({ questionId: z.string(), option: z.number().int().min(0).max(2) }).strict()).length(QUESTION_BANK.length) }).strict()
export interface LearningRecord {
  studentId: string; institutionId: string; version: string; level: ProgressionLevel
  diagnosticAt: string; scores: Record<string, boolean>; mastered: string[]
}
export function scoreDiagnostic(input: unknown) {
  const { answers } = answersSchema.parse(input)
  const map = new Map(answers.map(answer => [answer.questionId, answer.option]))
  if (map.size !== QUESTION_BANK.length || QUESTION_BANK.some(question => !map.has(question.id))) throw new Error('Responda cada pregunta una sola vez')
  const scores = Object.fromEntries(QUESTION_BANK.map(q => [q.nodeId, map.get(q.id) === q.correct]))
  // Select the first level with a knowledge gap. Diagnostic never certifies practical mastery.
  const firstGap = CURRICULUM_NODES.find(node => !scores[node.id])
  return { scores, level: firstGap?.level ?? 'creador_avanzado' as ProgressionLevel }
}
export class Learning {
  constructor(readonly db: HiveDB) {}
  async record(studentId: string) { return (await this.db.collection<LearningRecord>('hl_learning_records').get(studentId))?.doc ?? null }
  async diagnostic(actor: Account, input: unknown) {
    if (actor.role !== 'student' || !actor.age) throw new Error('Solo alumnos con perfil completo')
    const score = scoreDiagnostic(input)
    const col = this.db.collection<LearningRecord>('hl_learning_records')
    const old = await col.get(actor.id)
    const record: LearningRecord = { studentId: actor.id, institutionId: actor.institutionId, version: CURRICULUM_VERSION, ...score, diagnosticAt: new Date().toISOString(), mastered: old?.doc.mastered ?? [] }
    await col.put(actor.id, record, { expectedVersion: old?.version ?? 0 })
    return this.route(actor)
  }
  async route(actor: Account) {
    const record = await this.record(actor.id)
    return { ...curriculumRoute(actor.age ?? 18, record?.level ?? 'fundamentos', record?.mastered ?? []), diagnosticCompleted: !!record, scores: record?.scores ?? {} }
  }
  async review(teacher: Account, student: Account, input: unknown) {
    if (teacher.institutionId !== student.institutionId || !(teacher.role === 'admin' || teacher.role === 'teacher' && student.teacherId === teacher.id)) throw new Error('No autorizado')
    const data = z.object({ nodeId: z.string(), evidence: z.string().trim().min(20).max(2000) }).strict().parse(input)
    const col = this.db.collection<LearningRecord>('hl_learning_records'), entry = await col.get(student.id)
    if (!entry) throw new Error('El alumno debe completar el diagnóstico')
    const node = CURRICULUM_NODES.find(n => n.id === data.nodeId)
    if (!node || !node.prerequisites.every(id => entry.doc.mastered.includes(id))) throw new Error('Faltan prerrequisitos validados')
    const mastered = [...new Set([...entry.doc.mastered, node.id])]
    const next = CURRICULUM_NODES.find(n => !mastered.includes(n.id))
    await this.db.batch([
      { op: 'put', collection: 'hl_learning_records', id: student.id, doc: { ...entry.doc, mastered, level: next?.level ?? 'creador_avanzado' }, expectedVersion: entry.version },
      { op: 'put', collection: 'hl_competency_reviews', id: crypto.randomUUID(), doc: { studentId: student.id, reviewerId: teacher.id, institutionId: teacher.institutionId, ...data, version: CURRICULUM_VERSION, createdAt: new Date().toISOString() }, expectedVersion: 0 },
    ])
    return this.route(student)
  }
}
