/**
 * LessonPersistence — Persistencia de lecciones HiveLearn en SQLite
 *
 * Guarda el ciclo completo de vida de una lección:
 * 1. Perfil del alumno → hl_student_profiles
 * 2. Curriculum generado → hl_curricula
 * 3. Sesión de aprendizaje → hl_sessions
 * 4. Métricas de la sesión → hl_session_metrics
 * 5. Efectividad por nodo → hl_node_effectiveness
 */
import type { Database } from 'bun:sqlite'
import { getDb } from './sqlite'
import type { StudentProfile, LessonProgram, NodoLesson, GamificacionOutput, EvaluacionOutput } from '../types'

export interface SessionData {
  sessionId: string
  alumnoId: string
  curriculoId: number
  xpTotal: number
  nivelAlcanzado: string
  logrosJson: string
  nodosCompletados: number
  evaluacionPuntaje: number | null
  completada: boolean
}

export interface SessionRow {
  session_id: string
  alumno_id: string
  curriculo_id: number
  xp_total: number
  nivel_alcanzado: string
  logros_json: string
  nodos_completados: number
  evaluacion_puntaje: number | null
  completada: number
  meta: string
  nombre: string
  nickname: string
  total_nodos: number
  rango_edad: string
  created_at: string
}

export interface SessionMetrics {
  sessionId: string
  alumnoId: string
  curriculoId: number
  tema: string
  duracionRealSeg: number
  nodosTotal: number
  nodosCompletados: number
  puntajeEvaluacion: number | null
  intentosPorNodo: string
  nodosDominados: string
  nodosDificiles: string
  logrosDesbloqueados: string
  xpGanado: number
  completada: boolean
}

export interface NodeEffectiveness {
  id: string
  nodoContentHash: string
  agenteTipo: string
  tema: string
  tipoPedagogico: string
  tipoVisual: string
  rangoEdad: string
  intentosPromedio: number
  tasaAbandono: number
  tiempoPromedio: number
  vecesVisto: number
  vecesCompletado: number
}

export class LessonPersistence {
  private db: Database

  constructor() {
    this.db = getDb()
  }

  // ─── Config Check ───────────────────────────────────────────────────

  /** Verifica si los agentes de HiveLearn ya tienen provider/model configurados */
  getHiveLearnProviderModel(): { providerId: string; modelId: string } | null {
    const row = this.db.query(`
      SELECT provider_id, model_id FROM hl_agents WHERE id = ? LIMIT 1
    `).get('hl-profile-agent') as { provider_id: string; model_id: string } | undefined

    if (row?.provider_id && row?.model_id) {
      return { providerId: row.provider_id, modelId: row.model_id }
    }
    return null
  }

  // ─── Student Profiles ───────────────────────────────────────────────

  saveStudentProfile(profile: StudentProfile): void {
    this.db.query(`
      INSERT OR REPLACE INTO hl_student_profiles
        (alumno_id, nombre, nickname, apodo, avatar, edad, estado, sesiones_total, xp_acumulado, created_at, ultimo_acceso, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT sesiones_total FROM hl_student_profiles WHERE alumno_id = ?), 0), COALESCE((SELECT xp_acumulado FROM hl_student_profiles WHERE alumno_id = ?), 0), COALESCE((SELECT created_at FROM hl_student_profiles WHERE alumno_id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      profile.alumnoId,
      profile.nombre,
      profile.nickname,
      profile.nickname,
      profile.avatar,
      profile.edad,
      profile.estado,
      profile.alumnoId,
      profile.alumnoId,
      profile.alumnoId,
    )
  }

  getStudentProfile(alumnoId: string): StudentProfile | null {
    const row = this.db.query('SELECT * FROM hl_student_profiles WHERE alumno_id = ?').get(alumnoId) as Record<string, any> | undefined
    if (!row) return null
    return {
      alumnoId: row.alumno_id,
      nombre: row.nombre,
      nickname: row.nickname || row.apodo,
      avatar: row.avatar,
      edad: row.edad,
      estado: row.estado,
      sesionesTotal: row.sesiones_total,
      xpAcumulado: row.xp_acumulado,
      creadoEn: row.created_at,
      ultimoAcceso: row.ultimo_acceso,
    }
  }

  // ─── Curriculum ─────────────────────────────────────────────────────

  saveCurriculum(sessionId: string, meta: string, nodosJson: string, totalNodos: number, rangoEdad: string, topicSlug: string | null): number {
    const result = this.db.query(`
      INSERT OR REPLACE INTO hl_curricula
        (session_id, topic_slug, meta_alumno, nodos_json, total_nodos, rango_edad)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, topicSlug, meta, nodosJson, totalNodos, rangoEdad)

    return Number(result.lastInsertRowid)
  }

