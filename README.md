# HiveLearn IA

Plataforma institucional de formación en inteligencia artificial. La interfaz es un panel de trabajo interactivo, no un juego: grafo Three.js/WebGL, diagnóstico formativo, práctica A2UI y revisión docente.

## Requisitos y arranque

- Bun **1.4.2**; HiveDB **0.7.0** y `@johpaz/hive-sdk` **0.7.3** instalados por el workspace (el SDK ya no incluye DAG ni enjambre por roles; HiveLearn tampoco usa ninguno).
- Este repositorio contiene el núcleo (`packages/core`), el CLI (`packages/cli`) y la UI web (`packages/hivelearn-ui`: React 19, Vite 8 y Three.js). El escritorio vive fuera del workspace y consume el gateway por HTTP/WebSocket.

```bash
bun install
bun run build:ui
HIVELEARN_HOST=127.0.0.1 bun run dev:server
```

Abre `http://127.0.0.1:8787`. En el primer acceso se configuran la institución y el primer administrador sin tokens ni contraseñas predeterminadas. Después del alta, la ruta de configuración queda cerrada. Para desarrollar la UI: `bun run dev:ui` (Vite en :5173 con proxy al gateway en :8787; reescribe `Origin` para pasar la comprobación de origen).

## Interfaz web (`packages/hivelearn-ui`)

- **Portada** con escena WebGL (Three.js): un panal de hexágonos que reacciona al cursor y un grafo de nodos flotantes. Respeta `prefers-reduced-motion` (cuadro fijo), se pausa con la pestaña oculta y, sin WebGL, cae a un degradado CSS. three.js se carga en un chunk aparte para que el texto pinte primero.
- **Acceso:** ingresar (alumno/docente/administrador), activar con código, crear cuenta de adulto (muestra el código de recuperación una sola vez), recuperar contraseña y, en la primera ejecución, configurar la institución.
- **Usuarios** (administrador y docente): crear docentes (solo administrador), crear alumnos uno a uno o importarlos desde Excel con vista previa (plantilla incluida), y ver las cuentas con su estado. Cada código de activación se muestra una sola vez (vence en 7 días); para cuentas activas se emite un código de restablecimiento (24 h). Con "Tengo un código" la persona elige su contraseña.
- **Recuperación sin cuentas:** si una instalación se queda sin ninguna cuenta (por ejemplo, tras borrarlas), `/setup` vuelve a estar disponible: la pantalla de acceso muestra "Configura tu institución" y el nuevo administrador conserva la institución, sus ajustes y sus currículos.
- **Configuración** (administrador): *APIs y proveedores* (clave por proveedor, que nunca vuelve al navegador, y activar/desactivar), *Modelos de los agentes* (proveedor y modelo por agente) y *Política y respaldo* (modelos por defecto, proveedores remotos, oráculo, registro autónomo y modelo de respaldo).
- Habla con el portal (`/api/portal/*`, cookie de sesión) y, para proveedores y agentes, con `/api/providers` y `/api/hivelearn/agents`, que aceptan la sesión de administrador.
- **Guardado en bloque** de agentes (`PUT /api/portal/agents/models`, atómico: o se guardan todos o ninguno): "Aplicar a todos los agentes" pone un mismo proveedor y modelo a todos (por defecto sin los de imagen y audio) y "Guardar todos los cambios" confirma de una vez los ajustes individuales pendientes. Guardar los valores por defecto en "Política y respaldo" también los aplica a todos los agentes.

## Programa formativo personal por niveles

Es el camino interactivo del alumno (`institutional/program/`): en vez de generar todo el contenido de golpe, el alumno **declara qué quiere aprender en esa sesión** y el programa se crea y se adapta nivel a nivel.

