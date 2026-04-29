import { useEffect, useRef, useCallback } from 'react'
import { useLessonStore } from '../store/lessonStore'
import { useGamification } from '../hooks/useGamification'
import { W, H, FRAME_MS, COORDINATOR_CHAR_X, COORDINATOR_CHAR_Y } from './constants'
import { drawFloor, drawWalls, drawAllDesks, drawCharacter, drawCoordinator, drawNameLabel, drawDust, drawProgressBar, drawMensaje, drawDecorations, drawDelegationEffect } from './PixelRenderer'
import { drawBubbles } from './SpeechBubbles'
import { drawGamification } from './GamificationOverlay'
import { drawParticles, spawnConfetti, spawnDelegationParticles } from './ParticleEffects'
import { initChars, setCharState, updateChars, updateBubbles, spawnCompletionParticles, spawnFailParticles, updateParticles, initDust, updateDust } from './CharacterStateMachine'
import type { CanvasState, CharState } from './types'
import type { AgentStatus } from '@hivelearn/core'

const CANVAS_AGENT_MAP: Record<string, string> = {
  'hl-profile-agent': 'hl-profile-agent',
  'hl-intent-agent': 'hl-intent-agent',
  'hl-structure-agent': 'hl-structure-agent',
  'hl-explanation-agent': 'hl-explanation-agent',
  'hl-exercise-agent': 'hl-exercise-agent',
  'hl-quiz-agent': 'hl-quiz-agent',
  'hl-challenge-agent': 'hl-challenge-agent',
  'hl-code-agent': 'hl-code-agent',
  'hl-svg-agent': 'hl-svg-agent',
  'hl-gif-agent': 'hl-gif-agent',
  'hl-infographic-agent': 'hl-infographic-agent',
  'hl-image-agent': 'hl-image-agent',
  'hl-gamification-agent': 'hl-gamification-agent',
  'hl-evaluation-agent': 'hl-evaluation-agent',
  'hl-feedback-agent': 'hl-feedback-agent',
}

function toCharState(s: AgentStatus): CharState {
  if (s === 'running' || s === 'thinking' || s === 'tool_call') return 'running'
  if (s === 'completed') return 'completed'
  if (s === 'failed') return 'failed'
  if (s === 'pending') return 'pending'
  return 'idle'
}