  getCurriculumBySessionId(sessionId: string): { id: number; nodos_json: string; topic_slug: string | null } | null {
    return this.db.query(
      'SELECT id, nodos_json, topic_slug FROM hl_curricula WHERE session_id = ?'
    ).get(sessionId) as { id: number; nodos_json: string; topic_slug: string | null } | null
  }

  // ─── Sessions ───────────────────────────────────────────────────────

  createSession(sessionId: string, alumnoId: string, curriculoId: number, rangoEdad: string): void {
    this.db.query(`
      INSERT OR IGNORE INTO hl_sessions
        (session_id, alumno_id, curriculo_id, xp_total, nivel_alcanzado, logros_json, nodos_completados, evaluacion_puntaje, completada)
      VALUES (?, ?, ?, 0, 'Aprendiz', '[]', 0, NULL, 0)
    `).run(sessionId, alumnoId, curriculoId)
  }

  /** Crea sesión temprana (durante onboarding, sin currículo aún) */
  createEarlySession(sessionId: string, alumnoId: string): void {
    this.db.query(`
      INSERT OR IGNORE INTO hl_sessions
        (session_id, alumno_id, curriculo_id, xp_total, nivel_alcanzado, logros_json, nodos_completados, evaluacion_puntaje, completada)
      VALUES (?, ?, NULL, 0, 'Aprendiz', '[]', 0, NULL, 0)
    `).run(sessionId, alumnoId)
  }

  updateSessionProgress(sessionId: string, nodosCompletados: number, xpTotal: number): void {
    this.db.query(`
      UPDATE hl_sessions
      SET nodos_completados = ?, xp_total = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ?
    `).run(nodosCompletados, xpTotal, sessionId)
  }

  completeSession(sessionId: string, xpTotal: number, nivelAlcanzado: string, logrosJson: string, evaluacionPuntaje: number | null): void {
    this.db.query(`
      UPDATE hl_sessions
      SET xp_total = ?, nivel_alcanzado = ?, logros_json = ?, evaluacion_puntaje = ?, completada = 1, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ?
    `).run(xpTotal, nivelAlcanzado, logrosJson, evaluacionPuntaje, sessionId)

    // Actualizar perfil del alumno
    this.db.query(`
      UPDATE hl_student_profiles
      SET xp_acumulado = xp_acumulado + ?, sesiones_total = sesiones_total + 1, nivel_actual = ?, updated_at = CURRENT_TIMESTAMP
      WHERE alumno_id = (SELECT alumno_id FROM hl_sessions WHERE session_id = ?)
    `).run(xpTotal, nivelAlcanzado, sessionId)
  }

  getSession(sessionId: string): SessionData | null {
    const row = this.db.query(
      'SELECT * FROM hl_sessions WHERE session_id = ?'
    ).get(sessionId) as Record<string, any> | undefined
    if (!row) return null
    return {
      sessionId: row.session_id,
      alumnoId: row.alumno_id,
      curriculoId: row.curriculo_id,
      xpTotal: row.xp_total,
      nivelAlcanzado: row.nivel_alcanzado,
      logrosJson: row.logros_json,
      nodosCompletados: row.nodos_completados,
      evaluacionPuntaje: row.evaluacion_puntaje,
      completada: !!row.completada,
    }
  }

