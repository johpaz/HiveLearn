export type MonitorEstado =
  | 'enfocado'
  | 'pensando'
  | 'distraido_leve'
  | 'distraido'
  | 'ausente'
  | 'mostrando_algo'

export type NivelAlerta = 'info' | 'alerta' | 'urgente'
export type AccionMonitor = 'ninguna' | 'nudge' | 'voz' | 'pausa' | 'maestro'
export type EstiloIntervencion = 'suave' | 'directo' | 'ludico'

export interface MonitorProfile {
  intervalo_captura_ms: number
  umbral_distraccion_s: number
  umbral_urgente_s: number
  estilo_intervencion: EstiloIntervencion
  notificar_maestro: boolean
  activo: boolean
}

export interface MonitorEvent {
  tipo: 'monitor:report'
  estado: MonitorEstado
  nivel: NivelAlerta
  accion: AccionMonitor
  contexto: {
    momento_sesion: string
    segundos_distraccion: number
  }
  frame_id: string
}

export interface MonitorFrameContext {
  momento_sesion: string
  tema: string
  ultimo_evento: string
}

const PROFILE_DEFAULTS: Array<{ maxEdad: number; profile: MonitorProfile }> = [
  { maxEdad: 7,  profile: { intervalo_captura_ms: 8000,  umbral_distraccion_s: 10, umbral_urgente_s: 30, estilo_intervencion: 'ludico',  notificar_maestro: false, activo: true } },
  { maxEdad: 10, profile: { intervalo_captura_ms: 12000, umbral_distraccion_s: 15, umbral_urgente_s: 45, estilo_intervencion: 'suave',   notificar_maestro: false, activo: true } },
  { maxEdad: 13, profile: { intervalo_captura_ms: 18000, umbral_distraccion_s: 25, umbral_urgente_s: 60, estilo_intervencion: 'directo', notificar_maestro: false, activo: true } },
]

export function getDefaultMonitorProfile(edad: number): MonitorProfile {
  for (const entry of PROFILE_DEFAULTS) {
    if (edad <= entry.maxEdad) return { ...entry.profile }
  }
  return { intervalo_captura_ms: 25000, umbral_distraccion_s: 40, umbral_urgente_s: 90, estilo_intervencion: 'directo', notificar_maestro: false, activo: true }
}
