#!/usr/bin/env bun
/**
 * Prueba en vivo de punta a punta contra un gateway YA en marcha y con sus proveedores configurados.
 *
 * Usa solo la API del portal (cookie de sesión de administrador), así que las claves de los proveedores nunca
 * pasan por este script: el gateway las lee de su propio llavero.
 *
 *   HIVELEARN_ADMIN_USER=johpaz HIVELEARN_ADMIN_PASSWORD='…' bun run scripts/live-check.ts \
 *     [--base http://127.0.0.1:8787] [--topic "Introducción a SQL"] [--audience adulto] [--no-research] [--approve]
 *
 * Comprueba: login → configuración vigente → generación de un currículo (arquitecto, y con investigador salvo
 * --no-research) → estado del trabajo hasta terminar → que aparezca en el catálogo → (opcional) aprobación.
 */
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const value = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}

const base = value('base', 'http://127.0.0.1:8787').replace(/\/$/, '')
const topic = value('topic', 'Introducción a SQL')
const audience = value('audience', 'adulto')
const research = !flag('no-research')
const username = process.env.HIVELEARN_ADMIN_USER
const password = process.env.HIVELEARN_ADMIN_PASSWORD
const timeoutMs = Number(value('timeout-min', '20')) * 60_000

if (!username || !password) {
  console.error('Define HIVELEARN_ADMIN_USER y HIVELEARN_ADMIN_PASSWORD (administrador).')
  process.exit(2)
}

let cookie = ''
async function call<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const response = await fetch(`${base}/api/portal${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Origin: base, ...(cookie ? { cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(60_000),
  })
  const set = response.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  return { status: response.status, data: await response.json().catch(() => ({})) as T }
}

const step = (n: number, text: string) => console.log(`\n[${n}] ${text}`)
const fail = (text: string): never => { console.error(`✗ ${text}`); process.exit(1) }

step(1, `Login en ${base}`)
const login = await call('/login', { method: 'POST', body: { username, password, role: 'admin' } })
if (login.status !== 200) fail(`login rechazado (HTTP ${login.status}): ${login.data.error ?? ''}`)
console.log(`✓ sesión de ${login.data.account.name}`)

step(2, 'Configuración vigente')
const settings = await call('/settings')
if (settings.status !== 200) fail(`no se pudo leer la configuración (HTTP ${settings.status})`)
const s = settings.data.settings
console.log(`  texto: ${s.providerId} / ${s.modelId}   respaldo: ${s.fallbackProviderId ?? '—'}   remotos: ${s.allowRemoteProviders}`)
const provider = settings.data.providers.find((p: any) => p.id === s.providerId)
console.log(`  proveedor ${s.providerId}: ${provider?.hasApiKey ? 'con clave' : 'SIN clave (¿local?)'}`)

step(3, `Generar currículo: "${topic}" (${audience}, ${research ? 'con investigación' : 'sin investigación'})`)
const started = Date.now()
const created = await call('/curricula/generate', { method: 'POST', body: { topic, audience, research } })
if (created.status !== 202) fail(`no se pudo encolar (HTTP ${created.status}): ${created.data.error ?? ''}`)
const jobId = created.data.job.id
console.log(`  trabajo ${jobId}`)

let job = created.data.job
let last = ''
while (Date.now() - started < timeoutMs) {
  await Bun.sleep(5000)
  const poll = await call(`/curricula/jobs/${jobId}`)
  if (poll.status !== 200) fail(`consulta del trabajo falló (HTTP ${poll.status})`)
  job = poll.data.job
  if (job.status !== last) { last = job.status; console.log(`  · ${job.status} (${Math.round((Date.now() - started) / 1000)} s)`) }
  if (job.status === 'done' || job.status === 'failed') break
}
const seconds = Math.round((Date.now() - started) / 1000)
if (job.status === 'failed') fail(`la generación falló en ${seconds} s: ${job.error}`)
if (job.status !== 'done') fail(`sin terminar tras ${seconds} s (estado: ${job.status})`)
console.log(`✓ currículo "${job.curriculumId}" generado en ${seconds} s (${job.docId})${job.dossierCached ? ' · dossier en caché' : ''}`)

step(4, 'Catálogo')
const list = await call('/curricula')
const found = list.data.curricula?.find((c: any) => c.docId === job.docId)
if (!found) fail('el currículo no aparece en /curricula')
console.log(`✓ ${found.topic} · ${found.nodes} nodos · estado ${found.status} · acredita: ${found.accredits}`)
if (found.status !== 'generated') fail(`debería nacer "generated", es "${found.status}"`)

if (flag('approve')) {
  step(5, 'Aprobación')
  const approved = await call(`/curricula/${encodeURIComponent(job.docId)}/approve`, { method: 'POST', body: {} })
  if (approved.status !== 200) fail(`aprobación rechazada (HTTP ${approved.status}): ${approved.data.error ?? ''}`)
  console.log(`✓ aprobado: ${approved.data.curriculum.status}`)
}

console.log('\nTodo en orden.')
