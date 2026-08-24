/**
 * voiceCapture — Captura de micrófono con VAD por energía y modos PTT/livre.
 *
 * Modos soportados:
 *   - 'ptt' (push-to-talk por defecto): graba mientras se mantiene pulsada
 *     la tecla `V` o se llama a start()/stop() manualmente (botón 🎤).
 *   - 'handsfree': graba continuamente; corta automáticamente tras 1.2s
 *     de silencio (energía < UMBRAL_SILENCIO) y descarta fragmentos < 0.3s.
 *
 * Emite `onChunk(wav: ArrayBuffer)` cada vez que se completa una grabación
 * PCM 16kHz mono envuelta en cabecera WAV. La capa React la envía a STT.
 */

const DEFAULT_SAMPLE_RATE = 16000
const UMBRAL_SILENCIO = 0.018 // RMS por debajo = silencio
const SILENCIO_FINAL_MS = 1200 // tiempo de silencio para cortar
const MIN_DURACION_MS = 300 // chunk más corto válido
const MAX_DURACION_MS = 15_000 // safety: cortar igual si habla demasiado

export type VoiceMode = 'ptt' | 'handsfree'

export interface VoiceCaptureOptions {
  mode?: VoiceMode
  sampleRate?: number
  pttKey?: string // code del evento KeyboardEvent, por defecto 'KeyV'
}

export interface VoiceCaptureHandlers {
  onChunk?: (wav: ArrayBuffer) => void
  onState?: (state: VoiceCaptureState) => void
  onError?: (err: Error) => void
}

export type VoiceCaptureState =
  | 'idle'
  | 'listening' // capturando audio
  | 'starting'  // pidiendo permisos/hardware
  | 'denied'    // micrófono no autorizado
  | 'error'

interface InternalCtx {
  audioCtx: AudioContext
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  startTime: number
  recording: boolean
  rmsBuf: Float32Array
  recorder: MediaRecorder
  chunks: Blob[]
  mimeType: string
}

export class VoiceCapture {
  mode: VoiceMode
  readonly sampleRate: number
  private readonly pttKey: string
  private handlers: VoiceCaptureHandlers
  private ctx: InternalCtx | null = null
  private state: VoiceCaptureState = 'idle'
  private pttHeld = false
  private handsfreeTimer: number | null = null
  private silenceStart = 0
  private inSilence = false
  private keydownHandler: (e: KeyboardEvent) => void
  private keyupHandler: (e: KeyboardEvent) => void

  constructor(handlers: VoiceCaptureHandlers, opts: VoiceCaptureOptions = {}) {
    this.mode = opts.mode ?? 'ptt'
    this.sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE
    this.pttKey = opts.pttKey ?? 'KeyV'
    this.handlers = handlers
    this.keydownHandler = (e) => {
      if (e.code === this.pttKey) {
        e.preventDefault()
        if (!this.pttHeld && this.mode === 'ptt') void this.start()
        this.pttHeld = true
      }
    }
    this.keyupHandler = (e) => {
      if (e.code === this.pttKey) {
        this.pttHeld = false
        if (this.mode === 'ptt') void this.stop()
      }
    }
  }

  getMode(): VoiceMode { return this.mode }
  getState(): VoiceCaptureState { return this.state }

  setMode(m: VoiceMode): void {
    if (m === this.mode) return
    if (this.state === 'listening') void this.stop()
    this.mode = m
    if (m === 'handsfree' && this.ctx) void this.start()
  }

  /** Engancha el listener de teclado. Idempotente. */
  attachKeyboard(): void {
    window.addEventListener('keydown', this.keydownHandler)
    window.addEventListener('keyup', this.keyupHandler)
  }
  detachKeyboard(): void {
    window.removeEventListener('keydown', this.keydownHandler)
    window.removeEventListener('keyup', this.keyupHandler)
  }

  /** Liga manualmente PTT desde un botón 🎤 táctil. */
  pressDown(): void {
    if (!this.pttHeld && this.mode === 'ptt') void this.start()
    this.pttHeld = true
  }
  pressUp(): void {
    this.pttHeld = false
    if (this.mode === 'ptt') void this.stop()
  }

