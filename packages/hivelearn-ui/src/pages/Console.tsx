import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { HexLogo, Notice, Spinner } from '../components/ui'
import { mergeProviders, type ProviderRow } from '../settings-logic'
import type { Account, InstitutionSettings } from '../types'
import { UsersTab } from './UsersTab'
import { ProgramTab } from './ProgramTab'
import { ReviewsTab } from './ReviewsTab'
import { AgentsPanel } from './settings/AgentsPanel'
import { PolicyPanel } from './settings/PolicyPanel'
import { ProvidersPanel } from './settings/ProvidersPanel'

const ROLE_LABEL = { admin: 'Administrador', teacher: 'Docente', student: 'Alumno' } as const

export function Console({ account, tab, onLogout }: { account: Account; tab: 'home' | 'program' | 'reviews' | 'users' | 'settings'; onLogout: () => void }) {
  const isAdmin = account.role === 'admin'
  const isStaff = account.role !== 'student'
  return (
    <div className="console">
      <header className="console__bar">
        <a className="brand" href="#/" aria-label="HiveLearn, portada"><HexLogo /> <span>HiveLearn</span></a>
        <nav className="tabs" aria-label="Secciones">
          <a href="#/panel/inicio" className={`tab ${tab === 'home' ? 'tab--active' : ''}`} aria-current={tab === 'home' ? 'page' : undefined}>Inicio</a>
          {!isStaff && <a href="#/panel/programa" className={`tab ${tab === 'program' ? 'tab--active' : ''}`} aria-current={tab === 'program' ? 'page' : undefined}>Mi programa</a>}
          {isStaff && <a href="#/panel/validaciones" className={`tab ${tab === 'reviews' ? 'tab--active' : ''}`} aria-current={tab === 'reviews' ? 'page' : undefined}>Validaciones</a>}
          {isStaff && <a href="#/panel/usuarios" className={`tab ${tab === 'users' ? 'tab--active' : ''}`} aria-current={tab === 'users' ? 'page' : undefined}>Usuarios</a>}
          {isAdmin && <a href="#/panel/configuracion" className={`tab ${tab === 'settings' ? 'tab--active' : ''}`} aria-current={tab === 'settings' ? 'page' : undefined}>Configuración</a>}
        </nav>
        <div className="console__user">
          <span><strong>{account.name}</strong> · {ROLE_LABEL[account.role]}</span>
          <button className="btn btn--ghost" onClick={onLogout}>Salir</button>
        </div>
      </header>
      <main className="console__main">
        {tab === 'settings' && isAdmin ? <SettingsTab />
          : tab === 'users' && isStaff ? <UsersTab account={account} />
          : tab === 'reviews' && isStaff ? <ReviewsTab />
          : tab === 'program' && !isStaff ? <ProgramTab />
          : <Home account={account} />}
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
        ? <Notice kind="info">Crea docentes y alumnos en <a href="#/panel/usuarios">Usuarios</a>; configura proveedores, claves y modelos en <a href="#/panel/configuracion">Configuración</a>.</Notice>
        : account.role === 'teacher'
          ? <Notice kind="info">Crea y gestiona a tus alumnos en <a href="#/panel/usuarios">Usuarios</a> y valida sus programas en <a href="#/panel/validaciones">Validaciones</a>.</Notice>
          : <Notice kind="info">Empieza en <a href="#/panel/programa">Mi programa</a>: cuéntanos qué quieres aprender hoy y armamos un programa para ti.</Notice>}
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
        {section === 'policy' && <PolicyPanel initial={data.settings} rows={data.rows} onSaved={load} />}
      </div>
    </div>
  )
}
