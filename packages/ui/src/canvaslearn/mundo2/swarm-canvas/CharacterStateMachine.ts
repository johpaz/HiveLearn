import { AGENT_SPEECH, AGENT_DESKS, AGENT_COLORS, WALK_SPEED, COORDINATOR_CHAR_X, COORDINATOR_CHAR_Y } from './constants'
import { bfs, moveToward } from './Pathfinding'
import type { CanvasState, CharSprite, CharState, Bubble, Particle } from './types'

export function initChars(): { chars: CharSprite[]; coordinator: CharSprite } {
  const chars: CharSprite[] = AGENT_DESKS.map(d => ({
    agentId: d.agentId,
    label: '',
    icon: '',
    x: d.charX,
    y: d.charY,
    targetX: d.charX,
    targetY: d.charY,
    deskX: d.deskX,
    deskY: d.deskY,
    state: 'idle' as CharState,
    color: AGENT_COLORS[d.agentId] ?? '#64748b',
    stateTimer: 0,
    animFrame: 0,
    shakeX: 0,
    tintFlash: 0,
  }))

  const coordinator: CharSprite = {
    agentId: 'hl-coordinator-agent',
    label: 'Coordinador',
    icon: '🐝',
    x: COORDINATOR_CHAR_X,
    y: COORDINATOR_CHAR_Y,
    targetX: COORDINATOR_CHAR_X,
    targetY: COORDINATOR_CHAR_Y,
    deskX: 0,
    deskY: 0,
    state: 'idle',
    color: '#fbbf24',
    stateTimer: 0,
    animFrame: 0,
    shakeX: 0,
    tintFlash: 0,
  }

  return { chars, coordinator }
}

export function setCharState(chars: CharSprite[], agentId: string, newState: CharState): Bubble | null {
  const ch = chars.find(c => c.agentId === agentId)
  if (!ch || ch.state === newState) return null

  const prevState = ch.state
  ch.state = newState
  ch.stateTimer = 0
  ch.tintFlash = 1

  if (newState === 'running') {
    ch.targetX = ch.deskX + 8
    ch.targetY = ch.deskY - TILE + 4
    const path = bfs({ x: ch.x, y: ch.y }, { x: ch.targetX, y: ch.targetY })
    ch._path = path
    ch._pathIdx = 0
  }

  if (newState === 'completed' && prevState === 'running') {
    ch.targetX = ch.deskX + 8
    ch.targetY = ch.deskY - TILE + 4
  }

  if (newState === 'failed') {
    ch.shakeX = 0
  }

  let bubble: Bubble | null = null
  const speech = AGENT_SPEECH[agentId]
  if (speech && speech[newState]) {
    bubble = {
      agentId,
      text: speech[newState],
      alpha: 0,
      timer: 0,
      fadingIn: true,
      fadingOut: false,
    }
  }

  return bubble
}

const TILE = 16

export function updateChars(state: CanvasState, dt: number) {
  for (const ch of state.chars) {
    ch.stateTimer += dt
    ch.animFrame += dt * 0.06
    if (ch.tintFlash > 0) ch.tintFlash = Math.max(0, ch.tintFlash - dt * 0.003)

    if (ch.state === 'idle') {
      ch.y = ch.deskY - TILE + 4 + Math.sin(ch.animFrame * 0.02) * 1.5
    }

    if (ch.state === 'running') {
      if (ch._path && ch._pathIdx != null && ch._pathIdx < ch._path.length) {
        const wp = ch._path[ch._pathIdx]
        const result = moveToward(ch.x, ch.y, wp.x, wp.y, WALK_SPEED)
        ch.x = result.x
        ch.y = result.y
        if (result.arrived) ch._pathIdx++
      }
    }

    if (ch.state === 'failed') {
      ch.shakeX = Math.sin(ch.stateTimer * 0.03) * 4
    } else {
      ch.shakeX = 0
    }

    if (ch.state === 'completed') {
      ch.shakeX = 0
    }
  }

  // Coordinator
  const coord = state.coordinator
  coord.animFrame += dt * 0.06
  if (coord.tintFlash > 0) coord.tintFlash = Math.max(0, coord.tintFlash - dt * 0.003)

  if (state.coordinatorWalkingTo) {
    const target = state.chars.find(c => c.agentId === state.coordinatorWalkingTo)
    if (target) {
      const result = moveToward(coord.x, coord.y, target.x, target.y, WALK_SPEED)
      coord.x = result.x
      coord.y = result.y
      if (result.arrived) {
        state.coordinatorWalkingTo = null
      }
    }
  } else {
    const result = moveToward(coord.x, coord.y, state.coordinatorReturnX, state.coordinatorReturnY, WALK_SPEED)
    coord.x = result.x
    coord.y = result.y
  }
}

export function updateBubbles(bubbles: Bubble[], dt: number): Bubble[] {
  return bubbles.filter(b => {
    b.timer += dt
    if (b.fadingIn) {
      b.alpha = Math.min(1, b.alpha + dt * 0.005)
      if (b.alpha >= 1) b.fadingIn = false
    }
    if (b.timer > 3000 && !b.fadingOut) {
      b.fadingOut = true
    }
    if (b.fadingOut) {
      b.alpha = Math.max(0, b.alpha - dt * 0.004)
      if (b.alpha <= 0) return false
    }
    return true
  })
}

export function spawnCompletionParticles(chars: CharSprite[], agentId: string): Particle[] {
  const ch = chars.find(c => c.agentId === agentId)
  if (!ch) return []
  const particles: Particle[] = []
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    particles.push({
      x: ch.x,
      y: ch.y - 10,
      vx: Math.cos(angle) * 1.5,
      vy: Math.sin(angle) * 1.5 - 2,
      life: 500,
      maxLife: 500,
      color: '#22c55e',
      size: 3,
      gravity: 0.01,
    })
  }
  return particles
}

export function spawnFailParticles(chars: CharSprite[], agentId: string): Particle[] {
  const ch = chars.find(c => c.agentId === agentId)
  if (!ch) return []
  const particles: Particle[] = []
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: ch.x + (i - 1.5) * 4,
      y: ch.y - 14,
      vx: (i - 1.5) * 0.5,
      vy: -0.8,
      life: 400,
      maxLife: 400,
      color: '#ef4444',
      size: 3,
      gravity: 0.005,
    })
  }
  return particles
}

export function updateParticles(particles: Particle[], dt: number): Particle[] {
  return particles.filter(p => {
    p.life -= dt
    if (p.life <= 0) return false
    p.x += p.vx * dt * 0.06
    p.y += p.vy * dt * 0.06
    p.vy += p.gravity * dt * 0.06
    return true
  })
}

export function initDust(): import('./types').DustMote[] {
  const dust: import('./types').DustMote[] = []
  for (let i = 0; i < 10; i++) {
    dust.push({
      x: Math.random() * 640,
      y: Math.random() * 400,
      vx: (Math.random() - 0.5) * 0.1,
      vy: -0.05 - Math.random() * 0.05,
      alpha: 0.03 + Math.random() * 0.04,
      size: 1 + Math.random(),
    })
  }
  return dust
}

export function updateDust(dust: import('./types').DustMote[], dt: number) {
  for (const d of dust) {
    d.x += d.vx * dt * 0.06
    d.y += d.vy * dt * 0.06
    if (d.y < 0) d.y = 400
    if (d.x < 0) d.x = 640
    if (d.x > 640) d.x = 0
  }
}
