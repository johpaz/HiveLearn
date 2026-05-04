# HiveLearn: La Gran Colmena — Plan de Implementación PixiJS

**Fecha:** 2026-05-04
**Motor:** PixiJS v8 + React + Vite (NO Godot)
**Backend:** TypeScript/Bun existente (WebSocket + Piper TTS + Ollama Gemma 4)
**Audiencia:** Niños, adolescentes y adultos sin experiencia tecnológica previa
**Contexto:** Open source, zonas sin internet en LATAM, despliegue offline en Raspberry Pi

---

## Decisión Arquitectónica: PixiJS > Godot

El stack Godot (`packages/godot/`) es un shell vacío: 25 `.tscn` con cero lógica de juego, sin tilemap, sin conexión WS, sin sistema de estados. El stack PixiJS (`packages/ui/src/canvaslearn/rio/`) tiene ~80% del juego funcional:

| Sistema | PixiJS (existe) | Godot (no existe) |
|---------|-----------------|-------------------|
| Mundo isométrico | ✅ RioMundo + IsometricRenderer | ❌ |
| Jugador (WASD) | ✅ RioPlayer | ❌ |
| Cámara | ✅ RioCamera | ❌ |
| Agua animada | ✅ RioWaterSystem | ❌ |
| Abeja guía | ✅ RioBee + RioSwarmBees | ❌ |
| Diálogos | ✅ RioDialog | ❌ |
| Onboarding FSM | ✅ RioOnboardingController + Chat | ❌ |
| Bridge WS↔A2UI | ✅ RioA2UIBridge | ❌ |
| Portales/zonas | ✅ PortalOverlay | ❌ |
| HUD | ✅ RioHUD | ❌ |
| TTS | ✅ useTTSSpeak | ❌ |
| Store unificado | ✅ rioMundoStore (Zustand+persist) | ❌ |
| Títulos/carga | ✅ RioTitleScene + RioLoadingScene | ❌ |
| WS en backend | ✅ onboarding-handler, lesson-handler | ❌ |

**Conclusión:** Reconstruir en Godot = meses de trabajo duplicado. Extendemos PixiJS.

---

## Fusión Concepto: Río + Colmena

El mundo río isométrico existente se mantiene como base visual. Se overlaya el tema "La Gran Colmena":

- **Río principal** = el eje central de la colmena
- **Tributarios** = zonas de aprendizaje (cada uno es un mini-mundo)
- **Abejas** = agentes IA (ya existen RioBee + RioSwarmBees)
- **Portales** = entradas a zonas (ya existe PortalOverlay)
- **Colmena hexagonal** = decoración visual sobre el mapa isométrico

Narrativa: *"La colmena perdió su luz. El río del conocimiento se secó. Debes reactivar los tributarios para que el agua —y el saber— vuelva a fluir."*

---

## Pipeline del Juego (mapeo a fases)

| Pipeline (PIPELINE_HIVELEARN.md) | Fase de implementación | Componente Pixi existente |
|----------------------------------|----------------------|---------------------------|
| FASE 0: Boot/Preload | FASE 1 (extiende RioLoadingScene) | RioLoadingScene |
| FASE 1: Portada | FASE 1 (extiende RioTitleScene) | RioTitleScene |
| FASE 2: Identidad | FASE 2 (extiende RioOnboarding) | RioOnboardingController + Chat |
| FASE 3: Intención | FASE 2 (dentro de onboarding) | RioOnboardingChat |
| FASE 4: Activación Agentes | FASE 3 (program generation) | RioA2UIBridge + WS |
| FASE 5: Coordinador | FASE 3 (backend) | onboarding-handler |
| FASE 6: Render del Mundo | FASE 4 (hub world) | RioMundo + IsometricRenderer |
| FASE 7: Loop de Juego | FASE 5 (mini-mundos) | PortalOverlay + A2UI |
| FASE 8: Evaluación | FASE 5 (dentro de zonas) | A2UI quiz/exercise |
| FASE 9: Memoria | FASE 6 (gamificación) | rioMundoStore + SQLite |

---

## FASE 1 — Portada y Configuración (Semana 1-2)

**Criterio de éxito:** La pantalla de título muestra logo animado, música, configuración funcional, e indicador de estado WebSocket.

### 1.1 Extender RioTitleScene

**Archivo:** `packages/ui/src/canvaslearn/rio/scenes/RioTitleScene.ts`

La escena actual ya tiene: hex logo, abejas animadas, sparkles. Se agrega:

