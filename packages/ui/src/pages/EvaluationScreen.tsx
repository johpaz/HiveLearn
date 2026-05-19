import { useState } from 'react'
import { useLessonStore } from '../store/lessonStore'
import { useEvaluation } from '../hooks/useEvaluation'

export function EvaluationScreen() {
  const { program } = useLessonStore()
  const { preguntas, preguntaActual, total, esFinal, responder, finalizarEvaluacion, enviando } = useEvaluation()
  const [respuestaCorta, setRespuestaCorta] = useState('')

  if (!program || preguntas.length === 0) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-hive-amber border-t-transparent animate-spin" />
        <p className="text-muted-foreground font-medium">Preparando evaluación...</p>
      </div>
    </div>
  )

  const pregunta = preguntas[preguntaActual]

  const handleResponder = (resp: string | number) => {
    responder(resp)
    setRespuestaCorta('')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
      {/* Light Ambient Mesh */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-hive-amber/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-hive-purple/5 blur-[120px]" />
      </div>

      <div className="w-full max-w-lg relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-hive-amber/10 border border-hive-amber/20 mb-4 shadow-honey">
            <span className="text-3xl">📝</span>
          </div>
          <h2 className="text-2xl font-black text-foreground tracking-tight">Evaluación Final</h2>
          <p className="text-sm text-muted-foreground mt-1 font-medium">{program.tema}</p>
        </div>

        {/* Progreso */}
        <div className="mb-8">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
            <span>Pregunta {preguntaActual + 1} de {total}</span>
            <span className="text-hive-amber">{Math.round(((preguntaActual) / total) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-secondary border border-border p-0.5">
            <div
              className="h-full rounded-full bg-hive-amber transition-all duration-700 ease-out shadow-[0_0_10px_rgba(245,158,11,0.3)]"
              style={{ width: `${((preguntaActual) / total) * 100}%` }}
            />
          </div>
        </div>

        {/* Tarjeta de pregunta */}
        <div className="bg-background/80 backdrop-blur-xl rounded-2xl border border-border p-8 space-y-6 shadow-honey">
          <div className="flex items-start gap-4">
            <span className="shrink-0 rounded-xl bg-hive-amber/10 border border-hive-amber/20 w-8 h-8 flex items-center justify-center text-xs font-black text-hive-amber shadow-sm">
              {preguntaActual + 1}
            </span>
            <p className="text-lg text-foreground font-semibold leading-snug">{pregunta.pregunta}</p>
          </div>

          {pregunta.tipo === 'multiple_choice' && pregunta.opciones && (
            <div className="space-y-3">
              {pregunta.opciones.map((op, i) => (
                <button
                  key={op}
                  onClick={() => handleResponder(i)}
                  className="w-full text-left rounded-xl border border-border bg-secondary/30 px-5 py-4 text-sm text-foreground font-medium hover:border-hive-amber hover:bg-hive-amber/5 hover:translate-x-1 transition-all duration-300 flex items-center group"
                >
                  <span className="w-6 h-6 rounded-lg bg-secondary border border-border flex items-center justify-center font-bold text-[10px] text-muted-foreground group-hover:bg-hive-amber group-hover:text-primary-foreground group-hover:border-hive-amber transition-colors mr-3">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {op}
                </button>
              ))}
            </div>
          )}

          {pregunta.tipo === 'respuesta_corta' && (
            <div className="space-y-4">
              <textarea
                className="w-full rounded-xl bg-secondary/30 border border-border px-5 py-4 text-sm text-foreground focus:border-hive-amber focus:ring-1 focus:ring-hive-amber/20 outline-none resize-none h-32 transition-all placeholder:text-muted-foreground/40 font-medium"
                placeholder="Escribe tu respuesta detallada..."
                value={respuestaCorta}
                onChange={e => setRespuestaCorta(e.target.value)}
              />
              <button
                onClick={() => respuestaCorta.trim() && handleResponder(respuestaCorta.trim())}
                disabled={!respuestaCorta.trim()}
                className="w-full rounded-xl bg-hive-amber py-4 text-sm font-black text-primary-foreground hover:bg-hive-amber/90 shadow-honey disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {esFinal ? '🏁 Finalizar evaluación' : 'Siguiente pregunta →'}
              </button>
            </div>
          )}

          {pregunta.tipo === 'multiple_choice' && esFinal && (
            <button
              onClick={finalizarEvaluacion}
              disabled={enviando}
              className="w-full mt-2 rounded-xl bg-hive-green py-4 text-sm font-black text-primary-foreground hover:opacity-90 shadow-honey disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              {enviando ? 'Calculando resultado...' : '🏁 Ver resultado final'}
            </button>
          )}
        </div>

        {/* Tipo de pregunta */}
        <div className="flex items-center justify-center gap-2 mt-8">
          <div className="h-px w-8 bg-border" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
            {pregunta.tipo === 'multiple_choice' ? '📊 Selección múltiple' : '✍️ Respuesta corta'}
          </p>
          <div className="h-px w-8 bg-border" />
        </div>
      </div>
    </div>
  )
}
