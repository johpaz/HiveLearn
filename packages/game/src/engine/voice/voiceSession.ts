/**
 * voiceSession — Orquestador de una conversación por voz con un agente HL.
 *
 * Ciclo:
 *   capture WAV → bridge.emit('voice:transcribe') → bridge.on('voice:transcript')
 *   → bridge.emit('agent:chat')                  → bridge.on('agent:reply' delta/done)
 *   → bridge.emit('tts:request', {agentId})      → bridge.on('tts:ready')
 *   → AudioManager.playVoice(url)  (ducking automático)
 *
 * El VoiceSession expone solo el inicio de la conversación (V key o botón 🎤).
 * La UI de React resuelve STT/TTS llamando al backend real (ver GamePlayScreen).
 *
 * Es un singleton informal: lo crea HiveHubScene cuando el jugador se acerca a
 * un agente, y solo existe una conversación a la vez por [sessionId × agentId].
 */

import type { GameBridge } from '../../bridge/gameBridge'
import type { AudioManager } from '../audio'
import { VoiceCapture, type VoiceMode, type VoiceCaptureState } from './voiceCapture'
import type { HiveAgentId } from '../../entities/agents'

export type VoiceSessionState =
  | 'idle'
  | 'listening' // capturing
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error'

export interface VoiceSessionHandlers {
  onState?: (state: VoiceSessionState) => void
  onUserTranscript?: (text: string) => void // mostrar burbuja sobre el jugador
  onAgentDelta?: (text: string) => void // streaming de la respuesta
  onAgentReply?: (text: string, emotion: string) => void // final
  /** Llamado al empezar a sonar cada oración TTS (para karaoke + burbuja). */
  onSentencePlay?: (text: string, index: number) => void
  /** Opciones de sonido posicional calculadas por la escena (pan/volumen). */
  getVoiceOptions?: () => { pan?: number; volume?: number }
  onError?: (err: string) => void
}

export class VoiceSession {
  private bridge: GameBridge
  private audio: AudioManager
  private agentId: HiveAgentId | null = null
  private requestId = 0
  private capture: VoiceCapture | null = null
  private handlers: VoiceSessionHandlers
  private state: VoiceSessionState = 'idle'
  private unsubs: Array<() => void> = []
  private replyAccumulator = ''
  private mode: VoiceMode = 'ptt'
  /** Cooldown mínimo entre turnos de voz (ms) para no machacar al backend. */
  private lastTurnEnd = 0
  private static readonly COOLDOWN_MS = 1500

  constructor(
    bridge: GameBridge,
    audio: AudioManager,
    handlers: VoiceSessionHandlers,
  ) {
    this.bridge = bridge
    this.audio = audio
    this.handlers = handlers
  }

  getState(): VoiceSessionState { return this.state }
  getCurrentAgent(): HiveAgentId | null { return this.agentId }

  /**
   * Inicia una conversación con un agente. Si ya se estaba hablando con otro,
   * la cancela. Configura VoiceCapture (PTT tecla V) y engancha los handlers
   * del bridge necesarios.
   */
  startConversation(agentId: HiveAgentId, mode: VoiceMode = 'ptt'): void {
    if (this.agentId !== agentId) this.cancel()
    this.agentId = agentId
    this.mode = mode
    this.replyAccumulator = ''

    if (!this.capture) {
      this.capture = new VoiceCapture(
        {
          onChunk: (wav) => this.sendForTranscription(wav),
          onState: (s) => this.onCaptureState(s),
          onError: (e) => this.handlers.onError?.(e.message),
        },
        { mode: this.mode },
      )
      this.capture.attachKeyboard()
    } else {
      this.capture.setMode(this.mode)
    }

    if (!this.unsubs.length) this.attachBridge()
    this.bridge.emit('voice:agent:open', { agentId })
    this.setState('idle')
    // En PTT el usuario pulsa V manualmente; en handsfree arrancamos enseguida
    if (this.mode === 'handsfree') void this.capture.start()
  }

