/**
 * HiveLearn — Tool: Crear Programa
 * 
 * Herramienta para que el agente coordinador cree un programa de aprendizaje
 */

import type { Tool } from '../../types'
import { crearPrograma, existePrograma } from '../../skills/gestionar-programas.skill'
import { logger } from '../../utils/logger'

const log = logger.child('tool:crear-programa')

export const crearProgramaTool: Tool = {
  name: 'crear_programa',
  description: 'Crea un programa de aprendizaje con schema para un alumno',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'ID único de la sesión de aprendizaje',
      },
      instanceId: {
        type: 'string',
        description: 'UUID de la instancia (instalación)',
      },
      studentId: {
        type: 'integer',
        description: 'ID del alumno (opcional, si ya existe)',
      },
      topicSlug: {
        type: 'string',
        description: 'Slug del tema educativo (ej: "javascript-basico")',
      },
      schemaJson: {
        type: 'object',
        description: 'Schema completo del programa con nodos de aprendizaje',
        properties: {
          nodos: {
            type: 'array',
            items: { type: 'object' },
          },
          totalNodos: { type: 'integer' },
        },
      },
    },
    required: ['sessionId', 'instanceId', 'schemaJson'],
  },
}

export async function crearProgramaHandler(args: {
  sessionId: string
  instanceId: string
  studentId?: number
  topicSlug?: string
  schemaJson: Record<string, any>
}): Promise<{ ok: boolean; programId?: string; error?: string }> {
  try {
    const { sessionId, instanceId, studentId, topicSlug, schemaJson } = args
    
    // Verificar si ya existe un programa para esta sesión
    const yaExiste = await existePrograma(sessionId)
    if (yaExiste) {
      log.warn('[crear-programa] Ya existe programa para esta sesión', { sessionId })
      return { 
        ok: false, 
        error: 'Ya existe un programa para esta sesión',
      }
    }
    
    // Generar UUID para el programa
    const programId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `program-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    // Calcular total de nodos
    const totalNodos = schemaJson.nodos?.length || 0
    
    // Crear programa
    const result = await crearPrograma({
      id: programId,
      instanceId,
      studentId,
      sessionId,
      topicSlug,
      schemaJson,
      totalNodos,
    })
    
    log.info('[crear-programa] Programa creado exitosamente', {
      programId,
      sessionId,
      totalNodos,
    })
    
    return { ok: true, programId }
  } catch (error) {
    log.error('[crear-programa] Error al crear programa', {
      error: (error as Error).message,
    })
    return { 
      ok: false, 
      error: (error as Error).message,
    }
  }
}
