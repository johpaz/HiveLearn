/**
 * GamificationOverlay - Sistema de gamificación visible
 * 
 * Muestra XP, niveles, badges y logros sobre los robots
 * Totalmente procedural con Graphics de PixiJS
 */
import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { GAMIFICATION_CONFIG, AGENT_LABELS } from './constants'
import type { TweenConfig } from './Tween'

export interface LevelInfo {
  level: number
  xp: number
  xpToNext: number
  badge: string
  name: string
  color: number
}

export interface Achievement {
  id: string
  name: string
  desc: string
  xp: number
  unlocked: boolean
  unlockedAt?: number
}

export interface RobotGamification {
  agentId: string
  xp: number
  level: number
  achievements: Achievement[]
  streak: number
  tasksCompleted: number
  tasksFailed: number
}

/**
 * Clase para mostrar barra de XP y nivel
 */
export class XPBar extends Container {
  private bg: Graphics
  private fill: Graphics
  private levelText: Text
  private xpText: Text
  private badgeIcon: Text
  
  private currentXP = 0
  private maxXP = 100
  private level = 1
  
  constructor(agentId: string) {
    super()
    
    const agentInfo = AGENT_LABELS[agentId] || { label: '', emoji: '🤖' }
    
    // Fondo
    this.bg = new Graphics()
    this.addChild(this.bg)
    
    // Fill
    this.fill = new Graphics()
    this.addChild(this.fill)
    
    // Badge/emoji
    this.badgeIcon = new Text({
      text: agentInfo.emoji,
      style: new TextStyle({
        fontSize: 12,
      }),
      anchor: 0.5,
    })
    this.badgeIcon.x = -40
    this.addChild(this.badgeIcon)
    
    // Nivel
    this.levelText = new Text({
      text: 'Lv.1',
      style: new TextStyle({
        fontSize: 10,
        fontFamily: 'monospace',
        fill: 0xffffff,
        fontWeight: 'bold',
      }),
      anchor: { x: 0, y: 0.5 },
    })
    this.levelText.x = -25
    this.levelText.y = -6
    this.addChild(this.levelText)
    
    // XP texto
    this.xpText = new Text({
      text: '0/100',
      style: new TextStyle({
        fontSize: 8,
        fontFamily: 'monospace',
        fill: 0x8888aa,
      }),
      anchor: { x: 1, y: 0.5 },
    })
    this.xpText.x = 35
    this.xpText.y = 0
    this.addChild(this.xpText)
    
    this.draw()
  }
  
  setXP(xp: number, level: number): void {
    this.currentXP = xp
    this.level = level
    
    const levelInfo = GAMIFICATION_CONFIG.levels.find(l => l.level === level)
    const nextLevelInfo = GAMIFICATION_CONFIG.levels.find(l => l.level === level + 1)
    
    const prevLevelXP = levelInfo?.xp || 0
    const nextLevelXP = nextLevelInfo?.xp || prevLevelXP + 100
    this.maxXP = nextLevelXP - prevLevelXP
    const progress = (xp - prevLevelXP) / this.maxXP
    
    this.levelText.text = `Lv.${level}`
    this.xpText.text = `${xp}/${nextLevelInfo?.xp || '∞'}`
    
    this.draw(progress, levelInfo?.color || 0x888888)
  }
  
  private draw(progress: number = 0, color: number = 0xfbbf24): void {
    // Fondo
    this.bg.clear()
    this.bg.roundRect(-30, -4, 60, 8, 4)
    this.bg.fill({ color: 0x1a1a2e, alpha: 0.9 })
    this.bg.stroke({ color: 0x3a3a5e, width: 1 })
    
    // Fill
    this.fill.clear()
    const fillWidth = Math.max(0, Math.min(56, 56 * progress))
    this.fill.roundRect(-28, -2, fillWidth, 4, 2)
    this.fill.fill({ color, alpha: 0.9 })
  }
  
  animateLevelUp(): void {
    // Animación simple de escala
    const originalScale = this.scale.x
    let scale = 1.2
    let dir = -1
    let frames = 0
    
    const animate = () => {
      if (frames < 10) {
        this.scale.set(scale)
        scale += dir * 0.05
        frames++
        requestAnimationFrame(animate)
      } else {
        this.scale.set(originalScale)
      }
    }
    
    animate()
  }
}

/**
 * Clase para mostrar notificación de logro
 */
export class AchievementNotification extends Container {
  private bg: Graphics
  private icon: Text
  private title: Text
  private desc: Text
  private xpBadge: Text
  
  private visibleTime = 0
  private fadeOut = false
  
