# Qué está verificado y qué no

## Automatizado (`bun test`, `bun run typecheck`)
Identidad y política por edad, migración de ids, memoria, currículos (validación, hash, aprobación), investigador (red hostil, dossier), puerta de seguridad, corrección y regla híbrida, delegación y oráculo con servidor simulado, reparto por rondas (incluida la caída de un especialista), onboarding, portal (registro, recuperación, currículos, recorrido guiado, cola de revisión), contrato de ambos motores.

## En vivo contra HiveAgents (2026-10-10)
- Qwen3.5-9B + Kev, ambos motores: generación de un programa de 10 nodos en 4–5 min con ~22 consultas a Kev (~0,7 s cada una); lección interactiva completa; investigador web real con dossier y currículo citado.
- Kev: juicio de respuestas abiertas (acierto 0,74; parcial 0,09; incorrecta 0,02; irrelevante 0,004; intento de inyección 0,04).
- Hallazgos que cambiaron el diseño: razonamiento de Qwen apagado por defecto; consultas a Kev de ≤ 8 preguntas y una por nodo (el SDK corta a los 3 s); el servidor serializa las consultas en paralelo.

- Qwen3.6-35B-A3B Q4_K_M (2026-10-11), motor `legacy`, concurrencia 1 (`parallel: 1` del backend): programa de 10 nodos en 543 s (planificación ~160 s con un rechazo de blueprint corregido, contenido ~240 s, visuales ~140 s), 22 consultas a Kev, todos los visuales con su asset y `seguridad=ok`. Los títulos y casos son más concretos que con el 9B ("Netflix y tus recomendaciones", "Crédito bancario automatizado").
- Recorrido guiado de un tema libre con el 35B: explicación generada en 5 s, feedback del tutor en 7 s; Kev juzgó la práctica y quedó evidencia `oracle:counts` con confianza 0,89.
- Con concurrencia 2 contra un backend de `parallel: 1`, una planificación superó los ~100 s del proxy (HTTP 524) y los trabajos visuales llegaron a tardar 60–220 s. `HIVELEARN_MAX_CONCURRENT_WORKERS` debe igualar el paralelismo del backend.
- La política por defecto (`allowRemoteProviders: false`) bloquea HiveAgents: hay que habilitar los proveedores remotos en la configuración institucional.

## Actualización a `@johpaz/hive-sdk` 0.7.3 y HiveDB 0.7.0 (2026-10-13)
- `bun run typecheck` (core y cli) y `bun test`: 291 pruebas en verde, 7 omitidas (WebView).
- Sin cambios de código: las APIs que usamos (`runAgent`, `askJev`, `registerAppTool`, `registerHook`, almacenamiento) conservan su forma; los subpaths retirados (`/swarm*`) nunca se usaron.
- Una base existente reindexa su texto una vez al abrirla con HiveDB 0.7.0 (los datos no se tocan): conviene respaldar `~/.hivelearn` antes del primer arranque.
- Pendiente: corrida real con el modelo montado (no había modelo en HiveAgents en ese momento).

## Fase 11 — limpieza, resiliencia y conexión al portal (2026-10-13)
- `bun run typecheck` y `bun test`: 314 pruebas en verde, 7 omitidas. Arranque real del gateway (`/health`, `/api/portal/status`) y `hivelearn --help` sin rutas ni comandos retirados. Cerca de 4 100 líneas netas menos (código muerto, 8 agentes legacy, 10 adaptadores LLM, 2 dependencias de proveedor).
- **Medido, no supuesto:** con el motor `sdk`, `traces` es la única colección de `sdk-db` con texto de la tarea del alumno; se purga al terminar cada corrida y por edad (`HIVELEARN_SDK_RETENTION_HOURS`). La prueba de integración corre tres corridas (y una fallida) y comprueba que ninguna colección conserva la marca.
- **Hallazgo corregido:** en el motor `legacy`, `callLLM` descartaba `thinking`, así que la decisión de esfuerzo de Kev nunca llegaba a los proveedores. Ahora se reenvía (y `think` se acepta como alias).
- **Decisión tras comparar contra el SDK:** el adaptador de HiveAgents del SDK manda `enable_thinking` en `extra_body` (el backend lo ignora) y deja Qwen 3.x razonando por omisión; los propios de HiveAgents y Ollama se conservan (LocalLLM salió después del catálogo). El resto de proveedores pasa por `callLLM` del SDK. Los reintentos con backoff del SDK se suman a los del reparto (hasta 3 × 2 intentos ante 5xx persistente).
- Cancelación real por intento, backoff, corte de ronda con `model_not_mounted` y respaldo de modelo bajo la política por edad: cubiertos con pruebas (`swarm/jobs.test.ts`, `runner.contract.test.ts`).
- Generación de currículos desde el portal y sesiones sobre un currículo: pruebas con generador simulado. **Sin corrida en vivo** (no había modelo montado ni clave de Gemini).