- **Panel de configuración** (toggle: música on/off, SFX on/off, volumen slider, idioma)
- **Indicador WS** (punto verde/rojo en esquina: conectado/desconectado al backend)
- **Botón "Continuar"** visible solo si `localStorage` tiene sesión previa
- **Transición suave** a onboarding (fade out título → fade in onboarding)

```
Estado actual:
  [Logo Hex] [Abejas] [Sparkles]
  [NUEVO JUEGO]

Estado objetivo:
  [Logo Hex] [Abejas] [Sparkles] [Indicador WS ●]
  [NUEVO JUEGO] [CONTINUAR*] [⚙️ CONFIG]
  
  * CONTINUAR solo si hay sesión guardada
```

### 1.2 AudioManager.ts (Web Audio API)

**Archivo nuevo:** `packages/ui/src/canvaslearn/rio/audio/AudioManager.ts`

Equivalente al `AudioManager.gd` de Godot pero en Web Audio API:

```typescript
class AudioManager {
  private ctx: AudioContext
  private musicGain: GainNode
  private sfxGain: GainNode
  private sfxPool: AudioBufferSourceNode[] // pool de 4 para SFX simultáneos
  private currentMusic: AudioBufferSourceNode | null
  
  playMusic(key: string): void        // loop
  stopMusic(): void
  playSFX(key: string): void          // usa pool round-robin
  playTTS(pcm: ArrayBuffer): void     // Piper PCM → AudioBuffer → play
  setMusicVolume(v: number): void
  setSFXVolume(v: number): void
  muteAll(): void
  unmuteAll(): void
  preloadAssets(map: Record<string, string>): Promise<void>
}
```

Assets de audio a migrar desde Godot:
- `packages/godot/art/music/title_theme.ogg` → música título
- `packages/godot/art/music/hub_theme.ogg` → música hub
- `packages/godot/art/sfx/ambient_water.ogg` → ambiente agua
- `packages/godot/art/sfx/ambient_forest.ogg` → ambiente selva
- `packages/godot/art/sfx/applause.ogg` → celebración

### 1.3 Assets: Sprites de Abeja (PixScii)

Generar 6 avatares de abeja con PixScii MCP:

| Avatar | Nombre | Estilo |
|--------|--------|--------|
| bee-aria | Reina Aria | corona dorada, cuerpo ámbar |
| bee-yara | Yara Jaguar | manchas felinas, verde selva |
| bee-kimi | Kimi Cóndor | plumas andinas, azul cielo |
| bee-ix | Ix Serpiente | escamas turquesa, rojo maya |
| bee-nova | Nova Cyborg | circuitos neón, morado |
| bee-chacho | Chacho Gaucho | pañuelo rojo, marrón pampa |
| bee-cosmo | Cosmo Astronauta | traje espacial, plateado |

Usar `pixscii_character` con seeds determinísticas + `pixscii_animate` para idle/walk/attack.

### 1.4 RioTitleScreen.tsx (React overlay)

**Archivo:** `packages/ui/src/canvaslearn/rio/overlays/RioTitleScreen.tsx`

Extender el overlay React con:
- Botones responsivos (720p-4K)
- Panel config con animación slide-in
- Indicador WS consumiendo `rioMundoStore.wsStatus`

### 1.5 Integración con store

Extender `rioMundoStore.ts`:
- `audioSettings: { musicVolume, sfxVolume, musicMuted, sfxMuted }` con persist
- `wsStatus: 'disconnected' | 'connecting' | 'connected'`
- `hasSavedSession: boolean` (derivado de localStorage)

---

## FASE 2 — Onboarding Adaptativo (Semana 2-4)

**Criterio de éxito:** Usuario nuevo completa flujo nombre → edad → tema → objetivo → estilo → avatar, y el perfil se guarda en backend vía WS.

### 2.1 RioOnboardingController — Extender FSM

**Archivo:** `packages/ui/src/canvaslearn/rio/onboarding/RioOnboardingController.ts`

El controller ya tiene FSM con estados `OnboardingStep`:
`nombre | edad | tema | objetivo | estilo | avatar | completado`

Se agrega:
- **Animaciones de transición** entre pasos (slide/fade)
- **Voz de Aria** en cada paso via `useTTSSpeak`
- **Input de voz** (botón micrófono) como alternativa a texto
- **Validación en tiempo real** (nickname mínimo 2 chars, tema no vacío)

### 2.2 RioOnboardingChat.tsx — UI adaptativa por edad

**Archivo:** `packages/ui/src/canvaslearn/rio/onboarding/RioOnboardingChat.tsx`

