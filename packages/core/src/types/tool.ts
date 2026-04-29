/**
 * HiveLearn — Tool types (local copy, no core dependency)
 */

export interface Tool<TParams = Record<string, unknown>, TOutput = string | object> {
  name: string
  description: string
  parameters: ToolParameters
  execute?: (params: TParams, config?: any) => Promise<TOutput>
}

export interface ToolParameters {
  type: 'object'
  properties: Record<string, ToolParameterProperty>
  required?: string[]
  [key: string]: unknown
}

export interface ToolParameterProperty {
  type: string
  description?: string
  enum?: string[]
  [key: string]: unknown
}

export interface LLMToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolParameters
  }
}
