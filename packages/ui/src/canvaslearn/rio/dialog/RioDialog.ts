import { Application, Container, Graphics, TextStyle, Text } from 'pixi.js'
import type { IsometricRenderer } from '../renderer/IsometricRenderer'
import { useRioMundoStore } from '@/store/rioMundoStore'
import type { DialogBubble } from '../types'

export class RioDialog {
  private app: Application
  private renderer: IsometricRenderer
  private container: Container
  private activeBubbles: Map<string, { container: Container; createdAt: number; duration: number; anchorIsoX?: number; anchorIsoY?: number }> = new Map()

  constructor(app: Application, renderer: IsometricRenderer) {
    this.app = app
    this.renderer = renderer

    this.container = new Container()
    this.container.zIndex = 5000
    renderer.getOverlayContainer().addChild(this.container)
  }

  showBubble(bubble: DialogBubble) {
    if (this.activeBubbles.has(bubble.id)) return

    const bubbleContainer = new Container()

    // Background
    const bg = new Graphics()
    const maxWidth = 220
    const minWidth = 80
    const padding = 12

    // Text
    const style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 13,
      fill: 0x1a1a2e,
      wordWrap: true,
      wordWrapWidth: maxWidth - padding * 2,
      leading: 2,
    })

    const textObj = new Text({ text: bubble.text, style })
    const textWidth = textObj.width
    const textHeight = textObj.height
    const bgWidth = Math.min(maxWidth, Math.max(minWidth, textWidth + padding * 2))
    const bgHeight = textHeight + padding * 2

    // Bubble shape
    bg.roundRect(-bgWidth / 2, -bgHeight, bgWidth, bgHeight, 8)
    bg.fill({ color: bubble.isQuestion ? 0xFFF8E1 : 0xFFFFFF, alpha: 0.95 })
    bg.stroke({ width: 2, color: bubble.isQuestion ? 0xFFA000 : 0xFDD835 })

    // Pointer triangle
    bg.moveTo(-6, 0)
    bg.lineTo(0, 8)
    bg.lineTo(6, 0)
    bg.fill({ color: bubble.isQuestion ? 0xFFF8E1 : 0xFFFFFF })

    bubbleContainer.addChild(bg)
    textObj.position.set(-textWidth / 2, -bgHeight + padding)
    bubbleContainer.addChild(textObj)

    // Iniciar con escala 0 para efecto pop de entrada
    bubbleContainer.scale.set(0)

    this.activeBubbles.set(bubble.id, {
      container: bubbleContainer,
      createdAt: Date.now(),
      duration: bubble.duration,
      anchorIsoX: bubble.anchorIsoX,
      anchorIsoY: bubble.anchorIsoY,
    })

    this.container.addChild(bubbleContainer)
  }

  removeBubble(id: string) {
    const bubble = this.activeBubbles.get(id)
    if (bubble) {
      this.container.removeChild(bubble.container)
      bubble.container.destroy({ children: true })
      this.activeBubbles.delete(id)
    }
  }

  update(dt: number) {
    const now = Date.now()
    const state = useRioMundoStore.getState()
    const beeState = state.beeState

    for (const [id, bubble] of this.activeBubbles) {
      let screenPos: { x: number; y: number }

      // Check if bubble has fixed anchor coordinates (for swarm agents)
      if (bubble.anchorIsoX !== undefined && bubble.anchorIsoY !== undefined) {
        screenPos = this.renderer.isoToScreen(bubble.anchorIsoX, bubble.anchorIsoY - 1)
      } else if (beeState === 'talking') {
        // Position above bee — usar posición guardada en el store
        const beePos = state.beePosicion
        if (beePos.x !== 0 || beePos.y !== 0) {
          screenPos = this.renderer.isoToScreen(beePos.x, beePos.y - 1)
        } else {
          // Fallback: posición del jugador
          const playerState = state.jugador
          screenPos = this.renderer.isoToScreen(playerState.x, playerState.y - 2)
        }
      } else {
        // Position above player (default behavior)
        const playerState = state.jugador
        screenPos = this.renderer.isoToScreen(playerState.x, playerState.y - 2)
      }

      // Pop-in scale animation (0→1 en 200ms)
      const age = now - bubble.createdAt
      const popProgress = Math.min(1, age / 200)
      const popScale = popProgress < 1 ? (1.1 - 0.1 * popProgress) * popProgress : 1
      bubble.container.scale.set(popScale)

      // Float animation
      const floatY = Math.sin(now / 800 + bubble.createdAt) * 4
      bubble.container.position.set(screenPos.x, screenPos.y - 90 + floatY)

      // Remove expired bubbles
      if (age > bubble.duration) {
        this.removeBubble(id)
      }

      // Fade out near end
      const remaining = bubble.duration - age
      if (remaining < 500) {
        bubble.container.alpha = remaining / 500
      }
    }
  }

  showBeeMessage(text: string, duration: number = 4000, isQuestion: boolean = false) {
    const id = `bee-msg-${Date.now()}`
    const bubble: DialogBubble = {
      id,
      text,
      x: 0,
      y: 0,
      createdAt: Date.now(),
      duration,
      isQuestion,
    }

    this.showBubble(bubble)
    useRioMundoStore.getState().addDialogBubble(bubble)

    return id
  }

  showAgentMessage(agentId: string, text: string, isoX: number, isoY: number, duration: number = 5000) {
    const id = `agent-msg-${agentId}-${Date.now()}`
    const bubble: DialogBubble = {
      id,
      text,
      x: 0,
      y: 0,
      createdAt: Date.now(),
      duration,
      isQuestion: false,
      anchorIsoX: isoX,
      anchorIsoY: isoY,
    }

    this.showBubble(bubble)
    useRioMundoStore.getState().addDialogBubble(bubble)

    return id
  }

  hideBeeMessage(id: string) {
    this.removeBubble(id)
    useRioMundoStore.getState().removeDialogBubble(id)
  }

  destroy() {
    for (const [id] of this.activeBubbles) {
      this.removeBubble(id)
    }
    this.container.destroy({ children: true })
  }
}