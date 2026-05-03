# 🐝 HiveLearn - Mundo Río: Documentación Completa

## Índice

1. [Visión General](#visión-general)
2. [Flujo de Navegación](#flujo-de-navegación)
3. [El Mundo Isométrico](#el-mundo-isométrico)
4. [Controles del Jugador](#controles-del-jugador)
5. [El Coordinador Abeja](#el-coordinador-abeja)
6. [Sistema de Diálogo](#sistema-de-diálogo)
7. [Sistema de Zonas y Tributarios](#sistema-de-zonas-y-tributarios)
8. [Interacción con Portales](#interacción-con-portales)
9. [Sistema de XP y Niveles](#sistema-de-xp-y-niveles)
10. [Progreso del Swarm](#progreso-del-swarm)
11. [Efectos Visuales](#efectos-visuales)
12. [Sistema de Audio y TTS](#sistema-de-audio-y-tts)
13. [Estado del Juego y Persistencia](#estado-del-juego-y-persistencia)
14. [Conexión en Tiempo Real](#conexión-en-tiempo-real)
15. [HUD e Interfaz](#hud-e-interfaz)

---

## 1. Visión General

El **Mundo Río** es el núcleo unificado de HiveLearn. Es un mundo isométrico top-down (vista desde arriba, estilo LEGO) donde el estudiante:

- Explora un mundo infinito generado procedimentalmente
- Es guiado por una abeja coordinator conversacional
- Completa lecciones dentro de portales interactivos
- Gana XP y sube de nivel
- Ve cómo el agua fluye cuando los agentes del swarm completan su trabajo

**Metáfora**: El río representa el flujo de aprendizado. Cada tribulario es una zona de aprendizaje. El agua fluye cuando los agentes completan su trabajo de generación de contenido.

---

## 2. Flujo de Navegación

```
Landing (/) —> Río (/rio)
```

No hay pantallas intermedias. Todo ocurre dentro del mundo río:

1. **Llegada al Río**: El estudiante entra al mundo por primera vez en modo "login"
2. **Login**: Buscar nickname existente o crear nuevo perfil con avatar personalizado
3. **Onboarding Bee**: Conversación guiada con la abeja (nombre, edad, tema, objetivo, estilo de aprendizaje)
4. **Exploración Libre**: El jugador camina por el mundo, descubre tributarios
5. **Portal Zonas**: Entra a lecciones, completa ejercicios, recibe feedback
6. **Progreso**: Gana XP, activa más tributarios, el mundo crece

---

## 3. El Mundo Isométrico

### Coordenadas Isométricas

El mundo usa coordenadas isométricas (no cartesianas):
- `x`: Eje diagonal hacia abajo-derecha
- `y`: Eje diagonal hacia abajo-izquierda
- Conversión a pantalla: `screen.x = (x - y) * TILE_WIDTH/2`, `screen.y = (x + y) * TILE_HEIGHT/2`

### Tipos de Tile

| Tipo | Descripción | Caminable | Color base |
|------|------------|----------|----------|
| `agua_profunda` | Río principal, corriente | ✅ (no, requiere puente) | 0x0D47A1 |
| `agua` | Río poco profundo | ✅ | 0x1976D2 |
| `cascada` | Agua en movimiento | ❌ | 0x42A5F5 |
| `pasto` | Césped verde | ✅ | 0x4CAF50 |
| `tierra` | Tierra/simple | ✅ | 0x8D6E63 |
| `piedra` | Rocas | ✅ | 0x9E9E9E |
| `arena` | Playa/desierto | ✅ | 0xFFE082 |
| `portal_zona` | Portal de lección | ✅ | 0xFFD600 |
| `arbol` | Árboles grandes | ❌ | 0x1B5E20 |
| `puente` | Cruces de río | ✅ | 0xBCAAA4 |

### Elevación

Los tiles pueden tener elevación (`tile.elevation`), lo que crea paredes 3D:
- Lado derecho: oscurecido un 20%
- Lado izquierdo: oscurecido un 40%

---

## 4. Controles del Jugador

### Teclado

| Tecla | Acción |
|------|--------|
| `W` / `ArrowUp` | Caminar hacia arriba (norte) |
| `S` / `ArrowDown` | Caminar hacia abajo (sur) |
| `A` / `ArrowLeft` | Caminar hacia izquierda (oeste) |
| `D` / `ArrowRight` | Caminar hacia derecha (este) |
| `Shift` | Correr (velocidad 2x) |
| `E` / `Enter` | Interactuar con portal (al estar sobre uno) |
| `Escape` | Cerrar portal/menú |

### Movimiento

- **Velocidad caminata**: 3 tiles/segundo
- **Velocidad correr**: 6 tiles/segundo (Shift)
- **Suavizado**: Lerp con factor 0.15 para movimiento gradual
- **Animación de oscilación**: Ondulación vertical al caminar (`Math.sin(time/120) * 3`)

### Dirección

8 direcciones posibles: `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`

El jugador muestra un triángulo direccional blanco que apunta hacia la dirección de movimiento.

---

## 5. El Coordinator Abeja

La abeja es el guía del estudiante.always visible y sigue al jugador.

### Estados de la Abeja

| Estado | Comportamiento | Posición |
|--------|--------------|---------|
| `following` | Sigue al jugador a distancia 2 | Detrás del jugador |
| `guiding` | Vuela adelante 3 tiles | Delante del jugador |
| `talking` | Se detiene, face al jugador | Cerca del jugador |
| `celebrating` | Efecto de partículas | En el lugar |
| `pointing` | Señala hacia objetivo | Gira hacia target |
| `idle` | Permanece quieta | En su posición |

### Movimiento

- Suavizado: `lerpSpeed = 0.05`
- Oscilación vertical: `Math.sin(time/300) * 4` (bob)
- Profundidad: `zIndex = targetY + 0.1` (siempre ligeramente adelante del jugador)

### Apariencia

```
      🐝
    ◐   ◑
     ╱╲
    ╱  ╲
   ▼    ▼
```

- **Abdomen**: Amarillo con rayas negras
- **Thorax**: Amarillo
- **Cabeza**: Negra con ojos blancos
- **Antenas**: Dos apéndices con esferas amarillas
- **Alas**: Animación de aleteo con `Math.sin(time/50) * 0.8`
- **Glow**: Pulso dorado `0.1 + Math.sin(time/500) * 0.05`

---

## 6. Sistema de Diálogo

### Burbujas de Conversación

La abeja muestra burbujas de diálogo sobre ella:
- Fondo blanco/crema con borde dorado
- Triángulo puntero hacia abajo
- Texto en Arial 14px, color negro
- Duración: configurable (default 4000ms)
- Fade out: último 500ms
- Float animation: `Math.sin(now/800) * 3`

### Posicionamiento

Las burbujas aparecen en posición isométrica del jugador + offset `y - 60`.

### Casos de Uso

- Primero: Saludo de la abeja al entrar al mundo
- Onboarding: Preguntas guided (nombre, edad, tema, objetivo)
- Guía: "Mira ese portal!", "Presiona E para entrar"
- Feedback: "Muy bien!", "Inténtalo de nuevo"
- Celebración: "¡Felicitaciones!"

---

## 7. Sistema de Zonas y Tributarios

### ¿Qué es un Tributario?

Cada tributario es una zona de aprendizaje representada como un-ramificado del río principal. Tiene:
- Un nombre (ej: "Conceptos de Fracciones")
- Un `zoneNumero` identificador
- Un `moduloUuid` linking al contenido del swarm
- Un `tipoPedagogico`: `concept`, `exercise`, `quiz`, `challenge`, `milestone`, `evaluation`
- XP de recompensa
- Un path de tiles desde la fuente hasta el portal

### Estados del Tributario

| Estado | Descripción | Apariencia |
|--------|------------|-----------|
| `seco` | No iniciado | Tierra/marrón |
| `fluuyendo` | Activo/agente trabajando | Agua animada |
| `completado` | Completado por el estudiante | Verde |

### Activación

Cuando un agente del swarm completa su módulo:
1. El tributary cambia de `seco` a `fluuyendo`
2. Las partículas de agua fluyen por el path
3. El portal en la zona se ilumina

### Generación del Mundo

- 5 ramales tributarios por defecto
- 42 tiles de largo cada uno
- Generados procedimentalmente via `generateRioMundo()`

---

## 8. Interacción con Portales

### Detección de Portal

Cuando el jugador se para sobre un tile `portal_zona` con `flowState === 'fluyendo'`:
- Se muestra un letrero "Presiona E para entrar"

### Entrada al Portal

1. El jugador presiona `E` o `Enter`
2. Animación de entrada: Zoom cámara 1 → 2 (600ms)
3. La abeja entra en estado `talking`
4. Se abre el PortalOverlay (fade in)

### PortalOverlay (Contenido Lección)

El overlay muestra contenido A2UI:
- Header: Nombre de la zona + tipo (📖概念, ✏️Ejercicio, ❓Quiz, ����Reto)
- Area de contenido: Renderizado A2UI con preguntas/ejercicios
- Footer: Zona # + XP reward + "Presiona ESC para salir"

### Respuestas

- El estudiante completa ejercicios/respuestas
- `handleAction` → `RioA2UIBridge.enviarRespuesta()`
- Servidor procesa → WS envía feedback
- A2UI muestra feedback (correcto/incorrecto, XP gained)

### Salida del Portal

1. El jugador presiona `Escape` o hace click en "Volver al río"
2. Animación: Zoom 2 → 1, fade out del overlay
3. Cámara vuelve a posición del jugador
4. La abeja vuelve a estado `following`

---

## 9. Sistema de XP y Niveles

### Ganancias de XP

| Acción | XP |
|--------|-----|
| Completar nodo concept | +50 XP |
| Completar ejercicio | +75 XP |
| Completar quiz | +100 XP |
| Completar challenge | +150 XP |
| Respuesta correcta | +10-25 XP |
| Racha streaks | Bonus multiplicador |

### Niveles

| Nivel | XP Acumulado | Badge |
|-------|-------------|-------|
| 1 | 0 | 🥚 Huevo |
| 2 | 100 | 🐣 Cría |
| 3 | 300 | 🐤 pollito |
| 4 | 600 | 🐦 Ave |
| 5 | 1000 | 🦅 Águila |
| 6+ | +500 c/u | 👑 Rey/Reina |

### barra de Progreso

La barra de XP muestra progreso hacia el siguiente nivel:
```
progress = ((xpTotal - xpDelNivelAnterior) / xpParaSiguienteNivel) * 100
```

### Racha (Streak)

- +1 por cada respuesta correcta seguida
- Se pierde con respuesta incorrecta
- Mejor racha registrada persistentemente
- Bonificación XP: `racha * 5` XP por respuesta correcta

---

## 10. Progreso del Swarm

### Arquitectura Swarm

HiveLearn Orchestra usa 18+ agentes especializados:
- **Planner**: Organiza el currículum
- **ConceptGenerator**: Crea explicaciones
- **ExerciseGenerator**: Genera ejercicios
- **QuizGenerator**: Crea quizzes
- **Evaluator**: Evalúa respuestas
- etc.

### Conexión WebSocket

- `/ws/hivelearn-program`: Mensajes del swarm (progress, contenido, feedback)
- `/ws/hivelearn-events`: Eventos del swarm (state changes)
- Ping cada 30s, reconexión automática con backoff exponencial

### Mensajes del Servidor

| Tipo | Payload | Acción |
|------|---------|--------|
| `program_generation_start` | `{ agentId, agentName }` | Mostrar "X trabajando..." |
| `program_generation_progress` | `{ agentId, progress }` | Actualizar progress bar |
| `program_generation_complete` | `{ programaUuid }` | Ocultar progress, activar tributarios |
| `swarm_state_update` | `{ agentStates }` | Actualizar estado de agentes |
| `module_complete` | `{ zoneNumero, moduloUuid }` | Activar tributary (fluir agua) |
| `nivel_up` | `{ nuevoNivel }` | Mostrar animación nivel + |
| `evaluacion_result` | `{ correcta, xpGanado }` | Mostrar feedback |

### Flujo de Activación

1. Generación del programa inicia
2. El estudiante puede explorar mientras tanto
3. Cada agente completa → tributario relacionado se activa (agua fluye)
4. Todos completados → transición al estado `completed`

---

## 11. Efectos Visuales

### Agua Animada

Las tiles de agua tienen shimmer:
- Fórmula: `baseColor + shimmer * sin(time/800)`
- Shimmer: `±10` en canal verde
- Borde superior: línea azul clara (`0x64B5F6`, alpha 0.3)

### Partículas de Agua (WaterSystem)

- Sistema de partículas GPU para agua fluyendo
- Densidad: ~50-100 partículas
- Movimiento: sigue el path del tributario
- Color: Azul con alpha variable
- Recreades cada frame (optimizable a pooled Graphics)

### Portal Glow

Portal zones tienen glow animated:
- Círculo interno: amarillo alpha 0.6
- Círculo externo: dorado alpha 0.8, stroke 2px
- Radio: 8px interior, 12px exterior

### Flujo Indicador

En tiles de tributary fluyendo:
- Dos líneas horizontales pequeñas
- Color azul, alpha 0.5
- Indicates dirección del flujo

### Animaciones de UI

| Animación | Propósito | Duración |
|----------|----------|----------|
| Portal open | Fade in + scale 0.95→1 | 500ms |
| Portal close | Fade out + scale 1→0.95 | 500ms |
| Nivel up | Escala + shake + particulas | 2000ms |
| XP float | Float up + fade out | 1500ms |
| Logro | Glow pulse + scale | 3000ms |

---

## 12. Sistema de Audio y TTS

### Text-to-Speech (TTS)

**Proveedor**: Piper TTS server local (o fallback a browser SpeechSynthesis)

**Endpoint**: `POST /api/tts/synthesize`
```json
{
  "text": "Hola! Soy tu guía abeja.",
  "voice": "es-ES-MinervaNeural"
}
```

**Fallback**: Si Piper no está disponible, usa `window.speechSynthesis` (menos natural pero funciona offline)

### Uso en el Mundo

- Bee speak en cada bubble de diálogo
- `useTTSSpeak()` hook gesticles la síntesis
- Cola de mensajes: reproduce secuencialmente
- Audio reproduce vía `AudioContext`

### Son ambientales (futuro)

- Música de fondo:loop de naturaleza
- Son de agua fluyendo
- Son de pájaros
- Son de éxito al completar

(introducir estosassets más adelante si el usuario los necesita)

---

## 13. Estado del Juego y Persistencia

### Zustand Store: `rioMundoStore`

Todo el estado se managea en un solo store:

```typescript
interface RioMundoState {
  // Identidad
  alumnoId: string | null
  nickname: string | null
  perfil: StudentProfile | null
  avatar: AvatarCustomization

  // Sesión
  sessionId: string | null
  programaUuid: string | null

  // Fase de login
  loginPhase: 'nickname_input' | 'avatar_select' | 'loading' | 'entering_world' | 'onboarding_chat' | 'in_world'

  // Onboarding Bee
  onboarding: OnboardingChatState

  // Mapa y jugador
  mapa: IsoMap | null
  jugador: AvatarState

  // Cámara
  camara: { x, y, zoom, targetX, targetY, targetZoom }

  // Progreso
  xpTotal: number
  xpSesion: number
  nivelActual: number
  progress: number
  vidas: number
  racha: number
  mejorRacha: number

  // Tributarios y zonas
  tributaries: Tributary[]
  zonaActual: number
  modulosCompletados: string[]

  // Abeja y diálogo
  beeState: BeeState
  dialogBubbles: DialogBubble[]

  // Portal
  portal: { phase, zonaNumero, moduloUuid, zoomTarget, a2uiMessages }

  // Swarm
  swarmProgress: SwarmProgressWorld
  agentStatuses: Record<string, AgentStatus>
}
```

### Persistencia

El store usa `persist` middleware de Zustand:
- Guarda en `localStorage`
- Keys incluyen `hivelearn rio state`
- Restaura automáticamente al cargar

### Campos Persistidos

```typescript
partialize(state) {
  return {
    nickname: state.nickname,
    perfil: state.perfil,
    avatar: state.avatar,
    xpTotal: state.xpTotal,
    nivelActual: state.nivelActual,
    vidas: state.vidas,
    racha: state.racha,
    mejorRacha: state.mejorRacha,
    logros: state.logros,
    coleccionables: state.coleccionables,
    modulosCompletados: state.modulosCompletados,
    tributaries: state.tributaries,
    zonaActual: state.zonaActual,
    portal: state.portal,
  }
}
```

---

## 14. Conexión en Tiempo Real

### WebSockets

| Endpoint | Propósito |
|----------|----------|
| `wss://host/ws/hivelearn-program` | Programa/mensajes del swarm |
| `wss://host/ws/hivelearn-events` | Eventos del swarm |

### Hook: `useRioLive`

```typescript
const {
  isConnected,
  isGenerating,
  currentAgentId,
  currentAgentName,
  error,
  a2uiMessages,
} = useRioLive(sessionId, alumnoId)
```

### Reconexión

- Intervalo ping: 30s
-超时: 10s
- Backoff exponencial: 1s → 2s → 4s → 8s → max 30s
- Máximo intentos: 10
- Después de 10 fallos: mostrar "Sin conexión"

### Integración con Bridge

Los mensajes WS se procesan via `RioA2UIBridge`:
- `bridge.procesarMensajeServidor(message)`
- Traduce mensajes a acciones del mundo:
  - `activarTributary()` → agua fluye
  - `agregarXP()` → UI feedback + float
  - `subirNivel()` → animación
  - `mostrarLogro()` → toast

---

## 15. HUD e Interfaz

### Elementos del HUD

Located overlaying el canvas PixiJS:

#### Barra Superior Izquierda

- Badge de nivel (emoji)
- Nombre del nivel + número
- Barra de progreso XP
- Total XP

#### Barra Superior Derecha

- Vidas (❤️❤️❤️)
- Racha activa (🔥 X)

#### Barra Inferior Centro

- Contador de zonas completadas: "🌍 2/5 zonas completadas"

#### Mini-mapa (Placeholder)

- Área 32x32px en esquina inferior derecha
- Muestra tributarios, posición jugador

### Pantallas de Login (Dentro del Río)

#### Nickname Input

- Input de nickname
- "Buscar" o "Crear nuevo"
- Si existe: restaurar sesión
- Si no existe: crear nuevo perfil

#### Avatar Selection

- 4 opciones de color de piel
- 4 colores de cabello
- 4 colores de camiseta
- 4 colores de pants
- Accesorios opcionales: mochila, sombrero, botas

### Onboarding Bee Chat

- Burbujas de diálogo alternadas
- 5 pasos: nombre → edad → tema → objetivo → estilo
- Validación de cada respuesta
- Progress dots indicadores

### Portal Overlay

- Header con nombre de zona + tipo
- Área de contenido A2UI
- Footer con zona # + XP reward
- Botón "Volver al río" +提示 "ESC"

---

## 16. Glosario de Términos

| Término | Definición |
|--------|-----------|
| Isométrico | Vista 2D con perspectiva 3D (45°) |
| Tile | Una celda individual delgrid |
| Tributario | Zona de aprendizaje/ramal del río |
| Portal zona | Tile que permite entry a contenido |
| A2UI | Protocolo de UI agent-to-user |
| Swarm | Conjunto de 18+ agentes de IA |
| Bee coordinator | La abeja guía del estudiante |
| Z-index | Orden de renderizado (profundidad) |
| Lerp | Interpolación lineal para suavizado |
| TTS | Text-to-Speech |
| WS | WebSocket |

---

## 17. Rutas y Endpoints

### Rutas Frontend

| Ruta | Componente | Descripción |
|------|------------|------------|
| `/` | LandingPage | Landing page marketing |
| `/how-to-use` | HowToUsePage | Tutorial |
| `/dashboard` | DashboardPage | Dashboard del usuario |
| `/sessions` | SessionsListScreen | Lista de sesiones |
| `/config` | HiveLearnConfigPage | Configuración |
| `/rio` | RioMundoPage | Mundo principal (TODO) |

### Endpoints Backend

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/api/hivelearn/session` | POST | Crear sesión |
| `/api/hivelearn/sessions` | GET | Listar sesiones |
| `/api/hivelearn/student-profile` | POST | Crear/actualizar perfil |
| `/api/hivelearn/student-by-nickname` | GET | Buscar por nickname |
| `/api/hivelearn/generate` | POST | Iniciar generación swarm |
| `/api/tts/synthesize` | POST | Sintetizar speech |
| `/ws/hivelearn-program` | WS | Mensajes del programa |
| `/ws/hivelearn-events` | WS | Eventos del swarm |

---

## 18. Futuras Mejoras

- [ ] Mini-map functional
- [ ] Guardado de posición del jugador
- [ ] Más efeitos de partículas (celebración)
- [ ] Son ambientales y de UI
- [ ] Offline mode con Ollama local
- [ ] Múltiples mapas/zonas explorables
- [ ] Sistema de logros más elaborado
- [ ] Inventario de coleccionables
- [ ] Tabla de líderes
- [ ] Logros sociales

---

*Documento generado para el proyecto HiveLearn - Mundo Río v1.0*