import { useState } from 'react'
import { api } from '../../api'
import { Notice } from '../../components/ui'
import type { ProviderRow } from '../../settings-logic'

export function ProvidersPanel({ rows, onChanged }: { rows: ProviderRow[]; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="providers-title">
      <h2 id="providers-title" className="panel__title">APIs y proveedores</h2>
      <p className="panel__lead">
        Las claves se guardan en el llavero del servidor y nunca vuelven al navegador. Un proveedor debe estar activo y
        (si es remoto) con clave para poder elegirse en los agentes.
      </p>
      <ul className="provider-list">
        {rows.map(row => <ProviderCard key={row.id} row={row} onChanged={onChanged} />)}
      </ul>
    </section>
  )
}

function ProviderCard({ row, onChanged }: { row: ProviderRow; onChanged: () => Promise<void> }) {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  async function guard(task: () => Promise<void>, ok: string) {
    setBusy(true)
    setMessage(null)
    try {
      await task()
      await onChanged()
      setMessage({ kind: 'success', text: ok })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar' })
    } finally {
      setBusy(false)
    }
  }

  const status = row.local ? 'Local · no requiere clave' : row.hasApiKey ? 'Clave guardada' : 'Sin clave'
  const statusClass = row.local || row.hasApiKey ? 'chip chip--ok' : 'chip chip--warn'

  return (
    <li className="provider card">
      <header className="provider__head">
        <div>
          <h3>{row.name}</h3>
          <p className="muted">{row.baseUrl || 'Endpoint por defecto del proveedor'} · {row.modelCount} modelos</p>
        </div>
        <div className="provider__badges">
          <span className={statusClass}>{status}</span>
          <label className="switch">
            <input type="checkbox" checked={row.enabled} disabled={busy}
              onChange={event => void guard(() => api.setProviderEnabled(row.id, event.target.checked).then(() => undefined), event.target.checked ? 'Proveedor activado' : 'Proveedor desactivado')} />
            <span>{row.enabled ? 'Activo' : 'Inactivo'}</span>
          </label>
        </div>
      </header>
      {!row.local && (
        <form className="provider__key" onSubmit={event => {
          event.preventDefault()
          if (!apiKey.trim()) return
          void guard(async () => { await api.saveCredential(row.id, apiKey.trim()); setApiKey('') }, 'Clave guardada')
        }}>
          <label className="sr-only" htmlFor={`key-${row.id}`}>API key de {row.name}</label>
          <input id={`key-${row.id}`} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder={row.hasApiKey ? 'Pega una clave nueva para reemplazarla' : 'Pega tu API key'}
            autoComplete="off" spellCheck={false} />
          <button className="btn btn--primary" disabled={busy || !apiKey.trim()}>Guardar clave</button>
        </form>
      )}
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
    </li>
  )
}