  constructor() {
    super()
    
    // Fondo
    this.bg = new Graphics()
    this.addChild(this.bg)
    
    // Icono
    this.icon = new Text({
      text: '🏆',
      style: new TextStyle({
        fontSize: 24,
      }),
      anchor: 0.5,
    })
    this.icon.x = -50
    this.addChild(this.icon)
    
    // Título
    this.title = new Text({
      text: '¡Logro Desbloqueado!',
      style: new TextStyle({
        fontSize: 11,
        fontFamily: 'monospace',
        fill: 0xfbbf24,
        fontWeight: 'bold',
      }),
      anchor: { x: 0, y: 0 },
    })
    this.title.x = -30
    this.title.y = -10
    this.addChild(this.title)
    
    // Descripción
    this.desc = new Text({
      text: 'Nombre del logro',
      style: new TextStyle({
        fontSize: 9,
        fontFamily: 'monospace',
        fill: 0xffffff,
      }),
      anchor: { x: 0, y: 0.5 },
    })
    this.desc.x = -30
    this.desc.y = 5
    this.addChild(this.desc)
    
    // XP badge
    this.xpBadge = new Text({
      text: '+50 XP',
      style: new TextStyle({
        fontSize: 10,
        fontFamily: 'monospace',
        fill: 0xfbbf24,
        fontWeight: 'bold',
      }),
      anchor: { x: 1, y: 0.5 },
    })
    this.xpBadge.x = 60
    this.xpBadge.y = 0
    this.addChild(this.xpBadge)
    
    this.draw()
    this.alpha = 0
  }
  
  show(achievement: Achievement): void {
    this.title.text = '¡Logro Desbloqueado!'
    this.desc.text = achievement.name
    this.xpBadge.text = `+${achievement.xp} XP`
    
    this.alpha = 0
    this.visibleTime = 0
    this.fadeOut = false
    
    // Fade in
    const fadeIn = () => {
      if (this.alpha < 1) {
        this.alpha += 0.1
        requestAnimationFrame(fadeIn)
      }
    }
    fadeIn()
  }
  
  update(delta: number): boolean {
    const dt = delta / 1000
    
    if (!this.fadeOut) {
      this.visibleTime += dt
      if (this.visibleTime >= 2.5) {
        this.fadeOut = true
      }
    } else {
      this.alpha -= dt * 2
      if (this.alpha <= 0) {
        this.alpha = 0
        return true // Completado
      }
    }
    
    return false
  }
  
  private draw(): void {
    this.bg.clear()
    this.bg.roundRect(-70, -20, 140, 40, 8)
    this.bg.fill({ color: 0x1a1a2e, alpha: 0.95 })
    this.bg.stroke({ color: 0xfbbf24, width: 2, alpha: 0.5 })
  }
}

/**
 * Clase para mostrar popup de XP ganada
 */
export class XPPopup extends Container {
  private text: Text
  private particles: Graphics
  
  private visibleTime = 0
  private yOffset = 0
  
  constructor() {
    super()
    
    this.text = new Text({
      text: '+50 XP',
      style: new TextStyle({
        fontSize: 14,
        fontFamily: 'monospace',
        fill: 0xfbbf24,
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 3 },
      }),
      anchor: 0.5,
    })
    this.addChild(this.text)
    
    this.particles = new Graphics()
    this.addChild(this.particles)
    
    this.alpha = 0
  }
  
  show(xp: number): void {
    this.text.text = `+${xp} XP`
    this.alpha = 0
    this.yOffset = 0
    this.visibleTime = 0
    this.y = 0
    
    // Fade in
    const fadeIn = () => {
      if (this.alpha < 1) {
        this.alpha += 0.15
        requestAnimationFrame(fadeIn)
      }
    }
    fadeIn()
  }
  
  update(delta: number): boolean {
    const dt = delta / 1000
    this.visibleTime += dt
    
    // Mover hacia arriba
    this.yOffset += 30 * dt
    this.y = -this.yOffset
    
    // Rotar ligeramente
    this.rotation = Math.sin(this.visibleTime * 5) * 0.1
    
    if (this.visibleTime >= 1.5) {
      // Fade out
      this.alpha -= dt * 2
      if (this.alpha <= 0) {
        return true // Completado
      }
    }
    
    return false
  }
}

/**
 * Gestor de gamificación para un robot
 */
export class GamificationManager {
  private robotGamification: Map<string, RobotGamification> = new Map()
  private xpBars: Map<string, XPBar> = new Map()
  private achievementNotification: AchievementNotification | null = null
  private xpPopups: Map<string, XPPopup> = new Map()
  
  constructor() {
    this.achievementNotification = new AchievementNotification()
  }
  
  /**
   * Inicializar gamificación para un robot
   */
  initRobot(agentId: string): void {
    if (!this.robotGamification.has(agentId)) {
      this.robotGamification.set(agentId, {
        agentId,
        xp: 0,
        level: 1,
        achievements: [],
        streak: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
      })
    }
    
    if (!this.xpBars.has(agentId)) {
      this.xpBars.set(agentId, new XPBar(agentId))
    }
  }
  
  /**
   * Obtener barra de XP para un robot
   */
  getXPBar(agentId: string): XPBar | undefined {
    return this.xpBars.get(agentId)
  }
  
