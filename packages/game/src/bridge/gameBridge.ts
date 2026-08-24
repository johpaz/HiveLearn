/**
 * GameBridge — única frontera entre el juego PixiJS y la app React.
 * El juego NUNCA habla con el backend: emite/escucha eventos tipados y la capa
 * React (GameCanvas) los conecta a lessonStore / WebSocket / endpoints.
 */

import type { WorldSpec } from '@hivelearn/core/lesson/levelSpec'

/** Mensaje A2UI v0.8 mínimo para que el juego pueda pedir a React que renderice UI de agentes */
export interface A2UIMessage {
  surfaceUpdate?: {
    surfaceId: string
    components: Array<{ id: string; weight?: number; component: Record<string, any> }>
  }
  dataModelUpdate?: {
    surfaceId: string
    contents: any[]
  }
  beginRendering?: {
    surfaceId: string
    root: string
    styles?: { primaryColor?: string; font?: string }
  }
}

/** Progreso persistible del juego (va a hivedb vía la sesión existente) */
export interface GameProgress {
  /** lessonId → estrellas obtenidas (1-3) */
  stars: Record<string, number>
  /** lessonId → ids de bloques '?' ya abiertos */
  openedBlocks: Record<string, string[]>
  /** último checkpoint alcanzado dentro del nivel en curso */
  checkpoint: { lessonId: string; x: number; y: number } | null
  xpTotal: number
}

/** Mensaje de diálogo del onboarding (NPC Maya ↔ pipeline) */
export interface OnboardingMessage {
  text: string
  /** Si el NPC espera respuesta del alumno con opciones, van aquí */
  options?: string[]
  /** Si espera texto libre */
  freeText?: boolean
  /** true cuando el onboarding terminó y el pipeline empieza a generar */
  done?: boolean
}

/** Tema del catálogo para el selector inicial del juego */
export interface TopicOption {
  slug: string
  titulo: string
  descripcion: string | null
}

/** Resumen del programa recién generado para la pantalla de revelación */
export interface ProgramReveal {
  tema: string
  nodos: Array<{ id: string; titulo: string; xpRecompensa: number }>
  logros: string[]
  xpTotal: number
}

/** Juego → React */
export interface GameToApp {
  /** El alumno respondió al NPC del onboarding */
  'onboarding:answer': { answer: string }
  /** El alumno abrió un bloque '?' */
  'concept:opened': { lessonId: string; nodeId: string }
  /** Completó el concepto (leyó + micro-eval) */
  'concept:completed': { lessonId: string; nodeId: string; xp: number; correct: boolean }
  /** Respondió una pregunta del jefe */
  'boss:answer': { lessonId: string; questionIndex: number; answerIndex: number; correct: boolean }
  /** Completó un nivel */
  'level:completed': { lessonId: string; stars: number; xp: number; correctas: number; total: number }
  /** Guardar progreso (checkpoint, bloques abiertos) */
  'progress:save': { progress: GameProgress }
  /** Pide narración TTS para un texto (React resuelve con 'tts:ready' o nunca) */
  'tts:request': { nodeId: string; text: string; agentId?: string }
  /** El alumno quiere salir del juego */
  'game:exit': Record<string, never>
  /** Juego pide transcribir un fragmento de audio (PCM/WAV). React resuelve con 'voice:transcript'. */
  'voice:transcribe': { wav: ArrayBuffer; requestId: string }
  /** Juego pide iniciar conversación con un agente vía WS. React puede ignorarlo si el WS ya está abierto. */
  'voice:agent:open': { agentId: string; sessionId?: string }
  /** Texto transcrito o mensaje libre del alumno para enviar al agente en su WS. */
  'agent:chat': { agentId: string; text: string; requestId: string }
  /** El juego quedó listo (escena inicial montada) */
  'game:ready': Record<string, never>
  /** El tutorial está listo para recibir mensajes del onboarding por WS */
  'tutorial:ready': { prefillName?: string }
  /** El juego pide mostrar un panel A2UI (diálogo de agente) */
  'a2ui:show': { surfaceId: string; messages: A2UIMessage[]; agentId?: string; title?: string }
  /** El juego pide cerrar el panel A2UI activo */
  'a2ui:dismiss': { surfaceId?: string }
  /** El juego notifica que un agente cambió de estado (trabajando, listo, etc.) */
  'agent:state': { agentId: string; state: 'idle' | 'working' | 'done' | 'error'; progress?: number; message?: string }
  /** El alumno eligió un tema en el selector de la Colmena (catálogo o texto libre) */
  'topic:selected': { topic: string }
  /** El alumno pidió reanudar una generación interrumpida */
  'generation:resume': { sessionId: string }
  /** El juego pide el catálogo de temas (React responde con 'topics:loaded' y, si aplica, 'program:interrupted') */
  'topics:request': Record<string, never>
  /** La ceremonia del enjambre empezó: React debe abrir el WS de onboarding */
  'ceremony:start': Record<string, never>
  /** El onboarding completó: la ceremonia ejecuta el diálogo del enjambre antes de generar */
  'onboarding:profile': {
    perfil: Record<string, string | number>
    meta: string
    energia: 'baja' | 'media' | 'alta'
    tiempoDisponible: number
  }
  /** La ceremonia terminó (enjambre habló): React continúa con generateProgram */
  'ceremony:finish': Record<string, never>
}

