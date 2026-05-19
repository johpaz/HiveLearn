import type { NodoLesson } from '../types'

export interface A2UIMessage {
  surfaceUpdate?: {
    surfaceId: string
    components: Array<{ id: string; weight?: number; component: Record<string, any> }>
  }
  dataModelUpdate?: {
    surfaceId: string
    contents: any[]
  }
  beginRendering?: {
    surfaceId: string
    root: string
    styles?: { primaryColor?: string; font?: string }
  }
}

const SURFACE_ID = 'lesson-node'

type CompDef = { id: string; weight?: number; component: Record<string, any> }

function text(id: string, value: string, hint = 'body'): CompDef {
  return { id, component: { Text: { text: { literalString: value }, usageHint: hint } } }
}

function column(id: string, children: string[], distribution?: string, alignment?: string): CompDef {
  return { id, component: { Column: { children: { explicitList: children }, distribution, alignment } } }
}

function row(id: string, children: string[], distribution?: string, wrap?: boolean): CompDef {
  return { id, component: { Row: { children: { explicitList: children }, distribution, wrap } } }
}

function card(id: string, child: string): CompDef {
  return { id, component: { Card: { child } } }
}

function button(
  id: string,
  label: string,
  actionName: string,
  context: Array<{ key: string; value: { literalString?: string; path?: string } }> = [],
  variant = 'primary',
): CompDef {
  return {
    id,
    component: {
      Button: {
        label,
        variant,
        action: { name: actionName, context },
      },
    },
  }
}

function multipleChoice(id: string, options: string[], maxSel = 1): CompDef {
  return {
    id,
    component: {
      MultipleChoice: {
        options: options.map(op => ({ label: { literalString: op }, value: { literalString: op } })),
        maxAllowedSelections: maxSel,
      },
    },
  }
}

function inferExerciseChoiceData(nodo: NodoLesson, ej: NonNullable<NodoLesson['contenido']>['ejercicio']): { options: string[]; correctIndex: number } | null {
  const sourceText = `${nodo.titulo} ${ej?.enunciado ?? ''} ${ej?.respuestaCorrecta ?? ''}`.toLowerCase()

  if (sourceText.includes('truco') && sourceText.includes('ia')) {
    return {
      options: [
        'Caminar de forma fija es el truco y perseguirte reaccionando a lo que haces es la IA',
        'Caminar de forma fija es la IA y perseguirte reaccionando a lo que haces es el truco',
        'Ambas acciones son IA',
        'Ambas acciones son trucos',
      ],
      correctIndex: 0,
    }
  }

  if (sourceText.includes('verdadero') || sourceText.includes('falso')) {
    return {
      options: ['Verdadero', 'Falso'],
      correctIndex: sourceText.includes('verdadero') ? 0 : 1,
    }
  }

  return null
}

function textField(id: string, label: string, placeholder: string, isCode = false): CompDef {
  return {
    id,
    component: {
      TextField: {
        label: { literalString: label },
        placeholder,
        textFieldType: isCode ? 'multiline_code' : 'multiline',
      },
    },
  }
}

function image(id: string, url: string, fit = 'contain'): CompDef {
  return { id, component: { Image: { url: { literalString: url }, fit } } }
}

function buildMessages(components: CompDef[]): A2UIMessage[] {
  return [
    {
      surfaceUpdate: {
        surfaceId: SURFACE_ID,
        components,
      },
    },
    {
      dataModelUpdate: {
        surfaceId: SURFACE_ID,
        contents: [],
      },
    },
    {
      beginRendering: {
        surfaceId: SURFACE_ID,
        root: 'root',
        styles: { primaryColor: '#f59e0b' },
      },
    },
  ]
}

