import { useRioMundoStore } from '@/store/rioMundoStore'
import type { SpiritCardConfig } from '../props/SpiritCard3D'
import { AVATAR_PRESETS } from './avatarPresets'

// Interface mínima de "dialog" para mantener compat con código previo (no se usa en 3D, las burbujas son Html overlay).
interface DialogLike {
  showBeeMessage: (text: string, duration: number, isQuestion?: boolean) => void
}

export type Phase =
  | 'idle'
  | 'nickname'
  | 'edad'
  | 'avatar'
  | 'tema'
  | 'objetivo'
  | 'estilo'
  | 'ready'

export interface CollectedData {
  nombre?: string
  edad?: number
  avatarPresetId?: string
  tema?: string
  objetivo?: string
  estilo?: string
}

export const TEMA_CARDS: SpiritCardConfig[] = [
  { id: 'programacion', label: 'Programación', icon: '💻', value: 'Programación', tint: 0x60a5fa },
  { id: 'matematicas', label: 'Matemáticas', icon: '🧮', value: 'Matemáticas', tint: 0xfbbf24 },
  { id: 'ciencia', label: 'Ciencia', icon: '🔬', value: 'Ciencia', tint: 0x4ade80 },
  { id: 'historia', label: 'Historia', icon: '📜', value: 'Historia', tint: 0xa78bfa },
  { id: 'idiomas', label: 'Idiomas', icon: '🗣️', value: 'Idiomas', tint: 0xec4899 },
  { id: 'arte', label: 'Arte', icon: '🎨', value: 'Arte', tint: 0xf97316 },
]

export const OBJETIVO_CARDS: SpiritCardConfig[] = [
  { id: 'curiosidad', label: 'Por curiosidad', icon: '🌱', value: 'Por curiosidad personal', tint: 0x4ade80 },
  { id: 'trabajo', label: 'Para mi trabajo', icon: '💼', value: 'Para mi trabajo', tint: 0x60a5fa },
  { id: 'escuela', label: 'Para la escuela', icon: '🎓', value: 'Para la escuela o universidad', tint: 0xfbbf24 },
  { id: 'proyecto', label: 'Un proyecto', icon: '🚀', value: 'Para un proyecto personal', tint: 0xa78bfa },
]

export const ESTILO_CARDS: SpiritCardConfig[] = [
  { id: 'visual', label: 'Ver ejemplos', icon: '👁️', value: 'Visual con ejemplos', tint: 0x60a5fa },
  { id: 'practico', label: 'Practicar', icon: '✋', value: 'Práctico con ejercicios', tint: 0xf97316 },
  { id: 'paso', label: 'Paso a paso', icon: '🪜', value: 'Paso a paso ordenado', tint: 0xfbbf24 },
  { id: 'preguntar', label: 'Preguntar', icon: '💬', value: 'Conversacional con preguntas', tint: 0xec4899 },
]

export const AVATAR_CARDS: SpiritCardConfig[] = AVATAR_PRESETS.map(p => ({
  id: p.id,
  label: p.label,
  icon: p.icon,
  value: p.id,
  tint: p.custom.shirtColor,
}))

const PROMPTS: Record<Phase, string> = {
  idle: '',
  nickname: '¿Cómo te llamarán por aquí?',
  edad: '¿Cuántos años tienes?',
  avatar: 'Elige tu apariencia. Camina hacia una y presiona E.',
  tema: '¿Qué te gustaría aprender? Acércate a una opción y presiona E.',
  objetivo: '¿Para qué quieres aprenderlo?',
  estilo: '¿Cómo prefieres aprender?',
  ready: '¡Perfecto! Voy a crear tu programa…',
}

export class ProgramaConversation {
  private phase: Phase = 'idle'
  private collected: CollectedData = {}
  private dialogRef: DialogLike | null = null
  private speakFn: ((text: string) => Promise<void>) | null = null
  private onPhaseChangeCb: ((phase: Phase) => void) | null = null
  private onCompleteCb: ((data: CollectedData) => void) | null = null

  setRefs(dialog: DialogLike | null) {
    this.dialogRef = dialog
  }

  setSpeakFunction(fn: (text: string) => Promise<void>) {
    this.speakFn = fn
  }

  setOnPhaseChange(cb: (phase: Phase) => void) {
    this.onPhaseChangeCb = cb
  }

  setOnComplete(cb: (data: CollectedData) => void) {
    this.onCompleteCb = cb
  }

  getPhase(): Phase {
    return this.phase
  }

  getPrompt(phase?: Phase): string {
    return PROMPTS[phase ?? this.phase] || ''
  }

  getCollected(): CollectedData {
    return { ...this.collected }
  }

