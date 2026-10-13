import type { HiveDB } from '@johpaz/hive-db'
import { Accounts, digest, type Account } from './accounts'
import { Learning } from './learning'
import { readProviderSecret, readSettings } from './settings'
import { isMinorAge } from './age'

export interface SupplementJob {
  studentId: string; institutionId: string; nodeId: string; version: string
  status: 'queued' | 'running' | 'completed' | 'failed'; attempts: number
  leaseUntil: number; text?: string; error?: string; updatedAt: string
}
export interface WorkerInput { url: string; model: string; ollama: boolean; apiKey?: string; prompt: string }
export type SupplementExecutor = (input: WorkerInput) => Promise<string>
// Embedded source also works in compiled binaries: no filesystem worker dependency.
const WORKER_SOURCE = `self.onmessage = async ({data}) => {
  try {
    const response = await fetch(data.url, {method:'POST', redirect:'error', signal:AbortSignal.timeout(30000),
      headers:{'Content-Type':'application/json', ...(data.apiKey ? {'Authorization':'Bearer '+data.apiKey} : {})},
      body:JSON.stringify({model:data.model, stream:false, messages:[{role:'user',content:data.prompt}], ...(data.ollama ? {} : {max_tokens:700})})});
    if (!response.ok) throw new Error('Provider HTTP '+response.status);
    const result = await response.json();
    const text = data.ollama ? result.message?.content : result.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length < 20 || text.length > 12000) throw new Error('Respuesta del provider inválida');
    self.postMessage({text});
  } catch(error) { self.postMessage({error:error.message}); }
};`
export function runSupplementWorker(input: WorkerInput): Promise<string> {
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'application/javascript' }))
  return new Promise((resolve, reject) => {
    let worker: Worker
    try { worker = new Worker(url) } catch (error) { URL.revokeObjectURL(url); reject(error); return }
    const cleanup = () => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('El agente excedió 40 segundos')) }, 40000)
    worker.onmessage = event => { cleanup(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.text) }
    worker.onerror = () => { cleanup(); reject(new Error('El worker no pudo completar la tarea')) }
    worker.postMessage(input)
  })
}
export class Supplements {
  private running = new Set<string>()
  private pumping = false
  constructor(readonly db: HiveDB, readonly execute: SupplementExecutor = runSupplementWorker) {}
  async request(actor: Account, nodeId: string) {
    const route = await new Learning(this.db).route(actor)
    if (actor.role !== 'student' || !route.diagnosticCompleted) throw new Error('Completa el diagnóstico antes de consultar al agente')
    if (!route.nodes.some(node => node.id === nodeId && node.status !== 'pending')) throw new Error('Competencia fuera de ruta o con prerrequisitos pendientes')
    await this.input(actor, nodeId)
    const id = digest(`${actor.id}:${route.version}:${nodeId}`), col = this.db.collection<SupplementJob>('hl_supplement_jobs'), existing = await col.get(id)
    if (!existing) await col.put(id, { studentId: actor.id, institutionId: actor.institutionId, nodeId, version: route.version, status: 'queued', attempts: 0, leaseUntil: 0, updatedAt: new Date().toISOString() }, { expectedVersion: 0 })
    else if (existing.doc.status === 'failed' && existing.doc.attempts < 2) await col.put(id, { ...existing.doc, status: 'queued', error: undefined }, { expectedVersion: existing.version })
    void this.resume().catch(() => {})
    return { id, ...(await col.get(id))!.doc }
  }
  async input(actor: Account, nodeId: string): Promise<WorkerInput> {
    const settings = await readSettings(this.db, actor.institutionId)
    const provider = (await this.db.collection<Record<string, unknown>>('providers').get(settings.providerId))?.doc
    if (!provider) throw new Error('El administrador debe configurar un provider')
    const url = new URL(String(provider.base_url || (settings.providerId === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1')))
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('URL del provider inválida')
    if (!local && (!settings.allowRemoteProviders || isMinorAge(actor.age) && !settings.allowRemoteForMinors)) throw new Error('La política institucional no permite este provider remoto')
    if (!local && url.protocol !== 'https:') throw new Error('Los providers remotos requieren HTTPS')
    if (['anthropic', 'gemini', 'google'].includes(settings.providerId)) throw new Error('Los complementos requieren Ollama o un endpoint compatible con OpenAI')
    const route = await new Learning(this.db).route(actor), node = route.nodes.find(n => n.id === nodeId)
    if (!node) throw new Error('Competencia no encontrada')
    const ollama = settings.providerId === 'ollama'
    url.pathname = ollama ? '/api/chat' : `${url.pathname.replace(/\/$/, '')}/chat/completions`
    const apiKey = await readProviderSecret(provider)
    return { url: url.href, ollama, model: settings.modelId!, apiKey, prompt: `Eres un tutor de IA. Complementa el material canónico con una explicación y una práctica breve, máximo 250 palabras. No acredites dominio ni inventes fuentes. No solicites datos personales ni incluyas juegos, XP o premios. El texto será mostrado como complemento generado, sujeto a revisión docente.\nVersión: ${route.version}\nCompetencia: ${JSON.stringify(node)}\nContexto: ${route.guidance.context}\nSupervisión: ${route.guidance.supervision}` }
  }
  async formativeFeedback(actor: Account, nodeId: string, response: string, context: { interest?: string; learningMode?: string } = {}) {
    const input = await this.input(actor, nodeId)
    input.prompt = `Eres el tutor local de HiveLearn. Da feedback formativo en español, cálido y específico, máximo 110 palabras. Señala primero una fortaleza observable, después una mejora concreta y termina con una sola pregunta o reto breve. No otorgues notas, puntos ni dominio; no inventes fuentes y no solicites datos personales.\nInterés del alumno: ${context.interest ?? 'no indicado'}\nForma preferida de aprender: ${context.learningMode ?? 'no indicada'}\nActividad curricular: ${nodeId}\nRespuesta del alumno: ${response}`
    return this.execute(input)
  }
  async resume() {
    if (this.pumping) return
    this.pumping = true
    try {
      const col = this.db.collection<SupplementJob>('hl_supplement_jobs')
      for (const entry of await col.scan()) {
        if (this.running.size >= 2) break
        if (this.running.has(entry.id) || !(entry.doc.status === 'queued' || entry.doc.status === 'running' && entry.doc.leaseUntil < Date.now())) continue
        if (entry.doc.attempts >= 2) { await col.put(entry.id, { ...entry.doc, status: 'failed', error: 'Se agotaron los intentos' }, { expectedVersion: entry.version }); continue }
        const claimed: SupplementJob = { ...entry.doc, status: 'running', attempts: entry.doc.attempts + 1, leaseUntil: Date.now() + 60000, updatedAt: new Date().toISOString() }
        try { await col.put(entry.id, claimed, { expectedVersion: entry.version }) } catch { continue }
        this.running.add(entry.id)
        void (async () => {
          let patch: Partial<SupplementJob>
          try {
            const actor = await new Accounts(this.db).get(claimed.studentId)
            if (!actor) throw new Error('Cuenta no disponible')
            const route = await new Learning(this.db).route(actor)
            if (route.version !== claimed.version) throw new Error('La versión curricular cambió; requiere revisión')
            patch = { status: 'completed', text: await this.execute(await this.input(actor, claimed.nodeId)), error: undefined }
          } catch (error) { patch = { status: 'failed', error: error instanceof Error ? error.message : 'Fallo del agente' } }
          const latest = await col.get(entry.id)
          if (latest?.doc.status === 'running' && latest.doc.attempts === claimed.attempts) await col.put(entry.id, { ...latest.doc, ...patch, leaseUntil: 0, updatedAt: new Date().toISOString() }, { expectedVersion: latest.version })
        })().catch(() => {}).finally(() => { this.running.delete(entry.id); void this.resume().catch(() => {}) })
      }
    } finally { this.pumping = false }
  }
  async list(actor: Account, nodeId: string) { return (await this.db.collection<SupplementJob>('hl_supplement_jobs').scan()).filter(e => e.doc.studentId === actor.id && e.doc.nodeId === nodeId).map(e => ({ id: e.id, ...e.doc })) }
}
