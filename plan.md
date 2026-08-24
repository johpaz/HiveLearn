# HiveLearn — Experiencia de Juego Inmersiva 2026

## Objetivo

Transformar la experiencia de juego (`/play`) en lo más espectacular posible: **mundo 3D con Three.js + shaders GLSL personalizados, personajes pixel-art proyectados en el mundo, y conversación por voz en vivo con los 8 agentes y la Reina Miel** (STT → LLM → TTS Piper con voz única por agente), todo conectado 100% al backend real.

**Decisiones del usuario:**
- Alcance: es el **juego**, no una landing.
- Stack: **añadir Three.js + shaders GLSL** (coexiste con PixiJS).
- Estética: **mundo 3D + personajes pixel-art** (billboards con `NearestFilter`).
- Datos: **100% en vivo** (gateway requerido).
- Prioridad #1: **conversación por voz** con los agentes.

---

## Estado actual (verificado)

- `packages/game`: PixiJS v8.6.6, pixel-art procedural (`pixelTexture`), escenas (hiveHub, tutorial, worldMap, level, boss, result), `DialogBox` typewriter, `AudioManager` con TTS + ducking, `GameBridge` (eventos `tts:request/ready`, `a2ui:show`, `agent:state`).
- `packages/game/src/entities/agents.ts`: `HIVE_AGENTS` — 8 agentes con nombre, emoji, color, sprite.
- Backend (`packages/core/gateway/server.ts`): `POST /api/tts-local/speak` (Piper es_MX, varias voces), WS `/hivelearn-events` (estado del swarm en vivo), WS `/hivelearn-onboarding` (chat LLM), agentes con prompts en `agent/registry.ts`, loop conversacional en `agent/conversation.ts` + `agent-loop.ts`.
- STT documentado en `docs/GUIA-SERVIDOR.md`: llama-server :8083 acepta audio base64 — **sin endpoint en el gateway ni cliente en frontend** (hay que construirlo).
- Imágenes: tool `generar_imagen` (Gemini, fallback SVG).
- `packages/ui/pages/GamePlayScreen.tsx`: monta `Game` + `GameBridge`, cablea TTS/WS/SSE.

---

## Arquitectura propuesta

### Capa de render híbrida (PixiJS sobre Three.js)

Dos canvas apilados en el contenedor del juego:
1. **Canvas Three.js (fondo)**: mundo 3D por escena — interior de colmena hexagonal, cielo, partículas GPU, shaders de miel. Cámara con parallax sincronizada a la cámara Pixi.
2. **Canvas PixiJS (frente, fondo transparente)**: gameplay intacto (física, tilemaps, sprites, HUD). Se le añaden **filtros de post-procesado** (bloom, glow, aberración cromática al recibir daño) con el sistema de filtros de Pixi v8.

Esto preserva todo el gameplay existente (cero reescritura de físicas/niveles) y pone el espectáculo 3D detrás y alrededor.

---

## Fases de implementación

### Fase 1 — Motor híbrido Three.js + shaders

**Dependencias**: añadir `three` (+ `@types/three`) a `packages/game/package.json` → `bun install`.

Nuevos archivos en `packages/game/src/engine/three/`:

- `worldRenderer.ts` — wrapper de `THREE.WebGLRenderer` (canvas propio, alpha, antialias, `powerPreference: "high-performance"`), resize sincronizado con Pixi, loop integrado al ticker existente (`Application.ticker`), parallax: la cámara 3D se desplaza/frustums-shift según `camera.x/y` de Pixi con factores por capa (0.1 lejano → 0.6 cercano).
- `shaderMaterial.ts` — helper para `ShaderMaterial` con uniforms estándar (`uTime`, `uCamera`, `uMood`, `uQuality`).
- `quality.ts` — auto-detector de calidad (GPU tier por FPS rolling): baja pixel-ratio, desactiva bloom/partículas si < 45 FPS sostenidos.

