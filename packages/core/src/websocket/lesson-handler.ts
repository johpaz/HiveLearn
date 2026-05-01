/**
 * lesson-handler.ts — Conecta el mundo PixiJS con LessonDeliverySession.
 *
 * Hace dos cosas:
 *  1. Normaliza tool output → ServerMessage (formato que A2UIBridge espera)
 *  2. Normaliza ClientMessage → resolveStudentAction (para que el coordinador reciba la respuesta)
 */

import { LessonDeliverySession } from '../lesson/LessonDeliverySession'
import { LessonPersistence } from '../storage/LessonPersistence'
import { resolveStudentAction } from '../tools/coordinator/enviar-interaccion.tool'
import { logger } from '../utils/logger'
import type { ServerWebSocket } from 'bun'

const log = logger.child('lesson-ws')

const activeSessions = new Map<string, LessonDeliverySession>()

/**
 * Inicia la LessonDeliverySession cuando el mundo envía 'iniciar_sesion'.
 * Envía 'bienvenida' primero para que el mundo desbloquee la zona 0.
 */
export function startLessonSession(sessionId: string, ws: ServerWebSocket<any>): void {
  if (activeSessions.has(sessionId)) return

  // Enviar bienvenida al mundo antes de que el coordinador empiece
  try {
    const persistence = new LessonPersistence()
    const full = persistence.getSessionWithCurriculum(sessionId)
    const profile = full ? persistence.getStudentProfile(full.alumnoId) : null

    if (full && profile) {
      ws.send(JSON.stringify({
        tipo: 'bienvenida',
        session_id: sessionId,
        agente_id: 'coordinator',
        payload: {
          mundo_evento: {
            tipo: 'mundo:bienvenida',
            datos: {
              nickname: profile.nickname,
              tema: full.metaAlumno,
              nivel_previo: 'principiante',
            },
          },
        },
        timestamp: new Date().toISOString(),
      }))
    }
  } catch (e) {
    log.warn('[lesson] Could not send bienvenida', { sessionId, error: (e as Error).message })
  }

  const session = new LessonDeliverySession(sessionId, (msg) => {
    try {
      ws.send(JSON.stringify(normalizeToServerMessage(msg)))
    } catch (e) {
      log.error('[lesson] Send error', { sessionId, error: (e as Error).message })
    }
  })

  activeSessions.set(sessionId, session)

  session.start()
    .catch((e) => log.error('[lesson] Session error', { sessionId, error: (e as Error).message }))
    .finally(() => activeSessions.delete(sessionId))

  log.info('[lesson] Session started', { sessionId })
}

/**
 * Rutea mensajes 'accion' del mundo PixiJS al coordinador vía resolveStudentAction.
 */
export function handleLessonMessage(sessionId: string, data: any): void {
  if (data?.tipo !== 'accion') return

  const evento = data?.payload?.mundo_evento
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

/**
 * Convierte el output de las tools al formato ServerMessage que espera A2UIBridge.
 *
 * Tools envían:  { type: 'a2ui' | 'evaluation' | 'xp_award' | 'logro' | 'lesson_complete' | 'error', ... }
 * A2UIBridge espera: { tipo: 'contenido' | 'resultado' | 'evento' | 'error', payload: { ... } }
 */
function normalizeToServerMessage(msg: any): object {
  const base = {
    session_id: '',
    agente_id: 'coordinator',
    timestamp: new Date().toISOString(),
  }

  switch (msg?.type) {
    case 'a2ui':
      return {
        ...base,
        tipo: 'contenido',
        payload: { a2ui_messages: msg.messages ?? [] },
      }

    case 'evaluation':
      return {
        ...base,
        tipo: 'resultado',
        payload: {
          mundo_evento: {
            tipo: 'mundo:resultado',
            datos: {
              calificacion: msg.correcto ? 'correcto' : 'incorrecto',
              xp: 0,
              feedback: msg.mensaje ?? '',
              ...(msg.pista ? { pista: msg.pista } : {}),
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
            datos: {
              calificacion: 'correcto',
              xp: msg.amount ?? 0,
              feedback: '',
            },
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
              nombre:      msg.logro?.titulo       ?? '',
              descripcion: msg.logro?.descripcion  ?? '',
              icono:       msg.logro?.emoji        ?? '🏆',
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
                xp_total:          msg.xpTotal          ?? 0,
                nivel_alcanzado:   1,
                logros_obtenidos:  (msg.logros ?? []).length,
                nodos_completados: msg.nodosCompletados  ?? 0,
              },
              mensaje_final:  msg.mensaje ?? '¡Lección completada!',
              proximos_pasos: [],
            },
          },
        },
      }

    case 'error':
      return {
        ...base,
        tipo: 'error',
        payload: { mensaje: msg.message ?? 'Error desconocido' },
      }

    default:
      return { ...base, ...msg }
  }
}
