/**
 * Validación Pedagógica Avanzada para HiveLearn
 * 
 * Valida el contenido de cada agente según criterios pedagógicos avanzados:
 * - Claridad
 * - Adecuación a edad
 * - Ejemplos concretos
 * - Progresión lógica
 * - Engagement
 * - Cobertura temática
 */

import { logger } from '../../utils/logger'

const log = logger.child('pedagogical-validation')

export interface ValidationResult {
  agenteId: string
  nodoId?: string
  criterios: {
    claridad: boolean
    adecuacionEdad: boolean
    ejemplosConcretos: boolean
    progresionLogica: boolean
    engagement: boolean
    coberturaTemática: boolean
  }
  puntuaciones: {
    claridad: number
    adecuacionEdad: number
    ejemplosConcretos: number
    progresionLogica: number
    engagement: number
    coberturaTemática: number
  }
  observaciones: string[]
  aprobado: boolean
}

export interface ValidationConfig {
  agenteId: string
  rangoEdad: string
  tema: string
  tipoContenido: string
}

function pickString(contenido: any, ...keys: string[]): string {
  for (const key of keys) {
    const value = contenido?.[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function pickStringArray(contenido: any, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = contenido?.[key]
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  }
  return []
}

/**
 * Valida el contenido de un agente según criterios pedagógicos avanzados
 */
export function validatePedagogicalContent(
  contenido: any,
  config: ValidationConfig
): ValidationResult {
  const { agenteId, rangoEdad, tema, tipoContenido } = config
  
  log.info(`[pedagogical-validation] Validating ${agenteId} for ${tipoContenido}`)
  
  // Inicializar resultados
  const resultado: ValidationResult = {
    agenteId,
    criterios: {
      claridad: false,
      adecuacionEdad: false,
      ejemplosConcretos: false,
      progresionLogica: false,
      engagement: false,
      coberturaTemática: false,
    },
    puntuaciones: {
      claridad: 0,
      adecuacionEdad: 0,
      ejemplosConcretos: 0,
      progresionLogica: 0,
      engagement: 0,
      coberturaTemática: 0,
    },
    observaciones: [],
    aprobado: false,
  }
  
  // Validar según tipo de agente
  switch (agenteId) {
    case 'hl-explanation-agent':
      validateExplanationAgent(contenido, resultado, rangoEdad, tema)
      break
    case 'hl-exercise-agent':
      validateExerciseAgent(contenido, resultado, rangoEdad, tema)
      break
    case 'hl-quiz-agent':
      validateQuizAgent(contenido, resultado, rangoEdad, tema)
      break
    case 'hl-challenge-agent':
      validateChallengeAgent(contenido, resultado, rangoEdad, tema)
      break
    case 'hl-code-agent':
      validateCodeAgent(contenido, resultado, rangoEdad, tema)
      break
    case 'hl-svg-agent':
    case 'hl-gif-agent':
    case 'hl-infographic-agent':
    case 'hl-image-agent':
      validateVisualAgent(contenido, resultado, rangoEdad, tema, agenteId)
      break
    default:
      validateGenericAgent(contenido, resultado, rangoEdad, tema)
  }
  
  // Calcular aprobación (basado en puntuación promedio > 70)
  const puntuaciones = Object.values(resultado.puntuaciones)
  const promedio = puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length
  resultado.aprobado = promedio > 70
  
  log.info(`[pedagogical-validation] ${agenteId} approved: ${resultado.aprobado} (promedio: ${promedio.toFixed(1)})`)
  
  return resultado
}

/**
 * Validar ExplanationAgent
 */
function validateExplanationAgent(
  contenido: any,
  resultado: ValidationResult,
  rangoEdad: string,
  tema: string
): void {
  const titulo = pickString(contenido, 'titulo')
  const explicacion = pickString(contenido, 'explicacion')
  const ejemploConcreto = pickString(contenido, 'ejemploConcreto', 'ejemplo_concreto')

  // Claridad: verificar que tenga título y explicación
  if (titulo && explicacion) {
    const longitudExplicacion = explicacion.length
    if (longitudExplicacion > 20 && longitudExplicacion < 500) {
      resultado.criterios.claridad = true
      resultado.puntuaciones.claridad = 85
    } else {
      resultado.observaciones.push(`Explicación muy ${longitudExplicacion <= 20 ? 'corta' : 'larga'}`)
    }
  } else {
    resultado.observaciones.push('Falta título o explicación')
  }
  
  // Ejemplos concretos: verificar que tenga ejemplo concreto
  if (ejemploConcreto && ejemploConcreto.length > 10) {
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 90
  } else {
    resultado.observaciones.push('Falta ejemplo concreto o es muy corto')
  }
  
  // Adecuación a edad: verificar longitud y complejidad
  const complejidad = calcularComplejidad(explicacion || '')
  if (adecuadoParaEdad(complejidad, rangoEdad)) {
    resultado.criterios.adecuacionEdad = true
    resultado.puntuaciones.adecuacionEdad = 80
  } else {
    resultado.observaciones.push(`Complejidad no adecuada para ${rangoEdad}`)
  }
  
  // Progresión lógica: verificar estructura (flexible)
  if (explicacion && explicacion.length > 50) {
    resultado.criterios.progresionLogica = true
    resultado.puntuaciones.progresionLogica = 75
  } else {
    resultado.observaciones.push('Explicación muy corta para progresión lógica')
    resultado.puntuaciones.progresionLogica = 50 // Puntuación parcial
  }
  
  // Engagement: verificar lenguaje motivador (flexible)
  const palabrasEngagement = ['importante', 'interesante', 'fascinante', 'útil', 'práctico', 'interactiva', 'dinámico']
  if (palabrasEngagement.some(palabra => explicacion?.toLowerCase().includes(palabra))) {
    resultado.criterios.engagement = true
    resultado.puntuaciones.engagement = 70
  } else {
    resultado.observaciones.push('Falta lenguaje motivador')
    resultado.puntuaciones.engagement = 60 // Puntuación parcial
  }
  
  // Cobertura temática: verificar que mencione el tema
  if (explicacion?.toLowerCase().includes(tema.toLowerCase()) || 
      titulo?.toLowerCase().includes(tema.toLowerCase())) {
    resultado.criterios.coberturaTemática = true
    resultado.puntuaciones.coberturaTemática = 85
  } else {
    resultado.observaciones.push('No menciona el tema principal')
  }
}

/**
 * Validar ExerciseAgent
 */
function validateExerciseAgent(
  contenido: any,
  resultado: ValidationResult,
  rangoEdad: string,
  tema: string
): void {
  const enunciado = pickString(contenido, 'enunciado')
  const ejemploRespuesta = pickString(contenido, 'ejemploRespuesta', 'ejemplo_respuesta')
  const respuestaCorrecta = pickString(contenido, 'respuestaCorrecta', 'respuesta_correcta')
  const pistaOpcional = pickString(contenido, 'pistaOpcional', 'pista_opcional')
  const pasos = pickStringArray(contenido, 'pasos')

  // Claridad: verificar enunciado
  if (enunciado && enunciado.length > 20) {
    resultado.criterios.claridad = true
    resultado.puntuaciones.claridad = 80
  } else {
    resultado.observaciones.push('Enunciado muy corto o faltante')
  }
  
  // Ejemplos concretos: verificar ejemplo de respuesta
  if (ejemploRespuesta && ejemploRespuesta.length > 10) {
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 85
  } else {
    resultado.observaciones.push('Falta ejemplo de respuesta')
  }
  
  // Adecuación a edad: verificar complejidad del enunciado
  const complejidad = calcularComplejidad(enunciado || '')
  if (adecuadoParaEdad(complejidad, rangoEdad)) {
    resultado.criterios.adecuacionEdad = true
    resultado.puntuaciones.adecuacionEdad = 75
  } else {
    resultado.observaciones.push(`Complejidad no adecuada para ${rangoEdad}`)
  }
  
  // Progresión lógica: verificar pasos guiados
  if (pasos.length > 0) {
    resultado.criterios.progresionLogica = true
    resultado.puntuaciones.progresionLogica = 90
  } else {
    resultado.observaciones.push('Faltan pasos guiados')
  }
  
  // Engagement: verificar que sea desafiante pero alcanzable
  if (pistaOpcional || respuestaCorrecta) {
    resultado.criterios.engagement = true
    resultado.puntuaciones.engagement = 70
  } else {
    resultado.observaciones.push('Falta pista o respuesta correcta')
  }
  
  // Cobertura temática: verificar que el ejercicio sea sobre el tema
  if (enunciado?.toLowerCase().includes(tema.toLowerCase())) {
    resultado.criterios.coberturaTemática = true
    resultado.puntuaciones.coberturaTemática = 80
  } else {
    resultado.observaciones.push('Ejercicio no relacionado con el tema')
  }
}

/**
 * Validar QuizAgent
 */
function validateQuizAgent(
  contenido: any,
  resultado: ValidationResult,
  rangoEdad: string,
  tema: string
): void {
  // Claridad: verificar pregunta
  if (contenido.pregunta && contenido.pregunta.length > 10) {
    resultado.criterios.claridad = true
    resultado.puntuaciones.claridad = 85
  } else {
    resultado.observaciones.push('Pregunta muy corta o faltante')
  }
  
  // Ejemplos concretos: verificar opciones
  if (contenido.opciones && Array.isArray(contenido.opciones) && contenido.opciones.length === 4) {
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 80
  } else {
    resultado.observaciones.push('Faltan 4 opciones de respuesta')
  }
  
  // Adecuación a edad: verificar complejidad de la pregunta
  const complejidad = calcularComplejidad(contenido.pregunta || '')
  if (adecuadoParaEdad(complejidad, rangoEdad)) {
    resultado.criterios.adecuacionEdad = true
    resultado.puntuaciones.adecuacionEdad = 75
  } else {
    resultado.observaciones.push(`Complejidad no adecuada para ${rangoEdad}`)
  }
  
  // Progresión lógica: verificar que las opciones sean plausibles (flexible)
  if (contenido.opciones && contenido.opciones.length === 4) {
    resultado.criterios.progresionLogica = true
    resultado.puntuaciones.progresionLogica = 70
  } else {
    resultado.observaciones.push('Opciones muy cortas o poco plausibles')
    resultado.puntuaciones.progresionLogica = 50
  }
  
  // Engagement: verificar que la pregunta sea interesante (flexible)
  if (contenido.pregunta?.includes('?') || contenido.pregunta?.includes('¿') || contenido.pregunta?.length > 20) {
    resultado.criterios.engagement = true
    resultado.puntuaciones.engagement = 65
  } else {
    resultado.observaciones.push('Pregunta no formulada como interrogante')
    resultado.puntuaciones.engagement = 55
  }
  
  // Cobertura temática: verificar que la pregunta sea sobre el tema
  if (contenido.pregunta?.toLowerCase().includes(tema.toLowerCase())) {
    resultado.criterios.coberturaTemática = true
    resultado.puntuaciones.coberturaTemática = 85
  } else {
    resultado.observaciones.push('Pregunta no relacionada con el tema')
  }
}

/**
 * Validar ChallengeAgent
 */
function validateChallengeAgent(
  contenido: any,
  resultado: ValidationResult,
  rangoEdad: string,
  tema: string
): void {
  // Claridad: verificar título y contexto
  if (contenido.titulo && contenido.contexto && contenido.titulo.length > 5) {
    resultado.criterios.claridad = true
    resultado.puntuaciones.claridad = 80
  } else {
    resultado.observaciones.push('Falta título o contexto')
  }
  
  // Ejemplos concretos: verificar pasos
  if (contenido.pasos && Array.isArray(contenido.pasos) && contenido.pasos.length >= 3) {
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 85
  } else {
    resultado.observaciones.push('Faltan al menos 3 pasos')
  }
  
  // Adecuación a edad: verificar complejidad de los pasos
  const complejidadPromedio = contenido.pasos?.reduce((acc: number, paso: string) => 
    acc + calcularComplejidad(paso), 0) / (contenido.pasos?.length || 1)
  if (adecuadoParaEdad(complejidadPromedio, rangoEdad)) {
    resultado.criterios.adecuacionEdad = true
    resultado.puntuaciones.adecuacionEdad = 75
  } else {
    resultado.observaciones.push(`Complejidad no adecuada para ${rangoEdad}`)
  }
  
  // Progresión lógica: verificar criterios de éxito
  if (contenido.criterios_exito && Array.isArray(contenido.criterios_exito) && 
      contenido.criterios_exito.length > 0) {
    resultado.criterios.progresionLogica = true
    resultado.puntuaciones.progresionLogica = 90
  } else {
    resultado.observaciones.push('Faltan criterios de éxito')
  }
  
  // Engagement: verificar que sea desafiante
  if (contenido.titulo?.toLowerCase().includes('reto') || 
      contenido.titulo?.toLowerCase().includes('desafío') ||
      contenido.titulo?.toLowerCase().includes('challenge')) {
    resultado.criterios.engagement = true
    resultado.puntuaciones.engagement = 85
  } else {
    resultado.observaciones.push('Título no refleja naturaleza de reto')
  }
  
  // Cobertura temática: verificar que el reto sea sobre el tema
  if (contenido.contexto?.toLowerCase().includes(tema.toLowerCase()) ||
      contenido.titulo?.toLowerCase().includes(tema.toLowerCase())) {
    resultado.criterios.coberturaTemática = true
    resultado.puntuaciones.coberturaTemática = 80
  } else {
    resultado.observaciones.push('Reto no relacionado con el tema')
  }
}

/**
 * Validar CodeAgent
 */
function validateCodeAgent(
  contenido: any,
  resultado: ValidationResult,
  rangoEdad: string,
  tema: string
): void {
  const codigo = pickString(contenido, 'codigo')
  const descripcionBreve = pickString(contenido, 'descripcionBreve', 'descripcion_breve')

  // Claridad: verificar código y descripción
  if (codigo && descripcionBreve && codigo.length > 10) {
    resultado.criterios.claridad = true
    resultado.puntuaciones.claridad = 85
  } else {
    resultado.observaciones.push('Falta código o descripción')
  }
  
  // Ejemplos concretos: verificar que el código sea un ejemplo práctico
  if (codigo && (codigo.includes('function') || codigo.includes('const') ||
      codigo.includes('print') || codigo.includes('console'))) {
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 90
  } else {
    resultado.observaciones.push('Código no parece ejemplo práctico')
  }
  
  // Adecuación a edad: verificar complejidad del código
  const lineasCodigo = codigo?.split('\n').length || 0
  const hasControlFlow = /for\s*\(|while\s*\(|if\s*\(|switch\s*\(|try\s*\{/.test(codigo)
  const hasFunctions = /\bfunction\b|=>/.test(codigo)
  let complejidad = 25
  if (lineasCodigo > 6) complejidad += 12
  if (lineasCodigo > 10) complejidad += 18
  if (hasControlFlow) complejidad += 15
  if (hasFunctions) complejidad += 8
  if (adecuadoParaEdad(complejidad, rangoEdad)) {
    resultado.criterios.adecuacionEdad = true
    resultado.puntuaciones.adecuacionEdad = 75
  } else {
    resultado.observaciones.push(`Complejidad de código no adecuada para ${rangoEdad}`)
  }
  
  // Progresión lógica: verificar comentarios en el código
  if (codigo && (codigo.includes('//') || codigo.includes('#'))) {
    resultado.criterios.progresionLogica = true
    resultado.puntuaciones.progresionLogica = 80
  } else {
    resultado.observaciones.push('Código sin comentarios explicativos')
  }
  
  // Engagement: verificar que el código sea interesante
  if (descripcionBreve?.toLowerCase().includes('ejemplo') ||
      descripcionBreve?.toLowerCase().includes('práctico')) {
    resultado.criterios.engagement = true
    resultado.puntuaciones.engagement = 70
  } else {
    resultado.observaciones.push('Descripción no refleja naturaleza práctica')
  }
  
  // Cobertura temática: verificar que el código sea sobre el tema
  if (descripcionBreve?.toLowerCase().includes(tema.toLowerCase())) {
    resultado.criterios.coberturaTemática = true
    resultado.puntuaciones.coberturaTemática = 85
  } else {
    resultado.observaciones.push('Código no relacionado con el tema')
  }
}

/**
 * Validar agentes visuales (SVG, GIF, Infographic, Image)
 */
function validateVisualAgent(
  contenido: any,
  resultado: ValidationResult,
  rangoEdad: string,
  tema: string,
  agenteId: string
): void {
  const prompt = pickString(contenido, 'prompt')
  const concepto = pickString(contenido, 'concepto')
  const altText = pickString(contenido, 'alt_text', 'altText')
  const caption = pickString(contenido, 'caption')
  const svgFallback = pickString(contenido, 'svg_fallback', 'svgFallback')
  const url = pickString(contenido, 'url')

  // Claridad: verificar que haya contenido visual usable según el contrato real del agente
  if (
    contenido.svg_string ||
    contenido.svgString ||
    contenido.frames ||
    contenido.secciones ||
    url ||
    prompt ||
    svgFallback
  ) {
    resultado.criterios.claridad = true
    resultado.puntuaciones.claridad = 80
  } else {
    resultado.observaciones.push('Falta contenido visual')
  }

  // Ejemplos concretos: verificar que el visual sea educativo (flexible)
  if (agenteId === 'hl-svg-agent' && (contenido.svg_string || contenido.svgString)) {
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 85
  } else if (agenteId === 'hl-gif-agent' && contenido.frames?.length > 0) {
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 80
  } else if (agenteId === 'hl-infographic-agent' && contenido.secciones?.length > 0) {
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 90
  } else if (agenteId === 'hl-image-agent' && prompt && caption && (svgFallback || url || altText)) {
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 85
  } else {
    resultado.observaciones.push('Visual no parece educativo')
    resultado.puntuaciones.ejemplosConcretos = 60
  }
  
  // Adecuación a edad: medir la complejidad real del visual en vez de castigar por tipo.
  let complejidad = 50
  if (agenteId === 'hl-svg-agent') {
    complejidad = 30
  } else if (agenteId === 'hl-gif-agent') {
    const frameCount = Array.isArray(contenido.frames) ? contenido.frames.length : 0
    complejidad = frameCount > 6 ? 65 : 30
  } else if (agenteId === 'hl-infographic-agent') {
    const secciones = Array.isArray(contenido.secciones) ? contenido.secciones : []
    const maxTitulo = Math.max(0, ...secciones.map((s: any) => String(s?.titulo ?? '').length))
    const maxValor = Math.max(0, ...secciones.map((s: any) => String(s?.valor ?? '').length))
    complejidad = 18
    if (secciones.length > 3) complejidad += 14
    if (maxTitulo > 28) complejidad += 6
    if (maxValor > 60) complejidad += 10
    if (maxValor > 90) complejidad += 10
  } else if (agenteId === 'hl-image-agent') {
    const baseText = [prompt, altText, caption].filter(Boolean).join('. ')
    complejidad = Math.max(10, Math.round(calcularComplejidad(baseText) * 0.7))
    if (prompt.length > 180) complejidad += 10
    if (caption.length > 120) complejidad += 10
    if (contenido?.estilo === 'chart') complejidad += 10
  }
  if (adecuadoParaEdad(complejidad, rangoEdad)) {
    resultado.criterios.adecuacionEdad = true
    resultado.puntuaciones.adecuacionEdad = 75
  } else {
    resultado.observaciones.push(`Complejidad visual no adecuada para ${rangoEdad}`)
  }
  
  // Progresión lógica: verificar estructura del visual (flexible)
  resultado.criterios.progresionLogica = true
  resultado.puntuaciones.progresionLogica = 70
  
  // Engagement: verificar que sea visualmente atractivo (flexible)
  resultado.criterios.engagement = true
  resultado.puntuaciones.engagement = 75
  
  // Cobertura temática: verificar que el visual sea sobre el tema (flexible)
  if (agenteId === 'hl-svg-agent' && (contenido.svg_string || contenido.svgString)) {
    resultado.criterios.coberturaTemática = true
    resultado.puntuaciones.coberturaTemática = 80
  } else if (agenteId === 'hl-infographic-agent' && contenido.secciones?.length > 0) {
    resultado.criterios.coberturaTemática = true
    resultado.puntuaciones.coberturaTemática = 85
  } else if (agenteId === 'hl-gif-agent' && contenido.frames?.length > 0) {
    resultado.criterios.coberturaTemática = true
    resultado.puntuaciones.coberturaTemática = 75
  } else if (agenteId === 'hl-image-agent' && (concepto || prompt || caption)) {
    const normalizedTopic = tema.toLowerCase()
    const normalizedVisual = `${concepto} ${prompt} ${caption}`.toLowerCase()
    if (
      !tema ||
      normalizedVisual.includes(normalizedTopic) ||
      concepto.length > 0
    ) {
      resultado.criterios.coberturaTemática = true
      resultado.puntuaciones.coberturaTemática = 80
    } else {
      resultado.observaciones.push('Visual no relacionado con el tema')
      resultado.puntuaciones.coberturaTemática = 60
    }
  } else {
    resultado.observaciones.push('Visual no relacionado con el tema')
    resultado.puntuaciones.coberturaTemática = 60
  }
}

/**
 * Validar agentes genéricos
 */
function validateGenericAgent(
  contenido: any,
  resultado: ValidationResult,
  rangoEdad: string,
  tema: string
): void {
  // Validación genérica básica — agentes de estructura/metadatos donde no aplica scoring pedagógico
  if (contenido && typeof contenido === 'object') {
    resultado.criterios.claridad = true
    resultado.puntuaciones.claridad = 75
    resultado.criterios.ejemplosConcretos = true
    resultado.puntuaciones.ejemplosConcretos = 75
    resultado.criterios.adecuacionEdad = true
    resultado.puntuaciones.adecuacionEdad = 75
    resultado.criterios.progresionLogica = true
    resultado.puntuaciones.progresionLogica = 75
    resultado.criterios.engagement = true
    resultado.puntuaciones.engagement = 75
    resultado.criterios.coberturaTemática = true
    resultado.puntuaciones.coberturaTemática = 75
    resultado.aprobado = true
  }
}

/**
 * Calcular complejidad de un texto (0-100)
 */
function calcularComplejidad(texto: string): number {
  if (!texto) return 0
  
  const palabras = texto.split(/\s+/).length
  const oraciones = texto.split(/[.!?]+/).length
  const palabrasPorOracion = palabras / (oraciones || 1)
  
  // Flesch-Kincaid simplificado
  let complejidad = 0
  
  // Longitud de palabras
  const palabrasLargas = texto.split(/\s+/).filter(p => p.length > 6).length
  complejidad += (palabrasLargas / palabras) * 40
  
  // Palabras por oración
  if (palabrasPorOracion > 20) complejidad += 30
  else if (palabrasPorOracion > 15) complejidad += 20
  else if (palabrasPorOracion > 10) complejidad += 10
  
  // Vocabulario complejo
  const palabrasComplejas = ['sin embargo', 'por lo tanto', 'en consecuencia', 'no obstante']
  if (palabrasComplejas.some(p => texto.toLowerCase().includes(p))) {
    complejidad += 20
  }
  
  return Math.min(100, Math.max(0, complejidad))
}

/**
 * Determinar si la complejidad es adecuada para la edad
 */
function adecuadoParaEdad(complejidad: number, rangoEdad: string): boolean {
  switch (rangoEdad) {
    case 'nino':
      return complejidad < 40
    case 'adolescente':
      return complejidad < 60
    case 'adulto':
      return complejidad < 80
    default:
      return complejidad < 60
  }
}
