import { logger } from "../../utils/logger"
import { sanitizeMessages } from "./interface"
import type { LLMCallOptions, LLMProvider, LLMResponse, LLMToolCall } from "./interface"
import type { LLMMessage } from "../llm-client"

const log = logger.child("llm-client")

export class OllamaProvider implements LLMProvider {
  private _convertMessage(msg: LLMMessage): any {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content }
    }

    let textContent = ""
    const images: string[] = []

    for (const part of msg.content) {
      if (part.type === "text") {
        textContent += part.text
      } else if (part.type === "image_base64") {
        images.push(part.base64 ?? "")
      } else if (part.type === "document") {
          textContent += `\n[Document: ${part.fileName || "file"}] (base64 content not displayed)`
      } else if (part.type === "image_url") {
        const url = part.image_url?.url ?? ""
        if (url.startsWith("data:")) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) images.push(match[2])
        } else {
          textContent += `\n[Image URL: ${url}]`
        }
      }
    }

    return { role: msg.role, content: textContent.trim(), ...(images.length > 0 ? { images } : {}) }
  }

  async call(options: LLMCallOptions): Promise<LLMResponse> {
    const { Ollama } = await import("ollama")

    const modelName = (options.model || "").replace(/^ollama\//, "")
    const host = options.baseUrl?.trim() || process.env.OLLAMA_HOST || "http://localhost:11434"
    const isCloud = host.includes("ollama.com")
    const headers: Record<string, string> = {}
    if (isCloud && options.apiKey) headers["Authorization"] = `Bearer ${options.apiKey}`

    const client = new Ollama({
      host,
      ...(Object.keys(headers).length ? { headers } : {}),
    })

    const messages = sanitizeMessages(options.messages ?? []).map((m): any => {
      if (m.role === "assistant" && m.tool_calls?.length) {
        return {
          role: "assistant",
          content: typeof m.content === "string" ? m.content : m.content.map(p => (p as any).text || "").join(""),
          tool_calls: m.tool_calls.map((tc) => ({
            function: {
              name: tc.function.name,
              arguments: (() => {
                try { return JSON.parse(tc.function.arguments) } catch { return {} }
              })(),
            },
          })),
        }
      }
      if (m.role === "tool") return { role: "tool", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }
      return this._convertMessage(m)
    })

    const tools = options.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }))

    // Default num_ctx to 4096 for local models — prevents OOM on small models (2B-7B)
    // when Ollama's default (32k+) is too large for available RAM/VRAM.
    // Users can override via providers.num_ctx in DB.
    const runtimeOptions: Record<string, unknown> = {
      num_ctx: options.numCtx ?? 4096,
    }
    // Cap de generación: sin él los locales divagan y bloquean la cola de
    // Ollama durante minutos (crítico para diálogos multi-agente secuenciales)
    if (options.maxTokens !== undefined) runtimeOptions.num_predict = options.maxTokens
    if (options.numGpu !== undefined) runtimeOptions.num_gpu = options.numGpu
    if (options.temperature !== undefined) runtimeOptions.temperature = options.temperature

    // Los Gemma/Qwen "thinking" gastan el presupuesto de tokens razonando antes
    // de escribir la respuesta; para turnos cortos conviene apagarlo.
    const wantThink = (options as { think?: boolean }).think

    async function chatOnce(extra: Record<string, unknown>, signal?: AbortSignal) {
      return await client.chat({
        model: modelName,
        messages,
        tools: tools?.length ? tools : undefined,
        options: Object.keys(runtimeOptions).length ? runtimeOptions : undefined,
        stream: true,
        signal,
        ...extra,
      } as any)
    }

    try {

      log.info(
        `[llm-client] ollama/${modelName} @ ${isCloud ? "ollama.com" : host} stream=true` +
        ` — ${messages.length} msgs, ${tools?.length ?? 0} tools` +
        ` num_ctx=${runtimeOptions.num_ctx}`
      )

      // think:false en modelos que lo soportan; si Ollama rechaza el parámetro
      // (modelo sin thinking), reintenta una vez sin él.
      let stream: AsyncIterable<any>
      try {
        stream = await chatOnce(wantThink === false ? { think: false } : {}, options.signal)
      } catch (e) {
        if (wantThink === false && /think/i.test(String((e as Error).message))) {
          stream = await chatOnce({}, options.signal)
        } else {
          throw e
        }
      }
      let retryDone = false

      let content = ""
      let thinkingContent = ""
      let promptEvalCount = 0
      let evalCount = 0
      const tool_calls: LLMToolCall[] = []

      const collect = (part: any): boolean => {
        // Ollama avisa "does not support thinking" con error en el stream
        const errMsg = (part as any).error ?? part.message?.error
        if (!retryDone && wantThink === false && typeof errMsg === 'string' && errMsg.includes('does not support')) {
          return false
        }
        const delta = part.message?.content ?? ""
        if (delta) {
          content += delta
          if (options.onToken) options.onToken(delta)
        }
        const thinkDelta = part.message?.thinking
        if (thinkDelta) thinkingContent += thinkDelta

        if (part.message?.tool_calls?.length) {
          for (const tc of part.message.tool_calls) {
            tool_calls.push({
              id: crypto.randomUUID(),
              type: "function" as const,
              function: {
                name: (tc as any).function.name,
                arguments: JSON.stringify((tc as any).function.arguments ?? {}),
              },
            })
          }
        }

        if (part.prompt_eval_count !== undefined) promptEvalCount = part.prompt_eval_count
        if (part.eval_count !== undefined) evalCount = part.eval_count
        return true
      }

      // Si Ollama rechaza "think" con HTTP 400 (modelo sin thinking), reintenta sin él
      try {
        stream = await chatOnce(wantThink === false ? { think: false } : {}, options.signal)
      } catch (e) {
        if (wantThink === false && String((e as Error).message).match(/think/i)) {
          stream = await chatOnce({}, options.signal)
        } else {
          throw e
        }
      }

      for await (const part of stream) {
        if (!collect(part)) {
          // Reintenta sin el parámetro think (error llegó dentro del stream)
          retryDone = true
          content = ""
          thinkingContent = ""
          stream = await chatOnce({}, options.signal)
          continue
        }
      }

      // Último recurso: si el modelo gastó todo el presupuesto en thinking y
      // content quedó vacío, rescata la última oración útil del razonamiento
      if (!content.trim() && thinkingContent.trim()) {
        const sentences = thinkingContent.split(/(?<=[.!?…])\s+/).filter(s => s.trim().length > 12 && !/^\s*[*#`-]/.test(s))
        const last = sentences[sentences.length - 1]?.trim()
        if (last) content = last.replace(/^["“]|["”]$/g, '')
        log.warn(`[llm-client] ollama: presupuesto agotado en thinking — rescatando oración (${content.length} chars)`)
      }

      // ── Tool-call extraction fallback ─────────────────────────────────────────
      // Some local models (e.g. Gemma) respond with plain text instead of calling
      // the provided tools. When that happens, make a second structured call asking
      // the model to output the intended tool call as JSON.
      if (tools?.length && !tool_calls.length && content.trim()) {
        try {
          const toolSchemas = tools.map(t => `${t.function.name}: ${JSON.stringify(t.function.parameters)}`).join('\n')
          const extractionResp = await (client.chat as any)({
            model: modelName,
            messages: [
              ...messages,
              { role: 'assistant', content },
              {
                role: 'user',
                content: `Based on the conversation, determine if a tool should be called now.\nAvailable tools:\n${toolSchemas}\nRespond with ONLY valid JSON in one of these two formats:\n{"tool":"<tool_name>","args":{<arguments>}}\n{"tool":null}\nNo explanation, no markdown, only the JSON object.`,
              },
            ],
            format: 'json',
            options: runtimeOptions,
            stream: false,
          })

          const raw = (extractionResp.message?.content ?? '').trim()
          const parsed = JSON.parse(raw)

          if (parsed.tool && typeof parsed.tool === 'string') {
            const matchingTool = tools.find(t => t.function.name === parsed.tool)
            if (matchingTool) {
              log.info(`[llm-client] ollama tool-call extracted via fallback: ${parsed.tool}`)
              tool_calls.push({
                id: crypto.randomUUID(),
                type: 'function' as const,
                function: {
                  name: parsed.tool,
                  arguments: JSON.stringify(parsed.args ?? {}),
                },
              })
              content = ''
            }
          }
        } catch {
          // Extraction failed — return the original text response as-is
        }
      }

      return {
        content,
        thinking_content: thinkingContent || undefined,
        tool_calls: tool_calls.length ? tool_calls : undefined,
        stop_reason: tool_calls.length > 0 ? "tool_calls" : "stop",
        usage:
          evalCount > 0
            ? { prompt_tokens: promptEvalCount, completion_tokens: evalCount, total_tokens: promptEvalCount + evalCount }
            : undefined,
      }
    } catch (error: any) {
      log.error(`[llm-client] FAILED call to ollama/${modelName} at ${host}`)
      log.error(`[llm-client] Error details: ${error.message || error}`)
      if (options.numCtx) log.error(`[llm-client] Context requested: num_ctx=${options.numCtx}`)
      if (options.tools?.length) log.error(`[llm-client] Tools defined: ${options.tools.length}`)

      // If the model runner crashed (likely OOM) and tools were sent, retry without tools.
      // The model can still answer conversationally — tools will be unavailable this turn.
      // Match by error message string OR HTTP 500 with tools (resilient to Ollama message changes).
      if (
        (error.message?.includes("model runner has unexpectedly stopped") || error.status === 500) &&
        tools?.length
      ) {
        log.warn(`[llm-client] OOM with tools — retrying without tools (num_ctx=${runtimeOptions.num_ctx})`)
        const stream2 = await client.chat({
          model: modelName,
          messages,
          tools: undefined,
          options: runtimeOptions,
          stream: true,
        })
        let content = ""
        for await (const part of stream2) {
          const delta = part.message?.content ?? ""
          if (delta) { content += delta; if (options.onToken) options.onToken(delta) }
        }
        return { content, tool_calls: undefined, stop_reason: "stop" }
      }

      throw error
    }
  }
}
