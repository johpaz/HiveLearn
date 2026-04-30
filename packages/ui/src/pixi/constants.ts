/**
 * Constants - Configuración del Mundo Robótico HiveLearn
 * 
 * Define todas las constantes para el laboratorio robótico futurista
 */

// Dimensiones del mundo
export const WORLD_WIDTH = 1400
export const WORLD_HEIGHT = 800

// Colores base del laboratorio
export const COLORS = {
  background: 0x0a0e1a,        // Azul oscuro profundo
  floor: 0x0f1428,             // Piso ligeramente más claro
  floorGrid: 0x1a2340,         // Líneas del grid
  wall: 0x151a35,              // Paredes
  wallAccent: 0x2a3560,        // Acentos de pared
  platform: 0x1e2545,          // Plataformas de robots
  platformGlow: 0x3b4a7a,      // Borde brillante de plataformas
  conveyor: 0x253050,          // Cintas transportadoras
  conveyorLine: 0x4a5a8a,      // Líneas móviles de cintas
  hologram: 0x3b82f6,          // Color de hologramas
  hologramAlpha: 0.3,
}

// Configuración de robots
export const ROBOT_CONFIG = {
  bodyWidth: 50,
  bodyHeight: 60,
  headRadius: 22,
  wheelWidth: 40,
  wheelHeight: 15,
  armWidth: 8,
  armLength: 25,
  antennaLength: 15,
  antennaRadius: 4,
  eyeRadius: 5,
  scale: {
    idle: 1,
    hover: 1.1,
    celebrate: 1.2,
  },
  walkSpeed: 120,              // Pixeles por segundo
  acceleration: 300,           // Pixeles/segundo²
  rotationSpeed: 3,            // Radianes por segundo
}

// Configuración de animaciones
export const ANIMATION_CONFIG = {
  blinkInterval: [2, 5],       // Segundos entre parpadeos
  blinkDuration: 0.15,         // Duración del parpadeo
  hoverAmplitude: 2,           // Pixeles de flotación
  hoverFrequency: 1.5,         // Frecuencia de flotación (Hz)
  antennaBlinkInterval: [0.5, 2],
  wheelRotationSpeed: 5,       // Radianes por segundo al mover
  armWaveSpeed: 4,             // Radianes por segundo al saludar
  celebrationDuration: 1.5,    // Segundos de celebración
}

// Expresiones faciales
export const EXPRESSIONS = {
  idle: {
    eyes: 'normal',            // • •
    mouth: 'neutral',          // —
    eyebrows: 'neutral',
  },
  running: {
    eyes: 'focused',           // ⊙ ⊙
    mouth: 'concentrated',     // línea recta tensa
    eyebrows: 'down',
  },
  thinking: {
    eyes: 'up',                // ↑ ↑
    mouth: 'small-o',          // ○ pequeño
    eyebrows: 'up',
  },
  happy: {
    eyes: 'happy',             // ⌒ ⌒
    mouth: 'smile',            // ⌣
    eyebrows: 'up',
  },
  sad: {
    eyes: 'sad',               // ╥ ╥
    mouth: 'frown',            // ⌢
    eyebrows: 'down-inner',
  },
  surprised: {
    eyes: 'wide',              // ○ ○
    mouth: 'o',                // ○ grande
    eyebrows: 'up-high',
  },
  failed: {
    eyes: 'x',                 // × ×
    mouth: 'wave',             // línea ondulada
    eyebrows: 'down',
  },
}

