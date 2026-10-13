import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Spinner } from './components/ui'
import { Auth } from './pages/Auth'
import { Console } from './pages/Console'
import { Landing } from './pages/Landing'
import { navigate, useRoute } from './router'
import type { Account, InstallStatus } from './types'

export function App() {
  const route = useRoute()
  const [status, setStatus] = useState<InstallStatus | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [booting, setBooting] = useState(true)
  const [offline, setOffline] = useState(false)

  const refreshStatus = useCallback(async () => setStatus(await api.status()), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await refreshStatus()
        const me = await api.me().catch(() => null)
        if (alive) setAccount(me)
      } catch {
        if (alive) setOffline(true)
      } finally {
        if (alive) setBooting(false)
      }
    })()
    return () => { alive = false }
  }, [refreshStatus])

  // Rutas que exigen sesión / rutas que no tienen sentido con sesión.
  useEffect(() => {
    if (booting) return
    if (route.name === 'console' && !account) navigate({ name: 'auth', mode: 'login' })
    if (route.name === 'auth' && account && status?.configured) navigate({ name: 'console', tab: 'home' })
  }, [route, account, booting, status])

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setAccount(null)
    navigate({ name: 'landing' })
  }, [])

  const authenticated = useCallback((next: Account) => {
    setAccount(next)
    navigate({ name: 'console', tab: next.role === 'admin' ? 'settings' : 'home' })
  }, [])

  if (booting) return <div className="boot"><Spinner label="Iniciando HiveLearn…" /></div>

  const effectiveStatus: InstallStatus = status ?? { configured: true, institution: 'HiveLearn', hasLogo: false }

  if (route.name === 'landing' || offline) {
    return (
      <>
        {offline && <p className="offline" role="alert">No se pudo conectar con el servidor de HiveLearn. Revisa que esté en marcha.</p>}
        <Landing account={account} institution={effectiveStatus.institution} />
      </>
    )
  }
  if (route.name === 'auth') {
    return <Auth mode={route.mode} status={effectiveStatus} onAuthenticated={authenticated} onConfigured={() => void refreshStatus()} />
  }
  if (!account) return <div className="boot"><Spinner label="Redirigiendo…" /></div>
  return <Console account={account} tab={route.tab} onLogout={() => void logout()} />
}
