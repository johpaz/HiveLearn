/**
 * El currículo canónico de IA expresado como `CurriculumDef` (datos validados).
 * Las constantes de `curriculum.ts` y `learning.ts` siguen siendo la fuente; esto las expone al catálogo
 * genérico para que la IA sea "un currículo más" y el resto del sistema no distinga por tema.
 */
import { CURRICULUM_NODES, CURRICULUM_SOURCES, CURRICULUM_VERSION, LEVELS } from './curriculum'
import { QUESTION_BANK } from './learning'
import { validateCurriculumContent, hashCurriculum, type CurriculumContent, type CurriculumDef } from './curriculum-def'

export const AI_CURRICULUM_ID = 'ai'

export function aiCurriculumContent(): CurriculumContent {
  return validateCurriculumContent({
    id: AI_CURRICULUM_ID,
    topic: 'Inteligencia artificial: uso responsable y creación',
    language: 'es',
    version: CURRICULUM_VERSION,
    levels: [...LEVELS],
    nodes: CURRICULUM_NODES.map(node => ({
      id: node.id, title: node.title, level: node.level, prerequisites: [...node.prerequisites],
      objective: node.objective, evidence: node.evidence, tags: [], sources: [...node.sources],
    })),
    questionBank: QUESTION_BANK.map(question => ({
      id: question.id, nodeId: question.nodeId, prompt: question.prompt, options: [...question.options] as [string, string, string], correct: question.correct,
    })),
    sources: { ...CURRICULUM_SOURCES },
  })
}

export function aiCurriculumDef(now = new Date()): CurriculumDef {
  const content = aiCurriculumContent()
  return { ...content, hash: hashCurriculum(content), status: 'canonical', createdAt: now.toISOString() }
}