export function SwarmCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<CanvasState | null>(null)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef(0)
  const prevStatusRef = useRef<Record<string, CharState>>({})
  const prevAgentStatusRef = useRef<Record<string, AgentStatus>>({})

  const gam = useGamification()

  const initState = useCallback((): CanvasState => {

    const { chars, coordinator } = initChars()
    return {
      chars,
      coordinator,
      bubbles: [],
      particles: [],
      dust: initDust(),
      progress: 0,
      mensaje: '',
      vidas: 3,
      racha: 0,
      xpTotal: 0,
      porcentajeNivel: 0,
      nivelActual: 'Aprendiz',
      swarmDone: false,
      celebrateTimer: 0,
      coordinatorWalkingTo: null,
      coordinatorReturnX: COORDINATOR_CHAR_X,
      coordinatorReturnY: COORDINATOR_CHAR_Y,
      delegationEffects: [],
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false

    const state = initState()
    stateRef.current = state
    prevStatusRef.current = {}
    prevAgentStatusRef.current = {}

    const unsub = useLessonStore.subscribe((s) => {
      if (!stateRef.current) return
      const st = stateRef.current
      st.vidas = s.vidas
      st.racha = s.racha
      st.xpTotal = s.xpTotal

      const prog = s.swarmProgress
      if (prog) {
        st.progress = prog.porcentaje
        st.mensaje = prog.mensaje
      }
    })

    const pollGamification = setInterval(() => {
      if (!stateRef.current) return
      stateRef.current.xpTotal = gam.xpTotal
      stateRef.current.nivelActual = gam.nivelActual
      stateRef.current.porcentajeNivel = gam.porcentajeNivel()
      const s = useLessonStore.getState()
      stateRef.current.vidas = s.vidas
      stateRef.current.racha = s.racha
    }, 500)


    const gameLoop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const elapsed = timestamp - lastTimeRef.current

      if (elapsed >= FRAME_MS) {
        const dt = elapsed
        lastTimeRef.current = timestamp - (elapsed % FRAME_MS)

        const agentStatuses = useLessonStore.getState().agentStatuses
        for (const [agentId, canvasAgentId] of Object.entries(CANVAS_AGENT_MAP)) {
          const storeStatus = agentStatuses[agentId]
          const charState = storeStatus ? toCharState(storeStatus) : 'idle'
          const prev = prevStatusRef.current[agentId]
          const prevStoreStatus = prevAgentStatusRef.current[agentId]

          // Detectar cuando un agente comienza a trabajar (delegación)
          if (storeStatus === 'running' && prevStoreStatus !== 'running') {
            const targetChar = state.chars.find(c => c.agentId === canvasAgentId)
            if (targetChar) {
              // Crear efecto de delegación
              state.delegationEffects = state.delegationEffects || []
              state.delegationEffects.push({
                targetX: targetChar.x,
                targetY: targetChar.y,
                progress: 0,
                alpha: 1,
                agentId: canvasAgentId,
              })
              // El coordinador camina hacia el agente
              state.coordinatorWalkingTo = canvasAgentId
              // Partículas de delegación
              state.particles.push(...spawnDelegationParticles(targetChar.x, targetChar.y, targetChar.color))
            }
          }

          if (prev !== charState) {
            const bubble = setCharState(state.chars, canvasAgentId, charState)
            if (bubble) {
              state.bubbles = [bubble]
            }
            if (charState === 'completed') {
              state.particles.push(...spawnCompletionParticles(state.chars, canvasAgentId))
            }
            if (charState === 'failed') {
              state.particles.push(...spawnFailParticles(state.chars, canvasAgentId))
              if (!state.coordinatorWalkingTo) {
                state.coordinatorWalkingTo = canvasAgentId
              }
            }
            prevStatusRef.current[agentId] = charState
          }
          
          prevAgentStatusRef.current[agentId] = storeStatus || 'idle'
        }

        const swarmProgress = useLessonStore.getState().swarmProgress
        if (swarmProgress) {
          state.progress = swarmProgress.porcentaje
          state.mensaje = swarmProgress.mensaje
        }

        if (state.progress >= 100 && !state.swarmDone) {
          state.swarmDone = true
          state.celebrateTimer = 1500
          state.particles.push(...spawnConfetti())
        }

        if (state.celebrateTimer > 0) {
          state.celebrateTimer -= dt
          if (state.celebrateTimer <= 0) {
            const currentScreen = useLessonStore.getState().screen
            if (currentScreen === 'loading') {
              useLessonStore.getState().setScreen('lesson')
            }
          }
        }

        // Actualizar efectos de delegación
        if (state.delegationEffects) {
          state.delegationEffects = state.delegationEffects.filter(effect => {
            effect.progress += dt * 0.002
            effect.alpha = Math.max(0, 1 - effect.progress)
            return effect.alpha > 0
          })
        }

        updateChars(state, dt)
        state.bubbles = updateBubbles(state.bubbles, dt)
        state.particles = updateParticles(state.particles, dt)
        updateDust(state.dust, dt)

        render(ctx, state)
      }

      rafRef.current = requestAnimationFrame(gameLoop)
    }

    rafRef.current = requestAnimationFrame(gameLoop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      unsub()
      clearInterval(pollGamification)
    }
  }, [initState])

  return (
    <div className="absolute inset-0 bg-background flex items-center justify-center overflow-hidden">

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{
          imageRendering: 'pixelated',
          width: '100%',
          maxWidth: `${W * 2}px`,
          height: 'auto',
          aspectRatio: `${W} / ${H}`,
        }}
      />
    </div>
  )
}

function render(ctx: CanvasRenderingContext2D, state: CanvasState) {
  ctx.clearRect(0, 0, W, H)

  drawFloor(ctx)
  drawWalls(ctx)
  drawDecorations(ctx)
  drawAllDesks(ctx, state)
  drawDust(ctx, state.dust)

  // Dibujar efectos de delegación
  if (state.delegationEffects) {
    for (const effect of state.delegationEffects) {
      drawDelegationEffect(ctx, effect.targetX, effect.targetY, effect.progress, effect.alpha)
    }
  }

  for (const ch of state.chars) {
    drawCharacter(ctx, ch)
    drawNameLabel(ctx, ch)
  }

  drawCoordinator(ctx, state.coordinator)

  drawBubbles(ctx, state.bubbles, state.chars)
  drawParticles(ctx, state.particles)
  drawGamification(ctx, state)
  drawProgressBar(ctx, state.progress)
  drawMensaje(ctx, state.mensaje)
}
