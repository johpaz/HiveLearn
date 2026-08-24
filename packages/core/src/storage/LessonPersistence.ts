/**
 * LessonPersistence — Persistencia de lecciones HiveLearn en HiveDB
 *
 * Guarda el ciclo completo de vida de una lección:
 * 1. Perfil del alumno → hl_student_profiles
 * 2. Curriculum generado → hl_curricula
 * 3. Sesión de aprendizaje → hl_sessions
 * 4. Métricas de la sesión → hl_session_metrics
 * 5. Efectividad por nodo → hl_node_effectiveness
 *
 * Motor: @johpaz/hive-db (colecciones de documentos). Los IDs numéricos
 * autoincrementales del schema sqlite anterior se emulan con la colección
 * `counters` (OCC), y las tablas append-only usan ids `${sessionId}:${seq}`
 * para preservar el orden de inserción vía scan con prefix.
 */
import type { HiveDB, Collection } from '@johpaz/hive-db'
import { getDb, nextNumericId, nextSessionSeq, nowIso } from './hivedb'
import type { StudentProfile, SwarmTimelineEvent } from '../types'
import { logger } from '../utils/logger'

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

// ─── Document shapes (snake_case, igual que las columnas sqlite anteriores) ──

interface StudentProfileDoc {
  nickname: string | null
  nombre: string
  edad: number
  rango_edad: string
  tiempo_sesion: number
  nivel_previo: string
  estilo: string
  sesiones_total: number
  xp_acumulado: number
  nivel_actual: string
  /** Energía/humor declarada en el onboarding más reciente (baja|media|alta) */
  energia_ultima?: 'baja' | 'media' | 'alta'
  created_at: string
  updated_at: string
}

interface TopicDoc {
  titulo: string
  descripcion: string | null
  nivel: string | null
  categoria: string | null
  keywords: string
  activo: number
  created_at: string
}

interface CurriculumDoc {
  id: number
  session_id: string
  topic_slug: string | null
  meta_alumno: string
  nodos_json: string
  total_nodos: number
  rango_edad: string
  created_at: string
}

interface SessionDoc {
  alumno_id: string
  curriculo_id: number
  xp_total: number
  nivel_alcanzado: string
  logros_json: string
  nodos_completados: number
  evaluacion_puntaje: number | null
  completada: number
  rating: number | null
  rating_comentario: string | null
  paused_at: string | null
  last_node_id: string | null
  session_state_json: string | null
  created_at: string
  updated_at: string
}

interface SessionMetricsDoc {
  alumno_id: string
  curriculo_id: number
  tema: string
  duracion_real_seg: number
  nodos_total: number
  nodos_completados: number
  puntaje_evaluacion: number | null
  intentos_por_nodo: string
  nodos_dominados: string
  nodos_dificiles: string
  logros_desbloqueados: string
  xp_ganado: number
  completada: number
  created_at: string
}

interface NodeEffectivenessDoc {
  nodo_content_hash: string
  agente_tipo: string
  tema: string
  tipo_pedagogico: string
  tipo_visual: string
  rango_edad: string
  intentos_promedio: number
  tasa_abandono: number
  tiempo_promedio: number
  veces_visto: number
  veces_completado: number
  updated_at: string
}

interface AgentOutputDoc {
  session_id: string
  agent_id: string
  task_id: string
  output_json: string | null
  duration_ms: number
  status: string
  created_at: string
}

interface SwarmTimelineDoc {
  session_id: string
  event_kind: string
  status: string
  label: string
  progress: number | null
  phase: string | null
  agent_id: string | null
  agent_name: string | null
  task_id: string | null
  node_id: string | null
  summary: string | null
  error: string | null
  metadata_json: string | null
  created_at: string
}

interface AgentPromptUpdateDoc {
  session_id: string
  agent_id: string
  failure_type: string | null
  reason: string
  patch_text: string
  created_at: string
}

interface StudentResponseDoc {
  session_id: string
  node_id: string
  attempt_num: number
  tipo_pedagogico: string
  respuesta_texto: string
  feedback_json: string
  xp_awarded: number
  es_correcto: number
  created_at: string
}

interface OnboardingMessageDoc {
  session_id: string
  role: string
  content: string
  a2ui_json: string | null
  field_key: string | null
  field_value: string | null
  created_at: string
}

interface OnboardingProgressDoc {
  session_id: string
  alumno_id: string | null
  step: string
  field_key: string | null
  field_value: string | null
  perfil_json: string | null
  meta_json: string | null
  completed: number
  created_at: string
  updated_at: string
}

interface LessonInteractionDoc {
  session_id: string
  turn_index: number
  sender: string
  nodo_id: string | null
  a2ui_json: string | null
  action_json: string | null
  xp_awarded: number
  correcto: number | null
  created_at: string
}

interface AgentDoc {
  name: string
  description: string | null
  system_prompt: string | null
  role: string
  provider_id: string
  model_id: string
  max_iterations: number
  prompt_patch?: string | null
  last_prompt_update_reason?: string | null
  enabled: number
  updated_at?: string
}

export class LessonPersistence {
  private db: HiveDB
  private log = logger.child('lesson-persistence')

  constructor() {
    this.db = getDb()
  }

  private col<T>(name: string): Collection<T> {
    return this.db.collection<T>(name)
  }

