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

declare module '@anthropic-ai/sdk' {
  export default class Anthropic {
    constructor(opts?: { apiKey?: string; baseURL?: string })
    messages: {
      create(opts: any): Promise<any>
    }
  }
}

declare module '@google/genai' {
  export class GoogleAI {
    constructor(apiKey: string)
    // ...
  }
}