Adaptar UI según `edad_rango`:

| Rango | Tamaño botones | Iconos | Tono Aria |
|-------|---------------|--------|-----------|
| 6-12 | Extra grande (64px+) | Emojis grandes | Infantil, entusiasta |
| 13-17 | Grande (48px) | Iconos cool | Casual, directo |
| 18+ | Normal (36px) | Iconos limpios | Respetuoso, claro |

### 2.3 Flujo onboarding detallado

```
1. NICKNAME
   Input: texto o voz
   Aria: "¿Cómo te llamas?"
   → guarda en store + WS envía nickname

2. EDAD
   3 botones grandes con íconos
   Aria: "¿Cuántos años tienes, más o menos?"
   → ajusta tono de todos los agentes

3. TEMA
   Aria: "¿Qué te gustaría aprender?"
   6 opciones con íconos de mini-mundo + "Otro" con input libre
   → define primer tributario a activar

4. OBJETIVO
   Aria: "¿Para qué quieres aprender eso?"
   Input libre o voz
   → guide program generation

5. ESTILO
   Aria: "¿Prefieres retos o teoría?"
   2 botones: [🎮 Retos prácticos] [📖 Teoría primero]
   → ajusta difficulty y formato de contenido

6. AVATAR
   6 avatares de abeja (generados en FASE 1)
   Aria comenta cada uno con humor
   → guarda selección en perfil

7. COMPLETADO
   Aria: "¡Perfecto! Vamos a empezar."
   → WS submit_profile → backend guarda en SQLite
   → transición a mundo río
```

### 2.4 Reemplazar RioBee procedural con sprite PixScii

**Archivo:** `packages/ui/src/canvaslearn/rio/bee/RioBee.ts`

Actualmente dibuja la abeja con `Graphics` procedural. Reemplazar con:
- `Sprite.from(avatarTexture)` usando textura generada por PixScii
- Animaciones: idle, talking, celebrating, pointing, guiding
- Cambio de avatar según selección del usuario

### 2.5 Store: extender onboarding state

En `rioMundoStore.ts`:
- `onboarding: { step, nickname, edadRango, tema, objetivo, estilo, avatarId }`
- `studentProfile: { id, nickname, avatar, edadRango, tema, objetivo, estilo }`
- Migrar estado suelto a este objeto estructurado

---

## FASE 3 — Generación de Programa y Conexión WS (Semana 4-5)

**Criterio de éxito:** Al completar onboarding, el backend genera un programa personalizado y el cliente lo recibe via WS sin bloquear la UI.

### 3.1 RioA2UIBridge — Extender para program generation

**Archivo:** `packages/ui/src/canvaslearn/rio/protocol/RioA2UIBridge.ts`

El bridge ya conecta WS ↔ A2UI overlay. Se agrega:
- **Canal de program generation:** onboarding completa → WS envía `submit_profile` → backend orquesta agentes → programa regresa por chunks
- **Loading interactivo:** mientras agentes generan, el jugador ya está en el mundo explorando
- **Notificación de "programa listo":** Aria aparece y dice "¡Tu camino está listo!"

### 3.2 Backend: program-handler ya existe

**Archivo:** `packages/core/src/websocket/routes.ts`

El handler de `program` ya está en routes. Verificar que:
- Reciba perfil del alumno
- Orqueste Perfilador → Contenido → Evaluador → Coordinador
- Envíe programa generado como `MundoEvento` por WS
- Guard programa en SQLite (`hl_sessions` + `hl_session_metrics`)

### 3.3 UX: generación progresiva (no bloqueante)

Siguiendo PIPELINE_HIVELEARN.md FASE 4:

```
Onboarding completa
↓
WS: submit_profile → backend inicia generación
↓
Jugador YA entra al mundo río (no espera)
↓
Mientras explora:
  - Agente Perfilador corre (~2-5s)
  - UI muestra: "Aria está preparando tu camino..."
  - Cada chunk de programa llega → actualiza store
  - Tributarios se "iluminan" conforme módulos se generan
↓
Programa completo → Aria: "¡Tu camino del conocimiento está listo!"
```

### 3.4 RioLoadingScene — Extender para preload de assets

**Archivo:** `packages/ui/src/canvaslearn/rio/scenes/RioLoadingScene.ts`

- Barra de progreso visual (actualmente tiene texto "Cargando mundo...")
- Carga de tilesets, sprites de abeja, audio
- Preload de mundo según programa generado

---

