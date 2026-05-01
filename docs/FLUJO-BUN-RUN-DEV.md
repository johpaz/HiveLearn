# 📋 Flujo Completo de `bun run dev` en HiveLearn

**Fecha:** 2026-04-30  
**Versión:** 0.1.0  
**Bun:** 1.3.13

---

## 🚀 Resumen Ejecutivo

Cuando ejecutas `bun run dev`, HiveLearn inicia un servidor HTTP completo con:
- Base de datos SQLite
- 14 providers de IA precargados
- 91 modelos precargados
- 17 agentes especializados
- UI embebida (React)
- WebSocket para comunicación en tiempo real

**Problema actual:** El servidor intenta iniciar en puerto **18790** en lugar de **8787**.

---

## 📍 Punto de Entrada

### 1. `package.json` → Script `dev`

```json
{
  "scripts": {
    "dev": "bun run --cwd packages/cli src/index.ts start"
  }
}
```

**Qué hace:**
- Ejecuta `packages/cli/src/index.ts` con argumento `start`
- Working directory: `packages/cli`

---

## 🔹 Paso 1: CLI Entry Point

**Archivo:** `packages/cli/src/index.ts`

```typescript
async function main(): Promise<void> {
  const command = normalizedArgs[0];  // "start"
  
  switch (command) {
    case "start":
      await start(flags);  // ← gateway.ts
      break;
  }
}
```

**Qué hace:**
- Parsea argumentos de línea de comandos
- Detecta comando `start`
- Llama a `start()` en `commands/gateway.ts`

---

## 🔹 Paso 2: Gateway Start Command

**Archivo:** `packages/cli/src/commands/gateway.ts`

### 2.1 Detección del Adapter

```typescript
const adapter = await getAdapter();
// → detectAdapter() retorna BinaryAdapter (instalación local)

const config = await adapter.getConfig();
// → BinaryAdapter.getConfig() retorna configuración
```

**⚠️ PROBLEMA AQUÍ:**

```typescript
// packages/cli/src/adapters/binary.ts (línea 186)
const port = parseInt(env.HIVE_PORT || "8787", 10) || PORTS.GATEWAY;
```

**Flujo:**
1. Lee archivo `~/.hivelearn/.env`
2. Busca variable `HIVE_PORT`
3. Si no existe → usa `"8787"`
4. Si `parseInt()` falla → usa `PORTS.GATEWAY` (8787)

**Resultado esperado:** `config.gateway.port = 8787`

---

### 2.2 Verificar si ya está corriendo

```typescript
if (!skipCheck && await isRunning()) {
  console.log("⚠️  Hive Gateway ya está corriendo");
  return;
}
```

**Qué hace:**
- Verifica PID file en `~/.hivelearn/gateway.pid`
- Verifica si el proceso existe
- Si está corriendo → sale

---

### 2.3 Cargar configuración de logging

```typescript
const coreConfig = await loadConfig();
if (coreConfig.logging?.level) {
  logger.setLevel(coreConfig.logging.level);
}
```

**Qué hace:**
- Lee `~/.hivelearn/config.json`
- Configura nivel de log (debug, info, warn, error)

---

### 2.4 Mostrar banner

```typescript
console.log(`
 ╔══════════════════════════════════════════════════════════════╗
 ║  🐝 HiveLearn v${VERSION.padEnd(46)}║
 ╚══════════════════════════════════════════════════════════════╝
`);
```

---

### 2.5 Registrar UI embebida

```typescript
registerEmbeddedUI(embeddedUI);
```

**Qué hace:**
- Carga bundle de UI generado por Vite
- UI se sirve desde memoria (no filesystem)

---

### 2.6 Configurar puerto y variables de entorno

```typescript
const gatewayPort = config.gateway?.port || 8787;
process.env.HIVELEARN_PORT = gatewayPort.toString();
process.env.NODE_ENV = 'production';

logger.info('Starting HiveLearn Gateway', { port: gatewayPort });
```

**⚠️ PUNTO CRÍTICO:**
- `gatewayPort` viene de `config.gateway.port`
- Si el adapter retornó 18790 → aquí se usa 18790
- Se setea `HIVELEARN_PORT` para que el core lo use

---

### 2.7 Iniciar Gateway

```typescript
await startGateway(coreConfig);
```

---

## 🔹 Paso 3: Gateway Manager (Core)

**Archivo:** `packages/core/src/gateway/manager.ts`

### 3.1 Determinar puerto

```typescript
const PORT = config.gateway?.port || parseInt(process.env.HIVELEARN_PORT || '8787')
```

