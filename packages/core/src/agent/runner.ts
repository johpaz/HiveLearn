/**
 * HiveLearn Agent Runner
 *
 * Wrapper delgado que resuelve configuración de proveedor desde la DB compartida
 * y delega la ejecución multi-turno al agent-loop local.
 *
 * Sin dependencias de context-compiler, agent-bus ni lógica del enjambre principal.
 */
import { resolveProviderConfig } from './llm-client'
import { runAgentLoop } from './agent-loop'
import type { Tool } from '../types/tool'
import { getDb } from '../storage/hivedb'
import type { AgentDoc } from './registry'
import { logger } from '../utils/logger'
import { AGENT_PROMPTS } from './prompts'
import { getAgentEngine } from './sdk/bootstrap'
import { assertProviderAllowed, type RunContext } from './policy/age-policy'
import { runViaSdk, SdkEngineUnsupportedError } from './sdk/run-agent'

const log = logger.child('hl-runner')

/** Tope de iteraciones que el loop propio aplicaba a todos los agentes. */
const LEGACY_MAX_ITERATIONS = 6

export async function runHiveLearnAgent(opts: {
  agentId: string
  taskDescription: string
  systemPrompt: string
  tools: Tool[]
  threadId: string
  /** Obligatorio: sin saber quién ejecuta no se puede aplicar la política por edad. */
  runContext: RunContext
  /** Sustituye el tope de iteraciones (el predeterminado es 6, como el loop propio histórico). */
  maxIterations?: number
  validationContext?: {
    rangoEdad?: string
    tema?: string
    nodoId?: string
  }
}): Promise<string> {
  const db = getDb()

  const agentEntry = await db.collection<AgentDoc>('hl_agents').get(opts.agentId)
  const agent = agentEntry?.doc
  if (!agent) throw new Error(`HiveLearn agent not found in DB: ${opts.agentId}`)

  // agents.model_id es el nombre real de la API (ej. "gemini-3-flash-preview")
  const modelId = agent.model_id ?? 'llama3.2'
  const providerId = agent.provider_id || 'ollama'

  const providerConfig = await resolveProviderConfig(providerId, modelId)

  await assertProviderAllowed(opts.runContext, { provider: providerConfig.provider, baseUrl: providerConfig.baseUrl })

  const cleanModel = providerConfig.model.replace(new RegExp(`^${providerConfig.provider}\\/`), '')
  log.info(`[hl-runner] ${opts.agentId} → ${providerConfig.provider}/${cleanModel} tools=${opts.tools.length}`)

  const promptPatch = typeof agent.prompt_patch === 'string' && agent.prompt_patch.trim()
    ? `\n\nPATCH ACTIVO DEL COORDINADOR:\n${agent.prompt_patch.trim()}`
    : ''

  const canonicalPrompt = AGENT_PROMPTS[opts.agentId]
  const basePrompt = canonicalPrompt ?? agent.system_prompt ?? opts.systemPrompt ?? ''

  const systemPrompt = basePrompt + promptPatch
  const validationContext = opts.validationContext ? {
    agenteId: opts.agentId,
    ...opts.validationContext,
  } : undefined

  if (getAgentEngine() === 'sdk') {
    try {
      return await runViaSdk({
        agentId: opts.agentId,
        systemPrompt,
        taskDescription: opts.taskDescription,
        tools: opts.tools,
        threadId: opts.threadId,
        provider: providerConfig.provider,
        model: cleanModel,
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        numCtx: providerConfig.numCtx,
        numGpu: providerConfig.numGpu,
        // El loop propio ignoraba `max_iterations` y usaba siempre 6; se conserva ese mínimo.
        maxIterations: opts.maxIterations ?? Math.max(agent.max_iterations ?? 0, LEGACY_MAX_ITERATIONS),
        maxTokens: 2048,
        runContext: opts.runContext,
        validationContext,
      })
    } catch (error) {
      if (!(error instanceof SdkEngineUnsupportedError)) throw error
      log.info(`[hl-runner] ${error.message}; usando el loop propio`)
    }
  }

  return runAgentLoop({
    systemPrompt,
    taskDescription: opts.taskDescription,
    tools: opts.tools,
    providerConfig,
    maxTokens: 2048,
    temperature: 0.3,
    maxIterations: opts.maxIterations,
    validationContext,
  })
}
