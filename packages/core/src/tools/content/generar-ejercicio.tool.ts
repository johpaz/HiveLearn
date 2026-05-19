import type { Tool } from '../../types/tool'

export const generarEjercicioTool: Tool = {
  name: 'generar_ejercicio',
  description: 'Guarda un ejercicio práctico generado',
  parameters: {
    type: 'object',
    properties: {
      enunciado: { type: 'string' },
      pasos: { type: 'array', items: { type: 'string' }, description: 'Pasos guiados del ejercicio' },
      ejemplo_respuesta: { type: 'string' },
      respuesta_correcta: { type: 'string' },
      pista_opcional: { type: 'string' },
      opciones: { type: 'array', items: { type: 'string' }, description: 'Opciones para ejercicios de selección múltiple' },
      indice_correcto: { type: 'number', description: 'Indice correcto para ejercicios de selección múltiple' },
    },
    required: ['enunciado', 'pasos', 'ejemplo_respuesta', 'respuesta_correcta'],
  },
  execute: async (params) => ({ ok: true, output: {
    enunciado: params.enunciado,
    pasos: params.pasos,
    ejemploRespuesta: params.ejemplo_respuesta,
    respuestaCorrecta: params.respuesta_correcta,
    pistaOpcional: params.pista_opcional,
    opciones: params.opciones,
    indiceCorrecto: params.indice_correcto,
  } }),
}
