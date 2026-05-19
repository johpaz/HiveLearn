/**
 * LLM Provider Factory — Maps providerId to the correct adapter instance.
 *
 * All providers implement the LLMProvider interface defined in ./interface.ts.
 * The factory centralizes provider instantiation so callLLM() doesn't need
 * to know about individual provider classes.
 */
import type { LLMProvider } from "./interface"
import { OllamaProvider } from "./ollama"
import { LocalLlamaProvider } from "./local-llama"
import { OpenAICompatProvider } from "./openai-compat"
import { GroqProvider } from "./groq"
import { MistralProvider } from "./mistral"
import { DeepSeekProvider } from "./deepseek"
import { KimiProvider } from "./kimi"
import { OpenRouterProvider } from "./openrouter"
import { NvidiaProvider } from "./nvidia"
import { QwenProvider } from "./qwen"
import { AnthropicProvider } from "./anthropic"
import { GeminiProvider } from "./gemini"

const providerFactories: Record<string, () => LLMProvider> = {
  ollama:      () => new OllamaProvider(),
  "local-llama": () => new LocalLlamaProvider(),
  openai:      () => new OpenAICompatProvider("openai"),
  groq:        () => new GroqProvider(),
  mistral:     () => new MistralProvider(),
  deepseek:    () => new DeepSeekProvider(),
  kimi:        () => new KimiProvider(),
  openrouter:  () => new OpenRouterProvider(),
  nvidia:      () => new NvidiaProvider(),
  qwen:        () => new QwenProvider(),
  anthropic:   () => new AnthropicProvider(),
  gemini:      () => new GeminiProvider(),
}

export function getProvider(providerId: string): LLMProvider {
  const factory = providerFactories[providerId]
  if (!factory) {
    // Fallback: treat unknown provider as OpenAI-compatible
    return new OpenAICompatProvider(providerId)
  }
  return factory()
}

export function getProviderIds(): string[] {
  return Object.keys(providerFactories)
}
