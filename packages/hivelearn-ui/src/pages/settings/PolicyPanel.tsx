import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { ModelSelect } from '../../components/ModelSelect'
import { Notice } from '../../components/ui'
import { settingsPayload, usableProviders, type ProviderRow } from '../../settings-logic'
import type { InstitutionSettings } from '../../types'

export function PolicyPanel({ initial, rows, onSaved }: { initial: InstitutionSettings; rows: ProviderRow[]; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(initial)
  // La configuración puede recargarse en segundo plano: solo se reemplaza el borrador si el usuario no lo tocó.
  const baseline = useRef(JSON.stringify(initial))
  useEffect(() => {
    const incoming = JSON.stringify(initial)
    if (incoming === baseline.current) return
    setDraft(current => (JSON.stringify(current) === baseline.current ? initial : current))
    baseline.current = incoming
  }, [initial])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const usable = usableProviders(rows)
  const set = <K extends keyof InstitutionSettings>(key: K, value: InstitutionSettings[K]) => setDraft(current => ({ ...current, [key]: value }))

  const providerSelect = (value: string, onChange: (id: string) => void, label: string, optional = false, voice = false) => {
    const list = voice ? usableProviders(rows, { voice: true }) : usable
    return (
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
      {optional && <option value="">Sin respaldo</option>}
      {!optional && !list.some(p => p.id === value) && <option value={value}>{value} (no disponible)</option>}
      {list.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    )
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      await api.saveSettings(settingsPayload(draft))
      await onSaved()
      setMessage({ kind: 'success', text: 'Configuración guardada y aplicada a todos los agentes.' })
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="policy-title">
      <h2 id="policy-title" className="panel__title">Política y respaldo</h2>
      <p className="panel__lead">Modelo por defecto, reglas para proveedores remotos y modelo de respaldo si el principal no responde.</p>

      <div className="card form-grid">
        <h3>Modelos por defecto</h3>
        <ModelRow label="Texto y agentes" provider={providerSelect(draft.providerId, id => setDraft(d => ({ ...d, providerId: id, modelId: '' })), 'Proveedor de texto')}
          model={<ModelSelect label="Modelo de texto" providerId={draft.providerId} value={draft.modelId} onChange={v => set('modelId', v)} />} />
        <ModelRow label="Imágenes" provider={providerSelect(draft.imageProviderId, id => setDraft(d => ({ ...d, imageProviderId: id, imageModelId: '' })), 'Proveedor de imágenes')}
          model={<ModelSelect label="Modelo de imágenes" providerId={draft.imageProviderId} value={draft.imageModelId} onChange={v => set('imageModelId', v)} />} />
        <ModelRow label="Audio" provider={providerSelect(draft.audioProviderId, id => setDraft(d => ({ ...d, audioProviderId: id, audioModelId: '' })), 'Proveedor de audio', false, true)}
          model={<ModelSelect label="Modelo de audio" providerId={draft.audioProviderId} value={draft.audioModelId} onChange={v => set('audioModelId', v)} />} />
        <ModelRow label="Respaldo" provider={providerSelect(draft.fallbackProviderId ?? '', id => setDraft(d => ({ ...d, fallbackProviderId: id || undefined, fallbackModelId: undefined })), 'Proveedor de respaldo', true)}
          model={<ModelSelect label="Modelo de respaldo" providerId={draft.fallbackProviderId ?? null} value={draft.fallbackModelId ?? null} onChange={v => set('fallbackModelId', v)} />} />
      </div>

      <div className="card">
        <h3>Reglas</h3>
        <Toggle checked={draft.allowRemoteProviders} onChange={v => set('allowRemoteProviders', v)}
          label="Permitir proveedores remotos" hint="Apagado, solo se usan modelos de la red local (Ollama, llama.cpp)." />
        <Toggle checked={draft.allowRemoteForMinors} disabled={!draft.allowRemoteProviders} onChange={v => set('allowRemoteForMinors', v)}
          label="Permitir remotos con menores de edad" hint="Requiere el punto anterior. Un menor nunca cae a un respaldo remoto si esto está apagado." />
        <Toggle checked={draft.oracleEnabled !== false} onChange={v => set('oracleEnabled', v)}
          label="Oráculo de decisiones (Kev)" hint="Asesora delegación, respuestas abiertas y avance de nivel. Con la clave de HiveAgents." />
        <Toggle checked={Boolean(draft.allowSelfRegistration)} onChange={v => set('allowSelfRegistration', v)}
          label="Registro autónomo de adultos" hint="Permite que mayores de 18 años creen su propia cuenta." />
      </div>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <div className="actions">
        <button className="btn btn--primary" disabled={busy || !draft.modelId || !draft.imageModelId || !draft.audioModelId} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar y aplicar a todos'}
        </button>
      </div>
    </section>
  )
}

function ModelRow({ label, provider, model }: { label: string; provider: React.ReactNode; model: React.ReactNode }) {
  return (
    <div className="model-row">
      <span className="model-row__label">{label}</span>
      {provider}
      {model}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <label className={`toggle ${disabled ? 'toggle--disabled' : ''}`}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </label>
  )
}
