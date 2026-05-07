import { useRioMundoStore } from '@/store/rioMundoStore'
import type { RioBee } from '../bee/RioBee'
import type { RioDialog } from '../dialog/RioDialog'
import type { RioSwarmBees } from '../bee/RioSwarmBees'

const TOUR_AGENTS = [
  { id: 'hl-profile-agent', name: 'Perfil', description: 'Analizo tus datos para adaptar el contenido a tu estilo de aprendizaje.' },
  { id: 'hl-intent-agent', name: 'Intención', description: 'Detecto qué quieres aprender y cuál es tu nivel actual.' },
  { id: 'hl-structure-agent', name: 'Estructura', description: 'Diseño el camino de aprendizaje con zonas y niveles.' },
  { id: 'hl-explanation-agent', name: 'Explicación', description: 'Preparo explicaciones claras y personalizadas para ti.' },
  { id: 'hl-exercise-agent', name: 'Ejercicios', description: 'Creo prácticas para que refuerces lo aprendido.' },
  { id: 'hl-quiz-agent', name: 'Quiz', description: 'Diseño preguntas para evaluar tu progreso.' },
  { id: 'hl-challenge-agent', name: 'Desafío', description: 'Preparo retos que pondrán a prueba tus habilidades.' },
  { id: 'hl-gamification-agent', name: 'Gamificación', description: 'Asigno los puntos XP, logros y niveles de tu progreso.' },
  { id: 'hl-feedback-agent', name: 'Feedback', description: 'Te doy retroalimentación para que sigas mejorando.' },
]

// Max time to wait for a single agent to complete
const AGENT_TIMEOUT_MS = 60000

export class RioSwarmTourController {
  private beeRef: RioBee | null = null
  private dialogRef: RioDialog | null = null
  private swarmBeesRef: RioSwarmBees | null = null
  private speakFn: ((text: string) => Promise<void>) | null = null
  private currentStep: number = 0
  private isRunning: boolean = false
  private skipped: boolean = false
  private structureCtx: string = ''

  private nextResolve: (() => void) | null = null
  private onShowNextButtonFn: ((show: boolean) => void) | null = null

  setRefs(beeRef: RioBee, dialogRef: RioDialog, swarmBeesRef: RioSwarmBees) {
    this.beeRef = beeRef
    this.dialogRef = dialogRef
    this.swarmBeesRef = swarmBeesRef
  }

  setSpeakFunction(fn: (text: string) => Promise<void>) {
    this.speakFn = fn
  }

  setOnShowNextButton(fn: (show: boolean) => void) {
    this.onShowNextButtonFn = fn
  }

  requestNext() {
    if (this.nextResolve) {
      this.nextResolve()
      this.nextResolve = null
    }
  }

  async start() {
    if (this.isRunning) return
    this.isRunning = true
    this.currentStep = 0
    this.skipped = false
    this.structureCtx = ''

    const store = useRioMundoStore.getState()
    store.iniciarTour()

    const intro = '¡Bienvenido al Enjambre! Te voy a presentar a cada agente que creará tu programa de aprendizaje. ¡Sígueme!'
    this.showCoordinatorMessage(intro)
    if (this.speakFn) await this.speakFn(intro)

    await this.wait(2000)

    await this.visitNextAgent()
  }

  skip() {
    this.skipped = true
    const store = useRioMundoStore.getState()
    store.skipTour()
    this.isRunning = false

    if (this.nextResolve) {
      this.nextResolve()
      this.nextResolve = null
    }
    this.onShowNextButtonFn?.(false)

    if (this.beeRef) {
      this.beeRef.cancelFlyTo()
    }
  }

  // Waits for the user to click "Siguiente" — no auto-advance.
  // Safety timeout (60s) only to prevent the tour from hanging forever.
  private waitForNext(): Promise<void> {
    return new Promise(resolve => {
      const safety = setTimeout(() => {
        this.nextResolve = null
        resolve()
      }, 60000)

      this.nextResolve = () => {
        clearTimeout(safety)
        resolve()
      }
    })
  }

