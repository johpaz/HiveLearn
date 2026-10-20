import { describe, expect, test } from 'bun:test'
import { AUDIO_KEY, GameAudio, loadPrefs, type PrefStore } from './audio'
import { pickVoice } from './speech'

function memory(): PrefStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) } }
}

class FakeParam { value = 0; setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
function fakeContext() {
  const made = { oscillators: 0, started: 0, resumed: 0, closed: 0 }
  const node = () => ({ connect() {}, gain: new FakeParam(), frequency: new FakeParam(), detune: new FakeParam(), type: '', start() { made.started++ }, stop() {} })
  const ctx = {
    currentTime: 0, destination: {},
    createGain: node, createBiquadFilter: node,
    createOscillator: () => { made.oscillators++; return node() },
    resume: async () => { made.resumed++ }, close: async () => { made.closed++ },
  }
  return { ctx: ctx as unknown as AudioContext, made }
}

describe('preferencias de audio', () => {
  test('por defecto está silenciado y con volumen medio; un valor corrupto no rompe', () => {
    expect(loadPrefs(memory())).toEqual({ muted: true, volume: 0.6 })
    const bad = memory(); bad.setItem(AUDIO_KEY, '{no es json')
    expect(loadPrefs(bad)).toEqual({ muted: true, volume: 0.6 })
    const wild = memory(); wild.setItem(AUDIO_KEY, JSON.stringify({ muted: false, volume: 9 }))
    expect(loadPrefs(wild)).toEqual({ muted: false, volume: 0.6 })
  })
})

describe('GameAudio', () => {
  test('silenciado no crea contexto ni suena: el navegador no ve audio hasta que el jugador lo pide', () => {
    const { ctx, made } = fakeContext()
    const audio = new GameAudio(() => ctx, memory())
    audio.sfx('ok'); audio.setThrust(5)
    expect(audio.active).toBe(false)
    expect(made.oscillators).toBe(0)
  })

  test('al activar el sonido se crea el contexto una sola vez, arranca el ambiente y se recuerda la elección', () => {
    const { ctx, made } = fakeContext()
    const store = memory()
    const audio = new GameAudio(() => ctx, store)
    audio.setMuted(false)
    expect(audio.active).toBe(true)
    const ambient = made.oscillators
    expect(ambient).toBeGreaterThanOrEqual(3)
    expect(made.resumed).toBe(1)
    audio.sfx('ok')
    expect(made.oscillators).toBe(ambient + 4) // arpegio de cuatro notas
    audio.sfx('bad')
    expect(made.oscillators).toBe(ambient + 5)
    expect(JSON.parse(store.data.get(AUDIO_KEY)!)).toEqual({ muted: false, volume: 0.6 })
    expect(new GameAudio(() => ctx, store).muted).toBe(false)
  })

  test('volver a silenciar deja de generar efectos y el volumen se acota', () => {
    const { ctx, made } = fakeContext()
    const audio = new GameAudio(() => ctx, memory())
    audio.setMuted(false)
    audio.setMuted(true)
    const before = made.oscillators
    audio.sfx('level')
    expect(made.oscillators).toBe(before)
    audio.setVolume(5)
    expect(audio.volume).toBe(1)
    audio.setVolume(-1)
    expect(audio.volume).toBe(0)
  })

  test('sin Web Audio en el navegador no falla', () => {
    const audio = new GameAudio(() => null, memory())
    audio.setMuted(false)
    expect(() => audio.sfx('gate')).not.toThrow()
    expect(audio.active).toBe(false)
  })
})

describe('pickVoice', () => {
  const voices = [{ lang: 'en-US', name: 'a' }, { lang: 'es-ES', name: 'b' }, { lang: 'es-MX', name: 'c' }]
  test('prefiere español latino, luego cualquier español, y nada si no hay', () => {
    expect(pickVoice(voices)?.name).toBe('c')
    expect(pickVoice(voices.slice(0, 2))?.name).toBe('b')
    expect(pickVoice(voices.slice(0, 1))).toBeNull()
  })
})
