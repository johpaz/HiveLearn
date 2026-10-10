import { describe, expect, test } from 'bun:test'
import { handleOnboardingMessage, type OnboardingContext } from './handler'
import type { StudentProfile } from '../types'

function harness(options: { students?: Record<string, StudentProfile>; voice?: (field: string, fallback: string) => string | Error } = {}) {
  const sent: any[] = []
  const messages: Array<{ role: string; content: string }> = []
  let fields: Record<string, string> = {}
  let completed: any = null
  const students = options.students ?? {}
  const cache = new Map<string, StudentProfile>()
  const persistence = {
    saveOnboardingMessage: async (_s: string, role: string, content: string) => { messages.push({ role, content }) },
    getOnboardingMessages: async () => messages.map(m => ({ role: m.role, content: m.content })),
    getOnboardingProgress: async () => ({ camposCompletados: fields }),
    saveOnboardingProgress: async (_s: string, _k: string, _key: string, _v: string, all: Record<string, string>) => { fields = { ...all } },
    completeOnboarding: async (_s: string, perfil: unknown, meta: string) => { completed = { perfil, meta } },
    findStudentByNickname: async (nick: string) => students[nick.toLowerCase()] ?? null,
    getActiveSession: async () => null,
    getSessionWithCurriculum: async () => null,
    restoreSessionState: async () => null,
    // buildSessionContext consulta estas dos al iniciar.
    getStudentProfile: async () => null,
    getRecentSessions: async () => [],
  }
  const run = (data: OnboardingContext['data']) => handleOnboardingMessage({
    send: m => sent.push(m), sessionId: 's1', data, persistence: persistence as never, profileCache: cache,
    depsFor: async () => ({
      voice: async ({ field, fallback }) => {
        const v = options.voice?.(field, fallback)
        if (v instanceof Error) throw v
        return v ?? null
      },
    }),
  })
  return { run, sent, messages, get fields() { return fields }, get completed() { return completed }, cache }
}

describe('handleOnboardingMessage', () => {
  test('flujo completo sin modelo: preguntas fijas, campos guardados y perfil final', async () => {
    const h = harness()
    await h.run({ type: 'init' })
    expect(h.sent.some(m => m.type === 'agent_message' && String(m.text).includes('apodo'))).toBe(true)

    for (const answer of ['abeja', 'Ana', 'tengo 30 años', 'SQL básico', 'trabajar con datos', 'alta', '20 minutos', 'visual']) {
      await h.run({ type: 'user_message', text: answer })
    }
    const complete = h.sent.find(m => m.type === 'complete')
    expect(complete).toMatchObject({ energia: 'alta', tiempoDisponible: 15, meta: 'SQL básico — trabajar con datos' })
    expect(complete.perfil).toMatchObject({ nickname: 'abeja', nombre: 'Ana', edad: 30, rangoEdad: 'adulto' })
    expect(h.sent.filter(m => m.type === 'field_saved').map(m => m.fieldKey)).toEqual(
      ['nickname', 'nombre', 'edad', 'tema', 'objetivo', 'energia', 'tiempo_disponible', 'estilo'])
  })

  test('el modelo caído o prohibido por la política no rompe el flujo', async () => {
    const h = harness({ voice: () => new Error('provider_not_allowed') })
    await h.run({ type: 'init' })
    await h.run({ type: 'user_message', text: 'abeja' })
    expect(h.sent.at(-1)).toMatchObject({ type: 'agent_message', text: '¿Cómo te llamas?' })
  })

  test('una respuesta inválida no guarda nada y se pide de nuevo', async () => {
    const h = harness()
    await h.run({ type: 'init' })
    await h.run({ type: 'user_message', text: 'abeja' })
    await h.run({ type: 'user_message', text: 'Ana' })
    await h.run({ type: 'user_message', text: 'no sé' })
    expect(h.fields.edad).toBeUndefined()
    expect(String(h.sent.at(-1).text)).toContain('edad')
  })

  test('alumno existente por nickname: no se le vuelve a preguntar nombre ni edad', async () => {
    const luis = { alumnoId: 'a1', nickname: 'luis', nombre: 'Luis', edad: 14, rangoEdad: 'adolescente', xpAcumulado: 40, nivelActual: 'Aprendiz' } as StudentProfile
    const h = harness({ students: { luis } })
    await h.run({ type: 'init' })
    await h.run({ type: 'user_message', text: 'luis' })
    expect(h.sent.some(m => m.type === 'student_found')).toBe(true)
    expect(String(h.sent.at(-1).text)).toContain('Luis')
    expect(String(h.sent.at(-1).text)).toContain('aprender')
    for (const answer of ['robots', 'construir uno', 'media', '30', 'retos']) await h.run({ type: 'user_message', text: answer })
    expect(h.completed.perfil).toMatchObject({ nombre: 'Luis', edad: 14, rangoEdad: 'adolescente' })
  })

  test('reanudar: repite la pregunta pendiente', async () => {
    const h = harness()
    await h.run({ type: 'init' })
    await h.run({ type: 'user_message', text: 'abeja' })
    h.sent.length = 0
    await h.run({ type: 'init' })
    expect(h.sent.map(m => m.type)).toEqual(['resumed', 'agent_message'])
    expect(h.sent[1].text).toBe('¿Cómo te llamas?')
  })

  test('mensajes que no son del usuario o vacíos se ignoran', async () => {
    const h = harness()
    await h.run({ type: 'ping' } as never)
    await h.run({ type: 'user_message', text: '' })
    expect(h.sent).toHaveLength(0)
  })
})
