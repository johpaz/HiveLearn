import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  FillGradient,
} from 'pixi.js'

const LOADING_MESSAGES = [
  'Cargando mundo...',
  'Preparando agentes...',
  'Construyendo el rio...',
  'Despertando abejas...',
  'Conectando con el enjambre...',
  'Generando ecosistema...',
  'Explorando tributarios...',
  'Casi listo...',
]

export class RioLoadingScene {
  private app: Application
  private container: Container | null = null
  private bg: Graphics | null = null
  private progressBar: Graphics | null = null
  private progressFill: Graphics | null = null
  private messageText: Text | null = null
  private percentText: Text | null = null
  private titleText: Text | null = null
  private destroyed: boolean = false
  private progress: number = 0
  private targetProgress: number = 0
  private messageIndex: number = 0
  private messageTimer: number = 0
  private tickerCallback: ((ticker: any) => void) | null = null
  private fadeAlpha: number = 0
  private isFadingIn: boolean = true
  private isFadingOut: boolean = false
  private onLoadComplete: (() => void) | null = null
  private screenWidth: number
  private screenHeight: number

  constructor(app: Application) {
    this.app = app
    this.screenWidth = window.innerWidth
    this.screenHeight = window.innerHeight
    this.container = new Container()
    this.container.zIndex = 10000
    this.container.alpha = 0

    this.bg = new Graphics()
    this.progressBar = new Graphics()
    this.progressFill = new Graphics()
    this.messageText = new Text()
    this.percentText = new Text()
    this.titleText = new Text()

    this.buildScene()
    this.startAnimation()
  }

  setOnComplete(cb: () => void) {
    this.onLoadComplete = cb
  }

  setProgress(value: number) {
    this.targetProgress = Math.min(1, Math.max(0, value))
  }

  private buildScene() {
    const cx = this.screenWidth / 2
    const cy = this.screenHeight / 2

    this.drawBackground()
    this.drawTitle(cx, cy - 80)
    this.drawProgressBar(cx, cy + 20)
    this.drawMessages(cx, cy + 70)

    this.container.addChild(this.bg)
    this.container.addChild(this.titleText)
    this.container.addChild(this.progressBar)
    this.container.addChild(this.progressFill)
    this.container.addChild(this.messageText)
    this.container.addChild(this.percentText)

    this.app.stage.addChild(this.container)
  }

  private drawBackground() {
    const grad = new FillGradient({
      start: { x: this.screenWidth / 2, y: 0 },
      end: { x: this.screenWidth / 2, y: this.screenHeight },
      colorStops: [
        { offset: 0, color: 0x0a0e27 },
        { offset: 0.5, color: 0x0f1a3a },
        { offset: 1, color: 0x0a0e27 },
      ],
    })
    this.bg.rect(0, 0, this.screenWidth, this.screenHeight)
    this.bg.fill(grad)
  }

  private drawTitle(cx: number, cy: number) {
    const style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 32,
      fontWeight: 'bold',
      fill: 0xfbbf24,
      letterSpacing: 3,
    })
    this.titleText = new Text({ text: 'HiveLearn', style })
    this.titleText.anchor.set(0.5)
    this.titleText.x = cx
    this.titleText.y = cy
  }

  private drawProgressBar(cx: number, cy: number) {
    const barW = 300
    const barH = 8

    this.progressBar.roundRect(cx - barW / 2, cy - barH / 2, barW, barH, 4)
    this.progressBar.fill({ color: 0x1a1f3a })
    this.progressBar.stroke({ width: 1, color: 0x333355 })

    this.progressFill.roundRect(cx - barW / 2 + 2, cy - barH / 2 + 2, 0, barH - 4, 3)
    this.progressFill.fill({ color: 0xfbbf24 })
  }

  private drawMessages(cx: number, cy: number) {
    const msgStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 14,
      fill: 0x888888,
      letterSpacing: 1,
    })
    this.messageText = new Text({ text: LOADING_MESSAGES[0], style: msgStyle })
    this.messageText.anchor.set(0.5)
    this.messageText.x = cx
    this.messageText.y = cy

    const pctStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 18,
      fontWeight: 'bold',
      fill: 0xfbbf24,
    })
    this.percentText = new Text({ text: '0%', style: pctStyle })
    this.percentText.anchor.set(0.5)
    this.percentText.x = cx
    this.percentText.y = cy + 36
  }

  private startAnimation() {
    this.tickerCallback = (ticker: any) => {
      if (this.destroyed) return
      // Guard against destroyed graphics objects
      if (!this.progressFill || !this.progressBar || !this.messageText || !this.percentText || !this.container) {
        return
      }
      const dt = ticker.deltaMS

      if (this.isFadingIn) {
        this.fadeAlpha += dt * 0.003
        if (this.fadeAlpha >= 1) {
          this.fadeAlpha = 1
          this.isFadingIn = false
        }
      }

      if (this.isFadingOut) {
        this.fadeAlpha -= dt * 0.004
        if (this.fadeAlpha <= 0) {
          this.fadeAlpha = 0
          if (this.onLoadComplete) this.onLoadComplete()
          return  // no acceder a container después de que onLoadComplete lo destruye
        }
      }

      this.container.alpha = this.fadeAlpha

      this.progress += (this.targetProgress - this.progress) * 0.05
      const barW = 300
      const fillW = Math.max(0, (barW - 4) * this.progress)
      const cx = this.screenWidth / 2
      const cy = this.screenHeight / 2 + 20

      this.progressFill.clear()
      this.progressFill.roundRect(cx - barW / 2 + 2, cy - 4 / 2, fillW, 4, 3)
      this.progressFill.fill({ color: 0xfbbf24 })

      const pct = Math.round(this.progress * 100)
      this.percentText.text = `${pct}%`

      this.messageTimer += dt
      if (this.messageTimer > 2000) {
        this.messageTimer = 0
        this.messageIndex = (this.messageIndex + 1) % LOADING_MESSAGES.length
        this.messageText.text = LOADING_MESSAGES[this.messageIndex]
      }

      if (this.progress >= 0.99 && !this.isFadingOut) {
        this.isFadingOut = true
      }
    }

    this.app.ticker.add(this.tickerCallback)
  }

  destroy() {
    this.destroyed = true
    if (this.tickerCallback) {
      this.app.ticker.remove(this.tickerCallback)
      this.tickerCallback = null
    }
    if (this.container) {
      this.container.destroy({ children: true })
    }
    // Null out references to destroyed graphics to prevent accidental access
    this.progressFill = null as any
    this.progressBar = null as any
    this.messageText = null as any
    this.percentText = null as any
    this.titleText = null as any
    this.bg = null as any
    this.container = null as any
  }
}