  /** Botón 🎤 en pantalla pulsado (PTT manual). Bloqueado mientras no esté idle. */
  micPressDown(): void {
    if (!this.canSpeak()) return
    this.capture?.pressDown()
  }
  micPressUp(): void { this.capture?.pressUp() }

  /** ¿Se puede iniciar un nuevo turno de voz ahora? Respeta cooldown y estado. */
  canSpeak(): boolean {
    if (this.state !== 'idle') return false
    if (Date.now() - this.lastTurnEnd < VoiceSession.COOLDOWN_MS) return false
    return true
  }

  /**
   * Envía texto directamente (sin micrófono). Útil cuando STT no está
   * disponible o el usuario escribe en lugar de hablar.
   */
  sendTextAndContinue(text: string): void {
    if (!this.agentId || !text.trim()) return
    this.fireAgentMessage(text.trim())
  }

  cancel(): void {
    this.capture?.destroy()
    this.capture = null
    this.unsubs.forEach((u) => u())
    this.unsubs = []
    this.audio.stopVoice()
    this.agentId = null
    this.setState('idle')
  }

  destroy(): void { this.cancel() }

  private attachBridge(): void {
    this.unsubs.push(
      this.bridge.on('voice:transcript', (p) => this.onTranscript(p)),
      this.bridge.on('agent:reply', (p) => this.onAgentReply(p)),
      this.bridge.on('tts:ready', (p) => this.onTtsReady(p)),
    )
  }

  private onCaptureState(s: VoiceCaptureState): void {
    if (s === 'listening') this.setState('listening')
    else if (s === 'idle' && this.state === 'listening') this.setState('transcribing')
    else if (s === 'denied' || s === 'error') this.handlers.onError?.(s)
  }

  private sendForTranscription(wav: ArrayBuffer): void {
    this.requestId++
    this.bridge.emit('voice:transcribe', { wav, requestId: String(this.requestId) })
    this.setState('transcribing')
  }

  private onTranscript(p: { requestId: string; text: string; ok: boolean; error?: string }): void {
    if (p.requestId !== String(this.requestId)) return
    if (!p.ok || !p.text.trim()) {
      this.handlers.onError?.(p.error ?? 'transcripción vacía')
      this.setState('idle')
      // En handsfree se reanuda solo desde la captura
      return
    }
    const text = p.text.trim()
    this.handlers.onUserTranscript?.(text)
    this.fireAgentMessage(text)
  }

  private fireAgentMessage(text: string): void {
    this.requestId++
    this.replyAccumulator = ''
    this.bridge.emit('agent:chat', {
      agentId: this.agentId!,
      text,
      requestId: String(this.requestId),
    })
    this.setState('thinking')
  }

  private onAgentReply(p: {
    requestId: string
    agentId: string
    delta?: string
    reply?: string
    emotion?: string
    done: boolean
  }): void {
    if (p.requestId !== String(this.requestId)) return
    if (p.delta) {
      this.replyAccumulator += p.delta
      this.handlers.onAgentDelta?.(p.delta)
    }
    if (p.done) {
      const finalText = p.reply ?? this.replyAccumulator
      const emotion = p.emotion ?? 'happy'
      this.handlers.onAgentReply?.(finalText, emotion)
      // Pide TTS al backend (con agentId para que React use la voz correcta)
      const voiceKey = `agent-${this.agentId}-${Date.now()}`
      this.bridge.emit('tts:request', {
        nodeId: voiceKey,
        text: finalText,
        agentId: this.agentId ?? undefined,
      })
      this.setState('speaking')
      this.lastTurnEnd = Date.now()
    }
  }

  private onTtsReady(p: { nodeId: string; url: string }): void {
    // Filtra por prefijo 'agent-' para no colisionar con TTS de otros flujos.
    if (!p.nodeId.startsWith('agent-')) return
    if (this.state !== 'speaking' && this.state !== 'thinking') return
    void this.audio.playVoice(p.url).then(() => {
      this.setState('idle')
    })
  }

  private setState(s: VoiceSessionState): void {
    if (this.state === s) return
    this.state = s
    this.handlers.onState?.(s)
  }
}