**Flujo:**
1. `config.gateway?.port` → ¿Existe en coreConfig? **NO** (coreConfig no tiene gateway)
2. `process.env.HIVELEARN_PORT` → **SÍ** (seteado en paso 2.6)
3. `PORT = 18790` (o lo que venga de HIVELEARN_PORT)

---

### 3.2 Setup de error handlers globales

```typescript
setupGlobalErrorHandlers();
```

**Qué hace:**
- Registra handlers para `unhandledRejection` y `uncaughtException`
- Logs con correlation IDs

---

### 3.3 Inicializar base de datos

```typescript
const db = initializeDatabase()
```

**Archivo:** `packages/core/src/storage/sqlite.ts`

**Qué hace:**
1. Determina path: `~/.hivelearn/hivelearn.db`
2. Crea directorio si no existe
3. Abre SQLite: `new Database(path, { create: true })`
4. Configura WAL mode y foreign keys

**Logs:**
```
[INFO] Database initialized at /home/johnpaez/.hivelearn/hivelearn.db
```

---

### 3.4 Inicializar schemas

```typescript
initHiveLearnStorage(db)
```

**Archivo:** `packages/core/src/storage/init.ts`

**Qué hace:**

#### 3.4.1 Crear tabla `providers`

```sql
CREATE TABLE IF NOT EXISTS providers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  base_url        TEXT,
  category        TEXT NOT NULL DEFAULT 'llm',
  num_ctx         INTEGER,
  num_gpu         INTEGER DEFAULT -1,
  enabled         INTEGER NOT NULL DEFAULT 1,
  active          INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
)
```

**Columnas eliminadas:** `api_key_encrypted`, `api_key_iv`, `headers_encrypted`, `headers_iv`  
**Razón:** API keys ahora se guardan en `Bun.secrets` (keychain del SO)

---

#### 3.4.2 Crear tabla `models`

```sql
CREATE TABLE IF NOT EXISTS models (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT REFERENCES providers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  model_type      TEXT NOT NULL DEFAULT 'llm',
  context_window  INTEGER NOT NULL DEFAULT 20000,
  capabilities    TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  active          INTEGER NOT NULL DEFAULT 0
)
```

---

#### 3.4.3 HiveLearn Schema v1-v5

**Tablas adicionales:**
- `hl_agents` - 17 agentes del enjambre
- `hl_sessions` - Sesiones de aprendizaje
- `hl_canvas` - Estructuras de lecciones
- `hl_lesson_interactions` - Interacciones con lecciones
- `hl_onboarding_messages` - Messages del onboarding
- `hl_onboarding_progress` - Progreso del onboarding

---

### 3.5 Seed de datos predeterminados

```typescript
seedAllData()
```

**Archivo:** `packages/core/src/storage/seed.ts`

#### 3.5.1 Seed de Providers

**Datos:** 14 providers precargados

| ID | Nombre | Base URL | Categoría |
|----|--------|----------|-----------|
| `anthropic` | Anthropic | https://api.anthropic.com | llm |
| `openai` | OpenAI | https://api.openai.com/v1 | llm |
| `gemini` | Google Gemini | (null) | llm |
| `mistral` | Mistral AI | https://api.mistral.ai/v1 | llm |
| `deepseek` | DeepSeek | https://api.deepseek.com/v1 | llm |
| `kimi` | Kimi (Moonshot) | https://api.moonshot.ai/v1 | llm |
| `openrouter` | OpenRouter | https://openrouter.ai/api/v1 | llm |
| `ollama` | Ollama (Local) | http://localhost:11434 | llm |
| `groq` | Groq | https://api.groq.com/openai/v1 | llm |
| `local-llama` | Local LLM (llama-server) | http://localhost:8080/v1 | llm |
| `elevenlabs` | ElevenLabs | https://api.elevenlabs.io/v1 | llm |
| `qwen` | Qwen (Alibaba) | https://dashscope.aliyuncs.com/api/v1 | llm |
| `nvidia` | NVIDIA NIM | https://integrate.api.nvidia.com/v1 | llm |
| `local-tts` | TTS Local (Piper) | http://localhost:5500 | tts |

**SQL:**
```sql
INSERT OR IGNORE INTO providers (id, name, base_url, category, enabled, active)
VALUES (?, ?, ?, ?, 1, 0)
```

**Nota:** `active = 0` → El usuario debe activarlos y configurar API keys

---

#### 3.5.2 Seed de Modelos

**Datos:** 91 modelos precargados

**Ejemplos por provider:**

**Anthropic (3 modelos):**
- `claude-opus-4-6` - 200K contexto
- `claude-sonnet-4-6` - 200K contexto
- `claude-haiku-4-5-20251001` - 200K contexto

**OpenAI (11 modelos):**
- `gpt-4o`, `gpt-4o-mini`, `gpt-5.4`, `gpt-5.4-pro`
- `whisper-1` (STT)
- `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` (TTS)

