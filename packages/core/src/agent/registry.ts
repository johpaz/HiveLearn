/**
 * Registry histórico de agentes HiveLearn.
 * El sistema mantiene varios agentes legacy en BD por compatibilidad,
 * pero el pipeline activo de generación usa solo el subconjunto reducido.
 */
import type { Database } from 'bun:sqlite'
const HIVELEARN_PROVIDER_ID = 'ollama'
const HIVELEARN_MODEL_ID = 'gemma4-e4b'
import { COORDINATOR_PROMPT } from './coordinator.prompt'
import { PROFILE_PROMPT } from './prompts/profile.prompt'
import { INTENT_PROMPT } from './prompts/intent.prompt'
import { STRUCTURE_PROMPT } from './prompts/structure.prompt'
import { EXPLANATION_PROMPT } from './prompts/explanation.prompt'
import { EXERCISE_PROMPT } from './prompts/exercise.prompt'
import { QUIZ_PROMPT } from './prompts/quiz.prompt'
import { CHALLENGE_PROMPT } from './prompts/challenge.prompt'
import { CODE_PROMPT } from './prompts/code.prompt'
import { SVG_PROMPT } from './prompts/svg.prompt'
import { GIF_PROMPT } from './prompts/gif.prompt'
import { INFOGRAPHIC_PROMPT } from './prompts/infographic.prompt'
import { GAMIFICATION_PROMPT } from './prompts/gamification.prompt'
import { EVALUATION_PROMPT } from './prompts/evaluation.prompt'
import { FEEDBACK_PROMPT } from './prompts/feedback.prompt'
import { AUDIO_PROMPT } from './prompts/audio.prompt'
import { ONBOARDING_PROMPT } from './prompts/onboarding.prompt'

export const AGENT_IDS = {
  coordinator: 'hl-coordinator-agent',
  onboarding: 'hl-onboarding-agent',
  profile: 'hl-profile-agent',
  intent: 'hl-intent-agent',
  structure: 'hl-structure-agent',
  explanation: 'hl-explanation-agent',
  exercise: 'hl-exercise-agent',
  quiz: 'hl-quiz-agent',
  challenge: 'hl-challenge-agent',
  code: 'hl-code-agent',
  svg: 'hl-svg-agent',
  gif: 'hl-gif-agent',
  infographic: 'hl-infographic-agent',
  image: 'hl-image-agent',
  audio: 'hl-audio-agent',
  gamification: 'hl-gamification-agent',
  evaluation: 'hl-evaluation-agent',
  feedback: 'hl-feedback-agent',
} as const

interface AgentDef {
  id: string
  name: string
  description: string
  systemPrompt: string
  maxIterations: number
}

const HIVELEARN_AGENTS: AgentDef[] = [
  { id: AGENT_IDS.coordinator, name: 'HiveLearnCoordinator', description: 'Coordina el enjambre educativo completo', systemPrompt: COORDINATOR_PROMPT, maxIterations: 10 },
  { id: AGENT_IDS.onboarding, name: 'OnboardingAgent', description: 'Conversación inicial adaptativa para conocer al alumno', systemPrompt: ONBOARDING_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.profile, name: 'ProfileAgent', description: 'Construye el perfil de adaptación del alumno', systemPrompt: PROFILE_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.intent, name: 'IntentAgent', description: 'Extrae tema, nivel y tono de la meta del alumno', systemPrompt: INTENT_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.structure, name: 'StructureAgent', description: 'Diseña el esqueleto completo del programa de estudio', systemPrompt: STRUCTURE_PROMPT, maxIterations: 10 },
  { id: AGENT_IDS.explanation, name: 'ExplanationAgent', description: 'Genera explicaciones de conceptos (máx 70 palabras)', systemPrompt: EXPLANATION_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.exercise, name: 'ExerciseAgent', description: 'Crea ejercicios prácticos con pistas', systemPrompt: EXERCISE_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.quiz, name: 'QuizAgent', description: 'Legacy worker de quiz; reemplazado por AssessmentAgent en el pipeline activo', systemPrompt: QUIZ_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.challenge, name: 'ChallengeAgent', description: 'Diseña retos prácticos con pasos y criterios', systemPrompt: CHALLENGE_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.code, name: 'CodeAgent', description: 'Genera bloques de código (máx 15 líneas)', systemPrompt: CODE_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.svg, name: 'SVGAgent', description: 'Legacy worker visual; reemplazado por ImageAgent en el pipeline activo', systemPrompt: SVG_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.gif, name: 'GifAgent', description: 'Legacy worker visual; reemplazado por ImageAgent en el pipeline activo', systemPrompt: GIF_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.infographic, name: 'InfographicAgent', description: 'Crea infografías con 3-5 secciones de datos clave', systemPrompt: INFOGRAPHIC_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.image, name: 'ImageAgent', description: 'Único worker visual del pipeline activo; genera apoyo visual educativo del nodo', systemPrompt: `Eres ImageAgent de HiveLearn. Usa SOLO la tool generar_imagen. Eres el único worker visual general del pipeline. Genera una imagen educativa clara y simple para el concepto indicado. Si no puedes producir bitmap real, crea una representación visual educativa equivalente y simple como fallback. Responde SOLO con una tool call.`, maxIterations: 3 },
  { id: AGENT_IDS.gamification, name: 'GamificationAgent', description: 'Asigna XP, logros y gamificación adaptada por edad', systemPrompt: GAMIFICATION_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.evaluation, name: 'AssessmentAgent', description: 'Único worker de assessment; genera quiz por nodo y evaluación final', systemPrompt: EVALUATION_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.feedback, name: 'FeedbackAgent', description: 'Feedback motivador on-demand por respuesta del alumno', systemPrompt: FEEDBACK_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.audio, name: 'AudioAgent', description: 'Genera script de narración educativa (Web Speech API)', systemPrompt: AUDIO_PROMPT, maxIterations: 3 },
]

