import type { Account } from './accounts'
import type { A2UIMessage, Action, Component } from './a2ui-protocol'
import { CURRICULUM_NODES } from './curriculum'
import { teachingMaterial } from './curriculum-content'
import { INTERESTS, LEARNING_MODES, type JourneyState } from './journey'
import { QUESTION_BANK } from './learning'

export const CATALOG = 'https://github.com/google/A2UI/blob/main/specification/0.8/json/standard_catalog_definition.json'
export const text = (id: string, path: string, usageHint?: string) => ({ id, component: { Text: { text: { path }, usageHint } } as Component })
export const button = (id: string, label: string, action: string, context: NonNullable<Action['context']> = [], primary = false) => [
  { id, component: { Button: { child: `${id}-label`, primary, action: { name: action, context } } } as Component },
  { id: `${id}-label`, component: { Text: { text: { literalString: label } } } as Component },
]

function messages(actor: Account, state: JourneyState, components: { id: string; component: Component }[], contents: { key: string; valueString?: string; valueNumber?: number }[]): A2UIMessage[] {
  const surfaceId = `journey:${actor.id}`
  return [
    { surfaceUpdate: { surfaceId, components } },
    { dataModelUpdate: { surfaceId, contents } },
    { beginRendering: { surfaceId, root: 'root', catalogId: CATALOG, styles: { font: 'Trebuchet MS', primaryColor: '#28665B' } } },
  ]
}