- **Sesión activa única.** Tema, objetivo, tiempo, energía, conocimiento previo y estilo, combinados con nombre, edad y memoria del alumno. Queda activa hasta cerrarla (voluntario, al terminar la evaluación final o por 14 días sin actividad) y no se puede abrir otra mientras tanto (cerrojo por cuenta con `expectedVersion: 0`, 409 `active_program_exists`).
- **Dimensionado.** `sizing.ts` decide niveles y nodos por nivel con reglas deterministas (edad, tiempo, energía, conocimiento previo, lo ya consolidado en memoria); el Arquitecto puede variar ±1. Los nodos no bloquean: solo el checkpoint del nivel decide.
- **Un nivel a la vez.** El Arquitecto (`definir_programa`) entrega el objetivo, el esquema de niveles y SOLO los nodos del primero. Cada nodo lleva una comprobación con clave: **la clave manda**; el oráculo solo juzga la práctica abierta y opina sobre el nivel.
- **Los agentes crean y adaptan los niveles.** Al cerrar un nivel (`checkpoint`), el Adaptador (`proponer_ajuste`) propone un parche: materializar el siguiente, insertar un refuerzo si no dominó, o reordenar/quitar lo no iniciado. `guards.ts` valida de forma determinista: lo cursado es inmutable, topes de niveles/nodos/revisiones, ids únicos. Si el modelo falla, el nivel se arma con repaso determinista de lo no logrado.
- **Formativo hasta validación.** Lo que el alumno logra es autodeclarado; el docente reafirma, modifica el puntaje o revoca un nodo (`review.ts`), y puede ajustar niveles futuros con las mismas guardas.
- **Guía.** Al completar un programa se destila un aporte sin datos personales; la guía agregada (k ≥ 3) se recupera con la búsqueda híbrida de HiveDB y entra al prompt del Arquitecto y del Adaptador.
- **HiveDB al máximo:** índices secundarios para consultas por cuenta/institución; log de eventos de solo anexar con la bitácora causal del programa (`/programs/:id/trace`: por qué cambió el plan); búsqueda híbrida con filtros para las guías (con `HIVELEARN_EMBEDDER=local`, también por significado); batch y `expectedVersion` para la atomicidad.
- **API** (`/api/portal`): `POST /programs`, `GET /programs/active`, `GET /programs/:id`, `GET /programs/:id/material/:nodeId`, `POST /programs/:id/{answer,checkpoint,prepare,close}`, `GET /programs/:id/trace`, y para el docente `GET /programs/review-queue`, `POST /programs/:id/review`, `PUT /programs/:id/plan`. La UI tiene "Mi programa" (alumno) y "Validaciones" (docente).

## Perfiles y recorrido

1. **Administrador:** configura institución/logo, proveedores/modelos y credenciales; crea maestros y consulta alumnos.
2. **Maestro:** ve solamente sus alumnos; registra uno o importa Excel desde su dashboard. Descarga allí la plantilla real `.xlsx`, revisa la previsualización y confirma la autorización institucional.
3. **Alumno:** recibe un código de activación, elige su contraseña en el primer acceso y entra con su nickname. Completa el diagnóstico y consulta su ruta.
4. **Aprendizaje:** el grafo muestra prerrequisitos y dominio acreditado; A2UI presenta material propio del sistema y recoge evidencias. El maestro revisa evidencias para acreditar competencias. El diagnóstico no acredita dominio práctico.
5. **Complementos de IA:** solicitud explícita, opcional, mediante trabajos persistentes y Bun Workers. No reemplazan el currículo ni acreditan automáticamente competencias.

La plantilla contiene `nickname,nombre,tipo_documento,documento,edad,grupo`. El documento debe ser texto para conservar ceros iniciales. Límite: 200 alumnos y 2 MB por archivo. Los códigos vencen en siete días y pueden reemitirse mientras la cuenta no esté activada. Las contraseñas tienen entre 12 y 128 caracteres.

## Compilar y verificar

```bash
bun run typecheck
bun test
bun run build
```

`bun test` ejecuta pruebas unitarias e integración con HiveDB temporal.

## Configuración y documentación

- [Arquitectura del núcleo](docs/ARQUITECTURA.md)
- [Qué está verificado y qué no](docs/VERIFICACION.md)

La ruta predeterminada de datos es `~/.hivelearn/hivedb`; usa `HIVELEARN_DB_PATH` para una ubicación institucional. No reutilices la base de Hive: HiveLearn conserva una base propia.

### Reparto del trabajo: coordinador, especialistas y Kev (sin grafo de tareas)

HiveLearn **no usa un grafo de tareas ni un planificador de dependencias**. El trabajo se reparte como en Hive: un coordinador y especialistas que ejecutan su propio loop con sus tools y skills.

