/**
 * HiveLearn Program Handler — WebSocket
 *
 * Maneja el flujo completo de un programa de formación vía WebSocket:
 * 1. iniciar_programa → ejecuta swarm (profile + intent + structure)
 * 2. Envia eventos mundo:* al cliente vía WS
 * 3. Por cada zona, el agente correspondiente genera contenido A2UI
 * 4. El alumno responde por WS → evaluación → siguiente zona
 */

import type { ServerWebSocket } from 'bun'
import { logger } from '../utils/logger'
import { runHiveLearnAgent } from '../agent/runner'
import { AGENT_IDS } from '../agent/registry'
import { LessonPersistence } from '../storage/LessonPersistence'
import { getDb } from '../storage/sqlite'
import { hlSwarmEmitter } from '../events/swarm-events'
import type { MundoEvento, A2UIMessage } from '../types/a2ui-mundo.types'
import {
  buscarAlumnoPorNickname,
  crearAlumno,
  actualizarAlumno,
  type StudentProfile,
} from '../skills/gestionar-alumnos.skill'
import { runSwarmGeneration } from '../swarm/swarm-generator'
import { synthesize } from '../gateway/tts/logic'

const log = logger.child('program-ws')

// ─── Estado de sesiones activas ──────────────────────────────────────────────

interface ProgramSession {
  sessionId: string
  alumnoId: string
  nickname: string
  perfil: any
  meta: string
  estructura: any | null
  zonaActual: number
  modulosCompletados: string[]
  xpTotal: number
  logros: string[]
  ws: ServerWebSocket<any>
  startTime: number
}

const activeSessions = new Map<string, ProgramSession>()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendEvent(ws: ServerWebSocket<any>, event: MundoEvento) {
  ws.send(JSON.stringify({
    tipo: 'evento',
    agente_id: AGENT_IDS.coordinator,
    payload: { mundo_evento: event },
    timestamp: new Date().toISOString(),
  }))
}

function sendA2UI(ws: ServerWebSocket<any>, messages: A2UIMessage[], agenteId: string) {
  ws.send(JSON.stringify({
    tipo: 'contenido',
    agente_id: agenteId,
    payload: { a2ui_messages: messages },
    timestamp: new Date().toISOString(),
  }))
}

function sendError(ws: ServerWebSocket<any>, mensaje: string, recuperable = true) {
  ws.send(JSON.stringify({
    tipo: 'error',
    agente_id: AGENT_IDS.coordinator,
    payload: {
      mundo_evento: {
        tipo: 'mundo:error',
        datos: { codigo: 'servidor', mensaje, recuperable, accion_sugerida: 'reintentar' },
      },
    },
    timestamp: new Date().toISOString(),
  }))
}

// ─── Fase 1: Ejecutar swarm inicial (profile + intent + structure) ───────────

async function ejecutarSwarmInicial(
  session: ProgramSession
): Promise<{ estructura: any; tema: string } | null> {
  try {
    // Profile + Intent (pueden ejecutarse en paralelo o secuencial)
    log.info('[program] Ejecutando ProfileAgent', { sessionId: session.sessionId })

    const profileOutput = await runHiveLearnAgent({
      agentId: AGENT_IDS.profile,
      taskDescription: `Perfil del alumno: ${JSON.stringify(session.perfil)}`,
      systemPrompt: '',
      tools: [],
      threadId: session.sessionId,
    })

    log.info('[program] Ejecutando IntentAgent', { sessionId: session.sessionId })

    const intentOutput = await runHiveLearnAgent({
      agentId: AGENT_IDS.intent,
      taskDescription: `Meta del alumno: ${session.meta}`,
      systemPrompt: '',
      tools: [],
      threadId: session.sessionId,
    })

    // StructureAgent: genera la estructura del mundo
    log.info('[program] Ejecutando StructureAgent', { sessionId: session.sessionId })

    const structurePrompt = `
Perfil del alumno: ${profileOutput}
Intención detectada: ${intentOutput}
Meta: ${session.meta}

Diseña la estructura del Mundo de Aprendizaje PixiJS en formato JSON.
`

    const structureOutput = await runHiveLearnAgent({
      agentId: AGENT_IDS.structure,
      taskDescription: structurePrompt,
      systemPrompt: '',
      tools: [],
      threadId: session.sessionId,
    })

    // Parsear JSON de la estructura
    let estructura: any
    try {
      // Intentar extraer JSON si viene envuelto en markdown
      const jsonMatch = structureOutput.match(/```json\n?([\s\S]*?)\n?```/) ||
                        structureOutput.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : structureOutput
      estructura = JSON.parse(jsonStr)
    } catch {
      log.error('[program] Error parseando estructura', { output: structureOutput.slice(0, 200) })
      return null
    }

    // Extraer tema
    const tema = estructura?.titulo_programa || session.meta

    // Guardar en BD
    const persistence = new LessonPersistence()
    persistence.saveCurriculum(session.sessionId, JSON.stringify(session.perfil), JSON.stringify(estructura.zonas || []), estructura.zonas?.length || 0, session.perfil?.rangoEdad || 'adulto', null)
    persistence.createSession(session.sessionId, session.alumnoId, 0, session.perfil?.rangoEdad || 'adulto')

    return { estructura, tema }
  } catch (err) {
    log.error('[program] Error en swarm inicial', { error: (err as Error).message })
    return null
  }
}

