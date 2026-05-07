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
  { id: 'hl-feedback-agent', name: 'Feedback', description: 'Te doy retroalimentación para que sigas mejorando.' },
]

// How long to wait before auto-advancing if the user doesn't click
const NEXT_TIMEOUT_MS = 12000

export class RioSwarmTourController {
  private beeRef: RioBee | null = null
  private dialogRef: RioDialog | null = null
  private swarmBeesRef: RioSwarmBees | null = null
  private speakFn: ((text: string) => Promise<void>) | null = null
  private currentStep: number = 0
  private isRunning: boolean = false
  private skipped: boolean = false

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

    // Resolve any pending "next" wait so the async chain doesn't hang
    if (this.nextResolve) {
      this.nextResolve()
      this.nextResolve = null
    }
    this.onShowNextButtonFn?.(false)

    if (this.beeRef) {
      this.beeRef.cancelFlyTo()
    }
  }

  private waitForNext(): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.nextResolve = null
        resolve()
      }, NEXT_TIMEOUT_MS)

      this.nextResolve = () => {
        clearTimeout(timer)
        resolve()
      }
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

    const flyMessage = `Vamos a conocer al Agente ${agent.name}...`
    this.showCoordinatorMessage(flyMessage, 3000)
    if (this.speakFn) await this.speakFn(flyMessage)

    const targetX = agentPos.x + 3
    const targetY = agentPos.y + 3
    store.setJugadorPosicion(targetX, targetY)

    if (this.beeRef) {
      this.beeRef.flyTo(agentPos.x, agentPos.y, async () => {
        await this.presentAgent(agent, agentPos.x, agentPos.y)
      })
    }
  }

  private async presentAgent(agent: typeof TOUR_AGENTS[0], isoX: number, isoY: number) {
    if (this.skipped) return

    const store = useRioMundoStore.getState()

    store.setCamaraZoom(1.8)

    const introText = `Este es el Agente ${agent.name}.`
    this.showCoordinatorMessage(introText, 4000)
    if (this.speakFn) await this.speakFn(introText)

    await this.wait(500)

    if (this.dialogRef) {
      this.dialogRef.showAgentMessage(agent.id, agent.description, isoX, isoY, NEXT_TIMEOUT_MS + 2000)
    }
    if (this.speakFn) await this.speakFn(agent.description)

    store.marcarAgenteVisitado(agent.id)

    // Show "Siguiente" button and wait for user click (or auto-advance after timeout)
    this.onShowNextButtonFn?.(true)
    await this.waitForNext()
    this.onShowNextButtonFn?.(false)

    if (this.skipped) return

    store.setCamaraZoom(1.0)
    await this.wait(500)

    this.currentStep++
    await this.visitNextAgent()
  }

  private async completeTour() {
    if (this.skipped) return

    const store = useRioMundoStore.getState()

    const finalMessage = '¡Excelente! Ya conoces a todo el equipo. Ahora vamos a crear tu programa de aprendizaje personalizado.'
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
