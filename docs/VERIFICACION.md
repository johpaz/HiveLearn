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

## No verificado
- Calidad pedagógica del contenido generado (la puerta de seguridad no es un juicio pedagógico).
- Corridas con el modelo montado durante más de ~20 minutos: el backend lo descargó a mitad de una corrida larga (`model_not_mounted`).
- Proveedores comerciales, almacén de secretos en todas las plataformas, accesibilidad de la UI, SSO, consentimientos legales.
- Registro de menores con tutor (fuera de alcance).
- DNS rebinding en la investigación web.