// Posiciones de las estaciones de robots (4 columnas x 4 filas + coordinador)
export const STATION_POSITIONS = [
  // Fila 1 - Procesamiento inicial
  { agentId: 'hl-profile-agent', x: 150, y: 120 },
  { agentId: 'hl-intent-agent', x: 350, y: 120 },
  { agentId: 'hl-structure-agent', x: 550, y: 120 },
  { agentId: 'hl-explanation-agent', x: 750, y: 120 },
  
  // Fila 2 - Creación de contenido
  { agentId: 'hl-exercise-agent', x: 150, y: 260 },
  { agentId: 'hl-quiz-agent', x: 350, y: 260 },
  { agentId: 'hl-challenge-agent', x: 550, y: 260 },
  { agentId: 'hl-code-agent', x: 750, y: 260 },
  
  // Fila 3 - Visuales
  { agentId: 'hl-svg-agent', x: 150, y: 400 },
  { agentId: 'hl-gif-agent', x: 350, y: 400 },
  { agentId: 'hl-infographic-agent', x: 550, y: 400 },
  { agentId: 'hl-image-agent', x: 750, y: 400 },
  
  // Fila 4 - Evaluación y feedback
  { agentId: 'hl-gamification-agent', x: 150, y: 540 },
  { agentId: 'hl-evaluation-agent', x: 350, y: 540 },
  { agentId: 'hl-feedback-agent', x: 550, y: 540 },
  { agentId: 'hl-audio-agent', x: 750, y: 540 },
]

// Posición del coordinador (centro inferior, plataforma elevada)
export const COORDINATOR_POSITION = {
  x: WORLD_WIDTH / 2,
  y: 680,
  platformRadius: 100,
}

// Colores por agente (mantener consistencia)
export const AGENT_COLORS: Record<string, number> = {
  'hl-profile-agent': 0x3b82f6,
  'hl-intent-agent': 0x8b5cf6,
  'hl-structure-agent': 0x06b6d4,
  'hl-explanation-agent': 0x10b981,
  'hl-exercise-agent': 0xf59e0b,
  'hl-quiz-agent': 0xec4899,
  'hl-challenge-agent': 0xef4444,
  'hl-code-agent': 0x6366f1,
  'hl-svg-agent': 0x14b8a6,
  'hl-gif-agent': 0xf97316,
  'hl-infographic-agent': 0xa855f7,
  'hl-image-agent': 0xe879f9,
  'hl-gamification-agent': 0xfbbf24,
  'hl-evaluation-agent': 0x22c55e,
  'hl-feedback-agent': 0x38bdf8,
  'hl-audio-agent': 0x22c55e,
  'hl-coordinator-agent': 0xfbbf24,
}

// Labels e íconos para cada agente (con nombres amigables para niños)
export const AGENT_LABELS: Record<string, { label: string; emoji: string; role: string; nickname: string }> = {
  'hl-profile-agent': { label: 'Perfil', emoji: '👤', role: 'Analista', nickname: 'Detective' },
  'hl-intent-agent': { label: 'Intención', emoji: '🎯', role: 'Estratega', nickname: 'Blanco' },
  'hl-structure-agent': { label: 'Estructura', emoji: '🗺️', role: 'Arquitecto', nickname: 'Mapa' },
  'hl-explanation-agent': { label: 'Explicación', emoji: '📖', role: 'Profesor', nickname: 'Libri' },
  'hl-exercise-agent': { label: 'Ejercicios', emoji: '✏️', role: 'Tutor', nickname: 'Lápiz' },
  'hl-quiz-agent': { label: 'Quiz', emoji: '❓', role: 'Examinador', nickname: 'Preguntón' },
  'hl-challenge-agent': { label: 'Reto', emoji: '⚡', role: 'Desafiador', nickname: 'Rayo' },
  'hl-code-agent': { label: 'Código', emoji: '💻', role: 'Programador', nickname: 'Chispa' },
  'hl-svg-agent': { label: 'Diagrama', emoji: '📊', role: 'Diseñador', nickname: 'Dibujín' },
  'hl-gif-agent': { label: 'Animación', emoji: '🎞️', role: 'Animador', nickname: 'Movie' },
  'hl-infographic-agent': { label: 'Infografía', emoji: '📈', role: 'Visualizador', nickname: 'Datos' },
  'hl-image-agent': { label: 'Imagen', emoji: '🖼️', role: 'Artista', nickname: 'Pincel' },
  'hl-gamification-agent': { label: 'Gamificación', emoji: '🏆', role: 'Motivador', nickname: 'Trofeo' },
  'hl-evaluation-agent': { label: 'Evaluación', emoji: '📝', role: 'Evaluador', nickname: 'Examen' },
  'hl-feedback-agent': { label: 'Feedback', emoji: '🧠', role: 'Consejero', nickname: 'Sabio' },
  'hl-audio-agent': { label: 'Audio', emoji: '🔊', role: 'Narrador', nickname: 'Eco' },
  'hl-coordinator-agent': { label: 'Coordinador', emoji: '🔍', role: 'Director', nickname: 'Jefe' },
}

