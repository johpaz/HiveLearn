/**
 * Vistas del programa para el cliente.
 *
 * El alumno NUNCA recibe la clave de respuesta (`question.correct`) ni la nota del docente de otros: se le entrega el
 * enunciado y las opciones, y el servidor corrige. El docente ve el plan completo con la clave y el historial.
 */
import type { NodeProgress, PersonalProgram, ProgramLevel, ProgramNode } from './program-def'
import type { ProgramView } from './engine'

export interface StudentNode {
  id: string
  title: string
  objective: string
  evidence: string
  question: { prompt: string; options: string[] }
}

export interface StudentLevel extends Omit<ProgramLevel, 'nodes'> {
  nodes: StudentNode[]
}

export interface StudentProgress {
  attempts: number
  mastered: boolean
  correct: boolean
  openVerdict: 'correct' | 'incorrect' | 'unsure' | null
}

const studentNode = (node: ProgramNode): StudentNode => ({
  id: node.id, title: node.title, objective: node.objective, evidence: node.evidence,
  question: { prompt: node.question.prompt, options: (node.question.options as string[]).map(String) },
})

export function studentProgram(view: ProgramView) {
  const { program } = view
  const progress: Record<string, StudentProgress> = {}
  for (const [id, p] of Object.entries(program.progress) as Array<[string, NodeProgress]>) {
    progress[id] = { attempts: p.attempts, mastered: p.mastered, correct: p.correct, openVerdict: p.open?.verdict ?? null }
  }
  return {
    id: program.id,
    status: program.status,
    objective: program.objective,
    intent: { topic: program.intent.topic, goal: program.intent.goal, minutes: program.intent.minutes },
    currentLevel: program.currentLevel,
    levels: program.levels.map<StudentLevel>(l => ({ ...l, nodes: l.nodes.map(studentNode) })),
    progress,
    needsContent: view.needsContent,
    levelProgress: view.levelProgress,
    validation: program.validation,
    finalScore: program.status === 'closed' ? program.finalScore ?? null : null,
    closeReason: program.closeReason ?? null,
    createdAt: program.createdAt,
    closedAt: program.closedAt ?? null,
  }
}

/** Vista del docente: plan completo, sin tocar nada (incluye claves y revisiones). */
export function teacherProgram(program: PersonalProgram) {
  return program
}
