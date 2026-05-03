# HiveLearn: La Gran Colmena — Plan de Construcción del Juego

**Fecha:** 2026-05-03  
**Motor:** Godot 4.x (exportación HTML5 + desktop)  
**Backend:** TypeScript/Bun existente (WebSocket + Piper TTS)  
**Audiencia:** Niños, adolescentes y adultos sin experiencia tecnológica previa  
**Contexto:** Open source, zonas sin internet en LATAM  

---

## Concepto

La **Gran Colmena** es un mundo hexagonal vivo que actúa como hub central. Cada celda es un portal a un mini-mundo temático con biomas latinoamericanos. El jugador es un aprendiz guiado por **Reina Aria** (agente coordinador) y **Abejas Maestras** especializadas por materia. La narrativa: *"La colmena perdió su luz. Debes recuperar las chispas del conocimiento."*

### Abejas Maestras por Mini-Mundo

| Zona | Mini-Mundo | Agente | Materia |
|------|-----------|--------|---------|
| 1 | Selva Amazónica | Yara (abeja-jaguar) | Ciencias / Naturaleza |
| 2 | Altiplano Andino | Kimi (abeja-cóndor) | Matemáticas / Lógica |
| 3 | Cenotes Mayas | Ix (abeja-serpiente) | Historia / Cultura |
| 4 | Ciudad LATAM 2150 | Nova (abeja cyborg) | Tecnología / Computación |
| 5 | Pampa / Llanos | Chacho (abeja-gaucho) | Lenguaje / Comunicación |
| 6 | Galaxia Antarés | Cosmo (abeja-astronauta) | Ciencia Avanzada |

---

## Arquitectura Técnica

```
┌─────────────────────────────────────────────────────────┐
│                   GODOT 4 (Frontend/Juego)              │
│                                                         │
│  TitleScreen → Onboarding → Hub (La Gran Colmena)       │
│       ↓              ↓            ↓                     │
│  [Aria habla]  [Perfil edad]  [Portales a mini-mundos]  │
│                                                         │
│  WebSocket Client ←──────────────────────────────────┐  │
└──────────────────────────────────────────────────────┼──┘
                                                       │
                          WebSocket (localhost)        │
                                                       │
┌──────────────────────────────────────────────────────┼──┐
│              BACKEND TypeScript/Bun (ya existe)      │  │
│                                                       │  │
│  gateway/server.ts  ←─────────────────────────────────┘  │
│       ↓                                                  │
│  onboarding-handler.ts → Agentes IA (Aria, Yara, etc.)  │
│       ↓                                                  │
│  Piper TTS → audio PCM → WebSocket → Godot              │
│       ↓                                                  │
│  SQLite (hivelearn-schema) → BD de progreso             │
└──────────────────────────────────────────────────────────┘
```

### Comunicación Godot ↔ Backend

- **Protocolo:** WebSocket existente (A2UI extendido con `MundoEvento`)
- **Voz salida (TTS):** Piper en backend → audio binario → `AudioStreamGenerator` en Godot
- **Voz entrada (STT):** `AudioEffectCapture` en Godot → PCM → backend (Whisper/similar)
- **Modo offline:** Backend corre en `localhost:3000`, Godot apunta ahí siempre

### Despliegue Offline LATAM

```
Raspberry Pi / PC local
├── HiveLearn CLI (bun run start)  ← backend + agentes + TTS
├── Godot exportado (HTML5 o .exe/.bin)
└── SQLite local (sin internet requerido)
```

---

## Base de Datos — Tablas Clave a Llenar

El juego alimenta estas tablas en cada sesión:

```sql
-- Jugador
alumnos (id, nickname, avatar, edad_rango, created_at)

-- Progreso
sesiones (id, alumno_id, programa_uuid, inicio, fin, xp_ganado)
modulos_completados (id, sesion_id, modulo_uuid, calificacion, intentos, tiempo_ms)

-- Gamificación
logros (id, alumno_id, nombre, rareza, obtenido_at)
niveles_historial (id, alumno_id, nivel, xp_acumulado, fecha)

-- Contenido generado por agentes
respuestas_alumno (id, modulo_uuid, tipo_respuesta, valor, correcto, feedback_agente)
```

