/**
 * HiveLearn — Tool: Verificar Programa
 * 
 * Herramienta para que el agente coordinador verifique si existe un programa
 */

import type { Tool } from '../../types'
import { obtenerProgramaPorSesion, existePrograma } from '../../skills/gestionar-programas.skill'
import { logger } from '../../utils/logger'

const log = logger.child('tool:verificar-programa')

export const verificarProgramaTool: Tool = {
  name: 'verificar_programa',
  description: 'Verifica si existe un programa de aprendizaje para una sesión',
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'ID único de la sesión de aprendizaje',
      },
    },
    required: ['sessionId'],
  },
}

export async function verificarProgramaHandler(args: {
  sessionId: string
}): Promise<{ 
  ok: boolean
  exists?: boolean
  program?: {
    id: string
    totalNodos: number
    topicSlug?: string
  }
  error?: string 
}> {
  try {
    const { sessionId } = args
    
    // Verificar existencia
    const exists = await existePrograma(sessionId)
    
    if (!exists) {
      log.info('[verificar-programa] No existe programa para esta sesión', { sessionId })
      return { ok: true, exists: false }
    }
    
    // Obtener detalles del programa
    const program = await obtenerProgramaPorSesion(sessionId)
    
    if (!program) {
      return { ok: false, error: 'Programa no encontrado' }
    }
    
    log.info('[verificar-programa] Programa encontrado', {
      programId: program.id,
      totalNodos: program.totalNodos,
    })
    
    return { 
      ok: true, 
      exists: true,
      program: {
        id: program.id,
        totalNodos: program.totalNodos || 0,
        topicSlug: program.topicSlug || undefined,
      },
    }
  } catch (error) {
    log.error('[verificar-programa] Error al verificar programa', {
      error: (error as Error).message,
    })
    return { 
      ok: false, 
      error: (error as Error).message,
    }
  }
}
