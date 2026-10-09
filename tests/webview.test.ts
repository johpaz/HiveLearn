import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface NativeView {
  navigate(url: string): Promise<void>; evaluate(script: string): Promise<unknown>
  screenshot(): Promise<Blob>; resize(width: number, height: number): Promise<void>; close(): void
}
// Deliberately opt-in: launches system Chrome through Bun.WebView, never Playwright.
const suite = process.env.RUN_WEBVIEW_TESTS === '1' ? describe : describe.skip
suite('Bun.WebView institutional browser journeys', () => {
  let view: NativeView, listener: ReturnType<typeof Bun.serve>, directory: string, base: string, closeDatabase: () => void
  let studentCode = '', teacherCookie = ''
  const password = 'Contraseña de pruebas 2026!'
  async function call(path: string, data?: unknown, cookie = '') {
    const response = await fetch(`${base}/api/portal${path}`, { method: data ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', cookie }, body: data ? JSON.stringify(data) : undefined })
    const json = await response.json()
    if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(json)}`)
    return { data: json, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
  }
  async function waitFor(script: string, message: string) {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) { if (await view.evaluate(script)) return; await Bun.sleep(80) }
    throw new Error(`${message}: ${String(await view.evaluate('document.body.innerText')).slice(0, 2500)}`)
  }
  async function click(text: string) {
    await waitFor(`[...document.querySelectorAll('button')].some(e => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled)`, `Botón ${text}`)
    const script = `(() => { const element = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)}); if (!element) return false; element.click(); return true; })()`
    expect(await view.evaluate(script)).toBe(true)
  }
  async function field(name: string, value: string) {
    await waitFor(`document.querySelector('[name="${name}"]') !== null`, `Campo ${name}`)
    expect(await view.evaluate(`(() => { const el = document.querySelector('[name="${name}"]'); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`)).toBe(true)
  }
  async function login(username: string, role: string) {
    await waitFor(`document.body.innerText.includes('Entra a tu espacio')`, 'Pantalla login')
    await click(role); await field('username', username); await field('password', password); await click('Ingresar')
    await waitFor(`document.querySelector('.application') !== null`, `Dashboard ${role}`)
  }
  async function screenshot(name: string) { await Bun.write(`artifacts/webview/${name}.png`, await view.screenshot()) }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hivelearn-webview-'))
    process.env.HIVELEARN_DB_PATH = directory
    const storage = await import('../packages/core/src/storage/hivedb')
    await storage.initializeDatabase(); closeDatabase = storage.closeDatabase
    await storage.getDb().collection('providers').put('ollama', { name: 'Ollama local', base_url: 'http://127.0.0.1:11434' })
    const { createServer, setBunServer } = await import('../packages/core/src/gateway/server')
    const server = createServer(); listener = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: server.fetch, websocket: server.websocket, maxRequestBodySize: 3 * 1024 * 1024 })
    setBunServer(listener); base = `http://127.0.0.1:${listener.port}`
    await call('/setup', { institution: 'Instituto Horizonte IA', name: 'Admin Horizonte', username: 'admin', password })
    const admin = await call('/login', { username: 'admin', role: 'admin', password })
    const teacher = await call('/teachers', { username: 'maestra', name: 'Maestra Horizonte' }, admin.cookie)
    await call('/activate', { code: teacher.data.activationCode, password })
    teacherCookie = (await call('/login', { username: 'maestra', role: 'teacher', password })).cookie
    const student = await call('/students', { rows: [{ nickname: 'alumna', nombre: 'Alumna Horizonte', tipo_documento: 'ti', documento: '00001234', edad: 12, grupo: 'IA Inicial' }], authorized: true }, teacherCookie)
    studentCode = student.data.invitations[0].activationCode
    const View = (Bun as unknown as { WebView: new (options: unknown) => NativeView }).WebView
    if (!View) throw new Error('Este runtime no expone Bun.WebView')
    view = new View({ backend: { type: 'chrome', url: false, stderr: 'ignore' }, show: false, width: 1440, height: 1000 })
    await mkdir('artifacts/webview', { recursive: true })
    await view.navigate(base)
  }, 30000)
  afterAll(async () => { view?.close(); listener?.stop(true); closeDatabase?.(); if (directory) await rm(directory, { recursive: true, force: true }) })
  beforeEach(async () => {
    await view.evaluate(`fetch('/api/portal/logout', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}).then(() => true)`)
    await view.navigate(base)
    await waitFor(`document.body.innerText.includes('Entra a tu espacio')`, 'Login inicial')
  })
  test('admin login, dashboard, profile and teacher invitation', async () => {
    await waitFor(`document.body.innerText.includes('Entra a tu espacio')`, 'Login disponible'); await screenshot('login')
    await login('admin', 'Administrador')
    await waitFor(`document.body.innerText.includes('Comunidad de aprendizaje')`, 'Directorio admin'); await screenshot('admin-dashboard')
    await click('Mi perfil'); await field('name', 'Admin actualizado'); await click('Guardar nombre visible')
    await waitFor(`document.body.innerText.includes('Guardado correctamente')`, 'Perfil guardado')
    expect((await call('/me', undefined, (await call('/login', { username: 'admin', role: 'admin', password })).cookie)).data.account.name).toBe('Admin actualizado')
    await click('Dashboard'); await click('Invitar maestros'); await field('name', 'Docente Nuevo'); await field('username', 'docente.nuevo'); await click('Invitar maestro')
    await waitFor(`document.querySelector('.invitation-box code') !== null`, 'Invitación docente')
    await click('Cerrar sesión')
  }, 30000)
  test('teacher dashboard, Excel template and isolated directory', async () => {
    await login('maestra', 'Maestro'); await waitFor(`document.body.innerText.includes('Mis alumnos')`, 'Directorio docente')
    expect(await view.evaluate(`document.body.innerText.includes('Admin actualizado')`)).toBe(false)
    await screenshot('teacher-dashboard'); await click('Registrar alumnos / Excel')
    await waitFor(`document.querySelector('input[type=file]') !== null`, 'Componente Excel')
    const response = await fetch(`${base}/api/portal/students/template`, { headers: { cookie: teacherCookie } })
    expect(response.status).toBe(200); expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000)
    await screenshot('teacher-enrollment')
    await field('nickname', 'manual.alumno'); await field('nombre', 'Alumno Manual'); await field('documento', '00005678'); await field('edad', '14'); await field('grupo', 'IA B')
    await view.evaluate(`document.querySelector('input[name=authorized]').click()`); await click('Registrar y crear invitación')
    await waitFor(`document.querySelector('.invitation-box')?.innerText.includes('manual.alumno')`, 'Registro individual')
    const XLSX = await import(Bun.resolveSync('xlsx', join(process.cwd(), 'packages/core')))
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['nickname','nombre','tipo_documento','documento','edad','grupo'],['excel.alumno','Alumno Excel','ti','00009012',13,'IA C']]), 'Alumnos')
    const encoded = Buffer.from(XLSX.write(book, {type:'buffer',bookType:'xlsx'})).toString('base64')
    await view.evaluate(`(() => { const bytes = Uint8Array.from(atob(${JSON.stringify(encoded)}), c => c.charCodeAt(0)); const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'grupo.xlsx', {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); const input = document.querySelector('input[type=file]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`)
    await click('Validar archivo'); await waitFor(`document.querySelector('.preview')?.innerText.includes('Alumno Excel')`, 'Vista previa Excel')
    await view.evaluate(`document.querySelector('.preview input[type=checkbox]').click()`); await click('Confirmar importación')
    await waitFor(`document.querySelector('.invitation-box')?.innerText.includes('excel.alumno')`, 'Importación Excel confirmada')
    await click('Cerrar sesión')
  }, 30000)
  test('admin can save provider configuration; teacher cannot access its endpoint', async () => {
    await login('admin', 'Administrador'); await click('Configuración')
    await waitFor(`document.body.innerText.includes('Providers, imagen y voz')`, 'Configuración de providers')
    await field('modelId', 'modelo-de-prueba'); await click('Guardar configuración de agentes')
    await waitFor(`document.body.innerText.includes('Guardado correctamente')`, 'Configuración guardada')
    const response = await fetch(`${base}/api/portal/settings`, { headers: { cookie: teacherCookie } })
    expect(response.status).toBe(403)
    await screenshot('admin-settings'); await click('Cerrar sesión')
  }, 30000)
  test('first access and guided A2UI journey render one adaptive screen at a time', async () => {
    await waitFor(`document.body.innerText.includes('Activar mi cuenta')`, 'Primer acceso')
    await click('Activar mi cuenta'); await field('code', studentCode); await field('password', password); await field('confirm', password); await click('Crear mi contraseña')
    await waitFor(`document.body.innerText.includes('Entra a tu espacio')`, 'Activación finalizada')
    await login('alumna', 'Alumno')
    await waitFor(`document.body.innerText.includes('Comenzar mi recorrido')`, 'Bienvenida del tutor')
    await screenshot('student-journey-welcome')
    await click('Comenzar mi recorrido'); await click('Ciencia y naturaleza'); await click('Aprender resolviendo retos')
    for (let index = 0; index < 10; index++) {
      await waitFor(`document.body.innerText.includes('PREGUNTA ${index + 1} DE 10')`, `Pregunta diagnóstica ${index + 1}`)
      expect(await view.evaluate(`document.querySelectorAll('.journey-card button').length === 3`)).toBe(true)
      await view.evaluate(`document.querySelector('.journey-card button').click()`)
    }
    await waitFor(`document.body.innerText.includes('TU RUTA ESTÁ LISTA')`, 'Ruta personalizada')
    await screenshot('student-route-ready')
    await click('Entrar a mi primera actividad')
    await waitFor(`document.body.innerText.includes('COMPRENDER')`, 'Explicación personalizada')
    await screenshot('student-guided-concept')
    await click('Ya lo leí: vamos a practicar')
    await waitFor(`document.querySelector('.journey-response textarea') !== null`, 'Actividad personalizada')
    await screenshot('student-guided-activity')
    await view.resize(390, 844); await Bun.sleep(100); await screenshot('student-guided-mobile')
    expect(await view.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true)
    await view.resize(1440, 1000); await click('Cerrar sesión')
  }, 30000)
  test('legacy API and WebSockets reject unauthenticated access', async () => {
    expect((await fetch(`${base}/api/providers`)).status).toBe(401)
    const status = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`${base.replace('http:', 'ws:')}/hivelearn-events`)
      ws.onopen = () => { ws.close(); reject(new Error('Unauthorized socket opened')) }
      ws.onerror = () => resolve(401)
      setTimeout(() => { ws.close(); reject(new Error('WebSocket auth timeout')) }, 4000)
    })
    expect(status).toBe(401)
  })
})
