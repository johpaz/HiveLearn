import { useCallback, useState } from 'react'
import { useLessonStore } from '../store/lessonStore'
import type { FeedbackOutput, NodoLesson } from '@hivelearn/core'
import { fetchWithAuth } from '../lib/fetchWithAuth'

export function useNodeInteraction() {
  const { completarNodo, setLastFeedback, setNodoActual, program } = useLessonStore()
  const [loadingFeedback, setLoadingFeedback] = useState(false)

  const persistSessionProgress = useCallback((lastNodeId: string | null) => {
    const state = useLessonStore.getState()
    if (!state.sessionId) return

    const sessionStateJson = JSON.stringify({
      xpTotal: state.xpTotal,
      nodosCompletados: state.nodosCompletados,
      vidas: state.vidas,
      racha: state.racha,
      logrosDesbloqueados: state.logrosDesbloqueados,
      nodoActualId: state.nodoActualId,
    })

    fetchWithAuth('/api/hivelearn/session-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.sessionId,
        xpTotal: state.xpTotal,
        nodosCompletados: state.nodosCompletados.length,
        lastNodeId: lastNodeId ?? state.nodoActualId ?? null,
        sessionStateJson,
        logrosJson: JSON.stringify(state.logrosDesbloqueados),
      }),
    }).catch(() => { /* non-critical */ })
  }, [])

  const submitRespuesta = useCallback(async (nodo: NodoLesson, respuesta: string) => {
    setLoadingFeedback(true)
    try {
      const res = await fetchWithAuth('/api/hivelearn/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodoId: nodo.id,
          tipoPedagogico: nodo.tipoPedagogico,
          concepto: nodo.concepto,
          respuesta,
          rangoEdad: nodo.rangoEdad,
        }),
      })

      const feedback: FeedbackOutput = res.ok
        ? await res.json()
        : { correcto: false, mensajePrincipal: '¡Sigue intentando! 💪', pistaSiIncorrecto: respuesta, xpGanado: 0 }

      setLastFeedback(feedback)

      if (feedback.correcto) {
        completarNodo(nodo.id, feedback.xpGanado)
        // Avanzar al siguiente nodo
        if (program) {
          const idx = program.nodos.findIndex(n => n.id === nodo.id)
          const siguiente = program.nodos[idx + 1]
          if (siguiente) setNodoActual(siguiente.id)
        }
        const snapshot = useLessonStore.getState()
        persistSessionProgress(snapshot.nodoActualId)
      }

      return feedback
    } finally {
      setLoadingFeedback(false)
    }
  }, [completarNodo, setLastFeedback, setNodoActual, program, persistSessionProgress])

  const saltarNodo = useCallback((nodo: NodoLesson) => {
    completarNodo(nodo.id, 0)
    if (program) {
      const idx = program.nodos.findIndex(n => n.id === nodo.id)
      const siguiente = program.nodos[idx + 1]
      if (siguiente) setNodoActual(siguiente.id)
    }
    const snapshot = useLessonStore.getState()
    persistSessionProgress(snapshot.nodoActualId)
  }, [completarNodo, setNodoActual, program, persistSessionProgress])

  return { submitRespuesta, saltarNodo, loadingFeedback }
}
