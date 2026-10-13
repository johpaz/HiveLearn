import { useEffect, useState } from 'react'
import { api } from '../../api'
import { ModelSelect } from '../../components/ModelSelect'
import { Notice, Spinner } from '../../components/ui'
import { agentChanged, usableProviders, type ProviderRow } from '../../settings-logic'
import type { AgentConfig } from '../../types'

const ROLE_LABEL: Record<string, string> = { coordinator: 'Coordinador', worker: 'Especialista', specialist: 'Especialista' }

export function AgentsPanel({ rows }: { rows: ProviderRow[] }) {
  const [agents, setAgents] = useState<AgentConfig[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.agents().then(list => { if (alive) setAgents(list) }).catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [])

  if (error) return <Notice kind="error">{error}</Notice>
  if (!agents) return <Spinner label="Cargando agentes…" />

  const usable = usableProviders(rows)
  const replace = (next: AgentConfig) => setAgents(list => list?.map(a => a.id === next.id ? next : a) ?? null)

  return (
    <section aria-labelledby="agents-title">
      <h2 id="agents-title" className="panel__title">Modelos de los agentes</h2>
      <p className="panel__lead">
        Cada agente puede usar su propio proveedor y modelo (por ejemplo, uno rápido para lo visual y uno potente para el contenido).
        Si guardas los valores por defecto de “Política y respaldo”, se aplican a todos los agentes y reemplazan estas elecciones.
      </p>
      {usable.length === 0 && <Notice kind="info">Aún no hay proveedores utilizables: activa uno y guarda su clave en “APIs y proveedores”.</Notice>}
      <ul className="agent-list">
        {agents.map(agent => <AgentRow key={agent.id} agent={agent} usable={usable} onSaved={replace} />)}
      </ul>
    </section>
  )
}

function AgentRow({ agent, usable, onSaved }: { agent: AgentConfig; usable: ProviderRow[]; onSaved: (agent: AgentConfig) => void }) {
  const [saved, setSaved] = useState(agent)
  const [draft, setDraft] = useState(agent)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const providers = usable.some(p => p.id === draft.provider_id) || !draft.provider_id
    ? usable
    : [{ id: draft.provider_id, name: `${draft.provider_id} (no disponible)` } as ProviderRow, ...usable]
  const dirty = agentChanged(saved, draft)

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      await api.saveAgent(draft)
      setSaved(draft)
      onSaved(draft)
      setMessage({ kind: 'success', text: 'Guardado' })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="agent card">
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
          <select value={draft.provider_id ?? ''} onChange={event => setDraft({ ...draft, provider_id: event.target.value, model_id: null })}>
            {!draft.provider_id && <option value="">Elige un proveedor</option>}
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          <span className="field__label">Modelo</span>
          <ModelSelect label={`Modelo de ${agent.name ?? agent.id}`} providerId={draft.provider_id} value={draft.model_id}
            onChange={model_id => setDraft({ ...draft, model_id })} />
        </label>
        <label className="switch agent__enabled">
          <input type="checkbox" checked={Boolean(draft.enabled)} onChange={event => setDraft({ ...draft, enabled: event.target.checked ? 1 : 0 })} />
          <span>Habilitado</span>
        </label>
        <button className="btn btn--primary" disabled={!dirty || busy || !draft.provider_id || !draft.model_id} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </li>
  )
}
