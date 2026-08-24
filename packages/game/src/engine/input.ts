/**
 * Input unificado: teclado (flechas/WASD/espacio/E) + táctil (cruceta y botones
 * virtuales para tablets escolares). Las escenas leen estados, no eventos.
 */

export type GameAction = 'left' | 'right' | 'up' | 'down' | 'jump' | 'interact' | 'pause' | 'talk'

const KEYMAP: Record<string, GameAction> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump',
  KeyE: 'interact', Enter: 'interact',
  Escape: 'pause',
  KeyV: 'talk',
}

export class Input {
  private held = new Set<GameAction>()
  private pressed = new Set<GameAction>()
  /** Acciones activadas por controles táctiles (se suman al teclado) */
  private touchHeld = new Set<GameAction>()
  private prevHeld = new Set<GameAction>()
  /** true mientras el juego captura teclado (false cuando un input HTML tiene foco) */
  enabled = true

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return
    const action = KEYMAP[e.code]
    if (!action) return
    e.preventDefault()
    this.held.add(action)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    const action = KEYMAP[e.code]
    if (action) this.held.delete(action)
  }

  attach(target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown)
    target.addEventListener('keyup', this.onKeyUp)
  }

  detach(target: Window = window) {
    target.removeEventListener('keydown', this.onKeyDown)
    target.removeEventListener('keyup', this.onKeyUp)
    this.held.clear()
    this.touchHeld.clear()
  }

  /** Llamar una vez por tick lógico, antes de que las escenas lean input */
  update() {
    this.pressed.clear()
    for (const a of this.allHeld()) {
      if (!this.prevHeld.has(a)) this.pressed.add(a)
    }
    this.prevHeld = new Set(this.allHeld())
  }

  private allHeld(): Set<GameAction> {
    if (this.touchHeld.size === 0) return this.held
    return new Set([...this.held, ...this.touchHeld])
  }

  /** ¿La acción está sostenida este tick? */
  isHeld(a: GameAction): boolean {
    return this.held.has(a) || this.touchHeld.has(a)
  }

  /** ¿La acción se presionó justo este tick? (flanco de subida) */
  isPressed(a: GameAction): boolean {
    return this.pressed.has(a)
  }

  /** API para los botones táctiles en pantalla */
  setTouch(a: GameAction, down: boolean) {
    if (down) this.touchHeld.add(a)
    else this.touchHeld.delete(a)
  }

  /** -1, 0 o 1 según izquierda/derecha */
  get axisX(): number {
    return (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0)
  }
}
