/**
 * Game — orquestador: Application de Pixi, loop a paso fijo, input, audio,
 * texturas, bridge y máquina de escenas.
 */

import { Application, Container } from 'pixi.js'
import type { WorldSpec, LevelSpec } from '@hivelearn/core/lesson/levelSpec'
import { Input } from './engine/input'
import { AudioManager } from './engine/audio'
import { SceneManager, Scene } from './engine/scene'
import { loadTextures, type GameTextures } from './engine/textures'
import { FIXED_DT } from './engine/types'
import { GameBridge, type GameProgress, emptyProgress } from './bridge/gameBridge'
import { TouchControls } from './ui/touchControls'

export interface GameOptions {
  /** Nivel fijo de desarrollo (?devLevel=1): salta onboarding y carga demo */
  devLevel?: boolean
}

export class Game {
  readonly app = new Application()
  readonly input = new Input()
  readonly audio = new AudioManager()
  readonly bridge: GameBridge
  textures!: GameTextures
  scenes!: SceneManager
  touch!: TouchControls

  /** Datos de la sesión en curso */
  world: WorldSpec | null = null
  progress: GameProgress = emptyProgress()
  currentLevel: LevelSpec | null = null
  /** Resultado del último jefe (lo lee ResultScene) */
  lastResult: { correctas: number; total: number; stars: number; xp: number } | null = null

  readonly options: GameOptions
  private accumulator = 0
  private destroyed = false
  private resizeObserver: ResizeObserver | null = null

  constructor(bridge: GameBridge, options: GameOptions = {}) {
    this.bridge = bridge
    this.options = options
  }

  get viewW() { return this.app.renderer.width }
  get viewH() { return this.app.renderer.height }

  async init(container: HTMLElement) {
    await this.app.init({
      background: 0x8ecae6,
      resizeTo: container,
      antialias: false,
      roundPixels: true,
    })
    container.appendChild(this.app.canvas)
    this.app.canvas.style.display = 'block'

    this.textures = loadTextures()
    this.scenes = new SceneManager(this.app.stage)
    this.app.stage.sortableChildren = true
    this.input.attach()

    // Controles táctiles (capa fija sobre el stage)
    this.touch = new TouchControls(this.input)
    this.touch.view.zIndex = 900
    this.app.stage.addChild(this.touch.view)
    this.touch.layout(this.viewW, this.viewH)

    // Primer gesto del usuario habilita el AudioContext
    this.app.canvas.addEventListener('pointerdown', () => this.audio.ensureContext(), { once: true })

    // Loop: acumulador a paso fijo para física determinista
    this.app.ticker.add((ticker) => {
      if (this.destroyed) return
      this.accumulator += Math.min(ticker.deltaMS / 1000, 0.25)
      while (this.accumulator >= FIXED_DT) {
        this.input.update()
        this.scenes.update(FIXED_DT)
        this.accumulator -= FIXED_DT
      }
    })

    this.resizeObserver = new ResizeObserver(() => {
      this.scenes.resize(this.viewW, this.viewH)
      this.touch.layout(this.viewW, this.viewH)
    })
    this.resizeObserver.observe(container)
  }

  async goTo(scene: Scene) {
    await this.scenes.goTo(scene, this.viewW, this.viewH)
  }

  /** Guarda progreso vía bridge (la capa React persiste en SQLite) */
  saveProgress() {
    this.bridge.emit('progress:save', { progress: this.progress })
  }

  destroy() {
    this.destroyed = true
    this.resizeObserver?.disconnect()
    this.input.detach()
    this.audio.destroy()
    this.scenes.destroy()
    this.app.destroy(true, { children: true })
  }
}