  getActiveSession(alumnoId: string): SessionData | null {
    const row = this.db.query(
      `SELECT * FROM hl_sessions WHERE alumno_id = ? AND completada = 0 ORDER BY created_at DESC LIMIT 1`
    ).get(alumnoId) as Record<string, any> | undefined
    if (!row) return null
    return {
      sessionId: row.session_id,
      alumnoId: row.alumno_id,
      curriculoId: row.curriculo_id,
      xpTotal: row.xp_total,
      nivelAlcanzado: row.nivel_alcanzado,
      logrosJson: row.logros_json,
      nodosCompletados: row.nodos_completados,
      evaluacionPuntaje: row.evaluacion_puntaje,
      completada: !!row.completada,
    }
  }

  // ─── Session Metrics ────────────────────────────────────────────────

  saveSessionMetrics(metrics: SessionMetrics): void {
    this.db.query(`
      INSERT OR REPLACE INTO hl_session_metrics
        (session_id, alumno_id, curriculo_id, tema, duracion_real_seg, nodos_total, nodos_completados, puntaje_evaluacion, intentos_por_nodo, nodos_dominados, nodos_dificiles, logros_desbloqueados, xp_ganado, completada)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      metrics.sessionId,
      metrics.alumnoId,
      metrics.curriculoId,
      metrics.tema,
      metrics.duracionRealSeg,
      metrics.nodosTotal,
      metrics.nodosCompletados,
      metrics.puntajeEvaluacion,
      metrics.intentosPorNodo,
      metrics.nodosDominados,
      metrics.nodosDificiles,
      metrics.logrosDesbloqueados,
      metrics.xpGanado,
      metrics.completada ? 1 : 0,
    )
  }

  // ─── Node Effectiveness ─────────────────────────────────────────────

  trackNodeInteraction(nodoId: string, agenteTipo: string, tema: string, tipoPedagogico: string, tipoVisual: string, rangoEdad: string, completado: boolean, tiempoSeg: number): void {
    // Generar hash del contenido como ID
    const contentHash = `${nodoId}-${agenteTipo}`

    const existing = this.db.query(
      'SELECT veces_visto, veces_completado FROM hl_node_effectiveness WHERE id = ?'
    ).get(contentHash) as { veces_visto: number; veces_completado: number } | undefined

    if (existing) {
      this.db.query(`
        UPDATE hl_node_effectiveness
        SET veces_visto = veces_visto + 1,
            veces_completado = veces_completado + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(completado ? 1 : 0, contentHash)
    } else {
      this.db.query(`
        INSERT OR REPLACE INTO hl_node_effectiveness
          (id, nodo_content_hash, agente_tipo, tema, tipo_pedagogico, tipo_visual, rango_edad, intentos_promedio, tasa_abandono, tiempo_promedio, veces_visto, veces_completado)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?)
      `).run(contentHash, contentHash, agenteTipo, tema, tipoPedagogico, tipoVisual, rangoEdad, completado ? 0 : 1, tiempoSeg, completado ? 1 : 0)
    }
  }

  // ─── Agent Output Traceability ─────────────────────────────────────

