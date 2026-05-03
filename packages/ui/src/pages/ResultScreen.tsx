import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLessonStore } from '../store/lessonStore'
import { useGamification } from '../hooks/useGamification'
import { RatingModal } from './RatingModal'

function getCalificacion(puntaje: number): { emoji: string; texto: string; color: string } {
  if (puntaje >= 90) return { emoji: '🏆', texto: '¡Excelente!', color: 'text-hive-amber' }
  if (puntaje >= 70) return { emoji: '⭐', texto: '¡Muy bien!', color: 'text-hive-amber/80' }
  if (puntaje >= 50) return { emoji: '👍', texto: 'Bien hecho', color: 'text-hive-purple' }
  return { emoji: '💪', texto: '¡Sigue practicando!', color: 'text-muted-foreground' }
}

export function ResultScreen() {
  const navigate = useNavigate()
  const {
    program, puntajeEvaluacion, xpTotal,
    logrosDesbloqueados, nodosCompletados, tiempoInicioSesion, reset
  } = useLessonStore()
  const { nivelActual, formatXP } = useGamification()
  const [showRating, setShowRating] = useState(false)

  // Mostrar el modal de rating automáticamente al entrar en la pantalla de resultado
  useEffect(() => {
    const t = setTimeout(() => setShowRating(true), 1200)
    return () => clearTimeout(t)
  }, [])

  const puntaje = puntajeEvaluacion ?? 0
  const cal = getCalificacion(puntaje)
  const duracionMin = tiempoInicioSesion
    ? Math.round((Date.now() - tiempoInicioSesion) / 60000)
    : 0

  const logros = program?.gamificacion.logros.filter(l => logrosDesbloqueados.includes(l.id)) ?? []

  return (
    <>
    {showRating && <RatingModal onClose={() => setShowRating(false)} />}
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
      {/* Light Ambient Mesh */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-hive-amber/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-hive-purple/5 blur-[120px]" />
      </div>

      <div className="w-full max-w-md space-y-8 relative z-10">

        {/* Resultado principal */}
        <div className="text-center space-y-4 animate-in zoom-in-95 duration-500">
          <div className="text-7xl mb-2 drop-shadow-sm">{cal.emoji}</div>
          <h2 className={`text-4xl font-black tracking-tight ${cal.color}`}>{cal.texto}</h2>
          <div className="text-7xl font-black text-foreground drop-shadow-honey">{puntaje}%</div>
          <p className="text-muted-foreground text-sm font-medium leading-relaxed max-w-[280px] mx-auto">
            {program?.gamificacion.mensajeCelebracion}
          </p>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'XP ganado', value: formatXP(xpTotal), emoji: '⚡', color: 'text-hive-amber' },
            { label: 'Nodos', value: `${nodosCompletados.length}/${program?.nodos.length ?? 0}`, emoji: '📚', color: 'text-hive-purple' },
            { label: 'Tiempo', value: `${duracionMin} min`, emoji: '⏱', color: 'text-hive-blue' },
          ].map(m => (
            <div key={m.label} className="rounded-2xl bg-background border border-border p-4 text-center shadow-sm hover:shadow-honey transition-all">
              <span className="text-2xl mb-1 block">{m.emoji}</span>
              <p className={`text-sm font-black ${m.color}`}>{m.value}</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Nivel Card */}
        <div className="rounded-2xl bg-hive-purple/10 border border-hive-purple/20 p-5 text-center relative overflow-hidden group shadow-sm">
          <div className="absolute inset-0 hive-hex-pattern opacity-[0.03] pointer-events-none" />
          <p className="text-[10px] text-hive-purple font-black uppercase tracking-[0.2em] relative z-10">Rango Académico</p>
          <p className="text-3xl font-black text-hive-purple mt-1 relative z-10 group-hover:scale-105 transition-transform">{nivelActual}</p>
        </div>

        {/* Logros */}
        {logros.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground/60 font-black uppercase tracking-[0.2em] text-center">Logros desbloqueados</p>
            <div className="grid grid-cols-2 gap-3">
              {logros.map(logro => (
                <div key={logro.id} className="rounded-xl bg-background border border-border p-3 flex items-center gap-3 shadow-sm hover:shadow-honey transition-all">
                  <span className="text-2xl">{logro.emoji}</span>
                  <div>
                    <p className="text-xs font-black text-foreground">{logro.nombre}</p>
                    <p className="text-[10px] font-bold text-hive-amber">+{logro.xp} XP</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            onClick={() => { reset(); navigate('/rio')}}
            className="flex-1 rounded-xl bg-hive-amber py-4 text-sm font-black text-primary-foreground hover:bg-hive-amber/90 shadow-honey transition-all active:scale-[0.98]"
          >
            🐝 Nueva lección
          </button>
          <button
            onClick={() => navigate('/sessions')}
            className="flex-1 rounded-xl bg-secondary border border-border py-4 text-sm font-black text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all active:scale-[0.98] shadow-sm"
          >
            ← Mis sesiones
          </button>
        </div>
      </div>
    </div>
    </>
  )
}

