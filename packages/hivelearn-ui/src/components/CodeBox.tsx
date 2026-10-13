import { useState } from 'react'

export interface IssuedCode { username: string; name?: string; code: string }

/** Códigos que se muestran una sola vez. Se pueden copiar en bloque para enviarlos. */
export function CodeBox({ title, codes, note, onClose }: { title: string; codes: IssuedCode[]; note: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = codes.map(c => `${c.name ? `${c.name} · ` : ''}${c.username}: ${c.code}`).join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="card codebox" aria-live="polite">
      <header className="codebox__head">
        <h3>{title}</h3>
        <div className="codebox__actions">
          <button className="btn btn--ghost" onClick={() => void copy()}>{copied ? 'Copiado' : 'Copiar todo'}</button>
          <button className="btn btn--ghost" onClick={onClose}>Cerrar</button>
        </div>
      </header>
      <p className="muted">{note}</p>
      <ul className="codebox__list">
        {codes.map(c => (
          <li key={c.username}>
            <span>{c.name ? `${c.name} ` : ''}<strong>@{c.username}</strong></span>
            <code>{c.code}</code>
          </li>
        ))}
      </ul>
    </section>
  )
}
