import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { clearModelCache } from '../../components/ModelSelect'
import { Notice } from '../../components/ui'
import type { ProviderRow } from '../../settings-logic'
import type { ProviderSyncReport, SyncReport } from '../../types'

const STATUS_TEXT: Record<ProviderSyncReport['status'], string> = { ok: 'Al día', skipped: 'Omitido', error: 'Con error' }

/** Resumen de una línea de lo que cambió en un proveedor. */
export function describeSync(r: ProviderSyncReport): string {
  if (r.status !== 'ok') return `${STATUS_TEXT[r.status]}${r.reason ? `: ${r.reason}` : ''}`
  const parts = [
    r.added.length && `${r.added.length} nuevos`,
    r.updated.length && `${r.updated.length} actualizados`,
    r.removed.length && `${r.removed.length} retirados`,
    r.protected.length && `${r.protected.length} en uso que el proveedor ya no sirve`,
    r.migrated.length && `${r.migrated.length} ids migrados`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Sin cambios'
}

export function ProvidersPanel({ rows, onChanged }: { rows: ProviderRow[]; onChanged: () => Promise<void> }) {
  return (
    <section aria-labelledby="providers-title">
      <h2 id="providers-title" className="panel__title">APIs y proveedores</h2>
      <p className="panel__lead">
        Las claves se guardan en el llavero del servidor y nunca vuelven al navegador. Un proveedor debe estar activo y
        (si es remoto) con clave para poder elegirse en los agentes.
      </p>
      <SyncAll rows={rows} onChanged={onChanged} />
      <ul className="provider-list">
        {rows.map(row => <ProviderCard key={row.id} row={row} onChanged={onChanged} />)}
      </ul>
    </section>
  )
}

function SyncAll({ rows, onChanged }: { rows: ProviderRow[]; onChanged: () => Promise<void> }) {
  const [report, setReport] = useState<SyncReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.modelSyncStatus().then(s => { setReport(s.report); if (s.running) { setRunning(true); poll() } }).catch(() => undefined)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function poll() {
    timer.current = setTimeout(async () => {
      try {
        const status = await api.modelSyncStatus()
        if (status.running) return poll()
        setRunning(false)
        setReport(status.report)
        clearModelCache()
        await onChanged()
      } catch (e) {
        setRunning(false)
        setError(e instanceof Error ? e.message : 'No se pudo consultar la sincronización')
      }
    }, 2500)
  }

  async function start() {
    setError(null)
    setRunning(true)
    try {
      await api.syncModels()
      poll()
    } catch (e) {
      setRunning(false)
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la sincronización')
    }
  }

  const names = new Map(rows.map(r => [r.id, r.name]))
  return (
    <div className="card sync">
      <div className="sync__head">
        <div>
          <h3>Catálogo de modelos</h3>
          <p className="muted">
            Se actualiza solo cada 24 h: agrega los modelos nuevos (inactivos), actualiza contexto y capacidades, y retira los que el
            proveedor ya no sirve, salvo que un agente los use. Los de OpenRouter llevan el prefijo <code>openrouter/</code>. La corrida automática respeta la política de proveedores remotos; “Actualizar ahora” no.
          </p>
        </div>
        <button className="btn btn--primary" disabled={running} onClick={() => void start()}>{running ? 'Actualizando…' : 'Actualizar ahora'}</button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {report && (
        <>
          <p className="muted">Última sincronización: {new Date(report.finishedAt).toLocaleString()}</p>
          <ul className="sync__list">
            {report.providers.filter(p => p.status !== 'skipped' || p.reason !== 'sin API de listado').map(p => (
              <li key={p.providerId}>
                <strong>{names.get(p.providerId) ?? p.providerId}</strong>
                <span className={`chip ${p.status === 'ok' ? 'chip--ok' : p.status === 'error' ? 'chip--warn' : ''}`}>{describeSync(p)}</span>
                {p.protected.length > 0 && <small className="muted">Revisa: {p.protected.map(x => `${x.id} (${x.usedBy.join(', ')})`).join('; ')}</small>}
                {p.deletionsBlocked && <small className="muted">No se retiró nada: {p.deletionsBlocked}.</small>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
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