1. **El coordinador planifica** el programa (`planificar_programa`) a partir del perfil, la edad y la ruta curricular. El blueprint se valida contra el currículo; si el modelo se sale (competencia inexistente, prerrequisitos pendientes) se le devuelve el motivo y las competencias permitidas, hasta 3 intentos.
2. **El coordinador delega con ayuda de Kev** (`agent/swarm/coordinator-delegation.ts`): para cada nodo decide qué especialista redacta (explicación, ejercicio, evaluación), qué apoyo visual lleva (texto, infografía, imagen, audio) y qué skills pedagógicas aplican.
3. **Los especialistas trabajan por rondas** (`agent/swarm/jobs.ts`). Los trabajos de una ronda son independientes y corren en paralelo hasta `HIVELEARN_MAX_CONCURRENT_WORKERS` (2 por defecto); la ronda siguiente recibe los resultados de la anterior como contexto. Hoy hay dos: nodos y evaluación final. No hay dependencias declaradas: el orden lo da el coordinador.
4. **Cada especialista afina su corrida** (`HiveLearnExecutor`): Kev decide esfuerzo de razonamiento, longitud y qué skills del nodo aplica de verdad.
5. **El coordinador integra, repara y revisa**; la puerta de seguridad determinista decide si el programa se entrega.

Un trabajo que falla se reintenta y no detiene a los demás; el coordinador repara los nodos incompletos. Cada trabajo tiene un tope de tiempo (`HIVELEARN_JOB_TIMEOUT_MS`, 240 s): al vencer deja de esperarse, pero la llamada al modelo en curso no se cancela.

### Motor de agentes (`@johpaz/hive-sdk`)

El motor predeterminado es el loop propio (`legacy`). Con `HIVELEARN_AGENT_ENGINE=sdk` los agentes se ejecutan con el loop de `@johpaz/hive-sdk`. Un proveedor que el SDK no soporta cae solo al loop propio.

