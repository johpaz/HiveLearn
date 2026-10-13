/**
 * `runViaSdk` — ejecuta un agente de HiveLearn con el loop de @johpaz/hive-sdk.
 *
 * Mantiene el contrato de `runAgentLoop` (agent-loop.ts) para que `runHiveLearnAgent` pueda cambiar de
 * motor sin que cambien sus llamadores. Lo que el SDK no hace y este envoltorio reproduce:
 *   - tool de salida estructurada / passthrough → el resultado de la tool es el resultado final y corta el loop;
 *   - validación pedagógica tras tools `generar_*`;
 *   - con tools presentes, un texto plano es un error (`missing_tool_call` / `unexpected_text_response`),
 *     salvo un JSON plano con una sola tool, que se normaliza a una llamada sintética;
 *   - reintento único cuando el modelo contesta vacío.
 *
 * Diferencias conocidas con el loop propio (documentadas a propósito):
 *   - la temperatura no se puede fijar por llamada en el SDK;
 *   - si el modelo emite varias tool calls en un turno, el SDK las ejecuta todas (en serie, ver `Mutex`);
 *     el loop propio ejecutaba solo la primera.
 */
import type { Tool } from '../../types/tool'
import { logger } from '../../utils/logger'
import { AgentExecutionError } from '../errors'
import { validatePedagogicalContent } from '../validation/pedagogical-validation'
import { initSdkEngine } from './bootstrap'
import { resolveOracleOption } from './oracle'
import { purgeRunTraces } from './retention'
import type { RunContext } from '../policy/age-policy'
import { bindRunTools } from './tools'

const log = logger.child('hl-sdk-run')

/** Proveedores que el SDK sabe invocar. Cualquier otro (p. ej. `local-llama`) debe usar el loop propio. */
const SDK_PROVIDERS = new Set([
  'openai', 'anthropic', 'gemini', 'mistral', 'kimi', 'ollama', 'openrouter', 'deepseek', 'nvidia',
  'hiveagents', 'z-ai', 'modelscope', 'minimax', 'qwen', 'groq', 'opencode-go',
])

/** El proveedor no está soportado por el SDK: el llamador debe caer al loop propio. */
export class SdkEngineUnsupportedError extends Error {
  constructor(provider: string) {
    super(`El proveedor "${provider}" no está soportado por el motor SDK`)
    this.name = 'SdkEngineUnsupportedError'
  }
}

export function isSdkProvider(provider: string): boolean {
  return SDK_PROVIDERS.has(provider)
}

export interface SdkRunOptions {
  /** Aborta la corrida: corta el loop del SDK y no se reintenta. */
  signal?: AbortSignal
  agentId: string
  systemPrompt: string
  taskDescription: string
  tools: Tool[]
  threadId: string
  provider: string
  model: string
  apiKey?: string
  baseUrl?: string
  numCtx?: number
  numGpu?: number
  maxIterations: number
  maxTokens: number
  /** Quién ejecuta (edad, alumno): condiciona el oráculo y la política de proveedores. */
  runContext: RunContext
  /** Razonamiento del modelo para esta corrida (lo decide el oráculo por especialista). Predeterminado: apagado. */
  thinking?: boolean
  validationContext?: {
    agenteId: string
    rangoEdad?: string
    tema?: string
    nodoId?: string
  }
}

const STRUCTURED_OUTPUT_TOOL = /^(generar_|revisar_|planificar_|reparar_|actualizar_|validar_|clasificar_|definir_)/
const DEFAULT_CONTEXT_WINDOW = 32768

