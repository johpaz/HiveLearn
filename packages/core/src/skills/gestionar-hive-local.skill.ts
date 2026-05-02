/**
 * HiveLearn — Skill: Gestionar Hive Local LLM
 * Controla descarga de modelos y estado del servidor local
 */

import {
  isLocalLLMAvailable,
  listLocalModels,
  downloadModel,
  getRecommendedModel,
} from "../gateway/llm-local"
import type { ModelId } from "../gateway/llm-local"
import { logger } from "../utils/logger"

const log = logger.child("skill:gestionar-hive-local")

interface HiveLocalParams {
  accion: string
  modelo?: ModelId
  modo?: "texto" | "imagen" | "audio" | "todos"
}

export async function gestionarHiveLocal(params: HiveLocalParams): Promise<Record<string, unknown>> {
  const { accion, modelo, modo } = params

  switch (accion) {
    case "estado": {
      const available = await isLocalLLMAvailable()
      log.info("[gestionar-hive-local] Estado:", { available })
      return {
        ok: true,
        disponible: available,
        mensaje: available
          ? "Hive Local LLM está listo y funcionando"
          : "Hive Local LLM no está disponible. Ejecuta 'hivelearn llm start'",
      }
    }

    case "listar_modelos": {
      const models = listLocalModels()
      return {
        ok: true,
        modelos: models,
      }
    }

    case "descargar": {
      if (!modelo) {
        return { ok: false, error: "Debes especificar 'modelo' para descargar" }
      }
      try {
        const path = await downloadModel(modelo)
        log.info(`[gestionar-hive-local] Modelo descargado: ${modelo}`)
        return { ok: true, mensaje: `Modelo ${modelo} descargado en ${path}` }
      } catch (err) {
        log.error("[gestionar-hive-local] Error descargando:", err)
        return { ok: false, error: err instanceof Error ? err.message : "Error descargando" }
      }
    }

    case "seleccionar_modelo": {
      if (!modo) {
        return { ok: false, error: "Debes especificar 'modo' para seleccionar" }
      }
      const modeMap: Record<string, "text" | "image" | "audio" | "all"> = {
        texto: "text",
        imagen: "image",
        audio: "audio",
        todos: "all",
      }
      const mappedMode = modeMap[modo]
      if (!mappedMode) {
        return { ok: false, error: `Modo no válido: ${modo}` }
      }
      const recomendado = getRecommendedModel(mappedMode)
      return {
        ok: true,
        modo,
        modelo_recomendado: recomendado,
        mensaje: `Para modo '${modo}' se recomienda: ${recomendado}`,
      }
    }

    default:
      return { ok: false, error: `Acción desconocida: ${accion}` }
  }
}
