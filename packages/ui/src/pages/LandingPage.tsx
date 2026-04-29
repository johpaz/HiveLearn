import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface LandingPageProps {
  onStart: () => void
  onSessions: () => void
  onHowToUse: () => void
}

const BunLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M64 128C99.3462 128 128 99.3462 128 64C128 28.6538 99.3462 0 64 0C28.6538 0 0 28.6538 0 64C0 99.3462 28.6538 128 64 128Z" fill="#FBF0E4"/>
    <path d="M96 64C96 81.6731 81.6731 96 64 96C46.3269 96 32 81.6731 32 64C32 46.3269 46.3269 32 64 32C81.6731 32 96 46.3269 96 64Z" fill="white"/>
    <circle cx="52" cy="60" r="4" fill="black"/>
    <circle cx="76" cy="60" r="4" fill="black"/>
    <path d="M56 76C56 76 60 80 64 80C68 80 72 76 72 76" stroke="black" stroke-width="2" stroke-linecap="round"/>
  </svg>
)

const GemmaLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 5L35 12.5V27.5L20 35L5 27.5V12.5L20 5Z" fill="#4285F4" fillOpacity="0.2"/>
    <path d="M20 5L35 12.5L20 20L5 12.5L20 5Z" fill="#4285F4"/>
    <path d="M35 12.5V27.5L20 35L20 20L35 12.5Z" fill="#34A853"/>
    <path d="M5 12.5V27.5L20 35L20 20L5 12.5Z" fill="#EA4335"/>
    <circle cx="20" cy="20" r="5" fill="#FBBC05"/>
  </svg>
)

const BeeIcon = ({ className, isQueen = false }: { className?: string; isQueen?: boolean }) => (
  <div className={`relative ${className}`}>
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">
      <g className="animate-[wing-flap_0.1s_infinite]">
        <path d="M50 40 C30 20 10 30 20 50 C30 70 50 60 50 40" fill="rgba(255,255,255,0.7)" stroke="white" strokeWidth="1" />
        <path d="M50 40 C70 20 90 30 80 50 C70 70 50 60 50 40" fill="rgba(255,255,255,0.7)" stroke="white" strokeWidth="1" />
      </g>
      <ellipse cx="50" cy="55" rx="20" ry="15" fill={isQueen ? "#F59E0B" : "#FBBF24"} />
      <path d="M40 45 Q50 40 60 45" fill="none" stroke="#1F2937" strokeWidth="2" strokeLinecap="round" />
      <path d="M35 55 Q50 50 65 55" fill="none" stroke="#1F2937" strokeWidth="3" />
      <path d="M40 65 Q50 60 60 65" fill="none" stroke="#1F2937" strokeWidth="2" />
      <circle cx="68" cy="50" r="8" fill={isQueen ? "#F59E0B" : "#FBBF24"} />
      <circle cx="72" cy="48" r="1.5" fill="#1F2937" />
      {isQueen && <path d="M65 38 L68 32 L71 38" fill="#F59E0B" stroke="#1F2937" strokeWidth="1" />} {/* Crown */}
      <path d="M70 42 Q75 35 80 38" fill="none" stroke="#1F2937" strokeWidth="1" />
      <path d="M68 42 Q65 35 60 38" fill="none" stroke="#1F2937" strokeWidth="1" />
      <path d="M30 55 L20 55" stroke="#1F2937" strokeWidth="2" strokeLinecap="round" />
    </svg>
    {isQueen && (
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-hive-amber/20 border border-hive-amber/30 px-3 py-1 rounded-full backdrop-blur-md">
        <span className="text-[10px] font-black uppercase tracking-widest text-hive-amber">La Reina Orquestadora</span>
      </div>
    )}
  </div>
)

