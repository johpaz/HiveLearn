/**
 * WorldSaveManager — Sistema de guardado y carga del mundo
 * 
 * Persiste el estado del mundo en la base de datos y permite
 * regenerar el mundo cuando el alumno vuelve a la sesión
 */

import type { MundoGuardado } from '../types'
import { useMundoStore } from '../../../store/mundoStore'

export interface SaveOptions {
  /** Forzar guardado inmediato */
  force?: boolean
  
  /** Callback cuando se completa el guardado */
  onComplete?: (success: boolean) => void
}

export interface LoadResult {
  /** Éxito de la carga */
  success: boolean
  
  /** Estado cargado */
  estado?: Partial<MundoGuardado>
  
  /** Error si ocurrió */
  error?: string
}

/**
 * WorldSaveManager — Gestiona guardado y carga del mundo
 */
export class WorldSaveManager {
  /** Último guardado (timestamp) */
  private lastSave: number = 0
  
  /** Intervalo de guardado automático (ms) */
  private autoSaveInterval: number = 30000
  
  /** Guardado automático habilitado */
  private autoSaveEnabled: boolean = true
  
  /** Timer de auto-guardado */
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  
  /** Estado pendiente de guardado */
  private pendingSave: boolean = false

  constructor() {
    this.startAutoSave()
  }

  /**
   * Guardar estado actual del mundo
   */
  async save(options?: SaveOptions): Promise<boolean> {
    const state = useMundoStore.getState()
    
    // Preparar datos para guardado
    const datos: MundoGuardado = {
      programaUuid: state.programaUuid || '',
      sessionId: state.sessionId || '',
      alumnoId: state.alumnoId || '',
      xpTotal: state.xpTotal,
      nivel: state.nivelActual,
      zonaActual: state.zonaActual,
      modulosCompletados: state.modulosCompletados,
      logros: state.logros.map(l => l.nombre),
      coleccionables: state.coleccionables,
      vidas: state.vidas,
      mejorRacha: state.mejorRacha,
      timestamp: Date.now(),
    }

    try {
      // Guardar en localStorage (fallback)
      localStorage.setItem('hivelearn-mundo-guardado', JSON.stringify(datos))
      
      // Guardar en base de datos (API call)
      await this.guardarEnBD(datos)
      
      this.lastSave = Date.now()
      this.pendingSave = false
      
      options?.onComplete?.(true)
      return true
      
    } catch (error) {
      console.error('Error al guardar:', error)
      this.pendingSave = true
      options?.onComplete?.(false)
      return false
    }
  }

  /**
   * Guardar en base de datos
   */
  private async guardarEnBD(datos: MundoGuardado): Promise<void> {
    // TODO: Implementar llamada API al backend
    // POST /api/mundo/guardar
    // {
    //   session_id: datos.sessionId,
    //   alumno_id: datos.alumnoId,
    //   estado_json: JSON.stringify(datos),
    // }
    
    console.log('[WorldSaveManager] Guardando en BD:', datos)
  }