/** Ejecuta funciones de una en una, en orden de llegada. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn)
    this.tail = result.catch(() => undefined)
    return result
  }
}

function isPassthrough(result: unknown, params: Record<string, unknown>): boolean {
  if (typeof result !== 'object' || result === null) return false
  const r = result as Record<string, unknown>
  if (!r.ok || !('output' in r)) return false
  return JSON.stringify(r.output) === JSON.stringify(params)
}

function hasStructuredOutputResult(result: unknown): result is { ok: true; output: unknown } {
  if (typeof result !== 'object' || result === null) return false
  const candidate = result as Record<string, unknown>
  return candidate.ok === true && 'output' in candidate
}

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    if (raw[i] === '}') depth--
    if (depth === 0) return raw.slice(start, i + 1)
  }
  return null
}

/** Refleja proveedor, modelo y agente en la base del SDK. La key NO se copia: viaja como `credentials`. */
async function mirrorIntoSdkDb(opts: SdkRunOptions, sdkAgentId: string): Promise<void> {
  const storage = await import('@johpaz/hive-sdk/storage')
  const col = storage.col as unknown as (name: string) => Promise<{
    get(id: string): Promise<{ doc: Record<string, unknown>; version: number } | undefined>
    put(id: string, doc: unknown): Promise<number>
  }>

  const providers = await col('providers')
  const existingProvider = (await providers.get(opts.provider))?.doc ?? {}
  await providers.put(opts.provider, {
    ...existingProvider,
    id: opts.provider,
    name: existingProvider.name ?? opts.provider,
    base_url: opts.baseUrl ?? existingProvider.base_url ?? null,
    category: existingProvider.category ?? 'llm',
    num_ctx: opts.numCtx ?? existingProvider.num_ctx ?? null,
    num_gpu: opts.numGpu ?? existingProvider.num_gpu ?? 0,
    enabled: true,
    active: true,
    created_at: existingProvider.created_at ?? Date.now(),
  })

  const modelKey = storage.catalogModelKey(opts.provider, opts.model)
  const models = await col('models')
  const existingModel = (await models.get(modelKey))?.doc
  await models.put(modelKey, {
    ...(existingModel ?? {}),
    id: modelKey,
    provider_id: opts.provider,
    name: opts.model,
    model_type: existingModel?.model_type ?? 'llm',
    // Sin esto el SDK asume 250 000 tokens de ventana, mucho más de lo que sirve un modelo local pequeño.
    context_window: opts.numCtx ?? (existingModel?.context_window as number | undefined) ?? DEFAULT_CONTEXT_WINDOW,
    capabilities: existingModel?.capabilities ?? null,
    // 'discovered' sobrevive al re-seed de catálogo del SDK.
    source: existingModel?.source ?? 'discovered',
    enabled: true,
    active: true,
  })

  const names = JSON.stringify(opts.tools.map(tool => tool.name))
  const agents = await col('agents')
  const now = Date.now()
  await agents.put(sdkAgentId, {
    id: sdkAgentId,
    user_id: 'hivelearn',
    name: opts.agentId,
    description: null,
    system_prompt: opts.systemPrompt,
    tone: null,
    role: 'worker',
    status: 'idle',
    enabled: true,
    provider_id: storage.toIndexable(opts.provider),
    model_id: storage.toIndexable(modelKey),
    // La lista blanca recorta el loadout a EXACTAMENTE estas tools: sin search_knowledge ni nativas.
    tools_json: names,
    tool_allowlist_json: names,
    skills_json: null,
    parent_id: storage.NO_PARENT,
    max_iterations: opts.maxIterations,
    // El loop propio nunca pidió razonamiento; con "off" se evitan tokens de pensamiento y latencia.
    thinking: opts.thinking ? 'on' : 'off',
    max_output_tokens: opts.maxTokens,
    workspace: null,
    lastTraceAt: null,
    created_at: now,
    updated_at: now,
  })
}

async function removeSdkAgent(sdkAgentId: string): Promise<void> {
  try {
    const storage = await import('@johpaz/hive-sdk/storage')
    const agents = await (storage.col as unknown as (name: string) => Promise<{ delete(id: string): Promise<boolean> }>)('agents')
    await agents.delete(sdkAgentId)
  } catch (error) {
    log.warn(`No se pudo limpiar el agente efímero ${sdkAgentId}: ${(error as Error).message}`)
  }
}