// Estados del agente
export type AgentStatus = 'idle' | 'running' | 'thinking' | 'tool_call' | 'completed' | 'failed'

// Textos de estado para burbujas de diálogo (con frases divertidas para niños)
export const AGENT_SPEECH: Record<string, Record<string, string[]>> = {
  'hl-profile-agent': { 
    running: ['🔍 Investigando...', '¡Datos detectados!', '👤 Analizando perfil...'], 
    completed: ['¡Perfil listo! ✓', '¡Datos actualizados!'],
    thinking: ['¿Qué sabe el alumno?...'],
    greet: ['¡Hola! Soy Detective 👋', '¡Listo para investigar!'],
    celebrate: ['¡Misión cumplida! 🎉', '¡Excelente trabajo!'],
  },
  'hl-intent-agent': { 
    running: ['🎯 Apuntando...', '¡Objetivo localizado!', 'Buscando patrón...'],
    completed: ['¡Objetivo claro! ✓', '¡Blanco en la diana! 🎯'],
    thinking: ['¿Qué quiere aprender?...'],
    greet: ['¡Soy Blanco! 🎯', '¡Vamos al grano!'],
    celebrate: ['¡Diana perfecta!', '¡Objetivo logrado! 🎉'],
  },
  'hl-structure-agent': { 
    running: ['🗺️ Dibujando mapa...', '¡Creando ruta!', 'Organizando camino...'],
    completed: ['¡Mapa listo! ✓', '¡Ruta trazada! 🗺️'],
    thinking: ['¿Cuál es el mejor camino?...'],
    greet: ['¡Soy Mapa! 🗺️', '¡Te mostraré el camino!'],
    celebrate: ['¡Ruta completada!', '¡Camino exitoso! 🎉'],
  },
  'hl-explanation-agent': { 
    running: ['📖 Explicando...', '¡Enseñando!', 'Buscando ejemplos...'],
    completed: ['¡Explicación lista! ✓', '¡Teoría clara! 📚'],
    thinking: ['¿Cómo hacerlo simple?...'],
    greet: ['¡Soy Libri! 📖', '¡Me encanta enseñar!'],
    celebrate: ['¡Aprendizaje completado!', '¡Excelente explicación! 🎉'],
  },
  'hl-exercise-agent': { 
    running: ['✏️ Creando ejercicio...', '¡Práctica lista!', 'Preparando actividad...'],
    completed: ['¡Ejercicio listo! ✓', '¡A practicar! ✏️'],
    thinking: ['¿Qué tan difícil?...'],
    greet: ['¡Soy Lápiz! ✏️', '¡Vamos a practicar!'],
    celebrate: ['¡Práctica completada!', '¡Muy bien hecho! 🎉'],
  },
  'hl-quiz-agent': { 
    running: ['❓ Formulando preguntas...', '¡Quiz time!', 'Evaluando conocimiento...'],
    completed: ['¡Quiz listo! ✓', '¡Preguntas creadas! ❓'],
    thinking: ['¿Qué preguntar?...'],
    greet: ['¡Soy Preguntón! ❓', '¡Me encantan las preguntas!'],
    celebrate: ['¡Todas correctas!', '¡Excelente quiz! 🎉'],
  },
  'hl-challenge-agent': { 
    running: ['⚡ Diseñando reto...', '¡Desafío épico!', 'Creando misión...'],
    completed: ['¡Reto listo! ✓', '¡Desafío creado! ⚡'],
    thinking: ['¿Qué tan retador?...'],
    greet: ['¡Soy Rayo! ⚡', '¡Prepárate para el reto!'],
    celebrate: ['¡Reto superado!', '¡Eres increíble! 🎉'],
  },
  'hl-code-agent': { 
    running: ['💻 Programando...', '¡Código fluye!', 'Escribiendo líneas...'],
    completed: ['¡Código listo! ✓', '¡Compile exitoso! 💻'],
    thinking: ['¿Cuál es la mejor solución?...'],
    greet: ['¡Soy Chispa! ⚡', '¡Vamos a codificar!'],
    celebrate: ['¡Código perfecto!', '¡Bug eliminado! 🎉'],
  },
  'hl-svg-agent': { 
    running: ['📊 Dibujando...', '¡Creando gráfico!', 'Visualizando...'],
    completed: ['¡Diagrama listo! ✓', '¡Visual creado! 📊'],
    thinking: ['¿Cómo representarlo?...'],
    greet: ['¡Soy Dibujín! 🎨', '¡Me encanta dibujar!'],
    celebrate: ['¡Arte terminado!', '¡Dibujo perfecto! 🎉'],
  },
  'hl-gif-agent': { 
    running: ['🎞️ Animando...', '¡Creando frames!', 'Dando movimiento...'],
    completed: ['¡Animación lista! ✓', '¡Frames generados! 🎞️'],
    thinking: ['¿Cómo animarlo?...'],
    greet: ['¡Soy Movie! 🎬', '¡Hora de animar!'],
    celebrate: ['¡Animación perfecta!', '¡Qué movimiento! 🎉'],
  },
  'hl-infographic-agent': { 
    running: ['📈 Organizando datos...', '¡Creando infografía!', 'Visualizando info...'],
    completed: ['¡Infografía lista! ✓', '¡Datos visualizados! 📊'],
    thinking: ['¿Qué datos mostrar?...'],
    greet: ['¡Soy Datos! 📊', '¡Los números son divertidos!'],
    celebrate: ['¡Información clara!', '¡Datos perfectos! 🎉'],
  },
  'hl-image-agent': { 
    running: ['🖼️ Generando imagen...', '¡Creando arte!', 'Pintando...'],
    completed: ['¡Imagen lista! ✓', '¡Arte generado! 🎨'],
    thinking: ['¿Qué estilo usar?...'],
    greet: ['¡Soy Pincel! 🖌️', '¡Vamos a crear arte!'],
    celebrate: ['¡Obra maestra!', '¡Qué bonito! 🎉'],
  },
  'hl-gamification-agent': { 
    running: ['🏆 Calculando XP...', '¡Diseñando logros!', 'Sumando puntos...'],
    completed: ['¡XP calculada! ✓', '¡Logros listos! 🏆'],
    thinking: ['¿Cómo premiar?...'],
    greet: ['¡Soy Trofeo! 🏆', '¡Vamos a ganar puntos!'],
    celebrate: ['¡Puntos extra!', '¡Nivel up! 🎉'],
  },
  'hl-evaluation-agent': { 
    running: ['📝 Creando evaluación...', '¡Examen time!', 'Formulando preguntas...'],
    completed: ['¡Evaluación lista! ✓', '¡Examen creado! 📝'],
    thinking: ['¿Qué evaluar?...'],
    greet: ['¡Soy Examen! 📝', '¡Demuestra lo que sabes!'],
    celebrate: ['¡Evaluación completada!', '¡Excelente nota! 🎉'],
  },
  'hl-feedback-agent': { 
    running: ['🧠 Analizando...', '¡Dando consejos!', 'Generando feedback...'],
    completed: ['¡Feedback listo! ✓', '¡Consejos dados! 💡'],
    thinking: ['¿Cómo mejorar?...'],
    greet: ['¡Soy Sabio! 🦉', '¡Tengo buenos consejos!'],
    celebrate: ['¡Feedback positivo!', '¡Sigue así! 🎉'],
  },
  'hl-audio-agent': { 
    running: ['🔊 Generando audio...', '¡Sintetizando voz!', 'Narrando...'],
    completed: ['¡Audio listo! ✓', '¡Voz generada! 🔊'],
    thinking: ['¿Qué tono usar?...'],
    greet: ['¡Soy Eco! 🔊', '¡Escucha mi voz!'],
    celebrate: ['¡Sonido perfecto!', '¡Qué melodía! 🎉'],
  },
  'hl-coordinator-agent': { 
    running: ['🔍 Coordinando...', '¡Supervisando!', 'Dirigiendo equipo...'],
    completed: ['¡Lección completa! ✓', '¡Misión cumplida! 🎉'],
    thinking: ['¿Qué agente necesita?...'],
    greet: ['¡Soy Jefe! 👔', '¡Dirijo este equipo!'],
    celebrate: ['¡Equipo excelente!', '¡Trabajo en equipo! 🎉'],
  },
}

