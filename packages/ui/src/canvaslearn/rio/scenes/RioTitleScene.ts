import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  FillGradient,
} from 'pixi.js'

interface TitleBee {
  container: Container
  body: Graphics
  wings: Graphics
  glow: Graphics
  vx: number
  vy: number
  baseY: number
  phase: number
  speed: number
  amplitude: number
}

interface Sparkle {
  graphic: Graphics
  x: number
  y: number
  vy: number
  alpha: number
  life: number
  maxLife: number
  size: number
}

export class RioTitleScene {
  private app: Application
  private container: Container
  private bgGradient: Graphics
  private hexLogo: Container
  private hexOuter: Graphics
  private hexInner: Graphics
  private hexGlow: Graphics
  private letterH: Text
  private letterLearn: Text
  private titleText: Text
  private subtitleText: Text
  private buttonContainer: Container
  private buttonBg: Graphics
  private buttonBgHover: Graphics
  private buttonText: Text
  private bees: TitleBee[] = []
  private sparkles: Sparkle[] = []
  private isHovering: boolean = false
  private fadeAlpha: number = 1
  private isFadingOut: boolean = false
  private onEnter: (() => void) | null = null
  private tickerCallback: ((ticker: any) => void) | null = null
  private startTime: number = 0
  private destroyed: boolean = false
  private screenWidth: number
  private screenHeight: number

  constructor(app: Application) {
    this.app = app
    this.screenWidth = window.innerWidth
    this.screenHeight = window.innerHeight
    this.container = new Container()
    this.container.zIndex = 10000

    this.bgGradient = new Graphics()
    this.hexLogo = new Container()
    this.hexOuter = new Graphics()
    this.hexInner = new Graphics()
    this.hexGlow = new Graphics()
    this.letterH = new Text()
    this.letterLearn = new Text()
    this.titleText = new Text()
    this.subtitleText = new Text()
    this.buttonContainer = new Container()
    this.buttonBg = new Graphics()
    this.buttonBgHover = new Graphics()
    this.buttonText = new Text()

    this.buildScene()
    this.spawnBees(6)
    this.spawnSparkles(40)
    this.startAnimation()
  }

  setOnEnter(cb: () => void) {
    this.onEnter = cb
  }

  private buildScene() {
    const cx = this.screenWidth / 2
    const cy = this.screenHeight / 2

    this.drawBackground(cx, cy)
    this.drawHexLogo(cx, cy - 60)
    this.drawTitleText(cx, cy + 50)
    this.drawButton(cx, cy + 140)

    this.container.addChild(this.bgGradient)
    this.container.addChild(this.hexLogo)
    this.container.addChild(this.titleText)
    this.container.addChild(this.subtitleText)
    this.container.addChild(this.buttonContainer)

    this.app.stage.addChild(this.container)
  }

  private drawBackground(cx: number, cy: number) {
    const grad = new FillGradient({
      start: { x: cx, y: 0 },
      end: { x: cx, y: this.screenHeight },
      colorStops: [
        { offset: 0, color: 0x0a0e27 },
        { offset: 0.5, color: 0x0f1a3a },
        { offset: 1, color: 0x0a0e27 },
      ],
    })
    this.bgGradient.rect(0, 0, this.screenWidth, this.screenHeight)
    this.bgGradient.fill(grad)
  }