interface RunState {
  /** Resultado final tomado de una tool de salida estructurada. */
  final: string | null
  /** Error que debe relanzarse al terminar el loop (no puede lanzarse dentro de la tool: el SDK lo devolvería al modelo). */
  error: Error | null
}

export async function runViaSdk(opts: SdkRunOptions): Promise<string> {
  if (!isSdkProvider(opts.provider)) throw new SdkEngineUnsupportedError(opts.provider)

  await initSdkEngine()
  const runKey = `${opts.threadId}#${crypto.randomUUID()}`
  const sdkAgentId = `hl:${opts.agentId}:${crypto.randomUUID()}`
  await mirrorIntoSdkDb(opts, sdkAgentId)

  try {
    return await executeWithRetry(opts, runKey, sdkAgentId)
  } finally {
    await removeSdkAgent(sdkAgentId)
    await purgeRunTraces(sdkAgentId)
  }
}

async function executeWithRetry(opts: SdkRunOptions, runKey: string, sdkAgentId: string): Promise<string> {
  const hasTools = opts.tools.length > 0
  const toolNames = opts.tools.map(tool => tool.name).join(', ')

  let task = opts.taskDescription
  const attempts = hasTools ? 2 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (opts.signal?.aborted) throw new AgentExecutionError('aborted', 'Corrida cancelada')
    const outcome = await runOnce(opts, task, runKey, sdkAgentId)
    if (opts.signal?.aborted && outcome.final === null) throw new AgentExecutionError('aborted', 'Corrida cancelada')
    if (outcome.error) throw outcome.error
    if (outcome.final !== null) return outcome.final

    const text = outcome.content.trim()
    if (text.startsWith('[LLM Error]')) throw new Error(outcome.content)
    if (!hasTools) return outcome.content
    // El loop propio devolvía el último texto al agotar las iteraciones, sin tratarlo como error.
    if (outcome.exhausted) return outcome.content

    if (!text) {
      if (attempt < attempts - 1) {
        task = `${opts.taskDescription}\n\n` + (opts.tools.length === 1
          ? `Tu respuesta anterior falló el function calling. Reintenta AHORA usando SOLO la tool ${opts.tools[0].name} con argumentos JSON válidos. No devuelvas texto plano.`
          : `Tu respuesta anterior quedó vacía. Continúa la tarea llamando EXACTAMENTE una de estas tools: ${toolNames}. No devuelvas texto plano. Si el alumno acaba de responder, procesa esa respuesta y llama la siguiente tool que corresponda.`)
        log.warn(`[sdk] reintento tras respuesta vacía tools=${toolNames}`)
        continue
      }
      throw new AgentExecutionError('missing_tool_call', 'Tool-enabled agent returned no tool call and no content')
    }

    throw new AgentExecutionError('unexpected_text_response', `Tool-enabled agent returned plain text instead of tool call: ${text.slice(0, 120)}`)
  }
  throw new AgentExecutionError('missing_tool_call', 'Tool-enabled agent returned no tool call and no content')
}

interface RunOutcome extends RunState {
  content: string
  exhausted: boolean
}

