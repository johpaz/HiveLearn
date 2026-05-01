/**
 * HiveLearn — Skill: Gestionar Programas
 * 
 * Permite al agente coordinador crear y obtener schemas de programas de aprendizaje
 */

import { getDb } from '../storage/sqlite'
import { logger } from '../utils/logger'

const log = logger.child('skill:gestionar-programas')

export interface ProgramSchema {
  id: string  // UUID del programa
  instanceId: string
  studentId?: number
  sessionId: string
  topicSlug?: string
  schemaJson: Record<string, any>  // El schema completo del programa
  totalNodos?: number
}

/**
 * Crear un nuevo programa de aprendizaje
 */
export async function crearPrograma(data: ProgramSchema): Promise<{ ok: boolean; programId: string }> {
  const db = getDb()
  
  try {
    db.query(`
      INSERT INTO hl_programs (id, instance_id, student_id, session_id, topic_slug, schema_json, total_nodos, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      data.id,
      data.instanceId,
      data.studentId || null,
      data.sessionId,
      data.topicSlug || null,
      JSON.stringify(data.schemaJson),
      data.totalNodos || null
    )
    
    log.info('[gestionar-programas] Programa creado', { 
      programId: data.id,
      sessionId: data.sessionId,
      totalNodos: data.totalNodos,
    })
    
    return { ok: true, programId: data.id }
  } catch (error) {
    log.error('[gestionar-programas] Error al crear programa', {
      error: (error as Error).message,
    })
    throw error
  }
}

/**
 * Obtener programa por UUID
 */
export async function obtenerPrograma(programId: string): Promise<ProgramSchema | null> {
  const db = getDb()
  
  try {
    const program = db.query(
      'SELECT * FROM hl_programs WHERE id = ?'
    ).get(programId) as any
    
    if (!program) {
      return null
    }
    
    return {
      id: program.id,
      instanceId: program.instance_id,
      studentId: program.student_id,
      sessionId: program.session_id,
      topicSlug: program.topic_slug,
      schemaJson: JSON.parse(program.schema_json),
      totalNodos: program.total_nodos,
    }
  } catch (error) {
    log.error('[gestionar-programas] Error al obtener programa', {
      error: (error as Error).message,
    })
    return null
  }
}

/**
 * Obtener programa por session_id
 */
export async function obtenerProgramaPorSesion(sessionId: string): Promise<ProgramSchema | null> {
  const db = getDb()
  
  try {
    const program = db.query(
      'SELECT * FROM hl_programs WHERE session_id = ?'
    ).get(sessionId) as any
    
    if (!program) {
      return null
    }
    
    return {
      id: program.id,
      instanceId: program.instance_id,
      studentId: program.student_id,
      sessionId: program.session_id,
      topicSlug: program.topic_slug,
      schemaJson: JSON.parse(program.schema_json),
      totalNodos: program.total_nodos,
    }
  } catch (error) {
    log.error('[gestionar-programas] Error al obtener programa por sesión', {
      error: (error as Error).message,
    })
    return null
  }
}

/**
 * Verificar si existe un programa para una sesión
 */
export async function existePrograma(sessionId: string): Promise<boolean> {
  const db = getDb()
  
  try {
    const result = db.query(
      'SELECT COUNT(*) as count FROM hl_programs WHERE session_id = ?'
    ).get(sessionId) as any
    
    return result.count > 0
  } catch (error) {
    log.error('[gestionar-programas] Error al verificar programa', {
      error: (error as Error).message,
    })
    return false
  }
}

/**
 * Actualizar programa existente
 */
export async function actualizarPrograma(programId: string, updates: Partial<ProgramSchema>): Promise<{ ok: boolean }> {
  const db = getDb()
  
  try {
    const fields: string[] = []
    const values: any[] = []
    
    if (updates.schemaJson !== undefined) {
      fields.push('schema_json = ?')
      values.push(JSON.stringify(updates.schemaJson))
    }
    if (updates.totalNodos !== undefined) {
      fields.push('total_nodos = ?')
      values.push(updates.totalNodos)
    }
    if (updates.topicSlug !== undefined) {
      fields.push('topic_slug = ?')
      values.push(updates.topicSlug)
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(programId)
    
    db.query(`
      UPDATE hl_programs SET ${fields.join(', ')} WHERE id = ?
    `).run(...values)
    
    log.info('[gestionar-programas] Programa actualizado', { programId })
    
    return { ok: true }
  } catch (error) {
    log.error('[gestionar-programas] Error al actualizar programa', {
      error: (error as Error).message,
    })
    throw error
  }
}

// Export como skill
export const GESTIONAR_PROGRAMAS_SKILL = {
  name: 'gestionar_programas',
  description: 'Gestiona programas de aprendizaje (crear, obtener, actualizar schemas)',
  functions: {
    crearPrograma,
    obtenerPrograma,
    obtenerProgramaPorSesion,
    existePrograma,
    actualizarPrograma,
  },
}
