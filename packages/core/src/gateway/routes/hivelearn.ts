/**
 * HiveLearn routes
 */
import { getDb } from '../../storage/sqlite'
import { LessonPersistence, updateHiveLearnAgentsProviderModel, hlSwarmEmitter } from '../../index'
import { obtenerPrograma, crearPrograma } from '../../skills/gestionar-programas.skill'
import { crearAlumno } from '../../skills/gestionar-alumnos.skill'
import { logger } from '../../utils/logger'
import { runSwarmGeneration } from '../../swarm/swarm-generator'
import { addCorsHeaders } from './_helpers'

const log = logger.child('route:hivelearn')

export async function handleHiveLearn(req: Request, url: URL): Promise<Response | null> {
  // GET /api/hivelearn/config
  if (url.pathname === '/api/hivelearn/config' && req.method === 'GET') {
    try {
      const persistence = new LessonPersistence()
      const db = getDb()

      const tableExists = db.query(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='hl_agents'"
      ).get()

      if (!tableExists) {
        return addCorsHeaders(
          new Response(JSON.stringify({
            configured: false,
            providerId: null,
            modelId: null,
            notInitialized: true,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }

      const providerModel = persistence.getHiveLearnProviderModel()
      return addCorsHeaders(
        new Response(JSON.stringify({
          configured: !!providerModel,
          providerId: providerModel?.providerId,
          modelId: providerModel?.modelId,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      log.error('[hivelearn/config] Error', { error: (e as Error).message })
      return addCorsHeaders(
        new Response(JSON.stringify({
          error: (e as Error).message,
          configured: false,
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // POST /api/hivelearn/config
  if (url.pathname === '/api/hivelearn/config' && req.method === 'POST') {
    try {
      const body = await req.json() as { providerId: string; modelId: string }
      if (!body.providerId || !body.modelId) {
        return addCorsHeaders(
          new Response(JSON.stringify({
            error: 'providerId y modelId son requeridos'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }

      const db = getDb()
      updateHiveLearnAgentsProviderModel(db, body.providerId, body.modelId)

      return addCorsHeaders(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      log.error('[hivelearn/config] POST error', { error: (e as Error).message })
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // POST /api/hivelearn/generate
  if (url.pathname === '/api/hivelearn/generate' && req.method === 'POST') {
    try {
      const body = await req.json() as { perfil: any; meta: string; sessionId?: string }
      if (!body.perfil || !body.meta) {
        return addCorsHeaders(
          new Response(JSON.stringify({ error: 'perfil y meta son requeridos' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }
      const swarmId = body.sessionId ?? `swarm-${Date.now()}`
      runSwarmGeneration(body.perfil, body.meta, swarmId).catch(
        (e: Error) => log.error('Swarm generation failed', { swarmId, error: e.message })
      )
      return addCorsHeaders(
        new Response(JSON.stringify({ ok: true, swarmId }), {
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // GET /api/hivelearn/student-by-nickname
  if (url.pathname === '/api/hivelearn/student-by-nickname' && req.method === 'GET') {
    try {
      const { buscarAlumnoPorNickname } = await import('../../skills/gestionar-alumnos.skill')
      const nickname = url.searchParams.get('nickname')?.trim()
      if (!nickname) {
        return addCorsHeaders(
          new Response(JSON.stringify({ error: 'Nickname requerido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }

      const profile = await buscarAlumnoPorNickname(nickname)
      if (!profile) {
        return addCorsHeaders(
          new Response(JSON.stringify({ found: false }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }

      return addCorsHeaders(
        new Response(JSON.stringify({ found: true, profile }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // POST /api/hivelearn/student-profile
  if (url.pathname === '/api/hivelearn/student-profile' && req.method === 'POST') {
    try {
      const body = await req.json() as { nombre: string; nickname: string; edad: number }
      const avatar = body.edad <= 12 ? '🧒' : body.edad <= 17 ? '🧑' : '👤'
      const result = await crearAlumno({
        nombre: body.nombre.trim(),
        nickname: body.nickname.trim(),
        avatar,
        edad: Number(body.edad),
        estado: 'activo',
        sesionesTotal: 0,
        xpAcumulado: 0,
        idioma: 'es',
        intereses: [],
        avatarConfigJson: null,
        ritmoAtencion: 'normal',
        estiloAprendizaje: 'mixto',
        necesidadesEsp: 0,
        accesibilidadJson: '{}',
        creadoEn: new Date().toISOString(),
        ultimoAcceso: new Date().toISOString(),
      })
      if (!result.ok) throw new Error('No se pudo crear el perfil')
      const perfil = {
        alumnoId: result.alumnoId,
        nombre: body.nombre.trim(),
        nickname: body.nickname.trim(),
        avatar,
        edad: Number(body.edad),
        estado: 'activo' as const,
        sesionesTotal: 0,
        xpAcumulado: 0,
        creadoEn: new Date().toISOString(),
        ultimoAcceso: new Date().toISOString(),
      }
      return addCorsHeaders(
        new Response(JSON.stringify({ alumnoId: result.alumnoId, perfil }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // POST /api/hivelearn/session
  if (url.pathname === '/api/hivelearn/session' && req.method === 'POST') {
    try {
      const body = await req.json() as { alumnoId: string; sessionId?: string; tema: string; objetivo: string }
      const persistence = new LessonPersistence()
      const sessionId = persistence.createSessionWithMeta(body.sessionId, body.alumnoId, body.tema, body.objetivo)
      persistence.saveProgram(sessionId, body.alumnoId, sessionId, '{}', 0)
      return addCorsHeaders(
        new Response(JSON.stringify({ ok: true, sessionId, programa_uuid: sessionId }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // PUT /api/hivelearn/sync-progress
  if (url.pathname === '/api/hivelearn/sync-progress' && req.method === 'PUT') {
    try {
      const body = await req.json() as {
        alumnoId: string
        racha?: number
        zonaActual?: number
        modulosCompletados?: string[]
        beeState?: string
        dificultadActual?: string
        xpAcumulado?: number
      }
      if (!body.alumnoId) {
        return addCorsHeaders(
          new Response(JSON.stringify({ error: 'alumnoId requerido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }
      const db = getDb()
      const sets: string[] = []
      const values: any[] = []
      if (body.racha !== undefined) { sets.push('racha_actual = ?'); values.push(body.racha) }
      if (body.zonaActual !== undefined) { sets.push('zona_actual = ?'); values.push(body.zonaActual) }
      if (body.modulosCompletados !== undefined) { sets.push('modulos_completados_json = ?'); values.push(JSON.stringify(body.modulosCompletados)) }
      if (body.beeState !== undefined) { sets.push('bee_state = ?'); values.push(body.beeState) }
      if (body.dificultadActual !== undefined) { sets.push('dificultad_actual = ?'); values.push(body.dificultadActual) }
      if (body.xpAcumulado !== undefined) { sets.push('xp_acumulado = ?'); values.push(body.xpAcumulado) }
      if (sets.length > 0) {
        sets.push("updated_at = CURRENT_TIMESTAMP")
        values.push(body.alumnoId)
        db.query(`UPDATE hl_student_profiles SET ${sets.join(', ')} WHERE alumno_id = ?`).run(...values)
      }
      return addCorsHeaders(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // GET /api/hivelearn/student-profile/search
  if (url.pathname === '/api/hivelearn/student-profile/search' && req.method === 'GET') {
    try {
      const q = (url.searchParams.get('q') ?? '').trim()
      const db = getDb()
      const rows = db.query(`
        SELECT alumno_id, nombre, nickname, avatar, edad, estado, sesiones_total, xp_acumulado
        FROM hl_student_profiles
        WHERE nombre LIKE ? OR nickname LIKE ?
        ORDER BY ultimo_acceso DESC
        LIMIT 10
      `).all(`%${q}%`, `%${q}%`) as Record<string, unknown>[]
      const profiles = rows.map(r => ({
        alumnoId: r.alumno_id,
        nombre: r.nombre,
        nickname: r.nickname,
        avatar: r.avatar,
        edad: r.edad,
        estado: r.estado,
        sesionesTotal: r.sesiones_total,
        xpAcumulado: r.xp_acumulado,
      }))
      return addCorsHeaders(
        new Response(JSON.stringify({ profiles }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // GET /api/hivelearn/sessions
  if (url.pathname === '/api/hivelearn/sessions' && req.method === 'GET') {
    try {
      const persistence = new LessonPersistence()
      const q = url.searchParams.get('q') ?? undefined
      const nickname = url.searchParams.get('nickname') ?? undefined
      const sessions = persistence.getAllSessions({ q: q, nickname: nickname })
      return addCorsHeaders(
        new Response(JSON.stringify({ sessions }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      log.error('[hivelearn/sessions] Error', { error: (e as Error).message })
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // DELETE /api/hivelearn/sessions/:id
  if (url.pathname.startsWith('/api/hivelearn/sessions/') && req.method === 'DELETE') {
    try {
      const sessionId = url.pathname.split('/')[4]
      if (!sessionId) {
        return addCorsHeaders(
          new Response(JSON.stringify({ error: 'sessionId requerido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }
      const persistence = new LessonPersistence()
      const deleted = persistence.deleteSession(sessionId)
      if (!deleted) {
        return addCorsHeaders(
          new Response(JSON.stringify({ error: 'Sesión no encontrada' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }
      return addCorsHeaders(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      log.error('[hivelearn/sessions/:id] DELETE error', { error: (e as Error).message })
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // GET /api/hivelearn/agents
  if (url.pathname === '/api/hivelearn/agents' && req.method === 'GET') {
    try {
      const db = getDb()
      const agents = db.query(`
        SELECT id, name, description, system_prompt, role, provider_id, model_id, max_iterations, enabled, updated_at
        FROM hl_agents
        ORDER BY role DESC, name
      `).all()
      return addCorsHeaders(
        new Response(JSON.stringify({ agents }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      log.error('[hivelearn/agents] Error', { error: (e as Error).message })
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // PUT /api/hivelearn/agents/:id
  if (url.pathname.startsWith('/api/hivelearn/agents/') && req.method === 'PUT') {
    try {
      const agentId = url.pathname.split('/')[4]
      const body = await req.json() as {
        provider_id: string
        model_id: string
        max_iterations: number
        enabled: number
        system_prompt?: string
      }
      const db = getDb()
      db.query(`
        UPDATE hl_agents
        SET provider_id = ?, model_id = ?, max_iterations = ?, enabled = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(body.provider_id, body.model_id, body.max_iterations, body.enabled, body.system_prompt || null, agentId)
      return addCorsHeaders(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      log.error('[hivelearn/agents/:id] Error', { error: (e as Error).message })
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // GET /api/hivelearn/instance
  if (url.pathname === '/api/hivelearn/instance' && req.method === 'GET') {
    try {
      const instanceId = url.searchParams.get('instanceId')
      if (!instanceId) {
        return addCorsHeaders(
          new Response(JSON.stringify({ error: 'instanceId es requerido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }

      const db = getDb()
      const instance = db.query(
        'SELECT instance_id, provider_id, model_id, created_at FROM hl_instances WHERE instance_id = ?'
      ).get(instanceId) as any

      if (!instance) {
        return addCorsHeaders(
          new Response(JSON.stringify({
            error: 'Instancia no encontrada',
            configured: false
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }

      return addCorsHeaders(
        new Response(JSON.stringify({
          configured: true,
          instanceId: instance.instance_id,
          providerId: instance.provider_id,
          modelId: instance.model_id,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      log.error('[hivelearn/instance GET] Error', { error: (e as Error).message })
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // POST /api/hivelearn/instance
  if (url.pathname === '/api/hivelearn/instance' && req.method === 'POST') {
    try {
      const body = await req.json() as {
        instanceId: string
        providerId?: string
        modelId?: string
      }

      if (!body.instanceId) {
        return addCorsHeaders(
          new Response(JSON.stringify({ error: 'instanceId es requerido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }

      const db = getDb()
      const providerId = body.providerId || 'ollama'
      const modelId = body.modelId || 'gemma2:9b'

      db.query(`
        INSERT OR REPLACE INTO hl_instances (instance_id, provider_id, model_id, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(body.instanceId, providerId, modelId)

      return addCorsHeaders(
        new Response(JSON.stringify({
          ok: true,
          instanceId: body.instanceId,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      log.error('[hivelearn/instance POST] Error', { error: (e as Error).message })
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // GET /api/hivelearn/metrics
  if (url.pathname === '/api/hivelearn/metrics' && req.method === 'GET') {
    const startTime = Date.now()

    log.info('[GET /api/hivelearn/metrics]')

    try {
      const db = getDb()

      const totalSessionsRow = db.query('SELECT COUNT(*) as count FROM hl_sessions').get() as { count: number }
      const totalSessions = totalSessionsRow.count

      const completedRow = db.query('SELECT COUNT(*) as count FROM hl_sessions WHERE completada = 1').get() as { count: number }
      const completedSessions = completedRow.count

      const xpRow = db.query('SELECT COALESCE(SUM(xp_total), 0) as total FROM hl_sessions').get() as { total: number }
      const totalXp = xpRow.total

      const scoreRow = db.query('SELECT COALESCE(AVG(rating), 0) as avg FROM hl_sessions WHERE rating IS NOT NULL').get() as { avg: number }
      const avgScore = scoreRow.avg

      const completionRate = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0

      const metrics = {
        total_xp: totalXp || 0,
        avg_score: Math.round(avgScore * 10) / 10,
        completion_rate: Math.round(completionRate * 10) / 10,
        total_sessions: totalSessions,
        completed_sessions: completedSessions,
      }

      const duration = Date.now() - startTime
      log.debug('[GET /api/hivelearn/metrics] Success', {
        metrics,
        duration,
      })

      return addCorsHeaders(
        new Response(JSON.stringify(metrics), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        req
      )
    } catch (e) {
      const duration = Date.now() - startTime
      log.error('[hivelearn/metrics] Error', {
        error: (e as Error).message,
        stack: (e as Error).stack,
        duration,
      })
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        req
      )
    }
  }

  // GET /api/hivelearn/programs/:id
  if (url.pathname.startsWith('/api/hivelearn/programs/') && req.method === 'GET') {
    const programId = url.pathname.split('/')[4]
    try {
      const program = await obtenerPrograma(programId)
      if (!program) {
        return addCorsHeaders(
          new Response(JSON.stringify({ error: 'Program not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
          req
        )
      }
      return addCorsHeaders(
        new Response(JSON.stringify({ program }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  // POST /api/hivelearn/programs
  if (url.pathname === '/api/hivelearn/programs' && req.method === 'POST') {
    try {
      const body = await req.json() as any
      const result = await crearPrograma(body)
      return addCorsHeaders(
        new Response(JSON.stringify(result), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    } catch (e) {
      return addCorsHeaders(
        new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
        req
      )
    }
  }

  return null
}