export function journeySurface(actor: Account, state: JourneyState): A2UIMessage[] {
  if (state.stage === 'welcome') return messages(actor, state, [
    { id: 'root', component: { Card: { child: 'content' } } },
    { id: 'content', component: { Column: { children: { explicitList: ['step', 'title', 'body', 'start'] } } } },
    text('step', '/step', 'caption'), text('title', '/title', 'h1'), text('body', '/body'),
    ...button('start', 'Comenzar mi recorrido', 'start_journey', [], true),
  ], [
    { key: 'step', valueString: 'TU TUTOR LOCAL · PRIMER ENCUENTRO' },
    { key: 'title', valueString: `Hola, ${actor.name}` },
    { key: 'body', valueString: 'Vamos a conocerte y descubrir tu punto de partida. Verás una sola pregunta por pantalla y podrás aprender a tu ritmo.' },
  ])

  if (state.stage === 'interest') {
    const choiceIds = Object.keys(INTERESTS).map(key => `interest-${key}`)
    return messages(actor, state, [
      { id: 'root', component: { Card: { child: 'content' } } },
      { id: 'content', component: { Column: { children: { explicitList: ['step', 'title', 'body', ...choiceIds] } } } },
      text('step', '/step', 'caption'), text('title', '/title', 'h2'), text('body', '/body'),
      ...Object.entries(INTERESTS).flatMap(([key, label]) => button(`interest-${key}`, label, 'choose_interest', [{ key: 'value', value: { literalString: key } }], true)),
    ], [{ key: 'step', valueString: '1 DE 2 · CONOZCÁMONOS' }, { key: 'title', valueString: '¿Qué tema te gustaría encontrar en los ejemplos?' }, { key: 'body', valueString: 'Esto no limita tu ruta: ayuda al tutor a explicar las ideas de una forma cercana para ti.' }])
  }

  if (state.stage === 'learning_mode') {
    const choiceIds = Object.keys(LEARNING_MODES).map(key => `mode-${key}`)
    return messages(actor, state, [
      { id: 'root', component: { Card: { child: 'content' } } },
      { id: 'content', component: { Column: { children: { explicitList: ['step', 'title', 'body', ...choiceIds] } } } },
      text('step', '/step', 'caption'), text('title', '/title', 'h2'), text('body', '/body'),
      ...Object.entries(LEARNING_MODES).flatMap(([key, label]) => button(`mode-${key}`, label, 'choose_learning_mode', [{ key: 'value', value: { literalString: key } }], true)),
    ], [{ key: 'step', valueString: '2 DE 2 · CONOZCÁMONOS' }, { key: 'title', valueString: '¿Cómo prefieres comenzar algo nuevo?' }, { key: 'body', valueString: 'El tutor ajustará el formato de las actividades, no su nivel de exigencia.' }])
  }

  if (state.stage === 'diagnostic') {
    const questionId = state.questionOrder[state.answers.length]
    const question = QUESTION_BANK.find(item => item.id === questionId)!
    const optionIds = question.options.map((_, index) => `option-${index}`)
    return messages(actor, state, [
      { id: 'root', component: { Card: { child: 'content' } } },
      { id: 'content', component: { Column: { children: { explicitList: ['step', 'progress', 'title', 'body', ...optionIds] } } } },
      text('step', '/step', 'caption'), text('progress', '/progress', 'caption'), text('title', '/title', 'h2'), text('body', '/body'),
      ...question.options.flatMap((label, index) => button(`option-${index}`, label, 'answer_diagnostic', [
        { key: 'questionId', value: { literalString: question.id } }, { key: 'option', value: { literalString: String(index) } },
      ], true)),
    ], [
      { key: 'step', valueString: 'DIAGNÓSTICO ADAPTATIVO' },
      { key: 'progress', valueString: `Pregunta ${state.answers.length + 1} de ${QUESTION_BANK.length}` },
      { key: 'title', valueString: question.prompt },
      { key: 'body', valueString: 'Elige la opción que mejor represente lo que harías. No hay puntos ni castigos.' },
    ])
  }

  const node = CURRICULUM_NODES.find(item => item.id === state.focusNodeId) ?? CURRICULUM_NODES[0]
  const interest = state.interest ? INTERESTS[state.interest] : 'situaciones cercanas'
  const mode = state.learningMode ? LEARNING_MODES[state.learningMode] : 'ejemplos guiados'

  if (state.stage === 'route_ready') return messages(actor, state, [
    { id: 'root', component: { Card: { child: 'content' } } },
    { id: 'content', component: { Column: { children: { explicitList: ['step', 'title', 'body', 'focus-label', 'focus', 'why', 'begin'] } } } },
    text('step', '/step', 'caption'), text('title', '/title', 'h1'), text('body', '/body'), text('focus-label', '/focusLabel', 'caption'), text('focus', '/focus', 'h2'), text('why', '/why'),
    ...button('begin', 'Entrar a mi primera actividad', 'begin_learning', [], true),
  ], [
    { key: 'step', valueString: 'TU RUTA ESTÁ LISTA' }, { key: 'title', valueString: 'Ya tengo un punto de partida para ti' },
    { key: 'body', valueString: `Usaré ${interest.toLowerCase()} y la preferencia “${mode.toLowerCase()}” para adaptar los ejemplos.` },
    { key: 'focusLabel', valueString: 'PRIMER FOCO RECOMENDADO' }, { key: 'focus', valueString: node.title },
    { key: 'why', valueString: 'La ruta puede cambiar con tus respuestas y evidencias. El docente conserva la validación final de cada competencia.' },
  ])

  if (state.stage === 'feedback') return messages(actor, state, [
    { id: 'root', component: { Card: { child: 'content' } } },
    { id: 'content', component: { Column: { children: { explicitList: ['step', 'title', 'feedback', 'saved', 'revise'] } } } },
    text('step', '/step', 'caption'), text('title', '/title', 'h2'), text('feedback', '/feedback'), text('saved', '/saved', 'caption'),
    ...button('revise', 'Mejorar mi respuesta', 'revise_practice', [], true),
  ], [
    { key: 'step', valueString: `FEEDBACK DEL TUTOR · INTENTO ${state.attempts}` }, { key: 'title', valueString: 'Leí tu respuesta' },
    { key: 'feedback', valueString: state.lastFeedback ?? 'Tu respuesta fue guardada.' },
    { key: 'saved', valueString: 'Tu evidencia quedó guardada. El feedback ayuda a mejorar; solo el docente acredita la competencia.' },
  ])

  const material = teachingMaterial(node.id, actor.age ?? 18)
  if (state.stage === 'concept') return messages(actor, state, [
    { id: 'root', component: { Card: { child: 'content' } } },
    { id: 'content', component: { Column: { children: { explicitList: ['step', 'title', 'objective', 'explanation-title', 'explanation', 'continue'] } } } },
    text('step', '/step', 'caption'), text('title', '/title', 'h1'), text('objective', '/objective'), text('explanation-title', '/explanationTitle', 'h3'), text('explanation', '/explanation'),
    ...button('continue', 'Ya lo leí: vamos a practicar', 'continue_to_practice', [], true),
  ], [
    { key: 'step', valueString: `COMPRENDER · ${state.attempts + 1}` }, { key: 'title', valueString: node.title }, { key: 'objective', valueString: node.objective },
    { key: 'explanationTitle', valueString: 'Una idea importante' }, { key: 'explanation', valueString: material.explanation },
  ])

  const response = state.lastResponse ?? ''
  return messages(actor, state, [
    { id: 'root', component: { Card: { child: 'content' } } },
    { id: 'content', component: { Column: { children: { explicitList: ['step', 'title', 'practice-title', 'practice', 'personal', 'response', 'submit'] } } } },
    text('step', '/step', 'caption'), text('title', '/title', 'h1'), text('practice-title', '/practiceTitle', 'h3'), text('practice', '/practice'), text('personal', '/personal', 'caption'),
    { id: 'response', component: { TextField: { label: { literalString: 'Explícaselo al tutor con tus propias palabras' }, text: { path: '/response' }, textFieldType: 'longText' } } },
    ...button('submit', 'Recibir feedback', 'submit_practice', [{ key: 'nodeId', value: { literalString: node.id } }, { key: 'response', value: { path: '/response' } }], true),
  ], [
    { key: 'step', valueString: `PONER EN PRÁCTICA · ${state.attempts + 1}` }, { key: 'title', valueString: node.title },
    { key: 'practiceTitle', valueString: 'Tu reto' }, { key: 'practice', valueString: material.practice },
    { key: 'personal', valueString: `El tutor relacionará el feedback con ${interest.toLowerCase()} y tu preferencia por ${mode.toLowerCase()}.` }, { key: 'response', valueString: response },
  ])
}
