import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface LandingPageProps {
  onStart: () => void
  onSessions: () => void
  onHowToUse: () => void
}

export function LandingPage({ onStart, onSessions, onHowToUse }: LandingPageProps) {
  const features = [
    {
      icon: '🧠',
      title: '16 Agentes Especializados',
      description: 'Un enjambre completo de agentes IA trabajando juntos para crear tu lección personalizada.',
    },
    {
      icon: '🎯',
      title: 'Adaptativo',
      description: 'Se adapta a tu estilo de aprendizaje, edad y nivel de conocimiento previo.',
    },
    {
      icon: '⚡',
      title: 'Rápido',
      description: 'Generación de lecciones en segundos con tecnología de punta.',
    },
    {
      icon: '🎮',
      title: 'Gamificado',
      description: 'Gana XP, desbloquea logros y compite contigo mismo.',
    },
    {
      icon: '📊',
      title: 'Seguimiento',
      description: 'Métricas detalladas de tu progreso y efectividad por tema.',
    },
    {
      icon: '🔒',
      title: 'Privado',
      description: 'Todo se ejecuta localmente. Tus datos nunca salen de tu dispositivo.',
    },
  ]

  const steps = [
    {
      number: '01',
      title: 'Cuéntanos sobre ti',
      description: 'Responde preguntas simples sobre tu edad, estilo de aprendizaje y objetivos.',
    },
    {
      number: '02',
      title: 'Elige tu tema',
      description: 'Selecciona qué quieres aprender: programación, IA, diseño, datos y más.',
    },
    {
      number: '03',
      title: 'Aprende',
      description: 'Sigue tu lección personalizada con explicaciones, ejercicios y quizzes.',
    },
    {
      number: '04',
      title: 'Evalúa tu progreso',
      description: 'Completa la evaluación final y recibe feedback personalizado.',
    },
  ]

  return (
    <div className="min-h-screen bg-background hivelearn-gradient-bg hive-hex-pattern">
      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-hive-amber/10 border border-hive-amber/20 text-hive-amber text-sm font-medium mb-8">
            <span className="w-2 h-2 bg-hive-amber rounded-full animate-pulse-glow"></span>
            Powered by 16 AI Agents
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6">
            Aprende con el poder
            <span className="block text-hive-amber mt-2">de un enjambre de IA</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-10">
            HiveLearn genera lecciones personalizadas usando 16 agentes de IA especializados.
            Cada lección es única, adaptada a tu estilo, ritmo y objetivos.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              variant="default"
              size="lg"
              onClick={onStart}
              className="w-full sm:w-auto bg-hive-amber text-primary-foreground hover:bg-hive-amber/90 shadow-honey"
            >
              🚀 Comenzar Ahora
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={onSessions}
              className="w-full sm:w-auto border-hive-amber text-hive-amber hover:bg-hive-amber/10"
            >
              📚 Ver Sesiones
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={onHowToUse}
              className="w-full sm:w-auto text-muted-foreground hover:text-hive-amber"
            >
              ❓ Cómo Funciona
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 border-y border-border bg-secondary/30 backdrop-blur-sm">

        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-hive-amber mb-2">16</div>
              <div className="text-sm text-muted-foreground">Agentes IA</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-hive-amber mb-2">100%</div>
              <div className="text-sm text-muted-foreground">Personalizado</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-hive-amber mb-2">14+</div>
              <div className="text-sm text-muted-foreground">Temas Disponibles</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-hive-amber mb-2">Local</div>
              <div className="text-sm text-muted-foreground">100% Privado</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Características Principales
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Todo lo que necesitas para aprender de manera efectiva con IA
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="group border-border bg-card/50 backdrop-blur-sm hover:border-hive-amber/30 hover:shadow-honey transition-all duration-300">

                <CardContent>
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">{feature.icon}</div>
                  <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-hive-amber transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 bg-secondary/30 backdrop-blur-sm">

        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              ¿Cómo Funciona?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Cuatro pasos simples para comenzar tu viaje de aprendizaje
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="relative group">
                <div className="text-6xl font-bold text-hive-amber/10 mb-4 group-hover:text-hive-amber/20 transition-colors">
                  {step.number}
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {step.description}
                </p>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 right-0 w-full h-0.5 bg-gradient-to-r from-hive-amber/20 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Card className="bg-gradient-to-r from-hive-amber/5 to-hive-orange/5 border-hive-amber/20 backdrop-blur-xl shadow-honey">

            <CardContent className="py-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">
                ¿Listo para comenzar?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Únete a la revolución del aprendizaje adaptativo con IA.
                Tu primera lección te está esperando.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  variant="default"
                  size="lg"
                  onClick={onStart}
                  className="bg-hive-amber text-primary-foreground hover:bg-hive-amber/90 shadow-honey"
                >
                  🐝 Crear Mi Primera Lección
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={onHowToUse}
                  className="border-hive-amber text-hive-amber hover:bg-hive-amber/10"
                >
                  📖 Ver Tutorial
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
