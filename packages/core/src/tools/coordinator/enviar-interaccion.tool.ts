import { gradeAnswer, type AnswerSpec, type Grade } from '../../grading/grade'
import type { Tool } from '../../types/tool'
import { LessonPersistence } from '../../storage/LessonPersistence'
import type { NodoLesson } from '../../types'
import { nodeToA2UI } from '../../a2ui/nodeToA2UI'

/**
 * Bridge entre el coordinador LLM y el WebSocket del alumno.
 *
 * Cuando el coordinador llama esta tool:
 *  1. Envía los mensajes A2UI al cliente via WebSocket
 *  2. Espera hasta MAX_WAIT_MS a que el alumno responda
 *  3. Devuelve la acción del alumno al coordinador para que evalúe
 *
 * pendingStudentResponse es el mapa sessionId → resolve.
 * El WebSocket handler llama resolveStudentAction cuando llega una acción del alumno.
 */

export interface StudentAction {
  name: string
  context: Record<string, unknown>
  timestamp: number
}

const MAX_WAIT_MS = 5 * 60 * 1000 // 5 minutos

const pendingStudentResponse = new Map<string, (action: StudentAction) => void>()

export function resolveStudentAction(sessionId: string, action: StudentAction): boolean {
  const resolve = pendingStudentResponse.get(sessionId)
  if (!resolve) return false
  pendingStudentResponse.delete(sessionId)
  resolve(action)
  return true
}

export function hasPendingAction(sessionId: string): boolean {
  return pendingStudentResponse.has(sessionId)
}

export function cancelPendingAction(sessionId: string): void {
  const resolve = pendingStudentResponse.get(sessionId)
  if (resolve) {
    pendingStudentResponse.delete(sessionId)
    resolve({ name: 'cancelled', context: {}, timestamp: Date.now() })
  }
}

