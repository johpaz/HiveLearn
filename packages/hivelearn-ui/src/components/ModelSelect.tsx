import { useEffect, useState } from 'react'
import { api } from '../api'
import { modelOptions } from '../settings-logic'
import type { ModelInfo } from '../types'

const cache = new Map<string, Promise<ModelInfo[]>>()

function loadModels(providerId: string): Promise<ModelInfo[]> {
  let pending = cache.get(providerId)
  if (!pending) {
    pending = api.providerModels(providerId).catch(error => { cache.delete(providerId); throw error })
    cache.set(providerId, pending)
  }
  return pending
}

/** Selector de modelo de un proveedor; carga la lista bajo demanda y la reutiliza. */
export function ModelSelect({ providerId, value, onChange, label, id }: {
  providerId: string | null
  value: string | null
  onChange: (modelId: string) => void
  label: string
  id?: string
}) {
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!providerId) { setModels([]); return }
    let alive = true
    setModels(null)
    setFailed(false)
    loadModels(providerId).then(list => { if (alive) setModels(list) }).catch(() => { if (alive) { setModels([]); setFailed(true) } })
    return () => { alive = false }
  }, [providerId])

  const options = models ? modelOptions(models, value) : []
  return (
    <select id={id} aria-label={label} value={value ?? ''} disabled={!providerId || models === null}
      onChange={event => onChange(event.target.value)}>
      {models === null && <option value="">Cargando modelos…</option>}
      {models !== null && !value && <option value="">Elige un modelo</option>}
      {options.map(model => (
        <option key={model.id} value={model.id}>
          {(model.name ?? model.id)}{model.active ? '' : ' · inactivo'}
        </option>
      ))}
      {failed && <option value="" disabled>No se pudieron cargar los modelos</option>}
    </select>
  )
}