// Frases aleatorias de idle (cuando el robot está sin hacer nada)
export const AGENT_IDLE_PHRASES: Record<string, string[]> = {
  'hl-profile-agent': ['Mirando datos... 👀', '¿Quién eres? 🤔'],
  'hl-intent-agent': ['Apuntando... 🎯', 'Busco objetivos 🎯'],
  'hl-structure-agent': ['Organizando... 📋', 'Todo en orden 📊'],
  'hl-explanation-agent': ['Leyendo... 📖', '¿Sabías que...? 💡'],
  'hl-exercise-agent': ['Dibujando... ✏️', 'Practica conmigo ✏️'],
  'hl-quiz-agent': ['¿Pregunta?... ❓', 'Test time! ❓'],
  'hl-challenge-agent': ['¿Reto?... ⚡', '¡Atrévete! 💪'],
  'hl-code-agent': ['Tecleando... ⌨️', 'Bug fix time 🐛'],
  'hl-svg-agent': ['Dibujando... 🎨', 'Líneas y más líneas 📐'],
  'hl-gif-agent': ['Animando... 🎬', 'Frame por frame 🎞️'],
  'hl-infographic-agent': ['Contando... 🔢', 'Datos son divertidos 📊'],
  'hl-image-agent': ['Pintando... 🖌️', 'Colores... 🌈'],
  'hl-gamification-agent': ['Sumando XP... ⭐', '¡Level up! 🎮'],
  'hl-evaluation-agent': ['Calificando... 📝', 'Nota perfecta? ⭐'],
  'hl-feedback-agent': ['Pensando... 🤔', 'Tengo un consejo 💡'],
  'hl-audio-agent': ['Tarareando... 🎵', 'Sonidos... 🔊'],
  'hl-coordinator-agent': ['Observando... 👀', 'Todo bajo control ✅'],
}

