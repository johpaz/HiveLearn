/**
 * Routes index — combina todos los handlers del gateway
 */
export { handleProviders } from './providers'
export { handleLLM } from './llm'
export { handleHiveLearn } from './hivelearn'
export { handleTTS } from './tts'

import { handleProviders } from './providers'
import { handleLLM } from './llm'
import { handleHiveLearn } from './hivelearn'
import { handleTTS } from './tts'

export const routeHandlers = [
  handleProviders,
  handleLLM,
  handleHiveLearn,
  handleTTS,
]
