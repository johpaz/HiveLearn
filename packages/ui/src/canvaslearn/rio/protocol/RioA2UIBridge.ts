import { Container, Graphics, TextStyle, Text } from 'pixi.js'
import type { IsometricRenderer } from '../renderer/IsometricRenderer'
import { useRioMundoStore } from '@/store/rioMundoStore'
import { activateTributary, completeTributary } from '../world/RiverGenerator'
import type { IsoMap, Tributary } from '../types'
import type { ServerMessage, MundoEvento } from '@hivelearn/core'
import { ISO_CONFIG } from '../types'

export interface RioBridgeRef {
  renderer: IsometricRenderer | null
  dialog: import('../dialog/RioDialog').RioDialog | null
}

export class RioA2UIBridge {
  private sessionId: string
  private alumnoId: string
  private rioRef: RioBridgeRef
  private a2uiMessageQueue: any[] = []

  constructor(options: { sessionId: string; alumnoId: string; rioRef: RioBridgeRef }) {
    this.sessionId = options.sessionId
    this.alumnoId = options.alumnoId
    this.rioRef = options.rioRef
  }

  procesarMensajeServidor(message: ServerMessage): void {
    const { tipo, payload } = message

    switch (tipo) {
      case 'bienvenida':
        this.procesarBienvenida(payload.mundo_evento as any)
        break
      case 'contenido':
        this.procesarContenido(payload.a2ui_messages || [])
        break
      case 'resultado':
        this.procesarResultado(payload.mundo_evento as any)
        break
      case 'evento':
        this.procesarEvento(payload.mundo_evento as MundoEvento)
        break
      case 'error':
        this.procesarError(payload)
        break
    }
  }

  // ─── Server → World ──────────────────────────────────────────────────────────

  private procesarBienvenida(event: any): void {
    const store = useRioMundoStore.getState()
    store.agregarXP(event.datos.nivel_previo === 'principiante' ? 50 : 25)
    store.setBienvenidaMostrada(true)

    // Activate first tributary (zone 1)
    this.activarTributarioEnMundo(1, event.datos.tema || 'Bienvenida')
  }

  private procesarContenido(messages: any[]): void {
    this.a2uiMessageQueue.push(...messages)
  }

  private procesarResultado(event: any): void {
    const store = useRioMundoStore.getState()
    const { calificacion, xp, feedback, siguiente, logro_desbloqueado } = event.datos
    const correcta = calificacion === 'correcto'

    if (xp > 0) {
      const screenPos = store.jugador
      store.agregarXP(xp)
      store.showXpFloat(xp, screenPos.x, screenPos.y)
    }

    // Show feedback via dialog
    if (this.rioRef.dialog) {
      const msg = correcta ? `Correcto! +${xp} XP` : `Intenta de nuevo`
      this.rioRef.dialog.showBeeMessage(msg, 3000)
    }

    if (correcta) {
      store.completarZona(store.zonaActual)

      // Complete tributary in map
      this.completarTributarioEnMundo(store.zonaActual)

      if (siguiente) {
        // Unlock next zone
        store.desbloquearZona(siguiente.zona_numero, {
          zoneNumero: siguiente.zona_numero,
          name: siguiente.animacion_transicion || `Zona ${siguiente.zona_numero}`,
        })
        this.activarTributarioEnMundo(siguiente.zona_numero, 'Nueva zona desbloqueada')
      }
    }

    if (logro_desbloqueado) {
      store.desbloquearLogro({
        nombre: logro_desbloqueado.nombre,
        descripcion: logro_desbloqueado.descripcion,
        icono: logro_desbloqueado.icono || '🏆',
        xp_bonus: logro_desbloqueado.xp_bonus || 0,
        rareza: 'comun',
      })
    }
  }

  private procesarEvento(event: MundoEvento): void {
    const store = useRioMundoStore.getState()

    switch (event.tipo) {
      case 'mundo:nivel_up':
        store.showNivelUp()
        if (this.rioRef.dialog) {
          this.rioRef.dialog.showBeeMessage(`Subiste al nivel ${event.datos.nivel_nuevo}! ${event.datos.mensaje}`, 4000)
        }
        break

      case 'mundo:logro':
        store.desbloquearLogro({
          nombre: event.datos.nombre,
          descripcion: event.datos.descripcion,
          icono: event.datos.icono || '🏆',
          xp_bonus: event.datos.xp_bonus || 0,
          rareza: event.datos.rareza || 'comun',
        })
        if (this.rioRef.dialog) {
          this.rioRef.dialog.showBeeMessage(`Logro desbloqueado: ${event.datos.nombre}`, 3000)
        }
        break

      case 'mundo:completar':
        if (this.rioRef.dialog) {
          this.rioRef.dialog.showBeeMessage(event.datos.mensaje_final || 'Has completado el programa', 5000)
        }
        break

      case 'mundo:abrir_modulo':
        store.desbloquearZona(event.datos.zona_numero, {
          zoneNumero: event.datos.zona_numero,
          name: event.datos.titulo,
          tipoPedagogico: event.datos.tipo_pedagogico,
          xpRecompensa: event.datos.xp_recompensa,
        })
        this.activarTributarioEnMundo(event.datos.zona_numero, event.datos.titulo)
        break

      case 'mundo:actualizar_estado':
        break
      case 'mundo:error':
        break
    }
  }

