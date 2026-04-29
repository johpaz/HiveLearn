// WebSocket URL para HiveLearn
export function wsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const token = typeof localStorage !== 'undefined'
    ? localStorage.getItem('hive-auth-token')
    : null
  const url = new URL(`${protocol}//${host}${path}`)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}
