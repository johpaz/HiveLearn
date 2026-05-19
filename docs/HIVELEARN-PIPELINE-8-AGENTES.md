# HiveLearn: Pipeline de 8 Agentes

## Objetivo

Este documento define el pipeline objetivo de HiveLearn para generar un programa educativo completo con menor latencia, menos puntos de fallo y mayor coherencia pedagógica.

La meta es dejar atrás el swarm sobredimensionado y operar con un núcleo de 8 agentes:

1. `hl-coordinator-agent`
2. `hl-content-agent`
3. `hl-practice-agent`
4. `hl-assessment-agent`
5. `hl-image-agent`
6. `hl-infographic-agent`
7. `hl-audio-agent`
8. `hl-gamification-agent`

## Principios

- El coordinador es dueño del plan, no solo del enrutamiento.
- Cada worker debe tener solo la tool que necesita.
- La edad, nivel, tono, meta e intención del alumno deben condicionar toda decisión de contenido.
- No se entrega un programa con nodos incompletos, placeholders silenciosos o contenido incompatible con la edad.
- El camino feliz debe ser corto; la reparación solo corre cuando hace falta.

## Agentes y Responsabilidades

### 1. `hl-coordinator-agent`

Responsabilidad:
- entender el perfil del alumno
- clasificar intención
- definir la estructura del programa
- decidir el tipo pedagógico y visual de cada nodo
- coordinar repair y review final

Tools:
- `planificar_programa`
- `buscar_en_hivelearn`
- `reparar_nodo_completo`
- `revisar_programa`
- `actualizar_prompt_agente`

Skills esperadas:
- planificación pedagógica
- adaptación por edad
- decisión de medios
- control de calidad
- recuperación ante fallos

### 2. `hl-content-agent`

Responsabilidad:
- generar explicación principal por nodo
- producir contenido conceptual y milestones

Tool:
- `generar_explicacion`

Skills esperadas:
- explicación clara
- tono motivador
- ejemplo concreto
- simplificación por rango de edad

### 3. `hl-practice-agent`

Responsabilidad:
- generar práctica guiada
- producir ejercicios o retos según el tipo del nodo

Tool:
- `generar_ejercicio`

Skills esperadas:
- aprendizaje activo
- pasos guiados
- ejemplo de respuesta
- pista y respuesta correcta

### 4. `hl-assessment-agent`

Responsabilidad:
- generar quiz de nodo o evaluación de cierre

Tool:
- `generar_evaluacion`

Skills esperadas:
- evaluación formativa
- preguntas alineadas al objetivo
- dificultad adaptada a la edad

### 5. `hl-image-agent`

Responsabilidad:
- generar el apoyo visual principal del nodo
- resolver internamente la representación más adecuada para el concepto

Tool:
- `generar_imagen`

Skills esperadas:
- representación visual simple
- soporte conceptual
- adecuación visual para `nino`, `adolescente` o `adulto`

### 6. `hl-infographic-agent`

Responsabilidad:
- generar infografías cuando el nodo sea de resumen, comparación o cierre

Tool:
- `generar_infografia`

Skills esperadas:
- síntesis visual
- jerarquía de información
- baja complejidad para niños

### 7. `hl-audio-agent`

Responsabilidad:
- generar guion de narración educativa
- producir contenido apto para TTS

Tool:
- `generar_audio`

Skills esperadas:
- narración clara
- tono cálido
- ritmo simple
- apoyo auditivo por edad

### 8. `hl-gamification-agent`

Responsabilidad:
- asignar XP
- proponer recompensas
- reforzar progresión y celebración

Tool:
- `generar_gamificacion`

Skills esperadas:
- motivación
- progresión equilibrada
- refuerzo positivo

## Qué sale del pipeline principal

Estos agentes no deben formar parte del swarm principal de generación:

- `hl-onboarding-agent`
- `hl-feedback-agent`

Estos flujos siguen existiendo, pero fuera del pipeline de creación del programa.

También salen del camino principal:

- `hl-profile-agent`
- `hl-intent-agent`
- `hl-structure-agent`
- `hl-challenge-agent`
- `hl-code-agent`
- `hl-quiz-agent`
- `hl-svg-agent`
- `hl-gif-agent`

Sus responsabilidades quedan absorbidas por el coordinador o por agentes más amplios.

## Pipeline Operativo

### Fase 0. Onboarding

Entrada:
- nickname
- nombre
- edad
- tema
- objetivo
- estilo

Salida:
- perfil persistido del alumno
- sesión lista para generación

Esta fase no pertenece al swarm de 8 agentes.

### Fase 1. Plan del programa

El coordinador recibe:
- perfil completo
- meta
- contexto del alumno

El coordinador llama:
- `planificar_programa`

