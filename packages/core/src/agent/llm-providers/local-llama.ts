/**
 * Local LLM Provider (hive-cli)
 * Implementa la interfaz LLMProvider para usar modelos locales via hive-cli
 */

import type { LLMProvider, LLMCallOptions, LLMResponse } from "./interface"
import { generateLocalComplete, isLocalLLMAvailable } from "../../gateway/llm-local/client"
import { getRecommendedModel } from "../../gateway/llm-local/models"
import { logger } from "../../utils/logger"

const log = logger.child("llm-provider:local-llama")

export class LocalLlamaProvider implements LLMProvider {
  async call(options: LLMCallOptions): Promise<LLMResponse> {
    if (!(await isLocalLLMAvailable())) {
      throw new Error("Local LLM no está disponible. Ejecuta 'hivelearn llm start' primero.")
    }

    // Extraer el prompt del último mensaje usuario
    const lastMessage = options.messages?.[options.messages.length - 1]
    let prompt = ""

    if (typeof lastMessage?.content === "string") {
      prompt = lastMessage.content
    } else if (Array.isArray(lastMessage?.content)) {
      const textPart = lastMessage.content.find((p) => p.type === "text")
      prompt = textPart?.text ?? ""
    }

    // Determinar modelo según el contexto
    const mode = this.detectMode(options)
    const model = getRecommendedModel(mode)

    log.info(`[local-llama] Generando con modelo ${model} (modo: ${mode})`)

    const text = await generateLocalComplete({
      prompt,
      model: model as any,
      nPredict: options.maxTokens ?? 512,
    })

    return {
      content: text,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    }
  }

  private detectMode(options: LLMCallOptions): "text" | "image" | "audio" | "all" {
    const lastMessage = options.messages?.[options.messages.length - 1]
    if (!Array.isArray(lastMessage?.content)) return "text"

    const hasImage = lastMessage.content.some((p) => p.type === "image_url" || p.type === "image_base64")
    const hasAudio = false // Audio aún no soportado en ContentPart

    if (hasImage && hasAudio) return "all"
    if (hasImage) return "image"
    if (hasAudio) return "audio"
    return "text"
  }
}