/** React → Juego */
export interface AppToGame {
  /** Programa convertido a mundos/niveles jugables. `reveal` presente = mostrar pantalla de revelación antes del mapa */
  'program:loaded': { world: WorldSpec; progress: GameProgress | null; reveal?: ProgramReveal }
  /** No hay programa: el juego debe arrancar en el onboarding */
  'program:none': Record<string, never>
  /** El pipeline está generando (mostrar zona de espera jugable) */
  'program:generating': { porcentaje: number; mensaje: string }
  /** Catálogo de temas disponible para el selector de la Colmena */
  'topics:loaded': { topics: TopicOption[] }
  /** Hay una generación interrumpida que se puede reanudar */
  'program:interrupted': { sessionId: string; meta: string }
  /** Siguiente mensaje del onboarding para que lo diga Maya */
  'onboarding:message': OnboardingMessage
  /** Audio TTS listo para un nodo */
  'tts:ready': { nodeId: string; url: string }
  /** React respondió con la transcripción de un audio previamente enviado. */
  'voice:transcript': { requestId: string; text: string; ok: boolean; error?: string }
  /** Estado del servicio STT (para mostrarlo discreto en HUD). */
  'voice:status': { ok: boolean; detail?: string }
  /** Respuesta (streaming o final) del agente con el que se está conversando. */
  'agent:reply': { requestId: string; agentId: string; delta?: string; reply?: string; emotion?: string; done: boolean }
  /** Estado del agente conversacional (idle/thinking/speaking/busy/error). */
  'agent:chat:state': { agentId: string; state: 'idle' | 'thinking' | 'speaking' | 'busy' | 'error'; message?: string }
  /** Respuesta del usuario a una acción A2UI */
  'a2ui:action': { surfaceId: string; actionName: string; context: Record<string, any>; agentId?: string }
  /** React le dice al juego que el A2UI fue cerrado */
  'a2ui:closed': { surfaceId: string }
  /** Contexto de sesión calculado por hiveDB ("Despertar de la Colmena") */
  'session:context': {
    payload: {
      kind: 'nuevo' | 'bienvenida' | 'retomar' | 'generacion_interrumpida' | 'graduacion'
      saludo: string
      nombre?: string
      /** Para el tema visual adaptativo */
      rangoEdad?: string | null
      energiaUltima?: string | null
      sessionId?: string
      tema?: string | null
      nodosCompletados?: number
      totalNodos?: number
      xpTotal?: number
      sugerencia?: { slug: string; titulo: string } | null
      [k: string]: unknown
    }
  }
  /** Una abeja empieza a hablar en la ceremonia del enjambre */
  'swarm:line:start': { agentId: string }
  /** Delta de streaming de la línea de una abeja */
  'swarm:line:delta': { agentId: string; delta: string }
  /** Línea completa de una abeja (con fallback si el LLM falló) */
  'swarm:line': { agentId: string; characterName: string; emoji: string; text: string; fallback: boolean; duracionMs: number }
  /** La ceremonia del enjambre completó todas sus líneas */
  'swarm:complete': { lines: number }
  /** React conoce el perfil del alumno: el juego ajusta su tema visual global */
  'profile:theme': { rangoEdad?: string; edad?: number; energia?: string }
}

type EventMap = GameToApp & AppToGame
type Handler<T> = (payload: T) => void

export class GameBridge {
  private handlers = new Map<keyof EventMap, Set<Handler<unknown>>>()

  on<K extends keyof EventMap>(event: K, fn: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(fn as Handler<unknown>)
    return () => set!.delete(fn as Handler<unknown>)
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const fn of [...set]) {
      try {
        fn(payload)
      } catch (err) {
        console.error(`[GameBridge] handler error en "${String(event)}":`, err)
      }
    }
  }

  clear() {
    this.handlers.clear()
  }
}

export function emptyProgress(): GameProgress {
  return { stars: {}, openedBlocks: {}, checkpoint: null, xpTotal: 0 }
}
