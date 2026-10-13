import type { Account } from './accounts'
import type { A2UIMessage, Component } from './a2ui-protocol'
import type { CurriculumDef } from './curriculum-def'
import type { CurriculumJourneyState } from './curriculum-journey'
import type { NodeMaterial } from './curriculum-material'
import { CATALOG, button, text } from './journey-a2ui'
import { INTERESTS, LEARNING_MODES } from './journey'

type Part = { id: string; component: Component }
type Entry = { key: string; valueString?: string }

export const curriculumSurfaceId = (actor: Pick<Account, 'id'>, def: Pick<CurriculumDef, 'id'>) => `journey:${actor.id}:${def.id}`

function frame(surfaceId: string, components: Part[], contents: Entry[]): A2UIMessage[] {
  return [
    { surfaceUpdate: { surfaceId, components } },
    { dataModelUpdate: { surfaceId, contents } },
    { beginRendering: { surfaceId, root: 'root', catalogId: CATALOG, styles: { font: 'Trebuchet MS', primaryColor: '#28665B' } } },
  ]
}

const card = (children: string[]): Part[] => [
  { id: 'root', component: { Card: { child: 'content' } } },
  { id: 'content', component: { Column: { children: { explicitList: children } } } },
]

/** Pantalla del recorrido. `material` solo hace falta en las etapas concepto/práctica. */
export function curriculumJourneySurface(actor: Account, def: CurriculumDef, state: CurriculumJourneyState, material?: NodeMaterial | null): A2UIMessage[] {
  const surfaceId = curriculumSurfaceId(actor, def)
  const interest = state.interest ? INTERESTS[state.interest] : 'situaciones cercanas'
  const mode = state.learningMode ? LEARNING_MODES[state.learningMode] : 'ejemplos guiados'

  if (state.stage === 'welcome') return frame(surfaceId, [
    ...card(['step', 'title', 'body', 'start']),
    text('step', '/step', 'caption'), text('title', '/title', 'h1'), text('body', '/body'),
    ...button('start', 'Comenzar mi recorrido', 'start_journey', [], true),
  ], [
    { key: 'step', valueString: `TU TUTOR · ${def.topic.toUpperCase()}` },
    { key: 'title', valueString: `Hola, ${actor.name}` },
    { key: 'body', valueString: `Vamos a descubrir tu punto de partida en «${def.topic}». Verás una sola pregunta por pantalla y podrás aprender a tu ritmo.` },
  ])

  if (state.stage === 'interest') {
    const ids = Object.keys(INTERESTS).map(k => `interest-${k}`)
    return frame(surfaceId, [
      ...card(['step', 'title', 'body', ...ids]),
      text('step', '/step', 'caption'), text('title', '/title', 'h2'), text('body', '/body'),
      ...Object.entries(INTERESTS).flatMap(([k, label]) => button(`interest-${k}`, label, 'choose_interest', [{ key: 'value', value: { literalString: k } }], true)),
    ], [{ key: 'step', valueString: '1 DE 2 · CONOZCÁMONOS' }, { key: 'title', valueString: '¿Qué tipo de ejemplos te resultan más cercanos?' }, { key: 'body', valueString: 'Esto no limita tu ruta: ayuda al tutor a explicar las ideas de una forma cercana para ti.' }])
  }

  if (state.stage === 'learning_mode') {
    const ids = Object.keys(LEARNING_MODES).map(k => `mode-${k}`)
    return frame(surfaceId, [
      ...card(['step', 'title', 'body', ...ids]),
      text('step', '/step', 'caption'), text('title', '/title', 'h2'), text('body', '/body'),
      ...Object.entries(LEARNING_MODES).flatMap(([k, label]) => button(`mode-${k}`, label, 'choose_learning_mode', [{ key: 'value', value: { literalString: k } }], true)),
    ], [{ key: 'step', valueString: '2 DE 2 · CONOZCÁMONOS' }, { key: 'title', valueString: '¿Cómo prefieres comenzar algo nuevo?' }, { key: 'body', valueString: 'El tutor ajustará el formato de las actividades, no su nivel de exigencia.' }])
  }

  if (state.stage === 'diagnostic') {
    const question = def.questionBank.find(q => q.id === state.questionOrder[state.answers.length])
    if (!question) return frame(surfaceId, [...card(['body']), text('body', '/body')], [{ key: 'body', valueString: 'Calculando tu ruta…' }])
    const ids = (question.options as string[]).map((_, i) => `option-${i}`)
    return frame(surfaceId, [
      ...card(['step', 'progress', 'title', 'body', ...ids]),
      text('step', '/step', 'caption'), text('progress', '/progress', 'caption'), text('title', '/title', 'h2'), text('body', '/body'),
      ...(question.options as string[]).flatMap((label, i) => button(`option-${i}`, label, 'answer_diagnostic', [
        { key: 'questionId', value: { literalString: question.id } }, { key: 'option', value: { literalString: String(i) } },
      ], true)),
    ], [
      { key: 'step', valueString: 'DIAGNÓSTICO' },
      { key: 'progress', valueString: `Pregunta ${state.answers.length + 1} de ${def.questionBank.length}` },
      { key: 'title', valueString: question.prompt },
      { key: 'body', valueString: 'Elige la opción que mejor represente lo que harías. No hay puntos ni castigos.' },
    ])
  }

  const node = def.nodes.find(n => n.id === state.focusNodeId) ?? def.nodes[0]

  if (state.stage === 'route_ready') return frame(surfaceId, [
    ...card(['step', 'title', 'body', 'focus-label', 'focus', 'why', 'begin']),
    text('step', '/step', 'caption'), text('title', '/title', 'h1'), text('body', '/body'), text('focus-label', '/focusLabel', 'caption'), text('focus', '/focus', 'h2'), text('why', '/why'),
    ...button('begin', 'Entrar a mi primera actividad', 'begin_learning', [], true),
  ], [
    { key: 'step', valueString: 'TU RUTA ESTÁ LISTA' }, { key: 'title', valueString: 'Ya tengo un punto de partida para ti' },
    { key: 'body', valueString: `Usaré ${interest.toLowerCase()} y la preferencia “${mode.toLowerCase()}” para adaptar los ejemplos.` },
    { key: 'focusLabel', valueString: 'PRIMER FOCO RECOMENDADO' }, { key: 'focus', valueString: node.title },
    { key: 'why', valueString: 'La ruta puede cambiar con tus respuestas y evidencias. Un docente conserva la validación final de cada competencia.' },
  ])

  if (state.stage === 'feedback') return frame(surfaceId, [
    ...card(['step', 'title', 'feedback', 'saved', 'revise', 'next']),
    text('step', '/step', 'caption'), text('title', '/title', 'h2'), text('feedback', '/feedback'), text('saved', '/saved', 'caption'),
    ...button('revise', 'Mejorar mi respuesta', 'revise_practice', [], true),
    ...button('next', 'Probar otra actividad', 'next_activity', []),
  ], [
    { key: 'step', valueString: `FEEDBACK DEL TUTOR · INTENTO ${state.attempts}` }, { key: 'title', valueString: 'Leí tu respuesta' },
    { key: 'feedback', valueString: state.lastFeedback ?? 'Tu respuesta fue guardada.' },
    { key: 'saved', valueString: 'Tu evidencia quedó guardada. El feedback ayuda a mejorar; acreditar una competencia requiere evidencia sostenida y, según el caso, la revisión de un docente.' },
  ])

  if (state.stage === 'concept') return frame(surfaceId, [
    ...card(['step', 'title', 'objective', 'explanation-title', 'explanation', 'sources', 'continue']),
    text('step', '/step', 'caption'), text('title', '/title', 'h1'), text('objective', '/objective'), text('explanation-title', '/explanationTitle', 'h3'), text('explanation', '/explanation'), text('sources', '/sources', 'caption'),
    ...button('continue', 'Ya lo leí: vamos a practicar', 'continue_to_practice', [], true),
  ], [
    { key: 'step', valueString: `COMPRENDER · ${state.attempts + 1}` }, { key: 'title', valueString: node.title }, { key: 'objective', valueString: node.objective },
    { key: 'explanationTitle', valueString: 'Una idea importante' },
    { key: 'explanation', valueString: material?.explanation ?? node.objective },
    { key: 'sources', valueString: material?.sources.length ? `Fuentes: ${material.sources.map(s => s.url).join(' · ')}` : '' },
  ])

  return frame(surfaceId, [
    ...card(['step', 'title', 'practice-title', 'practice', 'personal', 'response', 'submit']),
    text('step', '/step', 'caption'), text('title', '/title', 'h1'), text('practice-title', '/practiceTitle', 'h3'), text('practice', '/practice'), text('personal', '/personal', 'caption'),
    { id: 'response', component: { TextField: { label: { literalString: 'Explícaselo al tutor con tus propias palabras' }, text: { path: '/response' }, textFieldType: 'longText' } } },
    ...button('submit', 'Recibir feedback', 'submit_practice', [{ key: 'nodeId', value: { literalString: node.id } }, { key: 'response', value: { path: '/response' } }], true),
  ], [
    { key: 'step', valueString: `PONER EN PRÁCTICA · ${state.attempts + 1}` }, { key: 'title', valueString: node.title },
    { key: 'practiceTitle', valueString: 'Tu reto' }, { key: 'practice', valueString: material?.practice ?? node.evidence },
    { key: 'personal', valueString: `El tutor relacionará el feedback con ${interest.toLowerCase()} y tu preferencia por ${mode.toLowerCase()}.` },
    { key: 'response', valueString: state.lastResponse ?? '' },
  ])
}