// Configuración de interacción
export const INTERACTION_CONFIG = {
  dragSpeed: 0.15,              // Velocidad de retorno al soltar
  dragElastic: 0.05,            // Elasticidad del drag
  clickCelebrationDuration: 1.5, // Segundos de celebración al click
  eyeFollowSpeed: 0.08,         // Velocidad de seguimiento ocular
  idlePhraseInterval: [5, 15],  // Segundos entre frases idle aleatorias
  waveDuration: 0.8,            // Segundos de saludo
  jumpForce: 150,               // Fuerza de salto al hacer click
}

// Animaciones signature por tipo de agente
export const SIGNATURE_ANIMATIONS: Record<string, {
  name: string
  description: string
  duration: number
  scale?: number
  rotation?: number
  shake?: boolean
  spin?: boolean
  bounce?: boolean
  glow?: boolean
}> = {
  'hl-code-agent': {
    name: 'Hackerman',
    description: 'Teclea rápido en el aire',
    duration: 1.5,
    shake: true,
    glow: true,
  },
  'hl-svg-agent': {
    name: 'Artista',
    description: 'Dibuja en el aire',
    duration: 1.2,
    rotation: Math.PI * 2,
    bounce: true,
  },
  'hl-gif-agent': {
    name: 'Movie Star',
    description: 'Pose de película',
    duration: 1.0,
    scale: 1.3,
    spin: true,
  },
  'hl-gamification-agent': {
    name: 'Level Up',
    description: 'Salta con confeti',
    duration: 1.5,
    bounce: true,
    glow: true,
  },
  'hl-challenge-agent': {
    name: 'Power Up',
    description: 'Carga de energía',
    duration: 1.0,
    scale: 1.2,
    shake: true,
    glow: true,
  },
  'hl-quiz-agent': {
    name: 'Thinking',
    description: 'Se rasca la cabeza',
    duration: 1.2,
    rotation: 0.3,
    bounce: true,
  },
  'hl-explanation-agent': {
    name: 'Teacher',
    description: 'Señala como profesor',
    duration: 1.0,
    scale: 1.1,
  },
  'hl-coordinator-agent': {
    name: 'Boss Mode',
    description: 'Gira con autoridad',
    duration: 2.0,
    spin: true,
    scale: 1.3,
    glow: true,
  },
}

