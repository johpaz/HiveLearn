/**
 * HiveLearn — Skill: Gestionar Instancia
 * 
 * Permite al agente coordinador registrar y obtener la instancia única
 */

import { getDb } from '../storage/sqlite'
import { logger } from '../utils/logger'

const log = logger.child('skill:gestionar-instancia')

export interface InstanciaData {
  instanceId: string
  providerId?: string
  modelId?: string
}

/**
 * Registrar o actualizar instancia
 */
export async function registrarInstancia(data: InstanciaData): Promise<{ ok: boolean; instanceId: string }> {
  const db = getDb()
  
  try {
    const providerId = data.providerId || 'ollama'
    const modelId = data.modelId || 'gemma4-e4b'
    
    db.query(`
      INSERT OR REPLACE INTO hl_instances (instance_id, provider_id, model_id, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(data.instanceId, providerId, modelId)
    
    log.info('[gestionar-instancia] Instancia registrada', { 
      instanceId: data.instanceId,
      providerId,
      modelId,
    })
    
    return { ok: true, instanceId: data.instanceId }
  } catch (error) {
    log.error('[gestionar-instancia] Error al registrar instancia', {
      error: (error as Error).message,
    })
    throw error
  }
}

/**
 * Obtener instancia por UUID
 */
export async function obtenerInstancia(instanceId: string): Promise<InstanciaData | null> {
  const db = getDb()
  
  try {
    const instance = db.query(
      'SELECT instance_id, provider_id, model_id FROM hl_instances WHERE instance_id = ?'
    ).get(instanceId) as any
    
    if (!instance) {
      return null
    }
    
    return {
      instanceId: instance.instance_id,
      providerId: instance.provider_id,
      modelId: instance.model_id,
    }
  } catch (error) {
    log.error('[gestionar-instancia] Error al obtener instancia', {
      error: (error as Error).message,
    })
    return null
  }
}

/**
 * Obtener configuración del coordinador para una instancia
 */
export async function obtenerConfiguracionCoordinador(instanceId?: string): Promise<{ providerId: string; modelId: string }> {
  const db = getDb()
  
  try {
    // Si no hay instanceId, usar defaults
    if (!instanceId) {
      return { providerId: 'ollama', modelId: 'gemma4-e4b' }
    }
    
    // Buscar configuración del coordinador en hl_agents
    const coordinator = db.query(
      'SELECT provider_id, model_id FROM hl_agents WHERE id = ?'
    ).get('coordinator') as any
    
    if (coordinator) {
      return {
        providerId: coordinator.provider_id,
        modelId: coordinator.model_id,
      }
    }
    
    // Fallback: buscar configuración de instancia
    const instance = await obtenerInstancia(instanceId)
    if (instance) {
      return {
        providerId: instance.providerId || 'ollama',
        modelId: instance.modelId || 'gemma4-e4b',
      }
    }
    
    // Fallback final: defaults
    return { providerId: 'ollama', modelId: 'gemma4-e4b' }
  } catch (error) {
    log.error('[gestionar-instancia] Error al obtener configuración del coordinador', {
      error: (error as Error).message,
    })
    return { providerId: 'ollama', modelId: 'gemma4-e4b' }
  }
}

// Export como skill
export const GESTIONAR_INSTANCIA_SKILL = {
  name: 'gestionar_instancia',
  description: 'Gestiona la instancia única de HiveLearn (UUID por instalación)',
  functions: {
    registrarInstancia,
    obtenerInstancia,
    obtenerConfiguracionCoordinador,
  },
}
