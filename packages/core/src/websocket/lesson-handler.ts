/**
 * lesson-handler.ts — Conecta el mundo PixiJS con el coordinador vía WebSocket.
 *
 * Al recibir 'iniciar_sesion':
 *   1. Carga el LessonProgram ya generado desde la BD
 *   2. Envía 'bienvenida' al mundo para desbloquear zona 0
 *   3. Lanza el coordinador en MODO ENTREGA con las 3 tools interactivas
 *
 * Al recibir mensajes 'accion' (respuestas del alumno):
 *   → Resuelve la promesa que tiene suspendida el coordinador
 *   → El coordinador evalúa, decide y continúa
 *
 * Normaliza formatos:
 *   - Tool output  → ServerMessage (que A2UIBridge espera)
 *   - ClientMessage → resolveStudentAction (que el coordinador espera)
 */

import type { ServerWebSocket } from 'bun'
import { runHiveLearnAgent } from '../agent/runner'
import { AGENT_IDS } from '../agent/registry'
import { AGENT_PROMPTS } from '../agent/prompts'
import { LessonPersistence } from '../storage/LessonPersistence'
import {
  createEnviarInteraccionTool,
  resolveStudentAction,
} from '../tools/coordinator/enviar-interaccion.tool'
import { createCompletarLeccionTool } from '../tools/coordinator/completar-leccion.tool'
import { createEvaluarRespuestaTool } from '../tools/coordinator/evaluar-respuesta.tool'
import { logger } from '../utils/logger'
import type { NodoLesson } from '../types'

const log = logger.child('lesson-ws')

// sessionId → cancelación activa
const activeSessions = new Map<string, { cancel: () => void }>()

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Inicia la sesión de entrega cuando el mundo envía 'iniciar_sesion'.
 */
export function startLessonSession(sessionId: string, ws: ServerWebSocket<any>): void {
  if (activeSessions.has(sessionId)) return

  let cancelled = false
  activeSessions.set(sessionId, {
    cancel: () => { cancelled = true },
  })

  runDelivery(sessionId, ws, () => cancelled)
    .catch((e) => log.error('[lesson] Delivery error', { sessionId, error: (e as Error).message }))
    .finally(() => activeSessions.delete(sessionId))

  log.info('[lesson] Session started', { sessionId })
}

/**
 * Rutea mensajes 'accion' del mundo al coordinador vía resolveStudentAction.
 */
export function handleLessonMessage(sessionId: string, data: unknown): void {
  const d = data as Record<string, any>
  if (d?.tipo !== 'accion') return

  const evento = d?.payload?.mundo_evento
  if (!evento) return

  if (evento.tipo === 'mundo:evaluar') {
    const { nodo_id, modulo_uuid, respuesta, intentos } = evento.datos ?? {}
    resolveStudentAction(sessionId, {
      name: 'evaluar',
      context: { nodo_id, modulo_uuid, respuesta, intentos },
      timestamp: Date.now(),
    })
  } else if (evento.tipo === 'mundo:actualizar_estado') {
    const { accion, contexto } = evento.datos ?? {}
    resolveStudentAction(sessionId, {
      name: accion ?? 'interaccion',
      context: contexto ?? {},
      timestamp: Date.now(),
    })
  }
}

/**
 * Cancela la sesión cuando el WebSocket se cierra.
 */
export function closeLessonSession(sessionId: string): void {
  const session = activeSessions.get(sessionId)
  if (session) {
    session.cancel()
    activeSessions.delete(sessionId)
    log.info('[lesson] Session closed', { sessionId })
  }
}

// ─── Loop de entrega ─────────────────────────────────────────────────────────