  private drawHexLogo(cx: number, cy: number) {
    this.hexLogo.x = cx
    this.hexLogo.y = cy
    this.hexLogo.alpha = 0
    this.hexLogo.scale.set(0.3)

    const hexR = 65

    this.hexGlow = new Graphics()
    this.hexGlow.circle(0, 0, hexR + 30)
    this.hexGlow.fill({ color: 0xFFD700, alpha: 0.06 })
    this.hexLogo.addChild(this.hexGlow)

    this.hexOuter = new Graphics()
    this.drawHexagon(this.hexOuter, hexR)
    this.hexOuter.stroke({ width: 2.5, color: 0xfbbf24, alpha: 0.8 })
    this.hexLogo.addChild(this.hexOuter)

    this.hexInner = new Graphics()
    this.drawHexagon(this.hexInner, hexR - 12)
    this.hexInner.fill({ color: 0xfbbf24, alpha: 0.06 })
    this.hexInner.stroke({ width: 1, color: 0xfbbf24, alpha: 0.4 })
    this.hexLogo.addChild(this.hexInner)

    const hStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 52,
      fontWeight: 'bold',
      fill: 0xfbbf24,
      dropShadow: {
        color: 0xfbbf24,
        blur: 12,
        distance: 0,
        alpha: 0.4,
      },
    })
    this.letterH = new Text({ text: 'H', style: hStyle })
    this.letterH.anchor.set(0.5)
    this.letterH.y = -8
    this.hexLogo.addChild(this.letterH)

    const learnStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 14,
      fontWeight: '600',
      fill: 0xfbbf24,
      letterSpacing: 6,
    })
    this.letterLearn = new Text({ text: 'LEARN', style: learnStyle })
    this.letterLearn.anchor.set(0.5)
    this.letterLearn.y = 28
    this.hexLogo.addChild(this.letterLearn)
  }

  private drawHexagon(g: Graphics, radius: number) {
    const points: number[] = []
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2
      points.push(Math.cos(angle) * radius, Math.sin(angle) * radius)
    }
    g.poly(points, true)
  }

  private drawTitleText(cx: number, cy: number) {
    const titleStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 48,
      fontWeight: 'bold',
      fill: 0xfbbf24,
      letterSpacing: 4,
      dropShadow: {
        color: 0x000000,
        blur: 8,
        distance: 2,
        alpha: 0.5,
      },
    })
    this.titleText = new Text({ text: 'HiveLearn', style: titleStyle })
    this.titleText.anchor.set(0.5)
    this.titleText.x = cx
    this.titleText.y = cy
    this.titleText.alpha = 0

    const subStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fill: 0x888888,
      letterSpacing: 2,
    })
    this.subtitleText = new Text({
      text: 'Aprende con el enjambre',
      style: subStyle,
    })
    this.subtitleText.anchor.set(0.5)
    this.subtitleText.x = cx
    this.subtitleText.y = cy + 32
    this.subtitleText.alpha = 0
  }

  private drawButton(cx: number, cy: number) {
    this.buttonContainer.x = cx
    this.buttonContainer.y = cy
    this.buttonContainer.alpha = 0
    this.buttonContainer.eventMode = 'static'
    this.buttonContainer.cursor = 'pointer'

    const btnW = 200
    const btnH = 50

    this.buttonBg = new Graphics()
    this.drawButtonShape(this.buttonBg, btnW, btnH, 0xfbbf24, 0.15, 0xfbbf24, 0.5)
    this.buttonContainer.addChild(this.buttonBg)

    this.buttonBgHover = new Graphics()
    this.drawButtonShape(this.buttonBgHover, btnW, btnH, 0xfbbf24, 0.3, 0xfbbf24, 0.9)
    this.buttonBgHover.alpha = 0
    this.buttonContainer.addChild(this.buttonBgHover)

    const btnStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 20,
      fontWeight: 'bold',
      fill: 0xfbbf24,
    })
    this.buttonText = new Text({ text: 'Ingresar', style: btnStyle })
    this.buttonText.anchor.set(0.5)
    this.buttonContainer.addChild(this.buttonText)

    this.buttonContainer.on('pointerover', () => {
      this.isHovering = true
    })
    this.buttonContainer.on('pointerout', () => {
      this.isHovering = false
    })
    this.buttonContainer.on('pointertap', () => {
      this.triggerEnter()
    })

    this.buttonContainer.hitArea = {
      contains(x: number, y: number) {
        return x >= -btnW / 2 && x <= btnW / 2 && y >= -btnH / 2 && y <= btnH / 2
      },
    }
  }

  private drawButtonShape(g: Graphics, w: number, h: number, fillColor: number, fillAlpha: number, strokeColor: number, strokeAlpha: number) {
    const r = 14
    g.roundRect(-w / 2, -h / 2, w, h, r)
    g.fill({ color: fillColor, alpha: fillAlpha })
    g.stroke({ width: 2, color: strokeColor, alpha: strokeAlpha })
  }

  private triggerEnter() {
    if (this.isFadingOut) return
    this.isFadingOut = true
    setTimeout(() => {
      if (this.onEnter) this.onEnter()
    }, 800)
  }

  private spawnBees(count: number) {
    for (let i = 0; i < count; i++) {
      const bee = this.createBee(i)
      this.bees.push(bee)
      this.container.addChild(bee.container)
    }
  }

  private createBee(index: number): TitleBee {
    const container = new Container()
    const margin = 200
    container.x = margin + Math.random() * (this.screenWidth - margin * 2)
    container.y = 80 + Math.random() * (this.screenHeight - 160)
    container.alpha = 0.3 + Math.random() * 0.4
    container.scale.set(0.6 + Math.random() * 0.5)

    const glow = new Graphics()
    glow.circle(0, 0, 18)
    glow.fill({ color: 0xFFD700, alpha: 0.1 })
    container.addChild(glow)

    const wings = new Graphics()
    container.addChild(wings)

    const body = new Graphics()
    this.drawBeeBody(body)
    container.addChild(body)

    const speed = 0.3 + Math.random() * 0.6
    const direction = Math.random() > 0.5 ? 1 : -1

    return {
      container,
      body,
      wings,
      glow,
      vx: direction * speed,
      vy: 0,
      baseY: container.y,
      phase: Math.random() * Math.PI * 2,
      speed,
      amplitude: 15 + Math.random() * 25,
    }
  }

  private drawBeeBody(body: Graphics) {
    body.ellipse(0, 2, 5, 7).fill(0xFFC107)
    for (let i = -2; i <= 2; i += 2) {
      body.rect(-5, i, 10, 2).fill(0x1a1a2e)
    }
    body.circle(0, -7, 4).fill(0xFFC107)
    body.circle(0, -13, 3).fill(0x1a1a2e)
    body.circle(-2, -14, 1.5).fill(0xffffff)
    body.circle(2, -14, 1.5).fill(0xffffff)
    body.moveTo(-1, -15).lineTo(-4, -20).stroke({ width: 1, color: 0x1a1a2e })
    body.circle(-4, -20, 1.5).fill(0xFFC107)
    body.moveTo(1, -15).lineTo(4, -20).stroke({ width: 1, color: 0x1a1a2e })
    body.circle(4, -20, 1.5).fill(0xFFC107)
  }

  private spawnSparkles(count: number) {
    for (let i = 0; i < count; i++) {
      const sparkle = this.createSparkle()
      this.sparkles.push(sparkle)
      this.container.addChild(sparkle.graphic)
    }
  }

  private createSparkle(): Sparkle {
    const g = new Graphics()
    const size = 1 + Math.random() * 2.5
    g.circle(0, 0, size)
    g.fill({ color: 0xfbbf24, alpha: 0.6 })
    g.x = Math.random() * this.screenWidth
    g.y = Math.random() * this.screenHeight

    const life = 3000 + Math.random() * 4000
    return {
      graphic: g,
      x: g.x,
      y: g.y,
      vy: -0.1 - Math.random() * 0.3,
      alpha: Math.random(),
      life: Math.random() * life,
      maxLife: life,
      size,
    }
  }

  private startAnimation() {
    this.startTime = performance.now()

    this.tickerCallback = (ticker: any) => {
      if (this.destroyed) return
      const time = performance.now()
      const elapsed = time - this.startTime
      const dt = ticker.deltaMS

      this.updateIntroAnimation(elapsed)
      this.updateBees(time, dt)
      this.updateSparkles(dt)
      this.updateHexGlow(time)
      this.updateButtonHover(time)

      if (this.isFadingOut) {
        this.fadeAlpha -= dt * 0.0015
        if (this.fadeAlpha < 0) this.fadeAlpha = 0
        this.container.alpha = this.fadeAlpha
      }
    }

    this.app.ticker.add(this.tickerCallback)
  }

  private updateIntroAnimation(elapsed: number) {
    const logoDelay = 300
    const titleDelay = 700
    const subtitleDelay = 900
    const buttonDelay = 1100
    const introSpeed = 3

    if (elapsed > logoDelay) {
      const t = Math.min(1, (elapsed - logoDelay) / (600 / introSpeed))
      const eased = 1 - Math.pow(1 - t, 3)
      this.hexLogo.alpha = eased
      this.hexLogo.scale.set(0.3 + 0.7 * eased)
    }

    if (elapsed > titleDelay) {
      const t = Math.min(1, (elapsed - titleDelay) / (500 / introSpeed))
      const eased = 1 - Math.pow(1 - t, 3)
      this.titleText.alpha = eased
      this.titleText.y += (0 - this.titleText.y) * 0.08
    }

    if (elapsed > subtitleDelay) {
      const t = Math.min(1, (elapsed - subtitleDelay) / (500 / introSpeed))
      this.subtitleText.alpha = t * 0.7
    }

    if (elapsed > buttonDelay) {
      const t = Math.min(1, (elapsed - buttonDelay) / (500 / introSpeed))
      this.buttonContainer.alpha = t
    }
  }

  private updateBees(time: number, dt: number) {
    for (const bee of this.bees) {
      bee.container.x += bee.vx * dt * 0.06
      bee.phase += bee.speed * dt * 0.003
      bee.container.y = bee.baseY + Math.sin(bee.phase) * bee.amplitude

      if (bee.vx > 0 && bee.container.x > this.screenWidth + 60) {
        bee.container.x = -60
        bee.baseY = 80 + Math.random() * (this.screenHeight - 160)
      } else if (bee.vx < 0 && bee.container.x < -60) {
        bee.container.x = this.screenWidth + 60
        bee.baseY = 80 + Math.random() * (this.screenHeight - 160)
      }

      bee.container.scale.x = bee.vx > 0 ? Math.abs(bee.container.scale.x) : -Math.abs(bee.container.scale.x)

      const wingOffset = Math.sin(time / 40) * 6
      bee.wings.clear()
      bee.wings.moveTo(-4, -6)
      bee.wings.bezierCurveTo(-14, -12 + wingOffset * 0.3, -16, -2 + wingOffset * 0.3, -6, -4)
      bee.wings.fill({ color: 0xE3F2FD, alpha: 0.4 })
      bee.wings.moveTo(4, -6)
      bee.wings.bezierCurveTo(14, -12 + wingOffset * 0.3, 16, -2 + wingOffset * 0.3, 6, -4)
      bee.wings.fill({ color: 0xE3F2FD, alpha: 0.4 })

      const glowAlpha = 0.06 + Math.sin(time / 500 + bee.phase) * 0.03
      bee.glow.alpha = glowAlpha
    }
  }

  private updateSparkles(dt: number) {
    for (const s of this.sparkles) {
      s.life += dt
      s.y += s.vy * dt
      s.graphic.x = s.x
      s.graphic.y = s.y

      const lifeRatio = s.life / s.maxLife
      const fadeAlpha = lifeRatio < 0.2
        ? lifeRatio / 0.2
        : lifeRatio > 0.8
          ? (1 - lifeRatio) / 0.2
          : 1

      s.graphic.alpha = fadeAlpha * 0.5

      if (s.life >= s.maxLife) {
        s.life = 0
        s.x = Math.random() * this.screenWidth
        s.y = this.screenHeight + 10
        s.vy = -0.1 - Math.random() * 0.3
      }
    }
  }

  private updateHexGlow(time: number) {
    const pulse = 0.06 + Math.sin(time / 800) * 0.03
    this.hexGlow.alpha = pulse

    const scalePulse = 1 + Math.sin(time / 1200) * 0.02
    this.hexGlow.scale.set(scalePulse)
  }

  private updateButtonHover(time: number) {
    const target = this.isHovering ? 1 : 0
    this.buttonBgHover.alpha += (target - this.buttonBgHover.alpha) * 0.12

    if (this.isHovering) {
      const pulse = 1 + Math.sin(time / 300) * 0.03
      this.buttonContainer.scale.set(pulse)
    } else {
      this.buttonContainer.scale.set(1)
    }
  }

  destroy() {
    this.destroyed = true
    if (this.tickerCallback) {
      this.app.ticker.remove(this.tickerCallback)
    }
    for (const bee of this.bees) {
      bee.container.destroy({ children: true })
    }
    for (const sparkle of this.sparkles) {
      sparkle.graphic.destroy()
    }
    this.container.destroy({ children: true })
  }
}
