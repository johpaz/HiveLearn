import type { Tool } from '../../types/tool'
import { CurriculumValidationError, MAX_LEVELS, MAX_NODES, validateCurriculumContent } from '../../institutional/curriculum-def'

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra })

/**
 * Salida estructurada del Arquitecto curricular. Si el grafo no es válido NO devuelve `ok`: el resultado
 * (con todos los problemas) vuelve al modelo para que lo corrija en la siguiente vuelta del loop.
 */
export const definirCurriculoTool: Tool = {
  name: 'definir_curriculo',
  description: 'Entrega el currículo completo de un tema: niveles, nodos con prerrequisitos y banco de preguntas diagnósticas. Si es inválido devuelve la lista de problemas para corregirlos y volver a llamar.',
  parameters: {
    type: 'object',
    required: ['id', 'topic', 'version', 'levels', 'nodes', 'questionBank'],
    properties: {
      id: str('Identificador del tema: minúsculas, números, _ y -, máx. 48'),
      topic: str('Nombre del tema'),
      language: str('Idioma, p. ej. "es"'),
      version: str('Versión del currículo, p. ej. "sql-2026.10.1"'),
      levels: { type: 'array', description: `Niveles de menor a mayor (1 a ${MAX_LEVELS}), como identificadores`, items: { type: 'string' } },
      nodes: {
        type: 'array',
        description: `Competencias (1 a ${MAX_NODES}), en orden topológico`,
        items: {
          type: 'object',
          required: ['id', 'title', 'level', 'prerequisites', 'objective', 'evidence'],
          properties: {
            id: str('Identificador del nodo'),
            title: str('Título breve'),
            level: str('Uno de los niveles de "levels"'),
            prerequisites: { type: 'array', items: { type: 'string' }, description: 'Ids de nodos requeridos; nunca de un nivel posterior' },
            objective: str('Qué podrá hacer el alumno'),
            evidence: str('Qué evidencia observable lo demuestra'),
            tags: { type: 'array', items: { type: 'string' }, description: 'Hasta 5 etiquetas de interés' },
            sources: { type: 'array', items: { type: 'string' }, description: 'Claves de "sources"' },
          },
        },
      },
      questionBank: {
        type: 'array',
        description: 'Al menos una pregunta diagnóstica por nodo',
        items: {
          type: 'object',
          required: ['id', 'nodeId', 'prompt', 'options', 'correct'],
          properties: {
            id: str('Identificador de la pregunta'),
            nodeId: str('Nodo que evalúa'),
            prompt: str('Enunciado'),
            options: { type: 'array', items: { type: 'string' }, description: 'EXACTAMENTE 3 opciones distintas' },
            correct: { type: 'number', description: 'Índice 0, 1 o 2 de la opción correcta' },
          },
        },
      },
      sources: { type: 'object', description: 'clave → URL https de las fuentes citadas por los nodos' },
    },
  },
  execute: async (params) => {
    try {
      return { ok: true, output: validateCurriculumContent(params) }
    } catch (error) {
      if (error instanceof CurriculumValidationError) {
        return { ok: false, error: 'El currículo no es válido. Corrige TODOS estos problemas y vuelve a llamar definir_curriculo:', issues: error.issues } as never
      }
      throw error
    }
  },
}