## Programa personal por niveles — recorrido completo con Gemini 3.8 Flash (2026-10-13)
Navegador real (Chromium por CDP), gateway con motor SDK y base temporal, alumno y docente creados por la API:
- Plan de 3 niveles en **22 s** a partir de la intención declarada en la UI.
- Nivel 1 acertado → adaptador materializa el nivel 2 en 27 s. Nivel 2 fallado a propósito → checkpoint `hold` e **inserta un nivel de refuerzo** en 19 s. Refuerzo superado → materializa la evaluación final en 9 s. Final superado → programa cerrado, `pending_review`, nota 100.
- El docente reafirma desde la UI; la cola queda vacía, `validation: validated`, 4 revisiones del plan y bitácora ordenada `intent → answer… → checkpoint → adaptation → … → state → validation`.
- Hallazgos que cambiaron el diseño: el adaptador a veces contestaba texto en vez de llamar la tool (reintento recordando la tool); pedir a la vez "refuerzo + materializar" confundía los índices (ahora una sola operación principal); sin contenido tras una caída del modelo se usa repaso determinista.
- Pruebas automáticas: dominio (dimensionado, guardas), cerrojo de sesión única (con concurrencia y expiración), motor (avance, refuerzo, rechazo de ajustes sobre lo cursado, fallback, oráculo), validación docente, guía con k-anonimato y rutas del portal (roles, 409, la clave no llega al alumno).
- **No verificado:** el embedder local (`HIVELEARN_EMBEDDER=local`, ~470 MB); la búsqueda de guías se probó en modo texto.

## Sincronización de modelos y retiro de LocalLLM (2026-10-13)
- Pruebas con servidores simulados (`models/sync.test.ts`): alta de modelos inactivos, actualización, retiro, protección de los que usa un agente, listado sospechoso, modelos manuales, política sin remotos, migración de ids de revendedores con re-apuntado de agentes y ajustes (idempotente).
- **Sin corrida contra las APIs reales** de los proveedores (formato de los listados tomado de su documentación).
- LocalLLM salió del catálogo: adaptador, runtime, descargador, rutas `/api/llm/*` y `/ws/llm`, proveedor y modelo sembrados. En una base existente, el seed elimina el proveedor y sus modelos si nada los usa; si algún agente o ajuste los usa, avisa y lo elimina cuando se cambie.

## En vivo con Gemini 3.8 Flash y el motor SDK 0.7.3 (2026-10-13)
Base temporal, clave leída del llavero del proyecto (no impresa), `HIVELEARN_AGENT_ENGINE=sdk`:
- Arquitecto (sin investigador): **32 s**, currículo de 8 nodos y 8 preguntas, estado `generated`.
- Arquitecto + investigador web: **68 s**, 6 nodos, dossier de 2 fuentes y 7 afirmaciones.
- Sesión completa (coordinador → especialistas → ronda final): **127 s**, 10 nodos con contenido, visuales y evaluación.
- **Hallazgo:** con `maxTokens: 2048` Gemini 3.x devolvía respuesta vacía (el razonamiento —800 a 1 900 tokens— consume el mismo presupuesto que la salida) y la generación fallaba con `missing_tool_call`. Ahora `runHiveLearnAgent` acepta `maxTokens` (arquitecto e investigador 8192, planificación 6144; `HIVELEARN_MAX_OUTPUT_TOKENS` cambia el valor por defecto).
- La política por defecto (`allowRemoteProviders: false`) bloquea Gemini en una institución instalada: hay que habilitarla en Configuración → Política y respaldo.
- Catálogo de modelos de Gemini sincronizado en la base real: ~45 modelos actuales, con `gemini-3.8-flash`.