  // Waits until the player walks within `radius` tiles of the target iso position.
  private waitForPlayerNear(
    targetX: number,
    targetY: number,
    radius: number = 4,
    timeoutMs: number = 120000,
  ): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.skipped) {
          cleanup()
          resolve()
          return true
        }
        const j = useRioMundoStore.getState().jugador
        const dist = Math.hypot(j.x - targetX, j.y - targetY)
        if (dist <= radius) {
          cleanup()
          resolve()
          return true
        }
        return false
      }
      const timer = setTimeout(() => { cleanup(); resolve() }, timeoutMs)
      const unsub = useRioMundoStore.subscribe(() => { check() })
      const cleanup = () => {
        clearTimeout(timer)
        unsub()
      }
      check()
    })
  }

  // Polls the store for a completed agent result, timing out gracefully
  private waitForAgentComplete(
    agentId: string,
    timeoutMs: number = AGENT_TIMEOUT_MS
  ): Promise<{ outputSnippet: string; zonas?: number; structureCtx?: string }> {
    return new Promise(resolve => {
      // Clear any stale result for this agent before waiting
      const initial = useRioMundoStore.getState().tourAgentResults[agentId]
      if (initial) {
        resolve(initial)
        return
      }

      const timer = setTimeout(() => {
        unsub()
        resolve({ outputSnippet: '' })
      }, timeoutMs)

      const unsub = useRioMundoStore.subscribe((state) => {
        const result = state.tourAgentResults[agentId]
        if (result) {
          clearTimeout(timer)
          unsub()
          resolve(result)
        }
      })
    })
  }

  private async visitNextAgent() {
    if (this.skipped || this.currentStep >= TOUR_AGENTS.length) {
      await this.completeTour()
      return
    }

    const agent = TOUR_AGENTS[this.currentStep]
    const store = useRioMundoStore.getState()
    store.setTourStep(this.currentStep)
    store.setTourAgenteActual(agent.id)

    const agentPos = this.swarmBeesRef?.getBeePosition(agent.id)
    if (!agentPos) {
      this.currentStep++
      await this.visitNextAgent()
      return
    }

    // El coordinador vuela hasta el agente y espera al alumno allí.
    if (this.beeRef) {
      this.beeRef.flyTo(agentPos.x, agentPos.y)
    }

    const flyMessage = `¡Sígueme! Vamos a conocer al Agente ${agent.name}.`
    this.showCoordinatorMessage(flyMessage, 4000)
    if (this.speakFn) await this.speakFn(flyMessage)

    // Esperar a que el alumno camine cerca del agente (WASD).
    await this.waitForPlayerNear(agentPos.x, agentPos.y, 4)
    if (this.skipped) return

    await this.presentAgent(agent, agentPos.x, agentPos.y)
  }

  private async presentAgent(agent: typeof TOUR_AGENTS[0], isoX: number, isoY: number) {
    if (this.skipped) return

    const store = useRioMundoStore.getState()
    store.setCamaraZoom(1.8)

    const introText = `Este es el Agente ${agent.name}.`
    this.showCoordinatorMessage(introText, 3000)
    if (this.speakFn) await this.speakFn(introText)

    await this.wait(500)

    // Show "working" bubble while agent runs
    if (this.dialogRef) {
      this.dialogRef.showAgentMessage(agent.id, `Trabajando en tu programa...`, isoX, isoY, AGENT_TIMEOUT_MS)
    }

    // Trigger agent execution via WS
    this.dispatchAgentExecution(agent.id)

    // Wait for backend result
    const result = await this.waitForAgentComplete(agent.id)

    if (this.skipped) return

    // If structure agent returned zone count, regenerate the map
    if (agent.id === 'hl-structure-agent') {
      if (result.structureCtx) this.structureCtx = result.structureCtx
      if (result.zonas && result.zonas > 0) {
        store.actualizarTributarios(result.zonas)
      }
    }

    // Show agent result in bubble
    const displayText = result.outputSnippet
      ? result.outputSnippet.slice(0, 120) + (result.outputSnippet.length > 120 ? '...' : '')
      : agent.description
    if (this.dialogRef) {
      // Bubble stays visible until player clicks Next (60s safety match).
      this.dialogRef.showAgentMessage(agent.id, displayText, isoX, isoY, 60000)
    }
    if (this.speakFn) await this.speakFn(agent.description)

    store.marcarAgenteVisitado(agent.id)

    this.onShowNextButtonFn?.(true)
    await this.waitForNext()
    this.onShowNextButtonFn?.(false)

    if (this.skipped) return

    store.setCamaraZoom(1.0)
    await this.wait(500)

    this.currentStep++
    await this.visitNextAgent()
  }

  private dispatchAgentExecution(agentId: string) {
    const store = useRioMundoStore.getState()
    const sendWs = store.sendWsMessage
    if (!sendWs) return

    const onboarding = store.onboarding
    const meta = [onboarding.tema, onboarding.objetivo, onboarding.estilo]
      .filter(Boolean).join('. ')

    sendWs({
      tipo: 'ejecutar_agente',
      sessionId: store.sessionId,
      agentId,
      meta: meta || store.meta || 'Aprendizaje general',
      perfil: store.perfil ?? {
        alumnoId: store.alumnoId,
        nombre: onboarding.nombre || store.nickname || 'Estudiante',
        nickname: store.nickname || 'Estudiante',
        edad: onboarding.edad ?? 18,
      },
      structureCtx: this.structureCtx,
    })
  }

  private async completeTour() {
    if (this.skipped) return

    const store = useRioMundoStore.getState()

    const finalMessage = '¡Excelente! Ya conoces a todo el equipo. Tu programa de aprendizaje está listo.'
    this.showCoordinatorMessage(finalMessage, 5000)
    if (this.speakFn) await this.speakFn(finalMessage)

    await this.wait(2000)

    store.finalizarTour()
    this.isRunning = false
  }

  private showCoordinatorMessage(text: string, duration: number = 4000) {
    if (this.dialogRef) {
      this.dialogRef.showBeeMessage(text, duration, false)
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