  private procesarError(payload: any): void {
    console.error('[RioBridge] Error del servidor:', payload)
    if (this.rioRef.dialog) {
      this.rioRef.dialog.showBeeMessage('Hubo un error. Intenta de nuevo.', 3000)
    }
  }

  // ─── Swarm Progress → World ───────────────────────────────────────────────────

  onAgentStarted(agentId: string, agentName: string): void {
    const store = useRioMundoStore.getState()
    store.setAgentStatus(agentId, 'running')

    if (this.rioRef.dialog) {
      this.rioRef.dialog.showBeeMessage(`${agentName} esta trabajando...`, 2000)
    }
  }

  onAgentCompleted(agentId: string, agentName: string, zoneNumero: number | null): void {
    const store = useRioMundoStore.getState()
    store.setAgentStatus(agentId, 'completed')

    if (zoneNumero !== null) {
      // Activate the tributary for this zone
      this.activarTributarioEnMundo(zoneNumero, `${agentName} completo`)
      store.desbloquearZona(zoneNumero, {
        zoneNumero,
        name: `Zona ${zoneNumero}`,
      })
    }

    if (this.rioRef.dialog) {
      this.rioRef.dialog.showBeeMessage(`${agentName} termino!`, 2000)
    }
  }

  onSwarmCompleted(): void {
    const store = useRioMundoStore.getState()
    store.setIsGenerating(false)

    if (this.rioRef.dialog) {
      this.rioRef.dialog.showBeeMessage('Tu programa esta listo! Explora las zonas del rio.', 4000)
    }

    store.setBeeState('celebrating')
    setTimeout(() => store.setBeeState('following'), 3000)
  }

  // ─── World Animations ──────────────────────────────────────────────────────────

  private activarTributarioEnMundo(zoneNumero: number, label: string): void {
    const store = useRioMundoStore.getState()
    const currentMap = store.mapa
    if (!currentMap) return

    const newMap = activateTributary(currentMap, zoneNumero)
    store.setMapa(newMap)

    // Update renderer
    if (this.rioRef.renderer) {
      // Update the changed tiles in the renderer
      const tributary = newMap.tributaries.find(t => t.zoneNumero === zoneNumero)
      if (tributary) {
        for (const point of tributary.path) {
          const tile = newMap.tiles[point.y]?.[point.x]
          if (tile) {
            this.rioRef.renderer.updateTile(tile)
          }
        }
        // Update portal tile
        const portal = tributary.portalPos
        const portalTile = newMap.tiles[portal.y]?.[portal.x]
        if (portalTile) {
          this.rioRef.renderer.updateTile(portalTile)
        }
      }
    }

    // Show bee message
    if (this.rioRef.dialog) {
      this.rioRef.dialog.showBeeMessage(`${label} — el agua esta fluyendo!`, 3000)
    }

    // Bee flies to the new tributary
    store.setBeeState('guiding')
    setTimeout(() => store.setBeeState('following'), 5000)
  }

  private completarTributarioEnMundo(zoneNumero: number): void {
    const store = useRioMundoStore.getState()
    const currentMap = store.mapa
    if (!currentMap) return

    const newMap = completeTributary(currentMap, zoneNumero)
    store.setMapa(newMap)

    // Update renderer
    if (this.rioRef.renderer) {
      const tributary = newMap.tributaries.find(t => t.zoneNumero === zoneNumero)
      if (tributary) {
        for (const point of tributary.path) {
          const tile = newMap.tiles[point.y]?.[point.x]
          if (tile) {
            this.rioRef.renderer.updateTile(tile)
          }
        }
        const portal = tributary.portalPos
        const portalTile = newMap.tiles[portal.y]?.[portal.x]
        if (portalTile) {
          this.rioRef.renderer.updateTile(portalTile)
        }
      }
    }
  }

  // ─── Client → Server ──────────────────────────────────────────────────────────

  enviarRespuesta(moduloUuid: string, nodoId: string, respuesta: any, intentos: number): void {
    // Will be sent via WebSocket manager
  }

  enviarInteraccionZona(zonaNumero: number, accion: 'entrar' | 'salir' | 'completar'): void {
    // Will be sent via WebSocket manager
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────────

  getMessageQueue(): any[] {
    return [...this.a2uiMessageQueue]
  }

  clearMessageQueue(): void {
    this.a2uiMessageQueue = []
  }

  destroy(): void {
    this.clearMessageQueue()
  }
}