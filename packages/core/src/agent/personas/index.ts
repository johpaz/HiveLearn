import { ARIA_PERSONA, ARIA_ONBOARDING_SUFFIX } from './aria.persona'
import { YARA_PERSONA } from './yara.persona'
import { KIMI_PERSONA } from './kimi.persona'
import { IX_PERSONA } from './ix.persona'
import { NOVA_PERSONA } from './nova.persona'
import { CHACHO_PERSONA } from './chacho.persona'
import { COSMO_PERSONA } from './cosmo.persona'
import { MARA_PERSONA } from './mara.persona'
import { VISION_PERSONA } from './vision.persona'
import { TEKA_PERSONA } from './teka.persona'
import { SABIO_PERSONA } from './sabio.persona'
import { PRAXIS_PERSONA } from './praxis.persona'
import { VERA_PERSONA } from './vera.persona'
import { RETANA_PERSONA } from './retana.persona'
import { BYTE_PERSONA } from './byte.persona'
import { LUMA_PERSONA } from './luma.persona'
import { FLIP_PERSONA } from './flip.persona'
import { DATO_PERSONA } from './dato.persona'
import { IRIS_PERSONA } from './iris.persona'
import { SONO_PERSONA } from './sono.persona'
import { CHISPA_PERSONA } from './chispa.persona'
import { JUSTO_PERSONA } from './justo.persona'
import { ECO_PERSONA } from './eco.persona'
import { OJO_PERSONA } from './ojo.persona'
import { LUPA_PERSONA } from './lupa.persona'

export type PersonajeId =
  | 'aria' | 'yara' | 'kimi' | 'ix' | 'nova' | 'chacho' | 'cosmo'
  | 'mara' | 'vision' | 'teka' | 'sabio' | 'praxis' | 'vera' | 'retana'
  | 'byte' | 'luma' | 'flip' | 'dato' | 'iris' | 'sono'
  | 'chispa' | 'justo' | 'eco' | 'ojo' | 'lupa'

interface PersonajeDef {
  nombre: string
  agente_id: string
  mundo: string
  rol: string
  persona: string
}

export const PERSONAJES: Record<PersonajeId, PersonajeDef> = {
  // ── Abejas Maestras (mundos) ─────────────────────────────────────────────
  aria:   { nombre: 'Reina Aria',  agente_id: 'hl-coordinator-agent',       mundo: 'hub',              rol: 'Coordinadora general',          persona: ARIA_PERSONA },
  yara:   { nombre: 'Yara',        agente_id: 'hl-explanation-agent',        mundo: 'selva_amazonica',  rol: 'Ciencias / Naturaleza',         persona: YARA_PERSONA },
  kimi:   { nombre: 'Kimi',        agente_id: 'hl-exercise-agent',           mundo: 'altiplano_andino', rol: 'Matemáticas / Lógica',          persona: KIMI_PERSONA },
  ix:     { nombre: 'Ix',          agente_id: 'hl-quiz-agent',               mundo: 'cenotes_mayas',    rol: 'Historia / Cultura',            persona: IX_PERSONA },
  nova:   { nombre: 'Nova',        agente_id: 'hl-code-agent',               mundo: 'ciudad_2150',      rol: 'Tecnología / Computación',      persona: NOVA_PERSONA },
  chacho: { nombre: 'Chacho',      agente_id: 'hl-feedback-agent',           mundo: 'pampa_llanos',     rol: 'Lenguaje / Comunicación',       persona: CHACHO_PERSONA },
  cosmo:  { nombre: 'Cosmo',       agente_id: 'hl-challenge-agent',          mundo: 'galaxia_antares',  rol: 'Ciencia Avanzada',              persona: COSMO_PERSONA },

  // ── Agentes de sistema / perfil ──────────────────────────────────────────
  mara:   { nombre: 'Mara',        agente_id: 'hl-profile-agent',            mundo: 'onboarding',       rol: 'Escribana de perfiles',         persona: MARA_PERSONA },
  vision: { nombre: 'Visión',      agente_id: 'hl-intent-agent',             mundo: 'onboarding',       rol: 'Oráculo de intenciones',        persona: VISION_PERSONA },
  teka:   { nombre: 'Teka',        agente_id: 'hl-structure-agent',          mundo: 'hub',              rol: 'Arquitecta del camino',         persona: TEKA_PERSONA },

  // ── Agentes de contenido (aparecen en todos los mundos) ─────────────────
  sabio:  { nombre: 'Sabio',       agente_id: 'hl-explanation-agent',        mundo: 'transversal',      rol: 'Maestro de explicaciones',      persona: SABIO_PERSONA },
  praxis: { nombre: 'Práxis',      agente_id: 'hl-exercise-agent',           mundo: 'transversal',      rol: 'Entrenadora de ejercicios',     persona: PRAXIS_PERSONA },
  vera:   { nombre: 'Vera',        agente_id: 'hl-quiz-agent',               mundo: 'transversal',      rol: 'Examinadora de quizzes',        persona: VERA_PERSONA },
  retana: { nombre: 'Retana',      agente_id: 'hl-challenge-agent',          mundo: 'transversal',      rol: 'Lanzadora de retos',            persona: RETANA_PERSONA },

  // ── Agentes creativos / media ────────────────────────────────────────────
  byte:   { nombre: 'Byte',        agente_id: 'hl-code-agent',               mundo: 'transversal',      rol: 'Robot-abeja de código',         persona: BYTE_PERSONA },
  luma:   { nombre: 'Luma',        agente_id: 'hl-svg-agent',                mundo: 'transversal',      rol: 'Artista visual',                persona: LUMA_PERSONA },
  flip:   { nombre: 'Flip',        agente_id: 'hl-gif-agent',                mundo: 'transversal',      rol: 'Animadora',                     persona: FLIP_PERSONA },
  dato:   { nombre: 'Dato',        agente_id: 'hl-infographic-agent',        mundo: 'transversal',      rol: 'Analista de datos',             persona: DATO_PERSONA },
  iris:   { nombre: 'Iris',        agente_id: 'hl-image-agent',              mundo: 'transversal',      rol: 'Generadora de imágenes',        persona: IRIS_PERSONA },
  sono:   { nombre: 'Sono',        agente_id: 'hl-audio-agent',              mundo: 'transversal',      rol: 'Narrador musical',              persona: SONO_PERSONA },

  // ── Agentes de progreso / evaluación ─────────────────────────────────────
  chispa: { nombre: 'Chispa',      agente_id: 'hl-gamification-agent',       mundo: 'transversal',      rol: 'Celebradora de XP y logros',   persona: CHISPA_PERSONA },
  justo:  { nombre: 'Justo',       agente_id: 'hl-evaluation-agent',         mundo: 'transversal',      rol: 'Juez de evaluaciones',          persona: JUSTO_PERSONA },
  eco:    { nombre: 'Eco',         agente_id: 'hl-feedback-agent',           mundo: 'transversal',      rol: 'Empática del feedback',         persona: ECO_PERSONA },

  // ── Agentes de monitoreo ─────────────────────────────────────────────────
  ojo:    { nombre: 'Ojo',         agente_id: 'hl-monitor-agent',            mundo: 'transversal',      rol: 'Observadora silenciosa',        persona: OJO_PERSONA },
  lupa:   { nombre: 'Lupa',        agente_id: 'hl-vision-pedagogica-agent',  mundo: 'transversal',      rol: 'Visión pedagógica',             persona: LUPA_PERSONA },
}

