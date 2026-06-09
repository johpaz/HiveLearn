# HiveLearn — Juego de plataformas tipo Mario con PixiJS

**Fecha:** 2026-06-09
**Estado:** Diseño validado

## Resumen

El flujo de aprendizaje de HiveLearn (onboarding → lección → evaluación → resultado) se convierte en un platformer 2D pixel-art tipo Mario construido con PixiJS v8. La carcasa React (landing, sesiones, config, dashboard) se mantiene; el pipeline de 8 agentes no se toca. Público LATAM, 100% offline en runtime.

## Decisiones clave

| Decisión | Elección |
|---|---|
| Alcance | Juego como mundo de aprendizaje; React sigue siendo la carcasa |
| Mapeo educativo | Mundo = módulo, Nivel = lección (mapa estilo Mario World) |
| Onboarding | NPC guía "Maya" en nivel tutorial; mismas preguntas del chat actual |
| Contenido en nivel | Bloques '?' entregan conceptos (texto + TTS); evaluación = jefe final |
| Assets | Pixel-art generado (pixscii) + packs CC0 (Kenney); audio Howler.js |

## 1. Arquitectura general

Nuevo paquete `packages/game` (`@hivelearn/game`) en el monorepo Bun, con PixiJS v8. La UI React lo consume como dependencia workspace.

- **React (sin cambios):** Landing, Sessions, Config, Dashboard, Swarm.
- **PixiJS (nuevo):** ruta `/play/:sessionId` monta `<GameCanvas>` que arranca la `Application` de Pixi a pantalla completa.

**Escenas** (máquina de estados, una activa a la vez):

```
BootScene        → carga assets + datos de sesión
TutorialScene    → onboarding con NPC guía (nivel 0)
WorldMapScene    → mapa de mundos (módulo = mundo, lección = nivel)
LevelScene       → platformer: bloques '?', enemigos, checkpoint
BossScene        → evaluación como combate de jefe
ResultScene      → estrellas, XP, desbloqueo del siguiente nivel
```

**GameBridge:** el juego nunca habla directo con el backend. Una capa de eventos tipados (EventEmitter) traduce entre el juego y los stores/hooks existentes (`lessonStore` Zustand, `useHiveLearnLive` WebSocket). El pipeline de 8 agentes queda intacto.

## 2. Flujo del alumno

1. **TutorialScene (nivel 0):** la abeja NPC "Maya" recibe al alumno con diálogos RPG. Hace las preguntas del onboarding actual (qué quiere aprender, edad, nivel previo); el alumno responde en un input pixel-art. Entre preguntas, Maya enseña controles con acciones físicas ("salta ese tronco"). Las respuestas viajan por el GameBridge al pipeline.
2. **Carga jugable:** mientras los agentes generan la lección, el alumno juega en una mini-zona (recoger polen) en vez del LoadingScreen estático.
3. **WorldMapScene:** vista cenital tipo Mario World. Cada módulo = un mundo temático (Prado, Bosque, Montaña, Colmena Real); cada lección = un nodo conectado por caminos. Solo el siguiente nivel está desbloqueado; los completados muestran 1–3 estrellas.
4. **LevelScene:** nivel lateral con scroll. Los bloques '?' contienen los conceptos en orden y son la llave de la puerta del jefe (no se llega al jefe sin abrirlos todos).
5. **BossScene → ResultScene:** el jefe lanza las preguntas de la evaluación; respuesta correcta le quita vida, error quita un corazón al alumno. Al vencerlo: estrellas, XP y desbloqueo en el mapa.

## 3. Motor del juego

- **Render:** PixiJS v8 (WebGL, fallback canvas).
- **Física:** propia, AABB contra tilemap (gravedad, velocidad, colisiones). Sin Matter.js.
- **Loop:** `Ticker` de Pixi con delta-time fijo (60 FPS lógicos) — física idéntica en equipos modestos.

