import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Field, Notice, Spinner } from '../components/ui'
import type { ReviewQueueItem, TeacherProgram, TraceEntry } from '../types'

type Weak = Awaited<ReturnType<typeof api.programAnalytics>>

export function ReviewsTab() {
  const [queue, setQueue] = useState<ReviewQueueItem[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => setQueue(await api.reviewQueue()), [])
  useEffect(() => { load().catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar la cola')) }, [load])

  const [weak, setWeak] = useState<Weak>([])
  useEffect(() => { api.programAnalytics().then(setWeak).catch(() => undefined) }, [])

  if (error) return <Notice kind="error">{error}</Notice>
  if (!queue) return <Spinner label="Cargando validaciones…" />

  return (
    <section>
      <h1 className="console__title">Validaciones</h1>
      {weak.length > 0 && (
        <div className="card weak">
          <h3>Lo que más cuesta</h3>
          <p className="muted">Nodos con menos aciertos al primer intento entre tus alumnos.</p>
          <ul>
            {weak.slice(0, 5).map(w => (
              <li key={`${w.topic}|${w.title}`}>
                <strong>{w.title}</strong> <span className="muted">· {w.topic} · {w.students} alumno(s)</span>
                <span className={`chip ${w.firstTryRate < 0.5 ? 'chip--warn' : 'chip--ok'}`}>{Math.round(w.firstTryRate * 100)}% al primer intento</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="panel__lead">Programas completados por tus alumnos. Reafirma la evaluación, corrígela o revoca un nodo que no consideres logrado.</p>
      {queue.length === 0 && <Notice kind="info">No hay programas pendientes de validar.</Notice>}
      <ul className="account-list">
        {queue.map(item => (
          <li key={item.id} className="card account">
            <div>
              <strong>{item.student}</strong> <span className="muted">· {item.topic}</span>
              <div className="account__meta"><span className="chip">{item.levels} niveles</span><span className="chip chip--ok">Nota {item.finalScore ?? '—'}</span></div>
            </div>
            <button className="btn btn--primary" onClick={() => setSelected(selected === item.id ? null : item.id)}>{selected === item.id ? 'Cerrar' : 'Revisar'}</button>
            {selected === item.id && <ReviewPanel programId={item.id} onDone={() => { setSelected(null); void load() }} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReviewPanel({ programId, onDone }: { programId: string; onDone: () => void }) {
  const [program, setProgram] = useState<TeacherProgram | null>(null)
  const [trace, setTrace] = useState<TraceEntry[]>([])
  const [decision, setDecision] = useState<'reaffirm' | 'modify' | 'revoke'>('reaffirm')
  const [score, setScore] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.teacherProgram(programId).then(setProgram).catch(e => setError(e.message))
    api.programTrace(programId).then(setTrace).catch(() => undefined)
  }, [programId])

  if (error && !program) return <div className="review__panel"><Notice kind="error">{error}</Notice></div>
  if (!program) return <div className="review__panel"><Spinner label="Cargando programa…" /></div>

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.reviewProgram(programId, {
        decision, note: note.trim(),
        ...(decision === 'modify' ? { correctedScore: Number(score) } : {}),
        ...(decision === 'revoke' ? { nodeId } : {}),
      })
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la decisión') }
    finally { setBusy(false) }
  }

  const masteredNodes = program.levels.flatMap(l => l.nodes).filter(n => program.progress[n.id]?.mastered)
  return (
    <div className="review__panel">
      <p><strong>Objetivo:</strong> {program.objective}</p>
      {program.levels.map(level => (
        <div key={level.index} className="review__level">
          <h4>Nivel {level.index + 1}: {level.title} <span className="chip">{level.kind}</span></h4>
          {level.checkpoint && <p className="muted">Checkpoint: {level.checkpoint.decision} — {level.checkpoint.reason}</p>}
          <ul>
            {level.nodes.map(n => {
              const p = program.progress[n.id]
              return <li key={n.id}>{n.title}: {p?.mastered ? 'logrado' : 'no logrado'} · {p?.attempts ?? 0} intento(s){p?.firstTry ? ' · al primer intento' : ''}{p?.open ? ` · práctica abierta (${p.open.verdict ?? 'sin juicio'}): “${p.open.text.slice(0, 120)}”` : ''}</li>
            })}
          </ul>
        </div>
      ))}
      {program.revisions.length > 0 && (
        <details>
          <summary>Cómo cambió el plan ({program.revisions.length})</summary>
          <ul>{program.revisions.map((r, i) => <li key={i}><strong>{r.actor}</strong>: {r.reason} — {r.ops.map(o => o.detail).join(' · ')}</li>)}</ul>
        </details>
      )}
      {trace.length > 0 && (
        <details>
          <summary>Bitácora ({trace.length} eventos)</summary>
          <ol>{trace.map(e => <li key={e.seq}><code>{e.type}</code> {new Date(e.at).toLocaleString()}</li>)}</ol>
        </details>
      )}

      <div className="form review__form">
        <Field label="Decisión">
          <select value={decision} onChange={e => setDecision(e.target.value as typeof decision)}>
            <option value="reaffirm">Reafirmar la evaluación</option>
            <option value="modify">Modificar el puntaje</option>
            <option value="revoke">Revocar un nodo</option>
          </select>
        </Field>
        {decision === 'modify' && <Field label="Puntaje corregido (0–100)"><input type="number" min={0} max={100} value={score} onChange={e => setScore(e.target.value)} /></Field>}
        {decision === 'revoke' && (
          <Field label="Nodo a revocar">
            <select value={nodeId} onChange={e => setNodeId(e.target.value)}>
              <option value="">Elige un nodo</option>
              {masteredNodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          </Field>
        )}
        <Field label="Nota (mín. 10 caracteres)"><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></Field>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn btn--primary" disabled={busy || note.trim().length < 10 || (decision === 'modify' && score === '') || (decision === 'revoke' && !nodeId)} onClick={() => void submit()}>
          {busy ? 'Guardando…' : 'Guardar decisión'}
        </button>
      </div>
    </div>
  )
}