---

## Fases de Construcción

---

### FASE 1 — Fundación Godot (Semana 1-2)

**Criterio de éxito:** El juego arranca, muestra la pantalla de título, y se conecta al backend por WebSocket.

#### 1.1 Setup del proyecto Godot
- Crear proyecto Godot 4 en `/packages/godot/` dentro del monorepo
- Configurar exportación HTML5 y Linux/Windows desktop
- Integrar en el script de build de Bun
- Estructura de escenas:
  ```
  /scenes
    main.tscn          ← escena raíz
    title/
      TitleScreen.tscn
    onboarding/
      Onboarding.tscn
    hub/
      LaGranColmena.tscn
    worlds/
      SelvAmazonica.tscn
      AltiplanoAndino.tscn
      ...
  /scripts
    NetworkManager.gd  ← WebSocket client singleton
    AudioManager.gd    ← TTS + voz entrada singleton
    GameState.gd       ← estado global singleton
  /assets
    characters/        ← sprites pixel art de abejas
    worlds/            ← tilesets por bioma
    ui/                ← iconos, fuentes grandes
    audio/             ← efectos de sonido
  ```

#### 1.2 NetworkManager (Singleton)
```gdscript
# Maneja toda la comunicación con el backend TypeScript
extends Node

signal mensaje_recibido(tipo: String, payload: Dictionary)
signal voz_recibida(audio_data: PackedByteArray)

var ws := WebSocketPeer.new()
const URL = "ws://localhost:3000/ws"

func conectar():
    ws.connect_to_url(URL)

func enviar(tipo: String, payload: Dictionary):
    var msg = {"tipo": tipo, "payload": payload, "timestamp": Time.get_datetime_string_from_system()}
    ws.send_text(JSON.stringify(msg))
```

#### 1.3 AudioManager (Singleton)
```gdscript
# Reproduce audio PCM de Piper TTS y captura voz del usuario
extends Node

func reproducir_tts(audio_pcm: PackedByteArray):
    # Decodifica PCM 22050Hz mono → AudioStreamGenerator
    pass

func iniciar_captura_voz():
    # AudioEffectCapture → enviar al backend
    pass
```

---

### FASE 2 — Pantalla de Título y Onboarding (Semana 2-3)

**Criterio de éxito:** Usuario nuevo completa el onboarding, crea su perfil, y llega al hub.

#### 2.1 TitleScreen
- Animación de la colmena encendiéndose (partículas hexagonales)
- Logo "HiveLearn: La Gran Colmena"
- Voz de Aria: *"¡Bienvenido! La Gran Colmena te esperaba."*
- Botones grandes con íconos: `[NUEVO JUEGO]` `[CONTINUAR]` `[CONFIGURACIÓN]`
- Diseño pixel art, colores cálidos (dorado, naranja, verde selva)

#### 2.2 Onboarding Adaptativo (3 pantallas)

**Pantalla A — ¿Quién eres?**
- Aria habla: *"¿Cuántos años tienes, más o menos?"*
- 3 botones con íconos grandes (no texto pequeño):
  - 🐣 "Soy niño/a" (6-12)
  - 🌱 "Soy joven" (13-17)
  - 🌳 "Soy adulto/a" (18+)
- Guarda `edad_rango` → ajusta tono del agente

**Pantalla B — Tu nombre**
- Aria: *"¿Cómo quieres que te llame?"*
- Campo de texto grande + botón de voz (micrófono) para dictar el nombre
- Validación simple: mínimo 2 caracteres

**Pantalla C — Tu avatar**
- 6 avatares pixel art de abeja con distintos colores/estilos
- Aria comenta cada uno con humor según la edad

#### 2.3 Registro en BD
Al completar onboarding → `POST /api/alumnos` con nickname, avatar, edad_rango → responde con `alumno_id` guardado en `GameState`.

---

### FASE 3 — Hub: La Gran Colmena (Semana 3-4)

**Criterio de éxito:** El hub muestra las zonas disponibles/bloqueadas y permite entrar a la primera.

