/**
 * ParallaxBackground — Fondo con efecto parallax
 * 
 * Múltiples capas que se mueven a diferentes velocidades
 * para crear profundidad en el mundo
 */

import { Container, Graphics } from 'pixi.js'
import { WORLD_WIDTH, WORLD_HEIGHT, COLORS } from '../constants'

/**
 * ParallaxBackground — Fondo parallax con 3 capas
 */
export class ParallaxBackground extends Container {
  /** Capa 1: Cielo (más lenta) */
  private capaCielo: Graphics
  
  /** Capa 2: Montañas (velocidad media) */
  private capaMontanas: Graphics
  
  /** Capa 3: Árboles/nubes (más rápida) */
  private capaFrente: Graphics
  
  /** Posición X anterior para calcular delta */
  private lastX: number = 0

  constructor() {
    super()
    
    // Crear capas
    this.capaCielo = this.crearCapaCielo()
    this.capaMontanas = this.crearCapaMontanas()
    this.capaFrente = this.crearCapaFrente()
    
    // Añadir capas (orden de atrás hacia adelante)
    this.addChild(this.capaCielo)
    this.addChild(this.capaMontanas)
    this.addChild(this.capaFrente)
    
    this.lastX = 0
  }

  /**
   * Crear capa de cielo
   */
  private crearCapaCielo(): Graphics {
    const cielo = new Graphics()
    
    // Gradiente de cielo (azul oscuro a azul más claro)
    cielo.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    cielo.fill({ color: COLORS.cielo })
    
    // Estrellas (puntos blancos aleatorios)
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * WORLD_WIDTH
      const y = Math.random() * WORLD_HEIGHT * 0.6
      const size = Math.random() * 2 + 1
      cielo.circle(x, y, size)
      cielo.fill({ color: 0xffffff, alpha: Math.random() * 0.5 + 0.3 })
    }
    
    // Luna
    cielo.circle(WORLD_WIDTH - 150, 80, 40)
    cielo.fill({ color: 0xfbbf24, alpha: 0.8 })
    
    // Nubes lejanas
    this.dibujarNube(cielo, 200, 100, 60)
    this.dibujarNube(cielo, 600, 150, 80)
    this.dibujarNube(cielo, 1200, 80, 70)
    this.dibujarNube(cielo, 1800, 120, 90)
    this.dibujarNube(cielo, 2400, 90, 65)
    
    return cielo
  }

  /**
   * Crear capa de montañas
   */
  private crearCapaMontanas(): Graphics {
    const montanas = new Graphics()
    
    // Montañas (triángulos)
    const picos = [
      { x: 100, h: 150 },
      { x: 300, h: 200 },
      { x: 500, h: 120 },
      { x: 700, h: 180 },
      { x: 900, h: 220 },
      { x: 1100, h: 160 },
      { x: 1300, h: 190 },
      { x: 1500, h: 140 },
      { x: 1700, h: 210 },
      { x: 1900, h: 170 },
      { x: 2100, h: 200 },
      { x: 2300, h: 150 },
      { x: 2500, h: 180 },
      { x: 2700, h: 220 },
    ]
    
    picos.forEach((pico) => {
      montanas.moveTo(pico.x - 80, WORLD_HEIGHT - 200)
      montanas.lineTo(pico.x, WORLD_HEIGHT - 200 - pico.h)
      montanas.lineTo(pico.x + 80, WORLD_HEIGHT - 200)
      montanas.closePath()
      montanas.fill({ color: 0x1a2340, alpha: 0.8 })
      
      // Nieve en la cima
      if (pico.h > 150) {
        montanas.moveTo(pico.x - 20, WORLD_HEIGHT - 200 - pico.h + 40)
        montanas.lineTo(pico.x, WORLD_HEIGHT - 200 - pico.h)
        montanas.lineTo(pico.x + 20, WORLD_HEIGHT - 200 - pico.h + 40)
        montanas.closePath()
        montanas.fill({ color: 0xffffff, alpha: 0.6 })
      }
    })
    
    // Colinas
    for (let i = 0; i < 20; i++) {
      const x = i * 150
      const h = 50 + Math.random() * 50
      montanas.ellipse(x, WORLD_HEIGHT - 180, 100, h)
      montanas.fill({ color: 0x2a3550, alpha: 0.6 })
    }
    
    return montanas
  }

  /**
   * Crear capa del frente (árboles, nubes cercanas)
   */
  private crearCapaFrente(): Graphics {
    const frente = new Graphics()
    
    // Nubes cercanas
    this.dibujarNube(frente, 400, 250, 50)
    this.dibujarNube(frente, 1000, 200, 60)
    this.dibujarNube(frente, 1600, 280, 55)
    this.dibujarNube(frente, 2200, 220, 65)
    
    // Árboles pixel art (simples)
    for (let i = 0; i < 30; i++) {
      const x = i * 100 + Math.random() * 50
      this.dibujarArbol(frente, x, WORLD_HEIGHT - 200)
    }
    
    return frente
  }

  /**
   * Dibujar nube pixel art
   */
  private dibujarNube(g: Graphics, x: number, y: number, size: number): void {
    const s = size / 20
    
    // Forma de nube (círculos superpuestos)
    g.circle(x, y, 15 * s)
    g.fill({ color: 0xffffff, alpha: 0.4 })
    g.circle(x + 20 * s, y - 5 * s, 18 * s)
    g.fill({ color: 0xffffff, alpha: 0.4 })
    g.circle(x + 40 * s, y, 14 * s)
    g.fill({ color: 0xffffff, alpha: 0.4 })
    g.circle(x + 20 * s, y + 8 * s, 16 * s)
    g.fill({ color: 0xffffff, alpha: 0.4 })
  }

  /**
   * Dibujar árbol pixel art
   */
  private dibujarArbol(g: Graphics, x: number, y: number): void {
    const altura = 40 + Math.random() * 30
    const ancho = 20 + Math.random() * 10
    
    // Tronco
    g.rect(x - 5, y - altura, 10, altura)
    g.fill({ color: 0x4a3520, alpha: 0.8 })
    
    // Copa (triángulos)
    g.moveTo(x - ancho, y - altura)
    g.lineTo(x, y - altura - 40)
    g.lineTo(x + ancho, y - altura)
    g.closePath()
    g.fill({ color: 0x2d5a27, alpha: 0.9 })
    
    g.moveTo(x - ancho * 0.8, y - altura + 15)
    g.lineTo(x, y - altura - 25)
    g.lineTo(x + ancho * 0.8, y - altura + 15)
    g.closePath()
    g.fill({ color: 0x3d6a37, alpha: 0.9 })
  }

  /**
   * Actualizar parallax
   */
  update(cameraX: number): void {
    const deltaX = cameraX - this.lastX
    
    // Cada capa se mueve a diferente velocidad
    this.capaCielo.x = -cameraX * 0.1 // Cielo: muy lento
    this.capaMontanas.x = -cameraX * 0.3 // Montañas: lento
    this.capaFrente.x = -cameraX * 0.6 // Frente: más rápido
    
    this.lastX = cameraX
  }

  /**
   * Destruir
   */
  destroy(): void {
    this.removeChildren()
  }
}