  // ─── Config Check ───────────────────────────────────────────────────

  /** Verifica si los agentes de HiveLearn ya tienen provider/model configurados */
  async getHiveLearnProviderModel(): Promise<{ providerId: string; modelId: string } | null> {
    const entry = await this.col<AgentDoc>('hl_agents').get('hl-profile-agent')

    if (entry?.doc.provider_id && entry?.doc.model_id) {
      return { providerId: entry.doc.provider_id, modelId: entry.doc.model_id }
    }
    return null
  }

  // ─── Student Profiles ───────────────────────────────────────────────

  async saveStudentProfile(profile: StudentProfile): Promise<void> {
    await this.ensureStudentProfile(profile)
  }

  async ensureStudentProfile(profile: StudentProfile): Promise<StudentProfile> {
    const nickname = profile.nickname?.trim()
    const existingByNickname = nickname ? await this.findStudentByNickname(nickname) : null
    const now = nowIso()

    if (existingByNickname && existingByNickname.alumnoId !== profile.alumnoId) {
      const col = this.col<StudentProfileDoc>('hl_student_profiles')
      const existing = await col.get(existingByNickname.alumnoId)
      if (existing) {
        await col.put(existingByNickname.alumnoId, {
          ...existing.doc,
          nickname: nickname ?? null,
          nombre: profile.nombre,
          edad: profile.edad,
          rango_edad: profile.rangoEdad,
          tiempo_sesion: profile.tiempoSesion,
          nivel_previo: profile.nivelPrevio,
          estilo: profile.estilo,
          updated_at: now,
        })
      }

      return {
        ...existingByNickname,
        nickname: nickname ?? existingByNickname.nickname,
        nombre: profile.nombre,
        edad: profile.edad,
        rangoEdad: profile.rangoEdad,
        tiempoSesion: profile.tiempoSesion,
        nivelPrevio: profile.nivelPrevio,
        estilo: profile.estilo,
      }
    }

    const col = this.col<StudentProfileDoc>('hl_student_profiles')
    const existing = await col.get(profile.alumnoId)
    await col.put(profile.alumnoId, {
      nickname: nickname ?? null,
      nombre: profile.nombre,
      edad: profile.edad,
      rango_edad: profile.rangoEdad,
      tiempo_sesion: profile.tiempoSesion,
      nivel_previo: profile.nivelPrevio,
      estilo: profile.estilo,
      sesiones_total: existing?.doc.sesiones_total ?? 0,
      xp_acumulado: existing?.doc.xp_acumulado ?? 0,
      nivel_actual: existing?.doc.nivel_actual ?? 'Aprendiz',
      created_at: existing?.doc.created_at ?? now,
      updated_at: now,
    })

    return (await this.getStudentProfile(profile.alumnoId)) ?? profile
  }

  private toStudentProfile(alumnoId: string, doc: StudentProfileDoc): StudentProfile {
    return {
      alumnoId,
      nickname: doc.nickname ?? undefined,
      nombre: doc.nombre,
      edad: doc.edad,
      rangoEdad: doc.rango_edad as StudentProfile['rangoEdad'],
      tiempoSesion: doc.tiempo_sesion as StudentProfile['tiempoSesion'],
      nivelPrevio: doc.nivel_previo as StudentProfile['nivelPrevio'],
      estilo: doc.estilo as StudentProfile['estilo'],
      sesionesTotal: doc.sesiones_total,
      xpAcumulado: doc.xp_acumulado,
      nivelActual: doc.nivel_actual,
      energiaUltima: doc.energia_ultima,
    }
  }

  async getStudentProfile(alumnoId: string): Promise<StudentProfile | null> {
    const entry = await this.col<StudentProfileDoc>('hl_student_profiles').get(alumnoId)
    if (!entry) return null
    return this.toStudentProfile(entry.id, entry.doc)
  }

  async findStudentByNickname(nickname: string): Promise<StudentProfile | null> {
    // La búsqueda original era case-insensitive (lower(nickname) = lower(?)).
    // El índice de igualdad de hive-db es exacto, así que se escanea la
    // colección (catálogo pequeño de alumnos) comparando en minúsculas.
    const target = nickname.trim().toLowerCase()
    const entries = await this.col<StudentProfileDoc>('hl_student_profiles').scan()
    const match = entries.find(e => (e.doc.nickname ?? '').trim().toLowerCase() === target && e.doc.nickname != null)
    if (!match) return null
    return this.toStudentProfile(match.id, match.doc)
  }

  // ─── Curriculum ─────────────────────────────────────────────────────

  async saveCurriculum(sessionId: string, meta: string, nodosJson: string, totalNodos: number, rangoEdad: string, topicSlug: string | null): Promise<number> {
    const resolvedTopicSlug = await this.resolveKnownTopicSlug(topicSlug)
    const col = this.col<CurriculumDoc>('hl_curricula')

    const existing = await col.get(sessionId)
    const numericId = existing?.doc.id ?? await nextNumericId('hl_curricula')

    await col.put(sessionId, {
      id: numericId,
      session_id: sessionId,
      topic_slug: resolvedTopicSlug,
      meta_alumno: meta,
      nodos_json: nodosJson,
      total_nodos: totalNodos,
      rango_edad: rangoEdad,
      created_at: existing?.doc.created_at ?? nowIso(),
    })

    return numericId
  }