Salida esperada:
- `LessonBlueprint`
- tema
- nodos
- `tipoPedagogico`
- `tipoVisual`
- XP por nodo

### Fase 2. Generación por nodo

Para cada nodo, el sistema crea:

- 1 tarea pedagógica obligatoria
- 0 o 1 tarea media opcional

Ejemplos:
- un nodo conceptual usa `hl-content-agent`
- un nodo práctico usa `hl-practice-agent`
- un nodo de verificación usa `hl-assessment-agent`
- un nodo con apoyo visual usa `hl-image-agent`
- un nodo de resumen usa `hl-infographic-agent`
- un nodo auditivo usa `hl-audio-agent`

### Fase 3. Gamificación

Cuando los nodos ya están completos:
- `hl-gamification-agent` distribuye XP, refuerzos y recompensas

### Fase 4. Repair

Si un worker falla:
- el coordinador revisa el nodo incompleto
- usa `buscar_en_hivelearn` si necesita contexto adicional
- llama `reparar_nodo_completo`

Si el nodo sigue incompleto:
- la generación falla explícitamente

### Fase 5. Review final

El coordinador revisa:
- coherencia pedagógica
- progresión
- adecuación por edad
- equilibrio de XP
- completitud real del programa

Tool:
- `revisar_programa`

Si el proveedor falla en esta etapa:
- debe existir fallback determinístico local
- no se debe perder un programa ya reparado

## Contexto que debe recibir cada agent

Todo worker debe recibir en su `taskDescription`, como mínimo:

- `tema`
- `objetivo`
- `concepto`
- `rangoEdad`
- `nivelPrevio`
- `tono`
- `estilo`
- `duracionSesion`
- `tipoPedagogico`
- `tipoVisual`
- `nodeId`

No basta con declararlo en el `system prompt`. El runtime debe inyectarlo en cada tarea.

## Reglas por edad

### `nino`

Priorizar:
- `image_ai`
- `audio_ai`

Usar con cautela:
- `infographic`

Evitar por defecto:
- `code_block`
- visuales densos
- texto largo

### `adolescente`

Permitir:
- más detalle conceptual
- práctica más abierta
- evaluaciones con mayor dificultad

### `adulto`

Permitir:
- mayor densidad de contenido
- explicaciones comparativas
- estructuras más extensas

## Tiempos Esperados

Objetivo operativo para 5 nodos:

- camino feliz: `45s` a `90s`
- con algunos retries o repair ligero: `90s` a `150s`
- por encima de `180s`: degradación que debe revisarse

No es aceptable como baseline:
- `4` o `5` minutos para 5 nodos
- más de `10` llamadas críticas en serie
- generar nodos huecos y luego “taparlos” con fallback

## Ventajas de este pipeline

### 1. Menor latencia

Se eliminan workers base redundantes y saltos innecesarios.

### 2. Menos puntos de fallo

Menos agentes significa:
- menos retries
- menos tool-calls
- menos inconsistencias entre outputs

### 3. Mejor coherencia pedagógica

El coordinador define la estructura con contexto completo del alumno.

### 4. Mejor trazabilidad

Cada worker tiene una sola responsabilidad clara y una sola tool.

### 5. Mejor repair

Cuando algo falla, el coordinador repara el nodo completo en lugar de ensamblar piezas rotas.

## Riesgos a evitar

- dejar prompts legacy en BD activos sobre workers ya refactorizados
- exponer más de una tool a un worker sin necesidad
- seguir aceptando texto plano cuando la salida es ambigua
- permitir que el orquestador cree fallback silencioso
- usar tipos visuales incompatibles con la edad del alumno

## Estado actual de transición

La implementación ya avanzó en estas áreas:

- el coordinador absorbe `profile`, `intent` y `structure`
- se eliminó el fallback silencioso de contenido en el orquestador
- se añadieron guardrails por edad para la selección visual
- la UI principal ya dejó de mostrar varios agentes legacy
- tools y skills ya se indexan en FTS para `buscar_en_hivelearn`

Todavía hay consolidaciones pendientes:

- dejar `ImageAgent` como único worker visual real
- dejar `AssessmentAgent` como único worker de quiz y evaluación
- terminar de reflejar el modelo de 8 agentes en todos los paneles de configuración

## Criterios de aceptación

El pipeline se considera correcto cuando:

- el coordinador genera el blueprint sin lanzar `profile/intent/structure` como workers
- cada worker corre con una sola tool
- no se entrega ningún programa con nodos incompletos
- la review final corre solo sobre programas completos
- el tiempo total para 5 nodos se mantiene normalmente por debajo de `90s`
- la UI, el seed inicial y la documentación muestran el mismo modelo operativo