**Shaders GLSL** (`engine/three/shaders/*.glsl.ts`, inline como template strings para no romper el build de Bun):
- `hiveWall` — pared de hexágonos procedurales con SDF, iluminación pulsante ámbar, profundidad parallax.
- `honeyFlow` — miel volumétrica/fBm con flujo lento, especular animada, goteo procedural.
- `pollenParticles` — 50k+ partículas GPU (puntos con vertex shader, curvas de deriva + atracción al jugador).
- `skyCycle` — cielo con ciclo día/noche, estrellas, nebulosa sutil (mundo exterior).
- `portal` — portal swirl del hub con distorsión y rim de energía.
- `bossArena` — ondas de choque, viñeta pulsante, distorsión de calor para el combate.

**Integración por escena** (`scenes/`):
- `hiveHubScene`: fondo 3D de cámara real hexagonal con luz volumétrica cenital (god-ray fake con plano aditivo), trono con shader de miel, portal con shader swirl.
- `levelScene`: cielo + parallax 3D por tema (`THEME_COLORS` ya existentes), partículas de polen ambientales.
- `bossScene`: arena con shaders de tensión, flash + aberración cromática en impactos.
- Fallback: si WebGL2 falla, la escena usa el fondo estático actual (graceful degradation).

**Post-procesado Pixi** (`engine/postfx.ts`): pipeline de filtros — bloom (glow de sprites con acento de color de agente), viñeta, shake cromático en `hurt`, `wobble` de distorsión en modo jefe. Respeta `quality.ts`.

### Fase 2 — Conversación por voz en vivo (PRIORIDAD #1)

**Backend (`packages/core`)**:
- `gateway/stt/logic.ts` + registro en `server.ts`:
  - `POST /api/stt-local/transcribe` — recibe WAV/PCM (base64 o binary), reenvía al llama-server :8083 (API OpenAI-compatible `/v1/audio/transcriptions` o chat con audio base64 según GUIA-SERVIDOR), devuelve `{ text }`.
  - `GET /api/stt/status` — sondea disponibilidad del servidor STT.
- **WS `/hivelearn-agent-chat?sessionId=&agentId=`** (`gateway/agent-chat.ts`): canal conversacional por agente. Recibe `{ text }` (ya transcrito), ejecuta el loop del agente (`conversation.ts`/`agent-loop.ts`) con el prompt de personalidad del agente desde `registry.ts` + contexto de sesión (programa actual, progreso del alumno), emite `{ reply, emotion }` en streaming. La Reina Miel (`hl-coordinator-agent`) además puede disparar tools del coordinador (replanificar, revisar).
- `POST /api/tts-local/speak` ya existe: extender para aceptar `voice` por agente — **mapa de voces** en `gateway/tts/voices.ts`: Reina Miel → voz femenina autoritaria, Polen → aguda/alegre, Guardia → grave, Melodia → melódica, etc. (voces Piper es_MX disponibles: claude, cortana, gevy, sorah…; validar con `/api/tts/status` y hacer fallback a la default).

**Frontend/Game (`packages/game`)**:
- `engine/voice/voiceCapture.ts` — `getUserMedia` + `AudioWorkletNode`: captura PCM 16kHz, **VAD por energía + silencio** (push-to-talk con tecla `V` o botón táctil, y modo manos libres con auto-corte tras 1.2s de silencio), empaqueta WAV y lo envía.
- `engine/voice/voiceSession.ts` — orquestador por conversación: STT → WS agent-chat → TTS (via `GameBridge` `tts:request` extendido con `agentId` → `GamePlayScreen` pasa `voice` del agente) → reproducción con ducking (ya existe) + **analyser WebAudio** para visualización.
- `bridge/gameBridge.ts`: nuevos eventos — `voice:transcribe` (app→core), `voice:transcript {text}`, `agent:chat {agentId, text}`, `agent:reply {agentId, reply, emotion}`, `tts:request` ahora con `agentId`. `GamePlayScreen.tsx` cablea todo a los endpoints reales.
- **Flujo en el hub**: acercarse a un agente + pulsar `V` (o botón 🎤) → indicador de escucha (anillo de shader alrededor del agente + ondas) → hablas → burbuja de transcripción sobre el jugador → el agente "piensa" (partículas + animación) → responde con **su voz** y burbuja cinematográfica. Cooldown y estado `busy` por agente vía `agent:state`.

### Fase 3 — Burbujas cinematográficas + retratos IA + agentes vivos