- El SDK usa una base **separada** (`sdk-db` y `sdk-home`, junto a la de HiveLearn). Se puede mover con `HIVELEARN_SDK_DB_PATH` y `HIVELEARN_SDK_HOME`.
- **Oráculo Kev/Jev:** se activa solo si hay API key del proveedor `hiveagents` (Kev) o `openrouter` (Jev). Se apaga con `oracleEnabled: false` en la configuración institucional, y con `allowRemoteProviders: false` solo se admite un endpoint local o de red privada. Del turno solo viaja el objetivo de la tarea; instrucciones, historial y resultados de tools no se comparten.
- **Proveedores LLM:** `agent/llm-client.ts` resuelve la configuración (base de HiveLearn + llavero) y llama a `callLLM` del SDK para openai, anthropic, gemini, mistral, groq, openrouter, deepseek, kimi, nvidia y qwen (con sus reintentos con backoff). Dos adaptadores propios en `agent/llm-providers/` se conservan porque llevan ajustes medidos que el SDK no tiene: `hiveagents` (`chat_template_kwargs.enable_thinking` en la raíz del cuerpo —el SDK lo manda en `extra_body`, que el backend ignora— y Qwen 3.x sin razonamiento por omisión) y `ollama` (`think:false` con reintento, rescate de razonamiento sin respuesta). LocalLLM (llama-server) salió del catálogo, igual que en Hive. `thinking` ya llega a los proveedores en ambos motores.
- **Catálogo de modelos al día** (`models/`): cada 24 h (`HIVELEARN_MODEL_SYNC_HOURS`, 0 la desactiva; también "Actualizar ahora" en Configuración → APIs, o `POST /api/portal/models/sync`) se consulta el listado de cada proveedor activo (OpenAI-compatibles, Anthropic, Gemini, OpenRouter, Ollama). Los modelos nuevos entran **inactivos**; se actualizan contexto y capacidades; los que el proveedor ya no sirve se **eliminan**, salvo que los use un agente o un ajuste de la institución (se conservan marcados `missing` y se informa quién los usa). Un listado vacío o que encoge a menos de la mitad no borra nada; los modelos manuales no se tocan; corre sola en segundo plano (al minuto de arrancar, cada 24 h, con reintentos a los 30 min si algo falla y al guardar la clave de un proveedor) sin depender de ningún usuario ni de la política de proveedores remotos, porque listar modelos solo envía la API key al proveedor.
- **Ids de modelo:** el id conserva el nombre de la API del propietario (`claude-sonnet-4-6`, `gemini-3.8-flash`) y los revendedores (OpenRouter, NVIDIA, Groq, OpenCode Go, ModelScope) llevan su prefijo como path distintivo (`openrouter/anthropic/claude-sonnet-4-6`), de modo que nunca se confunden con el modelo servido por su propietario. El prefijo se quita antes de llamar a la API. Al arrancar se migran los ids antiguos sin prefijo y se re-apuntan agentes y ajustes.
- **Resiliencia del reparto:** cada intento de un trabajo tiene su propia señal de cancelación (`AbortController`): al agotarse el tiempo (`HIVELEARN_JOB_TIMEOUT_MS`) se corta la petición y no queda una segunda ejecución en paralelo. Los reintentos esperan con backoff exponencial y jitter; no se reintentan los bloqueos de política ni los 4xx (salvo 408/429). Con `model_not_mounted` se reintenta una vez y, si persiste, se corta el resto de la ronda y la ronda final no se intenta.
- **Modelo de respaldo:** `fallbackProviderId` y `fallbackModelId` en la configuración institucional. Si el principal no está disponible (modelo no montado, 5xx, sin conexión) y aún no se ejecutó ninguna tool, la corrida se repite una vez con el respaldo —que pasa por la misma política por edad, así que un menor no cae a un proveedor remoto— y el principal se salta 60 s.
- **Retención de datos:** el SDK guarda en `sdk-db` un resumen de la tarea (respuestas del alumno) en `traces`. HiveLearn borra las trazas de cada corrida al terminar y barre por edad `traces`, `usageRecords` y `reflections` al arrancar y cada hora (`HIVELEARN_SDK_RETENTION_HOURS`, 24 por defecto). `usageRollups` (solo agregados) se conserva.
- Con el motor `sdk` el servidor cierra ordenadamente al recibir `SIGINT`/`SIGTERM`.
- **Verificado con HiveAgents (Qwen3.5-9B, 2026-10-10):** ambos motores generan un currículo con tool calling (45–57 s), completan una lección interactiva (30–43 s) y el investigador web produce un dossier real (3 fuentes, 9 afirmaciones, ~200 s). Con Qwen el razonamiento va **apagado por defecto** (`chat_template_kwargs.enable_thinking`): una respuesta corta pasa de 14 s a 1,4 s; actívalo con `thinking.enabled = true`.
- **Kev como oráculo de decisiones** (`agent/kev/`): consultas cerradas (elegir o probabilidad) de ~0,1 s por pregunta. Sin oráculo (sin clave, política, caída) todo cae a una ruta determinista; el sistema nunca depende de él.
  - *Coordinador* (`planDelegation`): por nodo, agente visual y skills pedagógicas (`agent/skills/catalog.ts`); solo elige entre candidatos permitidos con confianza ≥ 0,7, máx. 3 skills, y no puede quitar las obligatorias (p. ej. `verificar-con-fuente` con dossier).
  - *Especialista* (`planSpecialist`, en `HiveLearnExecutor`): esfuerzo de razonamiento (`thinking`), longitud y qué skills del nodo aplica.
  - *App*: respuestas **abiertas** (sin clave) las juzga Kev (`judgeAnswer`; ≥ 0,65 correcta, ≤ 0,25 incorrecta; evidencia solo con ≥ 0,8); con clave manda el código y Kev no se consulta. ¿Superó el nivel? (`GET /curricula/:id/level`): la evidencia manda y Kev solo frena o pide revisión docente (`GET /curricula/level-reviews`). Tras un fallo, Kev elige pista/repaso/ejemplo; no se abandona un nodo antes del 3.er fallo.
  - Medido: ~0,1 s por pregunta y el SDK corta a los 3 s; se envían lotes de 8, consecutivos, y se detiene al primer fallo para no agotar el presupuesto de errores del SDK (en paralelo el servidor los serializa y todos pasan de 3 s). Bajo carga de GPU compartida una consulta de 12 preguntas llegó a superar los 3 s.

### Currículo para cualquier tema