  async start(): Promise<void> {
    try {
      this.setState('starting')
      if (!this.ctx) await this.openMic()

      const c = this.ctx!
      c.chunks = []
      c.recorder.start()
      c.recording = true
      c.startTime = performance.now()
      this.silenceStart = 0
      this.inSilence = false
      this.setState('listening')

      // Loop de análisis con requestAnimationFrame
      const loop = () => {
        if (!this.ctx || !this.ctx.recording) return
        const rms = this.computeRms(c)
        const elapsed = performance.now() - c.startTime
        // PTT: nunca corta por silencio (el usuario decide con la tecla)
        if (this.mode === 'handsfree') {
          if (rms < UMBRAL_SILENCIO) {
            if (!this.inSilence) { this.inSilence = true; this.silenceStart = performance.now() }
            const silMs = performance.now() - this.silenceStart
            if (silMs >= SILENCIO_FINAL_MS && elapsed > MIN_DURACION_MS) {
              void this.stop()
              return
            }
          } else {
            this.inSilence = false
          }
        }
        if (elapsed >= MAX_DURACION_MS) {
          void this.stop()
          return
        }
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    } catch (e) {
      const err = e as Error
      if (err.name === 'NotAllowedError') this.setState('denied')
      else this.setState('error')
      this.handlers.onError?.(err)
    }
  }

  async stop(): Promise<void> {
    if (!this.ctx || !this.ctx.recording) {
      this.setState('idle')
      return
    }
    const ctx = this.ctx
    ctx.recording = false
    const elapsed = performance.now() - ctx.startTime
    const tooShort = elapsed < MIN_DURACION_MS

    // Detiene el MediaRecorder; la conversión a WAV se completa en su onstop
    await new Promise<void>((resolve) => {
      const rec = ctx.recorder
      const onStop = () => {
        rec.removeEventListener('stop', onStop)
        resolve()
      }
      rec.addEventListener('stop', onStop)
      if (rec.state !== 'inactive') rec.stop()
      else resolve()
    })

    if (tooShort) {
      this.setState('idle')
      if (this.mode === 'handsfree') setTimeout(() => void this.start(), 100)
      return
    }

    try {
      const wav = await this.flushChunksToWav(ctx)
      if (wav && wav.byteLength > 44 + 32) this.handlers.onChunk?.(wav)
    } catch (e) {
      this.handlers.onError?.(e as Error)
    } finally {
      this.setState('idle')
      if (this.mode === 'handsfree') setTimeout(() => void this.start(), 150)
    }
  }

  private async flushChunksToWav(ctx: InternalCtx): Promise<ArrayBuffer | null> {
    if (ctx.chunks.length === 0) return null
    const blob = new Blob(ctx.chunks, { type: ctx.mimeType })
    const buf = await blob.arrayBuffer()
    const decoded = await ctx.audioCtx.decodeAudioData(buf.slice(0))
    return audioBufferToWav(decoded)
  }

  destroy(): void {
    this.detachKeyboard()
    if (this.handsfreeTimer !== null) {
      clearTimeout(this.handsfreeTimer)
      this.handsfreeTimer = null
    }
    if (this.ctx) {
      this.ctx.stream.getTracks().forEach((t) => t.stop())
      void this.ctx.audioCtx.close().catch(() => {})
      this.ctx = null
    }
  }

  private async openMic(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        sampleRate: this.sampleRate,
      },
    })
    const audioCtx = new AudioContext({ sampleRate: this.sampleRate })
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.3
    source.connect(analyser)

    const mimeType = pickMimeType()
    if (!mimeType) throw new Error('MimeType de grabación no soportado')
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

    this.ctx = {
      audioCtx,
      stream,
      source,
      analyser,
      startTime: 0,
      recording: false,
      rmsBuf: new Float32Array(analyser.fftSize),
      recorder,
      chunks,
      mimeType,
    }
  }

  private computeRms(c: InternalCtx): number {
    const buf = c.rmsBuf as Float32Array<ArrayBuffer>
    c.analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < c.rmsBuf.length; i++) sum += c.rmsBuf[i] * c.rmsBuf[i]
    return Math.sqrt(sum / c.rmsBuf.length)
  }

  private setState(s: VoiceCaptureState): void {
    if (this.state === s) return
    this.state = s
    this.handlers.onState?.(s)
  }
}

function pickMimeType(): string | null {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return null
}

/**
 * Convierte AudioBuffer → WAV PCM 16-bit LE mono (resampleado si hace falta).
 * El AudioBuffer ya fue decodificado por AudioContext.decodeAudioData.
 */
export function audioBufferToWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels
  const sr = buf.sampleRate
  const length = buf.length

  // Mezclar a mono si es estéreo
  let mono = buf.getChannelData(0)
  if (numCh > 1) {
    mono = new Float32Array(length)
    for (let ch = 0; ch < numCh; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < length; i++) mono[i] += data[i] / numCh
    }
  }

  const out = floatTo16PCM(mono)
  return wrapWav(out.buffer as ArrayBuffer, sr, 1, 16)
}

function floatTo16PCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function wrapWav(pcm: ArrayBuffer, sampleRate: number, channels: number, bits: number): ArrayBuffer {
  const dataSize = pcm.byteLength
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  const ws = (off: number, st: string) => { for (let i = 0; i < st.length; i++) view.setUint8(off + i, st.charCodeAt(i)) }
  ws(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE'); ws(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, (sampleRate * channels * bits) / 8, true)
  view.setUint16(32, (channels * bits) / 8, true); view.setUint16(34, bits, true)
  ws(36, 'data'); view.setUint32(40, dataSize, true)
  new Uint8Array(buf, 44).set(new Uint8Array(pcm))
  return buf
}