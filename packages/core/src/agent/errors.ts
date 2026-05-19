export class AgentExecutionError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentExecutionError'
    this.code = code
  }
}