## FASE 4 — Hub World: Río Isométrico + Colmena (Semana 5-7)

**Criterio de éxito:** El jugador camina por el mundo río, ve tributarios activos/bloqueados, interactúa con portales, y entra a la primera zona.

### 4.1 Reemplazar RiverGenerator con Tiled

**Archivo actual:** `packages/ui/src/canvaslearn/rio/world/RiverGenerator.ts`
**Archivo nuevo:** `packages/ui/src/canvaslearn/rio/world/TiledMapLoader.ts`

RiverGenerator es procedural. Se reemplaza con mapas autorados en Tiled:

```
Proceso:
1. Tiled 1.12.1 → crear mapa .tmx (isométrico staggered)
2. Capas: terrain, decoration, collision, portals, water, zones
3. Exportar: tiled --export-map mundo.tmx mundo.json
4. PixiJS: cargar JSON → instanciar tiles con IsometricRenderer
```

Estructura del mapa Tiled:

| Capa | Propósito | TileType |
|------|-----------|----------|
| terrain | Suelo base (pasto, agua, piedra) | grass, water, stone, sand |
| decoration | Árboles, flores, rocas | tree, flower, rock, bush |
| collision | Tiles sólidos (no caminables) | wall, water_deep, tree_trunk |
| portals | Zonas de aprendizaje | portal_zona |
| water | Río y tributarios animados | water_flow, water_tributary |
| zones | Límites de mini-mundos | zone_selva, zone_andes, etc. |

### 4.2 IsometricRenderer — Soporte para tilesets reales

**Archivo:** `packages/ui/src/canvaslearn/rio/renderer/IsometricRenderer.ts`

Actualmente renderiza tiles con colores planos (Graphics). Se extiende:
- Carga de spritesheet de tileset (imagenes desde `packages/godot/assets/tilesets/`)
- Render con `Sprite` en vez de `Graphics.rect()` para tiles con textura
- Sorting por capa (layer order del Tiled JSON)
- Culling de tiles fuera de viewport (optimización)

### 4.3 Sistema de tributarios

En el mapa Tiled, los tributarios son ríos secundarios que salen del río principal:

```
        [Tributario Selva]
              |
[Tributario Andes] ─── [RÍO PRINCIPAL] ─── [Tributario Mayas]
              |
        [Tributario Ciudad]
              |
        [Tributario Pampa]
              |
        [Tributario Galaxia]
```

- **Activo:** agua fluye (WaterSystem animado), portal brillante
- **Bloqueado:** agua seca, portal oscuro con candado
- Se desbloquea conforme el programa del alumno avanza

### 4.4 Portales: interacción mejorada

**Archivo:** `packages/ui/src/canvaslearn/rio/portal/PortalOverlay.tsx`

Actualmente muestra overlay A2UI al pararse sobre portal. Se agrega:
- **Animación de entrada:** zoom in al portal → transición a mini-mundo
- **Preview del mundo:** tooltip con nombre, agente, tema
- **Indicador de bloqueo:** candado + "Completa [zona anterior] primero"
- **E:** tecla de interacción (ya implementada en RioPlayer)

### 4.5 Colmena hexagonal overlay

Sobre el mapa isométrico, un overlay decorativo que muestra la "Gran Colmena":
- Hexágonos semi-transparentes sobre cada zona
- Efecto de brillo pulsante en zonas activas
- Nombre de la zona dentro del hexágono
- Se implementa como Container con Graphics (hex outlines) + Text (labels)

### 4.6 RíoMundo.tsx — Orquestación completa

**Archivo:** `packages/ui/src/canvaslearn/rio/RioMundo.tsx`

Integrar todos los subsistemas:
- AudioManager para música/ambiente
- TiledMapLoader para mapa
- Tributarios con estado del store
- Colmena hexagonal overlay
- PortalOverlay con transiciones
- HUD con XP/nivel/vidas

---

## FASE 5 — Mini-Mundos y Loop de Aprendizaje (Semana 7-10)

**Criterio de éxito:** El jugador completa un módulo completo (explicación → ejercicio → evaluación) dentro de una zona.

### 5.1 Estructura de cada mini-mundo

Cada zona del mapa Tiled tiene:
- **Entrada:** animación de zoom in + saludo del agente
- **Áreas de aprendizaje:** fogatas (lecciones), cuevas (ejercicios), ríos (quizzes)
- **NPC agente:** sprite de la abeja especializada
- **Contenido A2UI:** explicación, ejercicio, quiz via PortalOverlay

No son escenas separadas — son **áreas del mismo mapa** con overlay A2UI.