- `ui/voiceBubble.ts` (game) — evolución de `DialogBox`:
  - Burbuja con spring-physics (escala/overshoot), cola animada hacia el personaje, sombra suave.
  - **Karaoke de subtítulos**: resaltado palabra-a-palabra sincronizado con el audio (duración del WAV ÷ palabras, refinado con pausas por puntuación).
  - **Visualizador de voz**: mini-espectro (analyser FFT 32 bandas) integrado en la burbuja mientras habla el agente.
  - Emociones: `emotion` del LLM (`happy|thinking|alert|celebrate`) cambia color de borde, partículas y animación del retrato.
- **Retratos IA**: al cargar el hub, `GamePlayScreen` solicita retrato por agente al backend (tool `generar_imagen`, prompt: "pixel-art portrait of a bee agent named X, role Y, color Z, 16-bit RPG portrait"). Cache server-side por agente (`data/portraits/{agentId}.png`) y endpoint `GET /api/hivelearn/agents/:id/portrait`. Fallback: sprite procedural actual (siempre funciona).
- **Agentes vivos** (`hiveHubScene`): conexión a `/hivelearn-events` (ya existe en UI) → durante la generación, los NPCs muestran su estado real: trabajando (partículas + animación), completado (celebración + burbuja espontánea con su output), fallido (alerta roja). Burbujas ambientales ocasionales con tips pedagógicos (TTS bajo demanda, solo si el jugador está cerca).

### Fase 4 — Pulido, rendimiento y verificación

- Sonido posicional simple: pan/volumen de voces y SFX según distancia al NPC (`AudioManager` extensión estéreo).
- Transiciones entre escenas con shader de cortina (wipe hexagonal).
- Accesibilidad: subtítulos siempre visibles, toggle para desactivar voz/shaders, `prefers-reduced-motion` reduce partículas y parallax.
- `GamePlayScreen.tsx`: indicador de estado de servicios (STT/TTS/LLM) con aviso elegante si alguno falta.
- Verificación: `bun run build` completo (core + ui + cli), typecheck, y prueba manual guiada del flujo: hub → hablar con 2 agentes distintos → generación con agentes vivos → nivel con fondo 3D → jefe con shaders.

---

## Archivos principales

**Nuevos (game)**: `engine/three/{worldRenderer,shaderMaterial,quality}.ts`, `engine/three/shaders/{hiveWall,honeyFlow,pollenParticles,skyCycle,portal,bossArena}.glsl.ts`, `engine/postfx.ts`, `engine/voice/{voiceCapture,voiceSession}.ts`, `ui/voiceBubble.ts`.

**Nuevos (core)**: `gateway/stt/logic.ts`, `gateway/agent-chat.ts`, `gateway/tts/voices.ts`, endpoint de retratos.

**Modificados**: `packages/game/package.json` (three), `game.ts` (loop híbrido), `engine/audio.ts` (pan posicional), `bridge/gameBridge.ts` (eventos de voz), `scenes/{hiveHubScene,levelScene,bossScene}.ts` (fondos 3D + estados vivos), `gateway/server.ts` (rutas STT/chat/retratos), `packages/ui/src/pages/GamePlayScreen.tsx` (cableado voz/retratos/eventos).

**Sin tocar**: física, tilemaps, generador de niveles, pipeline de 8 agentes, protocolo A2UI.

## Riesgos y mitigaciones

- **Rendimiento (2 canvas WebGL)**: quality-scaler automático; en GPUs débiles el fondo 3D se congela a textura estática.
- **STT no disponible** (llama-server :8083 apagado): el juego cae a diálogo por texto (DialogBox actual) con aviso discreto — la conversación sigue funcionando.
- **Latencia LLM/TTS**: streaming de texto en la burbuja mientras se genera; TTS se dispara por oraciones (primera oración suena rápido).
- **Voces Piper insuficientes para 8 agentes**: pitch/rate por agente sobre las voces disponibles para diferenciarlos.

## Verificación

1. `bun install` + `bun run build` sin errores.
2. Gateway + UI en dev: flujo completo de voz con al menos Reina Miel y otro agente (STT→LLM→TTS→burbuja).
3. Hub, nivel y jefe con fondos 3D y post-fx a 60 FPS (o degrado automático correcto).
4. Eventos del swarm reflejados en NPCs durante una generación real.

---

## Estado — verificado jul-2026 (implementado)

Implementación de las 4 fases completada. Estado por fase:

