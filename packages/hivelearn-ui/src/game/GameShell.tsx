import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { Notice } from '../components/ui'
import type { NodeMaterialView, ProgramState } from '../types'
import { buildWorld, diffWorlds, honeyOf, type WorldCell, type WorldDescription } from './layout'
import type { HiveWorld } from './HiveWorld'
import { QUALITY_KEY, initialTier } from './quality'
import { GameAudio } from './audio'
import { joystickAxis } from './controller'
import { speak, speechSupported, stopSpeaking } from './speech'

/** ¿Este navegador puede dibujar el juego? (WebGL2 disponible y sin pedir movimiento reducido no es requisito: se adapta). */
export function canPlayGame(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch { return false }
}

/** Solo con `localStorage['hivelearn.e2e'] = '1'`: deja a las pruebas de navegador leer el mundo y elegir una celda. */
function exposeForE2E(scene: HiveWorld, world: () => WorldDescription | null, select: (id: string) => void) {
  try {
    if (localStorage.getItem('hivelearn.e2e') !== '1') return
    ;(window as unknown as { __hive: unknown }).__hive = {
      cells: () => (world()?.cells ?? []).filter(c => c.real).map(c => ({ id: c.id, kind: c.kind, level: c.level, visual: c.visual })),
      select,
      screenPosition: (id: string) => scene.screenPosition(id),
      dronePosition: () => scene.dronePosition(),
      focused: () => scene.focusedCell(),
      backend: scene.backend,
      tier: () => scene.tier,
    }
  } catch { /* sin almacenamiento: no hay gancho */ }
}

const VISUAL_LABEL: Record<string, string> = {
  locked: 'Bloqueada', available: 'Pendiente', tried: 'Para reforzar', mastered: 'Lograda',
  ready: 'Lista para abrir', passed: 'Superada', hold: 'A reforzar', review: 'En revisión del docente',
}