#### 3.1 Diseño del Hub
- Vista isométrica de una colmena hexagonal grande
- 6 celdas grandes visibles, cada una con el mini-mundo temático
- Celda 1 (Selva) desbloqueada y brillante; las demás oscuras/bloqueadas
- Jugador (abejita) se mueve entre celdas con clic/teclado/joystick
- HUD superior: `[Nickname] | XP: 0 | Nivel: 1 | 🔊`

#### 3.2 Aria como guía del Hub
- Al entrar al hub por primera vez, Aria aparece (burbuja de diálogo + voz)
- Explica el mapa con lenguaje simple
- Al pararse frente a una celda, el agente de esa zona saluda brevemente

#### 3.3 Sistema de desbloqueo
- Una zona se desbloquea al completar la anterior (XP mínimo requerido)
- Animación de apertura de celda (partículas doradas)

---

### FASE 4 — Mini-Mundo 1: Selva Amazónica (Semana 4-6)

**Criterio de éxito:** El jugador completa un módulo completo (explicación → ejercicio → evaluación) con Yara.

#### 4.1 Escena de entrada
- Transición cinematográfica: celda se abre → zoom in → la selva aparece
- Yara (abeja-jaguar) aparece en el árbol más alto, saluda con voz
- El jugador camina por senderos de la selva hacia "zonas de aprendizaje" (fogatas, cuevas, ríos)

#### 4.2 Loop de aprendizaje por zona

```
Jugador llega a zona
    ↓
Yara aparece → explica el tema (TTS + subtítulos)
    ↓
Contenido A2UI: explicación / ejercicio / quiz
    ↓
Jugador responde (texto / voz / click)
    ↓
Backend evalúa → feedback de Yara
    ↓
XP + animación → siguiente zona
```

#### 4.3 Elementos del mundo
- **Fogatas** = lecciones de concepto
- **Cuevas** = ejercicios prácticos
- **Ríos** = quizzes cronometrados
- **Árbol gigante** = reto final del mundo (boss educativo)

#### 4.4 Mecánicas de juego real
- **Vidas:** 3 corazones, se pierden por respuestas muy incorrectas
- **Racha:** x2 XP si aciertas 3 seguidas
- **Pista:** pedir pista a Yara cuesta 10 XP
- **Tiempo:** algunos ejercicios tienen cuenta regresiva visual

---

### FASE 5 — Sistema de Voz Bidireccional (Semana 5-6, paralelo)

**Criterio de éxito:** El jugador puede decir su nombre y responder preguntas por voz.

#### 5.1 Voz salida (TTS → Godot)
- Backend Piper genera PCM 22050Hz
- Se envía por WebSocket como `ArrayBuffer`
- `AudioManager.gd` decodifica y reproduce sin latencia perceptible

#### 5.2 Voz entrada (Godot → backend)
- Botón de micrófono siempre visible en HUD
- `AudioEffectCapture` graba fragmentos de 2 segundos
- Envía PCM al backend → backend transcribe (Whisper.cpp o similar)
- Respuesta textual regresa → se procesa igual que texto escrito

#### 5.3 Modo voz-primero (para adultos mayores/baja literacidad)
- Opción activable en onboarding: "Prefiero hablar"
- Todos los menús tienen descripción de voz al hacer hover
- Respuestas de selección múltiple se pueden dictar: "opción uno", "la B"

---

### FASE 6 — Gamificación Completa (Semana 6-7)

**Criterio de éxito:** El sistema de XP, niveles y logros funciona y se persiste en BD.

#### 6.1 Progresión de niveles
```
Nivel 1: Abeja Huevo (0 XP)
Nivel 2: Abeja Larva (100 XP)
Nivel 3: Abeja Obrera (300 XP)
Nivel 4: Abeja Exploradora (700 XP)
Nivel 5: Abeja Guardiana (1500 XP)
Nivel 6: Abeja Maestra (3000 XP)
Nivel 7: Reina Aprendiz (6000 XP)
```
- Al subir de nivel: animación de celebración + voz de Aria + efecto visual en colmena

