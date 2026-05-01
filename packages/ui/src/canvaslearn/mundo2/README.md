# 🌍 Mundo de Aprendizaje HiveLearn

Mundo pixel art dinámico e interactivo para HiveLearn, construido con PixiJS v8.

## 📋 Características

### 🎮 Mundo Dinámico
- **Scroll horizontal** tipo plataformer
- **Jugador interactivo** que camina, salta y corre
- **Físicas completas** con gravedad, velocidad y colisiones
- **Cámara suave** que sigue al jugador
- **Fondo parallax** con 3 capas (cielo, montañas, frente)

### 🗺️ Zonas Interactivas
- **Zona 0**: Bienvenida con el Coordinador
- **Zonas 1..N**: Módulos pedagógicos por materia
- **Zona final**: Evaluación del programa
- **Estados dinámicos**: bloqueada → disponible → completada
- **Animaciones de desbloqueo** con efectos de partículas

### 🎯 Gamificación
- **Barra de XP** con progreso animado
- **10 niveles** con badges y nombres únicos
- **3 vidas** para completar el programa
- **Racha de fuego** por respuestas correctas consecutivas
- **Mini mapa** de progreso del mundo
- **Logros coleccionables** (común, raro, épico, legendario)

### ✨ Efectos Visuales
- **Sistema de partículas** para:
  - XP explosion (20 partículas doradas)
  - Level up (100 partículas multicolor)
  - Logros (50 partículas)
  - Estela del jugador
  - Polvo al saltar
  - Confeti de celebración

### 🔊 Sonidos 8-bit
Generados con Web Audio API (sin archivos externos):
- Salto
- XP ganada
- Nivel up
- Logro desbloqueado
- Daño
- Power-up
- Moneda/oro

### 🎭 Personajes

#### Coordinador
- Sprite grande (64x64)
- Capa ondeante animada
- Auricular con micrófono
- Expresiones faciales
- Burbujas de diálogo
- Saludo personalizado

#### Agentes Pedagógicos
- 16 agentes únicos
- Colores por especialidad
- Accesorios característicos
- Animaciones de trabajo

#### Monitor (Búho)
- Vuela sobre el mundo
- Observa al jugador
- Mensajes aleatorios
- Patrulla automática

### 🎁 Eventos Sorpresa
- **Generación aleatoria** (30-90 segundos)
- **Tipos**:
  - XP bonus (⭐)
  - Power-up gratis (⚡)
  - Vida extra (❤️)
  - Logro secreto (🏆)
- **Temporizador** de 10 segundos para recoger
- **Efectos visuales** de recogida

### 💾 Persistencia
- **Guardado automático** cada 30 segundos
- **Carga desde localStorage** (fallback)
- **Carga desde BD** (API ready)
- **Regeneración del mundo** al volver
- **Validación de estado** (máximo 24 horas)

### 🔌 Protocolo A2UI WebSocket
- **Comunicación bidireccional** cliente ↔ servidor
- **Reconexión automática** con backoff exponencial
- **Heartbeat** cada 30 segundos
- **Eventos soportados**:
  - `mundo:bienvenida`
  - `mundo:abrir_modulo`
  - `mundo:contenido`
  - `mundo:evaluar`
  - `mundo:resultado`
  - `mundo:nivel_up`
  - `mundo:logro`
  - `mundo:completar`

## 📁 Estructura

```
packages/ui/src/mundo/
├── MundoWorld.tsx              # Componente principal React
├── constants.ts                # Configuración global
├── types.ts                    # Tipos TypeScript
├── index.ts                    # Exportaciones
│
├── player/
│   └── Player.ts               # Sprite del jugador
│
├── world/
│   ├── WorldMap.ts             # Mapa del mundo
│   ├── WorldCamera.ts          # Cámara con scroll
│   └── ParallaxBackground.ts   # Fondo parallax
│
├── zones/
│   └── ZoneManager.ts          # Gestor de zonas
│
├── agents/
│   ├── CoordinatorCharacter.ts # Coordinador
│   ├── PedagogicalCharacter.ts # Agentes pedagógicos
│   └── MonitorCharacter.ts     # Búho monitor
│
├── gamification/
│   └── GamificationOverlay.tsx # UI de gamificación
│
├── effects/
│   ├── ParticleSystem.ts       # Sistema de partículas
│   └── SoundManager.ts         # Sonidos 8-bit
│
├── events/
│   └── SurpriseEvents.ts       # Eventos sorpresa
│
├── protocol/
│   ├── WebSocketManager.ts     # Conexión WebSocket
│   └── A2UIBridge.ts           # Traductor A2UI
│
└── utils/
    └── WorldSaveManager.ts     # Guardado/Carga
```

## 🚀 Uso