export function GameShell({ program, onChange, onClosed }: { program: ProgramState; onChange: (p: ProgramState) => void; onClosed: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<HiveWorld | null>(null)
  const previousWorld = useRef<WorldDescription | null>(null)
  /** Resultado del checkpoint a la espera de que el mundo se actualice: se une al aviso de adaptación en vez de perderse. */
  const checkpointNote = useRef<{ kind: 'success' | 'info'; text: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [overview, setOverview] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const audio = useMemo(() => new GameAudio(), [])
  const [muted, setMuted] = useState(audio.muted)
  const [announce, setAnnounce] = useState('')
  const [lowered, setLowered] = useState<string | null>(null)
  const showJoystick = useMemo(() => {
    try { return localStorage.getItem('hivelearn.joystick') === '1' || (window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) } catch { return false }
  }, [])

  const world = useMemo(() => buildWorld(program), [program])
  const level = program.levels[program.currentLevel]
  const cell = selected ? world.cells.find(c => c.id === selected) ?? null : null
  const honey = honeyOf(program)

  // Crear la escena una sola vez; el mundo se actualiza aparte.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let observer: ResizeObserver | null = null
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tier = initialTier({ stored: (() => { try { return localStorage.getItem(QUALITY_KEY) } catch { return null } })(), coarsePointer: window.matchMedia('(pointer: coarse)').matches, cores: navigator.hardwareConcurrency ?? 4 })
    import('./HiveWorld').then(({ HiveWorld }) => HiveWorld.create(canvas, { reducedMotion, tier })).then(scene => {
      if (cancelled) { scene.dispose(); return }
      worldRef.current = scene
      scene.setHandlers({
        pick: id => { setSelected(id); if (id) audio.sfx('select') },
        focus: id => {
          const cell = id ? previousWorld.current?.cells.find(c => c.id === id) : null
          setAnnounce(cell ? `Celda ${cell.kind === 'gate' ? 'compuerta' : cell.title}: ${VISUAL_LABEL[cell.visual]}. Pulsa E para abrirla.` : '')
          if (cell) audio.sfx('focus')
        },
        thrust: speed => audio.setThrust(speed),
        quality: tier => setLowered(tier),
      })
      const fit = () => scene.resize(canvas.clientWidth, canvas.clientHeight)
      observer = new ResizeObserver(fit)
      observer.observe(canvas)
      fit()
      scene.setWorld(previousWorld.current ?? world)
      scene.start()
      exposeForE2E(scene, () => previousWorld.current, id => setSelected(id))
    }).catch(() => setFailed(true))
    return () => {
      cancelled = true
      observer?.disconnect()
      worldRef.current?.dispose()
      worldRef.current = null
      audio.dispose()
      stopSpeaking()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cada estado nuevo: aplicar, y anunciar lo que el plan cambió.
  useEffect(() => {
    const diff = diffWorlds(previousWorld.current, world)
    previousWorld.current = world
    worldRef.current?.setWorld(world)
    const note = checkpointNote.current
    checkpointNote.current = null
    let adapted: string | null = null
    if (diff.newLevels.length > 0) {
      const added = world.islands.filter(i => diff.newLevels.includes(i.index))
      adapted = `Tu programa se adaptó: ${added.map(i => (i.kind === 'reinforcement' ? `nuevo refuerzo "${i.title}"` : `nuevo nivel "${i.title}"`)).join(', ')}.`
    } else if (diff.added.length > 0) {
      adapted = `Tu programa se adaptó: ${diff.added.length === 1 ? 'se añadió una celda nueva' : `se añadieron ${diff.added.length} celdas nuevas`}.`
    }
    if (note || adapted) setMessage({ kind: note?.kind ?? 'info', text: [note?.text, adapted].filter(Boolean).join(' ') })
  }, [world])

  useEffect(() => { worldRef.current?.select(selected) }, [selected])
  useEffect(() => { worldRef.current?.setOverview(overview) }, [overview])

  // Al abrir, apuntar al primer nodo pendiente del nivel activo.
  useEffect(() => {
    if (selected) return
    const first = world.cells.find(c => c.level === program.currentLevel && c.kind === 'node' && c.real && c.visual !== 'mastered')
    if (first) setSelected(first.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, program.currentLevel])

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try { await task() } catch (e) { setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo completar la operación' }) } finally { setBusy(false) }
  }, [])

  const react = useCallback((id: string, kind: 'ok' | 'bad') => { audio.sfx(kind); worldRef.current?.react(id, kind) }, [audio])

  if (failed) return <Notice kind="info">No se pudo iniciar el modo juego en este navegador. Usa la vista clásica.</Notice>

  const closed = program.status === 'closed'
  const levelCells = world.cells.filter(c => c.level === program.currentLevel && c.real)
  const allAttempted = Boolean(level && level.nodes.length > 0 && program.levelProgress.attempted === program.levelProgress.total)

  const openGate = () => run(async () => {
    const result = await api.checkpointProgram(program.id)
    react(`gate:${program.currentLevel}`, result.decision === 'hold' ? 'bad' : 'ok')
    audio.sfx(result.decision === 'hold' ? 'gate' : 'level')
    const note = {
      kind: result.decision === 'hold' ? 'info' as const : 'success' as const,
      text: result.decision === 'hold' ? `Vamos a reforzar antes de seguir. ${result.reason}`
        : result.decision === 'teacher_review' ? `Pasas al siguiente nivel; tu docente revisará este avance. ${result.reason}`
        : `¡Nivel superado! ${result.reason}`,
    }
    // El mundo nuevo llega con onChange; su efecto une este aviso con el de adaptación. Se deja también visible por si
    // el plan no cambió y ese efecto no tiene nada que añadir.
    checkpointNote.current = note
    setSelected(null)
    setMessage(note)
    onChange(result.program)
  })

  const prepare = () => run(async () => { onChange(await api.prepareLevel(program.id)) })
  const closeProgram = () => run(async () => {
    if (!window.confirm('¿Cerrar esta sesión de estudio? Podrás crear otro programa después.')) return
    await api.closeProgram(program.id)
    onClosed()
  })

  if (closed) {
    return (
      <section className="game">
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

  return (
    <section className="game">
      <header className="game__bar">
        <div>
          <h1 className="console__title">{program.intent.topic}</h1>
          <p className="muted"><strong>Objetivo:</strong> {program.objective}</p>
        </div>
        <ul className="game__stats" aria-label="Tu avance">
          <li><span aria-hidden="true">🍯</span> {honey} <small>miel</small></li>
          <li>Nivel {program.currentLevel + 1}/{program.levels.length}</li>
          <li>{program.levelProgress.mastered}/{program.levelProgress.total} logradas</li>
        </ul>
      </header>

      <div className="game__stage">
        <canvas ref={canvasRef} className="game__canvas" data-testid="game-canvas" data-world-cells={world.cells.filter(c => c.real).length} tabIndex={0}
          aria-label="Mapa de tu programa: estación con islas de celdas hexagonales y un dron que puedes mover" aria-describedby="game-help" />
        {showJoystick && <Joystick onAxis={axis => worldRef.current?.setAxis(axis)} />}
        <div className="game__tools">
          <button className="btn btn--ghost btn--sm" onClick={() => setOverview(o => !o)} aria-pressed={overview}>{overview ? 'Seguir mi isla' : 'Vista general'}</button>
          <button className="btn btn--ghost btn--sm" aria-pressed={!muted} onClick={() => { const next = !muted; audio.setMuted(next); setMuted(next); if (!next) audio.sfx('select') }}>
            {muted ? '🔇 Activar sonido' : '🔊 Silenciar'}
          </button>
        </div>
      </div>

      <p id="game-help" className="muted game__help">
        Haz clic en el mapa y mueve el dron con <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> o las flechas. <kbd>E</kbd>, Enter o Espacio abren la celda enfocada; <kbd>[</kbd> y <kbd>]</kbd> cambian de celda; Esc cierra. Los botones de abajo hacen lo mismo.
      </p>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {lowered && <Notice kind="info">Para que vaya fluido se bajó la calidad gráfica ({lowered === 'low' ? 'baja' : 'media'}).</Notice>}

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <nav className="game__cells" aria-label={`Celdas del nivel ${program.currentLevel + 1}`}>
        {levelCells.map(c => (
          <button key={c.id} className={`cell-chip cell-chip--${c.visual} ${c.id === selected ? 'cell-chip--on' : ''}`}
            onClick={() => setSelected(c.id)} aria-pressed={c.id === selected}>
            <span className="cell-chip__dot" aria-hidden="true" />
            {c.kind === 'gate' ? (c.levelKind === 'final' ? '👑 La Reina' : '🚪 Compuerta') : c.title}
            <small>{VISUAL_LABEL[c.visual]}</small>
          </button>
        ))}
      </nav>

      {level && level.nodes.length === 0 && (
        <div className="card">
          <h3>{level.title}</h3>
          <p className="muted">Estamos preparando este nivel a partir de cómo te fue.</p>
          <button className="btn btn--primary" disabled={busy} onClick={() => void prepare()}>{busy ? 'Preparando…' : 'Preparar nivel'}</button>
        </div>
      )}

      {level && level.nodes.length > 0 && cell && cell.kind === 'node' && (
        <CellPanel key={cell.id} programId={program.id} cell={cell} program={program} disabled={busy}
          onAnswered={(next, ok) => { react(cell.id, ok ? 'ok' : 'bad'); onChange(next) }} />
      )}

      {level && level.nodes.length > 0 && cell && cell.kind === 'gate' && (
        <div className="card gate-panel">
          <h3>{cell.levelKind === 'final' ? '👑 La Reina' : '🚪 Compuerta del nivel'}</h3>
          <p className="muted">{allAttempted
            ? 'Ya probaste todas las celdas. Abre la compuerta y vemos cómo te fue.'
            : `Responde las celdas del nivel para abrirla (${program.levelProgress.attempted}/${program.levelProgress.total}).`}</p>
          <button className="btn btn--primary" disabled={busy || !allAttempted} onClick={() => void openGate()}>
            {busy ? 'Revisando…' : level.kind === 'final' ? 'Terminar el programa' : 'Abrir la compuerta'}
          </button>
        </div>
      )}

      <div className="actions">
        <button className="btn btn--ghost" disabled={busy} onClick={() => void closeProgram()}>Cerrar sesión</button>
      </div>
    </section>
  )
}

/** Palanca virtual para pantallas táctiles: arrastra el pulgar y el dron avanza hacia allá. */
function Joystick({ onAxis }: { onAxis: (axis: { x: number; z: number }) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const origin = useRef<{ x: number; y: number } | null>(null)
  const RADIUS = 48
  const move = (event: React.PointerEvent) => {
    if (!origin.current) return
    let dx = event.clientX - origin.current.x
    let dy = event.clientY - origin.current.y
    const length = Math.hypot(dx, dy)
    if (length > RADIUS) { dx = (dx / length) * RADIUS; dy = (dy / length) * RADIUS }
    setKnob({ x: dx, y: dy })
    onAxis(joystickAxis(dx, dy, RADIUS))
  }
  const release = () => { origin.current = null; setKnob({ x: 0, y: 0 }); onAxis({ x: 0, z: 0 }) }
  return (
    <div className="joystick" data-testid="joystick" role="group" aria-label="Palanca para mover el dron"
      onPointerDown={e => { try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* puntero sintético */ } const r = e.currentTarget.getBoundingClientRect(); origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; move(e) }}
      onPointerMove={move} onPointerUp={release} onPointerCancel={release}>
      <div className="joystick__knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

function CellPanel({ programId, cell, program, disabled, onAnswered }: {
  programId: string; cell: WorldCell; program: ProgramState; disabled: boolean
  onAnswered: (program: ProgramState, correct: boolean) => void
}) {
  const node = program.levels.flatMap(l => l.nodes).find(n => n.id === cell.id)
  const progress = program.progress[cell.id]
  const [material, setMaterial] = useState<NodeMaterialView | null>(null)
  const [choice, setChoice] = useState<number | null>(null)
  const [openText, setOpenText] = useState('')
  const [result, setResult] = useState<{ correct: boolean; hint: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => () => stopSpeaking(), [])
  useEffect(() => {
    let alive = true
    api.programMaterial(programId, cell.id).then(m => { if (alive) setMaterial(m) }).catch(() => { /* se usa lo que ya hay */ })
    return () => { alive = false }
  }, [programId, cell.id])

  if (!node) return null
  const mastered = progress?.mastered

  const submit = async () => {
    if (choice === null) return
    setBusy(true)
    setError(null)
    try {
      const answer = await api.answerNode(programId, { nodeId: node.id, choice, open: openText.trim() || undefined })
      setResult({ correct: answer.correct, hint: answer.hint })
      onAnswered(answer.program, answer.correct)
      if (answer.correct) setChoice(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar') } finally { setBusy(false) }
  }

  return (
    <article className={`card node ${mastered ? 'node--done' : ''}`} aria-live="polite">
      <header className="node__head">
        <div>
          <h3>{node.title}</h3>
          <p className="muted">{node.objective}</p>
        </div>
        <span className={`chip ${mastered ? 'chip--ok' : progress?.attempts ? 'chip--warn' : ''}`}>
          {mastered ? 'Lograda' : progress?.attempts ? `${progress.attempts} intento(s)` : 'Pendiente'}
        </span>
      </header>
      <p className="node__explain">{material?.explanation ?? 'Preparando la explicación…'}</p>
      {speechSupported() && material && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { if (speaking) { stopSpeaking(); setSpeaking(false) } else setSpeaking(speak(`${material.explanation ?? ''} ${node.question.prompt}`, () => setSpeaking(false))) }}>
          {speaking ? '⏹ Detener' : '🔊 Escuchar'}
        </button>
      )}

      <fieldset className="node__question" disabled={busy || disabled || mastered}>
        <legend>{node.question.prompt}</legend>
        <div className="pads">
          {node.question.options.map((option, i) => (
            <button key={i} type="button" className={`pad ${choice === i ? 'pad--on' : ''}`} onClick={() => setChoice(i)} aria-pressed={choice === i}>
              <span className="pad__key">{String.fromCharCode(65 + i)}</span>{option}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field__label">Cuéntalo con tus palabras (opcional)</span>
          <textarea value={openText} onChange={e => setOpenText(e.target.value)} rows={2} maxLength={600} />
          <span className="field__hint">{node.evidence}</span>
        </label>
      </fieldset>
      {error && <Notice kind="error">{error}</Notice>}
      {result && <Notice kind={result.correct ? 'success' : 'info'}>{result.correct ? '¡Correcto! La celda se llenó de miel.' : result.hint ?? 'Todavía no. Revisa la explicación e inténtalo de nuevo.'}</Notice>}
      {!mastered && <button className="btn btn--primary" disabled={busy || disabled || choice === null} onClick={() => void submit()}>{busy ? 'Comprobando…' : 'Comprobar'}</button>}
    </article>
  )
}
