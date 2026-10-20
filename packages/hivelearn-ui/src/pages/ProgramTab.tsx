import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Field, Notice, Spinner } from '../components/ui'
import { GameShell, canPlayGame } from '../game/GameShell'
import type { NodeMaterialView, ProgramIntentInput, ProgramLevelView, ProgramNodeView, ProgramState } from '../types'

const MINUTES = [15, 30, 45, 60]

export function ProgramTab() {
  const [program, setProgram] = useState<ProgramState | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.activeProgram().then(p => { if (alive) setProgram(p) }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo cargar tu programa') })
    return () => { alive = false }
  }, [])

  if (error) return <Notice kind="error">{error}</Notice>
  if (program === undefined) return <Spinner label="Cargando tu programa…" />
  if (program === null) return <IntentForm onOpened={setProgram} />
  return <ProgramView program={program} onChange={setProgram} onClosed={() => setProgram(null)} />
}

const MODE_KEY = 'hivelearn.programMode'

/** Juego 3D por defecto cuando el navegador lo permite; la vista clásica queda como alternativa accesible. */
function ProgramView({ program, onChange, onClosed }: { program: ProgramState; onChange: (p: ProgramState) => void; onClosed: () => void }) {
  const playable = canPlayGame()
  const [mode, setMode] = useState<'game' | 'classic'>(() => {
    try { const saved = localStorage.getItem(MODE_KEY); if (saved === 'classic' || saved === 'game') return saved } catch { /* sin almacenamiento */ }
    return 'game'
  })
  const choose = (next: 'game' | 'classic') => {
    setMode(next)
    try { localStorage.setItem(MODE_KEY, next) } catch { /* sin almacenamiento */ }
  }
  const useGame = playable && mode === 'game'
  return (
    <>
      {playable && (
        <div className="view-switch" role="group" aria-label="Cómo ver tu programa">
          <button className={`btn btn--ghost btn--sm ${useGame ? 'is-on' : ''}`} aria-pressed={useGame} onClick={() => choose('game')}>Modo juego</button>
          <button className={`btn btn--ghost btn--sm ${!useGame ? 'is-on' : ''}`} aria-pressed={!useGame} onClick={() => choose('classic')}>Vista clásica</button>
        </div>
      )}
      {useGame
        ? <GameShell program={program} onChange={onChange} onClosed={onClosed} />
        : <ActiveProgram program={program} onChange={onChange} onClosed={onClosed} />}
    </>
  )
}

