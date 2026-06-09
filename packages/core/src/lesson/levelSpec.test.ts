import { describe, expect, test } from 'bun:test'
import { lessonToLevelSpecs, themeForSlug, WORLD_THEMES } from './levelSpec'
import type { LessonProgram, NodoLesson } from '../types'

function nodo(id: string, overrides: Partial<NodoLesson> = {}): NodoLesson {
  return {
    id,
    tipoPedagogico: 'concept',
    tipoVisual: 'text_card',
    titulo: `Título ${id}`,
    concepto: `Concepto base ${id}`,
    nivel: 'principiante',
    rangoEdad: 'nino',
    posX: 0,
    posY: 0,
    estado: 'disponible',
    xpRecompensa: 15,
    ...overrides,
  }
}

function program(nodos: NodoLesson[], preguntas = 4): LessonProgram {
  return {
    sessionId: 'sess-1',
    alumnoId: 'al-1',
    tema: 'Las abejas',
    topicSlug: 'abejas',
    rangoEdad: 'nino',
    nodos,
    gamificacion: { xpRecompensa: 100, logros: [], mensajeCelebracion: '¡Bien!' },
    evaluacion: {
      preguntas: Array.from({ length: preguntas }, (_, i) => ({
        tipo: 'multiple_choice' as const,
        pregunta: `Pregunta ${i}`,
        opciones: ['a', 'b', 'c'],
        indiceCorrecto: i % 3,
      })),
    },
    perfilAdaptacion: {
      rangoEdad: 'nino',
      duracionSesion: 30,
      nodosRecomendados: nodos.length,
      estilo: 'balanceado',
      nivelPrevio: 'principiante',
      tono: 'amigable',
    },
  }
}

describe('lessonToLevelSpecs', () => {
  test('agrupa nodos en niveles de hasta 4 conceptos', () => {
    const world = lessonToLevelSpecs(program([nodo('a'), nodo('b'), nodo('c'), nodo('d'), nodo('e')]))
    expect(world.levels.length).toBe(2)
    expect(world.levels[0].concepts.length).toBe(4)
    expect(world.levels[1].concepts.length).toBe(1)
  })

  test('excluye nodos de tipo evaluation de los conceptos', () => {
    const world = lessonToLevelSpecs(program([nodo('a'), nodo('ev', { tipoPedagogico: 'evaluation' })]))
    expect(world.levels[0].concepts.map(c => c.nodeId)).toEqual(['a'])
  })

  test('reparte las preguntas de evaluación entre los jefes sin perder ninguna', () => {
    const world = lessonToLevelSpecs(program(
      Array.from({ length: 8 }, (_, i) => nodo(`n${i}`)),
      5,
    ))
    const total = world.levels.reduce((sum, l) => sum + l.boss.preguntas.length, 0)
    expect(total).toBe(5)
    // el último nivel es el jefe real
    expect(world.levels.at(-1)!.boss.nombre).toBe('Avispón Real')
  })

  test('cada nivel tiene seed determinista derivada de la sesión', () => {
    const p = program([nodo('a'), nodo('b')])
    const w1 = lessonToLevelSpecs(p)
    const w2 = lessonToLevelSpecs(p)
    expect(w1.levels[0].seed).toBe(w2.levels[0].seed)
    expect(w1.levels[0].seed).toContain('sess-1')
  })

  test('usa la microEval del nodo cuando existe', () => {
    const n = nodo('a', {
      contenido: {
        microEval: {
          tipo: 'multiple_choice',
          pregunta: '¿Cuánto es 2+2?',
          opciones: ['3', '4'],
          respuestaCorrecta: '4',
          pista: 'cuenta con los dedos',
        },
      },
    })
    const world = lessonToLevelSpecs(program([n]))
    const c = world.levels[0].concepts[0]
    expect(c.microEval?.indiceCorrecto).toBe(1)
    expect(c.microEval?.pista).toBe('cuenta con los dedos')
  })

  test('dificultad según nivel previo del perfil', () => {
    const p = program([nodo('a')])
    p.perfilAdaptacion.nivelPrevio = 'intermedio'
    expect(lessonToLevelSpecs(p).levels[0].difficulty).toBe(3)
  })

  test('un programa sin preguntas usa la pregunta de respaldo', () => {
    const world = lessonToLevelSpecs(program([nodo('a')], 0))
    expect(world.levels[0].boss.preguntas.length).toBeGreaterThan(0)
  })
})

describe('themeForSlug', () => {
  test('es determinista y devuelve un tema válido', () => {
    expect(themeForSlug('abejas')).toBe(themeForSlug('abejas'))
    expect(WORLD_THEMES).toContain(themeForSlug('cualquier-cosa'))
  })
})