  private async resolveKnownTopicSlug(topicSlug: string | null): Promise<string | null> {
    const normalized = topicSlug?.trim().toLowerCase() ?? null
    if (!normalized) return null

    const entry = await this.col<TopicDoc>('hl_topics').get(normalized)
    if (entry) return entry.id

    this.log.warn(`[saveCurriculum] unknown topic_slug="${topicSlug}" — persisting as NULL to avoid FK failure`)
    return null
  }

  async getCurriculumBySessionId(sessionId: string): Promise<{ id: number; nodos_json: string; topic_slug: string | null } | null> {
    const entry = await this.col<CurriculumDoc>('hl_curricula').get(sessionId)
    if (!entry) return null
    return {
      id: entry.doc.id,
      nodos_json: entry.doc.nodos_json,
      topic_slug: entry.doc.topic_slug,
    }
  }

  // ─── Sessions ───────────────────────────────────────────────────────

  async createSession(sessionId: string, alumnoId: string, curriculoId: number, rangoEdad: string): Promise<void> {
    const col = this.col<SessionDoc>('hl_sessions')
    const existing = await col.get(sessionId)
    if (existing) return // INSERT OR IGNORE

    const now = nowIso()
    await col.put(sessionId, {
      alumno_id: alumnoId,
      curriculo_id: curriculoId,
      xp_total: 0,
      nivel_alcanzado: 'Aprendiz',
      logros_json: '[]',
      nodos_completados: 0,
      evaluacion_puntaje: null,
      completada: 0,
      rating: null,
      rating_comentario: null,
      paused_at: null,
      last_node_id: null,
      session_state_json: null,
      created_at: now,
      updated_at: now,
    })
  }

  async updateSessionProgress(sessionId: string, nodosCompletados: number, xpTotal: number): Promise<void> {
    const col = this.col<SessionDoc>('hl_sessions')
    const existing = await col.get(sessionId)
    if (!existing) return
    await col.put(sessionId, {
      ...existing.doc,
      nodos_completados: nodosCompletados,
      xp_total: xpTotal,
      updated_at: nowIso(),
    })
  }

  async completeSession(sessionId: string, xpTotal: number, nivelAlcanzado: string, logrosJson: string, evaluacionPuntaje: number | null): Promise<void> {
    const sessions = this.col<SessionDoc>('hl_sessions')
    const now = nowIso()
    const existing = await sessions.get(sessionId)
    if (!existing) return

    await sessions.put(sessionId, {
      ...existing.doc,
      xp_total: xpTotal,
      nivel_alcanzado: nivelAlcanzado,
      logros_json: logrosJson,
      evaluacion_puntaje: evaluacionPuntaje,
      completada: 1,
      updated_at: now,
    })

    // Actualizar perfil del alumno
    const profiles = this.col<StudentProfileDoc>('hl_student_profiles')
    const profile = await profiles.get(existing.doc.alumno_id)
    if (profile) {
      await profiles.put(existing.doc.alumno_id, {
        ...profile.doc,
        xp_acumulado: profile.doc.xp_acumulado + xpTotal,
        sesiones_total: profile.doc.sesiones_total + 1,
        nivel_actual: nivelAlcanzado,
        updated_at: now,
      })
    }
  }

  private toSessionData(sessionId: string, doc: SessionDoc): SessionData {
    return {
      sessionId,
      alumnoId: doc.alumno_id,
      curriculoId: doc.curriculo_id,
      xpTotal: doc.xp_total,
      nivelAlcanzado: doc.nivel_alcanzado,
      logrosJson: doc.logros_json,
      nodosCompletados: doc.nodos_completados,
      evaluacionPuntaje: doc.evaluacion_puntaje,
      completada: !!doc.completada,
    }
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const entry = await this.col<SessionDoc>('hl_sessions').get(sessionId)
    if (!entry) return null
    return this.toSessionData(entry.id, entry.doc)
  }

  async getActiveSession(alumnoId: string): Promise<SessionData | null> {
    const entries = await this.col<SessionDoc>('hl_sessions').findBy('alumno_id', alumnoId)
    const active = entries
      .filter(e => !e.doc.completada)
      .sort((a, b) => (b.doc.created_at ?? '').localeCompare(a.doc.created_at ?? ''))
    const latest = active[0]
    if (!latest) return null
    return this.toSessionData(latest.id, latest.doc)
  }

  // ─── Session Metrics ────────────────────────────────────────────────

  async saveSessionMetrics(metrics: SessionMetrics): Promise<void> {
    await this.col<SessionMetricsDoc>('hl_session_metrics').put(metrics.sessionId, {
      alumno_id: metrics.alumnoId,
      curriculo_id: metrics.curriculoId,
      tema: metrics.tema,
      duracion_real_seg: metrics.duracionRealSeg,
      nodos_total: metrics.nodosTotal,
      nodos_completados: metrics.nodosCompletados,
      puntaje_evaluacion: metrics.puntajeEvaluacion,
      intentos_por_nodo: metrics.intentosPorNodo,
      nodos_dominados: metrics.nodosDominados,
      nodos_dificiles: metrics.nodosDificiles,
      logros_desbloqueados: metrics.logrosDesbloqueados,
      xp_ganado: metrics.xpGanado,
      completada: metrics.completada ? 1 : 0,
      created_at: nowIso(),
    })
  }

