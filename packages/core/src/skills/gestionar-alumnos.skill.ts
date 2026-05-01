/**
 * HiveLearn — Skill: Gestionar Alumnos
 * 
 * Permite al agente coordinador crear y actualizar perfiles de alumnos
 */

import { getDb } from '../storage/sqlite'
import { logger } from '../utils/logger'

const log = logger.child('skill:gestionar-alumnos')

export interface StudentProfile {
  id?: number
  alumnoId: string  // UUID único del alumno
  nombre: string
  nickname: string
  avatar: string
  edad: number
  estado?: 'onboarding' | 'activo' | 'inactivo'
  sesionesTotal?: number
  xpAcumulado?: number
}

/**
 * Crear un nuevo alumno
 */
export async function crearAlumno(perfil: StudentProfile): Promise<{ ok: boolean; alumnoId: string }> {
  const db = getDb()
  
  try {
    db.query(`
      INSERT INTO hl_student_profiles (alumno_id, nombre, nickname, apodo, avatar, edad, estado, sesiones_total, xp_acumulado, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      perfil.alumnoId,
      perfil.nombre,
      perfil.nickname,
      perfil.nickname,
      perfil.avatar,
      perfil.edad,
      perfil.estado || 'onboarding',
      perfil.sesionesTotal || 0,
      perfil.xpAcumulado || 0
    )
    
    log.info('[gestionar-alumnos] Alumno creado', { 
      alumnoId: perfil.alumnoId,
      nombre: perfil.nombre,
      nickname: perfil.nickname,
      edad: perfil.edad,
    })
    
    return { ok: true, alumnoId: perfil.alumnoId }
  } catch (error) {
    log.error('[gestionar-alumnos] Error al crear alumno', {
      error: (error as Error).message,
    })
    throw error
  }
}

/**
 * Obtener alumno por UUID
 */
export async function obtenerAlumno(alumnoId: string): Promise<StudentProfile | null> {
  const db = getDb()
  
  try {
    const student = db.query(
      'SELECT * FROM hl_student_profiles WHERE alumno_id = ?'
    ).get(alumnoId) as any
    
    if (!student) {
      return null
    }
    
    return {
      id: student.id,
      alumnoId: student.alumno_id,
      nombre: student.nombre,
      nickname: student.nickname || student.apodo,
      avatar: student.avatar,
      edad: student.edad,
      estado: student.estado,
      sesionesTotal: student.sesiones_total,
      xpAcumulado: student.xp_acumulado,
    }
  } catch (error) {
    log.error('[gestionar-alumnos] Error al obtener alumno', {
      error: (error as Error).message,
    })
    return null
  }
}

/**
 * Actualizar alumno existente
 */
export async function actualizarAlumno(alumnoId: string, updates: Partial<StudentProfile>): Promise<{ ok: boolean }> {
  const db = getDb()
  
  try {
    const fields: string[] = []
    const values: any[] = []
    
    if (updates.nombre !== undefined) {
      fields.push('nombre = ?')
      values.push(updates.nombre)
    }
    if (updates.nickname !== undefined) {
      fields.push('nickname = ?')
      values.push(updates.nickname)
    }
    if (updates.avatar !== undefined) {
      fields.push('avatar = ?')
      values.push(updates.avatar)
    }
    if (updates.edad !== undefined) {
      fields.push('edad = ?')
      values.push(updates.edad)
    }
    if (updates.estado !== undefined) {
      fields.push('estado = ?')
      values.push(updates.estado)
    }
    if (updates.sesionesTotal !== undefined) {
      fields.push('sesiones_total = ?')
      values.push(updates.sesionesTotal)
    }
    if (updates.xpAcumulado !== undefined) {
      fields.push('xp_acumulado = ?')
      values.push(updates.xpAcumulado)
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(alumnoId)
    
    db.query(`
      UPDATE hl_student_profiles SET ${fields.join(', ')} WHERE alumno_id = ?
    `).run(...values)
    
    log.info('[gestionar-alumnos] Alumno actualizado', { alumnoId })
    
    return { ok: true }
  } catch (error) {
    log.error('[gestionar-alumnos] Error al actualizar alumno', {
      error: (error as Error).message,
    })
    throw error
  }
}

/**
 * Obtener o crear alumno (upsert)
 */
export async function obtenerOCrearAlumno(alumnoId: string, defaults: Partial<StudentProfile>): Promise<StudentProfile> {
  const existing = await obtenerAlumno(alumnoId)
  
  if (existing) {
    return existing
  }
  
  // Crear con defaults
  const perfil: StudentProfile = {
    alumnoId,
    nombre: defaults.nombre || 'Estudiante',
    nickname: defaults.nickname || 'Estudiante',
    avatar: defaults.avatar || 'default',
    edad: defaults.edad || 18,
    estado: 'onboarding',
    sesionesTotal: 0,
    xpAcumulado: 0,
  }
  
  await crearAlumno(perfil)
  return perfil
}

// Export como skill
export const GESTIONAR_ALUMNOS_SKILL = {
  name: 'gestionar_alumnos',
  description: 'Gestiona perfiles de alumnos (crear, obtener, actualizar)',
  functions: {
    crearAlumno,
    obtenerAlumno,
    actualizarAlumno,
    obtenerOCrearAlumno,
  },
}
