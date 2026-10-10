/**
 * runHiveLearnConversation — Invoca un agente HL con historial de conversación completo.
 *
 * A diferencia de runHiveLearnAgent (single-turn), esta función acepta un array
 * de mensajes previos y permite conversaciones multi-turno.
 * Ideal para el chat de onboarding donde el agente necesita ver toda la conversación.
 */
import { resolveProviderConfig, callLLM } from './llm-client'
import type { LLMMessage, LLMToolDef, LLMToolCall } from './llm-client'
import { getDb } from '../storage/hivedb'
import type { AgentDoc } from './registry'
import { logger } from '../utils/logger'
import { assertProviderAllowed, runContextForAge, type RunContext } from './policy/age-policy'

export type { LLMMessage }

export interface ConversationTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ConversationResult {
  content: string
  toolCall?: { name: string; args: Record<string, unknown>; id: string }
}

const log = logger.child('hl-conversation')

export async function runHiveLearnConversation(opts: {
  agentId: string
  messages: LLMMessage[]
  tools?: ConversationTool[]
  maxTokens?: number
  temperature?: number
  /**
   * Quién habla: condiciona qué proveedores se pueden usar (política por edad/institución). Sin indicar se
   * asume la banda más restrictiva; las herramientas de sistema sin alumno deben indicarlo explícitamente.
   */
  runContext?: RunContext
}): Promise<ConversationResult> {
  const db = getDb()
  const agentEntry = await db.collection<AgentDoc>('hl_agents').get(opts.agentId)
  const agent = agentEntry?.doc
  if (!agent) throw new Error(`HiveLearn agent not found: ${opts.agentId}`)

  const providerConfig = await resolveProviderConfig(
    agent.provider_id ?? 'ollama',
    agent.model_id ?? 'gemma4-e4b',
  )

  await assertProviderAllowed(opts.runContext ?? runContextForAge(null), { provider: providerConfig.provider, baseUrl: providerConfig.baseUrl })

  const toolDefs: LLMToolDef[] = (opts.tools ?? []).map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  // Construir array completo: system prompt del agente + historial de turno
  const systemMsg: LLMMessage = { role: 'system', content: agent.system_prompt ?? '' }
  const fullMessages: LLMMessage[] = [systemMsg, ...opts.messages]

  log.info(`[hl-conversation] ${opts.agentId} → ${providerConfig.provider}/${providerConfig.model} msgs=${fullMessages.length}`)

  const response = await callLLM({
    providerId: providerConfig.provider || 'ollama',
    modelId: providerConfig.model || 'gemma4-e4b',
    messages: fullMessages,
    tools: toolDefs.length > 0 ? toolDefs : undefined,
    maxTokens: opts.maxTokens ?? 400,
    temperature: opts.temperature ?? 0.7,
  })

  const toolCall = response.tool_calls?.[0]
  if (toolCall) {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(toolCall.function.arguments) } catch {}
    return { content: response.content ?? '', toolCall: { name: toolCall.function.name, args, id: toolCall.id } }
  }

  return { content: response.content ?? '' }
}
