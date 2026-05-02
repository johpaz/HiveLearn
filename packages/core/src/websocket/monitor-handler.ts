/**
 * monitor-handler.ts — Monitoreo de atención del alumno vía webcam.
 *
 * Flujo:
 *   UI envía { tipo: 'monitor:frame', frame: '<base64>', context: {...} }
 *   → handleMonitorFrame() analiza el frame con Ollama (visión)
 *   → emite MonitorEvent de vuelta al WS de la lección
 *   → si estado='mostrando_algo', llama al agente de visión pedagógica
 *
 * El monitor nunca habla directamente con el alumno.
 * Solo emite hacia el coordinador (vía WS de la sesión activa).
 */

import type { ServerWebSocket } from 'bun'
import { resolveProviderConfig } from '../agent/llm-client'
import { AGENT_IDS } from '../agent/registry'
import { MONITOR_PROMPT } from '../agent/prompts/monitor.prompt'
import { VISION_PEDAGOGICA_PROMPT } from '../agent/prompts/vision-pedagogica.prompt'
import { getDefaultMonitorProfile } from '../types/monitor.types'
import type { MonitorEstado, MonitorEvent, MonitorFrameContext, NivelAlerta, AccionMonitor } from '../types/monitor.types'
import { getDb } from '../storage/sqlite'
import { logger } from '../utils/logger'

const log = logger.child('monitor')

type MonitorSessionState = {
  profile: ReturnType<typeof getDefaultMonitorProfile>
  distractionStart: number | null
  lastFrameTs: number
}

const monitorSessions = new Map<string, MonitorSessionState>()

// ─── API pública ──────────────────────────────────────────────────────────────

export function activateMonitor(sessionId: string, edad: number): void {
  if (monitorSessions.has(sessionId)) return
  const profile = getDefaultMonitorProfile(edad)
  if (!profile.activo) return
  monitorSessions.set(sessionId, { profile, distractionStart: null, lastFrameTs: 0 })
  log.info('[monitor] activated', { sessionId, edad, intervalo_ms: profile.intervalo_captura_ms })
}

export function deactivateMonitor(sessionId: string): void {
  monitorSessions.delete(sessionId)
  log.info('[monitor] deactivated', { sessionId })
}

export async function handleMonitorFrame(
  sessionId: string,
  frameBase64: string,
  context: Partial<MonitorFrameContext>,
  ws: ServerWebSocket<any>,
): Promise<void> {
  const state = monitorSessions.get(sessionId)
  if (!state) return

  const now = Date.now()
  if (now - state.lastFrameTs < state.profile.intervalo_captura_ms) return
  state.lastFrameTs = now

  const frameId = `${sessionId}-${now}`
  const ctx: MonitorFrameContext = {
    momento_sesion: context.momento_sesion ?? 'leccion',
    tema:           context.tema ?? '',
    ultimo_evento:  context.ultimo_evento ?? '',
  }

  let estado: MonitorEstado = 'enfocado'
  try {
    estado = await analyzeFrame(frameBase64, ctx)
  } catch (e) {
    log.error('[monitor] frame analysis failed', { error: (e as Error).message })
    return
  }

  // Tracking de distracción
  const isDistracted = estado === 'distraido_leve' || estado === 'distraido' || estado === 'ausente'
  if (isDistracted) {
    if (!state.distractionStart) state.distractionStart = now
  } else {
    state.distractionStart = null
  }

  const segundosDistraccion = state.distractionStart
    ? Math.floor((now - state.distractionStart) / 1000)
    : 0

  const { nivel, accion } = resolveAction(estado, segundosDistraccion, state.profile)

  const event: MonitorEvent = {
    tipo: 'monitor:report',
    estado,
    nivel,
    accion,
    contexto: { momento_sesion: ctx.momento_sesion, segundos_distraccion: segundosDistraccion },
    frame_id: frameId,
  }

  // Solo emitir si hay algo que comunicar (no saturar con 'info/ninguna')
  if (nivel !== 'info' || estado === 'mostrando_algo') {
    try { ws.send(JSON.stringify(event)) } catch { /* WS cerrado */ }
  }

  // mostrando_algo: lanzar análisis pedagógico en paralelo
  if (estado === 'mostrando_algo') {
    analyzePedagogicVision(frameBase64, ctx)
      .then(resp => {
        try {
          ws.send(JSON.stringify({
            tipo: 'monitor:vision',
            mensaje: resp.mensaje,
            objeto_detectado: resp.objeto_detectado,
            session_id: sessionId,
          }))
        } catch { /* WS cerrado */ }
      })
      .catch(e => log.error('[monitor] vision pedagógica failed', { error: (e as Error).message }))
  }

  // Guardar en DB para trazabilidad (fire-and-forget)
  saveFrameTrace(sessionId, frameId, estado, nivel, accion, segundosDistraccion)
}