async function runDelivery(
  sessionId: string,
  ws: ServerWebSocket<any>,
  isCancelled: () => boolean,
): Promise<void> {
  const send = (msg: object) => {
    if (!isCancelled()) {
      try { ws.send(JSON.stringify(msg)) } catch { /* WS closed */ }
    }
  }

  const persistence = new LessonPersistence()
  const full = persistence.getSessionWithCurriculum(sessionId)

  if (!full) {
    send(toServerError('Sesión no encontrada'))
    return
  }

  const nodos: NodoLesson[] = JSON.parse(full.nodosJson || '[]')
  if (nodos.length === 0) {
    send(toServerError('El programa no tiene nodos'))
    return
  }

  const profile = persistence.getStudentProfile(full.alumnoId)

  // 1. Enviar bienvenida al mundo — desbloquea zona 0
  send({
    tipo: 'bienvenida',
    session_id: sessionId,
    agente_id: 'coordinator',
    payload: {
      mundo_evento: {
        tipo: 'mundo:bienvenida',
        datos: {
          nickname:    profile?.nickname  ?? 'Alumno',
          tema:        full.metaAlumno,
          nivel_previo: 'principiante',
        },
      },
    },
    timestamp: new Date().toISOString(),
  })

  // 2. Construir historial para el coordinador
  let turnIndex = persistence.getNextTurnIndex(sessionId)
  const interactions = persistence.getInteractions(sessionId)

  const historial = interactions.map((i) => {
    if (i.sender === 'agent') {
      return `Turno ${i.turn_index} (AGENTE): envió nodo ${i.nodo_id ?? '?'}`
    }
    const action = i.action_json ? JSON.parse(i.action_json) : {}
    return `Turno ${i.turn_index} (ALUMNO): acción="${action.name}", respuesta="${action.context?.respuesta ?? '-'}", correcto=${i.correcto}`
  }).join('\n')

  // 3. Crear tools conectadas al WebSocket
  let xpAcumulado = 0

  const enviarTool = createEnviarInteraccionTool(sessionId, (msg) => {
    send(normalizeToServerMessage(msg))
    const m = msg as Record<string, any>
    if (m.type === 'a2ui') {
      persistence.saveInteraction(sessionId, turnIndex++, 'agent', {
        nodoId: m.nodoId,
        a2uiJson: JSON.stringify(m.messages),
        xpAwarded: m.xpDisponible ?? 0,
      })
    }
  })

  const completarTool = createCompletarLeccionTool((msg) => {
    send(normalizeToServerMessage(msg))
  })

  const evaluarTool = createEvaluarRespuestaTool(
    (msg) => send(normalizeToServerMessage(msg)),
    () => xpAcumulado,
    (n) => { xpAcumulado += n },
  )

  // 4. Prompt del coordinador en MODO ENTREGA
  const now = new Date()
  const taskDescription = [
    `MODO ENTREGA — Conduce esta lección de forma interactiva en el mundo PixiJS.`,
    ``,
    `FECHA Y HORA: ${now.toISOString()} (${now.toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: true })})`,
    ``,
    `PERFIL DEL ALUMNO:`,
    `- nickname: ${profile?.nickname ?? 'Alumno'}`,
    `- meta: "${full.metaAlumno}"`,
    `- sessionId: "${sessionId}"`,
    ``,
    `PROGRAMA (${nodos.length} nodos):`,
    JSON.stringify(nodos.map((n) => ({
      id:              n.id,
      titulo:          n.titulo,
      tipoPedagogico:  n.tipoPedagogico,
      tipoVisual:      n.tipoVisual,
      concepto:        n.concepto,
      xpRecompensa:    n.xpRecompensa,
      contenido:       n.contenido,
    })), null, 2),
    ``,
    historial
      ? `HISTORIAL PREVIO:\n${historial}`
      : `HISTORIAL: Primera vez en esta lección.`,
    ``,
    `INSTRUCCIONES:`,
    `- Usa enviar_interaccion para entregar cada nodo como mensajes A2UI.`,
    `- El alumno responde en el mundo PixiJS. Su respuesta llega via la tool.`,
    `- Evalúa con evaluar_respuesta (correcto/incorrecto, XP, feedback, pista si falla).`,
    `- Si falla, puedes repetir el nodo con enfoque diferente o dar más contexto.`,
    `- Al terminar todos los nodos, llama completar_leccion.`,
  ].join('\n')

  // 5. Ejecutar el coordinador
  await runHiveLearnAgent({
    agentId:      AGENT_IDS.coordinator,
    taskDescription,
    systemPrompt: AGENT_PROMPTS[AGENT_IDS.coordinator] ?? '',
    tools:        [enviarTool, completarTool, evaluarTool],
    threadId:     `hl-lesson-${sessionId}`,
  })
}

// ─── Normalización de mensajes ────────────────────────────────────────────────

/**
 * Convierte el output de las tools al formato ServerMessage que A2UIBridge espera.
 *
 * Tools emiten:  { type: 'a2ui' | 'evaluation' | 'xp_award' | 'logro' | 'lesson_complete' | 'error' }
 * Bridge espera: { tipo: 'contenido' | 'resultado' | 'evento' | 'error', payload: {...} }
 */
function normalizeToServerMessage(msg: unknown): object {
  const m = msg as Record<string, any>
  const base = {
    session_id: '',
    agente_id:  'coordinator',
    timestamp:  new Date().toISOString(),
  }

  switch (m?.type) {
    case 'a2ui':
      return { ...base, tipo: 'contenido', payload: { a2ui_messages: m.messages ?? [] } }

    case 'evaluation':
      return {
        ...base,
        tipo: 'resultado',
        payload: {
          mundo_evento: {
            tipo: 'mundo:resultado',
            datos: {
              calificacion: m.correcto ? 'correcto' : 'incorrecto',
              xp:           0,
              feedback:     m.mensaje ?? '',
              ...(m.pista ? { pista: m.pista } : {}),
            },
          },
        },
      }

    case 'xp_award':
      return {
        ...base,
        tipo: 'resultado',
        payload: {
          mundo_evento: {
            tipo: 'mundo:resultado',
            datos: { calificacion: 'correcto', xp: m.amount ?? 0, feedback: '' },
          },
        },
      }

    case 'logro':
      return {
        ...base,
        tipo: 'evento',
        payload: {
          mundo_evento: {
            tipo: 'mundo:logro',
            datos: {
              nombre:      m.logro?.titulo      ?? '',
              descripcion: m.logro?.descripcion ?? '',
              icono:       m.logro?.emoji       ?? '🏆',
              xp_bonus:    0,
              rareza:      'comun',
            },
          },
        },
      }

    case 'lesson_complete':
      return {
        ...base,
        tipo: 'evento',
        payload: {
          mundo_evento: {
            tipo: 'mundo:completar',
            datos: {
              resumen_final: {
                xp_total:          m.xpTotal          ?? 0,
                nivel_alcanzado:   1,
                logros_obtenidos:  (m.logros ?? []).length,
                nodos_completados: m.nodosCompletados  ?? 0,
              },
              mensaje_final:  m.mensaje ?? '¡Lección completada!',
              proximos_pasos: [],
            },
          },
        },
      }

    case 'error':
      return { ...base, tipo: 'error', payload: { mensaje: m.message ?? 'Error desconocido' } }

    default:
      return { ...base, ...m }
  }
}

function toServerError(mensaje: string): object {
  return {
    tipo:       'error',
    session_id: '',
    agente_id:  'coordinator',
    payload:    { mensaje },
    timestamp:  new Date().toISOString(),
  }
}
