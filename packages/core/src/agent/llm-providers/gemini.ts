import { logger } from "../../utils/logger"
import { sanitizeMessages } from "./interface"
import type { LLMCallOptions, LLMProvider, LLMResponse, LLMToolCall } from "./interface"
import type { ContentPart, LLMMessage } from "../llm-client"
import { AgentExecutionError } from '../errors'

const log = logger.child("llm-client")

export class GeminiProvider implements LLMProvider {
  private _extractFunctionCalls(response: any, candidate: any): Array<{ name: string; args: unknown; thoughtSignature?: string }> {
    const calls: Array<{ name: string; args: unknown; thoughtSignature?: string }> = []
    const rawCalls = Array.isArray(response?.functionCalls) ? response.functionCalls : []

    for (const fc of rawCalls) {
      if (!fc?.name) continue
      calls.push({
        name: fc.name,
        args: fc.args ?? fc.arguments ?? {},
        thoughtSignature: fc.thoughtSignature ?? undefined,
      })
    }

    const parts: any[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
    for (const part of parts) {
      const fc = part?.functionCall
      if (!fc?.name) continue
      const args = fc.args ?? fc.arguments ?? {}
      const duplicate = calls.some(existing => existing.name === fc.name && JSON.stringify(existing.args ?? {}) === JSON.stringify(args))
      if (duplicate) continue
      calls.push({
        name: fc.name,
        args,
        thoughtSignature: part.thoughtSignature ?? undefined,
      })
    }

    return calls
  }

  private _logEmptyResponse(response: any, candidate: any, options: LLMCallOptions) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
    log.warn(`[llm-client] Gemini returned empty content and no tool calls`, {
      model: options.model,
      finishReason: candidate?.finishReason ?? null,
      responseKeys: response && typeof response === "object" ? Object.keys(response) : [],
      candidateKeys: candidate && typeof candidate === "object" ? Object.keys(candidate) : [],
      partShapes: parts.map((part: any) => Object.keys(part ?? {})),
    })
  }

