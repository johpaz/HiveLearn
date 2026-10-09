import { afterEach, describe, expect, test } from 'bun:test'
import { evaluateToolCall } from './sdk-hook'
import { _resetToolBridgeForTests, bindRunTools, isToolAllowedInRun } from '../sdk/tools'
import type { Tool } from '../../types/tool'

const tool = (name: string): Tool => ({ name, description: name, parameters: { type: 'object', properties: {} } })

afterEach(() => _resetToolBridgeForTests())

describe('política de herramientas del SDK', () => {
  test('en una ejecución de HiveLearn solo se permiten sus propias tools', async () => {
    const release = await bindRunTools('run-1', [tool('generar_ficha')], async () => ({}))
    expect(isToolAllowedInRun('run-1', 'generar_ficha')).toBe(true)
    expect(evaluateToolCall({ toolName: 'generar_ficha', threadId: 'run-1' })).toBeUndefined()

    const blocked = evaluateToolCall({ toolName: 'web_fetch', threadId: 'run-1' })
    expect(blocked).toMatchObject({ block: true })
    expect(evaluateToolCall({ toolName: 'cli_exec', threadId: 'run-1' })).toMatchObject({ block: true })
    expect(evaluateToolCall({ toolName: 'task_delegate', threadId: 'run-1' })).toMatchObject({ block: true })

    release()
    // Terminada la ejecución el hilo deja de ser de HiveLearn y el hook no opina.
    expect(evaluateToolCall({ toolName: 'web_fetch', threadId: 'run-1' })).toBeUndefined()
  })

  test('un hilo ajeno a HiveLearn no se toca', () => {
    expect(isToolAllowedInRun('otro-hilo', 'web_fetch')).toBeNull()
    expect(evaluateToolCall({ toolName: 'web_fetch', threadId: 'otro-hilo' })).toBeUndefined()
    expect(evaluateToolCall({ toolName: 'web_fetch' })).toBeUndefined()
  })

  test('cada ejecución tiene su propia lista (sin mezcla entre alumnos)', async () => {
    const a = await bindRunTools('run-a', [tool('buscar_dato')], async () => ({}))
    const b = await bindRunTools('run-b', [tool('generar_ficha')], async () => ({}))
    expect(evaluateToolCall({ toolName: 'buscar_dato', threadId: 'run-a' })).toBeUndefined()
    expect(evaluateToolCall({ toolName: 'buscar_dato', threadId: 'run-b' })).toMatchObject({ block: true })
    a(); b()
  })
})
