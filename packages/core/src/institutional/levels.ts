import type { ProgressionLevel } from './types'

/** Niveles del currículo de IA (catálogo que expone `GET /api/hivelearn/levels`). */
export const LEVEL_CATALOG: Array<{ id: ProgressionLevel; title: string; description: string }> = [
  { id: 'fundamentos', title: 'Fundamentos', description: 'Entender qué es la IA, sus usos, límites y vocabulario.' },
  { id: 'usuario_responsable', title: 'Usuario responsable', description: 'Usar IA con verificación, privacidad y criterio ético.' },
  { id: 'aplicador', title: 'Aplicador', description: 'Resolver problemas reales con flujos y herramientas de IA.' },
  { id: 'constructor', title: 'Constructor', description: 'Diseñar prototipos, agentes y evaluaciones sencillas.' },
  { id: 'creador_avanzado', title: 'Creador avanzado', description: 'Definir, evaluar y mejorar sistemas de IA con ética por diseño.' },
]
