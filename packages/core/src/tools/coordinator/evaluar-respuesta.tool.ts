import type { Tool } from '../../types/tool'

/**
 * Tool que el coordinador llama en MODO ENTREGA después de evaluar
 * la respuesta del alumno. Emite mensajes WebSocket al cliente:
 *   { type: "evaluation", correcto, xpGanado, mensaje, pista? }
 *   { type: "xp_award", amount, total }      (si xpGanado > 0)
 *   { type: "logro", logro }                  (si se desbloquea uno)
 */
export function createEvaluarRespuestaTool(
  sendToClient: (msg: object) => void,
  getXpTotal: () => number,
  addXp: (amount: number) => void,
): Tool {
  return {
    name: 'evaluar_respuesta',
    description: 'Envía el resultado de la evaluación al alumno (correcto/incorrecto + XP ganado). Llama SIEMPRE tras recibir la respuesta del alumno en un nodo evaluable (quiz, ejercicio, reto, código), ANTES de enviar el siguiente nodo.',
    parameters: {
      type: 'object',
      required: ['correcto', 'xpGanado', 'mensaje'],
      properties: {
        correcto: {
          type: 'boolean',
          description: '¿El alumno respondió correctamente?',
        },
        xpGanado: {
          type: 'number',
          description: 'XP otorgado en este intento: xpRecompensa completo en 1er intento, 50% en 2do, 25% en 3ro, 0 si se rinde',
        },
        mensaje: {
          type: 'string',
          description: 'Mensaje motivador personalizado para el alumno (celebración si correcto, ánimo si incorrecto)',
        },
        pista: {
          type: 'string',
          description: 'Pista para guiarlo sin revelar la respuesta (solo incluir si incorrecto)',
        },
        logro: {
          type: 'object',
          description: 'Logro desbloqueado en este momento (opcional)',
          properties: {
            id:          { type: 'string' },
            titulo:      { type: 'string' },
            emoji:       { type: 'string' },
            descripcion: { type: 'string' },
          },
        },
      },
    },
    execute: async (args: Record<string, unknown>): Promise<string> => {
      const correcto  = Boolean(args.correcto)
      const xpGanado  = Number(args.xpGanado ?? 0)
      const mensaje   = String(args.mensaje ?? '')
      const pista     = args.pista ? String(args.pista) : undefined

      addXp(xpGanado)
      const xpTotal = getXpTotal()

      sendToClient({
        type: 'evaluation',
        correcto,
        xpGanado,
        mensaje,
        ...(pista ? { pista } : {}),
      })

      if (xpGanado > 0) {
        sendToClient({ type: 'xp_award', amount: xpGanado, total: xpTotal })
      }

      if (args.logro && typeof args.logro === 'object' && (args.logro as any).id) {
        sendToClient({ type: 'logro', logro: args.logro })
      }

      return JSON.stringify({ ok: true, correcto, xpGanado, xpTotal })
    },
  }
}
