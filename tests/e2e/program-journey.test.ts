/**
 * E2E de navegador (Bun.WebView + Chromium): alumno crea su programa, lo juega (modo juego 3D y vista clásica),
 * se adapta con refuerzo, termina, y el docente lo valida. Planificador y adaptador simulados (ver fakes.ts).
 *
 *   bun run build:ui && RUN_WEBVIEW_TESTS=1 bun test tests/e2e/program-journey.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Browser, E2E_ENABLED, chromePath, startStack, type Stack } from './harness'
import { CORRECT, WRONG, fakeProgramDeps } from './fakes'

const suite = E2E_ENABLED ? describe : describe.skip

suite('E2E navegador: programa por niveles y juego', () => {
  let stack: Stack, b: Browser, log: ReturnType<typeof fakeProgramDeps>['log']
  const finished: string[] = []

  beforeAll(async () => {
    expect(chromePath()).not.toBeNull()
    const deps = fakeProgramDeps()
    log = deps.log
    stack = await startStack(deps)
    b = await Browser.launch(`http://127.0.0.1:${new URL(stack.base).port}`)
  }, 60000)
  afterAll(async () => { b?.close(); await stack?.close() })

  // ---- utilidades de pantalla --------------------------------------------------------------------------------------
  const intentFormVisible = () => b.waitForText('¿Qué quieres aprender hoy?')
  async function enter(nickname: string, mode: 'game' | 'classic', e2eHook = false, session = false) {
    const student = await stack.addStudent(nickname, { session })
    await b.fresh({ mode, e2eHook })
    await b.login(nickname, 'Alumno')
    await intentFormVisible()
    return student
  }
  async function createProgram() {
    await b.fill('Tema', 'SQL básico')
    await b.fill('¿Para qué lo quieres?', 'consultar los datos de mi trabajo')
    await b.click('Crear mi programa')
    await b.waitForText('Objetivo:')
  }
  const stats = () => b.eval<string>(`document.querySelector('ul[aria-label="Tu avance"]')?.innerText ?? ''`)
  const chips = () => b.eval<Array<{ text: string; visual: string; pressed: boolean }>>(`[...document.querySelectorAll('nav[aria-label^="Celdas del nivel"] .cell-chip')].map(c => ({ text: c.innerText.replace(/\\s+/g, ' ').trim(), visual: [...c.classList].find(x => x.startsWith('cell-chip--') && x !== 'cell-chip--on')?.slice(11) ?? '', pressed: c.getAttribute('aria-pressed') === 'true' }))`)
  const isGate = (text: string) => text.startsWith('🚪') || text.startsWith('👑')

  /** Juego: abre cada celda del nivel actual, elige la opción y comprueba; luego abre la compuerta. */
  async function playGameLevel(choice: number) {
    const cells = (await chips()).filter(c => !isGate(c.text))
    expect(cells.length).toBeGreaterThan(0)
    for (let i = 0; i < cells.length; i++) {
      await b.eval(`document.querySelectorAll('nav[aria-label^="Celdas del nivel"] .cell-chip')[${i}].click()`)
      await b.waitFor(`document.querySelector('article.node h3')?.textContent.trim() === ${JSON.stringify(cells[i].text.replace(/\s*(Pendiente|Lograda|Para reforzar)$/, ''))}`, `Panel de la celda ${i + 1}`)
      await b.waitFor(`!document.querySelector('.node__explain')?.textContent.includes('Preparando la explicación')`, 'Explicación de la celda')
      await b.pick(choice)
      await b.click('Comprobar')
      await b.waitFor(`document.querySelector('article.node .notice') !== null`, `Respuesta de la celda ${i + 1}`)
      const feedback = await b.eval<string>(`document.querySelector('article.node .notice').innerText`)
      if (choice === CORRECT) expect(feedback).toContain('¡Correcto! La celda se llenó de miel.')
      else expect(feedback).not.toContain('¡Correcto!')
    }
    const after = await chips()
    for (const c of after.filter(c => !isGate(c.text))) expect(c.visual).toBe(choice === CORRECT ? 'mastered' : c.visual)
  }
  async function openGate() {
    const index = (await chips()).findIndex(c => isGate(c.text))
    await b.eval(`document.querySelectorAll('nav[aria-label^="Celdas del nivel"] .cell-chip')[${index}].click()`)
    await b.click('Abrir la compuerta').catch(async () => b.click('Terminar el programa'))
  }
  async function playToEnd(choice: number, startedLevel = 1, maxLevels = 6) {
    for (let guard = 0; guard < maxLevels; guard++) {
      if ((await b.text()).includes('Programa terminado')) return
      await playGameLevel(choice)
      await b.screenshot(`game-level-${startedLevel + guard}-played`)
      await openGate()
      await b.waitFor(`document.body.innerText.includes('Programa terminado') || document.querySelector('.notice')?.innerText.match(/Nivel superado|reforzar|adaptó|docente revisará/)`, 'Resultado del checkpoint')
    }
  }

  // ---- escenarios ---------------------------------------------------------------------------------------------------
  test('A · vista clásica: crear, responder, cerrar nivel y avanzar', async () => {
    await enter('clasica', 'classic')
    await createProgram()
    await b.waitFor(`document.querySelector('ol[aria-label="Niveles del programa"] [aria-current="step"]')?.innerText.includes('Fundamentos')`, 'Nivel 1 activo')
    expect(await b.eval(`document.querySelector('[aria-label="Cómo ver tu programa"]') !== null`)).toBe(true)
    for (let level = 0; level < 3; level++) {
      const count = await b.eval<number>(`document.querySelectorAll('li.card.node').length`)
      expect(count).toBeGreaterThan(0)
      for (let i = 0; i < count; i++) {
        const scope = `document.querySelectorAll('li.card.node')[${i}]`
        await b.eval(`${scope}.querySelectorAll('input[type=radio]')[${CORRECT}].click()`)
        await b.click('Comprobar', scope)
        await b.waitFor(`${scope}.innerText.includes('Lograd')`, `Nodo ${i + 1} logrado`)
      }
      if (level === 0) await b.screenshot('classic-level-1-done')
      await b.click(level === 2 ? 'Terminar el programa' : 'Cerrar este nivel')
      if (level < 2) await b.waitFor(`document.querySelector('ol[aria-label="Niveles del programa"] [aria-current="step"]')?.innerText.includes(${JSON.stringify(level === 0 ? 'Filtrar y ordenar' : 'Evaluación final')})`, `Nivel ${level + 2} activo`)
    }
    await b.waitForText('Crear un programa nuevo')
    await b.screenshot('classic-finished')
    finished.push('clasica')
  }, 120000)

  test('B · juego: camino feliz de 3 niveles hasta «Programa terminado»', async () => {
    await enter('juego', 'game')
    await createProgram()
    await b.waitFor(`document.querySelector('[data-testid="game-canvas"]') !== null`, 'Lienzo del juego')
    expect(Number(await b.eval(`document.querySelector('[data-testid="game-canvas"]').dataset.worldCells`))).toBeGreaterThanOrEqual(3)
    expect(await b.eval(`(() => { const c = document.createElement('canvas'); return !!c.getContext('webgl2') })()`)).toBe(true)
    expect(await stats()).toMatch(/Nivel 1\/3/)
    expect(await stats()).toMatch(/0\/3 logradas/)
    await b.screenshot('game-start')

    await playGameLevel(CORRECT)
    expect(await stats()).toMatch(/3\/3 logradas/)
    expect(await stats()).toMatch(/[1-9]\d*\s*miel/)
    await openGate()
    // El aviso del checkpoint y el de adaptación se muestran juntos.
    await b.waitFor(`/Nivel 2\\/3/.test(document.querySelector('ul[aria-label="Tu avance"]')?.innerText ?? '')`, 'Pasó al nivel 2')
    await b.waitFor(`/¡Nivel superado!.*Tu programa se adaptó: se añadieron 3 celdas nuevas/s.test(document.querySelector('.notice')?.innerText ?? '')`, 'Aviso de nivel superado y adaptación')
    expect(await stats()).toMatch(/Nivel 2\/3/)
    expect(await stats()).toMatch(/0\/3 logradas/)
    await b.screenshot('game-level-2-open')

    await playToEnd(CORRECT, 2)
    await b.waitForText('Programa terminado')
    expect(await b.text()).toContain('Queda pendiente de la validación de tu docente')
    expect(await b.text()).toContain('100 puntos')
    await b.screenshot('game-finished')
    finished.push('juego')
    expect(log.planned).toBeGreaterThanOrEqual(2)
  }, 180000)

  test('C · juego: fallar el primer nivel inserta un refuerzo y el programa termina', async () => {
    await enter('refuerzo', 'game')
    await createProgram()
    await b.waitFor(`document.querySelector('[data-testid="game-canvas"]') !== null`, 'Lienzo del juego')
    const cellsAtStart = Number(await b.eval(`document.querySelector('[data-testid="game-canvas"]').dataset.worldCells`))

    await playGameLevel(WRONG)
    await openGate()
    await b.waitFor(`/Nivel 2\\/4/.test(document.querySelector('ul[aria-label="Tu avance"]')?.innerText ?? '')`, 'El plan creció a 4 niveles')
    await b.waitFor(`/Vamos a reforzar.*nuevo refuerzo "Refuerzo"/s.test(document.querySelector('.notice')?.innerText ?? '') && !document.querySelector('.notice').innerText.includes('Evaluación final')`, 'Aviso de refuerzo que nombra al refuerzo')
    await b.waitFor(`[...document.querySelectorAll('nav[aria-label^="Celdas del nivel"] .cell-chip')].some(c => c.innerText.includes('Repaso de la consulta'))`, 'Celdas del refuerzo')
    expect(Number(await b.eval(`document.querySelector('[data-testid="game-canvas"]').dataset.worldCells`))).toBeGreaterThan(cellsAtStart)
    await b.screenshot('game-reinforcement')

    await playToEnd(CORRECT, 2, 6)
    await b.waitForText('Programa terminado')
    await b.screenshot('game-finished-after-reinforcement')
    finished.push('refuerzo')
    expect(log.adapted.some(a => a.decision === 'hold')).toBe(true)
  }, 240000)

  test('D · clic real sobre el lienzo WebGL abre la celda correcta', async () => {
    await enter('lienzo', 'game', true)
    await createProgram()
    await b.waitFor(`window.__hive && window.__hive.cells().length >= 3`, 'Gancho __hive listo')
    await Bun.sleep(1500) // deja que la cámara se asiente

    const target = (await b.eval<Array<{ id: string; kind: string; level: number }>>(`window.__hive.cells()`)).filter(c => c.kind === 'node' && c.level === 0).at(-1)!
    const title = await b.eval<string>(`(() => { const idx = window.__hive.cells().filter(c => c.level === 0).findIndex(c => c.id === ${JSON.stringify(target.id)}); return document.querySelectorAll('nav[aria-label^="Celdas del nivel"] .cell-chip')[idx].innerText.split('\\n')[0].trim() })()`)
    let opened = false
    for (let attempt = 0; attempt < 6 && !opened; attempt++) {
      const at = await b.eval<{ x: number; y: number } | null>(`window.__hive.screenPosition(${JSON.stringify(target.id)})`)
      expect(at).not.toBeNull()
      await b.view.click(Math.round(at!.x), Math.round(at!.y))
      await Bun.sleep(400)
      opened = await b.eval<boolean>(`document.querySelector('article.node h3')?.textContent.trim() === ${JSON.stringify(title)}`)
    }
    expect(opened).toBe(true)
    await b.screenshot('game-canvas-click')

    // Y la vista general no rompe el estado.
    await b.click('Vista general')
    expect(await b.eval(`[...document.querySelectorAll('button')].some(x => x.innerText.trim() === 'Seguir mi isla' && x.getAttribute('aria-pressed') === 'true')`)).toBe(true)
    await b.click('Seguir mi isla')
  }, 120000)

  test('E · docente: valida los programas terminados y queda la bitácora ordenada', async () => {
    const queue = await stack.call('/programs/review-queue', { cookie: stack.teacherCookie })
    const ids: string[] = queue.data.queue.map((q: { id: string }) => q.id)
    expect(ids.length).toBe(finished.length)

    await b.fresh()
    await b.login('maestra', 'Docente')
    await b.go('Validaciones')
    await b.waitForText('Validaciones')
    for (let i = 0; i < finished.length; i++) {
      await b.click('Revisar')
      await b.fill('Nota', 'Evidencia suficiente en la práctica del alumno')
      await b.screenshot(`teacher-review-${i + 1}`)
      await b.click('Guardar decisión')
      await b.waitFor(`document.querySelector('.review__form') === null`, 'Revisión guardada')
    }
    await b.waitForText('No hay programas pendientes de validar.')
    await b.screenshot('teacher-queue-empty')

    for (const id of ids) {
      const program = await stack.call(`/programs/${id}`, { cookie: stack.teacherCookie })
      expect(program.data.program.validation).toBe('validated')
      const { thread } = (await stack.call(`/programs/${id}/trace`, { cookie: stack.teacherCookie })).data
      const types: string[] = thread.timeline.map((e: { type: string }) => e.type)
      expect(types[0]).toBe('intent')
      expect(types.at(-1)).toBe('validation')
      expect(types.indexOf('answer')).toBeLessThan(types.indexOf('checkpoint'))
    }
    expect((await stack.call('/programs/review-queue', { cookie: stack.teacherCookie })).data.queue).toEqual([])
  }, 120000)

  test('F · seguridad y adaptación: sin sesión 401, docente no responde y el móvil no desborda', async () => {
    expect((await stack.call('/programs/active', { allowError: true })).status).toBe(401)
    expect((await stack.call('/programs/active', { cookie: stack.teacherCookie, allowError: true })).status).toBe(403)

    await enter('movil', 'game')
    await createProgram()
    await b.waitFor(`document.querySelector('[data-testid="game-canvas"]') !== null`, 'Lienzo del juego')
    await b.view.resize(390, 844)
    await Bun.sleep(500)
    expect(await b.eval<boolean>(`document.documentElement.scrollWidth <= window.innerWidth + 1`)).toBe(true)
    await b.screenshot('game-mobile')
    await b.view.resize(1280, 900)

    // Un segundo programa mientras hay uno activo se rechaza (409) incluso por API.
    const student = await stack.addStudent('movil.api', { session: true })
    expect((await stack.call('/programs', { data: { topic: 'SQL', goal: 'consultar datos', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado' }, cookie: student.cookie })).status).toBe(201)
    const second = await stack.call('/programs', { data: { topic: 'SQL', goal: 'consultar datos', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado' }, cookie: student.cookie, allowError: true })
    expect(second.status).toBe(409)
  }, 120000)

  test('G · sin WebGL el programa cae a la vista clásica; cerrar la sesión de estudio libera al alumno', async () => {
    const student = await enter('sinwebgl', 'game', false, true)
    await b.eval(`HTMLCanvasElement.prototype.getContext = () => null`)
    await createProgram()
    await b.waitFor(`document.querySelector('ol[aria-label="Niveles del programa"]') !== null`, 'Vista clásica de reserva')
    expect(await b.eval(`document.querySelector('[aria-label="Cómo ver tu programa"]') === null && document.querySelector('canvas') === null`)).toBe(true)
    await b.screenshot('no-webgl-fallback')

    await b.click('Cerrar sesión')
    await intentFormVisible()
    const active = await stack.call('/programs/active', { cookie: student.cookie })
    expect(active.data.program).toBeNull()
  }, 120000)

  test('H · teclado y sonido: el dron se mueve, [ ] cambia de celda, E abre y el sonido se activa y se recuerda', async () => {
    await enter('teclado', 'game', true)
    await createProgram()
    await b.waitFor(`window.__hive && window.__hive.cells().length >= 3 && window.__hive.focused() !== null`, 'Dron enfocando la primera celda')
    await b.eval(`document.querySelector('[data-testid="game-canvas"]').focus()`)
    const where = () => b.eval<{ x: number; z: number }>(`window.__hive.dronePosition()`)
    const key = (type: 'keydown' | 'keyup', k: string) => b.eval(`document.querySelector('[data-testid="game-canvas"]').dispatchEvent(new KeyboardEvent('${type}', { key: '${k}', bubbles: true, cancelable: true }))`)

    // Mantener una tecla mueve al dron: alguna de las cuatro direcciones tiene baldosa y debe desplazarlo.
    let best = 0
    for (const k of ['d', 's', 'a', 'w']) {
      const from = await where()
      await key('keydown', k); await Bun.sleep(450); await key('keyup', k)
      await Bun.sleep(250)
      const to = await where()
      best = Math.max(best, Math.hypot(to.x - from.x, to.z - from.z))
    }
    expect(best).toBeGreaterThan(0.4)
    await b.screenshot('game-keyboard-moved')

    // ] lleva al dron a otra celda y E la abre.
    const before = await b.eval<string>(`window.__hive.focused()`)
    await b.view.press(']')
    await b.waitFor(`window.__hive.focused() !== ${JSON.stringify(before)} && window.__hive.focused() !== null`, 'Foco en otra celda')
    const focused = await b.eval<string>(`window.__hive.focused()`)
    await b.view.press('e')
    const opened = (await chips()).find(c => c.pressed)
    expect(opened).toBeDefined()
    await b.waitFor(`document.querySelector('nav[aria-label^="Celdas del nivel"] .cell-chip[aria-pressed="true"]') !== null`, 'Celda abierta')
    expect(focused).not.toBe(before)
    expect(await b.eval(`document.querySelector('[role="status"][aria-live="polite"].sr-only')?.textContent.length > 0`)).toBe(true)

    // Sonido: empieza silenciado; al activarlo se guarda la preferencia.
    expect(await b.text()).toContain('Activar sonido')
    await b.click('🔇 Activar sonido')
    await b.waitForText('Silenciar')
    expect(JSON.parse(await b.eval<string>(`localStorage.getItem('hivelearn.audio')`)).muted).toBe(false)
    await b.click('🔊 Silenciar')
    expect(JSON.parse(await b.eval<string>(`localStorage.getItem('hivelearn.audio')`)).muted).toBe(true)
  }, 120000)

  test('I · joystick táctil: arrastrar la palanca mueve al dron y soltarla lo detiene', async () => {
    await enter('palanca', 'game', true)
    await b.eval(`localStorage.setItem('hivelearn.joystick', '1')`)
    await createProgram()
    await b.waitFor(`window.__hive && document.querySelector('[data-testid="joystick"]') !== null`, 'Palanca visible')
    const where = () => b.eval<{ x: number; z: number }>(`window.__hive.dronePosition()`)
    const fire = (type: string, dx: number, dy: number) => b.eval(`(() => { const el = document.querySelector('[data-testid="joystick"]'); const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; el.dispatchEvent(new PointerEvent('${type}', { pointerId: 7, clientX: cx + ${dx}, clientY: cy + ${dy}, bubbles: true })); return true })()`)
    let best = 0
    for (const [dx, dy] of [[48, 0], [0, 48], [-48, 0], [0, -48]]) {
      const from = await where()
      await fire('pointerdown', dx!, dy!); await Bun.sleep(450); await fire('pointerup', 0, 0)
      await Bun.sleep(300)
      const to = await where()
      best = Math.max(best, Math.hypot(to.x - from.x, to.z - from.z))
    }
    expect(best).toBeGreaterThan(0.4)
    const rest = await where()
    await Bun.sleep(400)
    const later = await where()
    expect(Math.hypot(later.x - rest.x, later.z - rest.z)).toBeLessThan(0.05)
  }, 120000)
})
