/**
 * Renderer del juego: WebGPU cuando el navegador lo ofrece y WebGL2 si no (lo decide Three al iniciar), con tone mapping
 * ACES y, según el nivel de calidad, bloom mediante `RenderPipeline`. Si ninguno de los dos arranca, `create` rechaza y
 * el programa cae a la vista clásica.
 */
import { ACESFilmicToneMapping, PCFShadowMap, RenderPipeline, WebGPURenderer, type Camera, type Scene } from 'three/webgpu'
import { pass, uniform } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { TIERS, type QualityTier } from './quality'

export const FORCE_WEBGL_KEY = 'hivelearn.forceWebGL'

export interface GameRenderer {
  readonly renderer: WebGPURenderer
  readonly backend: 'webgpu' | 'webgl2'
  /** Intensidad extra del bloom (destellos de cinemática); decae a 0 desde fuera. */
  bloomBoost: { value: number }
  render(): void
  resize(width: number, height: number): void
  setTier(tier: QualityTier): void
  dispose(): void
}

function forceWebGL(): boolean {
  try { return localStorage.getItem(FORCE_WEBGL_KEY) === '1' } catch { return false }
}

export async function createGameRenderer(canvas: HTMLCanvasElement, scene: Scene, camera: Camera, tier: QualityTier): Promise<GameRenderer> {
  const settings = TIERS[tier]
  const renderer = new WebGPURenderer({ canvas, antialias: settings.antialias, alpha: false, powerPreference: 'high-performance', forceWebGL: forceWebGL() })
  await renderer.init()
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.type = PCFShadowMap

  const backend: GameRenderer['backend'] = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2'
  const bloomBoost = uniform(0)
  let pipeline: RenderPipeline | null = null
  let current = tier
  let size = { width: 1, height: 1 }

  const apply = (next: QualityTier) => {
    current = next
    const t = TIERS[next]
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.pixelRatio))
    renderer.setSize(size.width, size.height, false)
    renderer.shadowMap.enabled = t.shadows
    pipeline = null
    if (t.bloom) {
      pipeline = new RenderPipeline(renderer)
      const color = pass(scene, camera).getTextureNode('output')
      const glow = bloom(color, bloomBoost.add(0.85) as never, 0.55, 0.62)
      pipeline.outputNode = color.add(glow)
    }
  }
  apply(tier)

  return {
    renderer, backend, bloomBoost,
    render() { if (pipeline) pipeline.render(); else renderer.render(scene, camera) },
    resize(width, height) {
      size = { width: Math.max(1, width), height: Math.max(1, height) }
      renderer.setSize(size.width, size.height, false)
    },
    setTier(next) { if (next !== current) apply(next) },
    dispose() { pipeline = null; renderer.dispose() },
  }
}