  /** Determina el primer paso pendiente basado en el store. */
  private firstPending(): Phase {
    const store = useRioMundoStore.getState()
    const o = store.onboarding
    const perfil = store.perfil

    const hasNombre = !!(o.nombre?.trim() || perfil?.nombre || store.nickname?.trim())
    const hasEdad = o.edad != null || perfil?.edad != null
    const hasAvatar = !!this.collected.avatarPresetId

    if (!hasNombre) return 'nickname'
    if (!hasEdad) return 'edad'
    if (!hasAvatar) return 'avatar'
    if (!o.tema?.trim()) return 'tema'
    if (!o.objetivo?.trim()) return 'objetivo'
    if (!o.estilo?.trim()) return 'estilo'
    return 'ready'
  }

  /** Pre-popula collected con datos en store. */
  private prefill() {
    const store = useRioMundoStore.getState()
    const o = store.onboarding
    const perfil = store.perfil
    this.collected = {
      nombre: o.nombre || perfil?.nombre || store.nickname || undefined,
      edad: (o.edad ?? perfil?.edad ?? undefined) as number | undefined,
      tema: o.tema || undefined,
      objetivo: o.objetivo || undefined,
      estilo: o.estilo || undefined,
    }
  }

  /** Comienza el flujo. La página decide cuándo (después de la portada). */
  start() {
    this.prefill()
    const next = this.firstPending()
    void this.transitionTo(next)
  }

  private async transitionTo(phase: Phase) {
    this.phase = phase
    this.onPhaseChangeCb?.(phase)

    if (phase === 'ready') {
      const finalMsg = '¡Perfecto! Tengo todo lo que necesito. Voy a crear tu programa…'
      this.announce(finalMsg)
      setTimeout(() => this.onCompleteCb?.({ ...this.collected }), 700)
      return
    }

    const prompt = this.getPrompt()
    if (prompt) this.announce(prompt)
  }

  private announce(text: string) {
    if (this.dialogRef) {
      this.dialogRef.showBeeMessage(text, 6000, true)
    }
    if (this.speakFn) {
      void this.speakFn(text).catch(() => {})
    }
  }

  /** Para nickname/edad. */
  submitText(value: string): { ok: boolean; error?: string } {
    const trimmed = (value ?? '').toString().trim()
    if (this.phase === 'nickname') {
      if (trimmed.length < 2) return { ok: false, error: 'Tu nombre debe tener al menos 2 letras' }
      this.collected.nombre = trimmed
      const store = useRioMundoStore.getState()
      store.updateOnboarding({ nombre: trimmed })
      if (!store.nickname) store.setNickname(trimmed)
      void this.transitionTo(this.firstPending())
      return { ok: true }
    }
    if (this.phase === 'edad') {
      const n = parseInt(trimmed, 10)
      if (isNaN(n)) return { ok: false, error: 'Necesito un número' }
      if (n < 5 || n > 120) return { ok: false, error: 'Edad entre 5 y 120 por favor' }
      this.collected.edad = n
      useRioMundoStore.getState().updateOnboarding({ edad: n })
      void this.transitionTo(this.firstPending())
      return { ok: true }
    }
    return { ok: false, error: 'Esta fase no acepta texto' }
  }

  /** Para tema/objetivo/estilo/avatar. */
  submitChoice(id: string, value: string): { ok: boolean; error?: string } {
    const store = useRioMundoStore.getState()
    switch (this.phase) {
      case 'avatar': {
        const preset = AVATAR_PRESETS.find(p => p.id === id)
        if (!preset) return { ok: false, error: 'Avatar no encontrado' }
        this.collected.avatarPresetId = id
        store.setAvatar(preset.custom)
        void this.transitionTo(this.firstPending())
        return { ok: true }
      }
      case 'tema':
        this.collected.tema = value
        store.updateOnboarding({ tema: value })
        void this.transitionTo(this.firstPending())
        return { ok: true }
      case 'objetivo':
        this.collected.objetivo = value
        store.updateOnboarding({ objetivo: value })
        void this.transitionTo(this.firstPending())
        return { ok: true }
      case 'estilo':
        this.collected.estilo = value
        store.updateOnboarding({ estilo: value })
        void this.transitionTo(this.firstPending())
        return { ok: true }
      default:
        return { ok: false, error: 'Esta fase no acepta opciones' }
    }
  }

  /** Devuelve el set de cards para la fase actual (si aplica). */
  getCardsForCurrentPhase(): SpiritCardConfig[] | null {
    switch (this.phase) {
      case 'avatar': return AVATAR_CARDS
      case 'tema': return TEMA_CARDS
      case 'objetivo': return OBJETIVO_CARDS
      case 'estilo': return ESTILO_CARDS
      default: return null
    }
  }

  reset() {
    this.phase = 'idle'
    this.collected = {}
  }
}
