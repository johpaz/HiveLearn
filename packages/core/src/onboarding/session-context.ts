/**
 * session-context — "Despertar de la Colmena" (Fase 0 del plan La Colmena Viva).
 *
 * hiveDB decide qué ve el alumno ANTES de preguntarle nada. Al abrir una sesión
 * se consulta el estado real del alumno (perfil, sesiones activas/pausadas,
 * generaciones interrumpidas, historial completado) y se enruta a una de estas
 * experiencias:
 *
 *  - nuevo                     → ritual completo con Maya
 *  - bienvenida                → alumno conocido, sin sesión activa
 *  - retomar                   → sesión pausada con progreso real
 *  - generacion_interrumpida   → run de generación interrumpido, retomable
 *  - graduacion                → terminó un programa; se sugiere el siguiente tema
 *
 * Todo lo que devuelve esta función proviene exclusivamente de hiveDB
 * (fuente de verdad). El saludo es una sugerencia de línea para Maya;
 * el LLM puede adornarla pero no inventar datos.
 */
import type { LessonPersistence } from '../storage/LessonPersistence'
import { listGenerationRuns } from '../agent/run-store'
import { getDb } from '../storage/hivedb'
import { logger } from '../utils/logger'

const log = logger.child('session-context')

export type SessionContextKind =
  | 'nuevo'
  | 'bienvenida'
  | 'retomar'
  | 'generacion_interrumpida'
  | 'graduacion'

interface SessionContextBase {
  kind: SessionContextKind
  /** Línea sugerida para Maya (voz + texto). Derivada de datos reales de BD. */
  saludo: string
}

export interface NuevoContext extends SessionContextBase {
  kind: 'nuevo'
}

export interface BienvenidaContext extends SessionContextBase {
  kind: 'bienvenida'
  alumnoId: string
  nombre: string
  nickname: string | null
  rangoEdad: string
  xpAcumulado: number
  nivelActual: string
  sesionesTotal: number
}

export interface RetomarContext extends SessionContextBase {
  kind: 'retomar'
  alumnoId: string
  nombre: string
  /** Para el tema visual adaptativo del juego */
  rangoEdad?: string | null
  energiaUltima?: string | null
  sessionId: string
  tema: string | null
  nodosCompletados: number
  totalNodos: number
  xpTotal: number
  pausedAt: string | null
  lastNodeId: string | null
}

export interface GeneracionInterrumpidaContext extends SessionContextBase {
  kind: 'generacion_interrumpida'
  alumnoId: string
  nombre: string
  rangoEdad?: string | null
  energiaUltima?: string | null
  sessionId: string
  tema: string | null
  startedAt: string
}

export interface GraduacionContext extends SessionContextBase {
  kind: 'graduacion'
  alumnoId: string
  nombre: string
  ultimoTema: string | null
  puntajeEvaluacion: number | null
  rating: number | null
  sugerencia: { slug: string; titulo: string } | null
}

export type SessionContext =
  | NuevoContext
  | BienvenidaContext
  | RetomarContext
  | GeneracionInterrumpidaContext
  | GraduacionContext

export interface SessionContextOptions {
  nickname?: string | null
  alumnoId?: string | null
}

// ─── helpers internos ────────────────────────────────────────────────────────

interface TopicDocLite {
  slug: string
  titulo: string
}

/** Catálogo activo de temas (hl_topics) — usado para sugerir el siguiente paso */
async function listActiveTopics(): Promise<TopicDocLite[]> {
  try {
    const entries = await getDb()
      .collection<{ titulo: string; activo: number }>('hl_topics')
      .scan()
    const out: TopicDocLite[] = []
    for (const entry of entries) {
      if (!entry.doc?.activo) continue
      out.push({ slug: entry.id, titulo: entry.doc.titulo })
    }
    return out
  } catch (e) {
    log.warn(`[context] listActiveTopics falló: ${(e as Error).message}`)
    return []
  }
}

/**
 * Busca el run de generación interrumpido más reciente entre las sesiones
 * del alumno. Los runs viven en hl_generation_runs indexados por sessionId.
 */
