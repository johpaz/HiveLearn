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

### Motor de agentes (`@johpaz/hive-sdk`)

El motor predeterminado es el loop propio (`legacy`). Con `HIVELEARN_AGENT_ENGINE=sdk` los agentes se ejecutan con el loop de `@johpaz/hive-sdk`. Un proveedor que el SDK no soporta (p. ej. `local-llama`) cae solo al loop propio.

- El SDK usa una base **separada** (`sdk-db` y `sdk-home`, junto a la de HiveLearn). Se puede mover con `HIVELEARN_SDK_DB_PATH` y `HIVELEARN_SDK_HOME`.
- **Oráculo Kev/Jev:** se activa solo si hay API key del proveedor `hiveagents` (Kev) o `openrouter` (Jev). Se apaga con `oracleEnabled: false` en la configuración institucional, y con `allowRemoteProviders: false` solo se admite un endpoint local o de red privada. Del turno solo viaja el objetivo de la tarea; instrucciones, historial y resultados de tools no se comparten.
- Con el motor `sdk` el servidor cierra ordenadamente al recibir `SIGINT`/`SIGTERM`.

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
