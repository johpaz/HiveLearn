import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { HexLogo, Notice, Spinner } from '../components/ui'
import { mergeProviders, type ProviderRow } from '../settings-logic'
import type { Account, InstitutionSettings } from '../types'
import { AgentsPanel } from './settings/AgentsPanel'
import { PolicyPanel } from './settings/PolicyPanel'
import { ProvidersPanel } from './settings/ProvidersPanel'

const ROLE_LABEL = { admin: 'Administrador', teacher: 'Docente', student: 'Alumno' } as const

export function Console({ account, tab, onLogout }: { account: Account; tab: 'home' | 'settings'; onLogout: () => void }) {
  const isAdmin = account.role === 'admin'
  return (
    <div className="console">
      <header className="console__bar">
        <a className="brand" href="#/" aria-label="HiveLearn, portada"><HexLogo /> <span>HiveLearn</span></a>
        <nav className="tabs" aria-label="Secciones">
          <a href="#/panel/inicio" className={`tab ${tab === 'home' ? 'tab--active' : ''}`} aria-current={tab === 'home' ? 'page' : undefined}>Inicio</a>
          {isAdmin && <a href="#/panel/configuracion" className={`tab ${tab === 'settings' ? 'tab--active' : ''}`} aria-current={tab === 'settings' ? 'page' : undefined}>Configuración</a>}
        </nav>
        <div className="console__user">
          <span><strong>{account.name}</strong> · {ROLE_LABEL[account.role]}</span>
          <button className="btn btn--ghost" onClick={onLogout}>Salir</button>
        </div>
      </header>
      <main className="console__main">
        {tab === 'settings' && isAdmin ? <SettingsTab /> : <Home account={account} />}
      </main>
    </div>
  )
}

function Home({ account }: { account: Account }) {
  const [stats, setStats] = useState<{ students: number; teachers: number; diagnosed: number } | null>(null)
  const staff = account.role !== 'student'
  useEffect(() => {
    if (!staff) return
    let alive = true
    api.dashboard().then(d => { if (alive) setStats(d.stats) }).catch(() => undefined)
    return () => { alive = false }
  }, [staff])

  return (
    <section>
      <h1 className="console__title">Hola, {account.name.split(' ')[0]}</h1>
      {staff && stats && (
        <ul className="stats" aria-label="Resumen">
          <li><strong>{stats.students}</strong><span>Alumnos</span></li>
          <li><strong>{stats.teachers}</strong><span>Docentes</span></li>
          <li><strong>{stats.diagnosed}</strong><span>Con diagnóstico</span></li>
        </ul>
      )}
      {account.role === 'admin'
        ? <Notice kind="info">Configura los proveedores, las claves y los modelos de los agentes en la pestaña <a href="#/panel/configuracion">Configuración</a>.</Notice>
        : <Notice kind="info">Tu espacio de aprendizaje está en preparación en esta interfaz. Por ahora puedes seguir usando el portal de tu institución.</Notice>}
    </section>
  )
}

type Section = 'apis' | 'agents' | 'policy'
const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'apis', label: 'APIs y proveedores' },
  { id: 'agents', label: 'Modelos de los agentes' },
  { id: 'policy', label: 'Política y respaldo' },
]

function SettingsTab() {
  const [section, setSection] = useState<Section>('apis')
  const [data, setData] = useState<{ settings: InstitutionSettings; rows: ProviderRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [portal, gateway] = await Promise.all([api.settings(), api.gatewayProviders()])
    setData({ settings: portal.settings, rows: mergeProviders(portal.providers, gateway) })
  }, [])

  useEffect(() => { load().catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración')) }, [load])

  if (error) return <Notice kind="error">{error}</Notice>
  if (!data) return <Spinner label="Cargando configuración…" />

  return (
    <div className="settings">
      <h1 className="console__title">Configuración</h1>
      <div className="segmented" role="tablist" aria-label="Secciones de configuración">
        {SECTIONS.map(item => (
          <button key={item.id} role="tab" aria-selected={section === item.id} className={`segmented__item ${section === item.id ? 'segmented__item--active' : ''}`}
            onClick={() => setSection(item.id)}>{item.label}</button>
        ))}
      </div>
      <div role="tabpanel">
        {section === 'apis' && <ProvidersPanel rows={data.rows} onChanged={load} />}
        {section === 'agents' && <AgentsPanel rows={data.rows} />}
        {section === 'policy' && <PolicyPanel key={JSON.stringify(data.settings)} initial={data.settings} rows={data.rows} onSaved={load} />}
      </div>
    </div>
  )
}
