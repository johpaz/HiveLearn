import type { AgeBand, ProgressionLevel } from './types'
import { suggestedProgram } from './curriculum-programs'
import { ageBandFor } from './age'

/** Canonical curriculum: agent output must never overwrite this catalog. */
export const CURRICULUM_VERSION = 'hivelearn-ai-2026.09.2'
export const CURRICULUM_SOURCES = {
  unesco: 'https://www.unesco.org/en/articles/ai-competency-framework-students',
  ai4k12: 'https://ai4k12.org/gradeband-progression-charts/',
  nist: 'https://www.nist.gov/itl/ai-risk-management-framework',
  ailiteracy: 'https://ailiteracyframework.org/frameworks/',
  digcomp: 'https://joint-research-centre.ec.europa.eu/scientific-activities/key-competences-lifelong-learning/digital-competence-framework-digcomp/digcomp-30_en',
  dayofai: 'https://dayofai.org/curriculum-resources',
  mineduc: 'https://ciudadaniadigital.mineduc.cl/wp-content/uploads/2025/05/3.2.4-Guia-de-integracion-practica.pdf',
} as const
export interface CurriculumNode {
  id: string
  title: string
  level: ProgressionLevel
  prerequisites: string[]
  objective: string
  evidence: string
  sources: (keyof typeof CURRICULUM_SOURCES)[]
}
export const CURRICULUM_NODES: readonly CurriculumNode[] = [
  { id: 'ai-agency', title: 'IA y decisiones humanas', level: 'fundamentos', prerequisites: [], objective: 'Distinguir sistemas de IA, reglas y decisiones humanas sin atribuir conciencia al sistema.', evidence: 'Clasifica ejemplos y explica quién responde por una decisión.', sources: ['unesco', 'ai4k12'] },
  { id: 'data-patterns', title: 'Datos, percepción y patrones', level: 'fundamentos', prerequisites: ['ai-agency'], objective: 'Explicar cómo los ejemplos y sensores representan parcialmente el mundo.', evidence: 'Construye una clasificación con datos ficticios y encuentra un contraejemplo.', sources: ['ai4k12'] },
  { id: 'privacy', title: 'Privacidad y uso responsable', level: 'usuario_responsable', prerequisites: ['ai-agency'], objective: 'Reconocer datos personales y decidir cuándo no compartirlos con una IA.', evidence: 'Anonimiza un caso ficticio y justifica cuándo pedir apoyo humano.', sources: ['unesco'] },
  { id: 'verification', title: 'Verificar respuestas y sesgos', level: 'usuario_responsable', prerequisites: ['data-patterns', 'privacy'], objective: 'Contrastar afirmaciones y detectar limitaciones en resultados generados.', evidence: 'Identifica una afirmación falsa y la contrasta con una fuente independiente.', sources: ['unesco', 'ai4k12'] },
  { id: 'problem-scoping', title: 'Delimitar un problema', level: 'aplicador', prerequisites: ['verification'], objective: 'Definir usuarios, beneficio esperado y alternativa sin IA.', evidence: 'Presenta un problema acotado con criterio observable de éxito.', sources: ['unesco'] },
  { id: 'ai-workflow', title: 'Aplicar IA con revisión humana', level: 'aplicador', prerequisites: ['problem-scoping'], objective: 'Diseñar instrucciones, contexto y revisión para una tarea concreta.', evidence: 'Compara dos soluciones y documenta errores y correcciones.', sources: ['unesco'] },
  { id: 'model-evaluation', title: 'Entrenamiento y evaluación', level: 'constructor', prerequisites: ['data-patterns', 'ai-workflow'], objective: 'Separar ejemplos de aprendizaje y prueba, y comparar errores.', evidence: 'Evalúa un prototipo con ejemplos no usados al construirlo.', sources: ['ai4k12', 'unesco'] },
  { id: 'system-design', title: 'Diseño de sistemas de IA', level: 'constructor', prerequisites: ['model-evaluation', 'privacy'], objective: 'Relacionar entradas, modelo, herramientas, salidas y supervisión.', evidence: 'Entrega un diagrama con límites, permisos y condiciones de parada.', sources: ['unesco'] },
  { id: 'risk-governance', title: 'Riesgos y responsabilidad', level: 'creador_avanzado', prerequisites: ['system-design', 'verification'], objective: 'Identificar personas afectadas, riesgos y medidas de mitigación.', evidence: 'Documenta riesgos, responsables y pruebas de las mitigaciones.', sources: ['nist', 'unesco'] },
  { id: 'iteration', title: 'Mejora y seguimiento', level: 'creador_avanzado', prerequisites: ['risk-governance'], objective: 'Mejorar un sistema con evidencia y registrar sus límites.', evidence: 'Compara versiones con la misma evaluación y describe regresiones.', sources: ['unesco', 'nist'] },
]
const LEVELS: ProgressionLevel[] = ['fundamentos', 'usuario_responsable', 'aplicador', 'constructor', 'creador_avanzado']
export const AGE_GUIDANCE: Record<AgeBand, { context: string; supervision: string }> = {
  ninez: { context: '8–11: ejemplos concretos, clasificación de objetos y actividades sin cuentas externas.', supervision: 'Actividad mediada por docente; datos ficticios y herramientas institucionales.' },
  adolescencia_temprana: { context: '12–14: datos sencillos, comparación de respuestas y proyectos escolares guiados.', supervision: 'Revisión docente de herramientas, fuentes y publicaciones.' },
  adolescencia: { context: '15–17: proyectos contextualizados, evaluación de modelos y discusión de impactos.', supervision: 'Supervisión institucional y revisión antes de publicar o desplegar.' },
  adulto: { context: '18+: situaciones ciudadanas o laborales; programación opcional según diagnóstico.', supervision: 'Revisión humana proporcional al riesgo; no usar datos sensibles reales en ejercicios.' },
}
export function curriculumRoute(age: number, level: ProgressionLevel, mastered: readonly string[] = []) {
  if (!Number.isInteger(age) || age < 8 || age > 120) throw new Error('Edad fuera del catálogo (8–120)')
  if (!LEVELS.includes(level)) throw new Error('Nivel curricular desconocido')
  const known = new Set(CURRICULUM_NODES.map(node => node.id))
  if (mastered.some(id => !known.has(id))) throw new Error('Competencia desconocida')
  const ageBand: AgeBand = ageBandFor(age)
  const completed = new Set(mastered)
  const nodes = CURRICULUM_NODES.filter(node => LEVELS.indexOf(node.level) <= LEVELS.indexOf(level)).map(node => ({
    ...node, prerequisites: [...node.prerequisites], sources: [...node.sources],
    status: completed.has(node.id) ? 'mastered' : node.prerequisites.every(id => completed.has(id)) ? 'available' : 'pending',
  }))
  return { version: CURRICULUM_VERSION, ageBand, level, guidance: { ...AGE_GUIDANCE[ageBand] }, suggestedProgram: suggestedProgram(ageBand, level), nodes,
    edges: nodes.flatMap(node => node.prerequisites.map(from => ({ from, to: node.id, relation: 'prerequisite' as const }))), sources: { ...CURRICULUM_SOURCES } }
}
export function coordinatorCurriculumContext(age: number, level: ProgressionLevel = 'fundamentos', mastered: readonly string[] = []) {
  return `CURRÍCULO CANÓNICO DE IA (no modificable por agentes):\n${JSON.stringify(curriculumRoute(age, level, mastered))}\nComplementa con explicaciones y prácticas; conserva los identificadores y prerrequisitos. No declares dominio sin evidencia validada. No añadas XP, premios ni mecánicas de juego.`
}
export function validateCurricularBlueprint(input: unknown, route: ReturnType<typeof curriculumRoute>) {
  const plan = input as { curriculumVersion?: unknown; nodos?: { id?: unknown; competencyId?: unknown }[] }
  if (!plan || plan.curriculumVersion !== route.version || !Array.isArray(plan.nodos) || !plan.nodos.length || plan.nodos.length > 20) throw new Error('Blueprint sin versión curricular válida o sin actividades')
  const ids = new Set<unknown>()
  for (const node of plan.nodos) {
    if (!node || typeof node.id !== 'string' || ids.has(node.id)) throw new Error('Identificador de actividad inválido o duplicado')
    ids.add(node.id)
    if (!route.nodes.some(n => n.id === node.competencyId && n.status !== 'pending')) throw new Error('Actividad fuera del currículo o con prerrequisitos pendientes')
  }
}
