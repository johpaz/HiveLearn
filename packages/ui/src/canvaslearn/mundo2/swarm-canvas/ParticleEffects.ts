import type { Particle } from './types'

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife)
    ctx.fillStyle = p.color
    ctx.globalAlpha = alpha
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
  }
  ctx.globalAlpha = 1
}

export function spawnConfetti(): Particle[] {
  const particles: Particle[] = []
  const colors = ['#3b82f6', '#8b5cf6', '#22c55e', '#fbbf24', '#ec4899', '#06b6d4']
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: Math.random() * 640,
      y: -10 - Math.random() * 30,
      vx: (Math.random() - 0.5) * 2,
      vy: 1 + Math.random() * 1.5,
      life: 2000 + Math.random() * 1000,
      maxLife: 3000,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 3,
      gravity: 0.02,
    })
  }
  return particles
}

/**
 * Genera partículas cuando el coordinador delega una tarea a un worker.
 * Las partículas salen desde la posición del worker hacia afuera.
 */
export function spawnDelegationParticles(x: number, y: number, color: string): Particle[] {
  const particles: Particle[] = []
  const numParticles = 12

  for (let i = 0; i < numParticles; i++) {
    const angle = (i / numParticles) * Math.PI * 2
    const speed = 1 + Math.random() * 1.5
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 400 + Math.random() * 200,
      maxLife: 600,
      color: color,
      size: 2 + Math.random() * 2,
      gravity: 0,
    })
  }

  // Añadir partículas doradas del coordinador
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 0.5 + Math.random()
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 500 + Math.random() * 300,
      maxLife: 800,
      color: '#fbbf24',
      size: 3 + Math.random(),
      gravity: 0.01,
    })
  }

  return particles
}