**Google Gemini (10 modelos):**
- `gemini-3.1-pro-preview` - 1M contexto
- `gemini-2.5-flash-preview-tts` (TTS)

**Mistral (8 modelos):**
- `mistral-large-2512`, `devstral-2512`, `codestral-2508`

**Y más:** DeepSeek, Kimi, OpenRouter aliases

**SQL:**
```sql
INSERT OR IGNORE INTO models (id, provider_id, name, model_type, context_window, capabilities, enabled, active)
VALUES (?, ?, ?, ?, ?, ?, 1, 0)
```

---

#### 3.5.3 Seed de Agentes

**Archivo:** `packages/core/src/agent/registry.ts`

**17 agentes especializados:**

1. `coordinator` - Coordinador del enjambre
2. `intent-analyzer` - Analiza intención del estudiante
3. `profile-analyzer` - Analiza perfil pedagógico
4. `structure-designer` - Diseña estructura de lección
5. `content-explainer` - Genera explicaciones
6. `quiz-generator` - Crea quizzes
7. `exercise-generator` - Crea ejercicios
8. `challenge-generator` - Crea desafíos
9. `feedback-generator` - Genera feedback
10. `evaluation-generator` - Crea evaluaciones
11. `gamification-manager` - Gestiona gamificación
12. `image-generator` - Genera imágenes
13. `audio-generator` - Genera audio
14. `code-generator` - Genera código
15. `infographic-generator` - Crea infografías
16. `svg-generator` - Genera SVGs
17. `gif-generator` - Crea GIFs animados

**SQL:**
```sql
INSERT OR IGNORE INTO hl_agents (id, name, provider_id, model_id, enabled, active)
VALUES (?, ?, ?, ?, 1, 1)
```

**Nota:** Agentes tienen `active = 1` por defecto

---

### 3.6 Crear servidor HTTP

```typescript
const server = createServer()
```

**Archivo:** `packages/core/src/gateway/server.ts`

**Qué hace:**
- Crea objeto `Server` con:
  - `fetch` handler para HTTP
  - `websocket` handlers para WebSocket

---

### 3.7 Iniciar servidor Bun

```typescript
serverInstance = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: server.fetch,
  websocket: server.websocket,
})
```

**⚠️ AQUÍ SE USA EL PUERTO:**
- Si `PORT = 18790` → Escucha en 18790
- Si `PORT = 8787` → Escucha en 8787

**Logs:**
```
[INFO] 🚀 Starting server on http://0.0.0.0:18790...
[INFO] ✅ Gateway listening on http://0.0.0.0:18790
[INFO] 📊 Startup summary {"uptime":0.149,"memory":{...},"pid":123456}
```

---

## 🔹 Paso 4: Vuelta al CLI

**Regreso de `await startGateway(coreConfig)`**

### 4.1 Mostrar mensaje de éxito

