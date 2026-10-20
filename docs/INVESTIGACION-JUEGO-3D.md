# Investigación: juego 3D inmersivo en el navegador (2026-10-20)

## Qué encontramos sobre los ejemplos citados
- **Demos de Claude Opus 5.5** (repositorio `riba2534/claude-opus-5-5-demo`: pelican-bike, transport-ship, qq-speed): Three.js r186 —la misma versión que usa HiveLearn— **sin ningún asset externo**. Modelos, texturas, animación y sonido se generan por código; 11 módulos en `src/`, empaquetados con esbuild a un HTML de ~800 KB. Técnicas: audio procedural, ciclo día/noche, calidad adaptativa, controles táctiles. No declara licencia: se usó como inspiración, no se copió código.
- **Kimi K3** (lanzamiento de Moonshot): exploración 3D con Three.js **WebGPU y compute**, entorno procedural y personajes de una herramienta 3D aparte; el modelo iteraba «con visión en el bucle» (código ↔ capturas). Sin código público.
- **«Sol 6.1» y «Luna 6.1»:** no se encontró nada con esos nombres. Un hilo de Hacker News compara escenas Three.js de varios modelos («Sol», «Astra», GLM, Qwen); los críticos notan que muchas usan r160–r170 **sin tone mapping, sin materiales de nodos y sin post-proceso**, y por eso se ven básicas y oscuras.
- **Conclusión:** no hace falta una pila compleja. Lo que da calidad es iluminación, tone mapping, bloom, niebla, un cielo cuidado, un personaje que responde y audio. Por eso se eligió *procedural primero* y Blender solo para tres piezas «héroe».

## Métodos modernos aplicados (Three r186)
- `three/webgpu`: `WebGPURenderer` con caída automática a WebGL2 (`await renderer.init()` antes de renderizar; `renderer.backend.isWebGPUBackend` indica el backend real).
- **TSL** (`three/tsl`) para materiales: baldosas con borde de neón y barrido, cielo con nebulosa y estrellas, haces de energía en los puentes, velo del portal. `ShaderMaterial`/`onBeforeCompile` no funcionan con este renderer.
- **Bloom** con `RenderPipeline` + `BloomNode` (`three/addons/tsl/display/BloomNode.js`), tone mapping ACES; los valores emisivos por encima de 1 son los que brillan.
- **Calidad adaptativa** (`quality.ts`): nivel inicial por equipo, baja sola si el promedio de cuadros supera 26 ms y nunca sube (evita oscilar). `localStorage['hivelearn.quality']` la fija.
- **Audio procedural** (Web Audio, sin archivos) y **narración** con `speechSynthesis`.
- **Movimiento reducido:** sin bucle de animación; cada cambio dibuja un cuadro y el dron avanza por pasos discretos.

## Cadena de caída
WebGPU → WebGL2 → vista clásica (la que ya existía). Los modelos de Blender → piezas procedurales.

## Modelos de Blender
`scripts/assets/build-models.py` genera `drone.glb` (con aleteo animado), `portal.glb` (marco) y `core.glb` (núcleo de La Reina con anillos giratorios), 190 KB en total, en `packages/hivelearn-ui/public/models/`. Se ejecuta sin interfaz (Blender 5.2 por Flatpak; hay que dar rutas absolutas y acceso al directorio):

```bash
R=$(pwd); flatpak run --command=blender --filesystem=$R org.blender.Blender -b \
  --python $R/scripts/assets/build-models.py -- $R/packages/hivelearn-ui/public/models
```

Convención: el frente del dron es +Y en Blender (queda en -Z en glTF). El gateway embebido sirve `.glb`/`.wasm`/audio con su tipo MIME (`packages/cli/scripts/generate-ui-bundle.ts`).

## Fuentes
- Kimi K3 y Three.js WebGPU: https://www.webgpu.com/news/kimi-k3-threejs-webgpu-demo/
- Demos de Opus 5.5: https://github.com/magiccreator-ai/awesome-claude-opus-5-5-demos y https://github.com/riba2534/claude-opus-5-5-demo
- Hilo de comparación de escenas Three.js (HN): https://hn.svelte.dev/item/49605433
- Guía de migración a WebGPU + Three.js (r186): https://www.utsubo.com/blog/webgpu-threejs-migration-guide
- Blender + Three.js (Codrops): https://tympanus.net/codrops/2025/04/08/3d-world-in-the-browser-with-blender-and-three-js/ (no se pudo leer: 403)
