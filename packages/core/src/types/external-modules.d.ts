declare module 'ollama' {
  export class Ollama {
    constructor(opts?: { host?: string; headers?: Record<string, string> })
    chat(opts: { model: string; messages: any[]; tools?: any[]; options?: Record<string, unknown>; stream?: boolean }): AsyncIterable<any>
  }
}

declare module 'openai' {
  export default class OpenAI {
    constructor(opts?: { apiKey?: string; baseURL?: string })
    chat: {
      completions: {
        create(opts: any): Promise<any>
      }
    }
  }
}

