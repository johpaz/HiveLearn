import type { A2UIMessage } from './a2ui-protocol'
import type { CurriculumNode } from './curriculum'
import { teachingMaterial } from './curriculum-content'
export function learningSurface(node: CurriculumNode, guidance: string, feedback = '', age = 18): A2UIMessage[] {
  const material = teachingMaterial(node.id, age)
  const surfaceId = `competency:${node.id}`
  return [
    { surfaceUpdate: { surfaceId, components: [
      { id: 'root', component: { Column: { children: { explicitList: ['title', 'objective', 'explanation', 'guidance', 'practice', 'evidence', 'response', 'submit', 'feedback'] } } } },
      { id: 'explanation', component: { Text: { text: { path: '/explanation' } } } },
      { id: 'practice', component: { Text: { text: { path: '/practice' } } } },
      { id: 'title', component: { Text: { text: { path: '/title' }, usageHint: 'h2' } } },
      { id: 'objective', component: { Text: { text: { path: '/objective' } } } },
      { id: 'guidance', component: { Text: { text: { path: '/guidance' }, usageHint: 'caption' } } },
      { id: 'evidence', component: { Text: { text: { path: '/evidence' } } } },
      { id: 'response', component: { TextField: { label: { literalString: 'Tu explicación o evidencia (sin datos personales)' }, text: { path: '/response' }, textFieldType: 'longText' } } },
      { id: 'submit-label', component: { Text: { text: { literalString: 'Enviar evidencia al docente' } } } },
      { id: 'submit', component: { Button: { child: 'submit-label', action: { name: 'submit_evidence', context: [{ key: 'nodeId', value: { literalString: node.id } }, { key: 'response', value: { path: '/response' } }] } } } },
      { id: 'feedback', component: { Text: { text: { path: '/feedback' } } } },
    ] } },
    { dataModelUpdate: { surfaceId, contents: [
      { key: 'title', valueString: node.title }, { key: 'objective', valueString: node.objective },
      { key: 'guidance', valueString: guidance }, { key: 'evidence', valueString: `Práctica sugerida: ${node.evidence}` },
      { key: 'response', valueString: '' }, { key: 'feedback', valueString: feedback },
      { key: 'explanation', valueString: material.explanation }, { key: 'practice', valueString: material.practice },
    ] } },
    { beginRendering: { surfaceId, root: 'root', catalogId: 'https://github.com/google/A2UI/blob/main/specification/0.8/json/standard_catalog_definition.json' } },
  ]
}
