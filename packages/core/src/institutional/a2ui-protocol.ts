/** A2UI 0.8 supported catalog subset. No HTML or executable agent code. */
export interface Bound { literalString?: string; path?: string }
export interface Action { name: string; context?: { key: string; value: Bound }[] }
export type Component =
  | { Text: { text: Bound; usageHint?: string } }
  | { Column: { children: { explicitList: string[] } } }
  | { Row: { children: { explicitList: string[] } } }
  | { Card: { child: string } }
  | { Button: { child: string; action: Action; primary?: boolean } }
  | { TextField: { label: Bound; text: Bound; textFieldType?: string } }
export interface Entry { key: string; valueString?: string; valueNumber?: number; valueBoolean?: boolean; valueMap?: Entry[] }
export type A2UIMessage =
  | { surfaceUpdate: { surfaceId: string; components: { id: string; component: Component }[] } }
  | { dataModelUpdate: { surfaceId: string; path?: string; contents: Entry[] } }
  | { beginRendering: { surfaceId: string; root: string; catalogId?: string; styles?: { font?: string; primaryColor?: string } } }
  | { deleteSurface: { surfaceId: string } }
export interface UserAction { userAction: { name: string; surfaceId: string; sourceComponentId: string; timestamp: string; context: Record<string, string> } }
export interface Surface { components: Record<string, Component>; data: Record<string, unknown>; root: string }
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
function segments(path: string) {
  if (!path.startsWith('/')) throw new Error('A2UI: se requiere JSON Pointer absoluto')
  const parts = path === '/' ? [] : path.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  if (parts.some(p => forbidden.has(p))) throw new Error('A2UI: ruta no permitida')
  return parts
}
export function boundValue(value: Bound, data: Record<string, unknown>): string {
  let found: unknown = data
  if (value.path) for (const part of segments(value.path)) found = found && typeof found === 'object' ? (found as Record<string, unknown>)[part] : undefined
  return value.path && found !== undefined ? String(found) : value.literalString ?? ''
}
export function setData(data: Record<string, unknown>, path: string, value: unknown) {
  const copy = structuredClone(data), parts = segments(path)
  if (!parts.length) throw new Error('A2UI: no se puede sustituir la raíz con un campo')
  let target = copy
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {}
    target = target[part] as Record<string, unknown>
  }
  target[parts.at(-1)!] = value
  return copy
}
function entryData(entries: Entry[], depth = 0): Record<string, unknown> {
  if (depth > 12 || !Array.isArray(entries) || entries.length > 200) throw new Error('A2UI: modelo excesivo')
  const data: Record<string, unknown> = {}
  for (const entry of entries) {
    if (forbidden.has(entry.key) || typeof entry.key !== 'string') throw new Error('A2UI: clave no permitida')
    if (['valueString', 'valueNumber', 'valueBoolean', 'valueMap'].filter(k => k in entry).length !== 1) throw new Error('A2UI: valor ambiguo')
    data[entry.key] = entry.valueMap ? entryData(entry.valueMap, depth + 1) : entry.valueString ?? entry.valueNumber ?? entry.valueBoolean
  }
  return data
}
export function componentChildren(component: Component): string[] {
  if ('Column' in component) return component.Column.children.explicitList
  if ('Row' in component) return component.Row.children.explicitList
  if ('Card' in component) return [component.Card.child]
  if ('Button' in component) return [component.Button.child]
  return []
}
export function applyMessage(state: Record<string, Surface>, message: A2UIMessage): Record<string, Surface> {
  if (!message || Object.keys(message).length !== 1) throw new Error('A2UI: mensaje inválido')
  const payload = Object.values(message)[0], id = payload.surfaceId
  if (typeof id !== 'string' || forbidden.has(id)) throw new Error('A2UI: superficie inválida')
  const next = { ...state }
  if ('deleteSurface' in message) { delete next[id]; return next }
  const surface = structuredClone(next[id] ?? { components: {}, data: {}, root: '' })
  if ('surfaceUpdate' in message) {
    if (message.surfaceUpdate.components.length > 200) throw new Error('A2UI: demasiados componentes')
    for (const item of message.surfaceUpdate.components) {
      if (forbidden.has(item.id) || Object.keys(item.component).length !== 1 || !['Text', 'Column', 'Row', 'Card', 'Button', 'TextField'].includes(Object.keys(item.component)[0])) throw new Error('A2UI: componente no soportado')
      surface.components[item.id] = item.component
    }
  } else if ('dataModelUpdate' in message) {
    const update = entryData(message.dataModelUpdate.contents), path = message.dataModelUpdate.path ?? '/'
    surface.data = path === '/' ? { ...surface.data, ...update } : setData(surface.data, path, update)
  } else if ('beginRendering' in message) surface.root = message.beginRendering.root
  else throw new Error('A2UI: tipo de mensaje desconocido')
  if (surface.root) {
    const visit = (key: string, stack = new Set<string>()) => {
      if (stack.size > 32 || stack.has(key) || !surface.components[key]) throw new Error('A2UI: referencia ausente o circular')
      for (const child of componentChildren(surface.components[key])) visit(child, new Set([...stack, key]))
    }
    visit(surface.root)
  }
  next[id] = surface
  return next
}
export function resolveAction(surfaceId: string, sourceComponentId: string, action: Action, data: Record<string, unknown>): UserAction {
  return { userAction: { name: action.name, surfaceId, sourceComponentId, timestamp: new Date().toISOString(), context: Object.fromEntries((action.context ?? []).map(item => [item.key, boundValue(item.value, data)])) } }
}