  private _convertContentPart(part: ContentPart): any {
    switch (part.type) {
      case "text":
        return { text: part.text }
      case "image_url": {
        const url = part.image_url?.url ?? ""
        if (url.startsWith("data:")) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) return { inlineData: { mimeType: match[1], data: match[2] } }
        }
        return { text: `[Image URL: ${url}]` }
      }
      case "image_base64":
        return { inlineData: { mimeType: part.mimeType, data: part.base64 } }
      case "document":
        return { text: `[Document: ${part.fileName || "file"}]` }
      default:
        return { text: JSON.stringify(part) }
    }
  }

  private _convertUserParts(msg: LLMMessage): any[] {
    if (Array.isArray(msg.content)) {
      return msg.content.map(p => this._convertContentPart(p))
    }
    return [{ text: msg.content }]
  }

  async call(options: LLMCallOptions): Promise<LLMResponse> {
    const { GoogleGenAI } = await import("@google/genai")

    const clientOpts: any = { apiKey: options.apiKey }
    if (options.baseUrl?.trim()) clientOpts.httpOptions = { baseUrl: options.baseUrl.trim() }

    const ai = new GoogleGenAI(clientOpts)
    const cleanMessages = sanitizeMessages(options.messages ?? [])

    const toolNameMap = new Map<string, string>()
    for (const msg of cleanMessages) {
      if (msg.role === "assistant" && msg.tool_calls) {
        for (const tc of msg.tool_calls) toolNameMap.set(tc.id, tc.function.name)
      }
    }

    let systemText = ""
    const rawContents: any[] = []

    for (const msg of cleanMessages) {
      if (msg.role === "system") {
        systemText += (systemText ? "\n\n" : "") + String(msg.content)
        continue
      }

      if (msg.role === "user") {
        rawContents.push({ role: "user", parts: this._convertUserParts(msg) })
        continue
      }

      if (msg.role === "assistant") {
        const parts: any[] = []
        if (msg.content) parts.push({ text: typeof msg.content === "string" ? msg.content : "" })
        for (const tc of msg.tool_calls ?? []) {
          let args: Record<string, unknown>
          try { args = JSON.parse(tc.function.arguments || "{}") } catch { args = {} }
          const fcPart: any = { functionCall: { name: tc.function.name, args } }
          if (tc.thought_signature) fcPart.thoughtSignature = tc.thought_signature
          parts.push(fcPart)
        }
        if (parts.length) rawContents.push({ role: "model", parts })
        continue
      }

      if (msg.role === "tool") {
        const fnName = toolNameMap.get(msg.tool_call_id || "") || msg.name || "tool"
        const frPart = { functionResponse: { name: fnName, response: { output: msg.content } } }
        const last = rawContents[rawContents.length - 1]
        if (last?.role === "user" && Array.isArray(last.parts)) {
          last.parts.push(frPart)
        } else {
          rawContents.push({ role: "user", parts: [frPart] })
        }
      }
    }

    const contents: any[] = rawContents
    while (contents.length > 0 && contents[0].role === "model") {
      log.warn(`[llm-client] Gemini: removed leading model turn (no preceding user turn)`)
      contents.shift()
    }

    let changed = true
    let safetyLimit = 10
    while (changed && safetyLimit-- > 0) {
      changed = false
      for (let i = 0; i < contents.length; i++) {
        const turn = contents[i]
        const prev = i > 0 ? contents[i - 1] : null

        if (turn.role === "model" && prev?.role === "model") {
          prev.parts.push(...(turn.parts ?? []))
          contents.splice(i, 1)
          i--
          changed = true
          continue
        }

        if (turn.role === "model") {
          const hasFc = turn.parts?.some((p: any) => p.functionCall)
          if (hasFc && prev?.role !== "user") {
            turn.parts = (turn.parts ?? []).filter((p: any) => !p.functionCall)
            log.warn(`[llm-client] Gemini: stripped functionCall not after user turn (i=${i})`)
            if (turn.parts.length === 0) {
              contents.splice(i, 1)
              i--
            }
            changed = true
            continue
          }
        }

        if (turn.role === "user") {
          const hasFr = turn.parts?.some((p: any) => p.functionResponse)
          const prevHasFc = prev?.role === "model" && prev?.parts?.some((p: any) => p.functionCall)
          if (hasFr && !prevHasFc) {
            turn.parts = (turn.parts ?? []).filter((p: any) => !p.functionResponse)
            log.warn(`[llm-client] Gemini: stripped orphaned functionResponse (i=${i})`)
            if (turn.parts.length === 0) {
              contents.splice(i, 1)
              i--
            }
            changed = true
            continue
          }
        }
      }
    }

    if (safetyLimit <= 0) {
      log.error(`[llm-client] Gemini: constraint enforcement loop exhausted — message history may still violate Gemini constraints`)
    }

    const config: any = {}
    if (systemText) config.systemInstruction = systemText
    if (options.maxTokens) config.maxOutputTokens = options.maxTokens
    if (options.temperature !== undefined) config.temperature = options.temperature
    if (options.tools?.length) {
      config.tools = [{
        functionDeclarations: options.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      }]
      if (options.toolChoice === "required" || typeof options.toolChoice === "object") {
        const allowedFunctionNames = typeof options.toolChoice === "object"
          ? [options.toolChoice.function.name]
          : options.tools.map((tool) => tool.function.name)
        config.toolConfig = {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames,
          },
        }
      }
    }

    log.info(`[llm-client] gemini/${options.model} — ${contents.length} turns, ${options.tools?.length ?? 0} tools`)

    const response = await ai.models.generateContent({
      model: options.model || "gemini-2.5-flash",
      contents,
      config,
    })

    const candidate = response.candidates?.[0]
    if (candidate?.finishReason === "SAFETY") {
      log.warn(`[llm-client] Gemini: response blocked by safety filters (model=${options.model})`)
      return {
        content: "[Response blocked by Gemini safety filters]",
        stop_reason: "stop",
        usage: response.usageMetadata ? {
          promptTokens: response.usageMetadata.promptTokenCount ?? 0,
          completionTokens: 0,
          input_tokens: response.usageMetadata.promptTokenCount ?? 0,
          output_tokens: 0,
        } : undefined,
      }
    }

    const parts: any[] = candidate?.content?.parts ?? []
    const functionCalls = this._extractFunctionCalls(response, candidate)

    let content = ""
    for (const part of parts) {
      if (part.text) content += part.text
    }

    const tool_calls: LLMToolCall[] = functionCalls.map((fc) => ({
      id: crypto.randomUUID(),
      type: "function",
      function: {
        name: fc.name,
        arguments: JSON.stringify(fc.args ?? {}),
      },
      thought_signature: fc.thoughtSignature,
    }))

    if (!content.trim() && tool_calls.length === 0) {
      this._logEmptyResponse(response, candidate, options)
      if ((options.tools?.length ?? 0) > 0) {
        const finishReason = String(candidate?.finishReason ?? '')
        const message = finishReason === 'MALFORMED_FUNCTION_CALL'
          ? `Gemini returned MALFORMED_FUNCTION_CALL for model=${options.model}`
          : `Gemini returned empty response without tool calls for model=${options.model}`

        // Fallback: when exactly 1 tool and Gemini malformed the call, retry as JSON
        if (finishReason === 'MALFORMED_FUNCTION_CALL' && options.tools?.length === 1) {
          const firstTool = options.tools[0]
          try {
            log.warn(`[llm-client] Gemini MALFORMED_FUNCTION_CALL — retrying as JSON for tool=${firstTool.name}`)
            const fallbackResp = await ai.models.generateContent({
              model: options.model || 'gemini-2.5-flash',
              contents: [
                ...contents,
                {
                  role: 'user',
                  parts: [{
                    text: `Tu llamada a función fue malformada. Responde SOLO con JSON válido con los argumentos para "${firstTool.name}". Esquema requerido: ${JSON.stringify(firstTool.parameters)}`,
                  }],
                },
              ],
              config: { responseMimeType: 'application/json', temperature: 0.1 },
            })
            const jsonText = fallbackResp.text?.trim() ?? ''
            if (jsonText) {
              JSON.parse(jsonText)
              log.info(`[llm-client] Gemini MALFORMED fallback succeeded for tool=${firstTool.name}`)
              return {
                content: '',
                stop_reason: 'tool_calls',
                tool_calls: [{
                  id: `gemini-fallback-${Date.now()}`,
                  type: 'function' as const,
                  function: { name: firstTool.name, arguments: jsonText },
                }],
                usage: undefined,
              }
            }
          } catch {
            // fallback failed, throw original error below
          }
        }

        throw new AgentExecutionError('malformed_function_call', message)
      }
    }

    const stop_reason: LLMResponse["stop_reason"] =
      tool_calls.length > 0 ? "tool_calls"
        : candidate?.finishReason === "MAX_TOKENS" ? "max_tokens"
          : "stop"

    const usageMeta = response.usageMetadata
    return {
      content,
      tool_calls: tool_calls.length ? tool_calls : undefined,
      stop_reason,
      usage: usageMeta ? {
        promptTokens: usageMeta.promptTokenCount ?? 0,
        completionTokens: usageMeta.candidatesTokenCount ?? 0,
        input_tokens: usageMeta.promptTokenCount ?? 0,
        output_tokens: usageMeta.candidatesTokenCount ?? 0,
        thinking_tokens: (usageMeta as any).thoughtsTokenCount ?? 0,
      } : undefined,
    }
  }
}