// ─── Análisis de frame con Ollama visión ─────────────────────────────────────

async function analyzeFrame(frameBase64: string, ctx: MonitorFrameContext): Promise<MonitorEstado> {
  const config = await resolveProviderConfig(AGENT_IDS.monitor)
  const baseUrl = config.baseUrl || 'http://localhost:11434'
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/chat`

  const userContent = [
    `Contexto: ${ctx.momento_sesion}, tema="${ctx.tema}", último evento="${ctx.ultimo_evento}".`,
    `Analiza el frame y devuelve el estado de atención del alumno.`,
  ].join(' ')

  const body = {
    model:   config.model,
    stream:  false,
    options: { temperature: 0.1, num_predict: 64 },
    messages: [{
      role:    'user',
      content: userContent,
      images:  [frameBase64],
    }],
  }

  // System prompt como primer mensaje si es necesario
  const fullBody = {
    ...body,
    system: MONITOR_PROMPT,
  }

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(fullBody),
  })

  if (!res.ok) throw new Error(`Ollama vision error: ${res.status}`)

  const data = await res.json() as { message?: { content?: string } }
  const raw = data.message?.content ?? ''

  try {
    const parsed = JSON.parse(raw) as { estado?: string }
    const valid: MonitorEstado[] = ['enfocado', 'pensando', 'distraido_leve', 'distraido', 'ausente', 'mostrando_algo']
    if (valid.includes(parsed.estado as MonitorEstado)) return parsed.estado as MonitorEstado
  } catch { /* JSON mal formado */ }

  return 'enfocado'
}

async function analyzePedagogicVision(
  frameBase64: string,
  ctx: MonitorFrameContext,
): Promise<{ mensaje: string; objeto_detectado: string }> {
  const config = await resolveProviderConfig(AGENT_IDS.visionPedagogica)
  const baseUrl = config.baseUrl || 'http://localhost:11434'
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/chat`

  const userContent = `El alumno está mostrando algo a la cámara. Tema de la sesión: "${ctx.tema}". Genera una reacción pedagógica breve.`

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:   config.model,
      system:  VISION_PEDAGOGICA_PROMPT,
      stream:  false,
      options: { temperature: 0.4, num_predict: 120 },
      messages: [{ role: 'user', content: userContent, images: [frameBase64] }],
    }),
  })

  if (!res.ok) throw new Error(`Ollama vision pedagógica error: ${res.status}`)

  const data = await res.json() as { message?: { content?: string } }
  try {
    const parsed = JSON.parse(data.message?.content ?? '{}')
    return {
      mensaje: parsed.mensaje ?? '¡Qué interesante! ¿Me cuentas más sobre eso?',
      objeto_detectado: parsed.objeto_detectado ?? 'no identificado',
    }
  } catch {
    return { mensaje: '¡Qué interesante! ¿Me cuentas más sobre eso?', objeto_detectado: 'no identificado' }
  }
}

// ─── Lógica de decisión de acción ────────────────────────────────────────────

function resolveAction(
  estado: MonitorEstado,
  segundos: number,
  profile: MonitorSessionState['profile'],
): { nivel: NivelAlerta; accion: AccionMonitor } {
  if (estado === 'enfocado' || estado === 'pensando') {
    return { nivel: 'info', accion: 'ninguna' }
  }
  if (estado === 'mostrando_algo') {
    return { nivel: 'info', accion: 'ninguna' }
  }

  if (segundos >= profile.umbral_urgente_s) {
    const accion: AccionMonitor = profile.notificar_maestro ? 'maestro' : 'voz'
    return { nivel: 'urgente', accion }
  }
  if (segundos >= profile.umbral_distraccion_s) {
    return { nivel: 'alerta', accion: 'nudge' }
  }

  return { nivel: 'info', accion: 'ninguna' }
}

// ─── Persistencia (fire-and-forget) ──────────────────────────────────────────

function saveFrameTrace(
  sessionId: string,
  frameId: string,
  estado: MonitorEstado,
  nivel: NivelAlerta,
  accion: AccionMonitor,
  segundosDist: number,
): void {
  try {
    const db = getDb()
    db.query(`
      INSERT INTO hl_monitor_frames (session_id, frame_id, estado, nivel, accion, segundos_dist)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, frameId, estado, nivel, accion, segundosDist)
  } catch { /* No bloquear el flujo si falla la persistencia */ }
}
