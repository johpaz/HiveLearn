/**
 * WorldMap — Mapa del mundo expansible
 * 
 * Genera y gestiona la estructura del mundo con zonas, plataformas y coleccionables
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, COLORS, ZONAS_CONFIG, PLATAFORMAS_CONFIG, randomInt, randomRange } from '../constants'
import type { Zona, Plataforma, Coleccionable } from '../types'

export interface WorldMapOptions {
  tema?: string
}

/**
 * WorldMap — Genera y renderiza el mapa del mundo
 */
export class WorldMap extends Container {
  /** Zonas del mundo */
  public zonas: Zona[] = []
  
  /** Plataformas */
  public plataformas: Plataforma[] = []
  
  /** Coleccionables */
  public coleccionables: Coleccionable[] = []
  
  /** Contenedor de zonas */
  private zonasContainer: Container
  
  /** Contenedor de plataformas */
  private plataformasContainer: Container
  
  /** Contenedor de coleccionables */
  private coleccionablesContainer: Container
  
  /** Tema del programa */
  private tema: string

  constructor(tema: string = '') {
    super()
    this.tema = tema
    
    this.zonasContainer = new Container()
    this.plataformasContainer = new Container()
    this.coleccionablesContainer = new Container()
    
    this.addChild(this.plataformasContainer)
    this.addChild(this.zonasContainer)
    this.addChild(this.coleccionablesContainer)
    
    // Generar mundo inicial
    this.generarMundo()
  }

  /**
   * Generar mundo completo
   */
  generarMundo(): void {
    // Generar zona de bienvenida (zona 0)
    this.generarZonaBienvenida()
    
    // Generar zonas de módulos (1..N)
    const numZonas = randomInt(5, 10)
    for (let i = 1; i <= numZonas; i++) {
      this.generarZonaModulo(i)
    }
    
    // Generar zona final
    this.generarZonaFinal(numZonas + 1)
    
    // Renderizar todo
    this.renderizarZonas()
    this.renderizarPlataformas()
    this.renderizarColeccionables()
  }

  /**
   * Generar zona de bienvenida
   */
  private generarZonaBienvenida(): void {
    const x = 100
    const y = WORLD_HEIGHT - ZONAS_CONFIG.alturaSuelo * TILE_SIZE - 100
    
    const zona: Zona = {
      numero: 0,
      estado: 'disponible',
      x,
      y,
      ancho: ZONAS_CONFIG.anchoZona * TILE_SIZE,
      alto: 150,
      moduloUuid: 'bienvenida',
      agenteId: 'hl-coordinator-agent',
      titulo: '¡Bienvenido!',
      tipoPedagogico: 'milestone',
      xpRecompensa: 50,
      plataforma: [],
      coleccionables: [],
    }
    
    this.zonas.push(zona)
  }

  /**
   * Generar zona de módulo
   */
  private generarZonaModulo(numero: number): void {
    const distancia = ZONAS_CONFIG.distanciaEntreZonas * TILE_SIZE
    const x = 100 + numero * distancia
    const variacionY = randomRange(-50, 50)
    const y = WORLD_HEIGHT - ZONAS_CONFIG.alturaSuelo * TILE_SIZE - 100 + variacionY
    
    // Determinar si hay plataformas
    const tienePlataforma = Math.random() < ZONAS_CONFIG.probabilidadPlataforma
    const plataformas: Plataforma[] = []
    
    if (tienePlataforma) {
      const numPlataformas = randomInt(2, 4)
      for (let i = 0; i < numPlataformas; i++) {
        plataformas.push(this.generarPlataforma(
          x + randomRange(-50, 50),
          y - randomRange(50, 150)
        ))
      }
    }
    
    // Determinar si hay coleccionables
    const coleccionables: Coleccionable[] = []
    if (Math.random() < ZONAS_CONFIG.probabilidadPowerup) {
      coleccionables.push(this.generarColeccionable('xp', x + 30, y - 80))
    }
    
    const zona: Zona = {
      numero,
      estado: 'bloqueada',
      x,
      y,
      ancho: ZONAS_CONFIG.anchoZona * TILE_SIZE,
      alto: 150,
      moduloUuid: `modulo-${numero}`,
      agenteId: `hl-pedagogical-agent-${numero}`,
      titulo: `Módulo ${numero}`,
      tipoPedagogico: 'concept',
      xpRecompensa: 100,
      plataforma: plataformas,
      coleccionables,
    }
    
    this.zonas.push(zona)
    this.plataformas.push(...plataformas)
    this.coleccionables.push(...coleccionables)
  }