  // ─── Node Effectiveness ─────────────────────────────────────────────

  async trackNodeInteraction(nodoId: string, agenteTipo: string, tema: string, tipoPedagogico: string, tipoVisual: string, rangoEdad: string, completado: boolean, tiempoSeg: number): Promise<void> {
    // Generar hash del contenido como ID
    const contentHash = `${nodoId}-${agenteTipo}`
    const col = this.col<NodeEffectivenessDoc>('hl_node_effectiveness')

    const existing = await col.get(contentHash)

    if (existing) {
      await col.put(contentHash, {
        ...existing.doc,
        veces_visto: existing.doc.veces_visto + 1,
        veces_completado: existing.doc.veces_completado + (completado ? 1 : 0),
        updated_at: nowIso(),
      })
    } else {
      await col.put(contentHash, {
        nodo_content_hash: contentHash,
        agente_tipo: agenteTipo,
        tema,
        tipo_pedagogico: tipoPedagogico,
        tipo_visual: tipoVisual,
        rango_edad: rangoEdad,
        intentos_promedio: 1,
        tasa_abandono: completado ? 0 : 1,
        tiempo_promedio: tiempoSeg,
        veces_visto: 1,
        veces_completado: completado ? 1 : 0,
        updated_at: nowIso(),
      })
    }
  }

  // ─── Agent Output Traceability ─────────────────────────────────────

  async saveAgentOutput(sessionId: string, agentId: string, taskId: string, outputJson: string, durationMs: number, status: 'ok' | 'failed' = 'ok'): Promise<void> {
    try {
      const seq = await nextSessionSeq('hl_session_agent_outputs', sessionId)
      await this.col<AgentOutputDoc>('hl_session_agent_outputs').put(`${sessionId}:${seq}`, {
        session_id: sessionId,
        agent_id: agentId,
        task_id: taskId,
        output_json: outputJson,
        duration_ms: durationMs,
        status,
        created_at: nowIso(),
      })
    } catch {
      // Non-critical — never block the pipeline
    }
  }

  async getAgentOutputs(sessionId: string): Promise<Array<{ agent_id: string; task_id: string; output_json: string; duration_ms: number; status: string }>> {
    const entries = await this.col<AgentOutputDoc>('hl_session_agent_outputs').scan({ prefix: `${sessionId}:` })
    return entries.map(e => ({
      agent_id: e.doc.agent_id,
      task_id: e.doc.task_id,
      output_json: e.doc.output_json ?? '',
      duration_ms: e.doc.duration_ms,
      status: e.doc.status,
    }))
  }

  async saveSwarmTimelineEvent(event: SwarmTimelineEvent): Promise<void> {
    try {
      const seq = await nextSessionSeq('hl_swarm_timeline', event.sessionId)
      await this.col<SwarmTimelineDoc>('hl_swarm_timeline').put(`${event.sessionId}:${seq}`, {
        session_id: event.sessionId,
        event_kind: event.kind,
        status: event.status,
        label: event.label,
        progress: event.progress ?? null,
        phase: event.phase ?? null,
        agent_id: event.agentId ?? null,
        agent_name: event.agentName ?? null,
        task_id: event.taskId ?? null,
        node_id: event.nodeId ?? null,
        summary: event.summary ?? null,
        error: event.error ?? null,
        metadata_json: event.metadata ? JSON.stringify(event.metadata) : null,
        created_at: nowIso(),
      })
    } catch {
      // Non-critical — never block the pipeline
    }
  }

  async getSwarmTimeline(sessionId: string): Promise<SwarmTimelineEvent[]> {
    const entries = await this.col<SwarmTimelineDoc>('hl_swarm_timeline').scan({ prefix: `${sessionId}:` })

    return entries.map((entry) => ({
      sessionId: entry.doc.session_id,
      kind: entry.doc.event_kind,
      status: entry.doc.status,
      label: entry.doc.label,
      progress: entry.doc.progress ?? undefined,
      phase: entry.doc.phase ?? undefined,
      agentId: entry.doc.agent_id ?? undefined,
      agentName: entry.doc.agent_name ?? undefined,
      taskId: entry.doc.task_id ?? undefined,
      nodeId: entry.doc.node_id ?? undefined,
      summary: entry.doc.summary ?? undefined,
      error: entry.doc.error ?? undefined,
      metadata: entry.doc.metadata_json ? JSON.parse(entry.doc.metadata_json) : undefined,
      timestamp: Date.parse(entry.doc.created_at) || Date.now(),
    })) as SwarmTimelineEvent[]
  }

  async updateAgentPromptPatch(sessionId: string, agentId: string, patchText: string, reason: string, failureType?: string | null): Promise<void> {
    try {
      const agents = this.col<AgentDoc>('hl_agents')
      const agent = await agents.get(agentId)
      if (agent && agent.doc.role === 'worker') {
        await agents.put(agentId, {
          ...agent.doc,
          prompt_patch: patchText,
          last_prompt_update_reason: reason,
          updated_at: nowIso(),
        })
      }

      const seq = await nextSessionSeq('hl_agent_prompt_updates', sessionId)
      await this.col<AgentPromptUpdateDoc>('hl_agent_prompt_updates').put(`${sessionId}:${seq}`, {
        session_id: sessionId,
        agent_id: agentId,
        failure_type: failureType ?? null,
        reason,
        patch_text: patchText,
        created_at: nowIso(),
      })
    } catch {
      // Non-critical
    }
  }

