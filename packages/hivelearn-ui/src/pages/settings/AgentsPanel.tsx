import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { ModelSelect } from '../../components/ModelSelect'
import { Notice, Spinner } from '../../components/ui'
import { agentChanged, usableProviders, type ProviderRow } from '../../settings-logic'
import type { AgentConfig } from '../../types'

const ROLE_LABEL: Record<string, string> = { coordinator: 'Coordinador', worker: 'Especialista', specialist: 'Especialista' }

type Message = { kind: 'error' | 'success'; text: string }

export function AgentsPanel({ rows }: { rows: ProviderRow[] }) {
  const [saved, setSaved] = useState<AgentConfig[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, AgentConfig>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    let alive = true
    api.agents().then(list => {
      if (!alive) return
      setSaved(list)
      setDrafts(Object.fromEntries(list.map(a => [a.id, a])))
    }).catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [])

  const usable = usableProviders(rows)
  const dirty = useMemo(() => (saved ?? []).filter(a => drafts[a.id] && agentChanged(a, drafts[a.id])), [saved, drafts])

  if (error) return <Notice kind="error">{error}</Notice>
  if (!saved) return <Spinner label="Cargando agentes…" />

  /** Refleja en pantalla lo que el servidor confirmó. */
  const commit = (changes: Array<Partial<AgentConfig> & { id: string }>) => {
    const byId = new Map(changes.map(c => [c.id, c]))
    setSaved(list => list?.map(a => byId.has(a.id) ? { ...a, ...byId.get(a.id) } : a) ?? null)
    setDrafts(current => Object.fromEntries(Object.entries(current).map(([id, a]) => [id, byId.has(id) ? { ...a, ...byId.get(id) } : a])))
  }

  async function run(task: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
    try { setMessage({ kind: 'success', text: await task() }) } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar' })
    } finally { setBusy(false) }
  }

  const saveAllChanges = () => run(async () => {
    const updates = dirty.map(a => {
      const d = drafts[a.id]
      return { agentId: a.id, providerId: d.provider_id!, modelId: d.model_id!, enabled: Boolean(d.enabled) }
    })
    await api.saveAgentModels({ updates })
    commit(dirty.map(a => ({ ...drafts[a.id] })))
    return `${updates.length} ${updates.length === 1 ? 'agente guardado' : 'agentes guardados'}`
  })

  const applyToAll = (providerId: string, modelId: string, includeMedia: boolean) => run(async () => {
    const result = await api.saveAgentModels({ applyToAll: { providerId, modelId, includeMedia } })
    commit(result.updated.map(id => ({ id, provider_id: providerId, model_id: modelId })))
    const skipped = result.skipped.length ? ` (${result.skipped.length} de imagen/audio sin cambios)` : ''
    return `${result.updated.length} agentes ahora usan ${modelId}${skipped}`
  })

  const incomplete = dirty.some(a => !drafts[a.id].provider_id || !drafts[a.id].model_id)

  return (
    <section aria-labelledby="agents-title">
      <h2 id="agents-title" className="panel__title">Modelos de los agentes</h2>
      <p className="panel__lead">
        Aplica un mismo modelo a todos los agentes con un solo botón, o ajusta cada uno por separado y guarda todos los cambios juntos.
      </p>
      {usable.length === 0 && <Notice kind="info">Aún no hay proveedores utilizables: activa uno y guarda su clave en “APIs y proveedores”.</Notice>}

      <ApplyAll usable={usable} busy={busy} onApply={applyToAll} ids={saved.map(a => a.id)} />

      <div className="agents-bar">
        <span className="muted">{dirty.length === 0 ? 'Sin cambios pendientes' : `${dirty.length} ${dirty.length === 1 ? 'cambio pendiente' : 'cambios pendientes'}`}</span>
        <div className="agents-bar__actions">
          <button className="btn btn--ghost" disabled={busy || dirty.length === 0}
            onClick={() => setDrafts(Object.fromEntries(saved.map(a => [a.id, a])))}>Descartar</button>
          <button className="btn btn--primary" disabled={busy || dirty.length === 0 || incomplete} onClick={() => void saveAllChanges()}>
            {busy ? 'Guardando…' : `Guardar todos los cambios${dirty.length ? ` (${dirty.length})` : ''}`}
          </button>
        </div>
      </div>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <ul className="agent-list">
        {saved.map(agent => (
          <AgentRow key={agent.id} agent={agent} draft={drafts[agent.id] ?? agent} usable={usable} busy={busy}
            onDraft={next => setDrafts(current => ({ ...current, [agent.id]: next }))}
            onSave={() => void run(async () => {
              const d = drafts[agent.id]
              await api.saveAgentModels({ updates: [{ agentId: agent.id, providerId: d.provider_id!, modelId: d.model_id!, enabled: Boolean(d.enabled) }] })
              commit([{ ...d }])
              return `${agent.name ?? agent.id} guardado`
            })} />
        ))}
      </ul>
    </section>
  )
}