const ACTIVE_AGENT_IDS = new Set<string>([
  AGENT_IDS.coordinator,
  AGENT_IDS.onboarding,
  AGENT_IDS.explanation,
  AGENT_IDS.exercise,
  AGENT_IDS.infographic,
  AGENT_IDS.image,
  AGENT_IDS.audio,
  AGENT_IDS.gamification,
  AGENT_IDS.evaluation,
  AGENT_IDS.feedback,
])

export function registerHiveLearnAgents(db: Database): void {
  const insertWorker = db.prepare(`
    INSERT INTO hl_agents (id, name, description, system_prompt, role, provider_id, model_id, max_iterations, tools_json, enabled)
    VALUES (?, ?, ?, ?, 'worker', ?, ?, ?, '[]', 1)
    ON CONFLICT(id) DO UPDATE SET
      name          = excluded.name,
      description   = excluded.description,
      system_prompt = excluded.system_prompt,
      max_iterations= excluded.max_iterations,
      provider_id   = COALESCE(hl_agents.provider_id, excluded.provider_id),
      model_id      = COALESCE(hl_agents.model_id, excluded.model_id),
      updated_at    = CURRENT_TIMESTAMP
  `)

  const insertCoordinator = db.prepare(`
    INSERT INTO hl_agents (id, name, description, system_prompt, role, provider_id, model_id, max_iterations, tools_json, enabled)
    VALUES (?, ?, ?, ?, 'coordinator', ?, ?, ?, '[]', 1)
    ON CONFLICT(id) DO UPDATE SET
      name          = excluded.name,
      description   = excluded.description,
      system_prompt = excluded.system_prompt,
      max_iterations= excluded.max_iterations,
      provider_id   = COALESCE(hl_agents.provider_id, excluded.provider_id),
      model_id      = COALESCE(hl_agents.model_id, excluded.model_id),
      updated_at    = CURRENT_TIMESTAMP
  `)

  const tx = db.transaction(() => {
    // Insertar coordinador
    insertCoordinator.run(
      AGENT_IDS.coordinator,
      'HiveLearnCoordinator',
      'Coordina el enjambre educativo completo',
      COORDINATOR_PROMPT,
      HIVELEARN_PROVIDER_ID,
      HIVELEARN_MODEL_ID,
      10,
    )

    // Insertar todos los workers conocidos; el pipeline activo se controla con enabled
    for (const agent of HIVELEARN_AGENTS) {
      if (agent.id === AGENT_IDS.coordinator) continue
      insertWorker.run(
        agent.id,
        agent.name,
        agent.description,
        agent.systemPrompt,
        HIVELEARN_PROVIDER_ID,
        HIVELEARN_MODEL_ID,
        agent.maxIterations,
      )
    }

    for (const agentId of Object.values(AGENT_IDS)) {
      const enabled = ACTIVE_AGENT_IDS.has(agentId) ? 1 : 0
      db.prepare(`UPDATE hl_agents SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(enabled, agentId)
    }
  })
  tx()
}

/**
 * Actualiza todos los agentes de HiveLearn con el provider_id y model_id seleccionados.
 * Esto permite que el enjambre use el provider/modelo que el usuario eligió.
 */
export function updateHiveLearnAgentsProviderModel(
  db: Database,
  providerId: string,
  modelId: string
): void {
  // Incluir los 15 agentes (coordinador + 14 workers)
  const allAgentIds = Object.values(AGENT_IDS)
  const stmt = db.prepare(`
    UPDATE hl_agents
    SET provider_id = ?, model_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${allAgentIds.map(() => '?').join(', ')})
  `)

  const tx = db.transaction(() => {
    stmt.run(providerId, modelId, ...allAgentIds)
  })
  tx()
}

export { HIVELEARN_AGENTS }
