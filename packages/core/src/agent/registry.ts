/**
 * Registro de agentes HiveLearn.
 * Los agentes del pipeline legacy (profile, intent, structure, quiz, challenge, code, svg, gif) ya no
 * existen: `registerHiveLearnAgents` borra sus filas de `hl_agents` (lista cerrada `RETIRED_AGENT_IDS`).
 *
 * Motor: @johpaz/hive-db — los agentes viven en la colección `hl_agents`.
 */
import { getDb, nowIso } from '../storage/hivedb'
import type { Collection } from '@johpaz/hive-db'
const HIVELEARN_PROVIDER_ID = 'ollama'
const HIVELEARN_MODEL_ID = 'gemma4-e4b'
import { COORDINATOR_PROMPT } from './coordinator.prompt'
import { EXPLANATION_PROMPT } from './prompts/explanation.prompt'
import { EXERCISE_PROMPT } from './prompts/exercise.prompt'
import { INFOGRAPHIC_PROMPT } from './prompts/infographic.prompt'
import { GAMIFICATION_PROMPT } from './prompts/gamification.prompt'
import { EVALUATION_PROMPT } from './prompts/evaluation.prompt'
import { FEEDBACK_PROMPT } from './prompts/feedback.prompt'
import { AUDIO_PROMPT } from './prompts/audio.prompt'
import { ONBOARDING_PROMPT } from './prompts/onboarding.prompt'
import { CURRICULUM_ARCHITECT_PROMPT } from './prompts/curriculum-architect.prompt'
import { RESEARCHER_PROMPT } from './prompts/researcher.prompt'

export const AGENT_IDS = {
  coordinator: 'hl-coordinator-agent',
  onboarding: 'hl-onboarding-agent',
  explanation: 'hl-explanation-agent',
  exercise: 'hl-exercise-agent',
  infographic: 'hl-infographic-agent',
  image: 'hl-image-agent',
  audio: 'hl-audio-agent',
  gamification: 'hl-gamification-agent',
  evaluation: 'hl-evaluation-agent',
  feedback: 'hl-feedback-agent',
  diagnostic: 'hl-diagnostic-agent',
  safety: 'hl-safety-policy-agent',
  curriculumArchitect: 'hl-curriculum-architect-agent',
  researcher: 'hl-researcher-agent',
} as const

interface AgentDef {
  id: string
  name: string
  description: string
  systemPrompt: string
  maxIterations: number
}

/** Documento de hl_agents (mismos campos que la tabla sqlite anterior) */
export interface AgentDoc {
  name: string
  description: string | null
  system_prompt: string | null
  role: string
  provider_id: string | null
  model_id: string | null
  max_iterations: number
  tools_json: string
  prompt_patch: string | null
  last_prompt_update_reason: string | null
  enabled: number
  updated_at: string
}

const HIVELEARN_AGENTS: AgentDef[] = [
  { id: AGENT_IDS.coordinator, name: 'HiveLearnCoordinator', description: 'Coordina el enjambre educativo completo', systemPrompt: COORDINATOR_PROMPT, maxIterations: 10 },
  { id: AGENT_IDS.onboarding, name: 'OnboardingAgent', description: 'Conversación inicial adaptativa para conocer al alumno', systemPrompt: ONBOARDING_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.explanation, name: 'ExplanationAgent', description: 'Genera explicaciones de conceptos (máx 70 palabras)', systemPrompt: EXPLANATION_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.exercise, name: 'ExerciseAgent', description: 'Crea ejercicios prácticos con pistas', systemPrompt: EXERCISE_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.infographic, name: 'InfographicAgent', description: 'Crea infografías con 3-5 secciones de datos clave', systemPrompt: INFOGRAPHIC_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.image, name: 'ImageAgent', description: 'Único worker visual del pipeline activo; genera apoyo visual educativo del nodo', systemPrompt: `Eres ImageAgent de HiveLearn. Usa SOLO la tool generar_imagen. Eres el único worker visual general del pipeline. Genera una imagen educativa clara y simple para el concepto indicado. Si no puedes producir bitmap real, crea una representación visual educativa equivalente y simple como fallback. Responde SOLO con una tool call.`, maxIterations: 3 },
  { id: AGENT_IDS.gamification, name: 'GamificationAgent', description: 'Asigna XP, logros y gamificación adaptada por edad', systemPrompt: GAMIFICATION_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.evaluation, name: 'AssessmentAgent', description: 'Único worker de assessment; genera quiz por nodo y evaluación final', systemPrompt: EVALUATION_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.feedback, name: 'FeedbackAgent', description: 'Feedback motivador on-demand por respuesta del alumno', systemPrompt: FEEDBACK_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.audio, name: 'AudioAgent', description: 'Genera script de narración educativa (Web Speech API)', systemPrompt: AUDIO_PROMPT, maxIterations: 3 },
  { id: AGENT_IDS.diagnostic, name: 'DiagnosticAgent', description: 'Interpreta evidencias de competencias de IA', systemPrompt: 'Clasifica evidencias de IA por competencia y nivel. No inventes resultados; devuelve JSON verificable.', maxIterations: 3 },
  { id: AGENT_IDS.curriculumArchitect, name: 'CurriculumArchitectAgent', description: 'Diseña el currículo de cualquier tema como grafo de competencias validado', systemPrompt: CURRICULUM_ARCHITECT_PROMPT, maxIterations: 6 },
  { id: AGENT_IDS.researcher, name: 'ResearcherAgent', description: 'Investiga un tema en la web y entrega un dossier de afirmaciones con fuentes', systemPrompt: RESEARCHER_PROMPT, maxIterations: 14 },
  { id: AGENT_IDS.safety, name: 'SafetyPolicyAgent', description: 'Verifica seguridad, edad, privacidad y consentimiento', systemPrompt: 'Revisa contenido educativo para edad, privacidad, sesgos y consentimiento. Señala bloqueos explícitamente.', maxIterations: 3 },
]