  /**
   * Cargar estado guardado
   */
  async load(): Promise<LoadResult> {
    try {
      // Intentar cargar de localStorage primero
      const localStorageData = localStorage.getItem('hivelearn-mundo-guardado')
      
      if (localStorageData) {
        const estado: MundoGuardado = JSON.parse(localStorageData)
        
        // Validar que el estado sea válido
        if (this.validarEstado(estado)) {
          return {
            success: true,
            estado,
          }
        }
      }
      
      // Intentar cargar de BD
      const estadoBD = await this.cargarDeBD()
      
      if (estadoBD) {
        // Guardar en localStorage como cache
        localStorage.setItem('hivelearn-mundo-guardado', JSON.stringify(estadoBD))
        
        return {
          success: true,
          estado: estadoBD,
        }
      }
      
      return {
        success: false,
        error: 'No hay estado guardado',
      }
      
    } catch (error) {
      console.error('Error al cargar:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }

  /**
   * Cargar desde base de datos
   */
  private async cargarDeBD(): Promise<MundoGuardado | null> {
    // TODO: Implementar llamada API al backend
    // GET /api/mundo/cargar/:sessionId
    
    console.log('[WorldSaveManager] Cargando de BD...')
    return null
  }

  /**
   * Validar estado cargado
   */
  private validarEstado(estado: MundoGuardado): boolean {
    // Validaciones básicas
    if (!estado.sessionId || !estado.alumnoId) {
      return false
    }
    
    // Validar que el timestamp no sea muy antiguo (24 horas)
    const ahora = Date.now()
    const veinticuatroHoras = 24 * 60 * 60 * 1000
    
    if (ahora - estado.timestamp > veinticuatroHoras) {
      console.warn('Estado guardado muy antiguo, ignorando')
      return false
    }
    
    return true
  }

  /**
   * Restaurar estado en el store
   */
  restaurarEstado(estado: Partial<MundoGuardado>): void {
    const { cargarDesdeGuardado } = useMundoStore.getState()
    
    cargarDesdeGuardado({
      xpTotal: estado.xpTotal || 0,
      nivelActual: estado.nivel || 1,
      zonaActual: estado.zonaActual || 0,
      modulosCompletados: estado.modulosCompletados || [],
      logros: (estado.logros || []).map(nombre => ({
        nombre,
        descripcion: '',
        icono: '🏆',
        xp_bonus: 0,
        rareza: 'comun' as const,
      })),
      coleccionables: estado.coleccionables || [],
      vidas: estado.vidas || 3,
      mejorRacha: estado.mejorRacha || 0,
    })
  }

  /**
   * Iniciar auto-guardado
   */
  startAutoSave(): void {
    this.stopAutoSave()
    
    this.autoSaveTimer = setInterval(() => {
      if (this.autoSaveEnabled && !this.pendingSave) {
        this.save({ force: false })
      }
    }, this.autoSaveInterval)
  }

  /**
   * Detener auto-guardado
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = null
    }
  }

  /**
   * Forzar guardado inmediato
   */
  forceSave(): Promise<boolean> {
    return this.save({ force: true })
  }

  /**
   * Obtener último guardado
   */
  getLastSave(): number {
    return this.lastSave
  }

  /**
   * Habilitar auto-guardado
   */
  enableAutoSave(): void {
    this.autoSaveEnabled = true
    this.startAutoSave()
  }

  /**
   * Deshabilitar auto-guardado
   */
  disableAutoSave(): void {
    this.autoSaveEnabled = false
    this.stopAutoSave()
  }

  /**
   * Limpiar guardado
   */
  clear(): void {
    localStorage.removeItem('hivelearn-mundo-guardado')
    this.lastSave = 0
    this.pendingSave = false
  }

  /**
   * Destruir manager
   */
  destroy(): void {
    this.stopAutoSave()
  }
}

/**
 * Regenerador del mundo — Reconstruye el mundo desde estado guardado
 */
export class WorldRegenerator {
  private saveManager: WorldSaveManager

  constructor(saveManager: WorldSaveManager) {
    this.saveManager = saveManager
  }

  /**
   * Regenerar mundo desde estado guardado
   */
  async regenerarMundo(): Promise<boolean> {
    try {
      // Cargar estado guardado
      const result = await this.saveManager.load()
      
      if (!result.success || !result.estado) {
        console.warn('No hay estado guardado para regenerar')
        return false
      }
      
      // Restaurar estado en el store
      this.saveManager.restaurarEstado(result.estado)
      
      // Regenerar zonas basadas en estado
      await this.regenerarZonas(result.estado as MundoGuardado)
      
      return true
      
    } catch (error) {
      console.error('Error al regenerar mundo:', error)
      return false
    }
  }

  /**
   * Regenerar zonas desde estado
   */
  private async regenerarZonas(estado: MundoGuardado): Promise<void> {
    const { zonas, desbloquearZona, completarZona, setZonaActual } = useMundoStore.getState()
    
    // Restaurar estado de cada zona
    estado.modulosCompletados.forEach((moduloUuid, index) => {
      completarZona(index)
    })
    
    // Set zona actual
    setZonaActual(estado.zonaActual || 0)
    
    console.log('[WorldRegenerator] Zonas regeneradas:', estado.modulosCompletados.length)
  }

  /**
   * Regenerar jugador desde estado
   */
  regenerarJugador(estado: MundoGuardado): void {
    const { setJugadorPosicion } = useMundoStore.getState()
    
    // Posición inicial basada en zona actual
    const zonaX = estado.zonaActual! * 800 + 100
    const zonaY = 400
    
    setJugadorPosicion(zonaX, zonaY)
  }

  /**
   * Verificar si hay estado para regenerar
   */
  async hayEstadoGuardado(): Promise<boolean> {
    const result = await this.saveManager.load()
    return result.success && !!result.estado
  }
}

export default WorldSaveManager
