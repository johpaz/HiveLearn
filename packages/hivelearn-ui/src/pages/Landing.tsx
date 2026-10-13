import { HexLogo } from '../components/ui'
import { HiveCanvas } from '../components/HiveCanvas'
import type { Account } from '../types'

const FEATURES = [
  {
    title: 'Cualquier tema',
    text: 'Pide lo que quieras aprender. Un arquitecto curricular arma el mapa de competencias y un investigador lo respalda con fuentes verificables.',
  },
  {
    title: 'Un enjambre que enseña',
    text: 'Especialistas distintos explican, practican y evalúan cada concepto. Un coordinador reparte el trabajo y adapta el ritmo a tu energía y tu tiempo.',
  },
  {
    title: 'Evaluación justa',
    text: 'La clave de respuesta manda. La IA solo juzga respuestas abiertas y, cuando hay duda, un docente revisa. Lo no revisado no acredita.',
  },
  {
    title: 'Pensado para cada edad',
    text: 'Niñez, adolescencia y adultez tienen reglas distintas: qué modelos se pueden usar, qué se investiga y cómo se te habla.',
  },
]

const STEPS = [
  ['Cuéntanos qué quieres aprender', 'Tema, objetivo, tiempo y cómo te gusta aprender.'],
  ['Se construye tu mapa', 'Competencias con prerrequisitos, no una lista de temas sueltos.'],
  ['Practica con feedback', 'Explicaciones, ejercicios y retos con pistas que se ajustan a ti.'],
  ['Acredita con evidencia', 'Dominio demostrado en varias sesiones, no un solo acierto.'],
]

export function Landing({ account, institution }: { account: Account | null; institution: string }) {
  return (
    <div className="landing">
      <HiveCanvas />
      <div className="landing__veil" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#/" aria-label="HiveLearn, inicio">
          <HexLogo /> <span>HiveLearn</span>
        </a>
        <nav className="topbar__nav" aria-label="Principal">
          <a href="#como-funciona" onClick={scrollTo('como-funciona')}>Cómo funciona</a>
          <a href="#para-quien" onClick={scrollTo('para-quien')}>Qué ofrece</a>
          {account
            ? <a className="btn btn--primary" href="#/panel">Ir a mi panel</a>
            : <a className="btn btn--ghost" href="#/acceso">Acceder</a>}
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">{institution === 'HiveLearn' ? 'Aprendizaje adaptativo con IA' : institution}</p>
          <h1>
            Aprende lo que quieras.<br />
            <span className="hero__accent">Un enjambre de IA</span> que se adapta a ti.
          </h1>
          <p className="hero__lead">
            HiveLearn convierte cualquier tema en un recorrido personal: mapa de competencias, práctica guiada y
            evaluación con evidencia. Con docentes en el circuito y reglas claras por edad.
          </p>
          <div className="hero__actions">
            <a className="btn btn--primary btn--lg" href={account ? '#/panel' : '#/acceso'}>{account ? 'Continuar' : 'Empezar'}</a>
            <a className="btn btn--ghost btn--lg" href="#como-funciona" onClick={scrollTo('como-funciona')}>Ver cómo funciona</a>
          </div>
          <p className="hero__hint">Mueve el cursor sobre el panal: cada celda es una competencia.</p>
        </section>

        <section id="como-funciona" className="section">
          <h2>Cómo funciona</h2>
          <ol className="steps">
            {STEPS.map(([title, text], index) => (
              <li key={title} className="step">
                <span className="step__num" aria-hidden="true">{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="para-quien" className="section">
          <h2>Qué ofrece</h2>
          <div className="features">
            {FEATURES.map(feature => (
              <article key={feature.title} className="card">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section section--cta">
          <h2>Tu primera sesión empieza en un minuto</h2>
          <a className="btn btn--primary btn--lg" href={account ? '#/panel' : '#/acceso'}>{account ? 'Ir a mi panel' : 'Crear mi acceso'}</a>
        </section>
      </main>

      <footer className="footer">
        <span>HiveLearn · aprendizaje adaptativo con supervisión docente</span>
      </footer>
    </div>
  )
}

function scrollTo(id: string) {
  return (event: React.MouseEvent) => {
    event.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
}