/** Mapeo mundo → Abeja Maestra principal */
export const MUNDO_A_PERSONAJE: Record<string, PersonajeId> = {
  hub:              'aria',
  onboarding:       'aria',
  selva_amazonica:  'yara',
  altiplano_andino: 'kimi',
  cenotes_mayas:    'ix',
  ciudad_2150:      'nova',
  pampa_llanos:     'chacho',
  galaxia_antares:  'cosmo',
}

/** Mapeo agente_id → personaje_id */
export const AGENTE_A_PERSONAJE: Record<string, PersonajeId> = {
  'hl-coordinator-agent':       'aria',
  'hl-profile-agent':           'mara',
  'hl-intent-agent':            'vision',
  'hl-structure-agent':         'teka',
  'hl-explanation-agent':       'sabio',
  'hl-exercise-agent':          'praxis',
  'hl-quiz-agent':              'vera',
  'hl-challenge-agent':         'retana',
  'hl-code-agent':              'byte',
  'hl-svg-agent':               'luma',
  'hl-gif-agent':               'flip',
  'hl-infographic-agent':       'dato',
  'hl-image-agent':             'iris',
  'hl-audio-agent':             'sono',
  'hl-gamification-agent':      'chispa',
  'hl-evaluation-agent':        'justo',
  'hl-feedback-agent':          'eco',
  'hl-monitor-agent':           'ojo',
  'hl-vision-pedagogica-agent': 'lupa',
}

/**
 * Inyecta la persona del personaje en el system prompt del agente.
 * Se llama desde los handlers WebSocket antes de invocar al LLM.
 */
export function conPersonaje(systemPrompt: string, personajeId: PersonajeId): string {
  return `${PERSONAJES[personajeId].persona}\n\n${systemPrompt}`
}

/** Versión onboarding: Aria con sufijo especial de bienvenida */
export function ariaOnboarding(systemPrompt: string): string {
  return `${ARIA_PERSONA}\n${ARIA_ONBOARDING_SUFFIX}\n\n${systemPrompt}`
}

/** Devuelve el personaje_id que le corresponde a un agente_id dado */
export function personajePorAgente(agenteId: string): PersonajeId {
  return AGENTE_A_PERSONAJE[agenteId] ?? 'aria'
}

export {
  ARIA_PERSONA, ARIA_ONBOARDING_SUFFIX,
  YARA_PERSONA, KIMI_PERSONA, IX_PERSONA, NOVA_PERSONA, CHACHO_PERSONA, COSMO_PERSONA,
  MARA_PERSONA, VISION_PERSONA, TEKA_PERSONA,
  SABIO_PERSONA, PRAXIS_PERSONA, VERA_PERSONA, RETANA_PERSONA,
  BYTE_PERSONA, LUMA_PERSONA, FLIP_PERSONA, DATO_PERSONA, IRIS_PERSONA, SONO_PERSONA,
  CHISPA_PERSONA, JUSTO_PERSONA, ECO_PERSONA, OJO_PERSONA, LUPA_PERSONA,
}