// Configuración de partículas
export const PARTICLE_CONFIG = {
  spark: {
    color: 0xfbbf24,
    size: [2, 5],
    speed: [50, 150],
    life: [0.5, 1.5],
    count: 20,
  },
  steam: {
    color: 0x888888,
    size: [8, 15],
    speed: [20, 50],
    life: [1, 3],
    count: 10,
  },
  trail: {
    color: 0x3b82f6,         // Se ajusta por robot
    size: [3, 8],
    speed: [30, 80],
    life: [0.3, 0.8],
    count: 5,
  },
  confetti: {
    colors: [0xfbbf24, 0x3b82f6, 0x22c55e, 0xef4444, 0x8b5cf6],
    size: [5, 12],
    speed: [100, 300],
    life: [1, 2.5],
    count: 100,
  },
  energy: {
    color: 0xfbbf24,
    size: [4, 10],
    speed: [200, 400],
    life: [0.5, 1],
    count: 30,
  },
  dust: {
    color: 0x2a3560,
    size: [1, 3],
    speed: [5, 15],
    life: [5, 15],
    count: 100,
  },
}

// Configuración de sonidos
export const SOUND_CONFIG = {
  masterVolume: 0.3,
  enabled: true,
  sounds: {
    hover: { freq: 800, duration: 0.1, type: 'sine' },
    click: { freq: 600, freqEnd: 300, duration: 0.15, type: 'square' },
    delegateCharge: { freqStart: 200, freqEnd: 800, duration: 2, type: 'sawtooth' },
    delegateFire: { freq: 600, duration: 0.1, type: 'square' },
    delegateHit: { freqStart: 400, freqEnd: 100, duration: 0.5, type: 'triangle' },
    robotActivate: { freqStart: 300, freqEnd: 600, duration: 0.4, type: 'sine' },
    robotMove: { freq: 150, duration: 0.5, type: 'sawtooth' },
    robotComplete: { notes: [400, 600, 800], duration: 0.6, type: 'sine' },
    robotFail: { freqStart: 300, freqEnd: 100, duration: 0.8, type: 'sawtooth' },
    levelUp: { notes: [523, 659, 784, 1047], duration: 1, type: 'sine' },
    achievement: { notes: [523, 659, 784], duration: 0.8, type: 'sine' },
  },
}

// Configuración de gamificación
export const GAMIFICATION_CONFIG = {
  xpPerTask: 50,
  xpBonus: {
    speed: 20,                   // Completar rápido
    perfect: 30,                 // Sin errores
    streak: 10,                  // Racha
  },
  levels: [
    { level: 1, xp: 0, badge: '⭐', name: 'Novato', color: 0x888888 },
    { level: 2, xp: 100, badge: '⭐⭐', name: 'Aprendiz', color: 0x3b82f6 },
    { level: 3, xp: 300, badge: '⭐⭐⭐', name: 'Experto', color: 0xfbbf24 },
    { level: 4, xp: 600, badge: '🌟', name: 'Maestro', color: 0x8b5cf6 },
    { level: 5, xp: 1000, badge: '💎', name: 'Leyenda', color: 0x06b6d4 },
  ],
  achievements: {
    'first-task': { name: 'Primera Tarea', desc: 'Completa tu primera tarea', xp: 25 },
    'speed-demon': { name: 'Velocista', desc: 'Completa en menos de 10s', xp: 50 },
    'perfectionist': { name: 'Perfeccionista', desc: '10 tareas sin fallo', xp: 100 },
    'team-player': { name: 'Equipo', desc: '50 delegaciones recibidas', xp: 75 },
    'veteran': { name: 'Veterano', desc: '100 tareas completadas', xp: 200 },
    'expert': { name: 'Experto', desc: 'Alcanza nivel 5', xp: 500 },
  },
}

// Utilidades
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function easeOutElastic(t: number): number {
  const c4 = (2 * Math.PI) / 3
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