### 1. Navegar al mundo
```typescript
navigate('/mundo')
```

### 2. Props requeridos
```typescript
<MundoWorld
  programaUuid={programaUuid}
  sessionId={sessionId}
  alumnoId={alumnoId}
  apodo={apodo}
  avatar={avatar}
  tema={tema}
  onZoneInteract={handleZoneInteract}
  onAnswer={handleAnswer}
/>
```

### 3. Configurar WebSocket
```bash
# .env.local
VITE_WS_URL=ws://localhost:3000/ws
```

## 🎮 Controles

| Tecla | Acción |
|-------|--------|
| `←` / `A` | Mover izquierda |
| `→` / `D` | Mover derecha |
| `Espacio` / `↑` / `W` | Saltar |
| `Shift` | Correr |

## 🎨 Configuración

### Constantes principales (`constants.ts`)

```typescript
// Dimensiones
TILE_SIZE = 32              // Tamaño de tile (pixel art)
VIEWPORT_WIDTH = 1280       // Ancho del viewport
VIEWPORT_HEIGHT = 720       // Alto del viewport

// Jugador
JUGADOR_CONFIG = {
  velocidad: 200,           // Pixeles/segundo
  salto: 450,               // Fuerza de salto
  gravedad: 1200,           // Gravedad
}

// Cámara
CAMARA_CONFIG = {
  suavizado: 0.08,          // Interpolación
  zoomMin: 0.8,
  zoomMax: 1.2,
}

// Colores
COLORS = {
  fondo: 0x0a0e27,          // Azul oscuro
  acento: 0xfbbf24,         // Amarillo corporativo
  exito: 0x22c55e,          // Verde
  error: 0xef4444,          // Rojo
  vida: 0xec4899,           // Rosa
  magia: 0x8b5cf6,          // Violeta
}
```

## 📊 Niveles

| Nivel | Nombre | XP Requerida | Badge |
|-------|--------|--------------|-------|
| 1 | Novato | 100 | ⭐ |
| 2 | Aprendiz | 250 | ⭐⭐ |
| 3 | Explorador | 500 | ⭐⭐⭐ |
| 4 | Practicante | 800 | 🌟 |
| 5 | Experto | 1200 | 💎 |
| 6 | Maestro | 1700 | 👑 |
| 7 | Leyenda | 2300 | 🏆 |
| 8 | Héroe | 3000 | 🦸 |
| 9 | Campeón | 3800 | 🎖️ |
| 10 | Inmortal | 5000 | 👼 |

## 🔌 Integración con Backend

### Mensajes WebSocket

#### Cliente → Servidor
```typescript
{
  tipo: 'iniciar_sesion' | 'responder' | 'accion',
  session_id: string,
  alumno_id: string,
  payload: {
    mundo_evento?: MundoEvento,
    a2ui_action?: A2UIAction,
  },
  timestamp: string
}
```

#### Servidor → Cliente
```typescript
{
  tipo: 'bienvenida' | 'contenido' | 'resultado' | 'evento',
  session_id: string,
  agente_id: string,
  payload: {
    mundo_evento?: MundoEvento,
    a2ui_messages?: A2UIMessage[],
  },
  timestamp: string
}
```

## 🛠️ Desarrollo

### Agregar nuevo agente
```typescript
// 1. Crear sprite en agents/
export class NuevoAgentCharacter extends Container {
  // ... implementación
}

// 2. Exportar en index.ts
export { NuevoAgentCharacter } from './agents/NuevoAgentCharacter'

// 3. Agregar al ZoneManager
const agente = new NuevoAgentCharacter({ x, y, color, emoji })
```

### Agregar nuevo tipo de partícula
```typescript
// 1. Agregar configuración en constants.ts
PARTICULAS_CONFIG = {
  // ...
  nuevoTipo: {
    colores: [0xfbbf24],
    tamanioMin: 3,
    tamanioMax: 8,
    velocidadMin: 50,
    velocidadMax: 150,
    vidaMin: 0.5,
    vidaMax: 1.5,
    cantidad: 30,
  },
}

// 2. Agregar tipo en types.ts
export type ParticulasTipo = 'xp' | 'nuevoTipo' | ...

// 3. Usar en ParticleSystem
particleSystem.emit('nuevoTipo', x, y, { cantidad: 30 })
```

## 📝 Pendientes (Opcional)

- [ ] Assets de sprites PNG (reemplazar Graphics)
- [ ] Más power-ups coleccionables
- [ ] Enemigos/obstáculos
- [ ] TTS para diálogos
- [ ] Logros visuales en overlay
- [ ] Estadísticas detalladas por zona
- [ ] Modo cooperativo (múltiples jugadores)

## 📄 Licencia

MIT © HiveLearn