  // ─── Student Responses ──────────────────────────────────────────────

  async saveStudentResponse(sessionId: string, nodeId: string, tipoPedagogico: string, respuesta: string, feedbackJson: string, xpAwarded: number, esCorrecto: boolean): Promise<void> {
    // Calculate attempt number
    const prevEntries = await this.col<StudentResponseDoc>('hl_student_responses').scan({ prefix: `${sessionId}:` })
    const prevCount = prevEntries.filter(e => e.doc.node_id === nodeId).length

    const seq = await nextSessionSeq('hl_student_responses', sessionId)
    await this.col<StudentResponseDoc>('hl_student_responses').put(`${sessionId}:${seq}`, {
      session_id: sessionId,
      node_id: nodeId,
      attempt_num: prevCount + 1,
      tipo_pedagogico: tipoPedagogico,
      respuesta_texto: respuesta,
      feedback_json: feedbackJson,
      xp_awarded: xpAwarded,
      es_correcto: esCorrecto ? 1 : 0,
      created_at: nowIso(),
    })

    // Update node effectiveness
    await this.updateNodeEffectiveness(nodeId, tipoPedagogico, esCorrecto)
  }

  async updateNodeEffectiveness(nodeId: string, tipoPedagogico: string, esCorrecto: boolean): Promise<void> {
    const col = this.col<NodeEffectivenessDoc>('hl_node_effectiveness')
    const existing = await col.get(nodeId)

    if (existing) {
      await col.put(nodeId, {
        ...existing.doc,
        veces_visto: existing.doc.veces_visto + 1,
        veces_completado: existing.doc.veces_completado + (esCorrecto ? 1 : 0),
        updated_at: nowIso(),
      })
    } else {
      await col.put(nodeId, {
        nodo_content_hash: nodeId,
        agente_tipo: 'feedback',
        tema: '',
        tipo_pedagogico: tipoPedagogico,
        tipo_visual: 'text_card',
        rango_edad: '',
        intentos_promedio: 1,
        tasa_abandono: esCorrecto ? 0 : 1,
        tiempo_promedio: 0,
        veces_visto: 1,
        veces_completado: esCorrecto ? 1 : 0,
        updated_at: nowIso(),
      })
    }
  }

  /** Agrega un logro a la lista de logros desbloqueados de la sesión */
  async saveLogro(sessionId: string, logroId: string): Promise<void> {
    const col = this.col<SessionDoc>('hl_sessions')
    const existing = await col.get(sessionId)
    if (!existing) return

    const logros: string[] = JSON.parse(existing.doc.logros_json ?? '[]')
    if (!logros.includes(logroId)) {
      logros.push(logroId)
      await col.put(sessionId, {
        ...existing.doc,
        logros_json: JSON.stringify(logros),
        updated_at: nowIso(),
      })
    }
  }

  // ─── Pause / Restore ────────────────────────────────────────────────

  async pauseSession(sessionId: string, lastNodeId: string | null, stateJson: string): Promise<void> {
    const col = this.col<SessionDoc>('hl_sessions')
    const existing = await col.get(sessionId)
    if (!existing) return
    await col.put(sessionId, {
      ...existing.doc,
      paused_at: nowIso(),
      last_node_id: lastNodeId && lastNodeId.trim().length > 0 ? lastNodeId : null,
      session_state_json: stateJson,
      updated_at: nowIso(),
    })
  }

  async updateSessionLogros(sessionId: string, logrosJson: string): Promise<void> {
    const col = this.col<SessionDoc>('hl_sessions')
    const existing = await col.get(sessionId)
    if (!existing) return
    await col.put(sessionId, {
      ...existing.doc,
      logros_json: logrosJson,
      updated_at: nowIso(),
    })
  }

  async restoreSessionState(sessionId: string): Promise<{ lastNodeId: string | null; stateJson: string | null; pausedAt: string | null } | null> {
    const entry = await this.col<SessionDoc>('hl_sessions').get(sessionId)
    if (!entry) return null
    return {
      lastNodeId: entry.doc.last_node_id && entry.doc.last_node_id.trim().length > 0 ? entry.doc.last_node_id : null,
      stateJson:  entry.doc.session_state_json ?? null,
      pausedAt:   entry.doc.paused_at ?? null,
    }
  }

  // ─── Onboarding Chat ─────────────────────────────────────────────────

  async saveOnboardingMessage(
    sessionId: string,
    role: 'agent' | 'user',
    content: string,
    a2uiJson?: string,
    fieldKey?: string,
    fieldValue?: string,
  ): Promise<void> {
    const seq = await nextSessionSeq('hl_onboarding_messages', sessionId)
    await this.col<OnboardingMessageDoc>('hl_onboarding_messages').put(`${sessionId}:${seq}`, {
      session_id: sessionId,
      role,
      content,
      a2ui_json: a2uiJson ?? null,
      field_key: fieldKey ?? null,
      field_value: fieldValue ?? null,
      created_at: nowIso(),
    })
  }

