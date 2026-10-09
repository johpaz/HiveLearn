import type { AgeBand, ProgressionLevel } from './types'

/** Original instructional specifications, not complete courses or validated assessments. */
type Project = readonly [project: string, evidence: string]
const PROJECTS: Record<AgeBand, Record<ProgressionLevel, Project>> = {
  ninez: {
    fundamentos: ['Clasificar tarjetas de objetos y comparar reglas con predicciones preparadas.', 'Explicar por qué un ejemplo difícil cambia la clasificación.'],
    usuario_responsable: ['Revisar mensajes ficticios y una respuesta con un error visible.', 'Separar información privada y demostrar una comprobación.'],
    aplicador: ['Organizar una biblioteca ficticia con ayuda de sugerencias.', 'Explicar qué decidió y qué rechazó del asistente.'],
    constructor: ['Diseñar en papel un clasificador y probar casos ambiguos.', 'Registrar aciertos, errores y una regla revisada.'],
    creador_avanzado: ['Mejorar el prototipo con un compañero y mediación docente.', 'Justificar una mejora y un uso que no recomienda.'],
  },
  adolescencia_temprana: {
    fundamentos: ['Comparar un sistema de reglas, uno aprendido de ejemplos y un chatbot.', 'Explicar diferencias sin atribuir intención humana al sistema.'],
    usuario_responsable: ['Auditar afirmaciones y datos de una publicación ficticia.', 'Conservar fuentes, marcar incertidumbre y eliminar datos innecesarios.'],
    aplicador: ['Producir una guía escolar breve con revisión humana por etapas.', 'Mostrar versiones y decisiones de aceptación o corrección.'],
    constructor: ['Probar un clasificador con grupos de ejemplos distintos.', 'Identificar dónde falla y proponer pruebas adicionales.'],
    creador_avanzado: ['Diseñar un protocolo para un asistente escolar.', 'Definir responsables, límites y actuación ante errores.'],
  },
  adolescencia: {
    fundamentos: ['Analizar predicción y generación en un servicio cotidiano.', 'Explicar entradas, salidas, límites y decisiones humanas.'],
    usuario_responsable: ['Investigar una afirmación generada y su posible impacto.', 'Contrastar fuentes independientes y documentar incertidumbre.'],
    aplicador: ['Resolver una necesidad escolar con un flujo reproducible.', 'Comparar el resultado con una alternativa sin IA.'],
    constructor: ['Crear un prototipo con un conjunto de evaluación separado.', 'Presentar métricas comprensibles y casos de error significativos.'],
    creador_avanzado: ['Revisar un prototipo ante cambios de datos y usuarios.', 'Proponer seguimiento, retirada y revisión humana.'],
  },
  adulto: {
    fundamentos: ['Identificar IA en un trámite, servicio o tarea cotidiana.', 'Diferenciar automatización, predicción y generación con ejemplos.'],
    usuario_responsable: ['Revisar un documento ficticio antes de usar un asistente.', 'Minimizar datos y verificar una recomendación importante.'],
    aplicador: ['Mejorar una tarea ciudadana o laboral acotada.', 'Medir utilidad y coste de revisión frente al proceso original.'],
    constructor: ['Prototipar una solución con criterios explícitos de aceptación.', 'Evaluar calidad, errores, accesibilidad y alternativa manual.'],
    creador_avanzado: ['Preparar un plan de operación responsable de un prototipo.', 'Definir riesgos, responsables, intervención y mejora.'],
  },
}

export function suggestedProgram(ageBand: AgeBand, level: ProgressionLevel) {
  const [project, evidence] = PROJECTS[ageBand][level]
  return {
    id: `${ageBand}:${level}`, project, evidence,
    stages: ['Activar conocimientos previos', 'Examinar un ejemplo y sus límites', 'Practicar con datos ficticios', 'Entregar evidencia', 'Revisar con el docente y reflexionar'],
    assessment: 'Propuesta formativa; la acreditación requiere evidencia y revisión docente.',
  }
}