async function runOnce(opts: SdkRunOptions, task: string, runKey: string, sdkAgentId: string): Promise<RunOutcome> {
  const agent = await import('@johpaz/hive-sdk/agent')
  const state: RunState = { final: null, error: null }
  const controller = new AbortController()
  const mutex = new Mutex()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const finish = (value: string) => {
    state.final = value
    controller.abort()
  }

  const handleCall = (tool: Tool, args: Record<string, unknown>): Promise<string | object> => mutex.run(async () => {
    // Una vez resuelto el turno, las llamadas que quedaron en el mismo lote no se ejecutan.
    if (state.final !== null || state.error) return { ok: true, skipped: true }

    // Sin execute → la tool es un esquema de salida estructurada; los argumentos son el resultado.
    if (!tool.execute) {
      finish(JSON.stringify(args))
      return { ok: true, output: args }
    }

    const execResult = await tool.execute(args)

    if (opts.validationContext) {
      try {
        const validation = validatePedagogicalContent(args, {
          agenteId: opts.validationContext.agenteId,
          rangoEdad: opts.validationContext.rangoEdad || 'adulto',
          tema: opts.validationContext.tema || '',
          tipoContenido: tool.name,
        })
        if (!validation.aprobado) {
          log.warn(`[sdk] validación fallida en ${tool.name}: ${validation.observaciones.join(', ')}`)
          if (tool.name.startsWith('generar_')) {
            state.error = new AgentExecutionError('validation_failed', `Validation failed for ${tool.name}: ${validation.observaciones.join(', ')}`)
            controller.abort()
            return { ok: false, error: 'validation_failed' }
          }
        }
      } catch (validationError) {
        log.warn(`[sdk] error de validación en ${tool.name}: ${(validationError as Error).message}`)
      }
    }

    if (isPassthrough(execResult, args)) {
      finish(JSON.stringify(args))
      return execResult
    }

    if (hasStructuredOutputResult(execResult) && STRUCTURED_OUTPUT_TOOL.test(tool.name)) {
      finish(typeof execResult.output === 'string' ? execResult.output : JSON.stringify(execResult.output))
      return execResult
    }

    // Tool real: el resultado vuelve al modelo y el loop continúa.
    return typeof execResult === 'string' ? execResult : JSON.stringify(execResult)
  })

  const release = await bindRunTools(runKey, opts.tools, handleCall)

  let content = ''
  let iterations = 0
  try {
    const oracle = await resolveOracleOption(opts.runContext)
    if (oracle.kind) log.info(`[sdk] oráculo ${oracle.kind} activo agent=${opts.agentId}`)

    try {
    for await (const chunk of agent.runAgent({
      agentId: sdkAgentId,
      userMessage: task,
      taskContext: task,
      threadId: runKey,
      isolated: true,
      systemPromptOverride: opts.systemPrompt,
      credentials: { apiKey: opts.apiKey, baseUrl: opts.baseUrl },
      jev: oracle.option,
      signal: controller.signal,
      budget: { maxIterations: opts.maxIterations },
    })) {
      const message = chunk.agent?.messages?.[0]?.content
      if (typeof message === 'string' && message) content = message
      if (chunk.usage) {
        iterations = chunk.usage.iterations ?? iterations
        if (chunk.usage.oracle_corrections) log.info(`[sdk] el oráculo pidió ${chunk.usage.oracle_corrections} corrección(es)`)
      }
    }
    } catch (error) {
      // Con un resultado ya tomado de una tool, un fallo posterior del SDK no importa. Una respuesta vacía
      // del modelo la reporta como AgentSynthesisError: aquí equivale a "sin contenido" y decide el reintento.
      if ((error as Error).name !== 'AgentSynthesisError' && state.final === null && !state.error) throw error
    }

    // JSON plano en vez de tool call, con una sola tool: se normaliza a una llamada sintética.
    if (state.final === null && !state.error && opts.tools.length === 1 && content.trim()) {
      const args = tryExtractSingleToolArguments(content)
      if (args) {
        log.warn(`[sdk] JSON plano normalizado a llamada sintética de ${opts.tools[0].name}`)
        await handleCall(opts.tools[0], args)
      }
    }
  } finally {
    release()
  }

  return { ...state, content, exhausted: iterations >= opts.maxIterations }
}

/** Extrae el primer objeto JSON de un texto, o `null` si no hay uno válido. */
export function tryExtractSingleToolArguments(text: string): Record<string, unknown> | null {
  const candidate = extractFirstJsonObject(text.trim())
  if (!candidate) return null
  try {
    const parsed = JSON.parse(candidate)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}
