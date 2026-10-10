import { describe, expect, test } from 'bun:test'
import { advanceOnboarding } from './engine'
import { nextField, normalizeOnboardingFields, normalizeTiempo, parseField } from './fields'

const ok = (field: Parameters<typeof parseField>[0], text: string) => { const r = parseField(field, text); return r.ok ? r.value : null }

describe('parseField', () => {
  test('apodo y nombre con frases naturales', () => {
    expect(ok('nickname', 'mi apodo es abeja_azul')).toBe('abeja_azul')
    expect(ok('nickname', 'Zorro')).toBe('Zorro')
    expect(ok('nickname', 'a')).toBeNull()
    expect(ok('nickname', 'quiero que me digan algo muy largo con muchas palabras')).toBeNull()
    expect(ok('nombre', 'Me llamo Ana María')).toBe('Ana María')
    expect(ok('nombre', '12345')).toBeNull()
  })
  test('edad dentro de un rango razonable', () => {
    expect(ok('edad', 'tengo 12 años')).toBe('12')
    expect(ok('edad', '2')).toBeNull()
    expect(ok('edad', 'muchos')).toBeNull()
  })
  test('opciones cerradas y minutos', () => {
    expect(ok('energia', 'ando cansado')).toBe('baja')
    expect(ok('energia', 'con todo!')).toBe('alta')
    expect(ok('energia', 'más o menos')).toBeNull()
    expect(ok('estilo', 'prefiero leyendo')).toBe('lectura')
    expect(ok('estilo', 'con retos')).toBe('retos')
    expect(ok('tiempo_disponible', 'media hora')).toBe('30')
    expect(ok('tiempo_disponible', 'unos 20 minutos')).toBe('20')
    expect(ok('tiempo_disponible', 'no sé')).toBeNull()
    expect(normalizeTiempo('20')).toBe(15)
    expect(normalizeTiempo('40')).toBe(45)
  })
})

describe('advanceOnboarding', () => {
  const script = ['abeja', 'Ana', '30', 'SQL básico', 'trabajar con datos', 'alta', '20', 'visual']

  test('recorre los 8 campos en orden y entrega el perfil normalizado', async () => {
    let fields = {} as Parameters<typeof advanceOnboarding>[0]
    let last
    for (const answer of script) {
      last = await advanceOnboarding(fields, answer)
      fields = last.fields
    }
    expect(last!.pending).toBeNull()
    expect(last!.complete).toMatchObject({
      energia: 'alta', tiempoDisponible: 15, meta: 'SQL básico — trabajar con datos',
      perfil: { nickname: 'abeja', nombre: 'Ana', edad: 30, rangoEdad: 'adulto', estilo: 'visual' },
    })
  })

  test('una respuesta inválida no avanza y explica qué falta', async () => {
    const r = await advanceOnboarding({ nickname: 'abeja', nombre: 'Ana' }, 'no sé')
    expect(r.saved).toBeUndefined()
    expect(r.pending).toBe('edad')
    expect(r.reply).toContain('edad')
  })

  test('la voz redacta la pregunta, pero nunca decide el campo; si falla se usa la fija', async () => {
    const voiced = await advanceOnboarding({}, 'abeja', { voice: async ({ field }) => `¡Hola! (${field}) ¿cómo te llamas?` })
    expect(voiced.pending).toBe('nombre')
    expect(voiced.reply).toContain('¿cómo te llamas?')
    const broken = await advanceOnboarding({}, 'abeja', { voice: async () => { throw new Error('modelo caído') } })
    expect(broken.reply).toBe('¿Cómo te llamas?')
    const empty = await advanceOnboarding({}, 'abeja', { voice: async () => '   ' })
    expect(empty.reply).toBe('¿Cómo te llamas?')
  })

  test('una respuesta ambigua de opción cerrada se clasifica; si no, se vuelve a preguntar', async () => {
    const base = { nickname: 'a1b', nombre: 'Ana', edad: '30', tema: 'x1', objetivo: 'y1' }
    const classified = await advanceOnboarding(base, 'depende del día', { classify: async () => 'media' })
    expect(classified.saved).toEqual({ key: 'energia', value: 'media' })
    const unknown = await advanceOnboarding(base, 'depende del día', { classify: async () => null })
    expect(unknown.saved).toBeUndefined()
    expect(unknown.pending).toBe('energia')
    // Una clasificación inválida del modelo se rechaza.
    const bogus = await advanceOnboarding(base, 'depende', { classify: async () => 'altísima y radiante' })
    expect(bogus.saved).toBeUndefined()
  })

  test('alumno conocido: no se pregunta nombre ni edad y el perfil los toma de él', async () => {
    const known = { nombre: 'Luis', edad: 14 }
    expect(nextField({ nickname: 'luis' }, known)).toBe('tema')
    let fields: Record<string, string> = { nickname: 'luis' }
    let last
    for (const answer of ['robots', 'construir uno', 'media', '30', 'retos']) {
      last = await advanceOnboarding(fields, answer, {}, known)
      fields = last.fields as Record<string, string>
    }
    expect(last!.complete!.perfil).toMatchObject({ nombre: 'Luis', edad: 14, rangoEdad: 'adolescente', estilo: 'retos' })
  })

  test('sin edad declarada el perfil sale en la banda restrictiva (no adulto)', () => {
    expect(normalizeOnboardingFields({ nickname: 'x', tema: 't' }).perfil).toMatchObject({ edad: 0, rangoEdad: 'nino' })
  })
})
