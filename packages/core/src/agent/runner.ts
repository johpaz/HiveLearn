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
import { constitutionFor } from './policy/constitution'
import { runViaSdk, SdkEngineUnsupportedError } from './sdk/run-agent'
import { fallbackFor, isAvailabilityError, isModelDown, markModelDown } from './fallback'

const log = logger.child('hl-runner')

/** Tope de tokens de salida histórico de todos los agentes. */
const DEFAULT_MAX_TOKENS = (() => {
  const raw = Number(process.env.HIVELEARN_MAX_OUTPUT_TOKENS)
  return Number.isInteger(raw) && raw >= 512 ? raw : 2048
})()

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
  /**
   * Tope de tokens de salida (2048 por defecto). Con modelos que razonan (Gemini 3.x, Qwen), el razonamiento consume
   * este mismo presupuesto: un entregable largo (currículo, plan) necesita más o el modelo termina sin tool call.
   */
  maxTokens?: number
  /** Razonamiento del modelo en esta corrida (decidido por el oráculo por especialista). */
  thinking?: boolean
  /** Aborta la corrida (tiempo agotado del trabajo o ronda cancelada). */
  signal?: AbortSignal
  validationContext?: {
    rangoEdad?: string
    tema?: string
    nodoId?: string
  }
}): Promise<string> {
  const agentEntry = await getDb().collection<AgentDoc>('hl_agents').get(opts.agentId)
  const agent = agentEntry?.doc
  if (!agent) throw new Error(`HiveLearn agent not found in DB: ${opts.agentId}`)

  // agents.model_id es el nombre real de la API (ej. "gemini-3-flash-preview")
  const primary = { providerId: agent.provider_id || 'ollama', modelId: agent.model_id ?? 'llama3.2' }
  const fallback = await fallbackFor(primary)

  // Se cuentan las tools ejecutadas: con efectos ya producidos no se cambia de modelo ni se repite la corrida.
  let toolsExecuted = 0
  const tools = opts.tools.map(tool => tool.execute
    ? { ...tool, execute: (async (...args: Parameters<NonNullable<Tool['execute']>>) => { toolsExecuted++; return tool.execute!(...args) }) as Tool['execute'] }
    : tool)
  const run = (target: { providerId: string; modelId: string }) => runWithModel({ ...opts, tools }, agent, target)

  if (fallback && isModelDown(primary.providerId, primary.modelId)) {
    log.warn(`[hl-runner] ${primary.providerId}/${primary.modelId} marcado caído; usando respaldo ${fallback.providerId}/${fallback.modelId}`)
    return run(fallback)
  }
  try {
    return await run(primary)
  } catch (error) {
    if (!fallback || toolsExecuted > 0 || !isAvailabilityError(error)) throw error
    markModelDown(primary.providerId, primary.modelId)
    log.warn(`[hl-runner] ${opts.agentId}: ${primary.providerId}/${primary.modelId} no disponible (${(error as Error).message.slice(0, 120)}); respaldo ${fallback.providerId}/${fallback.modelId}`)
    return run(fallback)
  }
}

async function runWithModel(
  opts: Parameters<typeof runHiveLearnAgent>[0],
  agent: AgentDoc,
  target: { providerId: string; modelId: string },
): Promise<string> {
  const modelId = target.modelId
  const providerId = target.providerId
  const db = getDb()

  const providerConfig = await resolveProviderConfig(providerId, modelId)

  await assertProviderAllowed(opts.runContext, { provider: providerConfig.provider, baseUrl: providerConfig.baseUrl })

  const cleanModel = providerConfig.model.replace(new RegExp(`^${providerConfig.provider}\\/`), '')
  log.info(`[hl-runner] ${opts.agentId} → ${providerConfig.provider}/${cleanModel} tools=${opts.tools.length}`)

  const promptPatch = typeof agent.prompt_patch === 'string' && agent.prompt_patch.trim()
    ? `\n\nPATCH ACTIVO DEL COORDINADOR:\n${agent.prompt_patch.trim()}`
    : ''

  const canonicalPrompt = AGENT_PROMPTS[opts.agentId]
  const basePrompt = canonicalPrompt ?? agent.system_prompt ?? opts.systemPrompt ?? ''

  // La constitución va primero: el SDK no la inyecta cuando se le pasa un prompt propio (systemPromptOverride).
  const systemPrompt = `${constitutionFor(opts.runContext.ageBand)}\n\n${basePrompt}${promptPatch}`
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
        maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        runContext: opts.runContext,
        thinking: opts.thinking,
        signal: opts.signal,
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
    maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0.3,
    maxIterations: opts.maxIterations,
    thinking: opts.thinking,
    signal: opts.signal,
    validationContext,
  })
}