## E2E de navegador con el juego (2026-10-20)
`bun run test:e2e` (compila la UI y corre `tests/e2e` con `RUN_WEBVIEW_TESTS=1`). Gateway real con base temporal, planificador y adaptador simulados (`tests/e2e/fakes.ts`, sin modelo ni red) y Chromium dirigido por `Bun.WebView` (WebGL por swiftshader; `CHROME_PATH` o el Chromium de Playwright en `~/.cache/ms-playwright`). 7 escenarios en verde, con capturas en `artifacts/webview/e2e-*.png`:
- **A** vista clásica completa; **B** juego de 3 niveles hasta «Programa terminado» (nota 100, pendiente de validación); **C** fallo del nivel 1 → refuerzo (plan de 4 niveles) → fin; **D** clic real (`Bun.WebView.click`) sobre el lienzo WebGL abre la celda correcta; **E** el docente valida desde la UI, cola vacía y bitácora `intent → … → validation`; **F** 401/403/409 y móvil 390x844 sin desborde; **G** sin WebGL cae a la vista clásica y «Cerrar sesión» libera al alumno.
- `tests/e2e/program-api.test.ts` repite A–C y la validación contra el portal sin navegador y corre siempre en `bun test`.
- **Bug encontrado por el E2E y corregido:** la esfera de contorno del `InstancedMesh` quedaba vacía, así que el raycast nunca devolvía celdas y no se podía elegir una celda con un clic en el 3D (solo con los chips).
- **Avisos del juego, corregidos:** «¡Nivel superado!» / «Vamos a reforzar…» ya no los pisa «Tu programa se adaptó…» (se muestran juntos), y `diffWorlds` empareja los niveles por tipo y título (no por índice), así que tras un fallo el aviso nombra el refuerzo y no la evaluación final. El E2E (B y C) lo comprueba.
- El portal limita login/activación a 15 por minuto y por IP (en loopback todo sale por 127.0.0.1): el arnés evita logins por API innecesarios y espera si recibe 429.
- Se retiró `tests/webview.test.ts`: sus 5 pruebas fallaban contra la UI actual (selectores de una versión previa: `[name=username]`, «Activar mi cuenta», recorrido guiado A2UI). Los flujos de admin, docente e importación Excel que cubría quedan sin prueba de navegador; el portal los cubre con `portal.test.ts`.

## Juego 3D «Estación Colmena» (2026-10-20)
Mundo de ciencia ficción con Three r186 (WebGPU/WebGL2, TSL, bloom), dron-abeja controlable (WASD/flechas, `E`/Enter/Espacio, `[` `]`, clic o toque), cámara de seguimiento con cinemática al cambiar de nivel, audio procedural (silenciado por defecto), narración con `speechSynthesis` y modelos de Blender (ver `docs/INVESTIGACION-JUEGO-3D.md`).
- `bun run typecheck` y `bun test`: 427 en verde, 10 omitidas (E2E de navegador). `bun run test:e2e`: 16 en verde (12 de navegador, escenarios A–L, y 4 de API). K = F3 muestra/oculta el diagnóstico; L = en un equipo lento la calidad alta baja sola y avisa. J = movimiento reducido (emulado por CDP): el dron aparece en la celda al instante y el teclado avanza por pasos, sin bucle. I = joystick táctil (palanca virtual en pantallas táctiles o con `localStorage['hivelearn.joystick']='1'`).
- Pruebas nuevas puras: `controller.test.ts` (baldosas caminables, puentes cerrados como barrera, foco, rutas), `quality.test.ts`, `audio.test.ts` (silenciado sin contexto, preferencias, `pickVoice`). El E2E H mueve el dron con teclado, cambia de celda con `]`, abre con `E` y comprueba el sonido y su preferencia.
- **Panel de diagnóstico (F3, o `localStorage['hivelearn.debug']='1'`):** backend, calidad y fps. Para medir en un equipo real. Bajo swiftshader (CPU, no representativo) en un lienzo de ~1050x470: baja 19 fps, media y alta 9 fps.
- El E2E fuerza calidad baja (`localStorage['hivelearn.quality']='low'`): bajo swiftshader no hay WebGPU y el bloom sería lento.
- **No verificado:** rendimiento y aspecto en WebGPU real o en GPUs de gama baja y móviles; calidad media y alta (bloom, sombras) se probaron solo bajo swiftshader con el backend WebGL2: arrancan sin errores y el bloom se ve, pero no hay medición de fps ni prueba con WebGPU real; el joystick táctil se probó con eventos de puntero sintéticos (escenario I), no con un dedo real; narración y sonido solo con pruebas de lógica, sin escucharlos.

## Prueba en vivo reproducible (`scripts/live-check.ts`)
Contra un gateway en marcha y con sus proveedores configurados, sin que las claves pasen por el script (solo la API del portal):

```bash
HIVELEARN_ADMIN_USER=<admin> HIVELEARN_ADMIN_PASSWORD='<contraseña>' \
  bun run scripts/live-check.ts --base http://127.0.0.1:8787 --topic "Introducción a SQL" [--no-research] [--approve]
```

Comprueba login → configuración vigente → generación (arquitecto y, salvo `--no-research`, investigador) con el estado del trabajo → catálogo → aprobación opcional. Verificado el propio script contra un gateway temporal: login erróneo y fallo de modelo se informan con un mensaje claro y código de salida 1.

## No verificado
- Calidad pedagógica del contenido generado (la puerta de seguridad no es un juicio pedagógico).
- Corridas con el modelo montado durante más de ~20 minutos: el backend lo descargó a mitad de una corrida larga (`model_not_mounted`).
- Proveedores comerciales, almacén de secretos en todas las plataformas, accesibilidad de la UI, SSO, consentimientos legales.
- Registro de menores con tutor (fuera de alcance).
- DNS rebinding en la investigación web.
