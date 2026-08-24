/**
 * Helpers A2UI v0.8 compartidos por las escenas (hub y ceremonia).
 * Construyen los payloads declarativos que React renderiza como overlay.
 */
import type { A2UIMessage } from '../bridge/gameBridge'

export function text(id: string, value: string, hint = 'body'): any {
  return { id, component: { Text: { value: { literalString: value }, textType: hint } } }
}

export function textField(id: string, label: string, placeholder: string): any {
  return {
    id,
    component: {
      TextField: {
        label: { literalString: label },
        placeholder,
        textFieldType: 'singleline',
      },
    },
  }
}

export function button(
  id: string,
  label: string,
  actionName: string,
  context: Array<{ key: string; value: any }> = [],
  variant = 'primary',
): any {
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

function column(id: string, children: string[]): any {
  return { id, component: { Column: { children: { explicitList: children }, distribution: 'center', alignment: 'center' } } }
}

export function buildA2UI(surfaceId: string, content: any[]): A2UIMessage[] {
  const rootChildren = content.map(c => c.id)
  return [
    {
      surfaceUpdate: {
        surfaceId,
        components: [column('root', rootChildren), ...content],
      },
    },
    {
      dataModelUpdate: {
        surfaceId,
        contents: [],
      },
    },
    {
      beginRendering: {
        surfaceId,
        root: 'root',
        styles: { primaryColor: '#ffb300', font: 'monospace' },
      },
    },
  ]
}
