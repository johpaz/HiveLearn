# 🐝 HiveLearn

**Plataforma de aprendizaje adaptativo con IA**

HiveLearn es un sistema educativo impulsado por un enjambre de 16 agentes de IA especializados que generan lecciones personalizadas según el perfil, estilo y objetivos de cada estudiante.

## ✨ Características

- **15 Agentes Especializados**: Perfil, intención, estructura del mundo, explicación, ejercicios, quiz, retos, código, SVG, GIF, infografías, imágenes, gamificación, evaluación y feedback
- **Onboarding Conversacional**: Chat interactivo que recoge información del estudiante paso a paso
- **Persistencia Incremental**: Guardado automático del progreso en cada paso del onboarding
- **Reanudación**: Capacidad de retomar donde se quedó si se corta la conexión
- **UI Responsiva**: Diseño mobile-first con temática pixel/abeja
- **Animaciones de Delegación**: Visualización en tiempo real de cómo el coordinador delega tareas a los workers
- **Base de Datos Independiente**: SQLite propio, separado del repositorio principal de Hive

## 📦 Estructura del Monorepo

```
hivelearn/
├── packages/
│   ├── core/          # Núcleo backend (agentes, swarm, tools, persistencia)
│   ├── server/        # Gateway HTTP + WebSocket en Bun
│   └── ui/            # Frontend React + Vite 8 + Tailwind 4
├── scripts/           # Scripts de build y dev
├── data/              # Base de datos SQLite (gitignored)
└── package.json       # Root package.json (workspaces)
```

## 🚀 Inicio Rápido

### Prerrequisitos

- Bun >= 1.0.0
- Node.js >= 18 (opcional, para compatibilidad)

### Instalación

```bash
# Instalar dependencias
bun install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones
```

### Desarrollo

```bash
# Modo desarrollo (server + UI)
bun run dev

# O por separado:
bun run dev:server   # Server en puerto 8787
bun run dev:ui       # UI en puerto 5173
```

### Build

```bash
# Construir todos los paquetes
bun run build

# O individualmente:
bun run build:core
bun run build:server
bun run build:ui
```

### Producción

```bash
# Construir y ejecutar
bun run build
bun run --cwd packages/server start
```

## 🎨 Diseño UI

### Colores Corporativos

- **Primario**: `#fbbf24` (amarillo abeja)
- **Fondo**: `#0a0e27` (azul oscuro pixel)
- **Acentos**: Gradientes azul/violeta
- **Estilo**: Pixel art + moderno

### Componentes Principales

1. **ChatOnboardingScreen**: Conversacional responsivo con guardado incremental
2. **HiveLearnSwarmPage**: Visualización del enjambre generando el programa
3. **MundoWorld (PixiJS)**: Mundo pixel art interactivo con zonas de aprendizaje
4. **A2UILessonScreen**: Entrega de contenido dinámico vía A2UI por WebSocket
5. **EvaluationScreen**: Evaluación final
6. **ResultScreen**: Resultados con gamificación

## 🗄️ Base de Datos

HiveLearn usa SQLite con las siguientes tablas principales:

- `hl_agents`: Configuración de los 16 agentes
- `hl_student_profiles`: Perfiles de estudiantes
- `hl_curricula`: Currículos generados
- `hl_sessions`: Sesiones de aprendizaje
- `hl_onboarding_messages`: Historial del chat de onboarding
- `hl_onboarding_progress`: Progreso incremental del onboarding
- `hl_lesson_interactions`: Interacciones durante la lección

La BD se almacena en:
- Producción: `~/.hivelearn/hivelearn.db`
- Desarrollo: `./data/hivelearn.db`

## 📡 API Endpoints

### REST

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/hivelearn/config` | Obtener configuración |
| POST | `/api/hivelearn/config` | Guardar configuración |
| POST | `/api/hivelearn/generate` | Generar programa (WS) |
| GET | `/api/hivelearn/sessions` | Listar sesiones |

### WebSocket

| Endpoint | Descripción |
|----------|-------------|
| `/hivelearn-onboarding` | Chat de onboarding |
| `/hivelearn-program` | Flujo del programa de formación (A2UI + mundo PixiJS) |
| `/hivelearn-events` | Eventos en tiempo real |

## 🧠 Enjambre de Agentes

### Coordinador
- **hl-coordinator-agent**: Coordina los 15 workers especializados

### Workers (15 agentes)
1. **hl-profile-agent**: Construye perfil del alumno
2. **hl-intent-agent**: Extrae tema y objetivo
3. **hl-structure-agent**: Diseña la estructura del mundo de aprendizaje PixiJS (zonas y módulos)
4. **hl-explanation-agent**: Genera explicaciones
5. **hl-exercise-agent**: Crea ejercicios prácticos
6. **hl-quiz-agent**: Genera preguntas de quiz
7. **hl-challenge-agent**: Diseña retos
8. **hl-code-agent**: Genera bloques de código
9. **hl-svg-agent**: Crea diagramas SVG
10. **hl-gif-agent**: Genera animaciones
11. **hl-infographic-agent**: Crea infografías
12. **hl-image-agent**: Genera imágenes
13. **hl-gamification-agent**: Asigna XP y logros
14. **hl-evaluation-agent**: Genera evaluación final
15. **hl-feedback-agent**: Feedback motivador

## 🔧 Configuración

### Variables de Entorno

```bash
# Server
HIVELEARN_PORT=8787
HIVELEARN_HOST=0.0.0.0

# Database
HIVELEARN_DB_PATH=~/.hivelearn/hivelearn.db

# Provider (opcional, se puede configurar vía API)
HIVELEARN_PROVIDER=ollama
HIVELEARN_MODEL=gemma4-e4b
```

## 📝 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

## 🤝 Contribuir

1. Fork el repositorio
2. Crea una rama de feature (`git checkout -b feature/amazing-feature`)
3. Commit tus cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## 📧 Contacto

- **Author**: HiveLearn Team
- **Email**: support@hivelearn.dev

---

**Hecho con ❤️ para el aprendizaje adaptativo**