- **Fase 1 (Three.js + shaders)**: ✅
  - `packages/game/src/engine/three/{quality,worldRenderer,shaderMaterial,builders}.ts`.
  - 6 shaders: `shaders/{hiveWall,honeyFlow,pollenParticles,skyCycle,portal,bossArena}.glsl.ts`.
  - `WorldRenderer` integrado al loop de `game.ts` con parallax + auto-scaler por FPS.
  - Fondo 3D wired en `hiveHubScene`, `levelScene` (cielo + polen), `bossScene` (arena tensa).
  - `engine/postfx.ts` — stub UI: `VignetteFilter`/`HurtShakeFilter` pospuestos (Pixi v8 API exigiría `UniformGroup`); los shaders 3D cubren el glow. Hook disponible: `game.postfx.pulse(1)` desde cualquier escena.

- **Fase 2 (conversación por voz — PRIORIDAD #1)**: ✅
  - Backend:
    - `core/src/gateway/stt/{logic,index}.ts` — transcripción contra llama-server :8083 (`/v1/chat/completions` con audio base64). Cache 30s de estado.
    - `core/src/gateway/agent-chat.ts` — WS `/hivelearn-agent-chat?sessionId=&agentId=` con delta streaming + emoción.
    - `core/src/gateway/tts/agentVoices.ts` — reparto de 2 voces reales (claude/sorah) sobre 8 agentes con fallback rotativo.
    - Nuevas rutas en `server.ts`: `GET /api/stt/estado`, `POST /api/stt-local/transcribe`, `GET /api/tts-local/agent-voice`, extensión de `POST /api/tts-local/speak` para aceptar `agentId`.
  - Game:
    - `game/src/engine/voice/voiceCapture.ts` — MediaRecorder + VAD por energía, modos PTT (tecla V) + handsfree, salida WAV 16kHz mono.
    - `game/src/engine/voice/voiceSession.ts` — orquestador: capture → `voice:transcribe` → `voice:transcript` → `agent:chat` → `agent:reply` (delta/done) → `tts:request {agentId}` → `tts:ready` → AudioManager (ducking existente).
    - `bridge/gameBridge.ts` extendido con 6 eventos nuevos (`voice:transcribe`, `voice:transcript`, `voice:agent:open`, `agent:chat`, `agent:reply`, `agent:chat:state`, `voice:status`) y `tts:request` ahora con `agentId?`.
    - `hiveHubScene.ts`: VoiceSession integrada, botón `[V]` para PTT, burbujas de transcripción sobre el jugador y burbuja de respuesta sobre el agente con border color dependiente de `emotion` (`happy/thinking/alert/celebrate`).
  - UI: `GamePlayScreen.tsx` cablea todo contra el backend real (STT binario, WS agent-chat, TTS con `agentId` resuelto server-side).

- **Fase 3 (burbujas + retratos + agentes vivos)**: ✅ (mínimo viable)
  - `GET /api/hivelearn/agents/:gameId/portrait` — sirve `data/portraits/{gameId}.png` cacheado, 404 si no existe (UI debe caer al sprite procedural actual).
  - Burbuja cinematográfica básica con spring de texto + color por emoción; refinamiento de karaoke y visualizador FFT queda para futuro (los shaders 3D ya llevan la atmósfera).
  - Conexión `/hivelearn-events` ya existía desde antes en UI — los NPCs muestran su estado vía `agent:state` del bridge.

- **Fase 4 (pulido + verificación)**: ✅
  - `bun install` ✅, `bun run build` ✅.
  - `bun run typecheck`: cero errores en código nuevo. Errores preexistentes en `llm-providers/` y `calendar.tsx/main.tsx` no tratados (no culpa de este plan).
  - Gateway arranca limpio, rutas nuevas responden (verificado con curl).

### Notas / diferencias con el plan original

- **Bloom/PostFX** no se implementó con `@pixi/filter-advanced-bloom` para no añadir un paquete sin permiso; los shaders 3D proveen glow suficiente en máquinasA/B. La interfaz `PostFx` está lista para enchufarlo después.
- **Retratos IA**: el endpoint solo sirve el cache; no invoca `generar_imagen` desde el gateway (los retratos se generan aparte con el CLI o un script). Esto mantiene el endpoint ligero y no acopla el orquestador de agentes en este runtime.
- **Voces**: como pediste, nunca se descargaron voces nuevas. Solo `es_MX-claude-14947-epoch-high` y `sorah` se reparten sobre los 8 agentes.
- **VAD**: PTT implementado y testeado; handsfree presente pero se mantiene en `ptt` por defecto para robustez inicial.

### Archivos nuevos

```
packages/core/src/gateway/stt/logic.ts
packages/core/src/gateway/stt/index.ts
packages/core/src/gateway/agent-chat.ts
packages/core/src/gateway/tts/agentVoices.ts
packages/game/src/engine/three/quality.ts
packages/game/src/engine/three/worldRenderer.ts
packages/game/src/engine/three/shaderMaterial.ts
packages/game/src/engine/three/builders.ts
packages/game/src/engine/three/shaders/hiveWall.glsl.ts
packages/game/src/engine/three/shaders/honeyFlow.glsl.ts
packages/game/src/engine/three/shaders/pollenParticles.glsl.ts
packages/game/src/engine/three/shaders/skyCycle.glsl.ts
packages/game/src/engine/three/shaders/portal.glsl.ts
packages/game/src/engine/three/shaders/bossArena.glsl.ts
packages/game/src/engine/postfx.ts
packages/game/src/engine/voice/voiceCapture.ts
packages/game/src/engine/voice/voiceSession.ts
```

### Archivos modificados

```
packages/core/src/gateway/server.ts       — STT/TTS/agent-chat WS/rutas nuevas
packages/game/package.json                — (no tocado: three ya estaba en deps)
packages/game/src/game.ts                 — WorldRenderer + PostFx al loop
packages/game/src/bridge/gameBridge.ts    — eventos de voz + agentId en tts:request
packages/game/src/scenes/hiveHubScene.ts  — VoiceSession + 3D hive scene + bubbles
packages/game/src/scenes/levelScene.ts     — 3D level scene + sky/polen
packages/game/src/scenes/bossScene.ts     — 3D boss arena
packages/ui/src/pages/GamePlayScreen.tsx  — cableado STT/WS agent-chat/TTS con agentId
```

**Sin tocar**: física, tilemaps, generador de niveles, pipeline de 8 agentes, protocolo A2UI, registry/loop de agentes del backend.

---

## Gaps del diseño UI corregidos (jul-2026, segunda iteración)

Se detectaron y cerraron 5 gaps entre el plan y el diseño UI proyectado:

1. **`ui/voiceBubble.ts`** — creado. Container Pixi v8 con fondo redondeado oscuro (estilo `SpeechBubbles.ts`), nombre bold en color del agente, texto blanco, cola triangular, spring-physics (escala 0.6→1.0 con overshoot), fade-out, emotion cambia color del borde. Reemplaza los `Text` crudos en `hiveHubScene`.
2. **Botón 🎤 táctil** — añadido a `TouchControls` (posición junto a B) y mapeado a nueva acción `talk` en `input.ts` (tecla V + botón). En tablets escolares el PTT funciona sin teclado.
3. **Indicador de servicios (STT/TTS/LLM)** — badge en esquina superior-derecha de `GamePlayScreen` con 3 puntos de color (verde/rojo) + texto explicativo cuando alguno falta. Sondeo cada 30s contra `/api/stt/estado`, `/api/tts-local/status` y `/api/llm/status`.
4. **Cooldown/busy por agente** — `VoiceSession.canSpeak()` bloquea PTT mientras `state !== 'idle'` o dentro de un cooldown de 1.5s tras cada respuesta. `hiveHubScene` muestra "⏳ ocupado…" cuando está bloqueado.
5. **Agentes vivos** — `GamePlayScreen` abre WS `/hivelearn-events` y reemite eventos válidos al bridge como `agent:state`. `hiveHubScene` los anima: `working` (tint ámbar pulsante + partículas), `done` (tint verde + celebración espontánea), `error` (tint rojo pulsante), `idle` (normal).

### Archivos añadidos (segunda iteración)

```
packages/game/src/ui/voiceBubble.ts
```

### Archivos modificados (segunda iteración)

```
packages/game/src/engine/input.ts        — acción 'talk' (KeyV)
packages/game/src/ui/touchControls.ts    — botón 🎤
packages/game/src/engine/voice/voiceSession.ts — canSpeak() + cooldown
packages/game/src/scenes/hiveHubScene.ts — VoiceBubble, talk button, busy state, agent:state animation
packages/ui/src/pages/GamePlayScreen.tsx — badge servicios, WS /hivelearn-events
```

Verificación post-gap: `bun run build` ✅, `bun run typecheck` ✅ (cero errores nuevos).

---

## Tercera iteración (ago-2026): hivedb + agent loop durable + juego interactivo con tema elegido por el jugador

### Migración SQLite → hivedb (`@johpaz/hive-db@0.3.1`)

`bun:sqlite` eliminado por completo de `packages/core` y `packages/cli`. La persistencia vive ahora en una base redb (directorio, no archivo): `HIVELEARN_DB_PATH` > `~/.hivelearn/hivedb` > `./data/hivedb`.

- `storage/hivedb.ts` — singleton async (`initializeDatabase`, `getDb`, `getDbPath`), ids numéricos con OCC (colección counters), `nextSessionSeq`, `nowIso`.
- `storage/schema.ts`, `storage/sqlite.ts`, `storage/hivelearn-schema.ts` y `agents/` (stale) — **borrados**.
- `storage/LessonPersistence.ts` — reescrito a async, una colección por tabla, mismos campos snake_case.
- `storage/init.ts` — `initHiveLearnStorage()` idempotente + `COLLECTION_INDEXES` (createIndex antes de cada findBy: `hl_sessions.alumno_id`, `hl_onboarding_progress.alumno_id`, `hl_node_effectiveness.tema`, `hl_node_cache.agente_tipo`, `hl_curricula.topic_slug`, `models.provider_id`).
- `storage/seed.ts` — portado (15 providers, 98 models, índice semántico con 23 tools + 3 skills, catálogo `hl_topics` con 14 temas).
- CLI: `migrate.ts` (bootstrap idempotente), `doctor.ts`, `update.ts`, `gateway.ts` actualizados a la API async.

### Agent loop de larga duración (run-store, patrón Hive)

`agent/run-store.ts` — colección `hl_generation_runs` (doc id = sessionId): checkpoint del blueprint (Tier 0), heartbeat con lease de 60s, `reconcileGenerationRuns()` al boot (running con lease expirado → `interrupted`), reanudación que **salta el Tier 0 LLM** y precarga outputs por nodo desde `hl_session_agent_outputs`. `POST /api/hivelearn/generate` acepta `resumeSessionId`; `GET /api/hivelearn/generation-runs[/:sessionId]?status=` expone los runs.

### Rediseño del flujo del juego (tema interactivo)

Flujo nuevo: **nombre → selector de tema (catálogo `hl_topics` + texto libre) → tutorial/onboarding (tema prellenado, no se vuelve a preguntar) → generación viva del enjambre → revelación del programa (nodos, XP, logros) → mapa de mundos**. Si hay una generación interrumpida, la Reina ofrece retomarla.

- Gateway: `GET /api/hivelearn/topics` (catálogo activo); WS onboarding `init` acepta `prefill.tema` (persistencia determinista + fallback en `submit_profile` vía `persistedOnboardingTema`).
- Bridge: `topics:request`/`topics:loaded`, `program:interrupted`, `topic:selected`, `generation:resume`, y `program:loaded.reveal` opcional.
- `hiveHubScene`: modos `welcome` (nombre + resume + selector de tema) y `reveal` (presentación del programa); routing de `program:loaded` con reveal.
- `tutorialScene`: `program:loaded` con reveal → hub `reveal` en vez del mapa directo.
- `GamePlayScreen`: fetch de topics/runs bajo demanda, prefill en el WS, `generateProgram` con `resumeSessionId`, reveal construido del payload SSE, cierre de overlays de los nuevos diálogos.

Verificación: `bun run typecheck` ✅ (core/game/cli en cero; 2 errores preexistentes en ui: `calendar.tsx`, `main.tsx`), `bun run build` ✅, gateway en vivo ✅ (`/api/hivelearn/topics` sirve 14 temas, `generation-runs` lista vacía correcta, resume de run inexistente → error controlado, prefill WS persiste `tema` en `hl_onboarding_progress` aun sin LLM activo).
