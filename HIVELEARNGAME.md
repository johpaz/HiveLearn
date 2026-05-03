🐝 Skill: HiveLearn Orchestrator
Blueprint Integral para Plataforma Educativa Gamificada (18 Agentes + Coordinador + PixiJS)
Objetivo: Skill reutilizable para que un agente de IA diseñe, orqueste y ejecute HiveLearn: plataforma educativa donde 18 agentes especializados + 1 coordinador generan programas de aprendizaje personalizados en tiempo real, entregados mediante un mundo isométrico gamificado en PixiJS. Stack: Bun (runtime), Gemma 4 (IA), PixiJS v8+ (frontend). Sin código — solo arquitectura, flujos, especificaciones y contratos.
📋 Metadatos de la Skill
Campo
Valor
Nombre
HiveLearn Game
Versión
0.0.1
Dominio
EdTech + Gamificación + IA Generativa Multi-Agente
Runtime
Bun (servidor) + Web (cliente PixiJS)
Modelo IA
Gemma 4 (fine-tuned para educación)
Frontend
PixiJS v8+ (isométrico, A2UI protocol)
Comunicación
WebSocket bidireccional + HTTP REST
Persistencia
PostgreSQL + Redis (cache) + localStorage (cliente)
Licencia
MIT (framework) + contenido generado bajo CC-BY-NC

🧠 Perfil del Agente Ejecutor
role: "HiveLearn System Architect"
capabilities:
  - "Diseño de orquestación multi-agente (18 especialistas + coordinador)"
  - "Arquitectura de generación de contenido educativo adaptativo"
  - "Integración de Gemma 4 para texto, audio, evaluación y personalización"
  - "Diseño de mundos isométricos educativos en PixiJS con A2UI"
  - "Gestión de estado distribuido: backend (Bun) ↔ frontend (Pixi)"
  - "Flujos de onboarding, progreso y evaluación con feedback en tiempo real"
  - "Optimización de pipeline: generación → validación → entrega → medición"
constraints:
  - "Privacidad primero: datos de estudiantes anonimizados/encriptados"
  - "Contenido educativo validado pedagógicamente (no alucinar)"
  - "Performance web: <3s carga inicial, 60fps en gameplay"
  - "Accesibilidad WCAG 2.1 AA desde el diseño"
  - "Originalidad: no replicar marcas/curricula protegidos"

  🌐 Arquitectura General del Sistema