### 5.2 Loop de aprendizaje (FASE 7 del pipeline)

```
Jugador camina a zona de aprendizaje
↓
RioPlayer detecta tile tipo "learning_spot"
↓
Aria/Agente aparece → explica tema (TTS + subtítulos)
↓
A2UI overlay: contenido (texto, imagen, diagrama)
↓
A2UI overlay: ejercicio (quiz, input, drag-drop)
↓
Jugador responde (texto / voz / click)
↓
WS: respuesta → backend evalúa → feedback del agente
↓
XP + animación → siguiente área
```

### 5.3 Abejas Maestras por zona

| Zona | Agente | Sprite | Comportamiento |
|------|--------|--------|----------------|
| Selva Amazónica | Yara | bee-yara | Explica ciencias, celebra descubrimientos |
| Altiplano Andino | Kimi | bee-kimi | Puzzles lógicos, feedback matemático |
| Cenotes Mayas | Ix | bee-ix | Narrativa histórica, arqueología |
| Ciudad LATAM 2150 | Nova | bee-nova | Mini-código, tecnología interactiva |
| Pampa/Llanos | Chacho | bee-chacho | Storytelling, ejercicios de lenguaje |
| Galaxia Antarés | Cosmo | bee-cosmo | Desafíos avanzados multi-materia |

### 5.4 Mecánicas de juego

- **Vidas:** 3 corazones (❤️❤️❤️), pierde 1 por respuesta muy incorrecta
- **Racha:** x2 XP si acierta 3 seguidas, x3 si 5, x5 si 10
- **Pista:** pedir pista al agente cuesta 10 XP
- **Timer:** algunos ejercicios tienen cuenta regresiva (visual: barra que se vacía)
- **Combo:** respuestas rápidas dan bonus XP

### 5.5 PortalOverlay — Extender para contenido de zona

**Archivo:** `packages/ui/src/canvaslearn/rio/portal/PortalOverlay.tsx`

Tipos de contenido A2UI a renderizar:

| Tipo A2UI | Render Pixi | Interacción |
|-----------|-------------|-------------|
| explicacion | Text + imagen | Botón "Entendido" |
| quiz_opcion | Botones A/B/C/D | Click |
| quiz_input | Input de texto | Teclado + voz |
| ejercicio | Drag & drop / ordenar | Mouse/touch |
| feedback | Texto + emoción agente | Botón continuar |
| celebracion | Partículas + XP counter | Auto-continue |

---

## FASE 6 — Gamificación Completa (Semana 10-12)

**Criterio de éxito:** XP, niveles, logros, y coleccionables funcionan y se persisten en SQLite.

### 6.1 Sistema de XP y niveles

```typescript
const LEVELS = [
  { nivel: 1, nombre: 'Abeja Huevo',        xpRequerido: 0 },
  { nivel: 2, nombre: 'Abeja Larva',         xpRequerido: 100 },
  { nivel: 3, nombre: 'Abeja Obrera',        xpRequerido: 300 },
  { nivel: 4, nombre: 'Abeja Exploradora',   xpRequerido: 700 },
  { nivel: 5, nombre: 'Abeja Guardiana',     xpRequerido: 1500 },
  { nivel: 6, nombre: 'Abeja Maestra',       xpRequerido: 3000 },
  { nivel: 7, nombre: 'Reina Aprendiz',      xpRequerido: 6000 },
]
```

Al subir de nivel:
- Animación de celebración (partículas doradas)
- Aria: "¡Subiste de nivel! Ahora eres [nombre]"
- Efecto visual en colmena (brillo en celdas)
- Guardar en `hl_session_metrics`

### 6.2 Logros

```typescript
const LOGROS = [
  { id: 'primera_chispa',   nombre: 'Primera Chispa',      rareza: 'comun',     condicion: 'completar 1 módulo' },
  { id: 'voz_selva',        nombre: 'Voz de la Selva',     rareza: 'raro',      condicion: 'responder 5 por voz' },
  { id: 'racha_oro',        nombre: 'Racha de Oro',        rareza: 'epico',     condicion: '10 correctas seguidas' },
  { id: 'explorador_andes', nombre: 'Explorador Andino',   rareza: 'raro',      condicion: 'entrar al Altiplano' },
  { id: 'mente_abeja',      nombre: 'Mente de Abeja',      rareza: 'legendario', condicion: '100% quiz sin pistas' },
  { id: 'nocturno',         nombre: 'Abeja Nocturna',      rareza: 'secreto',   condicion: 'jugar después de las 10pm' },
  { id: 'veloz',            nombre: 'Velocidad Alada',     rareza: 'secreto',   condicion: 'completar módulo en <2min' },
]
```