- Un currículo es un dato validado (`CurriculumDef`, `institutional/curriculum-def.ts`): niveles, nodos con prerrequisitos (grafo acíclico, máx. 20) y banco de preguntas diagnósticas. El de IA actual es el primero y es `canonical`.
- El agente Arquitecto (`agent/curriculum-architect.ts`) genera el currículo de otro tema con la tool `definir_curriculo`, que devuelve al modelo todos los problemas del grafo para que los corrija. Lo generado se guarda como `generated` y **no acredita dominio**: un docente o administrador debe aprobarlo (`approveCurriculum`) para pasarlo a `reviewed`.
- Un id canónico no puede ser ocupado por un currículo generado, y la aprobación comprueba el hash del contenido.
- Progreso por `(alumno, currículo)` en `hl_curriculum_progress` (`institutional/curriculum-progress.ts`): el diagnóstico y los dominios llevan el hash del contenido, así que un currículo que cambia no hereda progreso. El dominio solo lo otorga un docente y solo en currículos `canonical` o `reviewed`.
- Rutas del portal: `GET /curricula`, `POST /curricula/:docId/approve` (docente/admin), `GET|POST /curricula/:id/diagnostic`, `GET /curricula/:id/route` y `POST /students/:id/curricula/:id/reviews`. Un alumno no ve ni trabaja un currículo sin revisar. El currículo de IA conserva sus rutas históricas.
- **Generar desde el portal** (docente/admin): `POST /api/portal/curricula/generate` `{topic, audience, language?, research?}` encola un trabajo persistente (`hl_curriculum_jobs`, uno a la vez, máx. 3 activos por institución, repetidos no se duplican) y responde 202 con el id; `GET /curricula/jobs/:id` (y `GET /curricula/jobs`) informa `queued|running|done|failed` y, al terminar, `docId`/`curriculumId`. Con `research` (por defecto) el investigador arma un dossier y el arquitecto solo puede citar sus fuentes. El resultado nace `generated` y se aprueba con `POST /curricula/:docId/approve`. Un trabajo que quedó `running` por un reinicio se marca `failed` en vez de repetirse solo.
- **Sesiones sobre ese currículo:** `runHiveLearnSession(perfil, meta, { curriculumId })` y `POST /api/hivelearn/generate` con `curriculumId` cargan la definición y su dossier vigente (primero el de la banda del alumno); un currículo sin revisar se practica pero no acredita. Un id inexistente responde 404.
- `HiveLearnSwarm.run(perfil, meta, { curriculum, dossier })` valida el blueprint contra la definición del tema. El recorrido guiado A2UI de otros temas ya está en `GET|POST /curricula/:id/journey`; los complementos (`supplements`) siguen siendo solo de IA.

### Investigador web

- `agent/researcher.ts` (`hl-researcher-agent`) busca y descarga fuentes con **solo** tres tools: `safe_web_search`, `safe_web_fetch` y `definir_dossier`. Se crean por ejecución, con la banda de edad y un presupuesto (6 búsquedas, 8 descargas).
- `research/net-guard.ts`: solo https en el puerto 443, sin credenciales, bloqueo de IP privada/loopback/enlace local (todas las notaciones y IPv6), resolución DNS validada, redirecciones revalidadas en cada salto, timeout total, tope de bytes en streaming y solo contenido textual. Límite conocido: DNS rebinding entre la comprobación y la conexión; en despliegues institucionales conviene filtrar también el egreso de red.
- `research/domain-policy.ts`: menores y edad desconocida solo ven dominios de una lista permitida (referencias educativas, `.edu`, `.gov`, ampliable); la búsqueda ni siquiera les muestra el resto.
- El texto web llega al modelo como dato (`untrusted: true`), sin scripts, comentarios ni elementos ocultos. El dossier toma URL y fecha de las fuentes **realmente descargadas** (el modelo solo cita `sourceId`), y la confianza "alta" exige dos dominios distintos.
- Dossiers en `hl_research_dossiers`, con caché por tema, idioma y banda (14 días). `generateResearchedCurriculum` investiga y genera el currículo; sus fuentes solo pueden ser URLs del dossier.
- El proveedor de búsqueda predeterminado raspa DuckDuckGo HTML (`research/search-provider.ts`); es intercambiable y, si cambia su marcado, devuelve cero resultados.

### Puerta de seguridad y citas

- `safety/content-safety.ts` es código determinista (no un agente) y se ejecuta siempre antes de entregar un programa del enjambre. **Veto** (se lanza `safety_veto`): correos, marcado ejecutable, restos de inyección de prompt, URLs http o con IP, dominios no permitidos para menores y citas a afirmaciones inexistentes. **Revisión** (el programa lleva `seguridad.estado = 'review'`): números que parecen teléfono o documento, temas sensibles para menores, URLs fuera del dossier, conceptos sin citas.
- Con dossier (`HiveLearnSwarm.run(perfil, meta, { dossier })`), los agentes de explicación y ejercicio lo reciben como dato delimitado, la caché por concepto se omite y `generar_explicacion` acepta `claim_ids` verificados contra el dossier.
- Es una red de seguridad: no sustituye la revisión pedagógica ni la docente.