function IntentForm({ onOpened }: { onOpened: (program: ProgramState) => void }) {
  const [form, setForm] = useState<ProgramIntentInput>({ topic: '', goal: '', minutes: 30, energy: 'media', priorKnowledge: 'ninguno', style: 'balanceado' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof ProgramIntentInput>(key: K, value: ProgramIntentInput[K]) => setForm(f => ({ ...f, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try { onOpened(await api.openProgram({ ...form, topic: form.topic.trim(), goal: form.goal.trim() })) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear tu programa') }
    finally { setBusy(false) }
  }

  return (
    <section>
      <h1 className="console__title">¿Qué quieres aprender hoy?</h1>
      <p className="panel__lead">Cuéntanos qué buscas y cuánto tiempo tienes. Con eso armamos un programa solo para ti; se ajusta según cómo te vaya y no podrás abrir otro hasta cerrar este.</p>
      <form className="card form program-intent" onSubmit={submit}>
        <Field label="Tema"><input value={form.topic} onChange={e => set('topic', e.target.value)} placeholder="Por ejemplo: tablas dinámicas en Excel" minLength={2} maxLength={120} required /></Field>
        <Field label="¿Para qué lo quieres?"><input value={form.goal} onChange={e => set('goal', e.target.value)} placeholder="Por ejemplo: armar el reporte semanal de ventas" minLength={2} maxLength={200} required /></Field>
        <div className="form__row">
          <Field label="Tiempo que tienes hoy">
            <select value={form.minutes} onChange={e => set('minutes', Number(e.target.value))}>
              {MINUTES.map(m => <option key={m} value={m}>{m} minutos</option>)}
            </select>
          </Field>
          <Field label="Tu energía hoy">
            <select value={form.energy} onChange={e => set('energy', e.target.value as ProgramIntentInput['energy'])}>
              <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
            </select>
          </Field>
        </div>
        <div className="form__row">
          <Field label="¿Qué tanto sabes ya?">
            <select value={form.priorKnowledge} onChange={e => set('priorKnowledge', e.target.value as ProgramIntentInput['priorKnowledge'])}>
              <option value="ninguno">Nada, empiezo de cero</option><option value="algo">Algo</option><option value="bastante">Bastante</option>
            </select>
          </Field>
          <Field label="Cómo prefieres aprender">
            <select value={form.style} onChange={e => set('style', e.target.value as ProgramIntentInput['style'])}>
              <option value="balanceado">Un poco de todo</option><option value="visual">Visual</option><option value="lectura">Leyendo</option><option value="retos">Con retos</option>
            </select>
          </Field>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {busy && <Spinner label="Diseñando tu programa… puede tardar unos segundos" />}
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Creando…' : 'Crear mi programa'}</button>
      </form>
    </section>
  )
}

function ActiveProgram({ program, onChange, onClosed }: { program: ProgramState; onChange: (p: ProgramState) => void; onClosed: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null)
  const level = program.levels[program.currentLevel]
  const closed = program.status === 'closed'

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try { await task() } catch (e) { setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo completar la operación' }) } finally { setBusy(false) }
  }, [])

  const checkpoint = () => run(async () => {
    const result = await api.checkpointProgram(program.id)
    onChange(result.program)
    const text = result.decision === 'hold' ? `Vamos a reforzar antes de seguir. ${result.reason}`
      : result.decision === 'teacher_review' ? `Pasas al siguiente nivel; tu docente revisará este avance. ${result.reason}`
      : `¡Nivel superado! ${result.reason}`
    setMessage({ kind: result.decision === 'hold' ? 'info' : 'success', text })
  })

  const prepare = () => run(async () => { onChange(await api.prepareLevel(program.id)) })

  const closeProgram = () => run(async () => {
    if (!window.confirm('¿Cerrar esta sesión de estudio? Podrás crear otro programa después.')) return
    await api.closeProgram(program.id)
    onClosed()
  })

  if (closed) {
    return (
      <section>
        <h1 className="console__title">Programa terminado</h1>
        <Notice kind="success">
          {program.closeReason === 'completed'
            ? `Completaste "${program.intent.topic}" con ${program.finalScore ?? 0} puntos. ${program.validation === 'validated' ? 'Tu docente ya lo validó.' : 'Queda pendiente de la validación de tu docente.'}`
            : 'Sesión cerrada.'}
        </Notice>
        <button className="btn btn--primary" onClick={onClosed}>Crear un programa nuevo</button>
      </section>
    )
  }

  const allAttempted = level && level.nodes.length > 0 && program.levelProgress.attempted === program.levelProgress.total

  return (
    <section>
      <h1 className="console__title">{program.intent.topic}</h1>
      <p className="panel__lead"><strong>Objetivo:</strong> {program.objective}</p>

      <ol className="level-track" aria-label="Niveles del programa">
        {program.levels.map(l => <LevelChip key={l.index} level={l} current={l.index === program.currentLevel} />)}
      </ol>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {level && level.nodes.length === 0 && (
        <div className="card">
          <h3>{level.title}</h3>
          <p className="muted">Estamos preparando este nivel a partir de cómo te fue.</p>
          <button className="btn btn--primary" disabled={busy} onClick={() => void prepare()}>{busy ? 'Preparando…' : 'Preparar nivel'}</button>
        </div>
      )}

      {level && level.nodes.length > 0 && (
        <>
          <h2 className="panel__title">Nivel {level.index + 1}: {level.title}</h2>
          <p className="panel__lead">{level.goal}</p>
          <ul className="node-list">
            {level.nodes.map(node => (
              <NodeCard key={node.id} programId={program.id} node={node} progress={program.progress[node.id]} disabled={busy}
                onAnswered={updated => onChange(updated)} />
            ))}
          </ul>
          <div className="actions actions--split">
            <button className="btn btn--ghost" disabled={busy} onClick={() => void closeProgram()}>Cerrar sesión</button>
            <button className="btn btn--primary" disabled={busy || !allAttempted} onClick={() => void checkpoint()}>
              {allAttempted ? (level.kind === 'final' ? 'Terminar el programa' : 'Cerrar este nivel') : `Responde los ${program.levelProgress.total} nodos (${program.levelProgress.attempted}/${program.levelProgress.total})`}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function LevelChip({ level, current }: { level: ProgramLevelView; current: boolean }) {
  const state = level.status === 'closed' ? 'done' : current ? 'now' : 'next'
  return (
    <li className={`level-chip level-chip--${state}`} aria-current={current ? 'step' : undefined}>
      <span className="level-chip__num">{state === 'done' ? '✓' : level.index + 1}</span>
      <span>
        <strong>{level.title}</strong>
        <small>{level.kind === 'final' ? 'Evaluación final' : level.kind === 'reinforcement' ? 'Refuerzo' : `${level.nodes.length || level.plannedNodes} nodos`}</small>
      </span>
    </li>
  )
}

function NodeCard({ programId, node, progress, disabled, onAnswered }: {
  programId: string; node: ProgramNodeView; progress?: ProgramState['progress'][string]; disabled: boolean
  onAnswered: (program: ProgramState) => void
}) {
  const [material, setMaterial] = useState<NodeMaterialView | null>(null)
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<number | null>(null)
  const [openText, setOpenText] = useState('')
  const [result, setResult] = useState<{ correct: boolean; hint: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && !material) {
      try { setMaterial(await api.programMaterial(programId, node.id)) } catch { /* se usa lo que ya hay */ }
    }
  }

  const submit = async () => {
    if (choice === null) return
    setBusy(true)
    setError(null)
    try {
      const answer = await api.answerNode(programId, { nodeId: node.id, choice, open: openText.trim() || undefined })
      setResult({ correct: answer.correct, hint: answer.hint })
      onAnswered(answer.program)
      if (answer.correct) setChoice(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar') }
    finally { setBusy(false) }
  }

  const mastered = progress?.mastered
  return (
    <li className={`card node ${mastered ? 'node--done' : ''}`}>
      <header className="node__head">
        <div>
          <h3>{node.title}</h3>
          <p className="muted">{node.objective}</p>
        </div>
        <span className={`chip ${mastered ? 'chip--ok' : progress?.attempts ? 'chip--warn' : ''}`}>
          {mastered ? 'Logrado' : progress?.attempts ? `${progress.attempts} intento(s)` : 'Pendiente'}
        </span>
      </header>
      <button className="link link--left" onClick={() => void toggle()} aria-expanded={open}>{open ? 'Ocultar explicación' : 'Ver explicación'}</button>
      {open && <p className="node__explain">{material?.explanation ?? 'Preparando la explicación…'}</p>}

      <fieldset className="node__question" disabled={busy || disabled || mastered}>
        <legend>{node.question.prompt}</legend>
        {node.question.options.map((option, i) => (
          <label key={i} className="choice">
            <input type="radio" name={`q-${node.id}`} checked={choice === i} onChange={() => setChoice(i)} />
            <span>{option}</span>
          </label>
        ))}
        <Field label="Cuéntalo con tus palabras (opcional)" hint={node.evidence}>
          <textarea value={openText} onChange={e => setOpenText(e.target.value)} rows={2} maxLength={600} />
        </Field>
      </fieldset>
      {error && <Notice kind="error">{error}</Notice>}
      {result && <Notice kind={result.correct ? 'success' : 'info'}>{result.correct ? '¡Correcto!' : result.hint ?? 'Todavía no. Revisa la explicación e inténtalo de nuevo.'}</Notice>}
      {!mastered && <button className="btn btn--ghost" disabled={busy || disabled || choice === null} onClick={() => void submit()}>{busy ? 'Comprobando…' : 'Comprobar'}</button>}
    </li>
  )
}
