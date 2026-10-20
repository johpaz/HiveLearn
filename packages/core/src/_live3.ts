import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const root = mkdtempSync(join(tmpdir(), 'hl-live-prog-'))
process.env.HIVELEARN_DB_PATH = join(root, 'hivedb')
process.env.HIVELEARN_SECRET_KEY = 'live-prog-secret-key-0123456789abcdef'
process.env.HIVELEARN_SDK_DB_PATH = join(root, 'sdk-db')
process.env.HIVELEARN_SDK_HOME = join(root, 'sdk-home')
process.env.HIVELEARN_AGENT_ENGINE = 'sdk'
const key = (await Bun.secrets.get({ service: 'hivelearn-institution', name: '0ece8b8a-20ac-46d8-841f-b111099440a1:gemini' }))!
const { initializeDatabase, getDb, closeDatabase } = await import('./storage/hivedb')
const { encryptApiKey } = await import('./crypto/encrypt')
const { registerHiveLearnAgents } = await import('./agent/registry')
const { closeSdkEngine } = await import('./agent/sdk/bootstrap')
const { ProgramEngine } = await import('./institutional/program/engine')
const { generateProgramPlan, proposeAdaptation } = await import('./agent/program-architect')
await initializeDatabase()
const db = getDb()
const { encrypted, iv } = encryptApiKey(key)
await db.collection('providers').put('gemini', { name: 'Gemini', api_key_encrypted: encrypted, api_key_iv: iv, headers_encrypted: null, headers_iv: null, base_url: null, category: 'llm', num_ctx: null, num_gpu: 0, enabled: 1, active: 1, created_at: new Date().toISOString() })
await registerHiveLearnAgents()
for (const e of await db.collection<any>('hl_agents').scan()) await db.collection('hl_agents').put(e.id, { ...e.doc, provider_id: 'gemini', model_id: 'gemini-3.8-flash' })

const account: any = { id: 'alumna-1', institutionId: 'inst', username: 'ana', name: 'Ana', role: 'student', passwordHash: null, age: 32, createdAt: new Date().toISOString() }
const engine = new ProgramEngine(db, { planner: generateProgramPlan, adapter: proposeAdaptation })
const t0 = Date.now()
const sec = () => Math.round((Date.now() - t0) / 1000)
try {
  let view = await engine.open(account, { topic: 'Excel para análisis de ventas', goal: 'armar reportes semanales con tablas dinámicas', minutes: 30, energy: 'media', priorKnowledge: 'algo', style: 'retos' })
  console.log(`[${sec()} s] PLAN: ${view.program.objective}`)
  console.log(view.program.levels.map(l => `  N${l.index + 1} [${l.status}/${l.kind}] ${l.title} — ${l.goal} (${l.nodes.length || l.plannedNodes} nodos)`).join('\n'))
  console.log('  nodos nivel 1:', view.program.levels[0].nodes.map(n => n.id).join(', '))
  for (let step = 0; step < 6 && view.program.status === 'active'; step++) {
    const level = view.program.levels[view.program.currentLevel]
    // Primer nivel: el alumno acierta 2 de 3; en el siguiente falla casi todo (fuerza refuerzo); luego acierta.
    level.nodes.forEach(() => {})
    for (let i = 0; i < level.nodes.length; i++) {
      const n = level.nodes[i]
      const wantCorrect = step === 1 ? false : step === 0 ? i < 2 : true
      await engine.answer(account, view.program.id, { nodeId: n.id, choice: wantCorrect ? n.question.correct : (n.question.correct + 1) % 3 })
    }
    const result = await engine.checkpoint(account, view.program.id)
    view = result
    console.log(`[${sec()} s] CHECKPOINT nivel ${level.index + 1}: ${result.decision} — ${result.reason}; ajuste aplicado ${result.adapted.applied}/rechazado ${result.adapted.rejected}`)
    console.log(view.program.levels.map(l => `  N${l.index + 1} [${l.status}/${l.kind}] ${l.title} (${l.nodes.length || l.plannedNodes})`).join('\n'))
    if (view.needsContent) { view = await engine.ensureLevelContent(account, view.program.id); console.log(`  (contenido preparado en ${sec()} s)`) }
  }
  console.log(`FIN: estado ${view.program.status}/${view.program.closeReason ?? '-'} · validación ${view.program.validation} · nota ${view.program.finalScore ?? '-'} · revisiones ${view.program.revisions.length} · ${sec()} s`)
  for (const r of view.program.revisions) console.log(`  rev ${r.actor}: ${r.reason.slice(0, 90)} → ${r.ops.map(o => o.detail).join(' | ').slice(0, 140)}`)
} catch (e: any) {
  console.log(`FALLÓ en ${sec()} s:`, e?.code ?? e?.name ?? '', String(e?.message ?? e).slice(0, 500))
}
await Bun.sleep(500)
await closeSdkEngine().catch(() => {})
closeDatabase()
rmSync(root, { recursive: true, force: true })
process.exit(0)