// ─── Fase 2: Generar contenido de una zona ───────────────────────────────────

async function generarContenidoZona(
  session: ProgramSession,
  zona: any
): Promise<A2UIMessage[]> {
  try {
    const agenteId = zona.agente_id || AGENT_IDS.explanation

    log.info('[program] Generando contenido zona', {
      sessionId: session.sessionId,
      zona: zona.numero,
      agente: agenteId,
    })

    const taskDescription = `
Zona ${zona.numero}: ${zona.titulo}
Concepto: ${zona.concepto}
Tipo pedagógico: ${zona.tipo_pedagogico}
Tipo visual: ${zona.tipo_visual}
Perfil alumno: ${JSON.stringify(session.perfil)}
Meta: ${session.meta}

Genera el contenido educativo para esta zona del mundo de aprendizaje.
Responde con mensajes A2UI v0.8 (surfaceUpdate + dataModelUpdate + beginRendering).
`

    const output = await runHiveLearnAgent({
      agentId: agenteId,
      taskDescription,
      systemPrompt: '',
      tools: [],
      threadId: session.sessionId,
    })

    // Parsear mensajes A2UI del output
    let messages: A2UIMessage[] = []
    try {
      const jsonMatch = output.match(/```json\n?([\s\S]*?)\n?```/) || output.match(/\[[\s\S]*\]/)
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : output
      const parsed = JSON.parse(jsonStr)
      messages = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      // Fallback: envolver output como texto simple
      messages = [{
        surfaceUpdate: {
          surfaceId: `zona-${zona.numero}`,
          components: [{
            id: 'contenido',
            component: {
              Text: { text: { literalString: output }, usageHint: 'body' },
            },
          }],
        },
      }]
    }

    return messages
  } catch (err) {
    log.error('[program] Error generando contenido zona', { error: (err as Error).message })
    return [{
      surfaceUpdate: {
        surfaceId: `zona-${zona.numero}`,
        components: [{
          id: 'error',
          component: {
            Text: { text: { literalString: 'Error cargando contenido. Intenta de nuevo.' }, usageHint: 'body' },
          },
        }],
      },
    }]
  }
}

// ─── Fase 3: Evaluar respuesta del alumno ────────────────────────────────────

