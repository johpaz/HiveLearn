import type { Application } from 'pixi.js'
import type { IsometricRenderer } from '../../rio/renderer/IsometricRenderer'
import { SpiritCard, type SpiritCardConfig } from './SpiritCard'

const HOVER_RADIUS = 1.6
const RING_RADIUS = 3.2

export class SpiritCardSpawner {
  private app: Application
  private renderer: IsometricRenderer
  private cards: SpiritCard[] = []
  private nearestId: string | null = null
  private onSelectCb: ((id: string, value: string) => void) | null = null
  private acceptingInput = true

  constructor(app: Application, renderer: IsometricRenderer) {
    this.app = app
    this.renderer = renderer
  }

  /** Posiciones para distribuir N cards alrededor de un anchor. */
  private layoutPositions(n: number, anchorX: number, anchorY: number): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = []
    for (let i = 0; i < n; i++) {
      // -PI/2 = arriba; vamos en sentido horario
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
      const x = anchorX + RING_RADIUS * Math.cos(angle)
      // y eje iso comprimido (la elipse se ve más natural en pantalla iso)
      const y = anchorY + RING_RADIUS * Math.sin(angle) * 0.85
      positions.push({ x, y })
    }
    return positions
  }

  spawn(configs: SpiritCardConfig[], anchorX: number, anchorY: number) {
    this.clear()
    this.acceptingInput = true
    const positions = this.layoutPositions(configs.length, anchorX, anchorY)
    configs.forEach((cfg, i) => {
      const pos = positions[i]
      const card = new SpiritCard(this.app, this.renderer, cfg, pos.x, pos.y, i * 90)
      this.cards.push(card)
    })
  }

  setOnSelect(cb: ((id: string, value: string) => void) | null) {
    this.onSelectCb = cb
  }

  /** Llamado desde el game loop. Detecta proximidad y actualiza hover. */
  update(playerX: number, playerY: number, time: number) {
    let nearest: SpiritCard | null = null
    let nearestDist = HOVER_RADIUS
    for (const card of this.cards) {
      const pos = card.getIsoPosition()
      const dist = Math.hypot(pos.x - playerX, pos.y - playerY)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = card
      }
    }

    const newNearestId = nearest?.config.id ?? null
    if (newNearestId !== this.nearestId) {
      // Actualizar hover state
      for (const card of this.cards) {
        card.setHovered(card.config.id === newNearestId)
      }
      this.nearestId = newNearestId
    }

    for (const card of this.cards) card.update(time)

    // Limpiar cards muertas
    this.cards = this.cards.filter(c => c.isAlive())
  }

  /** Selecciona la card más cercana al jugador (usado al pulsar E). */
  selectNearest(): boolean {
    if (!this.acceptingInput) return false
    if (!this.nearestId) return false
    const card = this.cards.find(c => c.config.id === this.nearestId)
    if (!card) return false

    this.acceptingInput = false
    const id = card.config.id
    const value = card.config.value

    // Animar select de la elegida + dismiss del resto
    card.triggerSelect()
    for (const other of this.cards) {
      if (other !== card) other.triggerDismiss()
    }

    setTimeout(() => {
      this.onSelectCb?.(id, value)
    }, 350)

    return true
  }

  hasCards(): boolean {
    return this.cards.length > 0
  }

  hasNearest(): boolean {
    return this.nearestId !== null && this.acceptingInput
  }

  getNearestLabel(): string | null {
    if (!this.nearestId) return null
    const card = this.cards.find(c => c.config.id === this.nearestId)
    return card?.config.label ?? null
  }

  clear() {
    for (const card of this.cards) card.destroy()
    this.cards = []
    this.nearestId = null
    this.acceptingInput = true
  }

  destroy() {
    this.clear()
  }
}