  /**
   * Generar zona final
   */
  private generarZonaFinal(numero: number): void {
    const distancia = ZONAS_CONFIG.distanciaEntreZonas * TILE_SIZE
    const x = 100 + numero * distancia
    const y = WORLD_HEIGHT - ZONAS_CONFIG.alturaSuelo * TILE_SIZE - 100
    
    const zona: Zona = {
      numero,
      estado: 'bloqueada',
      x,
      y,
      ancho: ZONAS_CONFIG.anchoZona * TILE_SIZE * 1.5,
      alto: 200,
      moduloUuid: 'evaluacion-final',
      agenteId: 'hl-evaluation-agent',
      titulo: 'Evaluación Final',
      tipoPedagogico: 'evaluation',
      xpRecompensa: 500,
      plataforma: [],
      coleccionables: [],
    }
    
    this.zonas.push(zona)
  }

  /**
   * Generar plataforma
   */
  private generarPlataforma(x: number, y: number): Plataforma {
    const ancho = randomInt(PLATAFORMAS_CONFIG.anchoMin, PLATAFORMAS_CONFIG.anchoMax) * TILE_SIZE
    const alto = PLATAFORMAS_CONFIG.grosor
    
    return {
      id: `plataforma-${x}-${y}`,
      x,
      y,
      ancho,
      alto,
      tipo: 'plataforma',
    }
  }

  /**
   * Generar coleccionable
   */
  private generarColeccionable(tipo: 'xp' | 'vida' | 'powerup', x: number, y: number): Coleccionable {
    return {
      id: `coleccionable-${x}-${y}`,
      tipo,
      x,
      y,
      ancho: 20,
      alto: 20,
      valor: tipo === 'xp' ? 50 : tipo === 'vida' ? 1 : 0,
      recogido: false,
      animacionOffset: Math.random() * Math.PI * 2,
    }
  }

  /**
   * Renderizar zonas
   */
  private renderizarZonas(): void {
    this.zonasContainer.removeChildren()
    
    this.zonas.forEach((zona) => {
      const graphics = new Graphics()
      
      // Color según estado
      let color: number
      let alpha: number
      
      switch (zona.estado) {
        case 'bloqueada':
          color = COLORS.bloqueo
          alpha = 0.6
          break
        case 'disponible':
          color = COLORS.desbloqueado
          alpha = 0.8
          break
        case 'completada':
          color = COLORS.completado
          alpha = 0.9
          break
      }
      
      // Dibujar zona (rectángulo redondeado)
      graphics.roundRect(zona.x, zona.y, zona.ancho, zona.alto, 16)
      graphics.fill({ color, alpha })
      graphics.stroke({ color: COLORS.acento, width: 3, alpha: 0.8 })
      
      // Ícono según tipo
      const icono = this.obtenerIconoZona(zona.tipoPedagogico || 'concept')
      const textIcono = new Text({
        text: icono,
        style: new TextStyle({
          fontSize: 32,
        }),
        anchor: { x: 0.5, y: 0.5 },
      })
      textIcono.x = zona.x + zona.ancho / 2
      textIcono.y = zona.y + zona.alto / 2
      
      // Número de zona
      const textNumero = new Text({
        text: `${zona.numero}`,
        style: new TextStyle({
          fontSize: 16,
          fontWeight: 'bold',
          fill: COLORS.acento,
        }),
        anchor: { x: 1, y: 0 },
      })
      textNumero.x = zona.x + zona.ancho - 20
      textNumero.y = zona.y + 20
      
      this.zonasContainer.addChild(graphics)
      this.zonasContainer.addChild(textIcono)
      this.zonasContainer.addChild(textNumero)
    })
  }

  /**
   * Renderizar plataformas
   */
  private renderizarPlataformas(): void {
    this.plataformasContainer.removeChildren()
    
    this.plataformas.forEach((plataforma) => {
      const graphics = new Graphics()
      
      // Dibujar plataforma
      graphics.roundRect(plataforma.x, plataforma.y, plataforma.ancho, plataforma.alto, PLATAFORMAS_CONFIG.radioBorde)
      graphics.fill({ color: COLORS.plataforma })
      graphics.stroke({ color: COLORS.plataformaBorde, width: 2 })
      
      // Detalle pixel art (líneas)
      for (let i = 0; i < plataforma.ancho; i += 16) {
        graphics.moveTo(plataforma.x + i, plataforma.y)
        graphics.lineTo(plataforma.x + i, plataforma.y + plataforma.alto)
      }
      graphics.stroke({ color: 0x000000, width: 1, alpha: 0.2 })
      
      this.plataformasContainer.addChild(graphics)
    })
  }

