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
- **Decisión tras comparar contra el SDK:** el adaptador de HiveAgents del SDK manda `enable_thinking` en `extra_body` (el backend lo ignora) y deja Qwen 3.x razonando por omisión; el de HiveAgents, Ollama y local-llama propios se conservan. El resto de proveedores pasa por `callLLM` del SDK. Los reintentos con backoff del SDK se suman a los del reparto (hasta 3 × 2 intentos ante 5xx persistente).
- Cancelación real por intento, backoff, corte de ronda con `model_not_mounted` y respaldo de modelo bajo la política por edad: cubiertos con pruebas (`swarm/jobs.test.ts`, `runner.contract.test.ts`).
- Generación de currículos desde el portal y sesiones sobre un currículo: pruebas con generador simulado. **Sin corrida en vivo** (no había modelo montado ni clave de Gemini).

## No verificado
- Calidad pedagógica del contenido generado (la puerta de seguridad no es un juicio pedagógico).
- Corridas con el modelo montado durante más de ~20 minutos: el backend lo descargó a mitad de una corrida larga (`model_not_mounted`).
- Proveedores comerciales, almacén de secretos en todas las plataformas, accesibilidad de la UI, SSO, consentimientos legales.
- Registro de menores con tutor (fuera de alcance).
- DNS rebinding en la investigación web.