/** Agentes retirados del pipeline: sus documentos en `hl_agents` se eliminan al registrar. Lista cerrada. */
const RETIRED_AGENT_IDS = ['hl-profile-agent', 'hl-intent-agent', 'hl-structure-agent', 'hl-quiz-agent', 'hl-challenge-agent', 'hl-code-agent', 'hl-svg-agent', 'hl-gif-agent'] as const

const ACTIVE_AGENT_IDS = new Set<string>([
  AGENT_IDS.coordinator,
  AGENT_IDS.onboarding,
  AGENT_IDS.explanation,
  AGENT_IDS.exercise,
  AGENT_IDS.infographic,
  AGENT_IDS.image,
  AGENT_IDS.audio,
  AGENT_IDS.evaluation,
  AGENT_IDS.feedback,
  AGENT_IDS.diagnostic,
  AGENT_IDS.safety,
  AGENT_IDS.curriculumArchitect,
  AGENT_IDS.researcher,
])

function agentsCollection(): Collection<AgentDoc> {
  return getDb().collection<AgentDoc>('hl_agents')
}

export async function registerHiveLearnAgents(): Promise<void> {
  const agents = agentsCollection()
  const now = nowIso()

  for (const id of RETIRED_AGENT_IDS) {
    if (await agents.get(id)) await agents.delete(id)
  }

  // Upsert de cada agente conocido (INSERT ... ON CONFLICT DO UPDATE del schema anterior):
  // - name/description/system_prompt/max_iterations se refrescan siempre
  // - provider_id/model_id se preservan si ya existen (COALESCE del SQL anterior)
  for (const agent of HIVELEARN_AGENTS) {
    const role = agent.id === AGENT_IDS.coordinator ? 'coordinator' : 'worker'
    const existing = await agents.get(agent.id)
    await agents.put(agent.id, {
      name: agent.name,
      description: agent.description,
      system_prompt: agent.systemPrompt,
      role,
      provider_id: existing?.doc.provider_id ?? HIVELEARN_PROVIDER_ID,
      model_id: existing?.doc.model_id ?? HIVELEARN_MODEL_ID,
      max_iterations: agent.maxIterations,
      tools_json: existing?.doc.tools_json ?? '[]',
      prompt_patch: existing?.doc.prompt_patch ?? null,
      last_prompt_update_reason: existing?.doc.last_prompt_update_reason ?? null,
      enabled: ACTIVE_AGENT_IDS.has(agent.id) ? 1 : 0,
      updated_at: now,
    })
  }
}

/**
 * Actualiza todos los agentes de HiveLearn con el provider_id y model_id seleccionados.
 * Esto permite que el enjambre use el provider/modelo que el usuario eligió.
 */
export async function updateHiveLearnAgentsProviderModel(
  providerId: string,
  modelId: string
): Promise<void> {
  const agents = agentsCollection()
  const now = nowIso()

  // Incluir los 15 agentes (coordinador + 14 workers)
  for (const agentId of Object.values(AGENT_IDS)) {
    const existing = await agents.get(agentId)
    if (!existing) continue
    await agents.put(agentId, {
      ...existing.doc,
      provider_id: providerId,
      model_id: modelId,
      updated_at: now,
    })
  }
}

export { HIVELEARN_AGENTS }
