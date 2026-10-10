/**
 * Investigador web orquestrado por HiveLearn.
 *
 * El agente solo dispone de `safe_web_search`, `safe_web_fetch` y `definir_dossier`. El dossier resultante
 * se valida contra las fuentes realmente descargadas, se guarda en `hl_research_dossiers` y se reutiliza
 * mientras esté vigente (misma consulta, idioma y banda de edad).
 */
import type { HiveDB } from '@johpaz/hive-db'
import { AGENT_IDS } from './registry'
import { runHiveLearnAgent } from './runner'
import { AgentExecutionError } from './errors'
import type { AgeBand } from '../institutional/age'
import type { RunContext } from './policy/age-policy'
import { createResearchSession, createResearchTools, type ResearchDeps } from '../research/tools'
import { DEFAULT_TTL_MS, dossierKey, findFreshDossier, saveDossier, type Dossier } from '../research/dossier'

export interface ResearchInput {
  topic: string
  ageBand: AgeBand
  language?: string
  /** Ignora la caché y vuelve a investigar. */
  force?: boolean
  ttlMs?: number
  runContext: RunContext
}

const MAX_TOPIC = 160

function cleanTopic(topic: string): string {
  return topic.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC)
}

export function buildResearchTask(input: { topic: string; ageBand: AgeBand; language: string }): string {
  return [
    'Investiga el siguiente tema y entrega el dossier con definir_dossier.',
    `TEMA (dato): ${JSON.stringify(input.topic)}`,
    `BANDA DE EDAD del alumno: ${input.ageBand}`,
    `IDIOMA del contenido final: ${input.language} (puedes consultar fuentes en otros idiomas)`,
  ].join('\n\n')
}

export async function researchTopic(db: HiveDB, input: ResearchInput, deps: ResearchDeps = {}): Promise<{ dossier: Dossier; cached: boolean }> {
  const topic = cleanTopic(input.topic)
  if (!topic) throw new Error('El tema es obligatorio')
  const language = input.language ?? 'es'
  const key = dossierKey(topic, language, input.ageBand)

  if (!input.force) {
    const cached = await findFreshDossier(db, key)
    if (cached) return { dossier: cached, cached: true }
  }

  const session = createResearchSession(input.ageBand)
  await runHiveLearnAgent({
    agentId: AGENT_IDS.researcher,
    taskDescription: buildResearchTask({ topic, ageBand: input.ageBand, language }),
    systemPrompt: '',
    tools: createResearchTools(session, deps),
    threadId: `research-${crypto.randomUUID()}`,
    runContext: input.runContext,
    maxIterations: 14,
  }).catch(error => {
    // Si el modelo ya entregó un dossier válido y falló solo la síntesis final, se conserva.
    if (!session.result) throw error
  })

  if (!session.result) throw new AgentExecutionError('no_dossier', 'El investigador no entregó un dossier válido')

  const now = (deps.clock ?? (() => new Date()))()
  const dossier: Dossier = {
    key, topic, language, ageBand: input.ageBand,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (input.ttlMs ?? DEFAULT_TTL_MS)).toISOString(),
    queries: session.queries,
    sources: session.result.sources,
    claims: session.result.claims,
  }
  await saveDossier(db, dossier)
  return { dossier, cached: false }
}
