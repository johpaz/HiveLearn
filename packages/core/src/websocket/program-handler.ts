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
import { hlSwarmEmitter } from '../events/swarm-events'
import type { MundoEvento, A2UIMessage } from '../types/a2ui-mundo.types'

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
  // TODO: reconstruir sesión desde BD y continuar
  sendError(ws, 'Reanudación aún no implementada.', true)
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export function cleanupProgramSession(sessionId: string): void {
  activeSessions.delete(sessionId)
}
