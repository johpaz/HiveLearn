import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { CodeBox, type IssuedCode } from '../components/CodeBox'
import { Field, Notice, Spinner } from '../components/ui'
import type { Account, ImportPreview, Invitation, StudentInput } from '../types'

const ROLE_LABEL = { admin: 'Administrador', teacher: 'Docente', student: 'Alumno' } as const
const DOC_TYPES: Array<[StudentInput['tipo_documento'], string]> = [['ti', 'Tarjeta de identidad'], ['cc', 'Cédula de ciudadanía'], ['ce', 'Cédula de extranjería'], ['pasaporte', 'Pasaporte'], ['otro', 'Otro']]

const fromInvitations = (list: Invitation[]): IssuedCode[] => list.map(i => ({ username: i.username, name: i.name, code: i.activationCode }))

export function UsersTab({ account }: { account: Account }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ title: string; note: string; codes: IssuedCode[] } | null>(null)

  const load = useCallback(async () => setAccounts((await api.dashboard()).accounts), [])
  useEffect(() => { load().catch(e => setError(e instanceof Error ? e.message : 'No se pudieron cargar las cuentas')) }, [load])

  const show = (title: string, codes: IssuedCode[], days: string) => {
    setIssued({ title, codes, note: `Cada código se muestra una sola vez y vence en ${days}. Entrégalo en privado: con él la persona elige su contraseña en “Tengo un código”.` })
    void load()
  }

  if (error) return <Notice kind="error">{error}</Notice>
  if (!accounts) return <Spinner label="Cargando cuentas…" />

  return (
    <div className="users">
      <h1 className="console__title">Usuarios</h1>
      {issued && <CodeBox title={issued.title} codes={issued.codes} note={issued.note} onClose={() => setIssued(null)} />}

      <div className="users__grid">
        {account.role === 'admin' && <TeacherForm onCreated={invite => show('Docente creado', fromInvitations([invite]), '7 días')} />}
        <StudentForm onCreated={list => show(list.length > 1 ? `${list.length} alumnos creados` : 'Alumno creado', fromInvitations(list), '7 días')} />
        <ImportForm onCreated={list => show(`${list.length} alumnos importados`, fromInvitations(list), '7 días')} />
      </div>

      <h2 className="panel__title">Cuentas</h2>
      <AccountList accounts={accounts} self={account}
        onActivation={(a, code) => show('Nuevo código de activación', [{ username: a.username, name: a.name, code }], '7 días')}
        onReset={(a, code) => show('Código para restablecer la contraseña', [{ username: a.username, name: a.name, code }], '24 horas')} />
    </div>
  )
}

function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try { await task() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación') } finally { setBusy(false) }
  }
  return { busy, error, run }
}

function TeacherForm({ onCreated }: { onCreated: (invite: Invitation) => void }) {
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const { busy, error, run } = useAction()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const result = await api.createTeacher({ username: username.trim().toLowerCase(), name: name.trim() })
      setUsername(''); setName('')
      onCreated({ username: result.account.username, name: result.account.name, activationCode: result.activationCode })
    })
  }
  return (
    <form className="card form" onSubmit={submit}>
      <h3>Crear docente</h3>
      <Field label="Nombre"><input value={name} onChange={e => setName(e.target.value)} minLength={2} required /></Field>
      <Field label="Usuario" hint="Letras sin tilde, números, punto, guion o guion bajo (3–50).">
        <input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} required />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn--primary" disabled={busy}>{busy ? 'Creando…' : 'Crear docente'}</button>
    </form>
  )
}

const EMPTY_STUDENT = { nickname: '', nombre: '', tipo_documento: 'ti' as StudentInput['tipo_documento'], documento: '', edad: '', grupo: '' }