  saveAgentOutput(sessionId: string, agentId: string, taskId: string, outputJson: string, durationMs: number, status: 'ok' | 'failed' = 'ok'): void {
    try {
      this.db.query(`
        INSERT INTO hl_session_agent_outputs (session_id, agent_id, task_id, output_json, duration_ms, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, agentId, taskId, outputJson, durationMs, status)
    } catch {
      // Non-critical — never block the pipeline
    }
  }

  getAgentOutputs(sessionId: string): Array<{ agent_id: string; task_id: string; output_json: string; duration_ms: number; status: string }> {
    return this.db.query(
      'SELECT agent_id, task_id, output_json, duration_ms, status FROM hl_session_agent_outputs WHERE session_id = ? ORDER BY id ASC'
    ).all(sessionId) as any[]
  }

  // ─── Student Responses ──────────────────────────────────────────────

  saveStudentResponse(sessionId: string, nodeId: string, tipoPedagogico: string, respuesta: string, feedbackJson: string, xpAwarded: number, esCorrecto: boolean): void {
    // Calculate attempt number
    const prev = this.db.query(
      'SELECT COUNT(*) as cnt FROM hl_student_responses WHERE session_id = ? AND node_id = ?'
    ).get(sessionId, nodeId) as { cnt: number }

    this.db.query(`
      INSERT INTO hl_student_responses (session_id, node_id, attempt_num, tipo_pedagogico, respuesta_texto, feedback_json, xp_awarded, es_correcto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, nodeId, (prev?.cnt ?? 0) + 1, tipoPedagogico, respuesta, feedbackJson, xpAwarded, esCorrecto ? 1 : 0)

    // Update node effectiveness
    this.updateNodeEffectiveness(nodeId, tipoPedagogico, esCorrecto)
  }

  updateNodeEffectiveness(nodeId: string, tipoPedagogico: string, esCorrecto: boolean): void {
    const existing = this.db.query(
      'SELECT veces_visto, veces_completado FROM hl_node_effectiveness WHERE id = ?'
    ).get(nodeId) as { veces_visto: number; veces_completado: number } | undefined

    if (existing) {
      this.db.query(`
        UPDATE hl_node_effectiveness
        SET veces_visto = veces_visto + 1,
            veces_completado = veces_completado + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(esCorrecto ? 1 : 0, nodeId)
    } else {
      this.db.query(`
        INSERT OR REPLACE INTO hl_node_effectiveness
          (id, nodo_content_hash, agente_tipo, tema, tipo_pedagogico, tipo_visual, rango_edad, intentos_promedio, tasa_abandono, tiempo_promedio, veces_visto, veces_completado)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 1, ?)
      `).run(nodeId, nodeId, 'feedback', '', tipoPedagogico, 'text_card', '', esCorrecto ? 0 : 1, esCorrecto ? 1 : 0)
    }
  }

  /** Agrega un logro a la lista de logros desbloqueados de la sesión */
  saveLogro(sessionId: string, logroId: string): void {
    const row = this.db.query(
      'SELECT logros_json FROM hl_sessions WHERE session_id = ?'
    ).get(sessionId) as { logros_json: string } | undefined
    if (!row) return

    const logros: string[] = JSON.parse(row.logros_json ?? '[]')
    if (!logros.includes(logroId)) {
      logros.push(logroId)
      this.db.query(
        'UPDATE hl_sessions SET logros_json = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?'
      ).run(JSON.stringify(logros), sessionId)
    }
  }

  // ─── Pause / Restore ────────────────────────────────────────────────

  pauseSession(sessionId: string, lastNodeId: string, stateJson: string): void {
    this.db.query(`
      UPDATE hl_sessions
      SET paused_at = datetime('now'), last_node_id = ?, session_state_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ?
    `).run(lastNodeId, stateJson, sessionId)
  }

  restoreSessionState(sessionId: string): { lastNodeId: string | null; stateJson: string | null; pausedAt: string | null } | null {
    const row = this.db.query(
      'SELECT last_node_id, session_state_json, paused_at FROM hl_sessions WHERE session_id = ?'
    ).get(sessionId) as { last_node_id: string | null; session_state_json: string | null; paused_at: string | null } | undefined
    if (!row) return null
    return {
      lastNodeId: row.last_node_id ?? null,
      stateJson:  row.session_state_json ?? null,
      pausedAt:   row.paused_at ?? null,
    }
  }

  // ─── Onboarding Chat ─────────────────────────────────────────────────

  saveOnboardingMessage(
    sessionId: string,
    role: 'agent' | 'user',
    content: string,
    a2uiJson?: string,
    fieldKey?: string,
    fieldValue?: string,
  ): void {
    this.db.query(`
      INSERT INTO hl_onboarding_messages (session_id, role, content, a2ui_json, field_key, field_value)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, role, content, a2uiJson ?? null, fieldKey ?? null, fieldValue ?? null)
  }

  getOnboardingMessages(sessionId: string): Array<{
    role: string; content: string; a2ui_json: string | null; field_key: string | null; field_value: string | null
  }> {
    return this.db.query(
      'SELECT role, content, a2ui_json, field_key, field_value FROM hl_onboarding_messages WHERE session_id = ? ORDER BY id ASC'
    ).all(sessionId) as any[]
  }

  // ─── Onboarding Progress (Incremental) ───────────────────────────────

  /**
   * Guarda el progreso incremental del onboarding paso a paso.
   * Se llama después de cada respuesta del usuario para persistir inmediatamente.
   */
  saveOnboardingProgress(
    sessionId: string,
    step: 'nombre' | 'edad' | 'tema' | 'objetivo' | 'estilo' | 'completo',
    fieldKey: string,
    fieldValue: string,
    perfilParcial?: Record<string, string>,
    metaParcial?: string,
  ): void {
    const now = new Date().toISOString()
    const perfilJson = perfilParcial ? JSON.stringify(perfilParcial) : null
    const metaJson = metaParcial ? JSON.stringify({ meta: metaParcial }) : null

    // Primero creamos el alumno_id si es el paso 'nombre'
    let alumnoId: string | null = null
    if (step === 'nombre') {
      alumnoId = `alumno_${fieldValue.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}_${Date.now()}`
      this.saveStudentProfile({
        alumnoId,
        nombre: fieldValue,
        nickname: fieldValue,
        avatar: 'tigre_azul',
        edad: 0,
        estado: 'onboarding',
        sesionesTotal: 0,
        xpAcumulado: 0,
        creadoEn: new Date().toISOString(),
        ultimoAcceso: new Date().toISOString(),
      })
    } else {
      // Obtener alumno_id de la sesión más reciente
      const existing = this.db.query(
        'SELECT alumno_id FROM hl_onboarding_progress WHERE session_id = ? ORDER BY id DESC LIMIT 1'
      ).get(sessionId) as { alumno_id: string } | undefined
      alumnoId = existing?.alumno_id ?? null
    }

    this.db.query(`
      INSERT INTO hl_onboarding_progress (session_id, alumno_id, step, field_key, field_value, perfil_json, meta_json, completed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      alumnoId,
      step,
      fieldKey,
      fieldValue,
      perfilJson,
      metaJson,
      step === 'completo' ? 1 : 0,
    )

    // Actualizar el registro más reciente con el perfil acumulado
    if (perfilParcial && alumnoId) {
      this.db.query(`
        UPDATE hl_onboarding_progress
        SET perfil_json = ?, updated_at = ?
        WHERE session_id = ? AND id = (SELECT MAX(id) FROM hl_onboarding_progress WHERE session_id = ?)
      `).run(JSON.stringify(perfilParcial), now, sessionId, sessionId)

      // Actualizar perfil del alumno incrementalmente
      if (step === 'edad') {
        const edad = parseInt(fieldValue, 10)
        const rangoEdad = edad <= 12 ? 'nino' : edad <= 17 ? 'adolescente' : 'adulto'
        this.db.query(`
          UPDATE hl_student_profiles
          SET edad = ?, rango_edad = ?, updated_at = ?
          WHERE alumno_id = ?
        `).run(edad, rangoEdad, now, alumnoId)
      }
    }
  }

  /**
   * Obtiene el último estado del onboarding para permitir reanudar.
   * Devuelve el progreso completo incluyendo perfil parcial y último paso completado.
   */
  getOnboardingProgress(sessionId: string): {
    sessionId: string
    alumnoId: string | null
    lastStep: string | null
    camposCompletados: Record<string, string>
    perfilParcial: Record<string, string> | null
    metaParcial: string | null
    completado: boolean
  } | null {
    const rows = this.db.query(
      'SELECT * FROM hl_onboarding_progress WHERE session_id = ? ORDER BY id ASC'
    ).all(sessionId) as Array<{
      session_id: string
      alumno_id: string | null
      step: string
      field_key: string | null
      field_value: string | null
      perfil_json: string | null
      meta_json: string | null
      completed: number
    }>

    if (rows.length === 0) return null

    const camposCompletados: Record<string, string> = {}
    let perfilParcial: Record<string, string> | null = null
    let metaParcial: string | null = null
    let lastStep: string | null = null
    let alumnoId: string | null = null
    let completado = false

    for (const row of rows) {
      if (row.field_key && row.field_value) {
        camposCompletados[row.field_key] = row.field_value
      }
      if (row.perfil_json) {
        perfilParcial = JSON.parse(row.perfil_json)
      }
      if (row.meta_json) {
        const parsed = JSON.parse(row.meta_json)
        metaParcial = parsed.meta
      }
      if (row.alumno_id) {
        alumnoId = row.alumno_id
      }
      lastStep = row.step
      if (row.completed === 1) {
        completado = true
      }
    }

    return {
      sessionId,
      alumnoId,
      lastStep,
      camposCompletados,
      perfilParcial,
      metaParcial,
      completado,
    }
  }

  /**
   * Marca el onboarding como completo y devuelve el perfil final.
   */
  completeOnboarding(sessionId: string, perfilFinal: Record<string, string>, metaFinal: string): { alumnoId: string; perfil: Record<string, string>; meta: string } | null {
    const now = new Date().toISOString()
    const existing = this.db.query(
      'SELECT alumno_id FROM hl_onboarding_progress WHERE session_id = ? ORDER BY id DESC LIMIT 1'
    ).get(sessionId) as { alumno_id: string } | undefined

    if (!existing?.alumno_id) return null

    const alumnoId = existing.alumno_id

    // Insertar registro final
    this.db.query(`
      INSERT INTO hl_onboarding_progress (session_id, alumno_id, step, field_key, field_value, perfil_json, meta_json, completed)
      VALUES (?, ?, 'completo', 'complete', 'complete', ?, ?, 1)
    `).run(sessionId, alumnoId, JSON.stringify(perfilFinal), JSON.stringify({ meta: metaFinal }))

    // Actualizar perfil completo del alumno
    const perfil = perfilFinal as any
    this.db.query(`
      UPDATE hl_student_profiles
      SET nombre = ?, nickname = ?, apodo = ?, edad = ?, updated_at = ?
      WHERE alumno_id = ?
    `).run(
      perfil.nombre || '',
      perfil.nickname || perfil.nombre || '',
      perfil.nickname || perfil.nombre || '',
      perfil.edad || 18,
      now,
      alumnoId,
    )

    return { alumnoId, perfil: perfilFinal, meta: metaFinal }
  }

  /**
   * Verifica si hay un onboarding incompleto para un alumno.
   * Permite reanudar donde se quedó.
   */
  hasIncompleteOnboarding(alumnoId: string): boolean {
    const row = this.db.query(
      'SELECT session_id FROM hl_onboarding_progress WHERE alumno_id = ? AND completed = 0 LIMIT 1'
    ).get(alumnoId) as { session_id: string } | undefined
    return !!row
  }

  /**
   * Obtiene la sesión de onboarding incompleta para reanudar.
   */
  getIncompleteOnboardingSession(alumnoId: string): string | null {
    const row = this.db.query(
      'SELECT session_id FROM hl_onboarding_progress WHERE alumno_id = ? AND completed = 0 ORDER BY updated_at DESC LIMIT 1'
    ).get(alumnoId) as { session_id: string } | undefined
    return row?.session_id ?? null
  }

  rateSession(sessionId: string, rating: number, comentario?: string): void {
    this.db.query(`
      UPDATE hl_sessions SET rating = ?, rating_comentario = ? WHERE session_id = ?
    `).run(rating, comentario ?? null, sessionId)
  }

  /** Devuelve sesión + curriculo completo (nodos_json) para el gateway */
  getSessionWithCurriculum(sessionId: string): (SessionData & { nodosJson: string; topicSlug: string | null; metaAlumno: string }) | null {
    const row = this.db.query(`
      SELECT s.*, c.nodos_json, c.topic_slug, c.meta_alumno
      FROM hl_sessions s
      LEFT JOIN hl_curricula c ON c.id = s.curriculo_id
      WHERE s.session_id = ?
    `).get(sessionId) as Record<string, any> | undefined
    if (!row) return null
    return {
      sessionId: row.session_id,
      alumnoId: row.alumno_id,
      curriculoId: row.curriculo_id,
      xpTotal: row.xp_total,
      nivelAlcanzado: row.nivel_alcanzado,
      logrosJson: row.logros_json,
      nodosCompletados: row.nodos_completados,
      evaluacionPuntaje: row.evaluacion_puntaje,
      completada: !!row.completada,
      nodosJson: row.nodos_json ?? '[]',
      topicSlug: row.topic_slug ?? null,
      metaAlumno: row.meta_alumno ?? '',
    }
  }

  // ─── Lesson Interactions (entrega WebSocket) ────────────────────────

  saveInteraction(
    sessionId: string,
    turnIndex: number,
    sender: 'agent' | 'student',
    opts: { nodoId?: string; a2uiJson?: string; actionJson?: string; xpAwarded?: number; correcto?: boolean | null },
  ): void {
    this.db.query(`
      INSERT INTO hl_lesson_interactions
        (session_id, turn_index, sender, nodo_id, a2ui_json, action_json, xp_awarded, correcto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, turnIndex, sender,
      opts.nodoId ?? null, opts.a2uiJson ?? null, opts.actionJson ?? null,
      opts.xpAwarded ?? 0,
      opts.correcto == null ? null : (opts.correcto ? 1 : 0),
    )
  }

  getInteractions(sessionId: string): Array<{
    turn_index: number; sender: string; nodo_id: string | null
    a2ui_json: string | null; action_json: string | null
    xp_awarded: number; correcto: number | null
  }> {
    return this.db.query(
      `SELECT turn_index, sender, nodo_id, a2ui_json, action_json, xp_awarded, correcto
       FROM hl_lesson_interactions WHERE session_id = ? ORDER BY turn_index ASC`
    ).all(sessionId) as any[]
  }

  getNextTurnIndex(sessionId: string): number {
    const row = this.db.query(
      `SELECT MAX(turn_index) as mx FROM hl_lesson_interactions WHERE session_id = ?`
    ).get(sessionId) as { mx: number | null } | undefined
    return (row?.mx ?? -1) + 1
  }

  getTopicEffectiveness(topicSlug: string | null): { nodosConMasFallas: string[]; nivelPromedioAprobacion: number } {
    if (!topicSlug) return { nodosConMasFallas: [], nivelPromedioAprobacion: 0 }
    const rows = this.db.query(`
      SELECT tipo_pedagogico, veces_visto, veces_completado
      FROM hl_node_effectiveness
      WHERE tema = ?
      ORDER BY (CAST(veces_completado AS FLOAT) / MAX(veces_visto, 1)) ASC
      LIMIT 5
    `).all(topicSlug) as Array<{ tipo_pedagogico: string; veces_visto: number; veces_completado: number }>

    const nodosConMasFallas = rows
      .filter(r => r.veces_visto > 2)
      .map(r => r.tipo_pedagogico)

    const allRows = this.db.query(`
      SELECT AVG(CAST(veces_completado AS FLOAT) / MAX(veces_visto, 1)) as avg_rate
      FROM hl_node_effectiveness WHERE tema = ?
    `).get(topicSlug) as { avg_rate: number | null }

    return {
      nodosConMasFallas,
      nivelPromedioAprobacion: allRows.avg_rate ? Math.round(allRows.avg_rate * 100) : 0,
    }
  }

  // ─── Metrics Dashboard ──────────────────────────────────────────────

  getAggregateMetrics(): Record<string, any> {
    const totalLessons = this.db.query(
      'SELECT COUNT(*) as count FROM hl_session_metrics'
    ).get() as { count: number }

    const completedLessons = this.db.query(
      'SELECT COUNT(*) as count FROM hl_session_metrics WHERE completada = 1'
    ).get() as { count: number }

    const avgScore = this.db.query(
      'SELECT AVG(puntaje_evaluacion) as avg_score FROM hl_session_metrics WHERE completada = 1'
    ).get() as { avg_score: number | null }

    const avgXP = this.db.query(
      'SELECT AVG(xp_ganado) as avg_xp FROM hl_session_metrics WHERE completada = 1'
    ).get() as { avg_xp: number | null }

    const hardestNodes = this.db.query(`
      SELECT tema, tipo_pedagogico, veces_visto, veces_completado,
             CASE WHEN veces_visto > 0 THEN 1.0 - (CAST(veces_completado AS FLOAT) / veces_visto) ELSE 0 END as tasa_abandono
      FROM hl_node_effectiveness
      WHERE veces_visto > 0
      ORDER BY tasa_abandono DESC
      LIMIT 10
    `).all()

    return {
      totalLessons: totalLessons.count,
      completedLessons: completedLessons.count,
      completionRate: totalLessons.count > 0 ? (completedLessons.count / totalLessons.count * 100).toFixed(1) : 0,
      avgScore: avgScore.avg_score ? Number(avgScore.avg_score).toFixed(1) : null,
      avgXP: avgXP.avg_xp ? Math.round(avgXP.avg_xp) : 0,
      hardestNodes,
    }
  }

  getSessionsByAlumno(alumnoId: string): SessionData[] {
    const rows = this.db.query(
      'SELECT * FROM hl_sessions WHERE alumno_id = ? ORDER BY created_at DESC'
    ).all(alumnoId) as Record<string, any>[]
    return rows.map(row => ({
      sessionId: row.session_id,
      alumnoId: row.alumno_id,
      curriculoId: row.curriculo_id,
      xpTotal: row.xp_total,
      nivelAlcanzado: row.nivel_alcanzado,
      logrosJson: row.logros_json,
      nodosCompletados: row.nodos_completados,
      evaluacionPuntaje: row.evaluacion_puntaje,
      completada: !!row.completada,
    }))
  }

  /**
   * Devuelve todas las sesiones con metadatos del currículo y perfil del alumno.
   * Soporta búsqueda por nombre/nickname (q) y filtro por nickname exacto.
   */
  getAllSessions(opts?: { q?: string; nickname?: string }): SessionRow[] {
    let sql = `
      SELECT
        s.session_id,
        s.alumno_id,
        s.curriculo_id,
        s.xp_total,
        s.nivel_alcanzado,
        s.logros_json,
        s.nodos_completados,
        s.evaluacion_puntaje,
        s.completada,
        s.created_at,
        c.meta_alumno AS meta,
        c.total_nodos,
        c.rango_edad,
        p.nombre,
        p.nickname
      FROM hl_sessions s
      LEFT JOIN hl_curricula c ON c.id = s.curriculo_id
      LEFT JOIN hl_student_profiles p ON p.alumno_id = s.alumno_id
      WHERE 1=1
    `
    const params: any[] = []

    if (opts?.q) {
      sql += ` AND (p.nombre LIKE ? OR p.nickname LIKE ? OR p.apodo LIKE ?)`
      const like = `%${opts.q}%`
      params.push(like, like, like)
    }

    if (opts?.nickname) {
      sql += ` AND (p.nickname = ? OR p.apodo = ? OR p.nombre = ?)`
      params.push(opts.nickname, opts.nickname, opts.nickname)
    }

    sql += ` ORDER BY s.created_at DESC`

    const rows = this.db.query(sql).all(...params) as Record<string, any>[]

    return rows.map(row => ({
      session_id: row.session_id,
      alumno_id: row.alumno_id,
      curriculo_id: row.curriculo_id,
      xp_total: row.xp_total,
      nivel_alcanzado: row.nivel_alcanzado,
      logros_json: row.logros_json,
      nodos_completados: row.nodos_completados,
      evaluacion_puntaje: row.evaluacion_puntaje,
      completada: row.completada,
      meta: row.meta ?? '',
      nombre: row.nombre ?? '',
      nickname: row.nickname ?? row.apodo ?? '',
      total_nodos: row.total_nodos ?? 0,
      rango_edad: row.rango_edad ?? '',
      created_at: row.created_at ?? '',
    }))
  }
}