```typescript
const url = `http://localhost:${gatewayPort}`;
console.log(`
╔════════════════════════════════════════╗
║  🎓  HiveLearn — Listo                 ║
╠════════════════════════════════════════╣
║  ${url.padEnd(38)}║
╚════════════════════════════════════════╝
`);
```

**Resultado:**
```
╔════════════════════════════════════════╗
║  🎓  HiveLearn — Listo                 ║
╠════════════════════════════════════════╣
║  http://localhost:18790                ║
╚════════════════════════════════════════╝
```

---

### 4.2 Abrir navegador

```typescript
setTimeout(() => {
  const platform = process.platform;
  let cmd: string;
  if (platform === 'win32') cmd = `start "" "${url}"`;
  else if (platform === 'darwin') cmd = `open "${url}"`;
  else cmd = `gio open "${url}" 2>/dev/null || xdg-open "${url}" 2>/dev/null || true`;
  
  Bun.spawn([shell, shellArg, cmd], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}, 1000);
```

**Qué hace:**
- Espera 1 segundo
- Ejecuta comando del SO para abrir navegador
- Abre `http://localhost:18790`

---

### 4.3 Mantener proceso vivo

```typescript
await new Promise(() => {});
```

**Qué hace:**
- Bloquea el event loop
- Mantiene el servidor corriendo
- Espera signals (SIGINT, SIGTERM)

---

## 🔹 Paso 5: Servidor HTTP en Ejecución

**Archivo:** `packages/core/src/gateway/server.ts`

### 5.1 Endpoints HTTP disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/` | Health check + UI (root) |
| `GET` | `/api/providers` | Lista providers |
| `GET` | `/api/providers/:id/api-key` | Verifica si tiene API key |
| `POST` | `/api/providers/:id/api-key` | Guarda API key (Bun.secrets) |
| `DELETE` | `/api/providers/:id/api-key` | Elimina API key |
| `GET` | `/api/models` | Lista modelos |
| `GET` | `/api/hivelearn/config` | Obtiene configuración |
| `POST` | `/api/hivelearn/config` | Guarda configuración |
| `POST` | `/api/hivelearn/generate` | Genera contenido con IA |
| `GET` | `/api/hivelearn/metrics` | Métricas de sesiones |
| `GET` | `/api/hivelearn/sessions` | Lista sesiones |
| `GET` | `/api/hivelearn/agents` | Lista agentes |
| `PUT` | `/api/hivelearn/agents/:id` | Actualiza agente |

---

### 5.2 WebSocket endpoints

| Endpoint | Descripción |
|----------|-------------|
| `/hivelearn-onboarding` | Onboarding de estudiantes |
| `/hivelearn-lesson` | Entrega de lecciones |
| `/hivelearn-events` | Eventos en tiempo real |

---

### 5.3 UI Embebida

**Rutas estáticas:**
- `/index.html` - App principal
- `/assets/*` - CSS, JS, imágenes
- Cualquier ruta no-API → sirve `index.html` (SPA)

---

## 📊 Resumen de Datos Iniciales

| Tipo | Cantidad | Estado |
|------|----------|--------|
| **Providers** | 14 | `enabled=1, active=0` |
| **Modelos** | 91 | `enabled=1, active=0` |
| **Agentes** | 17 | `enabled=1, active=1` |
| **Tools** | 0 | (Se crean dinámicamente) |
| **Skills** | 0 | (Se crean dinámicamente) |

---

## 🔍 Diagnóstico del Problema: Puerto 18790

### Flujo del puerto:

```
1. adapter.getConfig()
   ↓
2. BinaryAdapter.getConfig()
   ↓
3. Lee ~/.hivelearn/.env
   ↓
4. env.HIVE_PORT = undefined (no existe)
   ↓
5. port = parseInt(undefined || "8787", 10) || PORTS.GATEWAY
   ↓
6. port = 8787
   ↓
7. config.gateway.port = 8787
   ↓
8. CLI: gatewayPort = config.gateway?.port || 8787
   ↓
9. gatewayPort = 8787
   ↓
10. process.env.HIVELEARN_PORT = "8787"
    ↓
11. startGateway(coreConfig)
    ↓
12. PORT = config.gateway?.port || parseInt(HIVELEARN_PORT || '8787')
    ↓
13. PORT = 8787
    ↓
14. Bun.serve({ port: 8787 })
```

### ¿Por qué muestra 18790?

**Posibles causas:**

1. **Archivo `.env` existe con `HIVE_PORT=18790`**
   ```bash
   cat ~/.hivelearn/.env | grep HIVE_PORT
   ```

2. **Hay otro proceso gateway corriendo**
   ```bash
   ps aux | grep hive
   lsof -i :8787
   ```

3. **El adapter no es BinaryAdapter** (podría ser BunGlobalAdapter)
   ```bash
   # Agregar log en gateway.ts
   logger.info('Adapter detected', { adapter: adapter.name })
   ```

4. **Config cacheada en `~/.hivelearn/config.json`**
   ```bash
   cat ~/.hivelearn/config.json | grep -i port
   ```

---

## 🛠️ Comandos de Diagnóstico

```bash
# 1. Ver archivo .env
cat ~/.hivelearn/.env

# 2. Ver config.json
cat ~/.hivelearn/config.json 2>/dev/null || echo "No existe"

# 3. Ver procesos gateway
ps aux | grep -E "hive|gateway" | grep -v grep

# 4. Ver puerto 8787
lsof -i :8787

# 5. Ver puerto 18790
lsof -i :18790

# 6. Matar procesos gateway
pkill -f hivelearn
pkill -f "bun.*start"

# 7. Limpiar y reiniciar
rm -rf ~/.hivelearn/*.db ~/.hivelearn/*.pid
bun run dev
```

---

## ✅ Flujo Exitoso (cuando funciona)

```
bun run dev
  ↓
Adapter: BinaryAdapter
  ↓
config.gateway.port = 8787
  ↓
process.env.HIVELEARN_PORT = "8787"
  ↓
startGateway() → PORT = 8787
  ↓
Bun.serve({ port: 8787 })
  ↓
✅ Gateway listening on http://0.0.0.0:8787
  ↓
╔════════════════════════════════════════╗
║  🎓  HiveLearn — Listo                 ║
╠════════════════════════════════════════╣
║  http://localhost:8787                 ║
╚════════════════════════════════════════╝
  ↓
🌐 Abriendo navegador en http://localhost:8787
```

---

**Fin del documento**
