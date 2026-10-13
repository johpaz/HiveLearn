import type { ReactNode } from 'react'

export function HexLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2l12 7v14l-12 7L4 23V9z" fill="var(--honey)" />
      <path d="M16 9l6 3.5v7L16 23l-6-3.5v-7z" fill="var(--bg)" opacity="0.85" />
    </svg>
  )
}

/** Mensaje de estado accesible: `role="alert"` para errores, `status` para el resto. */
export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <p className={`notice notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return <p className="spinner" role="status"><span className="spinner__dot" aria-hidden="true" />{label}</p>
}
