/**
 * HiveLearnExecutor — puente entre DAGScheduler y runHiveLearnAgent.
 * Guarda el output de cada agente en hl_session_agent_outputs para trazabilidad.
 */
import type { TaskNode } from './scheduler/dag'
import { runHiveLearnAgent } from './runner'
import { AGENT_PROMPTS } from './prompts'
import { LessonPersistence } from '../storage/LessonPersistence'

const DEFAULT_PROMPT = 'Eres un agente educativo de HiveLearn. Responde en JSON estructurado.'

/** Extrae contexto de validación del taskDescription */
function extractValidationContext(taskDesc: string): {
  rangoEdad?: string
  tema?: string
} {
  const rangoEdadMatch = taskDesc.match(/Rango edad:\s*(\S+)/)
  const rangoEdad = rangoEdadMatch ? rangoEdadMatch[1].replace('.', '') : undefined
  const metaMatch = taskDesc.match(/Meta:\s*"([^"]+)"/) || taskDesc.match(/Tema:\s*"([^"]+)"/)
  const tema = metaMatch ? metaMatch[1] : undefined

  return {
    rangoEdad,
    tema,
  }
}

export class HiveLearnExecutor {
  private persistence: LessonPersistence

  constructor() {
    this.persistence = new LessonPersistence()
  }

  async execute(
    node: TaskNode,
    depResults: Record<string, string>,
    threadId: string
  ): Promise<string> {
    const hasDeps = Object.keys(depResults).length > 0
    const contextBlock = hasDeps
      ? `\n\n---\nResultados de agentes anteriores:\n${JSON.stringify(depResults, null, 2)}\n---`
      : ''

    const systemPrompt = AGENT_PROMPTS[node.agentId] ?? DEFAULT_PROMPT
    const { AGENT_EXECUTABLE_TOOLS } = await import('./tool-map')
    const tools = AGENT_EXECUTABLE_TOOLS[node.agentId] ?? []

    const t0 = Date.now()
    let output = ''
    let status: 'ok' | 'failed' = 'ok'

    try {
      // Extraer contexto de validación del taskDescription
      const validationContext = extractValidationContext(node.taskDescription)

      output = await runHiveLearnAgent({
        agentId: node.agentId,
        taskDescription: node.taskDescription + contextBlock,
        systemPrompt,
        tools,
        threadId,
        validationContext,
      })
    } catch (err) {
      status = 'failed'
      output = JSON.stringify({ error: (err as Error).message })
      throw err
    } finally {
      const durationMs = Date.now() - t0
      this.persistence.saveAgentOutput(threadId, node.agentId, node.id, output, durationMs, status)
    }

    return output
  }
}
