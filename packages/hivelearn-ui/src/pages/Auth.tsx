import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Field, HexLogo, Notice } from '../components/ui'
import { HiveCanvas } from '../components/HiveCanvas'
import type { Account, InstallStatus, Role } from '../types'
import type { Route } from '../router'

type Mode = Extract<Route, { name: 'auth' }>['mode']

const ROLE_LABEL: Record<Role, string> = { student: 'Alumno', teacher: 'Docente', admin: 'Administrador' }
const TABS: Array<{ mode: Mode; label: string; href: string }> = [
  { mode: 'login', label: 'Ingresar', href: '#/acceso' },
  { mode: 'activate', label: 'Tengo un código', href: '#/activar' },
  { mode: 'register', label: 'Crear cuenta', href: '#/registro' },
]

interface Props {
  mode: Mode
  status: InstallStatus
  onAuthenticated: (account: Account) => void
  onConfigured: () => void
}

export function Auth({ mode, status, onAuthenticated, onConfigured }: Props) {
  return (
    <div className="auth">
      <HiveCanvas />
      <div className="landing__veil" aria-hidden="true" />
      <a className="brand brand--float" href="#/" aria-label="HiveLearn, volver al inicio">
        <HexLogo /> <span>HiveLearn</span>
      </a>
      <main className="auth__card">
        {!status.configured
          ? <SetupForm onDone={onConfigured} onAuthenticated={onAuthenticated} />
          : <>
              <h1 className="auth__title">{status.institution === 'HiveLearn' ? 'Bienvenido' : status.institution}</h1>
              <nav className="tabs tabs--small" aria-label="Tipo de acceso">
                {TABS.map(tab => (
                  <a key={tab.mode} href={tab.href} className={`tab ${tab.mode === mode || (mode === 'recover' && tab.mode === 'login') ? 'tab--active' : ''}`}
                    aria-current={tab.mode === mode ? 'page' : undefined}>
                    {tab.label}
                  </a>
                ))}
              </nav>
              {mode === 'login' && <LoginForm onAuthenticated={onAuthenticated} />}
              {mode === 'activate' && <ActivateForm />}
              {mode === 'register' && <RegisterForm />}
              {mode === 'recover' && <RecoverForm />}
            </>}
      </main>
    </div>
  )
}

/** Estado común de un formulario: ocupado + mensaje, con captura de errores de la API. */
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try { await task() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación') } finally { setBusy(false) }
  }
  return { busy, error, setError, run }
}

function LoginForm({ onAuthenticated }: { onAuthenticated: (account: Account) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('student')
  const { busy, error, run } = useSubmit()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => onAuthenticated(await api.login({ username: username.trim().toLowerCase(), password, role })))
  }
  return (
    <form onSubmit={submit} className="form">
      <Field label="Soy">
        <select value={role} onChange={e => setRole(e.target.value as Role)}>
          {(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </Field>
      <Field label="Usuario">
        <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Field label="Contraseña">
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Entrando…' : 'Ingresar'}</button>
      <a className="link" href="#/recuperar">Olvidé mi contraseña</a>
    </form>
  )
}

function ActivateForm() {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const { busy, error, run } = useSubmit()
  if (done) return <Notice kind="success">Cuenta activada. Ya puedes <a href="#/acceso">ingresar</a> con tu usuario y esa contraseña.</Notice>
  return (
    <form className="form" onSubmit={e => { e.preventDefault(); void run(async () => { await api.activate({ code: code.trim(), password }); setDone(true) }) }}>
      <p className="form__intro">Tu docente o administrador te dio un código de activación. Elige tu contraseña para empezar.</p>
      <Field label="Código de activación"><input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" spellCheck={false} required /></Field>
      <Field label="Nueva contraseña" hint="Mínimo 12 caracteres.">
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={12} required />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Activando…' : 'Activar cuenta'}</button>
    </form>
  )
}

function RegisterForm() {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [age, setAge] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const { busy, error, run } = useSubmit()

  if (recoveryCode) {
    return (
      <div className="form">
        <Notice kind="success">Cuenta creada. Guarda este código de recuperación: solo se muestra una vez.</Notice>
        <code className="recovery">{recoveryCode}</code>
        <p className="form__intro">Con él podrás restablecer tu contraseña si la olvidas.</p>
        <a className="btn btn--primary btn--block" href="#/acceso">Ya lo guardé, ingresar</a>
      </div>
    )
  }
  return (
    <form className="form" onSubmit={e => {
      e.preventDefault()
      void run(async () => setRecoveryCode((await api.register({ name: name.trim(), username: username.trim().toLowerCase(), password, age: Number(age) })).recoveryCode))
    }}>
      <p className="form__intro">El registro autónomo es para mayores de 18 años y debe estar habilitado por tu institución.</p>
      <Field label="Nombre"><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" minLength={2} required /></Field>
      <Field label="Usuario" hint="3 a 50 caracteres: letras sin tilde, números, punto, guion o guion bajo.">
        <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Field label="Edad"><input type="number" inputMode="numeric" min={18} max={120} value={age} onChange={e => setAge(e.target.value)} required /></Field>
      <Field label="Contraseña" hint="Mínimo 12 caracteres.">
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={12} required />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
    </form>
  )
}

function RecoverForm() {
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const { busy, error, run } = useSubmit()
  if (done) return <Notice kind="success">Contraseña restablecida. <a href="#/acceso">Ingresar</a>.</Notice>
  return (
    <form className="form" onSubmit={e => { e.preventDefault(); void run(async () => { await api.recover({ username: username.trim().toLowerCase(), code: code.trim(), password }); setDone(true) }) }}>
      <p className="form__intro">Usa el código de recuperación que guardaste al crear tu cuenta. Si no lo tienes, pide a tu docente o administrador un restablecimiento.</p>
      <Field label="Usuario"><input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required /></Field>
      <Field label="Código de recuperación"><input value={code} onChange={e => setCode(e.target.value)} spellCheck={false} required /></Field>
      <Field label="Nueva contraseña" hint="Mínimo 12 caracteres.">
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={12} required />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Restableciendo…' : 'Restablecer contraseña'}</button>
    </form>
  )
}

function SetupForm({ onDone, onAuthenticated }: { onDone: () => void; onAuthenticated: (account: Account) => void }) {
  const [institution, setInstitution] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useSubmit()
  return (
    <>
      <h1 className="auth__title">Configura tu institución</h1>
      <form className="form" onSubmit={e => {
        e.preventDefault()
        void run(async () => {
          const clean = username.trim().toLowerCase()
          await api.setup({ institution: institution.trim(), name: name.trim(), username: clean, password })
          onDone()
          onAuthenticated(await api.login({ username: clean, password, role: 'admin' }))
        })
      }}>
        <p className="form__intro">Es la primera vez que se abre HiveLearn. Crea la institución y su administrador; después esta pantalla se cierra.</p>
        <Field label="Nombre de la institución"><input value={institution} onChange={e => setInstitution(e.target.value)} minLength={2} required /></Field>
        <Field label="Tu nombre"><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" minLength={2} required /></Field>
        <Field label="Usuario administrador"><input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required /></Field>
        <Field label="Contraseña" hint="Mínimo 12 caracteres.">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={12} required />
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Configurando…' : 'Crear institución'}</button>
      </form>
    </>
  )
}