  /**
   * Añadir XP a un robot
   */
  addXP(agentId: string, xp: number): XPPopup | null {
    const data = this.robotGamification.get(agentId)
    if (!data) return null
    
    const oldLevel = data.level
    data.xp += xp
    data.tasksCompleted++
    
    // Verificar nivel
    const newLevel = this.calculateLevel(data.xp)
    if (newLevel.level > oldLevel) {
      data.level = newLevel.level
      this.onLevelUp(agentId, newLevel)
    }
    
    // Crear popup de XP
    const popup = new XPPopup()
    popup.show(xp)
    this.xpPopups.set(agentId, popup)
    
    // Actualizar barra
    const bar = this.xpBars.get(agentId)
    if (bar) {
      bar.setXP(data.xp, data.level)
    }
    
    return popup
  }
  
  /**
   * Restar XP (por fallo)
   */
  removeXP(agentId: string, xp: number): void {
    const data = this.robotGamification.get(agentId)
    if (!data) return
    
    data.xp = Math.max(0, data.xp - xp)
    data.tasksFailed++
    data.streak = 0
    
    const bar = this.xpBars.get(agentId)
    if (bar) {
      bar.setXP(data.xp, data.level)
    }
  }
  
  /**
   * Desbloquear logro
   */
  unlockAchievement(agentId: string, achievementId: string): void {
    const data = this.robotGamification.get(agentId)
    if (!data) return
    
    const achievement = GAMIFICATION_CONFIG.achievements[achievementId as keyof typeof GAMIFICATION_CONFIG.achievements]
    if (!achievement) return
    
    const existingAchievement = data.achievements.find(a => a.id === achievementId)
    if (existingAchievement && existingAchievement.unlocked) return
    
    // Añadir logro
    data.achievements.push({
      ...achievement,
      unlocked: true,
      unlockedAt: Date.now(),
    })
    
    // Añadir XP del logro
    data.xp += achievement.xp
    
    // Mostrar notificación
    if (this.achievementNotification) {
      this.achievementNotification.show({
        ...achievement,
        unlocked: true,
        unlockedAt: Date.now(),
      })
    }
    
    // Actualizar barra
    const bar = this.xpBars.get(agentId)
    if (bar) {
      bar.setXP(data.xp, data.level)
      bar.animateLevelUp()
    }
  }
  
  /**
   * Incrementar racha
   */
  incrementStreak(agentId: string): void {
    const data = this.robotGamification.get(agentId)
    if (!data) return
    
    data.streak++
    
    // Logro de racha
    if (data.streak >= 10) {
      this.unlockAchievement(agentId, 'perfectionist')
    }
  }
  
  /**
   * Calcular nivel basado en XP
   */
  private calculateLevel(xp: number): LevelInfo {
    const levels = GAMIFICATION_CONFIG.levels
    
    for (let i = levels.length - 1; i >= 0; i--) {
      if (xp >= levels[i].xp) {
        return {
          level: levels[i].level,
          xp,
          xpToNext: levels[i + 1]?.xp || xp + 100,
          badge: levels[i].badge,
          name: levels[i].name,
          color: levels[i].color,
        }
      }
    }
    
    return {
      level: 1,
      xp,
      xpToNext: levels[1]?.xp || 100,
      badge: levels[0].badge,
      name: levels[0].name,
      color: levels[0].color,
    }
  }
  
  /**
   * Callback de nivel up
   */
  private onLevelUp(agentId: string, levelInfo: LevelInfo): void {
    console.log(`🎉 ${agentId} subió al nivel ${levelInfo.level}!`)
    
    // Sonido de level up (si está implementado)
    // soundManager.play('levelUp')
  }
  
  /**
   * Actualizar notificaciones
   */
  update(delta: number): void {
    // Actualizar notificación de logro
    if (this.achievementNotification) {
      const completed = this.achievementNotification.update(delta)
      if (completed) {
        this.achievementNotification.alpha = 0
      }
    }
    
    // Actualizar popups de XP
    for (const [agentId, popup] of this.xpPopups.entries()) {
      const completed = popup.update(delta)
      if (completed) {
        this.xpPopups.delete(agentId)
      }
    }
  }
  
  /**
   * Obtener datos de gamificación de un robot
   */
  getRobotData(agentId: string): RobotGamification | undefined {
    return this.robotGamification.get(agentId)
  }
  
  /**
   * Obtener notificación de logro
   */
  getAchievementNotification(): AchievementNotification | null {
    return this.achievementNotification
  }
  
  /**
   * Obtener todos los popups de XP
   */
  getXPPopups(): Map<string, XPPopup> {
    return this.xpPopups
  }
  
  /**
   * Resetear gamificación
   */
  reset(): void {
    this.robotGamification.clear()
    this.xpBars.clear()
    this.xpPopups.clear()
    
    if (this.achievementNotification) {
      this.achievementNotification.alpha = 0
    }
  }
}

// Singleton exportado
export const gamificationManager = new GamificationManager()
