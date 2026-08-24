/**
 * Game — orquestador: Application de Pixi, loop a paso fijo, input, audio,
 * texturas, bridge y máquina de escenas.
 */

import { Application, Container } from 'pixi.js'
import type { WorldSpec, LevelSpec } from '@hivelearn/core/lesson/levelSpec'
import { Input } from './engine/input'
import { AudioManager } from './engine/audio'
import { SceneManager, Scene } from './engine/scene'
import { loadTextures, setTexturesShade, type GameTextures } from './engine/textures'
import { FIXED_DT } from './engine/types'
import { GameBridge, type GameProgress, emptyProgress } from './bridge/gameBridge'
import { TouchControls } from './ui/touchControls'
import { WorldRenderer } from './engine/three/worldRenderer'
import { PostFx } from './engine/postfx'
import { resolveTheme, shadeHex, DEFAULT_THEME, type HiveTheme } from './engine/theme'

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
  readonly worldRenderer = new WorldRenderer()
  readonly postfx = new PostFx()

  /** Datos de la sesión en curso */
  world: WorldSpec | null = null
  progress: GameProgress = emptyProgress()
  currentLevel: LevelSpec | null = null
  /** Resultado del último jefe (lo lee ResultScene) */
  lastResult: { correctas: number; total: number; stars: number; xp: number } | null = null
  /** Tema visual adaptativo ("Panal de Cuentos") — lo fija React con el perfil */
  theme: HiveTheme = DEFAULT_THEME

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
      // Con fondo 3D activo el contexto WebGL debe crearse con alpha (Pixi
      // decide el atributo `alpha` del contexto según backgroundAlpha EN INIT).
      // Las escenas sin fondo 3D restauran alpha=1 con su color propio.
      backgroundAlpha: this.worldRenderer.isAlive ? 0 : 1,
      resizeTo: container,
      antialias: false,
      roundPixels: true,
    })
    container.appendChild(this.app.canvas)
    this.app.canvas.style.display = 'block'

    // 3D background: attach before stage resize so it sits behind Pixi canvas.
    if (this.worldRenderer.isAlive) this.worldRenderer.attach(container)

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
      // Render 3D background before Pixi composits each frame
      this.worldRenderer.update(ticker.deltaMS)
      this.postfx.update()
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
      this.worldRenderer.resize()
    })
    this.resizeObserver.observe(container)

    // Tema global: React notifica el perfil (rango_edad + energia de hiveDB)
    this.bridge.on('profile:theme', ({ rangoEdad, edad, energia }) => {
      this.applyProfileTheme(rangoEdad ?? String(edad ?? ''), energia)
    })
  }

  /** Aplica el tema adaptativo a todo el juego (escenas, música, mood) */
  applyProfileTheme(rangoEdadOEdad?: string | null, energia?: string | null) {
    this.theme = resolveTheme(rangoEdadOEdad, energia)
    this.audio.setMusicTempo(this.theme.musicTempo)
    // Los tiles del mundo se regeneran tintados en la próxima escena
    setTexturesShade(this.theme.skyShade)
    if (this.worldRenderer.uniforms) {
      this.worldRenderer.uniforms.uMood.value = this.theme.shaderMood
    }
  }

  /** Color de cielo/fondo tintado por el tema actual */
  themedSky(hex: number): number {
    return shadeHex(hex, this.theme.skyShade)
  }

  async goTo(scene: Scene) {
    await this.scenes.goTo(scene, this.viewW, this.viewH)
  }

  /**
   * Modo cinemático Three.js puro: oculta el canvas Pixi (la escena no dibuja
   * nada 2D) y habilita los clics sobre el canvas WebGL para interactuar con
   * actores 3D (abejas de la ceremonia).
   */
  setCinematic(active: boolean) {
    this.app.canvas.style.display = active ? 'none' : 'block'
    this.worldRenderer.setInteractive(active)
    if (active) this.touch.hide()
    else this.touch.show()
  }

  /** Clic del usuario sobre el canvas WebGL en coords de píxel (modo cinemático) */
  onCanvasClick(handler: (x: number, y: number) => void): () => void {
    const canvas = this.worldRenderer.domCanvas
    if (!canvas) return () => {}
    const fn = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      handler(e.clientX - r.left, e.clientY - r.top)
    }
    canvas.addEventListener('pointerdown', fn)
    return () => canvas.removeEventListener('pointerdown', fn)
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
    this.worldRenderer.dispose()
    this.app.destroy(true, { children: true })
  }
}