```
packages/game/src/
  engine/      → loop, física AABB, tilemap, cámara, input, audio
  entities/    → Player (abeja), NPC, QuestionBlock, Coin, Enemy, Boss
  scenes/      → las 6 escenas
  bridge/      → GameBridge (eventos tipados hacia React/stores)
  levels/      → generador: LevelSpec → tilemap
  ui/          → HUD (corazones, polen/XP), diálogos, paneles de contenido
```

- **Generación de niveles:** determinista (seed = ID de lección). Toma N conceptos + dificultad y produce N segmentos de plataformas, un bloque '?' por concepto, enemigos/monedas según dificultad. Misma lección = mismo nivel.
- **Controles:** teclado (flechas/WASD, espacio, E) y táctil (cruceta + botones virtuales) para tablets escolares.
- **Cámara:** sigue al jugador con suavizado y look-ahead, limitada a bordes del nivel.
- **Pausa/persistencia:** abrir un bloque '?' pausa el ticker; progreso (bloques abiertos, checkpoint) se guarda vía GameBridge en SQLite.

## 4. Integración con pipeline y datos

**Contrato `LevelSpec`** (en `@hivelearn/core`):

```ts
interface LevelSpec {
  lessonId: string;
  seed: string;              // determinismo del nivel
  theme: WorldTheme;         // prado | bosque | montaña | colmena
  difficulty: 1 | 2 | 3;
  concepts: ConceptBlock[];  // → bloques '?': título, contenido, ttsAudioId
  boss: BossSpec;            // preguntas de evaluación + vidas del jefe
}
```

Un adaptador `lessonToLevelSpec` en core traduce la salida A2UI actual a este spec — el pipeline no se reescribe.

**Runtime:**
1. `/play/:sessionId` → GameBridge pide la sesión por WebSocket (`useHiveLearnLive`).
2. Sin programa → TutorialScene; respuestas van al pipeline con los mismos mensajes que `ChatOnboardingScreen`.
3. Lección lista → `lessonToLevelSpec` → LevelScene.
4. Respuestas del jefe → endpoints de `useEvaluation`; el backend califica como siempre.
5. Resultado → XP/estrellas vía `useGamification`; progreso del mapa en tabla nueva `game_progress` (nivel, estrellas, bloques abiertos, checkpoint).

**Se reutiliza sin tocar:** pipeline de 8 agentes, gateway WebSocket, evaluación, gamificación, TTS Piper (audio pre-generado por concepto al crear la lección, servido como asset del nivel).

**Se deprecia (queda como fallback accesible):** `A2UILessonScreen`, `EvaluationScreen`, `ResultScreen`, `LoadingScreen`, `ChatOnboardingScreen`.

## 5. Audio, efectos y assets

**Audio (Howler.js):**
- Música chiptune CC0 en loop: una pista por tema de mundo + pista de jefe (acelera con poca vida). Ducking automático cuando habla el TTS.
- SFX: salto, moneda, bloque '?', daño, golpe al jefe, victoria, blip de diálogo. Kenney CC0 + jsfxr.
- Voz: TTS Piper pre-generado por concepto, se reproduce al abrir cada bloque '?', con botón repetir.
- Todo en el bundle de Vite — cero red en runtime (requisito offline).

**Efectos visuales:**
- Partículas: polen al recoger monedas, polvo al aterrizar, chispas en bloques.
- Screen shake sutil (daño, golpes al jefe).
- Squash & stretch del jugador; números XP flotantes (port de `XpFloatAnimation` a Pixi).
- Transiciones de escena con cortina de hexágonos (panal).

**Sprites:** pixel-art 16×16/32×32 generado con pixscii (abeja con idle/run/jump, NPC Maya, jefes por mundo, tiles por tema) + tiles Kenney CC0. Spritesheets con texture atlas de Pixi.

## Testing

- Física y generador de niveles son funciones puras → unit tests con `bun test`: colisiones AABB, determinismo del seed, adaptador `lessonToLevelSpec`.
- Escenas: prueba manual con nivel fijo de desarrollo (`?devLevel=1`).