async function findInterruptedRun(
  persistence: LessonPersistence,
  alumnoId: string,
): Promise<GeneracionInterrumpidaContext | null> {
  try {
    const sessions = await persistence.getSessionsByAlumno(alumnoId)
    if (sessions.length === 0) return null

    const interrupted = await listGenerationRuns('interrupted')
    if (interrupted.length === 0) return null

    for (const session of sessions) {
      const run = interrupted.find((r) => r.sessionId === session.sessionId)
      if (!run) continue

      const curriculum = await persistence.getCurriculumBySessionId(session.sessionId)
      const tema = curriculum?.topic_slug ?? null
      return {
        kind: 'generacion_interrumpida',
        alumnoId,
        nombre: '',
        rangoEdad: null,
        energiaUltima: null,
        sessionId: session.sessionId,
        tema,
        startedAt: run.started_at,
        saludo:
          '¡Qué bueno verte! Mi enjambre quedó a mitad de la forja de tu programa' +
          (tema ? ` de ${tema}` : '') +
          '. ¿Lo terminamos ahora? Las abejas ya casi lo tenían listo.',
      }
    }
    return null
  } catch (e) {
    log.warn(`[context] findInterruptedRun falló: ${(e as Error).message}`)
    return null
  }
}

/** Sugiere un tema que el alumno aún no ha estudiado (por topic_slug de sus currícula) */
async function suggestNextTopic(
  persistence: LessonPersistence,
  alumnoId: string,
): Promise<TopicDocLite | null> {
  try {
    const sessions = await persistence.getSessionsByAlumno(alumnoId)
    const studiedSlugs = new Set<string>()
    for (const s of sessions) {
      const curriculum = await persistence.getCurriculumBySessionId(s.sessionId)
      if (curriculum?.topic_slug) studiedSlugs.add(curriculum.topic_slug)
    }
    const topics = await listActiveTopics()
    return topics.find((t) => !studiedSlugs.has(t.slug)) ?? topics[0] ?? null
  } catch (e) {
    log.warn(`[context] suggestNextTopic falló: ${(e as Error).message}`)
    return null
  }
}

/** Saludo de bienvenida adaptado al rango de edad */
function saludoBienvenida(nombre: string, rangoEdad: string): string {
  if (rangoEdad === 'nino') {
    return `¡Hola, ${nombre}! 🐝 Qué alegría verte otra vez por la colmena. ¿Quieres aprender algo nuevo hoy?`
  }
  if (rangoEdad === 'adolescente') {
    return `¡Qué bueno verte de vuelta, ${nombre}! La colmena te extrañaba. ¿Qué aprendemos hoy?`
  }
  return `Bienvenido de vuelta a la colmena, ${nombre}. ¿En qué quieres trabajar hoy?`
}

// ─── API principal ───────────────────────────────────────────────────────────

/**
 * Construye el contexto de sesión consultando hiveDB. Orden de prioridad:
 * 1. generacion_interrumpida (el enjambre dejó trabajo a medias)
 * 2. retomar (sesión activa/pausada con progreso)
 * 3. graduacion (terminó su último programa → sugerir siguiente tema)
 * 4. bienvenida (alumno conocido sin nada pendiente)
 * 5. nuevo (sin identidad → ritual completo)
 *
 * NUNCA lanza: ante error de BD devuelve { kind:'nuevo' } degradado a saludo
 * genérico para no bloquear el onboarding.
 */
