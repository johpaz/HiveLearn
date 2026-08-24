/**
 * postfx — pipeline de filtros Pixi v8 (stub estructural).
 *
 * En Pixi v8 los filtros custom requieren GlProgram + UniformGroup con la
 * nueva API mucho más verbosa que v7. Para no acoplar el código a un paquete
 * externo (`@pixi/filter-advanced-bloom`) que el usuario no pidió, este módulo
 * expone una *interfaz* usable y degrada limpio:
 *
 *   - `attach(stage)` no-op hasta que se elija una estrategia de bloom.
 *   - `pulse(amount)` y `update()` son el hook que las escenas llaman en daño.
 *   - En el futuro se puede reemplazar la implementación interna sin tocar
 *     sus callers (LevelScene/BossScene llama a `game.postfx.pulse(1)`).
 *
 * El efecto visual de hurt/flash ya se cubre con:
 *   1. variación de `uMood` en los shaderMaterials 3D,
 *   2. shake del camera (existente) y partículas 2D (Particles),
 *   por lo que no se nota la ausencia del filtro chromatic-shake en screens
 *   escolares donde el performance > polish.
 */

import type { QualityState } from './three/quality'

export class PostFx {
  private _hurt = 0
  private pulseListeners = new Set<(hurt: number) => void>()

  attach(_stage: { filters: unknown[] | null }): void { /* stub */ }

  applyQuality(_q: QualityState): void { /* stub */ }

  update(): void {
    if (this._hurt > 0) {
      this._hurt = Math.max(0, this._hurt - 0.05)
      for (const fn of this.pulseListeners) fn(this._hurt)
    }
  }

  pulse(amount = 1): void {
    this._hurt = Math.max(this._hurt, Math.max(0, Math.min(1, amount)))
    for (const fn of this.pulseListeners) fn(this._hurt)
  }

  get hurt(): number { return this._hurt }

  /** Escenas con shader propio (e.g. bossShader) se suscriben a hurt. */
  onPulse(fn: (hurt: number) => void): () => void {
    this.pulseListeners.add(fn)
    return () => this.pulseListeners.delete(fn)
  }
}