async function evaluarRespuesta(
  session: ProgramSession,
  respuesta: string,
  zona: any
): Promise<{ correcto: boolean; xp: number; feedback: string }> {
  try {
    const taskDescription = `
Respuesta del alumno: "${respuesta}"
Concepto evaluado: ${zona.concepto}
Tipo pedagógico: ${zona.tipo_pedagogico}

Evalúa si el alumno COMPRENDE el concepto (no si la respuesta es literalmente exacta).
Responde en JSON: { "correcto": boolean, "xp": number (0-50), "feedback": string }
`

    const output = await runHiveLearnAgent({
      agentId: AGENT_IDS.feedback,
      taskDescription,
      systemPrompt: '',
      tools: [],
      threadId: session.sessionId,
    })

    let result = { correcto: false, xp: 0, feedback: 'Error en evaluación.' }
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? jsonMatch[0] : output
      result = JSON.parse(jsonStr)
    } catch {
      // fallback
    }

    return result
  } catch (err) {
    log.error('[program] Error evaluando respuesta', { error: (err as Error).message })
    return { correcto: true, xp: zona.xp_recompensa || 10, feedback: '¡Buen intento! Continuemos.' }
  }
}

// ─── Flujo principal: iniciar programa ───────────────────────────────────────

export async function iniciarPrograma(
  ws: ServerWebSocket<any>,
  data: { perfil: any; meta: string; session_id?: string; alumno_id?: string }
): Promise<void> {
  const sessionId = data.session_id || `prog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const alumnoId = data.alumno_id || `alumno-${Date.now()}`
  const nickname = data.perfil?.nickname || 'Alumno'

  log.info('[program] Iniciando programa', { sessionId, meta: data.meta })

  const session: ProgramSession = {
    sessionId,
    alumnoId,
    nickname,
    perfil: data.perfil,
    meta: data.meta,
    estructura: null,
    zonaActual: 0,
    modulosCompletados: [],
    xpTotal: 0,
    logros: [],
    ws,
    startTime: Date.now(),
  }

  activeSessions.set(sessionId, session)

  // Fase 1: Swarm inicial
  const resultado = await ejecutarSwarmInicial(session)

  if (!resultado) {
    sendError(ws, 'No se pudo generar la estructura del programa.', true)
    return
  }

  session.estructura = resultado.estructura

  // Enviar bienvenida
  sendEvent(ws, {
    tipo: 'mundo:bienvenida',
    datos: {
      nickname,
      avatar: data.perfil?.avatar || '',
      mensaje_agente: `¡Bienvenido al mundo de aprendizaje de ${resultado.tema}!`,
      programa_uuid: sessionId,
      tema: resultado.tema,
      nivel_previo: data.perfil?.nivel || 'principiante',
    },
  })

  // Enviar zonas
  const zonas = resultado.estructura.zonas || []
  for (const zona of zonas) {
    sendEvent(ws, {
      tipo: 'mundo:abrir_modulo',
      datos: {
        modulo_uuid: `modulo-${zona.numero}`,
        titulo: zona.titulo,
        agente_id: zona.agente_id,
        zona_numero: zona.numero,
        tipo_pedagogico: zona.tipo_pedagogico,
        xp_recompensa: zona.xp_recompensa,
        animacion: 'apertura',
      },
    })
  }

  // Abrir primera zona
  await abrirZona(session, 0)
}

// ─── Abrir zona específica ───────────────────────────────────────────────────

async function abrirZona(session: ProgramSession, zonaNumero: number): Promise<void> {
  const zonas = session.estructura?.zonas || []
  const zona = zonas[zonaNumero]

  if (!zona) {
    // Todas las zonas completadas
    await completarPrograma(session)
    return
  }

  session.zonaActual = zonaNumero

  // Generar contenido A2UI
  const messages = await generarContenidoZona(session, zona)

  sendA2UI(session.ws, messages, zona.agente_id || AGENT_IDS.explanation)
}

// ─── Procesar respuesta del alumno ───────────────────────────────────────────

export async function procesarRespuesta(
  ws: ServerWebSocket<any>,
  data: { session_id: string; respuesta: string; zona_numero: number }
): Promise<void> {
  const session = activeSessions.get(data.session_id)
  if (!session) {
    sendError(ws, 'Sesión no encontrada.', false)
    return
  }

  const zonas = session.estructura?.zonas || []
  const zona = zonas[data.zona_numero]

  if (!zona) {
    sendError(ws, 'Zona no encontrada.', false)
    return
  }

  // Evaluar respuesta
  const evaluacion = await evaluarRespuesta(session, data.respuesta, zona)

  // Actualizar progreso
  session.xpTotal += evaluacion.xp
  session.modulosCompletados.push(`modulo-${zona.numero}`)

  // Enviar resultado
  sendEvent(session.ws, {
    tipo: 'mundo:resultado',
    datos: {
      calificacion: evaluacion.correcto ? 'correcto' : 'incorrecto',
      xp: evaluacion.xp,
      feedback: evaluacion.feedback,
      siguiente: {
        modulo_uuid: `modulo-${zona.numero + 1}`,
        zona_numero: zona.numero + 1,
        animacion_transicion: 'caminar',
      },
    },
  })

  // Abrir siguiente zona después de un delay
  setTimeout(() => {
    abrirZona(session, zona.numero + 1)
  }, 1500)
}

// ─── Completar programa ──────────────────────────────────────────────────────

async function completarPrograma(session: ProgramSession): Promise<void> {
  const tiempoTotal = Date.now() - session.startTime
  const precision = session.modulosCompletados.length > 0
    ? Math.round((session.modulosCompletados.length / (session.estructura?.zonas?.length || 1)) * 100)
    : 0

  sendEvent(session.ws, {
    tipo: 'mundo:completar',
    datos: {
      programa_uuid: session.sessionId,
      resumen_final: {
        xp_total: session.xpTotal,
        nivel_alcanzado: `Nivel ${Math.floor(session.xpTotal / 100) + 1}`,
        logros_obtenidos: session.logros.length,
        tiempo_total_ms: tiempoTotal,
        precision,
      },
      mensaje_final: `¡Felicitaciones ${session.nickname}! Has completado el programa de aprendizaje.`,
      proximos_pasos: ['Explorar nuevo tema', 'Revisar progreso', 'Compartir logros'],
    },
  })

  // Guardar métricas en BD
  const persistence = new LessonPersistence()
  persistence.saveSessionMetrics({
    sessionId: session.sessionId,
    alumnoId: session.alumnoId,
    curriculoId: 0,
    tema: session.meta,
    duracionRealSeg: Math.floor(tiempoTotal / 1000),
    nodosTotal: session.estructura?.zonas?.length || 0,
    nodosCompletados: session.modulosCompletados.length,
    puntajeEvaluacion: precision,
    intentosPorNodo: '{}',
    nodosDominados: '',
    nodosDificiles: '',
    logrosDesbloqueados: JSON.stringify(session.logros),
    xpGanado: session.xpTotal,
    completada: true,
  })

  activeSessions.delete(session.sessionId)
}

// ─── Pausar / Reanudar ───────────────────────────────────────────────────────

export function pausarPrograma(sessionId: string): void {
  const session = activeSessions.get(sessionId)
  if (!session) return

  const persistence = new LessonPersistence()
  persistence.pauseSession(sessionId, `zona-${session.zonaActual}`, JSON.stringify({
    zonaActual: session.zonaActual,
    modulosCompletados: session.modulosCompletados,
    xpTotal: session.xpTotal,
    logros: session.logros,
  }))
}

export async function reanudarPrograma(
  ws: ServerWebSocket<any>,
  sessionId: string
): Promise<void> {
  const persistence = new LessonPersistence()
  const sessionData = persistence.getSession(sessionId)
  if (!sessionData) {
    sendError(ws, 'Sesión no encontrada.', false)
    return
  }

  const curriculum = persistence.getCurriculumBySessionId(sessionId)
  if (!curriculum) {
    sendError(ws, 'Currículo no encontrado para esta sesión.', false)
    return
  }

  const profile = persistence.getStudentProfile(sessionData.alumnoId)
  if (!profile) {
    sendError(ws, 'Perfil del alumno no encontrado.', false)
    return
  }

  // Parsear zonas desde nodos_json del currículo
  let zonas: any[] = []
  try {
    const parsed = JSON.parse(curriculum.nodos_json || '[]')
    zonas = Array.isArray(parsed) ? parsed : []
  } catch {
    sendError(ws, 'Error parseando estructura del programa.', false)
    return
  }

  // Determinar zona actual desde estado pausado o nodos completados
  const stateRestored = persistence.restoreSessionState(sessionId)
  const zonaActual = stateRestored?.lastNodeId
    ? parseInt(stateRestored.lastNodeId.replace('zona-', '').replace('modulo-', '')) || 0
    : sessionData.nodosCompletados || 0

  // Reconstruir ProgramSession
  const session: ProgramSession = {
    sessionId,
    alumnoId: sessionData.alumnoId,
    nickname: profile.nickname || profile.nombre || 'Alumno',
    perfil: profile,
    meta: sessionData.tema || 'Aprendizaje',
    estructura: { zonas },
    zonaActual,
    modulosCompletados: [],
    xpTotal: sessionData.xpTotal,
    logros: JSON.parse(sessionData.logrosJson || '[]'),
    ws,
    startTime: Date.now(),
  }

  activeSessions.set(sessionId, session)

  // Enviar bienvenida
  sendEvent(ws, {
    tipo: 'mundo:bienvenida',
    datos: {
      nickname: session.nickname,
      avatar: profile.avatar || '',
      mensaje_agente: `¡Bienvenido de vuelta, ${session.nickname}! Continuamos con ${session.meta}.`,
      programa_uuid: sessionId,
      tema: session.meta,
      nivel_previo: profile.ritmoAtencion || 'principiante',
      reanudado: true,
    },
  })

  // Abrir zonas previas como completadas
  for (let i = 0; i < zonaActual && i < zonas.length; i++) {
    const zona = zonas[i]
    session.modulosCompletados.push(`modulo-${zona.numero ?? i + 1}`)
    sendEvent(ws, {
      tipo: 'mundo:abrir_modulo',
      datos: {
        modulo_uuid: `modulo-${zona.numero ?? i + 1}`,
        titulo: zona.titulo || `Zona ${i + 1}`,
        agente_id: zona.agente_id || AGENT_IDS.explanation,
        zona_numero: zona.numero ?? i + 1,
        tipo_pedagogico: zona.tipo_pedagogico || 'concepto',
        xp_recompensa: zona.xp_recompensa || 10,
        animacion: 'apertura',
        estado: 'completado',
      },
    })
  }

  // Abrir zona actual
  if (zonaActual < zonas.length) {
    sendEvent(ws, {
      tipo: 'mundo:abrir_modulo',
      datos: {
        modulo_uuid: `modulo-${zonas[zonaActual].numero ?? zonaActual + 1}`,
        titulo: zonas[zonaActual].titulo || `Zona ${zonaActual + 1}`,
        agente_id: zonas[zonaActual].agente_id || AGENT_IDS.explanation,
        zona_numero: zonas[zonaActual].numero ?? zonaActual + 1,
        tipo_pedagogico: zonas[zonaActual].tipo_pedagogico || 'concepto',
        xp_recompensa: zonas[zonaActual].xp_recompensa || 10,
        animacion: 'apertura',
        estado: 'disponible',
      },
    })

    // Generar y enviar contenido A2UI de zona actual
    await abrirZona(session, zonaActual)
  } else {
    // Todas las zonas completadas
    await completarPrograma(session)
  }
}

// ─── Helpers para respuestas WS ──────────────────────────────────────────────

function sendReply(ws: ServerWebSocket<any>, tipo: string, payload: Record<string, any>) {
  ws.send(JSON.stringify({ tipo, payload, timestamp: new Date().toISOString() }))
}

// ─── Handlers CRUD ───────────────────────────────────────────────────────────

async function handleBuscarNickname(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const nickname = data.nickname?.trim()
    if (!nickname) {
      sendReply(ws, 'buscar_nickname_result', { ok: false, error: 'Nickname requerido' })
      return
    }
    const profile = await buscarAlumnoPorNickname(nickname)
    sendReply(ws, 'buscar_nickname_result', {
      ok: true,
      found: !!profile,
      profile,
    })
  } catch (err) {
    log.error('[program] Error en buscar_nickname', { error: (err as Error).message })
    sendReply(ws, 'buscar_nickname_result', { ok: false, error: 'Error interno del servidor' })
  }
}

async function handleCrearAlumno(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const { nombre, nickname, edad } = data
    if (!nombre?.trim() || !nickname?.trim() || !edad) {
      sendReply(ws, 'crear_alumno_result', { ok: false, error: 'Nombre, nickname y edad son requeridos' })
      return
    }
    const alumnoId = crypto.randomUUID()
    const avatar = Number(edad) <= 12 ? '🧒' : Number(edad) <= 17 ? '🧑' : '👤'
    await crearAlumno({
      alumnoId,
      nombre: nombre.trim(),
      nickname: nickname.trim(),
      avatar,
      edad: Number(edad),
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
    } as StudentProfile)
    sendReply(ws, 'crear_alumno_result', {
      ok: true,
      alumnoId,
      perfil: {
        alumnoId,
        nombre: nombre.trim(),
        nickname: nickname.trim(),
        avatar,
        edad: Number(edad),
        estado: 'activo',
        sesionesTotal: 0,
        xpAcumulado: 0,
      },
    })
  } catch (err) {
    log.error('[program] Error en crear_alumno', { error: (err as Error).message })
    sendReply(ws, 'crear_alumno_result', { ok: false, error: 'Error al crear alumno' })
  }
}

async function handleActualizarAlumno(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const { alumnoId, ...updates } = data
    if (!alumnoId) {
      sendReply(ws, 'actualizar_alumno_result', { ok: false, error: 'alumnoId requerido' })
      return
    }
    await actualizarAlumno(alumnoId, updates)
    sendReply(ws, 'actualizar_alumno_result', { ok: true })
  } catch (err) {
    log.error('[program] Error en actualizar_alumno', { error: (err as Error).message })
    sendReply(ws, 'actualizar_alumno_result', { ok: false, error: 'Error al actualizar alumno' })
  }
}

async function handleCrearSesion(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const { alumnoId, sessionId, tema, objetivo } = data
    if (!alumnoId || !sessionId || !tema?.trim()) {
      sendReply(ws, 'crear_sesion_result', { ok: false, error: 'alumnoId, sessionId y tema son requeridos' })
      return
    }
    const persistence = new LessonPersistence()
    persistence.createSessionWithMeta(sessionId, alumnoId, tema.trim(), objetivo?.trim() || `Aprender ${tema.trim()}`)
    persistence.saveProgram(sessionId, alumnoId, sessionId, '{}', 0)
    sendReply(ws, 'crear_sesion_result', {
      ok: true,
      sessionId,
      programa_uuid: sessionId,
    })
  } catch (err) {
    log.error('[program] Error en crear_sesion', { error: (err as Error).message })
    sendReply(ws, 'crear_sesion_result', { ok: false, error: 'Error al crear sesión' })
  }
}

async function handleIniciarSesion(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const sessionId = data.session_id || crypto.randomUUID()
    const alumnoId = data.alumno_id
    log.info('[program] Sesión de juego iniciada', { sessionId, alumnoId })
    sendReply(ws, 'iniciar_sesion_result', {
      ok: true,
      sessionId,
      mensaje: 'Sesión de juego iniciada',
    })
  } catch (err) {
    log.error('[program] Error en iniciar_sesion', { error: (err as Error).message })
    sendReply(ws, 'iniciar_sesion_result', { ok: false, error: 'Error al iniciar sesión' })
  }
}

async function handleIniciarGeneracion(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const { perfil, meta, sessionId, alumnoId } = data
    if (!perfil || !meta) {
      sendReply(ws, 'generacion_iniciada', { ok: false, error: 'perfil y meta son requeridos' })
      return
    }
    const swarmId = sessionId ?? `swarm-${Date.now()}`
    runSwarmGeneration(perfil, meta, swarmId).catch(
      (e: Error) => log.error('Swarm generation failed', { swarmId, error: e.message })
    )
    sendReply(ws, 'generacion_iniciada', { ok: true, swarmId })
  } catch (err) {
    log.error('[program] Error en iniciar_generacion', { error: (err as Error).message })
    sendReply(ws, 'generacion_iniciada', { ok: false, error: 'Error al iniciar generación' })
  }
}

async function handleObtenerPrograma(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const { alumnoId } = data
    if (!alumnoId) {
      sendReply(ws, 'programa_recibido', { ok: false, error: 'alumnoId requerido' })
      return
    }
    const persistence = new LessonPersistence()
    const sessions = persistence.getAllSessions({ nickname: undefined })
    const alumnoSessions = sessions.filter((s: any) => s.alumno_id === alumnoId)
    if (alumnoSessions.length === 0) {
      sendReply(ws, 'programa_recibido', { ok: false, error: 'No hay sesiones para este alumno' })
      return
    }
    const latestSession = alumnoSessions[alumnoSessions.length - 1]
    sendReply(ws, 'programa_recibido', {
      ok: true,
      sessionId: latestSession.session_id,
      programa_uuid: latestSession.session_id,
      tema: latestSession.meta || '',
      xp_total: latestSession.xp_total ?? 0,
      nodos_completados: latestSession.nodos_completados ?? 0,
      total_nodos: latestSession.total_nodos ?? 0,
      completada: !!latestSession.completada,
    })
  } catch (err) {
    log.error('[program] Error en obtener_programa', { error: (err as Error).message })
    sendReply(ws, 'programa_recibido', { ok: false, error: 'Error al obtener programa' })
  }
}

async function handleSyncProgress(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const { alumnoId, racha, zonaActual, modulosCompletados, beeState, dificultadActual, xpAcumulado } = data
    if (!alumnoId) {
      sendReply(ws, 'progreso_sync_ok', { ok: false, error: 'alumnoId requerido' })
      return
    }
    const db = getDb()
    const sets: string[] = []
    const values: any[] = []
    if (racha !== undefined) { sets.push('racha_actual = ?'); values.push(racha) }
    if (zonaActual !== undefined) { sets.push('zona_actual = ?'); values.push(zonaActual) }
    if (modulosCompletados !== undefined) { sets.push('modulos_completados_json = ?'); values.push(JSON.stringify(modulosCompletados)) }
    if (beeState !== undefined) { sets.push('bee_state = ?'); values.push(beeState) }
    if (dificultadActual !== undefined) { sets.push('dificultad_actual = ?'); values.push(dificultadActual) }
    if (xpAcumulado !== undefined) { sets.push('xp_acumulado = ?'); values.push(xpAcumulado) }
    if (sets.length > 0) {
      sets.push('updated_at = CURRENT_TIMESTAMP')
      values.push(alumnoId)
      db.query(`UPDATE hl_student_profiles SET ${sets.join(', ')} WHERE alumno_id = ?`).run(...values)
    }
    sendReply(ws, 'progreso_sync_ok', { ok: true })
  } catch (err) {
    log.error('[program] Error en sync_progress', { error: (err as Error).message })
    sendReply(ws, 'progreso_sync_ok', { ok: false, error: 'Error al sincronizar progreso' })
  }
}

async function handleTTS(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const { text, voice = 'sorah' } = data
    if (!text?.trim()) {
      sendReply(ws, 'tts:error', { error: 'Texto requerido para síntesis' })
      return
    }
    const audio = await synthesize(text.trim(), voice)
    const audioBase64 = Buffer.from(audio).toString('base64')
    sendReply(ws, 'tts:audio', { audioBase64, format: 'wav' })
  } catch (err) {
    log.error('[program] Error en tts:synthesize', { error: (err as Error).message })
    sendReply(ws, 'tts:error', { error: (err as Error).message })
  }
}

async function handleReanudarSesion(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const { alumnoId } = data
    if (!alumnoId) {
      sendReply(ws, 'reanudar_sesion_result', { ok: false, error: 'alumnoId requerido' })
      return
    }

    const persistence = new LessonPersistence()

    // 1. Buscar sesión activa del alumno
    const activeSession = persistence.getActiveSession(alumnoId)

    // 2. Si no hay activa, buscar la última sesión (activa o completada)
    let sessionData = activeSession
    if (!sessionData) {
      sessionData = persistence.getLastSessionForAlumno(alumnoId)
    }

    if (!sessionData) {
      sendReply(ws, 'reanudar_sesion_result', { ok: false, error: 'No hay sesiones para este alumno' })
      return
    }

    // 3. Verificar que tenga currículo (estructura generada)
    const curriculum = persistence.getCurriculumBySessionId(sessionData.sessionId)
    if (!curriculum) {
      sendReply(ws, 'reanudar_sesion_result', {
        ok: false,
        error: 'La sesión aún no tiene programa generado.',
        sessionId: sessionData.sessionId,
      })
      return
    }

    // 4. Reanudar programa
    await reanudarPrograma(ws, sessionData.sessionId)

    sendReply(ws, 'reanudar_sesion_result', {
      ok: true,
      sessionId: sessionData.sessionId,
      programa_uuid: sessionData.sessionId,
      tema: sessionData.tema,
      objetivo: sessionData.objetivo,
      xp_total: sessionData.xpTotal,
      completada: sessionData.completada,
    })
  } catch (err) {
    log.error('[program] Error en reanudar_sesion', { error: (err as Error).message })
    sendReply(ws, 'reanudar_sesion_result', { ok: false, error: 'Error al reanudar sesión' })
  }
}

async function handleSalirSesion(ws: ServerWebSocket<any>, data: any): Promise<void> {
  try {
    const { sessionId, alumnoId } = data
    if (!sessionId) {
      sendReply(ws, 'salir_sesion_result', { ok: false, error: 'sessionId requerido' })
      return
    }
    const persistence = new LessonPersistence()
    // Pausa suave: guarda timestamp sin borrar datos
    persistence.pauseSession(sessionId, data.lastNodeId || '', JSON.stringify({ alumnoId }))
    // Limpiar sesión activa en memoria
    activeSessions.delete(sessionId)
    sendReply(ws, 'salir_sesion_result', { ok: true, sessionId })
  } catch (err) {
    log.error('[program] Error en salir_sesion', { error: (err as Error).message })
    sendReply(ws, 'salir_sesion_result', { ok: false, error: 'Error al salir de sesión' })
  }
}

// ─── Router principal ────────────────────────────────────────────────────────

export async function handleProgramMessage(
  ws: ServerWebSocket<any>,
  data: any
): Promise<void> {
  const tipo = data?.tipo || data?.type

  switch (tipo) {
    case 'buscar_nickname':
      await handleBuscarNickname(ws, data)
      break
    case 'crear_alumno':
      await handleCrearAlumno(ws, data)
      break
    case 'actualizar_alumno':
      await handleActualizarAlumno(ws, data)
      break
    case 'crear_sesion':
      await handleCrearSesion(ws, data)
      break
    case 'iniciar_sesion':
      await handleIniciarSesion(ws, data)
      break
    case 'iniciar_generacion':
      await handleIniciarGeneracion(ws, data)
      break
    case 'obtener_programa':
      await handleObtenerPrograma(ws, data)
      break
    case 'reanudar_sesion':
      await handleReanudarSesion(ws, data)
      break
    case 'salir_sesion':
      await handleSalirSesion(ws, data)
      break
    case 'sync_progress':
      await handleSyncProgress(ws, data)
      break
    case 'tts:synthesize':
      await handleTTS(ws, data)
      break
    case 'iniciar_programa':
      await iniciarPrograma(ws, {
        perfil: data.perfil,
        meta: data.meta,
        session_id: data.session_id,
        alumno_id: data.alumno_id,
      })
      break
    case 'accion':
    case 'responder': {
      const payload = data.payload?.mundo_evento?.datos || data
      await procesarRespuesta(ws, {
        session_id: data.session_id || payload.session_id,
        respuesta: String(data.respuesta || payload.respuesta || ''),
        zona_numero: Number(data.zona_numero ?? payload.zona_numero ?? 0),
      })
      break
    }
    case 'heartbeat':
      ws.send(JSON.stringify({ tipo: 'pong', timestamp: Date.now() }))
      break
    default:
      log.warn('[program] Mensaje no reconocido', { tipo })
      sendReply(ws, 'error', { ok: false, error: `Tipo de mensaje no reconocido: ${tipo}` })
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export function cleanupProgramSession(sessionId: string): void {
  activeSessions.delete(sessionId)
}
