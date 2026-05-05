import { useRioMundoStore } from '@/store/rioMundoStore'
import type { OnboardingStep } from '../types'

export interface OnboardingQuestion {
  step: OnboardingStep
  question: string
  placeholder: string
  type: 'text' | 'number'
  validate: (value: string) => string | null
  beeReaction: (value: string) => string
}

const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    step: 'nombre',
    question: 'Bienvenido al Rio! Yo soy Abeja, tu guia. Como te llamas?',
    placeholder: 'Escribe tu nombre...',
    type: 'text',
    validate: (v) => v.trim().length < 2 ? 'Tu nombre debe tener al menos 2 letras' : null,
    beeReaction: (v) => `Mucho gusto, ${v}! Que lindo nombre.`,
  },
  {
    step: 'edad',
    question: 'Cuantos anios tienes?',
    placeholder: 'Escribe tu edad...',
    type: 'number',
    validate: (v) => {
      const n = parseInt(v)
      if (isNaN(n)) return 'Necesito un numero'
      if (n < 5 || n > 120) return 'Edad entre 5 y 120 por favor'
      return null
    },
    beeReaction: (v) => {
      const edad = parseInt(v)
      if (edad <= 8) return `${edad} anios! Eres un explorador pequenio!`
      if (edad <= 12) return `${edad} anios! Perfecto para aprender muchas cosas!`
      if (edad <= 17) return `${edad} anios! Un aventurero joven!`
      return `${edad} anios! Nunca es tarde para aprender algo nuevo!`
    },
  },
  {
    step: 'tema',
    question: 'Que te gustaria aprender hoy? Puedes elegir cualquier tema!',
    placeholder: 'Ej. matematicas, programacion, historia...',
    type: 'text',
    validate: (v) => v.trim().length < 2 ? 'Dime un tema que te interese' : null,
    beeReaction: (v) => `${v}? Que tema tan interesante! Vamos a crear un camino de aprendizaje solo para ti.`,
  },
  {
    step: 'objetivo',
    question: 'Para que quieres aprender sobre {tema}?',
    placeholder: 'Ej. para mi trabajo, para la escuela, por curiosidad...',
    type: 'text',
    validate: (v) => v.trim().length < 3 ? 'Cuentame tu motivacion' : null,
    beeReaction: () => 'Esa es una gran razon! Vamos a hacerlo.',
  },
  {
    step: 'estilo',
    question: 'Como prefieres aprender? Visual, practico, o paso a paso?',
    placeholder: 'Ej. me gusta ver ejemplos, prefiero practicar...',
    type: 'text',
    validate: (v) => v.trim().length < 2 ? 'Como aprendes mejor?' : null,
    beeReaction: () => 'Perfecto! Voy a crear un camino que se adapte a ti.',
  },
]

export class RioOnboardingController {
  private currentStep: number = 0
  private onboardingMessages: { role: 'bee' | 'student'; text: string }[] = []
  private dialogRef: any = null
  private collectedData: Record<string, string | number> = {}
  private speakFn: ((text: string) => Promise<void>) | null = null

  setDialogRef(ref: any) {
    this.dialogRef = ref
  }

  setSpeakFunction(fn: (text: string) => Promise<void>) {
    this.speakFn = fn
  }

  getQuestions(): OnboardingQuestion[] {
    return ONBOARDING_QUESTIONS
  }

  getCurrentQuestion(): OnboardingQuestion | null {
    if (this.currentStep >= ONBOARDING_QUESTIONS.length) return null
    return ONBOARDING_QUESTIONS[this.currentStep]
  }

  /**
   * Determina el primer paso faltante del onboarding basado en el store.
   * Si todos los campos están completos, devuelve null.
   */
  private detectFirstMissingStep(): OnboardingStep | null {
    const store = useRioMundoStore.getState()
    const o = store.onboarding

    // Si ya tiene perfil (alumno existente), nombre y edad ya están en el perfil o nickname
    const hasNombre = o.nombre?.trim() || store.perfil?.nombre || store.nickname?.trim()
    const hasEdad = o.edad != null || store.perfil?.edad != null
    const hasTema = o.tema?.trim()
    const hasObjetivo = o.objetivo?.trim()
    const hasEstilo = o.estilo?.trim()

    if (!hasNombre) return 'nombre'
    if (!hasEdad) return 'edad'
    if (!hasTema) return 'tema'
    if (!hasObjetivo) return 'objetivo'
    if (!hasEstilo) return 'estilo'
    return null
  }