### Corrección y acreditación híbrida

- `grading/grade.ts`: con clave de respuesta la corrección es código (opción múltiple por índice o texto exacto normalizado, verdadero/falso, numérico con tolerancia y coma decimal, texto con respuestas aceptadas o palabras clave). Sin coincidencias difusas: contener el texto correcto no es acertar. Un fallo en texto libre sale con confianza baja, porque puede ser una paráfrasis.
- Respuestas abiertas: una rúbrica de criterios que marca el LLM, pero el puntaje lo calcula el código; un criterio solo cuenta si cita un fragmento que aparece en la respuesta, y la confianza del LLM tiene tope 0,9.
- `grading/evidence.ts`: regla híbrida. Correcto y confiable (≥ 0,8) en un currículo `canonical`/`reviewed` cuenta como evidencia; en uno `generated` es autodeclarado y nunca acredita; con confianza baja va a revisión docente (o autodeclarado si no hay docente). El juicio del tutor sin clave de respuesta cuenta con confianza 0,6, es decir, nunca acredita por sí solo.
- Dominio: evidencia que cuenta en **≥ 2 sesiones distintas**, solo en currículos que acreditan, con diagnóstico hecho y prerrequisitos dominados (`masterByEvidence`). Queda registro con revisor `system:evidence`. El currículo de IA conserva el dominio solo por revisión docente.

### Registro autónomo y recuperación de contraseña

- **Apagado por defecto.** El administrador lo habilita con `allowSelfRegistration` en la configuración institucional. `POST /api/portal/register` (usuario, nombre, contraseña, edad) solo acepta **mayores de 18 años** — la edad es declarada, no verificada —, con el mismo límite de intentos y comprobación de origen que el inicio de sesión. Los menores con tutor quedan fuera de este flujo.
- La cuenta nace como alumno de la institución instalada **sin docente**: su evidencia es autodeclarada y no acredita (ver Corrección y acreditación). No existe una "institución personal" por usuario: el administrador de la instalación ve estas cuentas.
- **Recuperación sin correo:** el registro entrega un código de recuperación que se muestra una vez. `POST /recover` lo canjea por una contraseña nueva, entrega otro código y cierra todas las sesiones de la cuenta. Cualquier fallo responde con el mismo mensaje.
- **Restablecimiento por personal:** `POST /accounts/:id/password-reset` (administrador, o el docente de ese alumno) emite un código de un solo uso válido 24 h que se canjea en `POST /reset`; también cierra las sesiones. Un código de restablecimiento no sirve para activar cuentas.
- Sin canal de correo no hay verificación de identidad: quien tenga el código de recuperación controla la cuenta.

### Recorrido guiado para cualquier tema

- `GET /api/portal/curricula/:id/journey` y `POST …/journey/actions` (alumno): el mismo guion que el de IA (bienvenida → intereses → forma de aprender → diagnóstico → ruta → concepto → práctica → feedback → otra actividad) sobre cualquier `CurriculumDef` que acredite (`canonical` o `reviewed`; uno sin revisar responde 409).
- El contenido sale de la definición: objetivo, evidencia esperada, fuentes y orientación por edad. La explicación la redacta el especialista y se guarda en caché por (contenido, nodo, banda) en `hl_node_materials`; si no hay modelo, el recorrido usa el objetivo y la evidencia y **no se rompe**.
- La práctica es una respuesta abierta: el tutor da feedback formativo y Kev la juzga una sola vez; el veredicto queda como evidencia (método `oracle`). «Sesión» a estos efectos es el **día**: repetir el ejercicio en una sentada no cuenta como dominio sostenido.
- El estado lleva el hash del currículo: si el contenido cambia, el recorrido y el diagnóstico empiezan de nuevo. La superficie A2UI es `journey:<alumno>:<currículo>`; el recorrido de IA conserva `journey:<alumno>`.
- Pendiente: los complementos (`supplements`) siguen siendo solo del currículo de IA.

### Onboarding conversacional

