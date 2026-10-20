/** Narración con la síntesis de voz del navegador (sin servidor). Es una ayuda opcional: el texto siempre está en pantalla. */

export interface VoiceLike { lang: string; name: string; default?: boolean }

/** Prefiere una voz del idioma pedido (es-MX antes que es-ES, si hay); si no, ninguna (que decida el navegador). */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang = 'es'): T | null {
  const same = voices.filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()))
  return same.find(v => /mx|419|us/i.test(v.lang)) ?? same.find(v => v.default) ?? same[0] ?? null
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function speak(text: string, onEnd?: () => void): boolean {
  if (!speechSupported() || !text.trim()) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(synth.getVoices())
  if (voice) utterance.voice = voice as SpeechSynthesisVoice
  utterance.lang = voice?.lang ?? 'es'
  utterance.rate = 0.95
  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onEnd?.()
  synth.speak(utterance)
  return true
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}