export function createEnviarInteraccionTool(
  sessionId: string,
  sendToClient: (msg: object) => void,
  opts?: {
    getXpTotal?: () => number
    addXp?: (amount: number) => void
    /** Cada respuesta corregida de forma determinista (para memoria y evidencia). Un fallo aquí no rompe la lección. */
    onGraded?: (event: { nodoId: string; grade: Grade; answer: string }) => Promise<void> | void
    /** Nodos ya resueltos correctamente en esta sesión: reenviarlos no repite la pantalla ni el XP. */
    isCompleted?: (nodoId: string) => boolean
    /**
     * Juez de respuestas abiertas (Kev). Solo se consulta cuando el nodo NO tiene clave de respuesta: con clave
     * manda la corrección determinista. Devuelve null si no hay oráculo o no aplica a ese nodo.
     */
    /**
     * Ayuda tras una respuesta incorrecta (decidida por Kev con respaldo determinista). `advance` hace que el
     * sistema siga al siguiente nodo sin crédito. Un fallo aquí no rompe la lección.
     */
    onIncorrect?: (input: { node: NodoLesson; attempts: number; answer: string; nodes: NodoLesson[] }) =>
      Promise<{ mensaje?: string; pista?: string; advance?: boolean } | null>
    judgeOpen?: (input: { node: NodoLesson; answer: string }) => Promise<{ verdict: 'correct' | 'incorrect' | 'unsure'; probability: number; grade: Grade } | null>
  },
): Tool {
  const loadCurriculumNodes = async (): Promise<NodoLesson[]> => {
    const persistence = new LessonPersistence()
    const full = await persistence.getSessionWithCurriculum(sessionId)
    return full?.nodosJson ? JSON.parse(full.nodosJson) : []
  }

  const isRenderableA2UI = (candidate: unknown): candidate is object[] => {
    if (!Array.isArray(candidate) || candidate.length === 0) return false
    const hasSurface = candidate.some((msg: any) => Array.isArray(msg?.surfaceUpdate?.components))
    const hasBegin = candidate.some((msg: any) => typeof msg?.beginRendering?.root === 'string' && msg.beginRendering.root.length > 0)
    return hasSurface && hasBegin
  }

  const normalizeText = (value: unknown): string =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()

  const extractAnswer = (action: StudentAction): string => {
    const direct = typeof action.context.respuesta === 'string' ? action.context.respuesta : ''
    if (direct.trim()) return direct.trim()

    const selections = action.context._selections as Record<string, string[]> | undefined
    if (selections && typeof selections === 'object') {
      for (const values of Object.values(selections)) {
        if (Array.isArray(values) && values[0]) return String(values[0])
      }
    }

    const textValues = action.context._textValues as Record<string, string> | undefined
    if (textValues && typeof textValues === 'object') {
      for (const value of Object.values(textValues)) {
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
    }

    return ''
  }

  /**
   * Corrección determinista con la clave que trae el nodo (quiz u opciones del ejercicio). Sin clave →
   * `supported: false`: la respuesta la juzga el tutor, y esa evidencia se registra con baja confianza.
   */
  const evaluateNodeAnswer = (node: NodoLesson, action: StudentAction): {
    supported: boolean
    correcto: boolean
    mensaje: string
    pista?: string
    xpGanado: number
    grade?: Grade
    answer?: string
  } => {
    const answer = extractAnswer(action)
    let spec: AnswerSpec | null = null
    let pista: string | undefined

    if (node.tipoPedagogico === 'quiz' && node.contenido?.quiz?.opciones?.length) {
      const quiz = node.contenido.quiz
      spec = { kind: 'choice', options: quiz.opciones, correctIndex: quiz.indicesCorrecto }
    } else if (node.tipoPedagogico === 'exercise' && node.contenido?.ejercicio?.opciones?.length) {
      const ej = node.contenido.ejercicio
      if (typeof ej.indiceCorrecto === 'number') {
        spec = { kind: 'choice', options: ej.opciones!, correctIndex: ej.indiceCorrecto }
        pista = ej.pistaOpcional
      }
    }

    // Ejercicio de texto libre o clave ausente → lo evalúa el tutor semánticamente.
    if (!spec) return { supported: false, correcto: false, xpGanado: 0, mensaje: '' }

    const grade = gradeAnswer(spec, answer)
    // Una clave inválida o ambigua no se corrige aquí.
    if (grade.correct === null) return { supported: false, correcto: false, xpGanado: 0, mensaje: '', grade, answer }
    const correcto = grade.correct
    return {
      supported: true,
      correcto,
      grade,
      answer,
      xpGanado: correcto ? node.xpRecompensa ?? 0 : 0,
      mensaje: correcto ? '¡Muy bien! Esa respuesta es correcta. 🌟' : 'Esa no es la opción correcta todavía. Inténtalo de nuevo.',
      pista: correcto ? undefined : pista,
    }
  }

  return {
    name: 'enviar_interaccion',
    description: 'Envía una interacción A2UI al alumno y espera su respuesta. Úsala para cada paso de la lección.',
    parameters: {
      type: 'object',
      required: ['a2uiMessages', 'nodoId'],
      properties: {
        a2uiMessages: {
          type: 'array',
          description: 'Array de mensajes A2UI (surfaceUpdate + dataModelUpdate + beginRendering) que representan la interacción completa del paso actual',
          items: { type: 'object' },
        },
        nodoId: {
          type: 'string',
          description: 'ID del nodo pedagógico que se está entregando',
        },
        xpDisponible: {
          type: 'number',
          description: 'XP disponible si el alumno completa este paso correctamente',
        },
        esEvaluable: {
          type: 'boolean',
          description: 'Si true, la interacción requiere evaluación de respuesta. Si false (milestone, intro), avanza automáticamente.',
        },
      },
    },
    execute: async (args: Record<string, unknown>): Promise<string> => {
      const nodoId = args.nodoId as string
      const xpDisponible = (args.xpDisponible as number) ?? 0
      if (opts?.isCompleted?.(nodoId)) {
        return JSON.stringify({
          accion: 'ya_completado',
          nodoActual: nodoId,
          nota: 'Ese nodo ya fue resuelto correctamente. No lo reenvíes: continúa con el siguiente nodo del programa o llama completar_leccion si era el último.',
        })
      }
      let messages = args.a2uiMessages as object[] | undefined

      if (!isRenderableA2UI(messages)) {
        const nodos = await loadCurriculumNodes()
        const nodo = nodos.find((candidate) => candidate.id === nodoId)
        if (!nodo) {
          throw new Error(`No se encontró nodo ${nodoId} para generar A2UI`)
        }
        messages = nodeToA2UI(nodo)
      }

      // Enviar A2UI al cliente
      sendToClient({
        type: 'a2ui',
        messages,
        nodoId,
        xpDisponible,
      })

      // Si no es evaluable (milestone, intro), esperar complete_node del cliente
      // Si el LLM marcó esEvaluable=false, aun así esperamos la acción del cliente
      let currentNodeId = nodoId
      let action: StudentAction
      // true si el sistema ya corrigió (y dio XP) en esta llamada: el tutor NO debe volver a evaluar.
      let gradedBySystem = false
      // Veredicto dudoso del oráculo sobre la última respuesta abierta: se le pasa al tutor como dato.
      let oracleDoubt: { probabilidad: number } | null = null
      const failures = new Map<string, number>()

      while (true) {
        action = await new Promise<StudentAction>((resolve, reject) => {
          pendingStudentResponse.set(sessionId, resolve)
          setTimeout(() => {
            if (pendingStudentResponse.has(sessionId)) {
              pendingStudentResponse.delete(sessionId)
              reject(new Error('Tiempo de espera agotado'))
            }
          }, MAX_WAIT_MS)
        })

        // Para nodos no evaluables, avanzar determinísticamente al siguiente nodo sin
        // depender de otro turno del coordinador.
        if (action.name === 'complete_node') {
          const nodos = await loadCurriculumNodes()
          const currentIdx = nodos.findIndex((candidate) => candidate.id === currentNodeId)
          const nextNode = currentIdx >= 0 ? nodos[currentIdx + 1] : null
          if (!nextNode) break

          currentNodeId = nextNode.id
          sendToClient({
            type: 'a2ui',
            messages: nodeToA2UI(nextNode),
            nodoId: nextNode.id,
            xpDisponible: nextNode.xpRecompensa ?? 0,
          })
          continue
        }

        if (action.name === 'check_answer') {
          const nodos = await loadCurriculumNodes()
          const currentNode = nodos.find((candidate) => candidate.id === currentNodeId)
          if (currentNode) {
            let evaluation = evaluateNodeAnswer(currentNode, action)
            // Sin clave de respuesta: Kev juzga la respuesta abierta (la clave, cuando existe, ya decidió arriba).
            if (!evaluation.supported && opts?.judgeOpen) {
              const answer = extractAnswer(action)
              const judged = answer ? await opts.judgeOpen({ node: currentNode, answer }).catch(() => null) : null
              if (judged && judged.verdict !== 'unsure') {
                const correcto = judged.verdict === 'correct'
                evaluation = {
                  supported: true, correcto, grade: judged.grade, answer,
                  xpGanado: correcto ? currentNode.xpRecompensa ?? 0 : 0,
                  mensaje: correcto ? '¡Muy bien! Tu respuesta muestra que lo entendiste. 🌟' : 'Todavía no está del todo. Revisa tu respuesta y vuelve a intentarlo.',
                  pista: correcto ? undefined : currentNode.contenido?.ejercicio?.pistaOpcional,
                }
              } else if (judged) {
                oracleDoubt = { probabilidad: Math.round(judged.probability * 100) / 100 }
              }
            }
            let advanceWithoutCredit = false
            if (evaluation.supported && !evaluation.correcto && opts?.onIncorrect) {
              const attempts = (failures.get(currentNodeId) ?? 0) + 1
              failures.set(currentNodeId, attempts)
              const help = await opts.onIncorrect({ node: currentNode, attempts, answer: evaluation.answer ?? '', nodes: nodos }).catch(() => null)
              if (help) {
                evaluation = { ...evaluation, mensaje: help.mensaje ?? evaluation.mensaje, pista: help.pista ?? evaluation.pista }
                advanceWithoutCredit = !!help.advance
              }
            }
            if (evaluation.supported) {
              gradedBySystem = true
              if (evaluation.grade) {
                try { await opts?.onGraded?.({ nodoId: currentNodeId, grade: evaluation.grade, answer: evaluation.answer ?? '' }) } catch { /* auxiliar */ }
              }
              if (evaluation.xpGanado > 0) {
                opts?.addXp?.(evaluation.xpGanado)
              }
              sendToClient({
                type: 'evaluation',
                correcto: evaluation.correcto,
                xpGanado: evaluation.xpGanado,
                mensaje: evaluation.mensaje,
                ...(evaluation.pista ? { pista: evaluation.pista } : {}),
              })
              if (evaluation.xpGanado > 0) {
                sendToClient({
                  type: 'xp_award',
                  amount: evaluation.xpGanado,
                  total: opts?.getXpTotal?.() ?? evaluation.xpGanado,
                })
              }

              if (!evaluation.correcto && !advanceWithoutCredit) {
                continue
              }

              const currentIdx = nodos.findIndex((candidate) => candidate.id === currentNodeId)
              const nextNode = currentIdx >= 0 ? nodos[currentIdx + 1] : null
              if (!nextNode) {
                break
              }

              currentNodeId = nextNode.id
              sendToClient({
                type: 'a2ui',
                messages: nodeToA2UI(nextNode),
                nodoId: nextNode.id,
                xpDisponible: nextNode.xpRecompensa ?? 0,
              })
              continue
            }
          }
        }

        break
      }

      return JSON.stringify({
        accion: action.name,
        contexto: action.context,
        timestamp: action.timestamp,
        nodoActual: currentNodeId,
        ...(oracleDoubt && !gradedBySystem ? { veredictoOraculo: { veredicto: 'dudoso', ...oracleDoubt }, notaOraculo: 'El oráculo no pudo decidir con confianza: evalúa tú la respuesta con tu criterio.' } : {}),
        ...(gradedBySystem ? { evaluadoPorSistema: true, nota: 'La corrección y el XP de este nodo ya los aplicó el sistema: NO llames evaluar_respuesta para él; continúa con el siguiente paso.' } : {}),
      })
    },
  }
}