function ApplyAll({ usable, busy, ids, onApply }: {
  usable: ProviderRow[]; busy: boolean; ids: string[]
  onApply: (providerId: string, modelId: string, includeMedia: boolean) => Promise<void>
}) {
  const [providerId, setProviderId] = useState<string>('')
  const [modelId, setModelId] = useState<string | null>(null)
  const [includeMedia, setIncludeMedia] = useState(false)
  // Igual que el servidor: sin "incluir", los agentes de imagen y audio no cambian.
  const total = includeMedia ? ids.length : ids.filter(id => !/image|audio/i.test(id)).length
  return (
    <div className="card applyall">
      <h3>Aplicar a todos los agentes</h3>
      <div className="applyall__controls">
        <label>
          <span className="field__label">Proveedor</span>
          <select value={providerId} onChange={e => { setProviderId(e.target.value); setModelId(null) }}>
            <option value="">Elige un proveedor</option>
            {usable.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          <span className="field__label">Modelo</span>
          <ModelSelect label="Modelo para todos los agentes" providerId={providerId || null} value={modelId} onChange={setModelId} />
        </label>
        <label className="switch">
          <input type="checkbox" checked={includeMedia} onChange={e => setIncludeMedia(e.target.checked)} />
          <span>Incluir imagen y audio</span>
        </label>
        <button className="btn btn--primary" disabled={busy || !providerId || !modelId}
          onClick={() => { if (providerId && modelId) void onApply(providerId, modelId, includeMedia) }}>
          Aplicar a {total === 1 ? 'el agente' : `los ${total} agentes`}
        </button>
      </div>
      <p className="muted">Se guarda en una sola operación: si algo falla, no cambia ninguno.</p>
    </div>
  )
}

function AgentRow({ agent, draft, usable, busy, onDraft, onSave }: {
  agent: AgentConfig; draft: AgentConfig; usable: ProviderRow[]; busy: boolean
  onDraft: (agent: AgentConfig) => void; onSave: () => void
}) {
  const providers = usable.some(p => p.id === draft.provider_id) || !draft.provider_id
    ? usable
    : [{ id: draft.provider_id, name: `${draft.provider_id} (no disponible)` } as ProviderRow, ...usable]
  const changed = agentChanged(agent, draft)

  return (
    <li className={`agent card ${changed ? 'agent--dirty' : ''}`}>
      <header className="agent__head">
        <div>
          <h3>{agent.name ?? agent.id}</h3>
          {agent.description && <p className="muted">{agent.description}</p>}
        </div>
        <span className="chip">{ROLE_LABEL[agent.role ?? ''] ?? agent.role ?? 'Agente'}</span>
      </header>
      <div className="agent__controls">
        <label>
          <span className="field__label">Proveedor</span>
          <select value={draft.provider_id ?? ''} onChange={event => onDraft({ ...draft, provider_id: event.target.value, model_id: null })}>
            {!draft.provider_id && <option value="">Elige un proveedor</option>}
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          <span className="field__label">Modelo</span>
          <ModelSelect label={`Modelo de ${agent.name ?? agent.id}`} providerId={draft.provider_id} value={draft.model_id}
            onChange={model_id => onDraft({ ...draft, model_id })} />
        </label>
        <label className="switch agent__enabled">
          <input type="checkbox" checked={Boolean(draft.enabled)} onChange={event => onDraft({ ...draft, enabled: event.target.checked ? 1 : 0 })} />
          <span>Habilitado</span>
        </label>
        <button className="btn btn--ghost" disabled={!changed || busy || !draft.provider_id || !draft.model_id} onClick={onSave}>Guardar solo este</button>
      </div>
    </li>
  )
}
