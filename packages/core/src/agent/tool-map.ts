/**
 * Mapeo agentId → herramientas para cada agente HiveLearn.
 *
 * AGENT_EXECUTABLE_TOOLS: Tool[] con execute() — usado por el agent-loop
 *   para ejecutar tools reales y decidir si el output es structured o feed-back.
 *
 * (AGENT_TOOLS con LLMToolDef[] se mantiene como alias para compatibilidad
 *  en caso de que algún sitio todavía lo importe, pero el runner ya usa
 *  AGENT_EXECUTABLE_TOOLS.)
 */
import type { Tool } from '../types/tool'
import { AGENT_IDS } from '../agent/registry'
import {
  // Coordinator
  revisarProgramaTool,
  repararNodoCompletoTool,
  actualizarPromptAgenteTool,
  planificarProgramaTool,
  delegarEnjambreTool,
  // Content — structured output
  generarExplicacionTool,
  generarEjercicioTool,
  generarQuizTool,
  generarSvgTool,
  generarFramesGifTool,
  generarInfografiaTool,
  generarImagenTool,
  // Evaluation — structured output
  generarEvaluacionTool,
  calificarRespuestaTool,
  // Search — real execute()
  buscarEnHiveLearnTool,
} from '../tools/index'
import { generarAudioTool } from '../tools/content/generar-audio.tool'
import { definirCurriculoTool } from '../tools/curriculum/definir-curriculo.tool'

export const AGENT_EXECUTABLE_TOOLS: Record<string, Tool[]> = {
  [AGENT_IDS.coordinator]:  [planificarProgramaTool, delegarEnjambreTool, revisarProgramaTool, buscarEnHiveLearnTool, repararNodoCompletoTool, actualizarPromptAgenteTool],
  [AGENT_IDS.explanation]:  [generarExplicacionTool],
  [AGENT_IDS.exercise]:     [generarEjercicioTool],
  [AGENT_IDS.quiz]:         [generarQuizTool],
  [AGENT_IDS.svg]:          [generarSvgTool],
  [AGENT_IDS.gif]:          [generarFramesGifTool],
  [AGENT_IDS.infographic]:  [generarInfografiaTool],
  [AGENT_IDS.image]:        [generarImagenTool],
  [AGENT_IDS.evaluation]:   [generarEvaluacionTool],
  [AGENT_IDS.gamification]: [],  // genera JSON libre, sin tool calls
  [AGENT_IDS.feedback]:     [calificarRespuestaTool],
  [AGENT_IDS.audio]:        [generarAudioTool],
  [AGENT_IDS.curriculumArchitect]: [definirCurriculoTool],
}