### 6.3 Coleccionables

Cada mini-mundo tiene 3 "panales de conocimiento" ocultos:
- Se descubren al explorar fuera del camino principal
- Se muestran en el hub como decoración de la colmena
- Dan XP bonus al encontrarlos

### 6.4 Store: estado de gamificación

En `rioMundoStore.ts`:
```typescript
gamificacion: {
  xp: number
  nivel: number
  racha: number
  vidas: number
  vidasMaximas: number
  logros: string[]         // IDs de logros obtenidos
  coleccionables: string[] // IDs de panales encontrados
  tributariosActivos: string[] // IDs de zonas desbloqueadas
}
```

### 6.5 Backend: persistencia en SQLite

**Archivo:** `packages/core/src/storage/hivelearn-schema.ts`

Tablas a usar (ya existen en schema):
- `hl_student_profiles`: perfil del alumno
- `hl_sessions`: sesiones de aprendizaje
- `hl_session_metrics`: XP, nivel, tiempo

Tablas nuevas a agregar:
- `hl_achievements`: logros obtenidos
- `hl_collectibles`: coleccionables encontrados
- `hl_module_progress`: progreso por módulo/zona

---

## FASE 7 — Voz Bidireccional (Semana 5-6, paralelo con FASE 4-5)

**Criterio de éxito:** El jugador puede decir su nombre y responder preguntas por voz.

### 7.1 TTS salida (ya parcialmente funcional)

**Archivo:** `packages/ui/src/hooks/useTTSSpeak.ts`

Ya tiene Piper + speechSynthesis fallback. Se mejora:
- Integración con AudioManager (ruta de audio por gain node)
- Cola de TTS (no cortar frase anterior)
- Indicador visual: ícono de parlante mientras Aria habla

### 7.2 STT entrada (nuevo)

**Archivo nuevo:** `packages/ui/src/hooks/useSTTListen.ts`

```typescript
function useSTTListen() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  
  // Primera opción: Web Speech API (chrome://flags, algunos browsers)
  // Fallback: enviar audio PCM al backend → Whisper.cpp → texto
  
  const startListening = useCallback(() => { ... }, [])
  const stopListening = useCallback(() => { ... }, [])
  
  return { isListening, transcript, startListening, stopListening }
}
```

### 7.3 Botón de micrófono en UI

- Siempre visible en HUD durante ejercicios
- Pulsa rojo mientras graba
- Transcripción aparece como texto input (editable antes de enviar)
- Comando de voz: "opción uno", "la B", etc.

### 7.4 Modo voz-primero

Opción activable en onboarding (paso "estilo"):
- "Prefiero hablar" → STT se activa por defecto en todos los inputs
- Hover en botones lee la opción en voz alta
- Respuestas de quiz se pueden dictar

---

## FASE 8 — Mini-Mundos 2-6 (Semana 12-17)

**Criterio de éxito:** Cada mini-mundo tiene al menos 3 módulos completos con contenido generado por agentes.

Cada mundo sigue la misma estructura que FASE 5 con variaciones:

### 8.1 Altiplano Andino (Kimi) — Semana 12-13

- Tileset: montañas, nieve, ruinas, llamas
- Mecánica especial: puzzles de lógica con piedras andinas (drag & drop)
- Generación Tiled: `altiplano.tmx` → `altiplano.json`

### 8.2 Cenotes Mayas (Ix) — Semana 13-14

- Tileset: selva tropical, agua cristalina, pirámides, glifos
- Mecánica especial: arqueología — "desenterrar" respuestas (reveal mechanic)
- Generación Tiled: `cenotes.tmx` → `cenotes.json`

### 8.3 Ciudad LATAM 2150 (Nova) — Semana 14-15

- Tileset: cyberpunk LATAM, neón, murales, drones
- Mecánica especial: mini-juegos de código (completar bloques, debug)
- Generación Tiled: `ciudad.tmx` → `ciudad.json`

### 8.4 Pampa/Llanos (Chacho) — Semana 15-16

- Tileset: pasto infinito, ovejas, asado, guitarras
- Mecánica especial: storytelling — completar historias por voz o texto
- Generación Tiled: `pampa.tmx` → `pampa.json`

### 8.5 Galaxia Antarés (Cosmo) — Semana 16-17

