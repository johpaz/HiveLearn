/**
 * LevelSpec — Contrato entre el pipeline de lecciones y el juego de plataformas.
 *
 * El juego (@hivelearn/game) consume LevelSpec; este adaptador traduce el
 * LessonProgram que genera el pipeline de 8 agentes sin modificarlo.
 * Diseño: docs/plans/2026-06-09-mario-pixijs-game-design.md
 */

import type { LessonProgram, NodoLesson, PreguntaEvaluacion } from '../types'

export type WorldTheme = 'jardin' | 'almacen' | 'criadero' | 'sala_real'

export const WORLD_THEMES: WorldTheme[] = ['jardin', 'almacen', 'criadero', 'sala_real']

/** Un concepto de la lección → un bloque '?' dentro del nivel */
export interface ConceptBlock {
  nodeId: string
  titulo: string
  /** Texto principal del concepto (explicación + ejemplo) */
  contenido: string
  /** Pregunta rápida opcional al cerrar el panel (micro-eval del nodo) */
  microEval?: {
    pregunta: string
    opciones: string[]
    indiceCorrecto: number
    pista?: string
  }
  /** XP que otorga abrir el bloque y superar su micro-eval */
  xp: number
  /** Texto a narrar con TTS (Piper) al abrir el bloque */
  ttsText: string
}

/** Pregunta de evaluación → un ataque del jefe */
export interface BossQuestion {
  pregunta: string
  opciones: string[]
  indiceCorrecto: number
}

export interface BossSpec {
  nombre: string
  /** Vidas del jefe = número de preguntas */
  preguntas: BossQuestion[]
}

export interface LevelSpec {
  lessonId: string
  sessionId: string
  titulo: string
  /** Semilla determinista para el generador de niveles (mismo nivel siempre) */
  seed: string
  theme: WorldTheme
  difficulty: 1 | 2 | 3
  concepts: ConceptBlock[]
  boss: BossSpec
}

/** Mundo del mapa: agrupa niveles (módulo = mundo, lección = nivel) */
export interface WorldSpec {
  id: string
  nombre: string
  theme: WorldTheme
  levels: LevelSpec[]
}

// ─── Adaptador ────────────────────────────────────────────────────────────────

const CONCEPTS_PER_LEVEL = 4

function nodoToConcept(nodo: NodoLesson): ConceptBlock {
  const c = nodo.contenido
  const partes: string[] = []
  if (c?.explicacion) {
    partes.push(c.explicacion.explicacion)
    if (c.explicacion.ejemploConcreto) partes.push(`Ejemplo: ${c.explicacion.ejemploConcreto}`)
  } else {
    partes.push(nodo.concepto)
  }
  const contenido = partes.join('\n\n')

  let microEval: ConceptBlock['microEval']
  const me = c?.microEval
  if (me && me.opciones && me.opciones.length > 0) {
    const idx = me.opciones.indexOf(me.respuestaCorrecta)
    microEval = {
      pregunta: me.pregunta,
      opciones: me.opciones,
      indiceCorrecto: idx >= 0 ? idx : 0,
      pista: me.pista,
    }
  } else if (c?.quiz) {
    microEval = {
      pregunta: c.quiz.pregunta,
      opciones: c.quiz.opciones,
      indiceCorrecto: c.quiz.indicesCorrecto,
    }
  }

  return {
    nodeId: nodo.id,
    titulo: nodo.titulo,
    contenido,
    microEval,
    xp: nodo.xpRecompensa,
    ttsText: c?.audio?.narration_text ?? contenido,
  }
}

function preguntaToBossQuestion(p: PreguntaEvaluacion): BossQuestion | null {
  if (p.tipo === 'multiple_choice' && p.opciones && p.opciones.length > 0) {
    return {
      pregunta: p.pregunta,
      opciones: p.opciones,
      indiceCorrecto: p.indiceCorrecto ?? 0,
    }
  }
  // respuesta_corta → se convierte en verdadero/falso con la respuesta esperada
  if (p.respuestaEsperada) {
    return {
      pregunta: `${p.pregunta}\n¿Es correcta esta respuesta? "${p.respuestaEsperada}"`,
      opciones: ['Verdadero', 'Falso'],
      indiceCorrecto: 0,
    }
  }
  return null
}

function difficultyFor(program: LessonProgram): 1 | 2 | 3 {
  switch (program.perfilAdaptacion.nivelPrevio) {
    case 'principiante': return 1
    case 'principiante_base': return 2
    case 'intermedio': return 3
    default: return 1
  }
}

/**
 * Traduce un LessonProgram del pipeline a los niveles jugables.
 * Los nodos se agrupan en niveles de hasta CONCEPTS_PER_LEVEL conceptos;
 * la evaluación global se reparte como jefe del último nivel y mini-jefes
 * (subconjunto de preguntas) en los anteriores.
 */
export function lessonToLevelSpecs(program: LessonProgram): WorldSpec {
  const nodosConcepto = program.nodos.filter(n => n.tipoPedagogico !== 'evaluation')
  const conceptos = nodosConcepto.map(nodoToConcept)
  const difficulty = difficultyFor(program)

  // Agrupar conceptos en niveles
  const grupos: ConceptBlock[][] = []
  for (let i = 0; i < conceptos.length; i += CONCEPTS_PER_LEVEL) {
    grupos.push(conceptos.slice(i, i + CONCEPTS_PER_LEVEL))
  }
  if (grupos.length === 0) grupos.push([])

  const bossQuestions = program.evaluacion.preguntas
    .map(preguntaToBossQuestion)
    .filter((q): q is BossQuestion => q !== null)

  // Repartir preguntas: cada nivel recibe una porción; el último recibe el resto
  const porNivel = Math.max(1, Math.floor(bossQuestions.length / grupos.length))
  const theme = themeForSlug(program.topicSlug ?? program.tema)

  const levels: LevelSpec[] = grupos.map((concepts, i) => {
    const esUltimo = i === grupos.length - 1
    const desde = i * porNivel
    const preguntas = esUltimo
      ? bossQuestions.slice(desde)
      : bossQuestions.slice(desde, desde + porNivel)
    return {
      lessonId: `${program.sessionId}-nivel-${i + 1}`,
      sessionId: program.sessionId,
      titulo: concepts[0]?.titulo ?? `${program.tema} ${i + 1}`,
      seed: `${program.sessionId}:${i}`,
      theme,
      difficulty,
      concepts,
      boss: {
        nombre: esUltimo ? 'Avispón Real' : 'Avispón Explorador',
        preguntas: preguntas.length > 0 ? preguntas : [FALLBACK_QUESTION],
      },
    }
  })

  return {
    id: program.sessionId,
    nombre: program.tema,
    theme,
    levels,
  }
}

const FALLBACK_QUESTION: BossQuestion = {
  pregunta: '¿Aprendiste algo nuevo en este nivel?',
  opciones: ['¡Sí!', 'Necesito repasar'],
  indiceCorrecto: 0,
}

/** Tema visual determinista a partir del slug del tema */
export function themeForSlug(slug: string): WorldTheme {
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return WORLD_THEMES[h % WORLD_THEMES.length]
}