  async getOnboardingMessages(sessionId: string): Promise<Array<{
    role: string; content: string; a2ui_json: string | null; field_key: string | null; field_value: string | null
  }>> {
    const entries = await this.col<OnboardingMessageDoc>('hl_onboarding_messages').scan({ prefix: `${sessionId}:` })
    return entries.map(e => ({
      role: e.doc.role,
      content: e.doc.content,
      a2ui_json: e.doc.a2ui_json,
      field_key: e.doc.field_key,
      field_value: e.doc.field_value,
    }))
  }

  // ─── Onboarding Progress (Incremental) ───────────────────────────────

  /**
   * Guarda el progreso incremental del onboarding paso a paso.
   * Se llama después de cada respuesta del usuario para persistir inmediatamente.
   */
  async saveOnboardingProgress(
    sessionId: string,
    step: 'nickname' | 'nombre' | 'edad' | 'tema' | 'objetivo' | 'energia' | 'tiempo_disponible' | 'estilo' | 'completo',
    fieldKey: string,
    fieldValue: string,
    perfilParcial?: Record<string, string>,
    metaParcial?: string,
    alumnoIdOverride?: string,
  ): Promise<void> {
    const now = nowIso()
    const perfilJson = perfilParcial ? JSON.stringify(perfilParcial) : null
    const metaJson = metaParcial ? JSON.stringify({ meta: metaParcial }) : null

    const col = this.col<OnboardingProgressDoc>('hl_onboarding_progress')
    const existingRows = await col.scan({ prefix: `${sessionId}:` })
    const latest = existingRows[existingRows.length - 1]

    let alumnoId = alumnoIdOverride ?? latest?.doc.alumno_id ?? null

    // Crear perfil provisional solo si aún no existe uno asociado a la sesión.
    if (!alumnoId && (step === 'nickname' || step === 'nombre')) {
      const seed = perfilParcial?.nickname ?? fieldValue
      const slug = seed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      alumnoId = `alumno_${slug}_${Date.now()}`
      await this.saveStudentProfile({
        alumnoId,
        nickname: step === 'nickname' ? fieldValue : perfilParcial?.nickname,
        nombre: step === 'nombre' ? fieldValue : (perfilParcial?.nombre ?? fieldValue),
        edad: 0,
        rangoEdad: 'adulto',
        tiempoSesion: 30,
        nivelPrevio: 'principiante',
        estilo: 'balanceado',
        sesionesTotal: 0,
        xpAcumulado: 0,
        nivelActual: 'Aprendiz',
      })
    }

    const seq = await nextSessionSeq('hl_onboarding_progress', sessionId)
    const rowId = `${sessionId}:${seq}`
    await col.put(rowId, {
      session_id: sessionId,
      alumno_id: alumnoId,
      step,
      field_key: fieldKey,
      field_value: fieldValue,
      perfil_json: perfilJson,
      meta_json: metaJson,
      completed: step === 'completo' ? 1 : 0,
      created_at: now,
      updated_at: now,
    })

    // Actualizar el registro más reciente con el perfil acumulado
    if (perfilParcial && alumnoId) {
      const inserted = await col.get(rowId)
      if (inserted) {
        await col.put(rowId, {
          ...inserted.doc,
          perfil_json: JSON.stringify(perfilParcial),
          updated_at: now,
        })
      }

      // Actualizar perfil del alumno incrementalmente
      if (step === 'edad') {
        const edad = parseInt(fieldValue, 10)
        const rangoEdad = edad <= 12 ? 'nino' : edad <= 17 ? 'adolescente' : 'adulto'
        const profiles = this.col<StudentProfileDoc>('hl_student_profiles')
        const profile = await profiles.get(alumnoId)
        if (profile) {
          await profiles.put(alumnoId, { ...profile.doc, edad, rango_edad: rangoEdad, updated_at: now })
        }
      }

      if (step === 'nombre') {
        const profiles = this.col<StudentProfileDoc>('hl_student_profiles')
        const profile = await profiles.get(alumnoId)
        if (profile) {
          await profiles.put(alumnoId, { ...profile.doc, nombre: fieldValue, updated_at: now })
        }
      }

      // Contexto de sesión viva: energía/humor y tiempo disponible desean
      // reflejarse en el perfil para que el coordinador dimensione la sesión.
      if (step === 'energia') {
        const energia = ['baja', 'media', 'alta'].includes(fieldValue.toLowerCase())
          ? (fieldValue.toLowerCase() as 'baja' | 'media' | 'alta')
          : 'media'
        const profiles = this.col<StudentProfileDoc>('hl_student_profiles')
        const profile = await profiles.get(alumnoId)
        if (profile) {
          await profiles.put(alumnoId, { ...profile.doc, energia_ultima: energia, updated_at: now })
        }
      }

      if (step === 'tiempo_disponible') {
        const minutos = parseInt(fieldValue, 10)
        if (Number.isFinite(minutos) && minutos > 0) {
          // Normaliza a los buckets soportados por el planificador (15/30/45)
          const tiempoSesion = (minutos <= 20 ? 15 : minutos <= 37 ? 30 : 45) as 15 | 30 | 45
          const profiles = this.col<StudentProfileDoc>('hl_student_profiles')
          const profile = await profiles.get(alumnoId)
          if (profile) {
            await profiles.put(alumnoId, { ...profile.doc, tiempo_sesion: tiempoSesion, updated_at: now })
          }
        }
      }
    }
  }