#### 6.2 Logros
- **"Primera Chispa"** — Completa tu primer módulo
- **"Voz de la Selva"** — Responde 5 preguntas por voz
- **"Racha de Oro"** — 10 respuestas correctas seguidas
- **"Explorador Andino"** — Entra al mundo del Altiplano
- **"Mente de Abeja"** — 100% en un quiz sin pistas
- **Logros secretos** por comportamiento (jugar de noche, completar rápido, etc.)

#### 6.3 Coleccionables
- Cada mini-mundo tiene 3 "panales de conocimiento" ocultos
- Se muestran en el hub como decoración de la colmena

---

### FASE 7 — Mini-Mundos Restantes (Semana 7-12)

Cada mundo sigue la misma estructura de la Fase 4 con visual distinto:

| Semana | Mundo | Mecánica especial |
|--------|-------|-------------------|
| 7-8 | Altiplano Andino (Kimi) | Puzzles de lógica con piedras andinas |
| 8-9 | Cenotes Mayas (Ix) | Arqueología: desenterrar respuestas |
| 9-10 | Ciudad LATAM 2150 (Nova) | Mini-juegos de código/tecnología |
| 10-11 | Pampa/Llanos (Chacho) | Storytelling: completar historias |
| 11-12 | Galaxia Antarés (Cosmo) | Desafíos finales multi-materia |

---

### FASE 8 — Polish y Empaquetado Offline (Semana 12-13)

**Criterio de éxito:** El juego funciona completo sin internet en una Raspberry Pi 4.

#### 8.1 Exportaciones
- HTML5 (servido por el CLI existente de HiveLearn)
- Linux ARM64 (Raspberry Pi)
- Windows x64 (PCs de aula)

#### 8.2 Script de instalación único
```bash
curl -fsSL https://hivelearn.install | bash
# Instala: backend Bun + Piper + Godot game + SQLite
# Configura autostart al encender el equipo
```

#### 8.3 Modo maestro/facilitador
- Panel web separado (ya existe en HiveLearn) para ver progreso de alumnos
- Sin internet: sincronización por USB/LAN local entre dispositivos

---

## Criterios de Éxito Global

El juego está completo cuando:

1. Un niño de 8 años puede navegar solo desde la pantalla de título hasta completar su primer módulo sin ayuda adulta
2. Un adulto de 50 años que nunca usó tecnología puede responder preguntas por voz
3. Los 6 mini-mundos tienen al menos 3 módulos de contenido cada uno (generado por agentes)
4. La BD registra correctamente toda la actividad (progreso, respuestas, XP, logros)
5. El sistema funciona 8 horas continuas en una Raspberry Pi 4 sin fallos
6. El tiempo de arranque (desde encender hasta estar en el hub) es menor a 30 segundos

---

## Stack Tecnológico Definitivo

| Componente | Tecnología |
|-----------|-----------|
| Motor de juego | Godot 4.3+ |
| Lenguaje juego | GDScript |
| Backend | TypeScript + Bun (existente) |
| Agentes IA | Sistema existente (HiveLearn) |
| Voz salida | Piper TTS (existente) |
| Voz entrada | Whisper.cpp (nuevo) |
| BD | SQLite (existente) |
| Comunicación | WebSocket (protocolo A2UI extendido) |
| Arte | Pixel art 16x16 / 32x32 |
| Resolución base | 1280x720 (escala automática) |

---

## Orden de Implementación Recomendado

```
Semana 1  → Setup Godot + NetworkManager + AudioManager
Semana 2  → TitleScreen + animación
Semana 3  → Onboarding adaptativo (3 pantallas)
Semana 4  → Hub La Gran Colmena (visual + navegación)
Semana 5  → Mini-Mundo 1: Selva Amazónica (estructura completa)
Semana 6  → Voz bidireccional + HUD + gamificación base
Semana 7  → Logros + niveles + persistencia BD completa
Semana 8+ → Mini-Mundos 2-6 (uno por semana)
Semana 12 → Polish + testing con usuarios reales
Semana 13 → Empaquetado offline + script de instalación
```

---

*Plan generado en sesión de diseño — HiveLearn, 2026-05-03*