Diagrama de Capas
┌─────────────────────────────────────────────┐
│ 🎮 CLIENTE: PixiJS + A2UI (Navegador)       │
│   - Mundo isométrico "Río"                  │
│   - Avatar estudiante + Bee Coordinator     │
│   - Portales de lección (A2UI overlay)      │
│   - Input multiplataforma + TTS local       │
│   - WebSocket client + estado local (Zustand)│
└─────────────────┬───────────────────────────┘
                  │ WS: /ws/hivelearn-*
                  │ HTTP: /api/*
┌─────────────────▼───────────────────────────┐
│ ⚡ SERVIDOR: Bun Runtime                     │
│   ┌─────────────────────────────────────┐   │
│   │  Coordinador (Agent #0)            │   │
│   │ - Orquesta los 18 agentes           │   │
│   │ - Gestiona sesión y progreso        │   │
│   │ - Traduce A2UI ↔ lenguaje natural   │   │
│   └─────────────────────────────────────┘   │
│   ┌─────────────────────────────────────┐   │
│   │ 🧠 18 Agentes Especializados        │   │
│   │ 1. Planner          10. Evaluator   │   │
│   │ 2. ConceptGen       11. FeedbackGen │   │
│   │ 3. ExerciseGen      12. Adaptivity  │   │
│   │ 4. QuizGen          13. Localization│   │
│   │ 5. VisualGen        14. Accessibility│  │
│   │ 6. AudioGen (TTS)   15. Analytics   │   │
│   │ 7. NarrativeGen     16. SafetyGuard │   │
│   │ 8. DifficultyTuner  17. ProgressTracker││
│   │ 9. EngagementBoost  18. RewardDesigner││
│   │ • Todos usan Gemma 4 con prompts    │   │
│   │ • Salidas validadas por reglas      │   │
│   └─────────────────────────────────────┘   │
│   ┌─────────────────────────────────────┐   │
│   │ 💾 Capa de Datos                     │   │
│   │ - PostgreSQL: estudiantes, sesiones,│   │
│   │   programas, progreso, evaluaciones │   │
│   │ - Redis: cache de generación, WS pub/sub│
│   │ - Object Storage: assets generados  │   │
│   └─────────────────────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│ 🤖 INFRA IA: Gemma 4 Cluster                │
│   - Fine-tuned para:                        │
│     • Pedagogía por edad/estilo            │
│     • Generación de ejercicios validados   │
│     • Evaluación formativa con explicación │
│     • Adaptación en tiempo real            │
│   - Guardrails:                             │
│     • Filtro de contenido inapropiado      │
│     • Verificación de precisión factual    │
│     • Límites de complejidad por nivel     │
└─────────────────────────────────────────────┘

flowchart TD
    A[Landing Page] --> B[Onboarding: Crear/Buscar Nickname]
    B --> C[Avatar Personalization]
    C --> D[Bee Coordinator: Entrevista Guiada]
    D --> E[Crear Student en BD + Session UUID]
    E --> F[Coordinador activa 18 agentes]
    F --> G[Generación Paralela del Programa]
    G --> H[Mundo Río: Exploración Inicial]
    H --> I[Tributarios se activan según progreso de agentes]
    I --> J[Entrar a Portal → Lección A2UI]
    J --> K[Interacción: ejercicios, quizzes, feedback]
    K --> L[XP + Progreso → Actualizar estado]
    L --> M[Bee guía a siguiente tributario]
    M --> N{¿Programa completo?}
    N -->|No| I
    N -->|Sí| O[Evaluación Final Integrada]
    O --> P[Reporte de Resultados + Recomendaciones]
    P --> Q[Guardar progreso + Opciones: reiniciar/compartir]

    coordinator_agent:
  id: "hive_coordinator"
  primary_role: "Orquestador pedagógico y compañero de navegación"
  responsibilities:
    - "Recibir perfil del estudiante (edad, tema, estilo, objetivo)"
    - "Descomponer objetivo en módulos → asignar a agentes especializados"
    - "Sincronizar generación paralela de los 18 agentes"
    - "Validar coherencia pedagógica del programa generado"
    - "Traducir contenido a protocolo A2UI para PixiJS"
    - "Acompañar al estudiante en el mundo Río (estados de comportamiento)"
    - "Gestionar feedback en tiempo real: ajustar dificultad, reforzar conceptos"
    - "Orquestar evaluación final y generación de reporte"

    Máquina de Estados del Coordinador (Bee en PixiJS)
    bee_states:
  - id: "onboarding_interview"
    trigger: "session_created"
    actions:
      - "mostrar_burbujas_dialogo_secuenciales"
      - "recoger_respuestas_estudiante"
      - "validar_completitud_datos"
      - "transicionar a: program_generation"
      
  - id: "program_generation"
    trigger: "datos_onboarding_completos"
    actions:
      - "activar_18_agentes_en_paralelo"
      - "mostrar_progress_bar_generacion"
      - "actualizar_estado_tributarios: 'seco' → 'fluyendo'"
      - "transicionar a: guiding_exploration"
      
  - id: "guiding_exploration"
    trigger: "al_menos_un_tributario_activo"
    actions:
      - "volar_delante_jugador_hacia_portal_activo"
      - "mostrar_hint_interaccion: 'Presiona E para aprender'"
      - "reproducir_TTS_contextual"
      
  - id: "lesson_support"
    trigger: "jugador_entra_portal"
    actions:
      - "estado: 'talking' + mostrar_burbuja_ayuda"
      - "escuchar_eventos_A2UI: respuesta_correcta/incorrecta"
      - "refuerzo_positivo_o_explicación_adicional"
      
  - id: "progress_celebration"
    trigger: "zona_completada_o_nivel_subido"
    actions:
      - "efecto_particulas + animacion_celebracion"
      - "TTS: mensaje_personalizado_de_logro"
      - "actualizar_HUD: XP, racha, badges"
      
  - id: "final_evaluation"
    trigger: "todos_tributarios_completados"
    actions:
      - "guiar_a_zona_evaluacion"
      - "orquestar_agente_evaluator + adaptivity"
      - "generar_reporte_visual + recomendaciones"
      - "ofrecer_opciones: reiniciar, compartir, explorar_mas"

      Comportamiento de Navegación

bee_navigation:
  follow_logic:
    min_distance: 2  # tiles isométricos
    max_distance: 4
    lerp_speed: 0.05
    avoid_collision: true
  pointing_logic:
    target_types: ["portal_activo", "zona_nueva", "objetivo_mision"]
    animation: "girar_cabeza + ala_señaladora"
    duration: 3s
  dialogue_management:
    queue_system: true  # no solapar mensajes
    priority_levels:
      1: "seguridad/errores"
      2: "instrucciones_críticas"
      3: "feedback_pedagógico"
      4: "motivación/curiosidades"
    skip_enabled: true  # jugador puede omitir

    🧠 Los 18 Agentes Especializados: Catálogo
#
Agente
Responsabilidad
Input
Output
Validación
1
Planner
Diseña estructura curricular del programa
Tema, edad, objetivo, estilo
JSON: módulos, secuencia, duración
Reglas pedagógicas por edad
2
ConceptGenerator
Crea explicaciones claras y adaptadas
Concepto, nivel, estilo_aprendizaje
Texto + metadatos (dificultad, palabras_clave)
Factualidad + legibilidad Flesch
3
ExerciseGenerator
Genera ejercicios prácticos contextualizados
Concepto, tipo_ejercicio, dificultad
A2UI: enunciado, opciones, solución, feedback
Rango de dificultad válido
4
QuizGenerator
Crea preguntas de evaluación formativa
Conceptos_clave, tipo_quiz
A2UI: preguntas, respuestas, ponderación
Cobertura de objetivos de aprendizaje
5
VisualGenerator
Sugiere assets visuales para PixiJS
Concepto, tema_visual
Metadata: sprite_name, palette, animation_hint
Coherencia con estilo artístico
6
AudioGenerator
Produce audio/TTS y efectos sonoros
Texto, emoción, idioma
URL_audio + metadata (duración, volumen)
Calidad audio + sincronización
7
NarrativeGenerator
Integra contenido en historia del mundo Río
Progreso_jugador, tema
Micro-narrativa: diálogo bee, descripciones
Coherencia narrativa + motivación
8
DifficultyTuner
Ajusta dificultad en tiempo real
Performance_jugador, métricas
Factor_ajuste: { XP_mult, hints, tiempo }
Evitar frustración/aburrimiento
9
EngagementBoost
Mantiene motivación con elementos lúdicos
Tiempo_sin_interacción, racha
Sugerencias: mini-retos, recompensas, sorpresas
No distraer del objetivo pedagógico
10
Evaluator
Evalúa respuestas y proporciona feedback
Respuesta_estudiante, solución_esperada
{ correcta: bool, xp: int, explicación: string }
Explicación constructiva, no punitiva
11
FeedbackGenerator
Crea mensajes de refuerzo y corrección
Resultado_evaluación, estilo_comunicación
Texto_TTS + animación_sugerida
Tono empático, lenguaje apropiado
12
AdaptivityEngine
Reconfigura ruta de aprendizaje según progreso
Historial_interacciones, objetivos
Nuevo_plan_ajustado: módulos, orden, énfasis
Mantener coherencia curricular
13
LocalizationAgent
Adapta contenido a idioma/cultura
Idioma, región, contexto_local
Contenido_traducido + ejemplos_culturales
Precisión lingüística + sensibilidad cultural
14
AccessibilityAgent
Garantiza accesibilidad universal
Perfil_accesibilidad, tipo_contenido
Versiones_alternas: texto_aumentado, alto_contraste, subtítulos
Cumplimiento WCAG 2.1 AA
15
AnalyticsAgent
Recoge y procesa métricas de aprendizaje
Eventos_interacción, resultados
Dashboard: progreso, áreas_fuertes/debiles, engagement
Privacidad: datos anonimizados
16
SafetyGuard
Filtra contenido inapropiado o erróneo
Cualquier_output_de_agente
{ aprobado: bool, razones: [], alternativas: [] }
Zero tolerancia a sesgos/errores
17
ProgressTracker
Gestiona estado de progreso y desbloqueos
Eventos_completado, XP_ganado
Actualización_estado: zonas, niveles, logros
Consistencia: sin progreso perdido
18
RewardDesigner
Diseña recompensas significativas y motivadoras
Logro_desbloqueado, perfil_jugador
Recompensa: badge, cosmetic, narrativa, XP_bonus


Protocolo de Comunicación entre Agentes

Agent bus

🎮 Integración con PixiJS: Protocolo A2UI

Ya integrado

Renderizado en PixiJS (Especificación para Agente Frontend)
pixi_a2ui_renderer:
  components:
    PortalOverlay:
      structure:
        - Header: title + zone_badge + xp_indicator
        - Body: scrollable_text + interactive_options
        - Footer: actions_bar + progress_hint
      behavior:
        - "fade_in + scale_from_bee_position"
        - "camera_zoom_to_player + blur_background"
        - "keyboard_navigation: tab entre opciones"
        
    DialogueBubble:
      structure:
        - Bubble: rounded_rect + pointer_triangle
        - Text: typewriter_effect + TTS_sync
        - Avatar: bee_icon + emotion_indicator
      behavior:
        - "appear_above_bee + follow_if_moving"
        - "auto_dismiss_after_duration + manual_skip"
        
    FeedbackToast:
      structure:
        - Icon: check/cross/sparkle
        - Message: short_text + xp_gain_display
        - Animation: slide_up + fade_out
      behavior:
        - "appear_near_interaction_point"
        - "stack_max_3 + oldest_dismiss"
        
  performance_guidelines:
    - "Reutilizar Graphics/Sprites para overlays (pooling)"
    - "Limitar textos largos: paginar o scroll virtual"
    - "Precargar assets de a2ui_common_atlas"
    - "Usar batch rendering para elementos UI repetidos"

    💾 Modelo de Datos: Entidades Clave
Student (Estudiante)

student:
  id: "uuid"
  nickname: "string (único, 3-20 chars)"
  profile:
    age_range: "6-8 | 9-11 | 12-14 | 15+"
    learning_style: "visual | auditory | kinesthetic | reading"
    interests: ["tema1", "tema2"]
    accessibility_needs: ["colorblind", "dyslexia_friendly", ...]
    language: "es | en | pt"
  avatar_config:
    skin_tone: "hex"
    hair_style: "preset_id"
    clothing: { top: "hex", bottom: "hex" }
    accessories: ["backpack", "hat", ...]
  created_at: "ISO8601"
  last_active: "ISO8601"


  Session (Sesión de Aprendizaje)
session:
  id: "uuid"
  student_id: "fk"
  status: "onboarding | generating | active | completed | evaluated"
  program:
    id: "uuid"  # generado por Planner
    theme: "string"
    estimated_duration_min: 20
    modules: [
      {
        id: "mod_1",
        title: "string",
        type: "concept | exercise | quiz | challenge",
        zone_mapping: "tributario_2",
        status: "pending | active | completed",
        xp_value: 50
      }
    ]
  progress:
    current_zone: "tributario_3"
    completed_modules: ["mod_1", "mod_2"]
    total_xp_earned: 175
    current_streak: 4
    best_streak: 7
  bee_state:
    current_state: "guiding_exploration"
    dialogue_queue: [...]
    last_interaction: "ISO8601"
  created_at: "ISO8601"
  updated_at: "ISO8601"

  A2UI Event (Registro de Interacción)
a2ui_event:
  id: "uuid"
  session_id: "fk"
  timestamp: "ISO8601"
  event_type: "concept_viewed | exercise_submitted | quiz_answered | hint_used | zone_completed"
  payload:
    module_id: "mod_3"
    response_data: { selected: "B", time_spent_sec: 12 }
    result: { correct: false, xp_gained: 0, feedback_shown: true }
    context: { streak_before: 3, difficulty_level: 2 }
  metadata:
    device_type: "desktop"
    input_method: "keyboard"
    performance_ms: 45



    🔌 Comunicación en Tiempo Real: WebSocket
Endpoints y Mensajes

websocket:
  endpoints:
    program: "/ws/hivelearn-program"  # generación y contenido
    events: "/ws/hivelearn-events"    # interacciones y feedback
    
  # Servidor → Cliente (push)
  server_messages:
    - type: "program_generation_start"
      payload: { agent_id: "planner", agent_name: "Arquitecto Curricular" }
      client_action: "mostrar_bee_generando + progress_bar"
      
    - type: "zone_activated"
      payload: { zone_id: "tributario_3", reason: "concept_ready" }
      client_action: "animar_tributario_fluir + mostrar_hint_portal"
      
    - type: "a2ui_content"
      payload: { ... }  # mensaje A2UI completo
      client_action: "render_portal_overlay + iniciar_TTS"
      
    - type: "evaluation_result"
      payload: { correct: true, xp_gained: 25, new_streak: 5, explanation: "..." }
      client_action: "mostrar_feedback_toast + actualizar_HUD"
      
    - type: "bee_dialogue"
      payload: { text: "¡Lo estás haciendo genial!", emotion: "proud", tts: true }
      client_action: "mostrar_burbuja_bee + sintetizar_voz"
      
  # Cliente → Servidor (pub)
  client_messages:
    - type: "player_action"
      payload: { action: "move", direction: "ne", timestamp: "ISO8601" }
      server_use: "analytics + adaptivity"
      
    - type: "a2ui_response"
      payload: { module_id: "mod_3", selected_option: "A", time_spent: 15 }
      server_use: "evaluator + progress_tracker"
      
    - type: "interaction_request"
      payload: { action: "hint", module_id: "mod_3", cost_acknowledged: true }
      server_use: "engagement_boost + difficulty_tuner"
      
  connection_management:
    heartbeat_interval: 30s
    timeout: 10s
    reconnect:
      strategy: "exponential_backoff"
      max_attempts: 10
      ui_feedback: "mostrar_estado_conexion (🟢🟡🔴)"
    auth: "session_token en handshake inicial"

    🎯 Sistema de Evaluación y Resultados
Evaluación Formativa (Durante el Programa)
formative_evaluation:
  triggered_by: ["respuesta_ejercicio", "completar_módulo", "tiempo_sin_progreso"]
  agents_involved: ["Evaluator", "FeedbackGenerator", "AdaptivityEngine"]
  output:
    immediate_feedback:
      type: "constructive"  # no solo correcto/incorrecto
      components:
        - "validación: lo que hizo bien"
        - "corrección: explicación clara del error"
        - "siguiente_paso: acción concreta para mejorar"
      presentation: "TTS + texto + animación_bee"
    xp_award:
      base: 10-25  # por respuesta
      multipliers:
        streak: "x1.1 por cada 3 aciertos seguidos"
        speed: "x1.2 si <10s y correcto"
        effort: "x1.5 si usa pista y luego acierta"
    adaptivity_signal:
      if_struggling: "reducir_dificultad_siguiente + ofrecer_repaso"
      if_excelling: "aumentar_complejidad + desbloquear_desafío_opcional"


      Evaluación Sumativa (Final del Programa)
summative_evaluation:
  trigger: "todos_los_módulos_completados"
  agents_involved: ["Evaluator", "AnalyticsAgent", "NarrativeGenerator", "RewardDesigner"]
  components:
    - "quiz_síntesis": 5-10 preguntas integradoras
    - "desafío_aplicación": ejercicio contextualizado en mundo Río
    - "auto_reflexión": preguntas guiadas por Bee ("¿Qué aprendiste?")
    
  report_generation:
    visual_summary:
      - "radar_chart: fortalezas_por_concepto"
      - "timeline: progreso_durante_sesión"
      - "badges_obtenidos: animación_celebración"
    narrative_feedback:
      tone: "empático + motivador"
      structure:
        1. "reconocimiento_esfuerzo"
        2. "logros_clave_destacados"
        3. "áreas_oportunidad_con_sugerencias"
        4. "próximos_pasos_recomendados"
    export_options:
      - "PDF para padres/educadores"
      - "JSON para integración LMS"
      - "Compartir_en_red: logro_anonimizado"
      
  reward_unlock:
    cosmetic: "nuevo_accesorio_avatar"
    narrative: "capítulo_extra_historia_Río"
    progression: "desbloquear_siguiente_tema_o_nivel"
    social: "badge_compartible_con_codigo"


    🚀 Pipeline de Generación del Programa (Coordinador → 18 Agentes)
Fase 1: Recepción y Descomposición (0-30s)

[Coordinador recibe perfil estudiante]
  ↓
[Planner diseña estructura curricular]
  ↓
[SafetyGuard valida plan pedagógico]
  ↓
[Coordinador asigna módulos a agentes especializados]
Fase 2: Generación Paralela (30s-3min)

[18 agentes trabajan en paralelo]:
  • ConceptGenerator → explicaciones
  • ExerciseGenerator + QuizGenerator → actividades
  • VisualGenerator + AudioGenerator → assets multimedia
  • NarrativeGenerator + EngagementBoost → contexto motivador
  • AccessibilityAgent + LocalizationAgent → adaptaciones
  ↓
[SafetyGuard filtra cada output]
  ↓
[ProgressTracker actualiza estado por módulo]

Fase 3: Consolidación y Traducción A2UI (3-4min)

[Coordinador recibe outputs validados]
  ↓
[AdaptivityEngine ajusta secuencia/dificultad]
  ↓
[Coordinador traduce a mensajes A2UI estructurados]
  ↓
[ProgressTracker marca programa como 'ready']
  ↓
[WebSocket notifica a cliente: "program_ready"]


Fase 4: Entrega en Tiempo Real (Durante Gameplay)

[Estudiante explora Río]
  ↓
[Al entrar a portal activo → Coordinador envía A2UI correspondiente]
  ↓
[Estudiante interactúa → eventos WS a servidor]
  ↓
[Evaluator + FeedbackGen responden en <500ms]
  ↓
[AdaptivityEngine ajusta siguiente contenido en vuelo]


Optimizaciones Clave

performance_optimizations:
  generation:
    - "cache_de_conceptos_comunes_por_tema_edad"
    - "pre_generar_plantillas_de_ejercicios"
    - "streaming_A2UI: enviar primer_módulo_mientras_generan_resto"
  delivery:
    - "preload_assets_A2UI_mientras_estudiante_explora"
    - "compresión_mensajes_WS: msgpack en lugar de JSON"
    - "debounce_de_eventos_de_input_para_analytics"
  fallbacks:
    - "si_agente_tarda >10s: usar_cache_o_contenido_genérico"
    - "si_WS_se_cae: modo_offline_con_queue_local"
    - "si_Gemma_4_falla: fallback_a_plantillas_validadas"

    🎨 Guía de Originalidad Pedagógica (No Clonar)
Elemento Común en EdTech
Alternativa HiveLearn
Lecciones lineales tipo "siguiente"
Mundo Río exploratorio: el estudiante elige ruta, el programa se adapta
Feedback genérico "¡Bien!"
Bee Coordinator con memoria: recuerda errores previos, refuerza progreso personalizado
Recompensas abstractas (puntos)
Ecosistema significativo: el agua fluye, los cristales crecen, la historia avanza con tu aprendizaje
Evaluación final tipo examen
Evaluación integrada en narrativa: resolver un desafío en el mundo para "sanar el río"
Contenido estático por nivel
Generación dinámica con Gemma 4: mismos conceptos, ejemplos contextualizados a intereses del estudiante
Accesibilidad como add-on
Diseño universal desde el agente Accessibility: múltiples representaciones del mismo concepto
📦 Configuración Base (YAML para HiveLearn Orchestrator)

# config/hivelearn_base.yml
system:
  name: "HiveLearn"
  version: "2.0.0"
  runtime: "bun"
  ai_model: "gemma-4-educational-finetuned"
  frontend: "pixijs-8-isometric"

session:
  timeout_minutes: 45
  auto_save_interval_sec: 30
  offline_grace_period_min: 5

agents:
  coordinator:
    id: "hive_coordinator_v2"
    prompt_template: "prompts/coordinator/system.md"
    temperature: 0.3  # consistente pero no rígido
  specialists:
    count: 18
    parallel_execution: true
    timeout_per_agent_sec: 45
    fallback_strategy: "cache_or_simplified"
  safety:
    guard_agent: "SafetyGuard"
    block_list_path: "data/safety_rules.json"
    review_human_in_loop: false  # activar para contenido sensible

content:
  a2ui_protocol_version: "1.2"
  max_overlay_text_length: 300  # caracteres para legibilidad
  tts:
    provider: "piper_local"  # fallback: browser_speech
    voice_profile: "friendly_educator"
    languages: ["es", "en", "pt"]
  visuals:
    style_guide_path: "assets/style_guide.json"
    palette_by_theme: "data/palettes.yml"
    animation_defaults: { duration_ms: 400, easing: "ease_out" }

world:
  rio:
    seed_strategy: "student_id_hash"  # mundo único por estudiante
    chunk_size: { q: 16, r: 16 }
    activation_logic: "agent_completion_based"
  bee:
    follow_distance: { min: 2, max: 4 }
    dialogue_priority: "pedagógica > motivacional > curiosa"
    tts_sync: "start_speaking_on_bubble_appear"

evaluation:
  formative:
    feedback_delay_ms: 300  # rápido pero no intrusivo
    xp_base_range: [10, 25]
    streak_bonus_threshold: 3
  summative:
    min_modules_for_eval: 5
    report_format: ["visual", "narrative", "exportable"]
    reward_types: ["cosmetic", "narrative", "progression"]

analytics:
  events_tracked:
    - "a2ui_interaction"
    - "zone_completion"
    - "bee_dialogue_skip"
    - "difficulty_adjustment"
  privacy:
    anonymize_before_storage: true
    retain_raw_events_days: 7
    gdpr_compliant: true

deployment:
  bun:
    optimize_for: "low_latency_ws"
    preload_modules: ["a2ui", "pixi_assets", "tts_cache"]
  pixijs:
    target_fps: 60
    asset_strategy: "lazy_load_by_zone"
    fallback_canvas: true  # si WebGL no disponible

    🧪 Checklist de Validación para el Agente Arquitecto
Antes de Generar Programa
Perfil estudiante completo y validado (edad, idioma, accesibilidad)
SafetyGuard activo y con reglas actualizadas
Cache de conceptos comunes precargado por tema
Conexión WS estable con cliente PixiJS
Durante Generación Paralela
Monitorear timeout por agente (máx 45s)
Validar cada output con SafetyGuard antes de consolidar
Actualizar progress bar en cliente cada 10% de avance
Manejar fallback si agente falla (cache o contenido simplificado)
Antes de Entregar a Cliente
Traducir todo contenido a protocolo A2UI v1.2
Precargar assets críticos para primer módulo
Verificar que Bee Coordinator tiene diálogo de bienvenida listo
Confirmar que estado de tributarios coincide con módulos generados
Durante Gameplay en Tiempo Real
Respuesta a interacciones <500ms (Evaluator + Feedback)
Adaptividad: ajustar dificultad cada 3 interacciones
Guardar progreso cada 30s o al completar módulo
Monitorear FPS en cliente: si <45, reducir partículas/LOD
Al Finalizar Programa
Ejecutar evaluación sumativa con 3 componentes (quiz, desafío, reflexión)
Generar reporte con narrativa personalizada por Bee
Ofrecer recompensas alineadas con esfuerzo y logros
Preguntar si desea guardar, compartir o continuar explorando
🌟 Principios Guía para HiveLearn
🐝 Pedagogía primero: La IA sirve al aprendizaje, no al revés.
🌊 Metáfora coherente: El Río es el flujo del conocimiento; cada decisión de diseño debe reforzarlo.
🤝 Coordinador empático: La Bee no es un menú, es un compañero que recuerda, celebra y guía.
⚡ Tiempo real con propósito: Cada mensaje WS debe tener valor pedagógico o emocional.
🎨 Originalidad con responsabilidad: Generar contenido nuevo, pero con validación humana en el loop para precisión.
♿ Accesibilidad por diseño: No es un modo, es la forma en que se concibe cada concepto.
Skill generada para HiveLearn Orchestrator v2.0
Úsala para crear experiencias de aprendizaje que no solo enseñan, sino que inspiran. 🚀🐝