- Tileset: espacio, estrellas, naves, planetas
- Mecánica especial: desafíos multi-materia (boss final educativo)
- Generación Tiled: `galaxia.tmx` → `galaxia.json`

---

## FASE 9 — Polish y Despliegue Offline (Semana 17-19)

**Criterio de éxito:** El juego funciona completo sin internet en una Raspberry Pi 4.

### 9.1 Optimización de rendimiento

- Culling agresivo de tiles fuera de viewport
- Object pooling para sprites de ambientación
- Lazy loading de tilesets por zona (no cargar todos al inicio)
- BitmapText para texto dinámico (FPS), Text para estático
- Resolution adaptiva: 1x en 720p, 2x en 1080p, auto en 4K

### 9.2 Responsive design

```typescript
// Breakpoints
const BREAKPOINTS = {
  mobile: 720,   // ≤720px: controles touch, UI compacta
  tablet: 1024,  // 720-1024px: mixto
  desktop: 1920, // 1024+: controles teclado, UI completa
  ultrawide: 3840 // 4K: escalado
}
```

- Mobile: joystick virtual, botones más grandes, HUD compacto
- Desktop: WASD + mouse, HUD completo, panel de config expandido
- Tablet: adaptivo según orientación

### 9.3 Despliegue offline

```
Raspberry Pi / PC local
├── HiveLearn CLI (bun run start) ← backend + agentes + TTS + Ollama
├── Vite build estático (HTML+JS+CSS) ← servido por Bun gateway
├── Piper TTS (modelos locales .onnx)
├── Ollama + Gemma 4 (modelo local)
└── SQLite local (sin internet requerido)
```

### 9.4 Script de instalación

```bash
# install.sh
curl -fsSL https://hivelearn.install | bash
# Instala: Bun + Ollama + Gemma 4 + Piper + modelos TTS
# Clona repo → bun install → bun run build
# Configura autostart en systemd (Raspberry Pi)
```

### 9.5 Modo maestro/facilitador

- Panel web existente para ver progreso de alumnos
- Sin internet: sincronización por USB/LAN local
- Exportar progreso a JSON → importar en otro dispositivo

---

## Resumen de Archivos Clave por Fase

### FASE 1 — Portada
| Archivo | Acción |
|---------|--------|
| `rio/scenes/RioTitleScene.ts` | Extender: config panel, WS indicator |
| `rio/overlays/RioTitleScreen.tsx` | Extender: botones responsivos |
| `rio/audio/AudioManager.ts` | **NUEVO** — Web Audio API manager |
| `rioMundoStore.ts` | Extender: audioSettings, wsStatus |
| Assets: bee sprites | Generar con PixScii MCP |
| Assets: OGG music/sfx | Migrar desde `godot/art/` |

### FASE 2 — Onboarding
| Archivo | Acción |
|---------|--------|
| `rio/onboarding/RioOnboardingController.ts` | Extender: animaciones, voz, validación |
| `rio/onboarding/RioOnboardingChat.tsx` | Extender: UI adaptativa por edad |
| `rio/bee/RioBee.ts` | Modificar: sprite PixScii reemplaza Graphics |
| `rioMundoStore.ts` | Extender: onboarding struct, studentProfile |

### FASE 3 — Programa + WS
| Archivo | Acción |
|---------|--------|
| `rio/protocol/RioA2UIBridge.ts` | Extender: canal program generation |
| `rio/scenes/RioLoadingScene.ts` | Extender: barra progreso, preload |
| `core/websocket/routes.ts` | Verificar: program handler |
| `core/storage/hivelearn-schema.ts` | Verificar: tablas de sesiones |

### FASE 4 — Hub World
| Archivo | Acción |
|---------|--------|
| `rio/world/TiledMapLoader.ts` | **NUEVO** — reemplaza RiverGenerator |
| `rio/world/RiverGenerator.ts` | Deprecar (mantener como fallback) |
| `rio/renderer/IsometricRenderer.ts` | Extender: tilesets reales, culling |
| `rio/portal/PortalOverlay.tsx` | Extender: preview, bloqueo, transición |
| `rio/RioMundo.tsx` | Integrar: AudioManager, TiledMap, colmena overlay |
| `tiled/mundo.tmx` | **NUEVO** — mapa autorado en Tiled |
| `tiled/tilesets/*.tsx` | **NUEVOS** — tilesets por bioma |

### FASE 5 — Mini-Mundos
| Archivo | Acción |
|---------|--------|
| `rio/portal/PortalOverlay.tsx` | Extender: tipos contenido A2UI |
| `rio/bee/RioSwarmBees.ts` | Extender: NPCs por zona |
| `rio/player/RioPlayer.ts` | Extender: learning_spot detection |
| `rioMundoStore.ts` | Extender: vidas, racha, gamificación |

