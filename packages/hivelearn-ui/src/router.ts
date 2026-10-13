import { useEffect, useState } from 'react'

export type Route =
  | { name: 'landing' }
  | { name: 'auth'; mode: 'login' | 'register' | 'activate' | 'recover' }
  | { name: 'console'; tab: 'home' | 'users' | 'settings' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0]
  switch (path) {
    case 'acceso': return { name: 'auth', mode: 'login' }
    case 'registro': return { name: 'auth', mode: 'register' }
    case 'activar': return { name: 'auth', mode: 'activate' }
    case 'recuperar': return { name: 'auth', mode: 'recover' }
    case 'panel':
    case 'panel/inicio': return { name: 'console', tab: 'home' }
    case 'panel/usuarios': return { name: 'console', tab: 'users' }
    case 'panel/configuracion': return { name: 'console', tab: 'settings' }
    default: return { name: 'landing' }
  }
}

export function hrefFor(route: Route): string {
  if (route.name === 'landing') return '#/'
  if (route.name === 'auth') return `#/${{ login: 'acceso', register: 'registro', activate: 'activar', recover: 'recuperar' }[route.mode]}`
  return route.tab === 'settings' ? '#/panel/configuracion' : route.tab === 'users' ? '#/panel/usuarios' : '#/panel/inicio'
}

export function navigate(route: Route) {
  window.location.hash = hrefFor(route)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
