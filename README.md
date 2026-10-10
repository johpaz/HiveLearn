# HiveLearn IA

Plataforma institucional de formación en inteligencia artificial. La interfaz es un panel de trabajo interactivo, no un juego: grafo Three.js/WebGL, diagnóstico formativo, práctica A2UI y revisión docente.

## Requisitos y arranque

- Bun **1.4.2**; HiveDB **0.5.0** instalado por el workspace.
- UI independiente en `packages/hivelearn-ui`: React, Vite 8 y TypeScript 7.
- Escritorio independiente en `packages/hivelearn-desktop`: instalador Tauri con UI, gateway y HiveDB incluidos. El usuario final no instala herramientas de desarrollo ni introduce tokens técnicos.

```bash
bun install
bun run build:ui
HIVELEARN_HOST=127.0.0.1 bun run dev:server
```

Abre `http://127.0.0.1:8787`. En el primer acceso se configuran la institución y el primer administrador sin tokens ni contraseñas predeterminadas. Después del alta, la ruta de configuración queda cerrada. Para desarrollar la UI: `bun run dev:ui` con el gateway activo.

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
bun run build:desktop
bun run test:webview
```

`bun test` ejecuta pruebas unitarias e integración con HiveDB temporal. Las pruebas gráficas web son optativas: `test:webview` usa Bun.WebView y requiere Chrome/Chromium en el equipo de desarrollo. El shell Tauri tiene pruebas Rust independientes en `packages/hivelearn-desktop/src-tauri`.

En Fedora, `bun run build:desktop` genera `packages/hivelearn-desktop/src-tauri/target/release/bundle/rpm/HiveLearn-0.1.0-1.x86_64.rpm`. El RPM contiene el shell, el gateway compilado, la UI y el binding de HiveDB; el gestor de paquetes resuelve GTK/WebKitGTK durante la instalación.

## Configuración y documentación

- [Configuración institucional, seguridad y operación](docs/CONFIGURACION-INSTITUCIONAL.md)
- [Contrato del grafo y del coordinador](docs/GRAFO-CURRICULAR.md)
- [Investigación curricular, rutas por edad/nivel y fuentes](docs/INVESTIGACION-CURRICULAR.md)
- [Resultados y límites de las pruebas](docs/VERIFICACION.md)

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

El motor predeterminado es el loop propio (`legacy`). Con `HIVELEARN_AGENT_ENGINE=sdk` los agentes se ejecutan con el loop de `@johpaz/hive-sdk`. Un proveedor que el SDK no soporta (p. ej. `local-llama`) cae solo al loop propio.

- El SDK usa una base **separada** (`sdk-db` y `sdk-home`, junto a la de HiveLearn). Se puede mover con `HIVELEARN_SDK_DB_PATH` y `HIVELEARN_SDK_HOME`.
- **Oráculo Kev/Jev:** se activa solo si hay API key del proveedor `hiveagents` (Kev) o `openrouter` (Jev). Se apaga con `oracleEnabled: false` en la configuración institucional, y con `allowRemoteProviders: false` solo se admite un endpoint local o de red privada. Del turno solo viaja el objetivo de la tarea; instrucciones, historial y resultados de tools no se comparten.
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
- `HiveLearnSwarm.run(perfil, meta, { curriculum, dossier })` valida el blueprint contra la definición del tema. **Pendiente:** el recorrido guiado A2UI (`journey`) y los complementos siguen siendo solo de IA.

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
