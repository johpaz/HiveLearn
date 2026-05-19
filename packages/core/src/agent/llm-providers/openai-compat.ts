import { OpenAICompatBase } from "./openai-compat-base"

export class OpenAICompatProvider extends OpenAICompatBase {
  constructor(providerName = "openai") {
    super(providerName)
  }
}