function StudentForm({ onCreated }: { onCreated: (list: Invitation[]) => void }) {
  const [form, setForm] = useState(EMPTY_STUDENT)
  const [authorized, setAuthorized] = useState(false)
  const { busy, error, run } = useAction()
  const set = (key: keyof typeof EMPTY_STUDENT, value: string) => setForm(current => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const list = await api.createStudents([{ ...form, nickname: form.nickname.trim().toLowerCase(), nombre: form.nombre.trim(), documento: form.documento.trim(), grupo: form.grupo.trim(), edad: Number(form.edad) }])
      setForm(EMPTY_STUDENT); setAuthorized(false)
      onCreated(list)
    })
  }
  return (
    <form className="card form" onSubmit={submit}>
      <h3>Crear alumno</h3>
      <Field label="Nombre completo"><input value={form.nombre} onChange={e => set('nombre', e.target.value)} minLength={2} required /></Field>
      <Field label="Usuario (nickname)"><input value={form.nickname} onChange={e => set('nickname', e.target.value)} autoCapitalize="none" spellCheck={false} required /></Field>
      <div className="form__row">
        <Field label="Documento">
          <select value={form.tipo_documento} onChange={e => set('tipo_documento', e.target.value)}>
            {DOC_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Número"><input value={form.documento} onChange={e => set('documento', e.target.value)} minLength={3} required /></Field>
      </div>
      <div className="form__row">
        <Field label="Edad"><input type="number" inputMode="numeric" min={8} max={120} value={form.edad} onChange={e => set('edad', e.target.value)} required /></Field>
        <Field label="Grupo"><input value={form.grupo} onChange={e => set('grupo', e.target.value)} required /></Field>
      </div>
      <label className="toggle"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} required />
        <span><strong>Cuento con la autorización institucional</strong><small>Para tratar los datos de este alumno con fines de formación.</small></span>
      </label>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn--primary" disabled={busy || !authorized}>{busy ? 'Creando…' : 'Crear alumno'}</button>
    </form>
  )
}

function ImportForm({ onCreated }: { onCreated: (list: Invitation[]) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const { busy, error, run } = useAction()

  const choose = (selected: File | null) => {
    setFile(selected); setPreview(null); setAuthorized(false)
    if (selected) void run(async () => setPreview(await api.previewImport(selected)))
  }
  const valid = preview && preview.errors.length === 0 && preview.rows.length > 0

  return (
    <div className="card form">
      <h3>Importar desde Excel</h3>
      <p className="form__intro">Hasta 200 alumnos y 2 MB. Descarga la plantilla, complétala y súbela: verás una vista previa antes de crear nada.</p>
      <a className="link link--left" href="/api/portal/students/template" download>Descargar plantilla .xlsx</a>
      <Field label="Archivo .xlsx">
        <input type="file" accept=".xlsx" onChange={e => choose(e.target.files?.[0] ?? null)} />
      </Field>
      {busy && !preview && <Spinner label="Revisando archivo…" />}
      {preview && (
        <>
          <p className="muted">{preview.rows.length} filas válidas · {preview.errors.length} con errores</p>
          {preview.errors.length > 0 && (
            <ul className="errors">{preview.errors.slice(0, 8).map(e => <li key={e.row}>Fila {e.row}: {e.message}</li>)}</ul>
          )}
          {valid && (
            <ul className="preview">{preview.rows.slice(0, 5).map(r => <li key={r.nickname}>{r.nombre} · @{r.nickname} · {r.grupo}</li>)}
              {preview.rows.length > 5 && <li>… y {preview.rows.length - 5} más</li>}</ul>
          )}
        </>
      )}
      {valid && (
        <label className="toggle"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />
          <span><strong>Cuento con la autorización institucional</strong><small>Para todos los alumnos del archivo.</small></span>
        </label>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn--primary" disabled={busy || !valid || !authorized || !file}
        onClick={() => { if (file) void run(async () => { const list = await api.importStudents(file); setFile(null); setPreview(null); setAuthorized(false); onCreated(list) }) }}>
        {busy ? 'Importando…' : 'Crear alumnos'}
      </button>
    </div>
  )
}

function AccountList({ accounts, self, onActivation, onReset }: {
  accounts: Account[]
  self: Account
  onActivation: (account: Account, code: string) => void
  onReset: (account: Account, code: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const others = accounts.filter(a => a.id !== self.id)

  async function act(account: Account, task: () => Promise<void>) {
    setBusyId(account.id)
    setError(null)
    try { await task() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación') } finally { setBusyId(null) }
  }

  if (others.length === 0) return <Notice kind="info">Aún no hay otras cuentas. Crea un docente o un alumno con los formularios de arriba.</Notice>
  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="account-list">
        {others.map(a => {
          const active = Boolean(a.activatedAt)
          return (
            <li key={a.id} className="card account">
              <div>
                <strong>{a.name}</strong> <span className="muted">@{a.username}</span>
                <div className="account__meta">
                  <span className="chip">{ROLE_LABEL[a.role]}</span>
                  {a.group && <span className="chip">{a.group}</span>}
                  <span className={`chip ${active ? 'chip--ok' : 'chip--warn'}`}>{active ? 'Activa' : 'Pendiente de activación'}</span>
                </div>
              </div>
              {a.role !== 'admin' && (
                <button className="btn btn--ghost" disabled={busyId === a.id}
                  onClick={() => void act(a, async () => active ? onReset(a, (await api.issuePasswordReset(a.id)).resetCode) : onActivation(a, (await api.reissueInvitation(a.id)).activationCode))}>
                  {active ? 'Restablecer contraseña' : 'Nuevo código'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