export function nodeToA2UI(nodo: NodoLesson): A2UIMessage[] {
  const c = nodo.contenido ?? {}
  const contextBase = [
    { key: 'nodoId', value: { literalString: nodo.id } },
    { key: 'concepto', value: { literalString: nodo.concepto } },
    { key: 'tipoPedagogico', value: { literalString: nodo.tipoPedagogico } },
    { key: 'rangoEdad', value: { literalString: nodo.rangoEdad } },
  ]

  if (nodo.tipoPedagogico === 'milestone') {
    return buildMessages([
      column('root', ['icon', 'title', 'concept', 'continue'], 'center', 'center'),
      text('icon', '🏆', 'h1'),
      text('title', nodo.titulo, 'h2'),
      text('concept', nodo.concepto, 'body'),
      button('continue', 'Continuar ✓', 'complete_node', contextBase, 'secondary'),
    ])
  }

  if (nodo.tipoPedagogico === 'quiz' && c.quiz) {
    return buildMessages([
      column('root', ['q-title', 'q-question', 'q-mc', 'q-submit']),
      text('q-title', nodo.titulo, 'h3'),
      text('q-question', c.quiz.pregunta ?? nodo.concepto, 'body'),
      multipleChoice('q-mc', Array.isArray(c.quiz.opciones) ? c.quiz.opciones : []),
      button('q-submit', 'Comprobar respuesta ✓', 'check_answer', [
        ...contextBase,
        { key: 'respuesta', value: { path: '/_selections/q-mc/0' } },
      ]),
    ])
  }

  if (nodo.tipoPedagogico === 'exercise' && c.ejercicio) {
    const choiceData = c.ejercicio.opciones?.length ? {
      options: c.ejercicio.opciones,
      correctIndex: typeof c.ejercicio.indiceCorrecto === 'number' ? c.ejercicio.indiceCorrecto : 0,
    } : inferExerciseChoiceData(nodo, c.ejercicio)

    if (choiceData?.options?.length) {
      return buildMessages([
        column('root', ['e-card', 'e-question', 'e-mc', 'e-submit']),
        card('e-card', 'e-card-inner'),
        column('e-card-inner', ['e-title', 'e-body', ...(c.ejercicio.pistaOpcional ? ['e-hint'] : [])]),
        text('e-title', nodo.titulo, 'h3'),
        text('e-body', c.ejercicio.enunciado, 'body'),
        ...(c.ejercicio.pistaOpcional ? [text('e-hint', `💡 ${c.ejercicio.pistaOpcional}`, 'caption')] : []),
        multipleChoice('e-mc', choiceData.options),
        button('e-submit', 'Enviar respuesta ✓', 'check_answer', [
          ...contextBase,
          { key: 'respuesta', value: { path: '/_selections/e-mc/0' } },
        ]),
      ])
    }

    return buildMessages([
      column('root', ['e-card', 'e-answer', 'e-submit']),
      card('e-card', 'e-card-inner'),
      column('e-card-inner', ['e-title', 'e-body', ...(c.ejercicio.pistaOpcional ? ['e-hint'] : [])]),
      text('e-title', nodo.titulo, 'h3'),
      text('e-body', c.ejercicio.enunciado, 'body'),
      ...(c.ejercicio.pistaOpcional ? [text('e-hint', `💡 ${c.ejercicio.pistaOpcional}`, 'caption')] : []),
      textField('e-answer', 'Tu respuesta', 'Escribe aquí...'),
      button('e-submit', 'Enviar respuesta ✓', 'check_answer', [
        ...contextBase,
        { key: 'respuesta', value: { path: '/_textValues/e-answer' } },
      ]),
    ])
  }

  if (nodo.tipoVisual === 'audio_ai' && c.audio) {
    return buildMessages([
      column('root', ['a-title', 'a-text', 'a-play', 'a-next']),
      text('a-title', c.audio.title ?? nodo.titulo, 'h3'),
      text('a-text', c.audio.narration_text, 'body'),
      button('a-play', '▶ Escuchar narración', 'play_audio', [
        { key: 'narration_text', value: { literalString: c.audio.narration_text } },
      ]),
      button('a-next', 'Continuar ✓', 'complete_node', contextBase, 'secondary'),
    ])
  }

  if (nodo.tipoVisual === 'infographic' && c.infografia?.secciones) {
    const sectionIds = c.infografia.secciones.map((_: any, i: number) => `inf-${i}`)
    const comps: CompDef[] = [
      column('root', ['inf-title', ...sectionIds, 'inf-next']),
      text('inf-title', nodo.titulo, 'h3'),
    ]
    c.infografia.secciones.forEach((sec: any, i: number) => {
      comps.push(card(`inf-${i}`, `inf-${i}-inner`))
      comps.push(row(`inf-${i}-inner`, [`inf-${i}-emoji`, `inf-${i}-content`], 'start'))
      comps.push(text(`inf-${i}-emoji`, sec.emoji ?? '✨', 'h3'))
      comps.push(column(`inf-${i}-content`, [`inf-${i}-title`, `inf-${i}-value`]))
      comps.push(text(`inf-${i}-title`, sec.titulo ?? '', 'h5'))
      comps.push(text(`inf-${i}-value`, sec.valor ?? '', 'body'))
    })
    comps.push(button('inf-next', 'Continuar ✓', 'complete_node', contextBase, 'secondary'))
    return buildMessages(comps)
  }

  if (nodo.tipoVisual === 'image_ai' && c.imagen) {
    const imageUrl = c.imagen.url
      || (typeof c.imagen.svg_fallback === 'string' && c.imagen.svg_fallback.trim()
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.imagen.svg_fallback)}`
        : '')

    const components: CompDef[] = [
      column('root', ['img-title', ...(imageUrl ? ['img-asset'] : []), 'img-caption', 'img-next']),
      text('img-title', nodo.titulo, 'h3'),
      ...(imageUrl ? [image('img-asset', imageUrl)] : []),
      text('img-caption', c.imagen.caption || c.imagen.alt_text || nodo.concepto, 'body'),
      button('img-next', 'Continuar ✓', 'complete_node', contextBase, 'secondary'),
    ]

    if (c.explicacion?.explicacion) {
      components.splice(3, 0, text('img-expl', c.explicacion.explicacion, 'body'))
      const root = components[0].component.Column.children.explicitList
      root.splice(root.length - 2, 0, 'img-expl')
    }

    return buildMessages(components)
  }

  if (c.explicacion) {
    const components: CompDef[] = [
      column('root', ['exp-title', 'exp-body', ...(c.explicacion.ejemploConcreto ? ['exp-example'] : []), 'exp-next']),
      text('exp-title', c.explicacion.titulo ?? nodo.titulo, 'h3'),
      text('exp-body', c.explicacion.explicacion ?? nodo.concepto, 'body'),
      ...(c.explicacion.ejemploConcreto ? [text('exp-example', `Ejemplo: ${c.explicacion.ejemploConcreto}`, 'caption')] : []),
      button('exp-next', 'Continuar ✓', 'complete_node', contextBase, 'secondary'),
    ]
    return buildMessages(components)
  }

  return buildMessages([
    column('root', ['fallback', 'fallback-next']),
    text('fallback', nodo.concepto || 'Contenido disponible', 'body'),
    button('fallback-next', 'Continuar ✓', 'complete_node', contextBase, 'secondary'),
  ])
}