const SwarmVisual = () => {
  return (
    <div className="relative h-[400px] lg:h-[600px] w-full flex items-center justify-center">
      {/* The Queen */}
      <div className="absolute z-20 animate-bounce duration-[3000ms]">
        <BeeIcon className="w-32 h-32" isQueen={true} />
      </div>
      
      {/* The 17 Workers */}
      <div className="absolute inset-0 z-10 pointer-events-none opacity-60">
        {Array.from({ length: 17 }).map((_, i) => {
          const angle = (i / 17) * Math.PI * 2
          const radiusX = 35 + Math.random() * 15 // % of container width
          const radiusY = 35 + Math.random() * 15 // % of container height
          const x = 50 + Math.cos(angle) * radiusX
          const y = 50 + Math.sin(angle) * radiusY
          
          return (
            <div 
              key={i}
              className="absolute animate-pulse"
              style={{
                top: `${y}%`,
                left: `${x}%`,
                transform: 'translate(-50%, -50%)',
                transition: 'all 5s ease-in-out',
                animation: `float-${i % 4} ${3 + Math.random() * 2}s infinite ease-in-out`,
                animationDelay: `${Math.random() * 2}s`
              }}
            >
              <BeeIcon className="w-10 h-10 opacity-50" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function LandingPage({ onStart, onSessions, onHowToUse }: LandingPageProps) {
  const features = [
    {
      icon: '🧠',
      title: '18 Agentes Especializados',
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
      <section className="relative pt-32 pb-20 px-4 overflow-hidden min-h-[90vh] flex items-center">
        {/* Premium Ambient Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-hive-amber/10 blur-[120px] rounded-full animate-pulse-slow" />
        <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] bg-hive-blue/5 blur-[120px] rounded-full animate-pulse-slow" />
        
        <div className="max-w-7xl mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full">
          
          {/* Left Column: Text Content */}
          <div className="text-left order-2 lg:order-1">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mb-8 animate-in fade-in slide-in-from-top-4 duration-1000">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-hive-amber opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-hive-amber"></span>
              </span>
              Potenciado por Bun & Gemma 4
            </div>
            
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white mb-6 tracking-tighter leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-1000">
              La Nueva Era del
              <span className="block italic bg-gradient-to-r from-hive-amber via-white to-hive-amber bg-clip-text text-transparent pb-2">Aprendizaje Adaptativo</span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/40 max-w-xl mb-10 font-medium leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-200">
              HiveLearn orquestra un enjambre de 18 agentes especializados para crear tu camino educativo único. Velocidad extrema con Bun, inteligencia profunda con Gemma 4.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
              <Button
                variant="default"
                size="lg"
                onClick={onStart}
                className="w-full sm:w-auto h-14 px-10 bg-hive-amber text-primary-foreground hover:bg-hive-amber/90 shadow-[0_0_30px_rgba(245,158,11,0.3)] font-black uppercase tracking-widest text-xs active:scale-95 transition-all"
              >
                🚀 Comenzar Ahora
              </Button>

              <Button
                variant="outline"
                size="lg"
                onClick={onSessions}
                className="w-full sm:w-auto h-14 px-10 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 font-black uppercase tracking-widest text-xs active:scale-95 transition-all"
              >
                📚 Ver Sesiones
              </Button>
            </div>

            {/* Tech Stack Display */}
            <div className="mt-16 pt-8 border-t border-white/5 flex flex-wrap items-center gap-8 opacity-60 hover:opacity-100 transition-opacity duration-500">
              <div className="flex items-center gap-3 group">
                <BunLogo className="w-8 h-8 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Runtime</div>
                  <div className="text-xs font-black text-white">Bun 1.1</div>
                </div>
              </div>
              <div className="flex items-center gap-3 group">
                <GemmaLogo className="w-8 h-8 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Model</div>
                  <div className="text-xs font-black text-white">Gemma 4</div>
                </div>
              </div>
              <div className="flex items-center gap-3 group">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 group-hover:scale-110 transition-transform">
                  <span className="text-lg">🦙</span>
                </div>
                <div className="text-left">
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/30">Privacy</div>
                  <div className="text-xs font-black text-white">Ollama</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Bee Swarm Visual */}
          <div className="order-1 lg:order-2 w-full">
            <SwarmVisual />
          </div>

        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 border-y border-border bg-secondary/30 backdrop-blur-sm">

        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-hive-amber mb-2">18</div>
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
