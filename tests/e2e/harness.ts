/**
 * Arnés E2E: gateway real (portal + UI compilada) con planificador/adaptador simulados, y un navegador Chromium
 * dirigido con Bun.WebView. Nada de red externa ni de modelos.
 */
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'bun:test'
import type { EngineDeps } from '../../packages/core/src/institutional/program/engine'

export const PASSWORD = 'Contraseña de pruebas 2026!'
export const E2E_ENABLED = process.env.RUN_WEBVIEW_TESTS === '1'

/** CHROME_PATH, un Chrome/Chromium del PATH o el Chromium de Playwright en la caché del usuario. */
export function chromePath(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = Bun.which(name)
    if (found) return found
  }
  const cache = join(homedir(), '.cache', 'ms-playwright')
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter(d => d.startsWith('chromium-')).sort().reverse()) {
      const candidate = join(cache, dir, 'chrome-linux', 'chrome')
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

export interface Stack {
  base: string
  directory: string
  /** Llamada a la API del portal; lanza si la respuesta no es 2xx salvo `allowError`. */
  call(path: string, options?: { method?: string; data?: unknown; cookie?: string; allowError?: boolean }): Promise<{ status: number; data: any; cookie: string }>
  /** Crea un alumno activado (el docente lo invita). Con `session` también inicia sesión por API y devuelve la cookie. */
  addStudent(nickname: string, options?: { session?: boolean }): Promise<{ username: string; cookie: string }>
  teacherCookie: string
  adminCookie: string
  close(): Promise<void>
}

/** Levanta DB temporal + servidor HTTP/WS con la UI de `packages/hivelearn-ui/dist` y siembra admin y docente. */
export async function startStack(programDeps: Partial<EngineDeps>): Promise<Stack> {
  const directory = await mkdtemp(join(tmpdir(), 'hivelearn-e2e-'))
  process.env.HIVELEARN_DB_PATH = directory
  const storage = await import('../../packages/core/src/storage/hivedb')
  await storage.initializeDatabase()
  const { createServer, setBunServer } = await import('../../packages/core/src/gateway/server')
  const server = createServer({ programDeps })
  const listener = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: server.fetch, websocket: server.websocket, maxRequestBodySize: 3 * 1024 * 1024 })
  setBunServer(listener)
  const base = `http://127.0.0.1:${listener.port}`

  // Ojo: el portal limita /login, /activate y /setup a 15 por minuto y por IP, y en loopback todo sale por 127.0.0.1.
  // Por eso la siembra evita logins por API innecesarios y `Browser.login` espera si recibe un 429.
  const call: Stack['call'] = async (path, options = {}) => {
    const method = options.method ?? (options.data === undefined ? 'GET' : 'POST')
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${base}/api/portal${path}`, {
        method,
        headers: { ...(options.data === undefined ? {} : { 'Content-Type': 'application/json' }), cookie: options.cookie ?? '', origin: base },
        body: options.data === undefined ? undefined : JSON.stringify(options.data),
      })
      if (response.status === 429 && attempt < 2) { await Bun.sleep(61000); continue }
      const data = await response.json().catch(() => null)
      if (!response.ok && !options.allowError) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`)
      return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
    }
  }

  await call('/setup', { data: { institution: 'Instituto Horizonte IA', name: 'Admin Horizonte', username: 'admin', password: PASSWORD } })
  const adminCookie = (await call('/login', { data: { username: 'admin', role: 'admin', password: PASSWORD } })).cookie
  const teacher = await call('/teachers', { data: { username: 'maestra', name: 'Maestra Horizonte' }, cookie: adminCookie })
  await call('/activate', { data: { code: teacher.data.activationCode, password: PASSWORD } })
  const teacherCookie = (await call('/login', { data: { username: 'maestra', role: 'teacher', password: PASSWORD } })).cookie

  return {
    base, directory, call, teacherCookie, adminCookie,
    async addStudent(nickname, options = {}) {
      const invited = await call('/students', { data: { rows: [{ nickname, nombre: `Alumno ${nickname}`, tipo_documento: 'ti', documento: String(10000000 + Math.floor(Math.random() * 8999999)), edad: 30, grupo: 'E2E' }], authorized: true }, cookie: teacherCookie })
      await call('/activate', { data: { code: invited.data.invitations[0].activationCode, password: PASSWORD } })
      if (!options.session) return { username: nickname, cookie: '' }
      const login = await call('/login', { data: { username: nickname, role: 'student', password: PASSWORD } })
      return { username: nickname, cookie: login.cookie }
    },
    async close() {
      listener.stop(true)
      storage.closeDatabase()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

interface NativeView {
  navigate(url: string): Promise<void>; evaluate(script: string): Promise<unknown>
  screenshot(): Promise<Blob>; resize(width: number, height: number): Promise<void>; close(): void
  click(x: number, y: number): Promise<void>
}

/** Navegador dirigido. Los helpers trabajan por texto y etiqueta visibles, no por clases internas. */
export class Browser {
  private constructor(readonly view: NativeView, readonly base: string) {}

  static async launch(base: string, { width = 1280, height = 900 } = {}): Promise<Browser> {
    const path = chromePath()
    if (!path) throw new Error('No se encontró Chrome/Chromium: define CHROME_PATH')
    const View = (Bun as unknown as { WebView?: new (options: unknown) => NativeView }).WebView
    if (!View) throw new Error('Este runtime no expone Bun.WebView')
    const view = new View({
      backend: { type: 'chrome', path, stderr: 'ignore', argv: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] },
      show: false, width, height,
    })
    await mkdir('artifacts/webview', { recursive: true })
    await view.navigate('about:blank')
    await view.resize(width, height) // el tamaño del constructor no se aplica al viewport (y resize exige una página abierta)
    return new Browser(view, base)
  }

  close() { this.view.close() }
  eval<T = unknown>(script: string): Promise<T> { return this.view.evaluate(script) as Promise<T> }
  text(): Promise<string> { return this.eval<string>('document.body.innerText') }
  async screenshot(name: string) { await Bun.write(`artifacts/webview/e2e-${name}.png`, await this.view.screenshot()) }

  /** Navega a una página completa (no a un hash: las navegaciones de hash nunca "terminan" para WebView). */
  async goto(path = '') {
    for (let attempt = 0; ; attempt++) {
      try { return await this.view.navigate(`${this.base}/${path}`) } catch (error) {
        if (attempt >= 50 || !String(error).includes('already pending')) throw error
        await Bun.sleep(100)
      }
    }
  }
  /** Limpia sesión y almacenamiento y vuelve a la pantalla de acceso, fijando el modo del programa si se pide. */
  async fresh(options: { mode?: 'game' | 'classic'; e2eHook?: boolean } = {}) {
    await this.goto()
    await this.eval(`fetch('/api/portal/logout', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}).then(() => true)`)
    await this.eval(`(() => { localStorage.clear(); localStorage.setItem('hivelearn.quality', 'low'); ${options.mode ? `localStorage.setItem('hivelearn.programMode', '${options.mode}');` : ''} ${options.e2eHook ? `localStorage.setItem('hivelearn.e2e', '1');` : ''} return true })()`)
    await this.goto() // recarga completa: el SPA arranca sin sesión
    await this.eval(`(location.hash = '#/acceso', true)`)
    await this.waitFor(`document.body.innerText.includes('Ingresar')`, 'Pantalla de acceso')
    // El juego pregunta con window.confirm al cerrar la sesión de estudio: se acepta.
    await this.eval('window.confirm = () => true')
  }

  async waitFor(script: string, message: string, timeout = 15000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      try { if (await this.eval(script)) return } catch { /* la página se está recargando */ }
      await Bun.sleep(80)
    }
    throw new Error(`${message}\n--- pantalla ---\n${(await this.text().catch(() => '')).slice(0, 2500)}`)
  }

  async waitForText(text: string, timeout?: number) {
    await this.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, `Esperaba el texto «${text}»`, timeout)
  }

  /** Pulsa el botón habilitado (o, si no hay, el enlace) cuyo texto visible es `text` o empieza por él. */
  async click(text: string, scope = 'document') {
    const find = `(() => { const t = ${JSON.stringify(text)}; const norm = e => e.textContent.replace(/\\s+/g, ' ').trim(); const look = sel => { const all = [...${scope}.querySelectorAll(sel)].filter(e => !e.disabled && e.getAttribute('aria-disabled') !== 'true'); return all.find(e => norm(e) === t) ?? all.find(e => norm(e).startsWith(t)) }; return look('button') ?? look('a') })()`
    await this.waitFor(`${find} !== undefined`, `Botón «${text}» habilitado`)
    expect(await this.eval(`(() => { const e = ${find}; if (!e) return false; e.click(); return true })()`)).toBe(true)
  }

  /** Escribe en el campo cuya etiqueta (.field__label) empieza por `label`, compatible con inputs controlados de React. */
  async fill(label: string, value: string) {
    const find = `[...document.querySelectorAll('label.field')].find(l => l.querySelector('.field__label')?.textContent.trim().startsWith(${JSON.stringify(label)}))?.querySelector('input, select, textarea')`
    await this.waitFor(`!!(${find})`, `Campo «${label}»`)
    expect(await this.eval(`(() => {
      const el = ${find}; if (!el) return false
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const value = ${JSON.stringify(value)}
      if (el instanceof HTMLSelectElement) {
        const option = [...el.options].find(o => o.textContent.trim() === value || o.value === value); if (!option) return false
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, option.value)
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return true })()`)).toBe(true)
  }

  async login(username: string, role: 'Alumno' | 'Docente' | 'Administrador') {
    await this.waitForText('Ingresar')
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.fill('Soy', role)
      await this.fill('Usuario', username)
      await this.fill('Contraseña', PASSWORD)
      await this.click('Ingresar')
      await this.waitFor(`document.querySelector('nav[aria-label="Secciones"]') !== null || document.body.innerText.includes('Demasiados intentos')`, `Sesión de ${role}`)
      if (await this.eval(`document.querySelector('nav[aria-label="Secciones"]') !== null`)) return
      await Bun.sleep(61000) // límite de intentos del portal: se espera a que se libere la ventana
    }
    throw new Error(`No se pudo iniciar sesión como ${role}`)
  }

  async go(section: string) {
    await this.click(section, `document.querySelector('nav[aria-label="Secciones"]')`)
  }

  /** Elige la opción `index` (0=A) de la pregunta visible del juego. */
  async pick(index: number) {
    expect(await this.eval<boolean>(`(() => { const pad = document.querySelectorAll('.pad')[${index}]; if (!pad) return false; pad.click(); return true })()`)).toBe(true)
  }
}
