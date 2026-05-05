import { useRioMundoStore } from '@/store/rioMundoStore'

export function ConnectionIndicator() {
  const wsStatus = useRioMundoStore(s => s.wsStatus)
  const wsLatencyMs = useRioMundoStore(s => s.wsLatencyMs)
  const isConnected = wsStatus === 'connected'

  let bars = 0
  if (isConnected && wsLatencyMs !== null) {
    if (wsLatencyMs < 50) bars = 4
    else if (wsLatencyMs < 100) bars = 3
    else if (wsLatencyMs < 300) bars = 2
    else bars = 1
  } else if (isConnected) {
    bars = 4
  }

  const color = isConnected ? '#34d399' : '#f87171'

  const title = isConnected
    ? `Conectado${wsLatencyMs !== null ? ` — ${wsLatencyMs}ms` : ''}`
    : 'Sin conexión — reconectando...'

  return (
    <div className="flex items-end gap-[2px] h-3 cursor-help" title={title}>
      {[1, 2, 3, 4].map((bar) => (
        <div
          key={bar}
          className="w-[3px] rounded-sm"
          style={{
            height: `${bar * 3}px`,
            backgroundColor: bar <= bars ? color : `${color}33`,
          }}
        />
      ))}
    </div>
  )
}
