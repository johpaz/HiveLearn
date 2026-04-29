import type { Tool } from '../../types/tool'

export interface LeccionCompletada {
  xpTotal: number
  logros: Array<{ id: string; titulo: string; emoji: string; descripcion: string }>
  mensaje: string
  nodosCompletados: number
  totalNodos: number
}

let _completionResult: LeccionCompletada | null = null

export function getCompletionResult(): LeccionCompletada | null {
  return _completionResult
}

export function createCompletarLeccionTool(
  sendToClient: (msg: object) => void,
): Tool {
  return {
    name: 'completar_leccion',
    description: 'Llama esta tool cuando el alumno haya completado todos los nodos del programa. Cierra la lección y envía el resultado final al alumno.',
    parameters: {
      type: 'object',
      required: ['xpTotal', 'nodosCompletados', 'totalNodos', 'mensaje'],
      properties: {
        xpTotal: {
          type: 'number',
          description: 'XP total acumulado por el alumno (máximo 100)',
        },
        nodosCompletados: {
          type: 'number',
          description: 'Número de nodos completados exitosamente',
        },
        totalNodos: {
          type: 'number',
          description: 'Número total de nodos en el programa',
        },
        logros: {
          type: 'array',
          description: 'Logros desbloqueados durante la lección',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              titulo: { type: 'string' },
              emoji: { type: 'string' },
              descripcion: { type: 'string' },
            },
          },
        },
        mensaje: {
          type: 'string',
          description: 'Mensaje final de celebración personalizado para el alumno',
        },
      },
    },
    execute: async (args: Record<string, unknown>): Promise<string> => {
      const result: LeccionCompletada = {
        xpTotal: (args.xpTotal as number) ?? 0,
        logros: (args.logros as any[]) ?? [],
        mensaje: (args.mensaje as string) ?? '¡Lección completada!',
        nodosCompletados: (args.nodosCompletados as number) ?? 0,
        totalNodos: (args.totalNodos as number) ?? 0,
      }
      _completionResult = result

      sendToClient({
        type: 'lesson_complete',
        xpTotal: result.xpTotal,
        logros: result.logros,
        mensaje: result.mensaje,
        nodosCompletados: result.nodosCompletados,
        totalNodos: result.totalNodos,
      })

      return JSON.stringify({ ok: true, ...result })
    },
  }
}