  /**
   * Renderizar coleccionables
   */
  private renderizarColeccionables(): void {
    this.coleccionablesContainer.removeChildren()
    
    this.coleccionables.forEach((coleccionable) => {
      if (coleccionable.recogido) return
      
      const graphics = new Graphics()
      
      // Dibujar según tipo
      switch (coleccionable.tipo) {
        case 'xp':
          // Estrella/oro
          this.dibujarEstrella(graphics, coleccionable.x, coleccionable.y, 10, COLORS.xp)
          break
        case 'vida':
          // Corazón
          this.dibujarCorazon(graphics, coleccionable.x, coleccionable.y, 10, COLORS.vida)
          break
        case 'powerup':
          // Rayo
          this.dibujarRayo(graphics, coleccionable.x, coleccionable.y, 10, COLORS.magia)
          break
      }
      
      this.coleccionablesContainer.addChild(graphics)
    })
  }

  /**
   * Dibujar estrella
   */
  private dibujarEstrella(g: Graphics, x: number, y: number, radio: number, color: number): void {
    const puntas = 5
    const radioInterior = radio * 0.5
    
    g.moveTo(x, y - radio)
    
    for (let i = 0; i < puntas * 2; i++) {
      const r = i % 2 === 0 ? radio : radioInterior
      const angulo = (i * Math.PI) / puntas - Math.PI / 2
      const px = x + Math.cos(angulo) * r
      const py = y + Math.sin(angulo) * r
      g.lineTo(px, py)
    }
    
    g.closePath()
    g.fill({ color, alpha: 0.9 })
    g.stroke({ color: 0xffffff, width: 2, alpha: 0.8 })
  }

  /**
   * Dibujar corazón
   */
  private dibujarCorazon(g: Graphics, x: number, y: number, radio: number, color: number): void {
    const size = radio
    
    g.moveTo(x, y + size * 0.3)
    g.bezierCurveTo(x, y, x - size, y - size, x - size, y + size * 0.3)
    g.bezierCurveTo(x - size, y + size, x, y + size * 1.5, x, y + size * 2)
    g.bezierCurveTo(x, y + size * 1.5, x + size, y + size, x + size, y + size * 0.3)
    g.bezierCurveTo(x + size, y - size, x, y, x, y + size * 0.3)
    g.closePath()
    g.fill({ color, alpha: 0.9 })
    g.stroke({ color: 0xffffff, width: 2, alpha: 0.6 })
  }

  /**
   * Dibujar rayo
   */
  private dibujarRayo(g: Graphics, x: number, y: number, radio: number, color: number): void {
    const w = radio * 0.6
    const h = radio * 2
    
    g.moveTo(x + w * 0.3, y - h / 2)
    g.lineTo(x - w, y)
    g.lineTo(x - w * 0.3, y)
    g.lineTo(x + w, y + h / 2)
    g.lineTo(x - w * 0.2, y + h / 2)
    g.lineTo(x + w * 0.8, y - h / 2)
    g.closePath()
    g.fill({ color, alpha: 0.9 })
    g.stroke({ color: 0xffffff, width: 2, alpha: 0.8 })
  }

  /**
   * Obtener ícono según tipo pedagógico
   */
  private obtenerIconoZona(tipo: string): string {
    const iconos: Record<string, string> = {
      'concept': '📖',
      'exercise': '✏️',
      'quiz': '❓',
      'challenge': '⚡',
      'milestone': '🎯',
      'evaluation': '📝',
    }
    return iconos[tipo] || '📚'
  }

  /**
   * Actualizar zonas
   */
  updateZonas(zonasActualizadas: Partial<Zona>[]): void {
    zonasActualizadas.forEach((zonaActualizada) => {
      const zona = this.zonas.find(z => z.numero === zonaActualizada.numero)
      if (zona) {
        Object.assign(zona, zonaActualizada)
      }
    })
    
    this.renderizarZonas()
  }

  /**
   * Obtener zona por número
   */
  getZona(numero: number): Zona | undefined {
    return this.zonas.find(z => z.numero === numero)
  }

  /**
   * Obtener zona más cercana
   */
  getZonaCercana(x: number, y: number): Zona | undefined {
    return this.zonas.find(z => {
      return x >= z.x && x <= z.x + z.ancho &&
             y >= z.y && y <= z.y + z.alto
    })
  }

  /**
   * Destruir
   */
  destroy(): void {
    this.removeChildren()
    this.zonas = []
    this.plataformas = []
    this.coleccionables = []
  }
}