### FASE 6 — Gamificación
| Archivo | Acción |
|---------|--------|
| `rioMundoStore.ts` | Extender: gamificacion struct |
| `rio/overlays/RioHUD.tsx` | Extender: XP, nivel, logros, vidas |
| `core/storage/hivelearn-schema.ts` | Agregar: tablas achievements, collectibles |

### FASE 7 — Voz
| Archivo | Acción |
|---------|--------|
| `hooks/useTTSSpeak.ts` | Mejorar: cola, integración AudioManager |
| `hooks/useSTTListen.ts` | **NUEVO** — Web Speech API + Whisper fallback |
| `rio/overlays/RioHUD.tsx` | Agregar: botón micrófono |

### FASE 8 — Mini-Mundos 2-6
| Archivo | Acción |
|---------|--------|
| `tiled/altiplano.tmx` | **NUEVO** |
| `tiled/cenotes.tmx` | **NUEVO** |
| `tiled/ciudad.tmx` | **NUEVO** |
| `tiled/pampa.tmx` | **NUEVO** |
| `tiled/galaxia.tmx` | **NUEVO** |
| Assets: tilesets por bioma | Migrar desde `godot/assets/tilesets/` + nuevos |

### FASE 9 — Polish + Offline
| Archivo | Acción |
|---------|--------|
| `rio/renderer/IsometricRenderer.ts` | Optimizar: culling, pooling |
| `RioMundo.tsx` | Optimizar: lazy loading, resolution adaptiva |
| `install.sh` | **NUEVO** — script instalación offline |

---

## Criterios de Éxito Global

El juego está completo cuando:

1. Un niño de 8 años puede navegar solo desde la pantalla de título hasta completar su primer módulo sin ayuda adulta
2. Un adulto de 50 años que nunca usó tecnología puede responder preguntas por voz
3. Los 6 mini-mundos tienen al menos 3 módulos de contenido cada uno (generado por agentes)
4. La BD registra correctamente toda la actividad (progreso, respuestas, XP, logros)
5. El sistema funciona 8 horas continuas en una Raspberry Pi 4 sin fallos
6. El tiempo de arranque (desde encender hasta estar en el hub) es menor a 30 segundos
7. Funciona sin internet: Bun + Ollama + Piper + SQLite todo local

---

## Stack Tecnológico Definitivo

| Componente | Tecnología | Nota |
|-----------|-----------|------|
| Motor de juego | PixiJS v8 + React + Vite | Ya existe, extender |
| Lenguaje frontend | TypeScript | Ya existe |
| Backend | TypeScript + Bun | Ya existe |
| Agentes IA | Ollama + Gemma 4 (local) | Reemplaza API calls |
| Voz salida | Piper TTS (existente) | .onnx models locales |
| Voz entrada | Web Speech API + Whisper.cpp | Fallback chain |
| BD | SQLite (existente) | hivelearn-schema |
| Comunicación | WebSocket (A2UI extendido) | Ya existe |
| Mapas | Tiled 1.12.1 → JSON | Reemplaza RiverGenerator |
| Arte pixel | PixScii MCP + tilesets existentes | 16x16 / 32x32 |
| Store | Zustand + persist | rioMundoStore |
| Resolución | 720p-4K adaptivo | Breakpoints responsive |
| Despliegue | Bun serve (HTML estático) | Sin internet |

---

## Timeline Resumen

```
Semana  1-2  → FASE 1: Portada + AudioManager + sprites abeja
Semana  2-4  → FASE 2: Onboarding adaptativo + voz
Semana  4-5  → FASE 3: Program generation + WS progresivo
Semana  5-7  → FASE 4: Hub world (Tiled + colmena + tributarios)
Semana  5-6  → FASE 7: Voz bidireccional (paralelo)
Semana  7-10 → FASE 5: Mini-Mundo 1 (Selva) + loop aprendizaje
Semana 10-12 → FASE 6: Gamificación completa
Semana 12-17 → FASE 8: Mini-Mundos 2-6 (uno cada ~1 semana)
Semana 17-19 → FASE 9: Polish + offline + instalación
```

---

*Plan generado en sesión de diseño — HiveLearn, 2026-05-04*
*Supera plan anterior: docs/plans/2026-05-03-hivelearn-godot-game-plan.md (Godot-centric, deprecado)*
