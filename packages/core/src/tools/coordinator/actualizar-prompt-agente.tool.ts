import type { Tool } from '../../types/tool'
import { LessonPersistence } from '../../storage/LessonPersistence'
import { hlSwarmEmitter } from '../../events/swarm-events'

export const actualizarPromptAgenteTool: Tool = {
  name: 'actualizar_prompt_agente',
  description: 'Actualiza el patch activo del prompt de un worker que falló. Solo aplica a agentes worker de HiveLearn.',
  parameters: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session ID actual' },
      agent_id: { type: 'string', description: 'ID del worker cuyo prompt debe actualizarse' },
      patch_text: { type: 'string', description: 'Patch concreto que debe añadirse al prompt del worker' },
      reason: { type: 'string', description: 'Razón breve del ajuste de prompt' },
      failure_type: { type: 'string', description: 'Tipo de fallo detectado: validation_failed|plain_text|malformed_function_call|other' },
    },
    required: ['session_id', 'agent_id', 'patch_text', 'reason'],
  },
  execute: async (params) => {
    const persistence = new LessonPersistence()
    persistence.updateAgentPromptPatch(
      String(params.session_id),
      String(params.agent_id),
      String(params.patch_text),
      String(params.reason),
      params.failure_type ? String(params.failure_type) : null,
    )

    hlSwarmEmitter.emit('coordinator:phase_changed', {
      sessionId: String(params.session_id),
      status: 'assembling',
      phase: 'prompt_patch',
      label: `Coordinador actualizó el prompt de ${String(params.agent_id)}`,
      summary: String(params.reason),
      agentId: String(params.agent_id),
      timestamp: Date.now(),
    })

    return {
      ok: true,
      output: {
        updated: true,
        agentId: String(params.agent_id),
        reason: String(params.reason),
      },
    }
  },
}
