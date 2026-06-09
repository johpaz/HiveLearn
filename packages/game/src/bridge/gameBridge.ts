/**
 * GameBridge — única frontera entre el juego PixiJS y la app React.
 * El juego NUNCA habla con el backend: emite/escucha eventos tipados y la capa
 * React (GameCanvas) los conecta a lessonStore / WebSocket / endpoints.
 */

import type { WorldSpec } from '@hivelearn/core/lesson/levelSpec'

/** Progreso persistible del juego (va a SQLite vía la sesión existente) */
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
  'tts:request': { nodeId: string; text: string }
  /** El alumno quiere salir del juego */
  'game:exit': Record<string, never>
  /** El juego quedó listo (escena inicial montada) */
  'game:ready': Record<string, never>
}

/** React → Juego */
export interface AppToGame {
  /** Programa convertido a mundos/niveles jugables */
  'program:loaded': { world: WorldSpec; progress: GameProgress | null }
  /** No hay programa: el juego debe arrancar en el onboarding */
  'program:none': Record<string, never>
  /** El pipeline está generando (mostrar zona de espera jugable) */
  'program:generating': { porcentaje: number; mensaje: string }
  /** Siguiente mensaje del onboarding para que lo diga Maya */
  'onboarding:message': OnboardingMessage
  /** Audio TTS listo para un nodo */
  'tts:ready': { nodeId: string; url: string }
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