  async start(flowStep?: OnboardingStep) {
    const store = useRioMundoStore.getState()

    // Determinar paso inicial: el proporcionado, o el primero faltante en el store
    const firstMissing = flowStep ?? this.detectFirstMissingStep()

    if (!firstMissing) {
      // Todos los campos completos — no iniciar chat, el caller debe saltar a in_world
      return
    }

    this.currentStep = ONBOARDING_QUESTIONS.findIndex(q => q.step === firstMissing)
    if (this.currentStep === -1) this.currentStep = 0
    this.onboardingMessages = []

    // Poblar collectedData con valores ya existentes en el store/perfil/nickname
    this.collectedData = {}
    const o = store.onboarding
    const perfil = store.perfil
    const name = o.nombre || perfil?.nombre || store.nickname || ''
    if (name) this.collectedData.nombre = name as string
    if (o.edad != null || perfil?.edad != null) this.collectedData.edad = (o.edad ?? perfil?.edad) as number
    if (o.tema) this.collectedData.tema = o.tema
    if (o.objetivo) this.collectedData.objetivo = o.objetivo
    if (o.estilo) this.collectedData.estilo = o.estilo

    store.setBeeState('talking')
    store.setOnboardingStep(firstMissing)

    // Mensaje inicial personalizado
    const existingName = (o.nombre || perfil?.nombre || store.nickname || '') as string
    const isReturning = !!existingName && firstMissing !== 'nombre'

    let welcomeMessage: string | null = null
    let questionMessage: string | null = null

    if (isReturning) {
      welcomeMessage = `Hola de nuevo, ${existingName}! Vamos a continuar tu camino de aprendizaje.`
      const question = this.getCurrentQuestion()
      questionMessage = question?.question ?? null
    } else {
      const question = this.getCurrentQuestion()
      questionMessage = question?.question ?? 'Bienvenido al Rio!'
    }

    // Mostrar saludo de bienvenida (texto + voz)
    if (welcomeMessage) {
      this.onboardingMessages.push({ role: 'bee', text: welcomeMessage })
      store.addOnboardingMessage('bee', welcomeMessage)
      if (this.dialogRef) {
        this.dialogRef.showBeeMessage(welcomeMessage, 5000, false)
      }
      if (this.speakFn) {
        await this.speakFn(welcomeMessage)
      }
      // Pequeña pausa entre saludo y pregunta
      await new Promise(r => setTimeout(r, 800))
    }

    // Mostrar primera pregunta (texto + voz)
    if (questionMessage) {
      const personalizedQuestion = questionMessage.replace('{tema}', this.collectedData.tema as string || '')
      this.onboardingMessages.push({ role: 'bee', text: personalizedQuestion })
      store.addOnboardingMessage('bee', personalizedQuestion)
      if (this.dialogRef) {
        this.dialogRef.showBeeMessage(personalizedQuestion, 6000, true)
      }
      if (this.speakFn) {
        await this.speakFn(personalizedQuestion)
      }
    }
  }

  async handleResponse(response: string): Promise<{ valid: boolean; error: string | null; nextStep: OnboardingStep | null; completed: boolean }> {
    const question = this.getCurrentQuestion()
    if (!question) return { valid: false, error: 'No more questions', nextStep: null, completed: true }

    const error = question.validate(response)
    if (error) {
      const store = useRioMundoStore.getState()
      store.addOnboardingMessage('bee', error)
      if (this.dialogRef) {
        this.dialogRef.showBeeMessage(error, 3000, false)
      }
      if (this.speakFn) {
        await this.speakFn(error)
      }
      return { valid: false, error, nextStep: null, completed: false }
    }

    this.collectedData[question.step] = question.type === 'number' ? parseInt(response) : response.trim()

    const store = useRioMundoStore.getState()
    store.addOnboardingMessage('student', response)
    this.onboardingMessages.push({ role: 'student', text: response })

    switch (question.step) {
      case 'nombre':
        store.updateOnboarding({ nombre: response.trim() })
        break
      case 'edad':
        store.updateOnboarding({ edad: parseInt(response) })
        break
      case 'tema':
        store.updateOnboarding({ tema: response.trim() })
        break
      case 'objetivo':
        store.updateOnboarding({ objetivo: response.trim() })
        break
      case 'estilo':
        store.updateOnboarding({ estilo: response.trim() })
        break
    }

    const reaction = question.beeReaction(response)
    store.addOnboardingMessage('bee', reaction)
    this.onboardingMessages.push({ role: 'bee', text: reaction })

    if (this.dialogRef) {
      this.dialogRef.showBeeMessage(reaction, 3000, false)
    }
    if (this.speakFn) {
      await this.speakFn(reaction)
    }

    this.currentStep++

    if (this.currentStep >= ONBOARDING_QUESTIONS.length) {
      setTimeout(async () => {
        store.completeOnboarding()
        store.setBeeState('celebrating')
        const finalMsg = 'Listo! Tu camino esta preparado. Vamos a explorar!'
        store.addOnboardingMessage('bee', finalMsg)
        if (this.dialogRef) {
          this.dialogRef.showBeeMessage(finalMsg, 4000)
        }
        if (this.speakFn) {
          await this.speakFn(finalMsg)
        }
        setTimeout(() => store.setBeeState('following'), 3000)
      }, 3500)

      return { valid: true, error: null, nextStep: null, completed: true }
    }

    const nextQuestion = this.getCurrentQuestion()
    if (nextQuestion) {
      const personalizedQuestion = nextQuestion.question.replace('{tema}', this.collectedData.tema as string || '')
      setTimeout(async () => {
        store.setOnboardingStep(nextQuestion.step)
        store.addOnboardingMessage('bee', personalizedQuestion)
        if (this.dialogRef) {
          this.dialogRef.showBeeMessage(personalizedQuestion, 6000, true)
        }
        if (this.speakFn) {
          await this.speakFn(personalizedQuestion)
        }
      }, 4000)

      return { valid: true, error: null, nextStep: nextQuestion.step, completed: false }
    }

    return { valid: true, error: null, nextStep: null, completed: true }
  }

  getCollectedData(): Record<string, string | number> {
    return { ...this.collectedData }
  }

  isComplete(): boolean {
    return this.currentStep >= ONBOARDING_QUESTIONS.length
  }

  reset() {
    this.currentStep = 0
    this.onboardingMessages = []
    this.collectedData = {}
  }
}