  /**
   * Obtiene el último estado del onboarding para permitir reanudar.
   * Devuelve el progreso completo incluyendo perfil parcial y último paso completado.
   */
  async getOnboardingProgress(sessionId: string): Promise<{
    sessionId: string
    alumnoId: string | null
    lastStep: string | null
    camposCompletados: Record<string, string>
    perfilParcial: Record<string, string> | null
    metaParcial: string | null
    completado: boolean
  } | null> {
    const rows = await this.col<OnboardingProgressDoc>('hl_onboarding_progress').scan({ prefix: `${sessionId}:` })

    if (rows.length === 0) return null

    const camposCompletados: Record<string, string> = {}
    let perfilParcial: Record<string, string> | null = null
    let metaParcial: string | null = null
    let lastStep: string | null = null
    let alumnoId: string | null = null
    let completado = false

    for (const row of rows) {
      const doc = row.doc
      if (doc.field_key && doc.field_value) {
        camposCompletados[doc.field_key] = doc.field_value
      }
      if (doc.perfil_json) {
        perfilParcial = JSON.parse(doc.perfil_json)
      }
      if (doc.meta_json) {
        const parsed = JSON.parse(doc.meta_json)
        metaParcial = parsed.meta
      }
      if (doc.alumno_id) {
        alumnoId = doc.alumno_id
      }
      lastStep = doc.step
      if (doc.completed === 1) {
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
  async completeOnboarding(sessionId: string, perfilFinal: Record<string, string>, metaFinal: string): Promise<{ alumnoId: string; perfil: Record<string, string>; meta: string } | null> {
    const now = nowIso()
    const col = this.col<OnboardingProgressDoc>('hl_onboarding_progress')
    const existingRows = await col.scan({ prefix: `${sessionId}:` })
    const latest = existingRows[existingRows.length - 1]

    if (!latest?.doc.alumno_id) return null

    const alumnoId = latest.doc.alumno_id

    // Insertar registro final
    const seq = await nextSessionSeq('hl_onboarding_progress', sessionId)
    await col.put(`${sessionId}:${seq}`, {
      session_id: sessionId,
      alumno_id: alumnoId,
      step: 'completo',
      field_key: 'complete',
      field_value: 'complete',
      perfil_json: JSON.stringify(perfilFinal),
      meta_json: JSON.stringify({ meta: metaFinal }),
      completed: 1,
      created_at: now,
      updated_at: now,
    })

    // Actualizar perfil completo del alumno
    const perfil = perfilFinal as any
    const profiles = this.col<StudentProfileDoc>('hl_student_profiles')
    const profile = await profiles.get(alumnoId)
    if (profile) {
      await profiles.put(alumnoId, {
        ...profile.doc,
        edad: perfil.edad || 18,
        rango_edad: perfil.rangoEdad || 'adulto',
        nivel_previo: perfil.nivelPrevio || 'principiante',
        estilo: perfil.estilo || 'balanceado',
        updated_at: now,
      })
    }

    return { alumnoId, perfil: perfilFinal, meta: metaFinal }
  }

  /**
   * Verifica si hay un onboarding incompleto para un alumno.
   * Permite reanudar donde se quedó.
   */
  async hasIncompleteOnboarding(alumnoId: string): Promise<boolean> {
    const rows = await this.col<OnboardingProgressDoc>('hl_onboarding_progress').findBy('alumno_id', alumnoId)
    return rows.some(r => !r.doc.completed)
  }

  /**
   * Obtiene la sesión de onboarding incompleta para reanudar.
   */
  async getIncompleteOnboardingSession(alumnoId: string): Promise<string | null> {
    const rows = await this.col<OnboardingProgressDoc>('hl_onboarding_progress').findBy('alumno_id', alumnoId)
    const incomplete = rows
      .filter(r => !r.doc.completed)
      .sort((a, b) => (b.doc.updated_at ?? '').localeCompare(a.doc.updated_at ?? ''))
    return incomplete[0]?.doc.session_id ?? null
  }

  async rateSession(sessionId: string, rating: number, comentario?: string): Promise<void> {
    const col = this.col<SessionDoc>('hl_sessions')
    const existing = await col.get(sessionId)
    if (!existing) return
    await col.put(sessionId, {
      ...existing.doc,
      rating,
      rating_comentario: comentario ?? null,
    })
  }

  /** Devuelve sesión + curriculo completo (nodos_json) para el gateway */
  async getSessionWithCurriculum(sessionId: string): Promise<(SessionData & { nodosJson: string; topicSlug: string | null; metaAlumno: string }) | null> {
    const session = await this.col<SessionDoc>('hl_sessions').get(sessionId)
    if (!session) return null

    // JOIN hl_curricula c ON c.id = s.curriculo_id
    const curricula = await this.col<CurriculumDoc>('hl_curricula').scan()
    const curriculum = curricula.find(c => c.doc.id === session.doc.curriculo_id)

    return {
      ...this.toSessionData(session.id, session.doc),
      nodosJson: curriculum?.doc.nodos_json ?? '[]',
      topicSlug: curriculum?.doc.topic_slug ?? null,
      metaAlumno: curriculum?.doc.meta_alumno ?? '',
    }
  }

  // ─── Lesson Interactions (entrega WebSocket) ────────────────────────

  async saveInteraction(
    sessionId: string,
    turnIndex: number,
    sender: 'agent' | 'student',
    opts: { nodoId?: string; a2uiJson?: string; actionJson?: string; xpAwarded?: number; correcto?: boolean | null },
  ): Promise<void> {
    const paddedTurn = String(turnIndex).padStart(8, '0')
    await this.col<LessonInteractionDoc>('hl_lesson_interactions').put(`${sessionId}:${paddedTurn}`, {
      session_id: sessionId,
      turn_index: turnIndex,
      sender,
      nodo_id: opts.nodoId ?? null,
      a2ui_json: opts.a2uiJson ?? null,
      action_json: opts.actionJson ?? null,
      xp_awarded: opts.xpAwarded ?? 0,
      correcto: opts.correcto == null ? null : (opts.correcto ? 1 : 0),
      created_at: nowIso(),
    })
  }

  async getInteractions(sessionId: string): Promise<Array<{
    turn_index: number; sender: string; nodo_id: string | null
    a2ui_json: string | null; action_json: string | null
    xp_awarded: number; correcto: number | null
  }>> {
    const entries = await this.col<LessonInteractionDoc>('hl_lesson_interactions').scan({ prefix: `${sessionId}:` })
    return entries
      .sort((a, b) => a.doc.turn_index - b.doc.turn_index)
      .map(e => ({
        turn_index: e.doc.turn_index,
        sender: e.doc.sender,
        nodo_id: e.doc.nodo_id,
        a2ui_json: e.doc.a2ui_json,
        action_json: e.doc.action_json,
        xp_awarded: e.doc.xp_awarded,
        correcto: e.doc.correcto,
      }))
  }

  async getNextTurnIndex(sessionId: string): Promise<number> {
    const entries = await this.col<LessonInteractionDoc>('hl_lesson_interactions').scan({ prefix: `${sessionId}:` })
    const max = entries.reduce((acc, e) => Math.max(acc, e.doc.turn_index), -1)
    return max + 1
  }

  async getTopicEffectiveness(topicSlug: string | null): Promise<{ nodosConMasFallas: string[]; nivelPromedioAprobacion: number }> {
    if (!topicSlug) return { nodosConMasFallas: [], nivelPromedioAprobacion: 0 }

    const rows = await this.col<NodeEffectivenessDoc>('hl_node_effectiveness').findBy('tema', topicSlug)

    const rate = (doc: NodeEffectivenessDoc) => doc.veces_completado / Math.max(doc.veces_visto, 1)

    const worst = [...rows]
      .sort((a, b) => rate(a.doc) - rate(b.doc))
      .slice(0, 5)

    const nodosConMasFallas = worst
      .filter(r => r.doc.veces_visto > 2)
      .map(r => r.doc.tipo_pedagogico)

    const avgRate = rows.length > 0
      ? rows.reduce((acc, r) => acc + rate(r.doc), 0) / rows.length
      : null

    return {
      nodosConMasFallas,
      nivelPromedioAprobacion: avgRate != null ? Math.round(avgRate * 100) : 0,
    }
  }

  // ─── Metrics Dashboard ──────────────────────────────────────────────

  async getAggregateMetrics(): Promise<Record<string, any>> {
    const metricsEntries = await this.col<SessionMetricsDoc>('hl_session_metrics').scan()
    const all = metricsEntries.map(e => e.doc)
    const completed = all.filter(m => m.completada === 1)

    const avg = (values: number[]): number | null =>
      values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null

    const avgScore = avg(completed.map(m => m.puntaje_evaluacion).filter((v): v is number => v != null))
    const avgXP = avg(completed.map(m => m.xp_ganado))

    const effectiveness = await this.col<NodeEffectivenessDoc>('hl_node_effectiveness').scan()
    const hardestNodes = effectiveness
      .map(e => e.doc)
      .filter(d => d.veces_visto > 0)
      .map(d => ({
        tema: d.tema,
        tipo_pedagogico: d.tipo_pedagogico,
        veces_visto: d.veces_visto,
        veces_completado: d.veces_completado,
        tasa_abandono: 1.0 - (d.veces_completado / d.veces_visto),
      }))
      .sort((a, b) => b.tasa_abandono - a.tasa_abandono)
      .slice(0, 10)

    return {
      totalLessons: all.length,
      completedLessons: completed.length,
      completionRate: all.length > 0 ? (completed.length / all.length * 100).toFixed(1) : 0,
      avgScore: avgScore != null ? Number(avgScore).toFixed(1) : null,
      avgXP: avgXP != null ? Math.round(avgXP) : 0,
      hardestNodes,
    }
  }

  async getSessionsByAlumno(alumnoId: string): Promise<SessionData[]> {
    const entries = await this.col<SessionDoc>('hl_sessions').findBy('alumno_id', alumnoId)
    return entries
      .sort((a, b) => (b.doc.created_at ?? '').localeCompare(a.doc.created_at ?? ''))
      .map(e => this.toSessionData(e.id, e.doc))
  }
}