export async function buildSessionContext(
  persistence: LessonPersistence,
  opts: SessionContextOptions = {},
): Promise<SessionContext> {
  try {
    // ── Identificar alumno ──
    let student = null as Awaited<ReturnType<typeof persistence.getStudentProfile>>
    if (opts.alumnoId) {
      student = await persistence.getStudentProfile(opts.alumnoId)
    }
    if (!student && opts.nickname) {
      student = await persistence.findStudentByNickname(opts.nickname)
    }

    if (!student) {
      return {
        kind: 'nuevo',
        saludo:
          '¡Bienvenido a la Gran Colmena del saber! 🐝 Soy Maya, tu abeja guía. ' +
          '¿Cuál es tu nickname o apodo? Así puedo buscarte si ya me conoces.',
      }
    }

    const nombre = student.nombre

    // ── 1) Generación interrumpida ──
    const interruptedRun = await findInterruptedRun(persistence, student.alumnoId)
    if (interruptedRun) {
      return {
        ...interruptedRun,
        nombre,
        rangoEdad: student.rangoEdad,
        energiaUltima: student.energiaUltima ?? null,
      }
    }

    // ── 2) Sesión activa/pausada ──
    const activeSession = await persistence.getActiveSession(student.alumnoId)
    if (activeSession?.sessionId) {
      const fullSession = await persistence.getSessionWithCurriculum(activeSession.sessionId)
      if (fullSession?.nodosJson) {
        const restored = await persistence.restoreSessionState(activeSession.sessionId)
        const totalNodos = (() => {
          try {
            return (JSON.parse(fullSession.nodosJson) as unknown[]).length
          } catch {
            return fullSession.nodosCompletados + 1
          }
        })()
        const restantes = Math.max(totalNodos - fullSession.nodosCompletados, 0)
        return {
          kind: 'retomar',
          alumnoId: student.alumnoId,
          nombre,
          rangoEdad: student.rangoEdad,
          energiaUltima: student.energiaUltima ?? null,
          sessionId: activeSession.sessionId,
          tema: fullSession.topicSlug,
          nodosCompletados: fullSession.nodosCompletados,
          totalNodos,
          xpTotal: fullSession.xpTotal,
          pausedAt: restored?.pausedAt ?? null,
          lastNodeId: restored?.lastNodeId ?? null,
          saludo:
            `¡Hola de nuevo, ${nombre}! 🐝 La última vez avanzaste hasta el nodo ` +
            `${fullSession.nodosCompletados} de ${totalNodos} de tu programa` +
            `${fullSession.topicSlug ? ` de ${fullSession.topicSlug}` : ''} ` +
            `(llevas ${fullSession.xpTotal} XP${restantes > 0 ? `, te faltan ${restantes} nodos` : ''}). ` +
            '¿Retomamos donde lo dejaste?',
        }
      }
    }

    // ── 3) Graduación: terminó su último programa ──
    const sessions = await persistence.getSessionsByAlumno(student.alumnoId)
    const completadas = sessions.filter((s) => s.completada)
    if (completadas.length > 0) {
      const ultima = completadas[completadas.length - 1]
      const curriculumUltima = await persistence.getCurriculumBySessionId(ultima.sessionId)
      const sugerencia = await suggestNextTopic(persistence, student.alumnoId)
      return {
        kind: 'graduacion',
        alumnoId: student.alumnoId,
        nombre,
        ultimoTema: curriculumUltima?.topic_slug ?? null,
        puntajeEvaluacion: ultima.evaluacionPuntaje,
        rating: null,
        sugerencia: sugerencia ? { slug: sugerencia.slug, titulo: sugerencia.titulo } : null,
        saludo:
          `¡Felicidades, ${nombre}! 🎉 Completaste tu programa` +
          `${curriculumUltima?.topic_slug ? ` de ${curriculumUltima.topic_slug}` : ''} ` +
          `${ultima.evaluacionPuntaje != null ? `con ${ultima.evaluacionPuntaje} puntos` : ''}. ` +
          `${sugerencia ? `La reina sugiere continuar con ${sugerencia.titulo}. ` : ''}` +
          '¿Aceptas el nuevo reto o prefieres otro tema?',
      }
    }

    // ── 4) Bienvenida simple ──
    return {
      kind: 'bienvenida',
      alumnoId: student.alumnoId,
      nombre,
      nickname: student.nickname ?? null,
      rangoEdad: student.rangoEdad,
      xpAcumulado: student.xpAcumulado,
      nivelActual: student.nivelActual,
      sesionesTotal: student.sesionesTotal,
      saludo: saludoBienvenida(nombre, student.rangoEdad),
    }
  } catch (e) {
    log.warn(`[context] buildSessionContext falló, degradando a 'nuevo': ${(e as Error).message}`)
    return {
      kind: 'nuevo',
      saludo:
        '¡Bienvenido a la Gran Colmena del saber! 🐝 Soy Maya, tu abeja guía. ¿Cómo te llamas?',
    }
  }
}