- `onboarding/engine.ts` y `onboarding/fields.ts`: el orden de captura (apodo, nombre, edad, tema, objetivo, energía, tiempo, estilo), la validación y el cierre son **código**. Antes el modelo decidía qué campo guardar llamando tools y, si no las llamaba, el servidor adivinaba el campo por palabras de la pregunta anterior.
- El modelo solo pone la voz de Maya y, si una respuesta de opción cerrada es ambigua (energía, estilo), Kev la clasifica. Sin modelo, o con el proveedor prohibido por la política, el flujo sigue con preguntas fijas.
- `runHiveLearnConversation` ahora aplica la política por edad: sin `runContext` asume la banda restrictiva. Un alumno sin edad declarada no puede usar un proveedor remoto salvo que la institución lo permita; los canales de administración y de retratos pasan `adulto` de forma explícita.
- Reanudar una sesión repite la pregunta pendiente; con un alumno ya conocido no se vuelve a preguntar nombre ni edad.
- Límite: una respuesta que contiene varios datos a la vez ("soy Ana, tengo 12 y quiero aprender SQL") se interpreta como el campo pendiente; el resto se vuelve a preguntar.

### Cola de revisión docente

- La evidencia de confianza media (p. ej. un juicio de Kev entre 0,65 y 0,8) o de un alumno con docente queda marcada para revisión. `GET /api/portal/review-queue` (docente o administrador) lista solo los alumnos a su cargo, la más antigua primero.
- `POST /api/portal/review-queue/resolve` con `{studentId, curriculumId, nodeId, decision: 'accept'|'reject', evidence?}`. **Aceptar exige describir la evidencia observada** (≥ 20 caracteres) y otorga el dominio por el mismo camino que una revisión directa (respeta prerrequisitos y que el currículo acredite); rechazar solo cierra la revisión.
- Cada resolución deja registro (`system`/docente) y la entrada sale de la cola.

### Robustez de la generación

- El blueprint se corrige con el motivo del rechazo (hasta 3 intentos).
- Un nodo que no se puede reparar **se descarta** y el resto se entrega, siempre que queden al menos el 60 % (mínimo 2); el XP se renormaliza a 100.
- Un nodo nunca promete un visual que no tiene (`sanitizeVisuals`): tipos inventados por el modelo o assets que fallaron quedan como tarjeta de texto.
- Verificado con Qwen3.5-9B + Kev en ambos motores: 10 nodos en 4–5 min con 22–23 consultas a Kev (≈0,7 s cada una).

### Edad, política y identidad del alumno

- La banda de edad sale de un solo lugar (`institutional/age.ts`). Una edad ausente o inválida cuenta como la banda más restrictiva (`ninez`), nunca como adulto.
- Toda ejecución de un agente lleva un `RunContext` (alumno y banda). Un proveedor remoto exige `allowRemoteProviders` y, para menores o edad desconocida, `allowRemoteForMinors`. Sin institución instalada, los menores solo lo usan con `HIVELEARN_ALLOW_REMOTE_FOR_MINORS=true`. El oráculo Kev/Jev sigue la misma regla.
- Con el motor `sdk`, un hook `beforeToolCall` bloquea cualquier herramienta que no sea de la ejecución en curso.
- `HIVELEARN_MIGRATE_STUDENT_IDS=dry-run|true` enlaza los perfiles antiguos con su cuenta del portal por nickname=username. Solo enlaza coincidencias inequívocas, deja copia en `hl_student_migration_backup` y los alias en `hl_student_aliases`. Úsalo primero en `dry-run`.

## Alcance verificado y límites

Implementados: roles, activación, perfil de nombre, inscripción Excel, diagnóstico de diez preguntas, diez competencias con contenido original, revisión docente, A2UI 0.8 (subconjunto del catálogo), WebSocket con alternativa HTTP, configuración institucional y complementos persistentes con dos workers como máximo.

El material es una base curricular versionada, no una certificación ni un instrumento psicométrico validado. Requiere pilotaje y revisión docente local. La configuración de imagen/audio/voz no equivale a un estudio multimedia completo: no se ha verificado generación multimodal de extremo a extremo con proveedores comerciales. La transformación de logos sí usa Bun.Image y tiene pruebas.

No se han verificado proveedores comerciales reales ni el almacén de secretos del sistema en todas las plataformas. No hay SSO, recuperación autónoma de contraseñas activas, gestión legal de consentimientos, instaladores firmados ni auditoría externa de seguridad. La autorización declarada durante la matrícula no demuestra consentimiento del representante legal.

El código histórico de lecciones se conserva por compatibilidad; su gamificación no forma parte del nuevo panel ni del conjunto activo de generación.
